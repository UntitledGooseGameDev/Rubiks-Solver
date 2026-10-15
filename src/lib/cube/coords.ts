/**
 * Coordinate representations, move tables and pruning tables for the
 * two-phase (Kociemba) algorithm. Tables are built lazily on first use
 * (typically well under a second) and cached for the life of the process.
 *
 * Phase 1 reduces the cube to the subgroup G1 = <U, D, R2, L2, F2, B2> by
 * fixing corner twist, edge flip and the position of the 4 middle-slice edges.
 * Phase 2 then solves the cube using only G1 moves.
 */
import { Cubie, MOVES, multiply } from './cubie';

export const N_TWIST = 2187; // 3^7
export const N_FLIP = 2048;  // 2^11
export const N_SLICE = 495;  // C(12,4) positions of the 4 slice edges
export const N_PERM8 = 40320; // 8!
export const N_PERM4 = 24;    // 4!

/** Move indices (see MOVES) that stay inside G1: U U2 U' D D2 D' R2 F2 L2 B2. */
export const G1_MOVES = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

export function permToIndex(p: ArrayLike<number>, n: number): number {
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    idx += smaller * FACT[n - 1 - i];
  }
  return idx;
}

export function indexToPerm(index: number, n: number): number[] {
  const avail = Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  let rest = index;
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const k = Math.floor(rest / f);
    rest -= k * f;
    out.push(avail.splice(k, 1)[0]);
  }
  return out;
}

// --- slice (positions of the 4 middle-layer edges FR FL BL BR) ---------------

const SLICE_MASKS: number[] = [0xf00]; // solved arrangement gets index 0
const MASK_TO_SLICE = new Int16Array(4096).fill(-1);
(() => {
  for (let m = 0; m < 4096; m++) {
    let bits = 0;
    for (let i = 0; i < 12; i++) if (m & (1 << i)) bits++;
    if (bits === 4 && m !== 0xf00) SLICE_MASKS.push(m);
  }
  SLICE_MASKS.forEach((m, i) => (MASK_TO_SLICE[m] = i));
})();

export function twistOf(c: Cubie): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = 3 * t + c.co[i];
  return t;
}
export function flipOf(c: Cubie): number {
  let f = 0;
  for (let i = 0; i < 11; i++) f = 2 * f + c.eo[i];
  return f;
}
export function sliceOf(c: Cubie): number {
  let mask = 0;
  for (let i = 0; i < 12; i++) if (c.ep[i] >= 8) mask |= 1 << i;
  return MASK_TO_SLICE[mask];
}

function cubieFromTwist(t: number): Cubie {
  const c = identityLike();
  let sum = 0;
  let rest = t;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = rest % 3;
    sum += c.co[i];
    rest = Math.floor(rest / 3);
  }
  c.co[7] = (3 - (sum % 3)) % 3;
  return c;
}
function cubieFromFlip(f: number): Cubie {
  const c = identityLike();
  let sum = 0;
  let rest = f;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = rest % 2;
    sum += c.eo[i];
    rest = Math.floor(rest / 2);
  }
  c.eo[11] = sum % 2;
  return c;
}
function cubieFromSlice(s: number): Cubie {
  const c = identityLike();
  const mask = SLICE_MASKS[s];
  let slice = 8;
  let other = 0;
  for (let i = 0; i < 12; i++) c.ep[i] = mask & (1 << i) ? slice++ : other++;
  return c;
}
function cubieFromCornerPerm(i: number): Cubie {
  const c = identityLike();
  c.cp = indexToPerm(i, 8);
  return c;
}
function cubieFromUdEdgePerm(i: number): Cubie {
  const c = identityLike();
  const p = indexToPerm(i, 8);
  for (let k = 0; k < 8; k++) c.ep[k] = p[k];
  return c;
}
function cubieFromSlicePerm(i: number): Cubie {
  const c = identityLike();
  const p = indexToPerm(i, 4);
  for (let k = 0; k < 4; k++) c.ep[8 + k] = 8 + p[k];
  return c;
}

