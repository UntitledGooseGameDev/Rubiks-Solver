/**
 * Choosing which face to build first.
 *
 * The Beginner and CFOP solvers always build their first layer on the bottom (D)
 * and finish on top (U). To start with another color, we hold the whole cube
 * differently: a rotation of the cube puts the chosen face at the bottom, we
 * solve the rotated cube, and then translate the moves back to the real faces
 * for the 3D animation.
 *
 * `FRAME_FACES[bottom][frameLetter]` is the real face that plays the role of
 * `frameLetter` when `bottom` is held at the bottom.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export const FRAME_FACES: Record<Face, Record<Face, Face>> = {
  D: { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B' },
  U: { U: 'D', D: 'U', R: 'L', L: 'R', F: 'F', B: 'B' }, // turn the cube over (z2)
  F: { U: 'B', D: 'F', F: 'U', B: 'D', R: 'R', L: 'L' }, // x'
  B: { U: 'F', D: 'B', F: 'D', B: 'U', R: 'R', L: 'L' }, // x
  R: { U: 'L', D: 'R', R: 'U', L: 'D', F: 'F', B: 'B' }, // z
  L: { U: 'R', D: 'L', R: 'D', L: 'U', F: 'F', B: 'B' }, // z'
};

type V = [number, number, number];
const AXIS: Record<Face, V> = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };

/** Position (cubie, -1..1 per axis) and outward normal of facelet i in URFDLB reading order. */
function geometry(i: number): { pos: V; nor: V } {
  const face = Math.floor(i / 9);
  const r = Math.floor((i % 9) / 3);
  const c = i % 3;
  switch (face) {
    case 0: return { pos: [c - 1, 1, r - 1], nor: [0, 1, 0] };
    case 1: return { pos: [1, 1 - r, 1 - c], nor: [1, 0, 0] };
    case 2: return { pos: [c - 1, 1 - r, 1], nor: [0, 0, 1] };
    case 3: return { pos: [c - 1, -1, 1 - r], nor: [0, -1, 0] };
    case 4: return { pos: [-1, 1 - r, c - 1], nor: [-1, 0, 0] };
    default: return { pos: [1 - c, 1 - r, -1], nor: [0, 0, -1] };
  }
}

const key = (p: V, n: V) => `${p.join(',')}|${n.join(',')}`;
const INDEX = new Map<string, number>();
for (let i = 0; i < 54; i++) { const g = geometry(i); INDEX.set(key(g.pos, g.nor), i); }

const permCache = new Map<Face, number[]>();
/** FRAME_PERM[j] = real facelet that shows up at facelet j of the rotated cube. */
function framePerm(bottom: Face): number[] {
  let perm = permCache.get(bottom);
  if (perm) return perm;
  const map = FRAME_FACES[bottom];
  const ex = AXIS[map.R], ey = AXIS[map.U], ez = AXIS[map.F]; // images of the frame's x, y, z axes
  const rot = (v: V): V => [
    ex[0] * v[0] + ey[0] * v[1] + ez[0] * v[2],
    ex[1] * v[0] + ey[1] * v[1] + ez[1] * v[2],
    ex[2] * v[0] + ey[2] * v[1] + ez[2] * v[2],
  ];
  perm = [];
  for (let j = 0; j < 54; j++) {
    const g = geometry(j);
    const real = INDEX.get(key(rot(g.pos), rot(g.nor)));
    if (real === undefined) throw new Error('frame: no matching facelet');
    perm.push(real);
  }
  permCache.set(bottom, perm);
  return perm;
}

/** The cube as seen when `bottom` is held at the bottom (54 facelets, URFDLB order, any symbols). */
export function toFrameFacelets(facelets: string, bottom: Face): string {
  if (bottom === 'D') return facelets;
  const perm = framePerm(bottom);
  let out = '';
  for (let j = 0; j < 54; j++) out += facelets[perm[j]];
  return out;
}

/** Translate a move written for the rotated cube ("R'", "U2") into the real face's move. */
export function frameMoveToActual(move: string, bottom: Face): string {
  return FRAME_FACES[bottom][move[0] as Face] + move.slice(1);
}

/** Replace [X] color tokens, which name faces of the rotated cube, with the real faces. */
export function frameTokens(text: string, bottom: Face): string {
  return text.replace(/\[([URFDLB])\]/g, (_, l: Face) => `[${FRAME_FACES[bottom][l]}]`);
}
