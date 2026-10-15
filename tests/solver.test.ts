import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveFacelets } from '../src/lib/cube/solver';
import { cubieToFacelets, SOLVED_FACELETS } from '../src/lib/cube/cubie';
import { Sim, ALL_MOVES, rng, randomScramble, randomCubie } from './sim';

/** Solve `facelets`, then check the solution on the independent simulator. */
function solveAndVerify(facelets: string, label: string, opts = { timeoutMs: 150 }) {
  const r = solveFacelets(facelets, opts);
  assert.ok(r.ok, `${label}: ${r.ok ? '' : r.message}`);
  if (!r.ok) throw new Error('unreachable');
  const sim = new Sim(facelets).apply(r.solution);
  assert.ok(sim.isSolved(), `${label}: solution "${r.solution}" does not solve the cube`);
  assert.equal(r.length, r.moves.length);
  return r;
}

test('solved cube needs no moves', () => {
  const r = solveFacelets(SOLVED_FACELETS);
  assert.ok(r.ok && r.length === 0 && r.solution === '');
});

test('every single-move scramble is solved in exactly one move', () => {
  for (const mv of ALL_MOVES) {
    const r = solveAndVerify(new Sim().apply(mv).facelets(), mv);
    assert.equal(r.length, 1, `${mv} -> ${r.solution}`);
  }
});

test('every 2-move scramble is solved in at most 2 moves', () => {
  for (const a of ALL_MOVES) {
    for (const b of ALL_MOVES) {
      const r = solveAndVerify(new Sim().apply(`${a} ${b}`).facelets(), `${a} ${b}`);
      assert.ok(r.length <= 2, `${a} ${b} -> ${r.solution}`);
    }
  }
});

test('200 random scrambles (lengths 1-40) are solved correctly', () => {
  const rand = rng(99);
  let maxLen = 0;
  for (let n = 0; n < 200; n++) {
    const scramble = randomScramble(1 + Math.floor(rand() * 40), rand);
    const r = solveAndVerify(new Sim().apply(scramble).facelets(), scramble);
    maxLen = Math.max(maxLen, r.length);
  }
  assert.ok(maxLen <= 30, `max length ${maxLen}`);
});

test('200 uniformly random legal cube states are solved correctly', () => {
  const rand = rng(31337);
  let total = 0;
  let maxLen = 0;
  for (let n = 0; n < 200; n++) {
    const facelets = cubieToFacelets(randomCubie(rand));
    const r = solveAndVerify(facelets, `random state #${n} ${facelets}`);
    total += r.length;
    maxLen = Math.max(maxLen, r.length);
  }
  console.log(`# random states: average ${(total / 200).toFixed(2)} moves, max ${maxLen}`);
  assert.ok(maxLen <= 30);
  assert.ok(total / 200 < 24, 'average solution length should be about 21-23');
});

test('superflip (a hardest-case position, optimal length 20) is solved', () => {
  const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
  const r = solveAndVerify(new Sim().apply(superflip).facelets(), 'superflip', { timeoutMs: 2000 });
  console.log(`# superflip solved in ${r.length} moves`);
  assert.ok(r.length <= 26);
});

test('cube given with arbitrary color letters (WOGRBY) is solved', () => {
  const map: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' };
  const scramble = randomScramble(25, rng(5));
  const urf = new Sim().apply(scramble).facelets();
  const colored = urf.split('').map((c) => map[c]).join('');
  const r = solveFacelets(colored, { timeoutMs: 150 });
  assert.ok(r.ok);
  if (r.ok) assert.ok(new Sim().apply(scramble).apply(r.solution).isSolved());
});

test('targetLength option stops early and the answer is still a valid solution', () => {
  const rand = rng(77);
  for (let n = 0; n < 20; n++) {
    const facelets = cubieToFacelets(randomCubie(rand));
    const r = solveAndVerify(facelets, `target #${n}`, { timeoutMs: 5000, targetLength: 25 } as never);
    assert.ok(r.length <= 30);
  }
});

test('invalid cubes return an error instead of throwing or looping', () => {
  const twist = SOLVED_FACELETS.split('');
  [twist[8], twist[9], twist[20]] = ['R', 'F', 'U'];
  const r = solveFacelets(twist.join(''));
  assert.ok(!r.ok && r.code === 'CORNER_TWIST');
  const short = solveFacelets('UUU');
  assert.ok(!short.ok && short.code === 'BAD_LENGTH');
});

test('solutions never contain redundant adjacent turns of the same face', () => {
  const rand = rng(2);
  for (let n = 0; n < 50; n++) {
    const r = solveAndVerify(new Sim().apply(randomScramble(30, rand)).facelets(), 'redundancy');
    for (let i = 1; i < r.moves.length; i++) {
      assert.notEqual(r.moves[i][0], r.moves[i - 1][0], r.solution);
    }
  }
});
