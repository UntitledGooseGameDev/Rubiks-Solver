import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubieToFacelets, identity, applyMoves, parseMoves, Cubie, SOLVED_FACELETS } from '../src/lib/cube/cubie';
import { solveForMethod, solveBeginner, solveCfop } from '../src/lib/method';
import type { Plan } from '../src/lib/method';
import * as A from '../src/lib/method/algs';
import { Sim, rng, randomScramble, randomCubie } from './sim';

/**
 * Everything is checked on the independent physical simulator (tests/sim.ts),
 * using sticker positions only, so these tests do not trust the solver's own tables.
 */

const F = (s: string, from: number, to: number) => s.slice(from, to);
// facelet indices: U 0-8, R 9-17, F 18-26, D 27-35, L 36-44, B 45-53
const faceOK = (f: string, face: number) => {
  const c = f[face * 9 + 4];
  for (let i = 0; i < 9; i++) if (f[face * 9 + i] !== c) return false;
  return true;
};
const same = (f: string, idx: number[], letter: string) => idx.every((i) => f[i] === letter);

/** Bottom cross: D edge stickers and the matching side stickers. */
const crossOK = (f: string) => same(f, [28, 30, 32, 34], 'D') && f[25] === 'F' && f[16] === 'R' && f[43] === 'L' && f[52] === 'B';
/** Bottom layer: whole D face plus the bottom row of each side. */
const bottomOK = (f: string) =>
  faceOK(f, 3) && same(f, [24, 25, 26], 'F') && same(f, [15, 16, 17], 'R') && same(f, [42, 43, 44], 'L') && same(f, [51, 52, 53], 'B');
/** First two layers: bottom plus the middle row of each side. */
const f2lOK = (f: string) =>
  bottomOK(f) && same(f, [21, 22, 23], 'F') && same(f, [12, 13, 14], 'R') && same(f, [39, 40, 41], 'L') && same(f, [48, 49, 50], 'B');
const topFaceOK = (f: string) => same(f, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'U');
const topCrossOK = (f: string) => same(f, [1, 3, 4, 5, 7], 'U');
const topEdgesMatch = (f: string) => f[19] === 'F' && f[10] === 'R' && f[37] === 'L' && f[46] === 'B';

/** Replay a plan on the simulator and return the cube after each stage (keyed by stage, in order). */
function replayByStage(start: string, plan: Plan): { stage: string; facelets: string }[] {
  const sim = new Sim(start);
  const out: { stage: string; facelets: string }[] = [];
  plan.steps.forEach((step, i) => {
    sim.apply(step.moves.join(' '));
    const next = plan.steps[i + 1];
    if (!next || next.stage !== step.stage) out.push({ stage: step.stage, facelets: sim.facelets() });
  });
  return out;
}

function checkPlanShape(plan: Plan) {
  assert.equal(plan.moves.length, plan.length);
  assert.equal(plan.steps.flatMap((s) => s.moves).join(' '), plan.moves.join(' '));
  const keys = new Set(plan.stages.map((s) => s.key));
  for (const s of plan.steps) {
    assert.ok(keys.has(s.stage), `unknown stage ${s.stage}`);
    assert.ok(s.moves.length > 0, `empty step ${s.title}`);
    assert.ok(s.title.length > 0);
  }
}

// ---------------------------------------------------------------- algorithms
const U_FREE = (c: Cubie) =>
  [4, 5, 6, 7].every((i) => c.cp[i] === i && c.co[i] === 0) && [4, 5, 6, 7, 8, 9, 10, 11].every((i) => c.ep[i] === i && c.eo[i] === 0);
const algCube = (m: string) => applyMoves(identity(), parseMoves(m));

