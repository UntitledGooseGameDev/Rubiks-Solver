import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import { solveTwo, parseTwo, twoDistanceCounts, TWO_SOLVED, TWO_CORNER_STICKERS } from '../src/lib/two';
import { cubieToTwoFacelets } from '../src/lib/two';
import { Sim, rng, randomScramble } from './sim';

/** The corner stickers of a 3x3 simulator cube, as a 2x2 sticker string (faces U R F D L B, 2x2 each). */
function twoFromSim(sim: Sim): string {
  const f = sim.facelets();
  let out = '';
  for (let face = 0; face < 6; face++) for (const k of [0, 2, 6, 8]) out += f[face * 9 + k];
  return out;
}
const solvedOnSim = (sim: Sim) => {
  const f = sim.facelets();
  for (let face = 0; face < 6; face++) {
    const c = f[face * 9];
    for (const k of [2, 6, 8]) if (f[face * 9 + k] !== c) return false;
  }
  return true;
};

test('the distance table matches the known 2x2 God numbers (11 moves, 3,674,160 positions)', () => {
  assert.deepEqual(twoDistanceCounts(), [1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644]);
});

test('2x2 stickers read from the corners of an independent 3x3 simulator are solved in at most 11 moves', () => {
  const rand = rng(2022);
  for (let n = 0; n < 400; n++) {
    const sim = new Sim().apply(randomScramble(5 + Math.floor(rand() * 30), rand));
    const start = twoFromSim(sim);
    const r = solveTwo(start);
    assert.ok(r.ok, r.ok ? '' : r.message);
    if (!r.ok) continue;
    assert.ok(r.length <= 11, `length ${r.length}`);
    sim.apply(r.moves.join(' '));
    assert.ok(solvedOnSim(sim), `not solved: ${start} ${r.solution}`);
  }
});

test('2x2 any six symbols work, and solved / one-move cubes give the obvious answer', () => {
  assert.equal(solveTwo(TWO_SOLVED).ok && (solveTwo(TWO_SOLVED) as any).length, 0);
  const map: Record<string, string> = { U: 'W', R: 'O', F: 'G', D: 'Y', L: 'R', B: 'B' };
  const one = twoFromSim(new Sim().apply("R'"));
  const r = solveTwo(one.split('').map((c) => map[c]).join(''));
  assert.ok(r.ok && r.solution === 'R');
  const x = solveTwo(twoFromSim(new Sim().apply('R U2')));
  assert.ok(x.ok && x.length === 2);
});

test('2x2 whole-cube turns and D/L/B moves still solve (the reference corner is found by color)', () => {
  const sim = new Sim().apply("D L B' D2 L2 U R F'");
  const r = solveTwo(twoFromSim(sim));
  assert.ok(r.ok);
  if (r.ok) { sim.apply(r.moves.join(' ')); assert.ok(solvedOnSim(sim)); }
});

test('2x2 bad input gives a clear error', () => {
  assert.ok(!solveTwo('UUUU').ok);
  const e1 = parseTwo('UUUURRRRFFFFDDDDLLLLBBBU');
  assert.ok(!e1.ok && e1.code === 'BAD_COLOR_COUNT');
  // swap two stickers of different corners so one corner shows a color twice
  const s = TWO_SOLVED.split('');
  [s[3], s[4]] = [s[4], s[3]];
  const e2 = parseTwo(s.join(''));
  assert.ok(!e2.ok);
  // twist one corner in place
  const t = twoFromSim(new Sim()).split('');
  const [a, b, c] = TWO_CORNER_STICKERS[0];
  [t[a], t[b], t[c]] = [t[b], t[c], t[a]];
  const e3 = parseTwo(t.join(''));
  assert.ok(!e3.ok && e3.code === 'CORNER_TWIST');
  assert.equal(cubieToTwoFacelets((parseTwo(TWO_SOLVED) as any).cubie), TWO_SOLVED);
});

test('the 2x2 page model agrees with the solver: page-side moves, solver output, every face ends uniform', () => {
  const T = require('../web/two.js');
  const rand = rng(99);
  for (let n = 0; n < 200; n++) {
    const sc = randomScramble(4 + Math.floor(rand() * 25), rand);
    const state = T.applyMoves(T.SOLVED, T.parseAlg(sc));
    // the page's sticker model must match the independent 3x3 simulator's corners
    assert.equal(state, twoFromSim(new Sim().apply(sc)), sc);
    const r = solveTwo(state);
    assert.ok(r.ok);
    if (!r.ok) continue;
    const end = T.applyMoves(state, T.parseAlg(r.moves.join(' ')));
    for (let f = 0; f < 6; f++) assert.ok(new Set(end.slice(f * 4, f * 4 + 4)).size === 1, `${sc} -> ${r.solution}`);
  }
});
