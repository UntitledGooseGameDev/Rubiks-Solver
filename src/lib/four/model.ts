/**
 * The 4x4x4 as a permutation of 96 stickers.
 *
 * Every cubie sits at coordinates (x, y, z) with each value in {-3, -1, 1, 3}. A sticker is a
 * cubie plus the direction its sticker faces. A move turns every cubie on one layer.
 * Faces are U R F D L B, each read left to right, top to bottom, 4 by 4, so sticker i is
 * face (i / 16), row ((i % 16) / 4), column (i % 4).
 *
 * A move is numbered (face * 2 + depth) * 3 + (turns - 1), where depth 0 is the outer layer
 * of that face and depth 1 is the layer right under it ("2R" in text).
 */

export const N = 4;
export const FACE_LETTERS = 'URFDLB';
type V = [number, number, number];
const AXES: V[] = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Exact clockwise quarter turn (seen from outside) about unit axis k. */
const quarterCW = (v: V, k: V): V => {
  const kxv = cross(k, v), kv = dot(k, v);
  return [-kxv[0] + k[0] * kv + 0, -kxv[1] + k[1] * kv + 0, -kxv[2] + k[2] * kv + 0];
};

const c4 = (k: number) => 2 * k - (N - 1);

/** Position (cubie coordinates) and outward direction of sticker i. */
function geometry(i: number): { pos: V; nor: V } {
  const face = Math.floor(i / 16), r = Math.floor((i % 16) / 4), c = i % 4;
  const h = N - 1;
  switch (face) {
    case 0: return { pos: [c4(c), h, c4(r)], nor: [0, 1, 0] };
    case 1: return { pos: [h, -c4(r), -c4(c)], nor: [1, 0, 0] };
    case 2: return { pos: [c4(c), -c4(r), h], nor: [0, 0, 1] };
    case 3: return { pos: [c4(c), -h, -c4(r)], nor: [0, -1, 0] };
    case 4: return { pos: [-h, -c4(r), c4(c)], nor: [-1, 0, 0] };
    default: return { pos: [-c4(c), -c4(r), -h], nor: [0, 0, -1] };
  }
}
const key = (p: V, n: V) => `${p.join(',')}|${n.join(',')}`;
export const GEO = Array.from({ length: 96 }, (_, i) => geometry(i));
const INDEX = new Map<string, number>();
GEO.forEach((g, i) => INDEX.set(key(g.pos, g.nor), i));

export const N_MOVES = 36;
/** PERMS[move][i] = where the sticker at i goes. */
export const PERMS: Uint8Array[] = [];
for (let face = 0; face < 6; face++) {
  for (let depth = 0; depth < 2; depth++) {
    for (let turns = 1; turns <= 3; turns++) {
      const perm = new Uint8Array(96);
      for (let i = 0; i < 96; i++) {
        const g = GEO[i];
        if (dot(g.pos, AXES[face]) === N - 1 - 2 * depth) {
          let p = g.pos, n = g.nor;
          for (let q = 0; q < turns; q++) { p = quarterCW(p, AXES[face]); n = quarterCW(n, AXES[face]); }
          perm[i] = INDEX.get(key(p, n))!;
        } else perm[i] = i;
      }
      PERMS.push(perm);
    }
  }
}

export const moveFace = (m: number) => Math.floor(m / 6);
export const moveDepth = (m: number) => Math.floor(m / 3) % 2;
export const moveTurns = (m: number) => (m % 3) + 1;
/** Inverse of a move number. */
export const invMove = (m: number) => Math.floor(m / 3) * 3 + (2 - (m % 3));

export function moveName(m: number): string {
  return (moveDepth(m) ? '2' : '') + FACE_LETTERS[moveFace(m)] + ['', '2', "'"][m % 3];
}
const NAME_TO_MOVE = new Map<string, number>();
for (let m = 0; m < N_MOVES; m++) NAME_TO_MOVE.set(moveName(m), m);

/**
 * Parse "R U2 2L' Rw Uw2 u" into single-layer move numbers. Rw (or a lowercase letter) turns the
 * outer two layers together, so it becomes two single-layer moves. Throws on a bad token.
 */
export function parseMoves(text: string): number[] {
  const out: number[] = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(2?)([URFDLBurfdlb])(w?)([123]?)(['’]?)$/.exec(tok);
    if (!m) throw new Error(`"${tok}" is not a valid move. Use U R F D L B, 2R for the second layer, Rw or r for two layers, with an optional 2 or '.`);
    const second = m[1] === '2';
    const lower = m[2] === m[2].toLowerCase();
    const wide = m[3] === 'w' || lower;
    if (second && wide) throw new Error(`"${tok}" mixes a second-layer turn with a wide turn.`);
    const face = FACE_LETTERS.indexOf(m[2].toUpperCase());
    let turns = m[4] ? parseInt(m[4], 10) : 1;
    if (m[5]) turns = (4 - turns) % 4;
    turns %= 4;
    if (!turns) continue;
    const mv = (depth: number) => (face * 2 + depth) * 3 + (turns - 1);
    if (wide) { out.push(mv(0), mv(1)); } else out.push(mv(second ? 1 : 0));
  }
  return out;
}
export const formatMoves = (moves: number[]) => moves.map(moveName).join(' ');

export type State = Uint8Array;
export function applyMove(state: State, m: number, out?: State): State {
  const perm = PERMS[m], res = out ?? new Uint8Array(96);
  for (let i = 0; i < 96; i++) res[perm[i]] = state[i];
  return res;
}
export function applyMoves(state: State, moves: number[]): State {
  let s = state;
  for (const m of moves) s = applyMove(s, m);
  return s === state ? new Uint8Array(state) : s;
}
export const SOLVED: State = Uint8Array.from({ length: 96 }, (_, i) => Math.floor(i / 16));
export const isSolved = (s: State) => {
  for (let f = 0; f < 6; f++) for (let k = 1; k < 16; k++) if (s[f * 16 + k] !== s[f * 16]) return false;
  return true;
};

/** Composition of permutations: first a, then b. */
export function composePerm(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(96);
  for (let i = 0; i < 96; i++) out[i] = b[a[i]];
  return out;
}
export function permOfMoves(moves: number[]): Uint8Array {
  let p: Uint8Array = Uint8Array.from({ length: 96 }, (_, i) => i);
  for (const m of moves) p = composePerm(p, PERMS[m]);
  return p;
}

// ------------------------------------------------------------------ sticker classes
export const stickerFace = (i: number) => Math.floor(i / 16);
const rc = (i: number) => [Math.floor((i % 16) / 4), i % 4];
export const isCenter = (i: number) => { const [r, c] = rc(i); return r >= 1 && r <= 2 && c >= 1 && c <= 2; };
export const isCorner = (i: number) => { const [r, c] = rc(i); return (r === 0 || r === 3) && (c === 0 || c === 3); };
export const isWing = (i: number) => !isCenter(i) && !isCorner(i);
export const CENTERS: number[] = []; export const WINGS: number[] = []; export const CORNERS: number[] = [];
for (let i = 0; i < 96; i++) (isCenter(i) ? CENTERS : isCorner(i) ? CORNERS : WINGS).push(i);

/** For each sticker, the sticker on the other side of the same piece, for wings. */
export const WING_MATE: number[] = new Array(96).fill(-1);
for (const i of WINGS) {
  const g = GEO[i];
  for (const j of WINGS) {
    if (j === i) continue;
    const h = GEO[j];
    if (h.pos[0] === g.pos[0] && h.pos[1] === g.pos[1] && h.pos[2] === g.pos[2]) WING_MATE[i] = j;
  }
}