test('every named algorithm is written in valid notation and matches the simulator', () => {
  const all = [
    ...A.CORNER_TRIGGERS.map((t) => t.alg), ...A.MIDDLE_INSERTS, ...A.TOP_CROSS_ALGS, A.SUNE_EDGES, A.NIKLAS, A.TWIST_CORNER,
    ...A.OLL_EDGE_ALGS, ...A.OLL_CORNER_ALGS, ...A.PLL_ALGS,
  ];
  assert.equal(new Set(all.map((a) => a.id)).size, all.length, 'ids must be unique');
  for (const a of all) {
    const viaCubie = cubieToFacelets(algCube(a.moves));
    assert.equal(viaCubie, new Sim().apply(a.moves).facelets(), a.name);
  }
});

test('last-layer algorithms leave the first two layers alone', () => {
  const ll = [...A.TOP_CROSS_ALGS, A.SUNE_EDGES, A.NIKLAS, ...A.OLL_EDGE_ALGS, ...A.OLL_CORNER_ALGS, ...A.PLL_ALGS];
  for (const a of ll) {
    const f = new Sim().apply(a.moves).facelets();
    assert.ok(f2lOK(f), `${a.name} disturbs the first two layers`);
  }
});

test('OLL corner algorithms keep the top edges oriented; PLL algorithms keep the whole top face', () => {
  for (const a of A.OLL_CORNER_ALGS) {
    const f = new Sim().apply(a.moves).facelets();
    assert.ok(same(f, [1, 3, 5, 7], 'U'), `${a.name} flips top edges`);
  }
  for (const a of A.PLL_ALGS) {
    assert.ok(topFaceOK(new Sim().apply(a.moves).facelets()), `${a.name} changes the top face`);
  }
});

test('Niklas moves only corners; Sune + U moves only top edges’ positions and keeps them oriented', () => {
  const n = algCube(A.NIKLAS.moves);
  assert.deepEqual(n.ep, identity().ep);
  assert.ok(U_FREE(n));
  assert.ok(same(new Sim().apply(A.SUNE_EDGES.moves).facelets(), [1, 3, 5, 7], 'U'));
});

test('the 21 PLL algorithms are distinct cases and together cover every last-layer permutation', () => {
  assert.equal(A.PLL_ALGS.length, 21);
  // every oriented last-layer state with the first two layers solved: 4! x 4! / 2 = 288
  const perms = (n: number): number[][] => {
    const out: number[][] = [];
    const rec = (p: number[], rest: number[]) => {
      if (!rest.length) { out.push(p); return; }
      rest.forEach((x, i) => rec([...p, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
    };
    rec([], Array.from({ length: n }, (_, i) => i));
    return out;
  };
  const parity = (p: number[]) => { let inv = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) inv++; return inv & 1; };
  let states = 0;
  for (const cp of perms(4)) for (const ep of perms(4)) {
    if (parity(cp) !== parity(ep)) continue;
    states++;
    const cube: Cubie = { cp: [...cp, 4, 5, 6, 7], co: new Array(8).fill(0), ep: [...ep, 4, 5, 6, 7, 8, 9, 10, 11], eo: new Array(12).fill(0) };
    const f = cubieToFacelets(cube);
    const r = solveForMethod(f, 'cfop');
    assert.ok(r.ok, `PLL case ${cp}/${ep}`);
    if (!r.ok) continue;
    const pll = r.steps.filter((s) => s.stage === 'pll' && s.kind === 'alg');
    assert.ok(pll.length <= 1, `case ${cp}/${ep} used ${pll.length} PLL algorithms`);
    assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved(), `case ${cp}/${ep}`);
  }
  assert.equal(states, 288);
});

test('each PLL algorithm is chosen for its own case', () => {
  for (const a of A.PLL_ALGS) {
    // the cube that this algorithm solves
    const inverse = new Sim().apply(a.moves);
    const start = cubieToFacelets(applyMoves(identity(), parseMoves(invertAlg(a.moves))));
    assert.equal(new Sim(start).apply(a.moves).isSolved(), true);
    const r = solveForMethod(start, 'cfop');
    assert.ok(r.ok);
    if (r.ok) {
      const alg = r.steps.find((s) => s.kind === 'alg' && s.stage === 'pll');
      assert.ok(alg, `${a.name}: no PLL step`);
      assert.equal(alg!.title, a.name);
    }
    void inverse;
  }
});

function invertAlg(alg: string): string {
  return alg.trim().split(/\s+/).reverse().map((t) => (t.endsWith("'") ? t.slice(0, -1) : t.endsWith('2') ? t : t + "'")).join(' ');
}

// ---------------------------------------------------------------- beginner
test('Beginner method solves 150 random legal cubes, checked stage by stage on the simulator', () => {
  const rand = rng(424242);
  let total = 0;
  for (let n = 0; n < 150; n++) {
    const f = cubieToFacelets(randomCubie(rand));
    const r = solveForMethod(f, 'beginner');
    assert.ok(r.ok, r.ok ? '' : r.message);
    if (!r.ok) continue;
    checkPlanShape(r);
    total += r.length;
    const stages = replayByStage(f, r);
    for (const { stage, facelets } of stages) {
      if (stage === 'cross') assert.ok(crossOK(facelets), `#${n} cross`);
      if (stage === 'corners') assert.ok(bottomOK(facelets), `#${n} bottom corners`);
      if (stage === 'middle') assert.ok(f2lOK(facelets), `#${n} middle layer`);
      if (stage === 'topcross') assert.ok(f2lOK(facelets) && topCrossOK(facelets), `#${n} top cross`);
      if (stage === 'topedges') assert.ok(f2lOK(facelets) && topCrossOK(facelets) && topEdgesMatch(facelets), `#${n} top edges`);
      if (stage === 'twist') assert.equal(facelets, SOLVED_FACELETS, `#${n} final`);
    }
    assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved(), `#${n} replay`);
  }
  console.log(`# beginner: average ${(total / 150).toFixed(1)} moves over 150 random cubes`);
});

