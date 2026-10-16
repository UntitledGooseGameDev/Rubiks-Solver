/**
 * Beginner (layer-by-layer) method. The first layer is built on the bottom (D)
 * and the last layer is on top (U), with the cube held as it appears on screen.
 *
 *   1 daisy            – the four first-layer edges around the top center
 *   2 bottom cross     – turn each petal down
 *   3 bottom corners   – Righty / Lefty triggers
 *   4 middle layer     – Righty / Lefty (long versions)
 *   5 top cross        – F R U R' U' F'
 *   6 top edges        – Sune + U
 *   7 top corners      – Niklas
 *   8 twist corners    – R' D' R D, repeated
 */
import { Cubie, applyMoves, parseMoves } from '../cube/cubie';
import {
  ALL_MOVE_IDS, cornerHome, edgeHome, edgeState, movesOfFaces, trackedSearch,
} from './pieces';
import { AUF_MACROS, Macro, macroSearch, makeMacro } from './macro';
import {
  CORNER_TRIGGERS, MIDDLE_INSERTS, TOP_CROSS_ALGS, SUNE_EDGES, NIKLAS, TWIST_CORNER,
} from './algs';
import { Plan, PlanBuilder, Stage, cornerLabel, edgeLabel } from './plan';

export const BEGINNER_STAGES: Stage[] = [
  { key: 'daisy', title: 'Daisy', blurb: 'Put the four [D] edges around the [U] center on the top, with the [D] stickers facing up. It looks like a flower.' },
  { key: 'cross', title: 'Bottom cross', blurb: 'Turn the top until a petal matches the center on its side, then turn that side half way round to drop the edge to the bottom. Do it for all four petals.' },
  { key: 'corners', title: 'Bottom corners', blurb: 'Finish the bottom layer by inserting the four [D] corners with Righty and Lefty.' },
  { key: 'middle', title: 'Middle layer', blurb: 'Insert the four middle-layer edges (the ones with no [U] sticker) with Righty and Lefty (the long versions).' },
  { key: 'topcross', title: 'Top cross', blurb: 'Make a plus sign of [U] stickers on the top face.' },
  { key: 'topedges', title: 'Top edges', blurb: 'Move the top edges so each one matches the center on its side.' },
  { key: 'topcorners', title: 'Top corners', blurb: 'Move the four top corners into their correct spots (they can still be twisted).' },
  { key: 'twist', title: 'Twist the corners', blurb: 'Twist each top corner in place. The cube looks scrambled in the middle of this step and snaps back at the end.' },
];

const SLOT_NAME = ['', '', '', '', 'bottom-front-right', 'bottom-front-left', 'bottom-back-left', 'bottom-back-right'];

function fewest(options: (Macro[] | null)[]): { seq: Macro[]; index: number } | null {
  let best: { seq: Macro[]; index: number } | null = null;
  let bestMoves = Infinity;
  options.forEach((seq, index) => {
    if (!seq) return;
    const moves = seq.reduce((n, m) => n + m.moves.length, 0);
    if (!best || seq.length < best.seq.length || (seq.length === best.seq.length && moves < bestMoves)) {
      best = { seq, index };
      bestMoves = moves;
    }
  });
  return best;
}