function identityLike(): Cubie {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export const cornerPermOf = (c: Cubie) => permToIndex(c.cp, 8);
export const udEdgePermOf = (c: Cubie) => permToIndex(c.ep.slice(0, 8), 8);
export const slicePermOf = (c: Cubie) => permToIndex(c.ep.slice(8, 12).map((x) => x - 8), 4);

function buildMoveTable(
  n: number,
  moveList: number[],
  decode: (i: number) => Cubie,
  encode: (c: Cubie) => number,
): Uint16Array {
  const k = moveList.length;
  const table = new Uint16Array(n * k);
  for (let i = 0; i < n; i++) {
    const c = decode(i);
    for (let j = 0; j < k; j++) table[i * k + j] = encode(multiply(c, MOVES[moveList[j]]));
  }
  return table;
}

/** BFS distance table over the product of two coordinates; index = a * nB + b, solved = 0. */
function buildPruning(
  nA: number,
  nB: number,
  moveA: Uint16Array,
  moveB: Uint16Array,
  nMoves: number,
): Uint8Array {
  const size = nA * nB;
  const dist = new Uint8Array(size).fill(255);
  dist[0] = 0;
  let depth = 0;
  for (;;) {
    let added = 0;
    for (let idx = 0; idx < size; idx++) {
      if (dist[idx] !== depth) continue;
      const a = Math.floor(idx / nB);
      const b = idx - a * nB;
      for (let m = 0; m < nMoves; m++) {
        const ni = moveA[a * nMoves + m] * nB + moveB[b * nMoves + m];
        if (dist[ni] === 255) {
          dist[ni] = depth + 1;
          added++;
        }
      }
    }
    if (added === 0) break;
    depth++;
  }
  return dist;
}

export interface Tables {
  // phase 1, 18 moves per row
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  pruneSliceTwist: Uint8Array;
  pruneSliceFlip: Uint8Array;
  // phase 2, 10 moves per row (G1_MOVES order)
  cornerPermMove: Uint16Array;
  udEdgePermMove: Uint16Array;
  slicePermMove: Uint16Array;
  pruneCornerSlice: Uint8Array;
  pruneUdEdgeSlice: Uint8Array;
}

let cached: Tables | null = null;

export function getTables(): Tables {
  if (cached) return cached;
  const all = Array.from({ length: 18 }, (_, i) => i);

  const twistMove = buildMoveTable(N_TWIST, all, cubieFromTwist, twistOf);
  const flipMove = buildMoveTable(N_FLIP, all, cubieFromFlip, flipOf);
  const sliceMove = buildMoveTable(N_SLICE, all, cubieFromSlice, sliceOf);
  const pruneSliceTwist = buildPruning(N_SLICE, N_TWIST, sliceMove, twistMove, 18);
  const pruneSliceFlip = buildPruning(N_SLICE, N_FLIP, sliceMove, flipMove, 18);

  const cornerPermMove = buildMoveTable(N_PERM8, G1_MOVES, cubieFromCornerPerm, cornerPermOf);
  const udEdgePermMove = buildMoveTable(N_PERM8, G1_MOVES, cubieFromUdEdgePerm, udEdgePermOf);
  const slicePermMove = buildMoveTable(N_PERM4, G1_MOVES, cubieFromSlicePerm, slicePermOf);
  const pruneCornerSlice = buildPruning(N_PERM8, N_PERM4, cornerPermMove, slicePermMove, G1_MOVES.length);
  const pruneUdEdgeSlice = buildPruning(N_PERM8, N_PERM4, udEdgePermMove, slicePermMove, G1_MOVES.length);

  cached = {
    twistMove, flipMove, sliceMove, pruneSliceTwist, pruneSliceFlip,
    cornerPermMove, udEdgePermMove, slicePermMove, pruneCornerSlice, pruneUdEdgeSlice,
  };
  return cached;
}
