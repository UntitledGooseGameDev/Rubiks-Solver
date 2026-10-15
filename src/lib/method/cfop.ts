/**
 * CFOP (Fridrich) method: Cross, F2L, OLL, PLL.
 *
 * The first layer is built on the bottom (D) and the last layer is on top (U),
 * with the cube held as it appears on screen.
 *
 *   Cross  – the four [D] edges, found by an exact search (usually 6-8 moves)
 *   F2L    – the four corner+edge pairs, each solved as a pair
 *   OLL    – 2-look: edges first (line / L-shape algs), then corners (Sune, Antisune, ...)
 *   PLL    – all 21 permutation algorithms, found by lookup
 */
import { Cubie, applyMoves, parseMoves, multiply } from '../cube/cubie';
import { ALL_MOVE_IDS, cornerHome, edgeHome, movesOfFaces, trackedSearch } from './pieces';
import { AUF_MACROS, Macro, macroSearch, makeMacro } from './macro';
import { OLL_CORNER_ALGS, OLL_EDGE_ALGS, PLL_ALGS } from './algs';
import { Plan, PlanBuilder, Stage, cornerLabel, edgeLabel } from './plan';

export const CFOP_STAGES: Stage[] = [
  { key: 'cross', title: 'Cross', blurb: 'Solve the four [D] edges on the bottom, each matching the center on its side.' },
  { key: 'f2l1', title: 'F2L pair 1', blurb: 'Insert a corner and its edge together as a pair.' },
  { key: 'f2l2', title: 'F2L pair 2', blurb: 'Insert the next corner-and-edge pair.' },
  { key: 'f2l3', title: 'F2L pair 3', blurb: 'Insert the next corner-and-edge pair.' },
  { key: 'f2l4', title: 'F2L pair 4', blurb: 'Insert the last corner-and-edge pair. The first two layers are now done.' },
  { key: 'oll', title: 'OLL', blurb: 'Make the whole top face [U] (two looks: the edges first, then the corners).' },
  { key: 'pll', title: 'PLL', blurb: 'Permute the last layer: one algorithm puts every top piece in its place.' },
];

// Slot j (0..3) holds corner 4+j and edge 8+j: DFR/FR, DLF/FL, DBL/BL, DRB/BR.
// Faces: U=0 R=1 F=2 D=3 L=4 B=5.
const SLOT_FACES: number[][] = [[0, 1, 2], [0, 4, 2], [0, 4, 5], [0, 1, 5]];
const F2L_TIERS: { moves: number[]; maxDepth: number; maxNodes: number }[] = [
  // 1) only the top and the two faces next to the slot
  { moves: [], maxDepth: 11, maxNodes: 1_500_000 },
  // 2) top and every side face
  { moves: movesOfFaces([0, 1, 2, 4, 5]), maxDepth: 12, maxNodes: 3_000_000 },
  // 3) anything
  { moves: ALL_MOVE_IDS, maxDepth: 14, maxNodes: 8_000_000 },
];

const isoNames = ['[D]-[F]-[R]', '[D]-[F]-[L]', '[D]-[B]-[L]', '[D]-[B]-[R]'];
void isoNames;

