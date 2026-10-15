import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identity, applyMoves, parseMoves, cubieToFacelets, parseFacelets, SOLVED_FACELETS, MOVES, multiply,
} from '../src/lib/cube/cubie';
import { Sim, ALL_MOVES, rng, randomScramble } from './sim';

const facelets = (alg: string) => cubieToFacelets(applyMoves(identity(), parseMoves(alg)));

test('identity cubie renders the solved facelet string', () => {
  assert.equal(cubieToFacelets(identity()), SOLVED_FACELETS);
  assert.equal(new Sim().facelets(), SOLVED_FACELETS);
});

test('each of the 18 moves matches the physical simulator', () => {
  for (const mv of ALL_MOVES) {
    assert.equal(facelets(mv), new Sim().apply(mv).facelets(), `move ${mv}`);
  }
});

test('300 random 40-move scrambles match the physical simulator', () => {
  const rand = rng(12345);
  for (let n = 0; n < 300; n++) {
    const scramble = randomScramble(40, rand);
    assert.equal(facelets(scramble), new Sim().apply(scramble).facelets(), scramble);
  }
});

test('basic group identities', () => {
  const id = cubieToFacelets(identity());
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) {
    assert.equal(facelets(`${f} ${f} ${f} ${f}`), id, `${f}^4`);
    assert.equal(facelets(`${f} ${f}'`), id, `${f} ${f}'`);
  }
  assert.equal(facelets("R U R' U'".repeat(1) + (" R U R' U'").repeat(5)), id, 'sexy move has order 6');
  assert.equal(facelets("R2 L2 U2 D2 F2 B2".split(' ').join(' ') + ' ' + "B2 F2 D2 U2 L2 R2"), id);
});

test('multiply is associative on moves', () => {
  const a = MOVES[3], b = MOVES[7], c = MOVES[14];
  assert.deepEqual(multiply(multiply(a, b), c), multiply(a, multiply(b, c)));
});

test('parseMoves handles notation variants', () => {
  assert.deepEqual(parseMoves("R R' R2 R3 r"), parseMoves("R R3 R2 R3 R"));
  assert.throws(() => parseMoves('R X'));
});

test('parseFacelets round-trips every reachable state', () => {
  const rand = rng(7);
  for (let n = 0; n < 100; n++) {
    const s = new Sim().apply(randomScramble(30, rand)).facelets();
    const r = parseFacelets(s);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) assert.equal(cubieToFacelets(r.cubie), s);
  }
});

test('parseFacelets accepts arbitrary color letters via the centers', () => {
  // U=white R=red F=green D=yellow L=orange B=blue
  const map: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' };
  const s = new Sim().apply("R U R' U' F2 D L'").facelets();
  const colored = s.split('').map((c) => map[c]).join('');
  const r = parseFacelets(colored);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.facelets, s);
});

test('validation: wrong length, bad counts, duplicate centers', () => {
  const bad = (s: string) => {
    const r = parseFacelets(s);
    assert.equal(r.ok, false);
    return r.ok ? '' : r.code;
  };
  assert.equal(bad(SOLVED_FACELETS.slice(0, 53)), 'BAD_LENGTH');
  // swap a sticker color so one color has 10 and another 8
  assert.equal(bad('R' + SOLVED_FACELETS.slice(1)), 'BAD_COLOR_COUNT');
  // two centers share a color
  const dupCenter = SOLVED_FACELETS.split('');
  dupCenter[13] = 'U';
  assert.equal(bad(dupCenter.join('')), 'BAD_CENTERS');
});

test('validation: impossible states are rejected with the right reason', () => {
  const s = SOLVED_FACELETS.split('');
  // twist one corner in place: URF = U9(8) R1(9) F3(20) -> rotate colors
  const twist = [...s];
  [twist[8], twist[9], twist[20]] = ['R', 'F', 'U'];
  const t = parseFacelets(twist.join(''));
  assert.ok(!t.ok && t.code === 'CORNER_TWIST', JSON.stringify(t));

  // flip one edge in place: UF = U8(7) F2(19)
  const flip = [...s];
  [flip[7], flip[19]] = ['F', 'U'];
  const fl = parseFacelets(flip.join(''));
  assert.ok(!fl.ok && fl.code === 'EDGE_FLIP', JSON.stringify(fl));

  // swap two edges (UF <-> UR): parity error
  const swap = [...s];
  [swap[7], swap[19], swap[5], swap[10]] = ['U', 'R', 'U', 'F'];
  const sw = parseFacelets(swap.join(''));
  assert.ok(!sw.ok && sw.code === 'PARITY', JSON.stringify(sw));

  // impossible edge color combo: U sticker next to D sticker
  const imp = [...s];
  imp[19] = 'D';
  imp[28] = 'F'; // keep counts at 9 each
  const im = parseFacelets(imp.join(''));
  assert.ok(!im.ok && (im.code === 'UNKNOWN_EDGE' || im.code === 'UNKNOWN_CORNER'), JSON.stringify(im));
});