export function solveBeginner(start: Cubie, opts: { check?: boolean } = {}): Plan {
  const pb = new PlanBuilder(start, BEGINNER_STAGES);

  // ---------------------------------------------------------- 1. daisy
  {
    const petals = [4, 5, 6, 7]; // the four [D] edges: DR DF DL DB
    const isPetal = (c: Cubie, e: number) => edgeState(c, e) % 2 === 0 && edgeState(c, e) / 2 < 4;
    // If the cross is already there, leave it alone.
    const crossDone = () => petals.every((e) => edgeHome(pb.cube, e));
    for (;;) {
      if (crossDone()) break;
      const placed = petals.filter((e) => isPetal(pb.cube, e));
      const rest = petals.filter((e) => !placed.includes(e));
      if (!rest.length) break;
      const used = placed.map((e) => edgeState(pb.cube, e) / 2);
      let best: { e: number; path: number[] } | null = null;
      for (const e of rest) for (let slot = 0; slot < 4; slot++) {
        if (used.includes(slot)) continue;
        const edges = [...placed, e];
        const targets = [...placed.map((p) => edgeState(pb.cube, p)), slot * 2];
        const pairs: [number, number][] = [];
        for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) pairs.push([i, j]);
        const path = trackedSearch(pb.cube, { corners: [], edges, pairs, targets }, ALL_MOVE_IDS, { maxDepth: 9, maxNodes: 3_000_000 });
        if (path && (!best || path.length < best.path.length)) best = { e, path };
      }
      if (!best) throw new Error('Beginner solver: could not place a daisy petal');
      pb.addIndices('daisy', `Add the ${edgeLabel(best.e)} petal`, 'free', best.path,
        `Bring the ${edgeLabel(best.e)} edge to the top layer with its [D] sticker facing up. Keep the petals you already have.`);
    }
  }

  // ---------------------------------------------------------- 2. bottom cross
  {
    const crossEdges = [4, 5, 6, 7];
    const moves = [...movesOfFaces([0]), 4, 7, 13, 16]; // U turns and half turns of the sides
    for (;;) {
      const placed = crossEdges.filter((e) => edgeHome(pb.cube, e));
      const rest = crossEdges.filter((e) => !placed.includes(e));
      if (!rest.length) break;
      let best: { e: number; path: number[] } | null = null;
      for (const e of rest) {
        const edges = [...placed, e];
        const pairs: [number, number][] = [];
        for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) pairs.push([i, j]);
        const path = trackedSearch(pb.cube, { corners: [], edges, pairs }, moves, { maxDepth: 12, maxNodes: 3_000_000 });
        if (path && (!best || path.length < best.path.length)) best = { e, path };
      }
      if (!best) throw new Error('Beginner solver: could not drop a petal to the cross');
      pb.addIndices('cross', `Drop the ${edgeLabel(best.e)} petal down`, 'free', best.path,
        `Turn the top until the ${edgeLabel(best.e)} petal matches the center on its side, then turn that side half way round.`);
    }
  }

  // ---------------------------------------------------------- 3. bottom corners
  {
    const corners = [4, 5, 6, 7];
    const macros: Macro[] = [...AUF_MACROS];
    for (const t of CORNER_TRIGGERS) for (let k = 1; k <= 5; k++) macros.push(makeMacro(t.alg, k));
    for (;;) {
      const cube = pb.cube;
      const done = corners.filter((c) => cornerHome(cube, c));
      const rest = corners.filter((c) => !done.includes(c));
      if (!rest.length) break;
      const crossOk = (c: Cubie) => [4, 5, 6, 7].every((e) => edgeHome(c, e));
      const options = rest.map((t) =>
        macroSearch(cube, macros, (c) => crossOk(c) && [...done, t].every((x) => cornerHome(c, x)), 5));
      const pick = fewest(options);
      if (!pick) throw new Error('Beginner solver: could not insert a bottom corner');
      const target = rest[pick.index];
      pb.addMacros('corners', pick.seq, (m) =>
        m.auf ? `Line the ${cornerLabel(target)} corner up above its slot (${SLOT_NAME[target]}).`
          : `Repeat until the ${cornerLabel(target)} corner drops into place with [D] on the bottom.`);
    }
  }

  // ---------------------------------------------------------- 3. middle layer
  {
    const edges = [8, 9, 10, 11];
    const macros: Macro[] = [...AUF_MACROS, ...MIDDLE_INSERTS.map((a) => makeMacro(a))];
    const layerOk = (c: Cubie) => [4, 5, 6, 7].every((p) => cornerHome(c, p) && edgeHome(c, p));
    for (;;) {
      const cube = pb.cube;
      const done = edges.filter((e) => edgeHome(cube, e));
      const rest = edges.filter((e) => !done.includes(e));
      if (!rest.length) break;
      const options = rest.map((t) =>
        macroSearch(cube, macros, (c) => layerOk(c) && [...done, t].every((x) => edgeHome(c, x)), 5));
      const pick = fewest(options);
      if (!pick) throw new Error('Beginner solver: could not insert a middle edge');
      const target = rest[pick.index];
      pb.addMacros('middle', pick.seq, (m) =>
        m.auf ? `Line the ${edgeLabel(target)} edge up with its center.`
          : `Insert the ${edgeLabel(target)} edge into the middle layer.`);
    }
  }

  // ---------------------------------------------------------- 4. top cross
  {
    const macros = [...AUF_MACROS, ...TOP_CROSS_ALGS.map((a) => makeMacro(a))];
    const goal = (c: Cubie) => [0, 1, 2, 3].every((s) => c.eo[s] === 0);
    const seq = macroSearch(pb.cube, macros, goal, 6);
    if (!seq) throw new Error('Beginner solver: top cross failed');
    pb.addMacros('topcross', seq, (m) => m.auf ? 'Turn the top so the shape matches the algorithm.' : 'Flips the top edges until a [U] cross appears.');
  }

  // ---------------------------------------------------------- 5. top edges
  {
    const macros = [...AUF_MACROS, makeMacro(SUNE_EDGES)];
    const goal = (c: Cubie) => [0, 1, 2, 3].every((s) => c.ep[s] === s && c.eo[s] === 0);
    const seq = macroSearch(pb.cube, macros, goal, 6);
    if (!seq) throw new Error('Beginner solver: top edges failed');
    pb.addMacros('topedges', seq, (m) => m.auf ? 'Turn the top until one edge matches its center.' : 'Cycles the top edges (it also twists corners, which is fixed later).');
  }

  // ---------------------------------------------------------- 6. top corners
  {
    const macros = [...AUF_MACROS, makeMacro(NIKLAS)];
    const goal = (c: Cubie) => [0, 1, 2, 3].every((s) => c.cp[s] === s && c.ep[s] === s);
    const seq = macroSearch(pb.cube, macros, goal, 7);
    if (!seq) throw new Error('Beginner solver: top corners failed');
    pb.addMacros('topcorners', seq, (m) => m.auf ? 'Turn the top to line up the corner that is already in the right place.' : 'Cycles three top corners and leaves every edge alone.');
  }

  // ---------------------------------------------------------- 7. twist corners
  {
    const twist = parseMoves(TWIST_CORNER.moves);
    let pendingU = 0;
    const flushU = () => {
      const k = ((pendingU % 4) + 4) % 4;
      pendingU = 0;
      if (k) pb.addMoves('twist', 'Turn the top layer', 'setup', [k === 1 ? 'U' : k === 2 ? 'U2' : "U'"], 'Bring the next unfinished corner to the top-front-right.');
    };
    const U1 = parseMoves('U')[0];
    for (let i = 0; i < 4; i++) {
      // The corner that would sit at top-front-right after the pending top-layer turns.
      const view = pendingU % 4 ? applyMoves(pb.cube, new Array<number>(pendingU % 4).fill(U1)) : pb.cube;
      if (view.co[0] !== 0) {
        flushU();
        // Repeat the twist until the corner at top-front-right is a top-layer corner showing [U] on top.
        // The bottom two layers look scrambled in between; they are restored by the later twists.
        let found = 0;
        let c = pb.cube;
        for (let k = 1; k <= 6 && !found; k++) {
          c = applyMoves(c, twist);
          if (c.cp[0] < 4 && c.co[0] === 0) found = k;
        }
        if (!found) throw new Error('Beginner solver: corner twist failed');
        const m = makeMacro(TWIST_CORNER, found);
        pb.addMacros('twist', [m], () => 'Repeat until the [U] sticker of the top-front-right corner faces up. Ignore the rest until it finishes.');
      }
      pendingU += 1; // next corner
    }
    flushU();
  }

  const plan = pb.build('beginner');
  const end = applyMoves(start, parseMoves(plan.moves.join(' ')));
  if (opts.check !== false && (!end.cp.every((v, i) => v === i) || !end.co.every((v) => v === 0) || !end.ep.every((v, i) => v === i) || !end.eo.every((v) => v === 0))) {
    throw new Error('Beginner solver: the final cube is not solved');
  }
  return plan;
}