test('Beginner method handles easy scrambles and already-finished stages', () => {
  const rand = rng(8);
  for (let n = 0; n < 60; n++) {
    const sc = randomScramble(1 + Math.floor(rand() * 8), rand);
    const f = new Sim().apply(sc).facelets();
    const r = solveForMethod(f, 'beginner');
    assert.ok(r.ok);
    if (r.ok) assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved(), sc);
  }
});

// ---------------------------------------------------------------- CFOP
test('CFOP solves 150 random legal cubes, checked stage by stage on the simulator', () => {
  const rand = rng(777);
  let total = 0, maxLen = 0;
  for (let n = 0; n < 150; n++) {
    const f = cubieToFacelets(randomCubie(rand));
    const r = solveForMethod(f, 'cfop');
    assert.ok(r.ok, r.ok ? '' : r.message);
    if (!r.ok) continue;
    checkPlanShape(r);
    total += r.length;
    maxLen = Math.max(maxLen, r.length);
    const stages = replayByStage(f, r);
    let seenF2l = false;
    for (const { stage, facelets } of stages) {
      if (stage === 'cross') assert.ok(crossOK(facelets), `#${n} cross`);
      if (stage.startsWith('f2l')) seenF2l = true;
      if (stage === 'oll') assert.ok(f2lOK(facelets) && topFaceOK(facelets), `#${n} OLL`);
      if (stage === 'pll') assert.equal(facelets, SOLVED_FACELETS, `#${n} final`);
    }
    // the F2L stages end with the first two layers done (the stage list can skip pairs that fell into place)
    const lastF2l = [...stages].reverse().find((s) => s.stage.startsWith('f2l'));
    if (seenF2l && lastF2l) assert.ok(f2lOK(lastF2l.facelets), `#${n} F2L`);
    assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved(), `#${n} replay`);
  }
  console.log(`# cfop: average ${(total / 150).toFixed(1)} moves, max ${maxLen}`);
  assert.ok(maxLen < 110);
});

