import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identity, applyMoves, parseMoves, cubieToFacelets, SOLVED_FACELETS } from '../src/lib/cube/cubie';
import { solveFacelets } from '../src/lib/cube/solver';
import { rng } from './sim';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const L = require('../web/cubelogic.js');

test('page move logic matches the solver\'s independent cubie model', () => {
  const rand = rng(4242);
  for (let n = 0; n < 300; n++) {
    const moves = L.scramble(1 + Math.floor(rand() * 40), rand);
    const text = moves.map((m: unknown) => L.moveName(m)).join(' ');
    const page = L.applyMoves(L.SOLVED, moves);
    const model = cubieToFacelets(applyMoves(identity(), parseMoves(text)));
    assert.equal(page, model, text);
  }
});

test('page logic: inverse moves undo, solved check, parsing', () => {
  const rand = rng(1);
  const moves = L.scramble(30, rand);
  const scrambled = L.applyMoves(L.SOLVED, moves);
  assert.ok(!L.isSolved(scrambled));
  const undo = [...moves].reverse().map((m: unknown) => L.invertMove(m));
  assert.equal(L.applyMoves(scrambled, undo), SOLVED_FACELETS);
  assert.ok(L.isSolved(SOLVED_FACELETS));
  assert.deepEqual(L.parseAlg("R R' R2 r"), L.parseAlg("R R3 R2 R"));
  assert.throws(() => L.parseAlg('R X'), /not a valid move/);
});

test('page logic works on impossible, user-painted states without throwing', () => {
  const painted = 'R' + SOLVED_FACELETS.slice(1);
  const out = L.applyAlg(painted, "R U F'");
  assert.equal(out.length, 54);
});

test('end to end: page-made scramble -> solver -> page-applied solution is solved', () => {
  const rand = rng(8);
  for (let n = 0; n < 15; n++) {
    const scrambled = L.applyMoves(L.SOLVED, L.scramble(25, rand));
    const r = solveFacelets(scrambled, { timeoutMs: 100 });
    assert.ok(r.ok);
    if (r.ok) assert.ok(L.isSolved(L.applyAlg(scrambled, r.solution)), r.solution);
  }
});

test('renderFaces gives 26 cubies x 6 faces with exactly 54 stickers', () => {
  const faces = L.renderFaces();
  assert.equal(faces.length, 156);
  const stickers = faces.filter((f: { idx: number }) => f.idx >= 0);
  assert.equal(stickers.length, 54);
  assert.equal(new Set(stickers.map((f: { idx: number }) => f.idx)).size, 54);
});
