import { test } from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
import { solveFour, parseFour, compressMoves, scrambleToFacelets, FOUR_SOLVED, FOUR_CORNER_STICKERS } from '../src/lib/four';
import * as M from '../src/lib/four/model';
import * as R from '../src/lib/four/reduce';
import { wingMacros, centerMacros } from '../src/lib/four/macros-lib';
import { Sim, rng, randomScramble } from './sim';

const id = () => Uint8Array.from({ length: 96 }, (_, i) => i);
const randomMoves = (n: number, rand: () => number) => Array.from({ length: n }, () => Math.floor(rand() * 36));
const letters = (s: Uint8Array) => Array.from(s, (f) => 'URFDLB'[f]).join('');

test('4x4 model: every turn undoes itself, wide = outer + inner, and the cube can be rotated whole', () => {
  for (let m = 0; m < 36; m++) {
    assert.deepEqual(M.composePerm(M.PERMS[m], M.PERMS[M.invMove(m)]), id(), M.moveName(m));
    if (m % 3 === 0) {
      let p = id();
      for (let k = 0; k < 4; k++) p = M.composePerm(p, M.PERMS[m]);
      assert.deepEqual(p, id(), `${M.moveName(m)} four times`);
      assert.deepEqual(M.composePerm(M.PERMS[m], M.PERMS[m]), M.PERMS[m + 1], 'two quarter turns are the half turn');
    }
  }
  assert.deepEqual(M.parseMoves('Rw'), [M.parseMoves('R')[0], M.parseMoves('2R')[0]]);
  assert.deepEqual(M.parseMoves('r2'), M.parseMoves('Rw2'));
  assert.ok(M.isSolved(M.applyMoves(M.SOLVED, M.parseMoves("R 2R 2L' L'"))), 'x rotation keeps every face one color');
  let s = M.SOLVED;
  for (let k = 0; k < 6; k++) s = M.applyMoves(s, M.parseMoves("R U R' U'"));
  assert.ok(M.isSolved(s), 'the sexy move has order 6');
  assert.throws(() => M.parseMoves('Q'));
  assert.throws(() => M.parseMoves('2Rw'));
});

test('4x4 outer turns agree with the independent 3x3 simulator on corners, edges and centers', () => {
  const rand = rng(44);
  for (let n = 0; n < 40; n++) {
    const scr = randomScramble(4 + Math.floor(rand() * 25), rand);
    const sim = new Sim().apply(scr);
    const four = M.applyMoves(M.SOLVED, M.parseMoves(scr));
    assert.equal(R.toThreeByThree(four), sim.facelets(), scr);
  }
});

test('the searched macros do what their move sequences really do', () => {
  const rand = rng(5);
  const wings = wingMacros(), centers = centerMacros();
  assert.ok(wings.length > 20000 && centers.length > 3000);
  for (let t = 0; t < 400; t++) {
    const w = wings[Math.floor(rand() * wings.length)];
    const p = M.permOfMoves(w.word), listed = new Set(w.from);
    for (let k = 0; k < w.from.length; k++) assert.equal(p[w.from[k]], w.to[k]);
    for (let i = 0; i < 96; i++) if (!listed.has(i)) assert.equal(p[i], i, `wing macro ${M.formatMoves(w.word)} moves sticker ${i}`);
    assert.equal(w.from.length, 6, 'a wing 3-cycle moves three wings (6 stickers)');
    const c = centers[Math.floor(rand() * centers.length)];
    const q = M.permOfMoves(c.word), lc = new Set(c.from);
    for (let k = 0; k < c.from.length; k++) assert.equal(q[c.from[k]], c.to[k]);
    for (const i of M.CENTERS) if (!lc.has(i)) assert.equal(q[i], i);
  }
});

test('compressed notation does the same thing as the raw moves', () => {
  const rand = rng(8);
  for (let n = 0; n < 300; n++) {
    const list = randomMoves(1 + Math.floor(rand() * 30), rand);
    const a = M.applyMoves(M.SOLVED, list), b = M.applyMoves(M.SOLVED, M.parseMoves(compressMoves(list).join(' ')));
    assert.deepEqual(a, b);
  }
  assert.deepEqual(compressMoves(M.parseMoves("R 2R U U")), ['Rw', 'U2']);
  assert.deepEqual(compressMoves(M.parseMoves("R R' U")), ['U']);
});

