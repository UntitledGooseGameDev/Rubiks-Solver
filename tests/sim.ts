/**
 * Independent physical Rubik's Cube simulator, used ONLY to test the solver.
 *
 * It shares no lookup tables with the solver: every sticker is a point in 3D
 * (position + outward normal) and a face turn is a real 90 degree rotation of
 * the stickers in that layer. If the solver's cubie tables, orientation
 * conventions or facelet mapping were wrong, this simulator would disagree.
 */

import type { Cubie } from '../src/lib/cube/cubie';

type V = [number, number, number];

interface Sticker {
  pos: V;
  nor: V;
  color: string;
}

const FACE_LETTERS = 'URFDLB';
const AXES: V[] = [
  [0, 1, 0],  // U
  [1, 0, 0],  // R
  [0, 0, 1],  // F
  [0, -1, 0], // D
  [-1, 0, 0], // L
  [0, 0, -1], // B
];

/** Geometric position/normal of facelet i (0..53) in URFDLB reading order. */
function faceletGeometry(i: number): { pos: V; nor: V } {
  const face = Math.floor(i / 9);
  const r = Math.floor((i % 9) / 3);
  const c = i % 3;
  switch (face) {
    case 0: return { pos: [c - 1, 1, r - 1], nor: [0, 1, 0] };   // U: top row is back
    case 1: return { pos: [1, 1 - r, 1 - c], nor: [1, 0, 0] };   // R: left column is front
    case 2: return { pos: [c - 1, 1 - r, 1], nor: [0, 0, 1] };   // F
    case 3: return { pos: [c - 1, -1, 1 - r], nor: [0, -1, 0] }; // D: top row is front
    case 4: return { pos: [-1, 1 - r, c - 1], nor: [-1, 0, 0] }; // L: left column is back
    default: return { pos: [1 - c, 1 - r, -1], nor: [0, 0, -1] }; // B: left column is +x side
  }
}

const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Rotate v by -90 degrees about unit axis k (= clockwise when looking at the face from outside). */
function rotCW(v: V, k: V): V {
  const kxv = cross(k, v);
  const kv = dot(k, v);
  return [-kxv[0] + k[0] * kv, -kxv[1] + k[1] * kv, -kxv[2] + k[2] * kv];
}

export class Sim {
  stickers: Sticker[] = [];

  /** Starts solved, or from an arbitrary 54-char URFDLB facelet string. */
  constructor(initial?: string) {
    for (let i = 0; i < 54; i++) {
      const g = faceletGeometry(i);
      const color = initial ? initial[i] : FACE_LETTERS[Math.floor(i / 9)];
      this.stickers.push({ pos: g.pos, nor: g.nor, color });
    }
  }

  /** One clockwise quarter turn of face index 0..5 (U R F D L B). */
  quarter(face: number): void {
    const k = AXES[face];
    for (const s of this.stickers) {
      if (dot(s.pos, k) === 1) {
        s.pos = rotCW(s.pos, k);
        s.nor = rotCW(s.nor, k);
      }
    }
  }

  /** Apply a notation string like "R U R' U' F2". */
  apply(moves: string): this {
    for (const tok of moves.trim().split(/\s+/).filter(Boolean)) {
      const face = FACE_LETTERS.indexOf(tok[0]);
      if (face < 0) throw new Error(`bad move ${tok}`);
      const suffix = tok.slice(1);
      const n = suffix === '' ? 1 : suffix === '2' ? 2 : suffix === "'" ? 3 : NaN;
      if (Number.isNaN(n)) throw new Error(`bad move ${tok}`);
      for (let i = 0; i < n; i++) this.quarter(face);
    }
    return this;
  }

  /** 54-char URFDLB facelet string of the current state. */
  facelets(): string {
    let out = '';
    for (let i = 0; i < 54; i++) {
      const g = faceletGeometry(i);
      const s = this.stickers.find(
        (st) => st.pos[0] === g.pos[0] && st.pos[1] === g.pos[1] && st.pos[2] === g.pos[2] &&
          st.nor[0] === g.nor[0] && st.nor[1] === g.nor[1] && st.nor[2] === g.nor[2],
      );
      if (!s) throw new Error(`no sticker at facelet ${i}`);
      out += s.color;
    }
    return out;
  }

  isSolved(): boolean {
    const f = this.facelets();
    for (let face = 0; face < 6; face++) {
      for (let i = 1; i < 9; i++) if (f[face * 9 + i] !== f[face * 9]) return false;
    }
    return true;
  }
}

export const ALL_MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];

/** Deterministic PRNG (mulberry32) so test failures are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random scramble with no two consecutive turns of the same face. */
export function randomScramble(length: number, rand: () => number): string {
  const out: string[] = [];
  let last = -1;
  while (out.length < length) {
    const face = Math.floor(rand() * 6);
    if (face === last) continue;
    last = face;
    out.push(ALL_MOVES[face * 3 + Math.floor(rand() * 3)]);
  }
  return out.join(' ');
}

/** A uniformly random legal cube state (NOT built from scrambles). */
export function randomCubie(rand: () => number): Cubie {
  const shuffle = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const parity = (p: number[]) => {
    let inv = 0;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
    return inv & 1;
  };
  const cp = shuffle(8);
  const ep = shuffle(12);
  if (parity(cp) !== parity(ep)) [ep[0], ep[1]] = [ep[1], ep[0]];
  const co = Array.from({ length: 8 }, () => Math.floor(rand() * 3));
  co[7] = (3 - (co.slice(0, 7).reduce((a, b) => a + b, 0) % 3)) % 3;
  const eo = Array.from({ length: 12 }, () => Math.floor(rand() * 2));
  eo[11] = eo.slice(0, 11).reduce((a, b) => a + b, 0) % 2;
  return { cp, co, ep, eo };
}