test('CFOP picks OLL and PLL algorithms by name and uses a short cross', () => {
  const rand = rng(31);
  for (let n = 0; n < 40; n++) {
    const f = cubieToFacelets(randomCubie(rand));
    const r = solveForMethod(f, 'cfop');
    assert.ok(r.ok);
    if (!r.ok) continue;
    const cross = r.steps.find((s) => s.stage === 'cross');
    if (cross) assert.ok(cross.moves.length <= 8, `cross took ${cross.moves.length}`);
    const names = new Set([...A.OLL_EDGE_ALGS, ...A.OLL_CORNER_ALGS, ...A.PLL_ALGS].map((a) => a.name));
    for (const s of r.steps.filter((x) => x.kind === 'alg')) {
      assert.ok(names.has(s.title.replace(/ ×\d+$/, '')), `unexpected algorithm title ${s.title}`);
    }
  }
});

// ---------------------------------------------------------------- API
test('solveForMethod: Fastest groups the two phases and matches the plain solver', () => {
  const rand = rng(5);
  for (let n = 0; n < 15; n++) {
    const f = cubieToFacelets(randomCubie(rand));
    const r = solveForMethod(f, 'fast');
    assert.ok(r.ok);
    if (!r.ok) continue;
    checkPlanShape(r);
    assert.ok(r.steps.length === 2 || r.steps.length === 1);
    assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved());
    assert.ok(r.length <= 30);
  }
});

test('solveForMethod: solved cube gives an empty plan; invalid cubes give a clear error', () => {
  for (const m of ['fast', 'beginner', 'cfop'] as const) {
    const r = solveForMethod(SOLVED_FACELETS, m);
    assert.ok(r.ok && r.length === 0 && r.steps.length === 0, m);
    const bad = SOLVED_FACELETS.split('');
    [bad[8], bad[9], bad[20]] = ['R', 'F', 'U'];
    const e = solveForMethod(bad.join(''), m);
    assert.ok(!e.ok && e.code === 'CORNER_TWIST', m);
  }
});

test('solveForMethod accepts any six symbols (WOGRBY) for every method', () => {
  const map: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' };
  const sc = randomScramble(22, rng(12));
  const f = new Sim().apply(sc).facelets();
  const colored = f.split('').map((c) => map[c]).join('');
  for (const m of ['fast', 'beginner', 'cfop'] as const) {
    const r = solveForMethod(colored, m);
    assert.ok(r.ok, m);
    if (r.ok) assert.ok(new Sim(f).apply(r.moves.join(' ')).isSolved(), m);
  }
});

test('direct solver functions agree with the unified API', () => {
  const f = new Sim().apply("R U R' U' F2 D L' B2 U2 R D' F").facelets();
  const parsed = solveForMethod(f, 'beginner');
  assert.ok(parsed.ok);
  const cube = applyMoves(identity(), parseMoves("R U R' U' F2 D L' B2 U2 R D' F"));
  assert.equal(solveBeginner(cube).moves.join(' '), parsed.ok ? parsed.moves.join(' ') : '');
  assert.ok(solveCfop(cube).length > 0);
  void F;
});

test('Start-with color: every bottom face gets solved, with a real-face move list', () => {
  const rand = rng(77);
  const bottoms = ['D', 'U', 'F', 'B', 'R', 'L'] as const;
  for (const method of ['beginner', 'cfop'] as const) {
    for (const bottom of bottoms) {
      for (let n = 0; n < 4; n++) {
        const start = cubieToFacelets(randomCubie(rand));
        const r = solveForMethod(start, method, { bottom });
        assert.ok(r.ok, `${method}/${bottom} failed`);
        if (!r.ok) continue;
        assert.equal(r.frame.bottom, bottom);
        assert.equal(r.actualMoves.length, r.moves.length);
        const sim = new Sim(start);
        sim.apply(r.actualMoves.join(' '));
        assert.equal(sim.facelets(), SOLVED_FACELETS, `${method}/${bottom} not solved`);
      }
    }
  }
});
