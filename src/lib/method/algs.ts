/**
 * Named algorithms used by the Beginner and CFOP solvers.
 *
 * Everything is written with plain face turns (U R F D L B) so the 3D cube can
 * animate every move. tests/method.test.ts checks each one on the independent
 * cube simulator, so a typo here fails the test run.
 */
import { Cubie, identity, applyMoves, parseMoves } from '../cube/cubie';

export interface Alg {
  id: string;
  name: string;
  moves: string;
}

/** Shorthand: is this a plain-string alg? */
const A = (id: string, name: string, moves: string): Alg => ({ id, name, moves });

// ---------------------------------------------------------------- beginner
/** First-layer corner triggers, one per bottom slot, used when the corner sits right above its slot. */
export const CORNER_TRIGGERS: { slot: number; alg: Alg }[] = [
  { slot: 4, alg: A('righty', 'Righty', "R U R' U'") }, // DFR
  { slot: 5, alg: A('lefty', 'Lefty', "L' U' L U") }, // DLF
  { slot: 6, alg: A('lefty-back', 'Lefty (back slot)', "L U L' U'") }, // DBL
  { slot: 7, alg: A('righty-back', 'Righty (back slot)', "R' U' R U") }, // DRB
];

/** Rotate an alg around the vertical axis: F->R->B->L->F (k quarter turns). */
export function turnAround(moves: string, k: number): string {
  const ring = ['F', 'R', 'B', 'L'];
  return moves
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const i = ring.indexOf(t[0]);
      return i < 0 ? t : ring[(i + k) % 4] + t.slice(1);
    })
    .join(' ');
}

const RIGHT_INSERT = "U R U' R' U' F' U F";
const LEFT_INSERT = "U' L' U L U F U' F'";

/** Middle-layer insertions: the right-hand and left-hand algorithms, in all four rotations. */
export const MIDDLE_INSERTS: Alg[] = [];
for (let k = 0; k < 4; k++) {
  MIDDLE_INSERTS.push(A(`right-hand-${k}`, 'Right-hand algorithm', turnAround(RIGHT_INSERT, k)));
  MIDDLE_INSERTS.push(A(`left-hand-${k}`, 'Left-hand algorithm', turnAround(LEFT_INSERT, k)));
}

export const TOP_CROSS_ALGS: Alg[] = [
  A('cross-line', 'Top cross algorithm', "F R U R' U' F'"),
  A('cross-mirror', 'Top cross algorithm (mirror)', "F U R U' R' F'"),
];
export const SUNE_EDGES: Alg = A('sune-u', 'Sune + U', "R U R' U R U2 R' U");
export const NIKLAS: Alg = A('niklas', 'Niklas', "U R U' L' U R' U' L");
export const TWIST_CORNER: Alg = A('twist', 'Corner twist', "R' D' R D");

// ---------------------------------------------------------------- CFOP
export const OLL_EDGE_ALGS: Alg[] = [
  A('oll-line', 'Line / hook (F R U R\' U\' F\')', "F R U R' U' F'"),
  A('oll-l', 'L-shape (F U R U\' R\' F\')', "F U R U' R' F'"),
];
export const OLL_CORNER_ALGS: Alg[] = [
  A('sune', 'Sune', "R U R' U R U2 R'"),
  A('antisune', 'Antisune', "R U2 R' U' R U' R'"),
  A('oll-h', 'H case', "F R U R' U' R U R' U' R U R' U' F'"),
  A('oll-pi', 'Pi case', "R U2 R2 U' R2 U' R2 U2 R"),
  A('oll-u', 'U case (headlights)', "R2 D R' U2 R D' R' U2 R'"),
];

export const PLL_ALGS: Alg[] = [
  A('pll-aa', 'Aa perm', "R' F R' B2 R F' R' B2 R2"),
  A('pll-ab', 'Ab perm', "R B' R F2 R' B R F2 R2"),
  A('pll-e', 'E perm', "R B' R' F R B R' F' R B R' F R B' R' F'"),
  A('pll-f', 'F perm', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"),
  A('pll-ga', 'Ga perm', "R2 U R' U R' U' R U' R2 D U' R' U R D'"),
  A('pll-gb', 'Gb perm', "R' U' R U D' R2 U R' U R U' R U' R2 D"),
  A('pll-gc', 'Gc perm', "R2 U' R U' R U R' U R2 D' U R U' R' D"),
  A('pll-gd', 'Gd perm', "R U R' U' D R2 U' R U' R' U R' U R2 D'"),
  A('pll-h', 'H perm', "R2 U2 R U2 R2 U2 R2 U2 R U2 R2"),
  A('pll-ja', 'Ja perm', "R' U L' U2 R U' R' U2 R L"),
  A('pll-jb', 'Jb perm', "R U R' F' R U R' U' R' F R2 U' R'"),
  A('pll-na', 'Na perm', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"),
  A('pll-nb', 'Nb perm', "R' U R U' R' F' U' F R U R' F R' F' R U' R"),
  A('pll-ra', 'Ra perm', "R U' R' U' R U R D R' U' R D' R' U2 R'"),
  A('pll-rb', 'Rb perm', "R' U2 R U2 R' F R U R' U' R' F' R2"),
  A('pll-t', 'T perm', "R U R' U' R' F R2 U' R' U' R U R' F'"),
  A('pll-ua', 'Ua perm', "R U' R U R U R U' R' U' R2"),
  A('pll-ub', 'Ub perm', "R2 U R U R' U' R' U' R' U R'"),
  A('pll-v', 'V perm', "R' U R' U' R D' R' D R' U D' R2 U' R2 D R2"),
  A('pll-y', 'Y perm', "F R U' R' U' R U R' F' R U R' U' R' F R F'"),
  A('pll-z', 'Z perm', "R' U' R U' R U R U' R' U R U R2 U' R'"),
];

// ---------------------------------------------------------------- helpers
export function algCubie(moves: string): Cubie {
  return applyMoves(identity(), parseMoves(moves));
}