export function solveCfop(start: Cubie, opts: { check?: boolean } = {}): Plan {
  const pb = new PlanBuilder(start, CFOP_STAGES);
  const crossEdges = [4, 5, 6, 7];

  // ---------------------------------------------------------- cross
  {
    const pairs: [number, number][] = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([i, j]);
    const path = trackedSearch(pb.cube, { corners: [], edges: crossEdges, pairs }, ALL_MOVE_IDS, { maxDepth: 10, maxNodes: 40_000_000 });
    if (!path) throw new Error('CFOP solver: cross failed');
    pb.addIndices('cross', 'Cross', 'free', path, 'Solve the four [D] edges together. Plan it before you start turning.');
  }

  // ---------------------------------------------------------- F2L
  const donePairs: number[] = [];
  for (let n = 0; n < 4; n++) {
    const stage = `f2l${n + 1}`;
    // pairs that are already in place count as done
    const inPlace = (c: Cubie, j: number) => cornerHome(c, 4 + j) && edgeHome(c, 8 + j);
    for (let j = 0; j < 4; j++) if (!donePairs.includes(j) && inPlace(pb.cube, j)) donePairs.push(j);
    const rest = [0, 1, 2, 3].filter((j) => !donePairs.includes(j));
    if (!rest.length) break;

    let best: { j: number; path: number[]; tier: number } | null = null;
    for (let t = 0; t < F2L_TIERS.length && !best; t++) {
      for (const j of rest) {
        const tier = F2L_TIERS[t];
        const moves = t === 0 ? movesOfFaces(SLOT_FACES[j]) : tier.moves;
        const corners = [...donePairs.map((d) => 4 + d), 4 + j];
        const edges = [...crossEdges, ...donePairs.map((d) => 8 + d), 8 + j];
        const cc = corners.length - 1; // index of the current corner
        const ce = corners.length + edges.length - 1; // index of the current edge
        const pairs: [number, number][] = [[cc, ce]];
        for (let e = 0; e < crossEdges.length; e++) { pairs.push([ce, corners.length + e]); pairs.push([cc, corners.length + e]); }
        const path = trackedSearch(pb.cube, { corners, edges, pairs }, moves, { maxDepth: tier.maxDepth, maxNodes: tier.maxNodes });
        if (path && (!best || path.length < best.path.length)) best = { j, path, tier: t };
      }
    }
    if (!best) throw new Error('CFOP solver: F2L pair failed');
    donePairs.push(best.j);
    pb.addIndices(stage, `Pair ${cornerLabel(4 + best.j)} corner with ${edgeLabel(8 + best.j)} edge`, 'free', best.path,
      `Insert the ${cornerLabel(4 + best.j)} corner and the ${edgeLabel(8 + best.j)} edge together.`);
    // pairs that fell into place as a side effect
    for (let j = 0; j < 4; j++) if (!donePairs.includes(j) && inPlace(pb.cube, j)) donePairs.push(j);
  }
  // Stage list should only mention pairs that were actually needed; the UI skips empty stages.

  // ---------------------------------------------------------- OLL
  {
    const edgeMacros = [...AUF_MACROS, ...OLL_EDGE_ALGS.map((a) => makeMacro(a))];
    const e = macroSearch(pb.cube, edgeMacros, (c) => [0, 1, 2, 3].every((s) => c.eo[s] === 0), 5);
    if (!e) throw new Error('CFOP solver: OLL edges failed');
    pb.addMacros('oll', e, (m) => m.auf ? 'Turn the top to match the case.' : 'First look: orient the top edges so they form a cross.');

    const cornerMacros = [...AUF_MACROS, ...OLL_CORNER_ALGS.map((a) => makeMacro(a))];
    const goal = (c: Cubie) => [0, 1, 2, 3].every((s) => c.eo[s] === 0 && c.co[s] === 0);
    const k = macroSearch(pb.cube, cornerMacros, goal, 5);
    if (!k) throw new Error('CFOP solver: OLL corners failed');
    pb.addMacros('oll', k, (m) => m.auf ? 'Turn the top to match the case.' : 'Second look: orient the top corners so the whole top face is [U].');
  }

  // ---------------------------------------------------------- PLL
  {
    const solved = (c: Cubie) => c.cp.every((v, i) => v === i) && c.ep.every((v, i) => v === i);
    const pllMacros = PLL_ALGS.map((a) => makeMacro(a));
    const aufs = [AUF_MACROS[0], AUF_MACROS[1], AUF_MACROS[2]];
    const solvedAfterAuf = (c: Cubie): Macro | 'none' | null => {
      if (solved(c)) return 'none';
      for (const u of aufs) if (solved(multiply(c, u.cube))) return u;
      return null;
    };
    if (!solved(pb.cube)) {
      let bestSeq: Macro[] | null = null;
      let bestMoves = Infinity;
      const pre: (Macro | null)[] = [null, ...aufs];
      for (const p of pre) {
        const c1 = p ? multiply(pb.cube, p.cube) : pb.cube;
        for (const a of pllMacros) {
          const post = solvedAfterAuf(multiply(c1, a.cube));
          if (post === null) continue;
          const seq: Macro[] = [];
          if (p) seq.push(p);
          seq.push(a);
          if (post !== 'none') seq.push(post);
          const mv = seq.reduce((x, m) => x + m.moves.length, 0);
          if (mv < bestMoves) { bestMoves = mv; bestSeq = seq; }
        }
      }
      if (!bestSeq) {
        // Not expected (the 21 PLL algs cover every case); fall back to two algorithms.
        bestSeq = macroSearch(pb.cube, [...AUF_MACROS, ...pllMacros], solved, 4);
      }
      if (!bestSeq) throw new Error('CFOP solver: PLL failed');
      pb.addMacros('pll', bestSeq, (m) => m.auf ? 'Turn the top (AUF) so the case lines up.' : 'Permutes the last layer.');
    }
    // final alignment of the top layer, if PLL left it turned
    const c = pb.cube;
    if (!solved(c)) {
      const fin = aufs.find((u) => solved(multiply(c, u.cube)));
      if (fin) pb.addMacros('pll', [fin], () => 'Final turn (AUF) to finish.');
    }
  }

  const plan = pb.build('cfop');
  const end = applyMoves(start, parseMoves(plan.moves.join(' ')));
  if (opts.check !== false && (!end.cp.every((v, i) => v === i) || !end.co.every((v) => v === 0) || !end.ep.every((v, i) => v === i) || !end.eo.every((v) => v === 0))) {
    throw new Error('CFOP solver: the final cube is not solved');
  }
  return plan;
}