test('parseFour accepts real cubes (in any orientation) and explains impossible ones', () => {
  assert.ok(parseFour(FOUR_SOLVED).ok);
  assert.ok(parseFour(scrambleToFacelets("R U Rw' 2L F2 Uw D'")).ok);
  // any six symbols work
  const abc = FOUR_SOLVED.replace(/U/g, 'w').replace(/R/g, 'r').replace(/F/g, 'g').replace(/D/g, 'y').replace(/L/g, 'o').replace(/B/g, 'b');
  assert.ok(parseFour(abc).ok);
  const bad = (s: string) => { const r = parseFour(s); assert.ok(!r.ok); return r as Exclude<typeof r, { ok: true }>; };
  assert.equal(bad(FOUR_SOLVED.slice(1)).code, 'BAD_LENGTH');
  assert.equal(bad('R' + FOUR_SOLVED.slice(1)).code, 'BAD_COLOR_COUNT');
  const swap = (s: string, i: number, j: number) => { const a = s.split(''); [a[i], a[j]] = [a[j], a[i]]; return a.join(''); };
  // one corner turned in place
  const [c1, c2, c3] = FOUR_CORNER_STICKERS[0];
  const t = FOUR_SOLVED.split('');
  [t[c1], t[c2], t[c3]] = [t[c2], t[c3], t[c1]];
  assert.equal(bad(t.join('')).code, 'CORNER_TWIST');
  // two stickers of one corner swapped: that corner cannot exist
  assert.equal(bad(swap(FOUR_SOLVED, c1, c2)).code, 'BAD_CORNER');
  // an edge piece showing opposite colors (Up and Down)
  assert.equal(bad(swap(FOUR_SOLVED, M.WING_MATE[13], 49)).code, 'BAD_EDGE');
  // a wing sticker swapped with a sticker of another edge leaves an edge with the wrong pieces
  assert.equal(bad(swap(FOUR_SOLVED, 13, 17)).code, 'BAD_EDGE');
});

function checkSolved(start: Uint8Array, text: string, label: string) {
  const r = solveFour(text);
  assert.ok(r.ok, `${label}: ${r.ok ? '' : r.message}`);
  if (!r.ok) return null;
  const end = M.applyMoves(start, M.parseMoves(r.solution));
  assert.ok(M.isSolved(end), `${label}: not solved by ${r.solution}`);
  assert.equal(r.length, r.moves.length);
  assert.equal(r.phases.flatMap((p) => p.moves).join(' '), r.solution);
  return r;
}

test('already solved, one turn, one slice turn', () => {
  assert.equal(checkSolved(M.SOLVED, FOUR_SOLVED, 'solved')!.length, 0);
  const one = M.applyMoves(M.SOLVED, M.parseMoves('R'));
  assert.equal(checkSolved(one, letters(one), 'R')!.length, 1);
  const slice = M.applyMoves(M.SOLVED, M.parseMoves('2U'));
  assert.equal(checkSolved(slice, letters(slice), '2U')!.length, 1);
});

test('14 random 4x4 scrambles are solved (checked on the model, from the raw stickers)', () => {
  const rand = rng(404);
  const lens: number[] = [];
  for (let n = 0; n < 14; n++) {
    const start = M.applyMoves(M.SOLVED, randomMoves(50 + Math.floor(rand() * 30), rand));
    const r = checkSolved(start, letters(start), `scramble ${n}`);
    if (r) lens.push(r.length);
  }
  assert.ok(Math.max(...lens) <= 170, `longest ${Math.max(...lens)}`);
});

test('a cube that only needs 3x3 turns is solved quickly', () => {
  const rand = rng(31);
  for (let n = 0; n < 4; n++) {
    const scr = randomScramble(25, rand);
    const start = M.applyMoves(M.SOLVED, M.parseMoves(scr));
    const r = checkSolved(start, letters(start), scr)!;
    assert.ok(r.length <= 26, `${r.length} moves for ${scr}`);
  }
});

test('the two parity cases only a 4x4 has are solved', () => {
  // one edge flipped in place
  const flip = Uint8Array.from(M.SOLVED);
  const q = R.LOCS[0];
  [flip[q[0]], flip[q[1]]] = [flip[q[1]], flip[q[0]]];
  [flip[q[2]], flip[q[3]]] = [flip[q[3]], flip[q[2]]];
  assert.ok(parseFour(letters(flip)).ok);
  checkSolved(flip, letters(flip), 'flipped edge');
  // two whole edges swapped
  const swap = Uint8Array.from(M.SOLVED);
  const a = R.LOCS[0], b = R.LOCS[5];
  for (let k = 0; k < 4; k++) [swap[a[k]], swap[b[k]]] = [swap[b[k]], swap[a[k]]];
  checkSolved(swap, letters(swap), 'swapped edges');
});

test('an impossible 4x4 is reported, not looped on', () => {
  const [c1, c2, c3] = FOUR_CORNER_STICKERS[0];
  const s = FOUR_SOLVED.split('');
  [s[c1], s[c2], s[c3]] = [s[c2], s[c3], s[c1]];
  const r = solveFour(s.join(''));
  assert.ok(!r.ok);
});

test('the page\'s own 4x4 geometry (web/four.js) agrees with the solver\'s model', () => {
  const F = require('../web/four.js');
  const rand = rng(77);
  const toks = ['U', 'R', 'F', 'D', 'L', 'B'];
  for (let n = 0; n < 200; n++) {
    const words: string[] = [];
    for (let k = 0; k < 12; k++) {
      const t = toks[Math.floor(rand() * 6)];
      const kind = Math.floor(rand() * 3); // outer, second layer, wide
      const pre = kind === 1 ? '2' : '';
      const post = kind === 2 ? 'w' : '';
      words.push(pre + t + post + ['', '2', "'"][Math.floor(rand() * 3)]);
    }
    const text = words.join(' ');
    const page = F.applyMoves(F.SOLVED, F.parseAlg(text));
    assert.equal(page, letters(M.applyMoves(M.SOLVED, M.parseMoves(text))), text);
  }
  assert.throws(() => F.parseAlg('2Rw'));
  assert.throws(() => F.parseAlg('X'));
  assert.equal(F.moveName(F.parseAlg("r'")[0]), "Rw'");
});
