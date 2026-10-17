/**
 * Cubie-level Rubik's Cube model + facelet conversion + validation.
 *
 * Facelet string layout (54 chars), the same convention used by Kociemba's
 * two-phase solver:  U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9
 * Each face is read row by row as if you were looking straight at it, with the
 * cube held so that U is on top and F is facing you (for U: B is at the top of
 * the diagram; for D: F is at the top of the diagram).
 */

export const FACE_LETTERS = 'URFDLB';

/** Corner slots / cubies. */
export const C = { URF: 0, UFL: 1, ULB: 2, UBR: 3, DFR: 4, DLF: 5, DBL: 6, DRB: 7 } as const;
/** Edge slots / cubies. */
export const E = {
  UR: 0, UF: 1, UL: 2, UB: 3, DR: 4, DF: 5, DL: 6, DB: 7, FR: 8, FL: 9, BL: 10, BR: 11,
} as const;

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

export interface Cubie {
  /** cp[slot] = which corner cubie sits in this slot */
  cp: number[];
  /** co[slot] = twist (0..2) of the corner in this slot */
  co: number[];
  /** ep[slot] = which edge cubie sits in this slot */
  ep: number[];
  /** eo[slot] = flip (0..1) of the edge in this slot */
  eo: number[];
}

export function identity(): Cubie {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

/** Result of applying `a` first and then `b`. */
export function multiply(a: Cubie, b: Cubie): Cubie {
  const cp = new Array<number>(8);
  const co = new Array<number>(8);
  const ep = new Array<number>(12);
  const eo = new Array<number>(12);
  for (let i = 0; i < 8; i++) {
    cp[i] = a.cp[b.cp[i]];
    co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    ep[i] = a.ep[b.ep[i]];
    eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return { cp, co, ep, eo };
}

const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The six clockwise quarter turns, in face order U R F D L B. */
const BASE_MOVES: Cubie[] = [
  { // U
    cp: [C.UBR, C.URF, C.UFL, C.ULB, C.DFR, C.DLF, C.DBL, C.DRB], co: Z8,
    ep: [E.UB, E.UR, E.UF, E.UL, E.DR, E.DF, E.DL, E.DB, E.FR, E.FL, E.BL, E.BR], eo: Z12,
  },
  { // R
    cp: [C.DFR, C.UFL, C.ULB, C.URF, C.DRB, C.DLF, C.DBL, C.UBR], co: [2, 0, 0, 1, 1, 0, 0, 2],
    ep: [E.FR, E.UF, E.UL, E.UB, E.BR, E.DF, E.DL, E.DB, E.DR, E.FL, E.BL, E.UR], eo: Z12,
  },
  { // F
    cp: [C.UFL, C.DLF, C.ULB, C.UBR, C.URF, C.DFR, C.DBL, C.DRB], co: [1, 2, 0, 0, 2, 1, 0, 0],
    ep: [E.UR, E.FL, E.UL, E.UB, E.DR, E.FR, E.DL, E.DB, E.UF, E.DF, E.BL, E.BR],
    eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  },
  { // D
    cp: [C.URF, C.UFL, C.ULB, C.UBR, C.DLF, C.DBL, C.DRB, C.DFR], co: Z8,
    ep: [E.UR, E.UF, E.UL, E.UB, E.DF, E.DL, E.DB, E.DR, E.FR, E.FL, E.BL, E.BR], eo: Z12,
  },
  { // L
    cp: [C.URF, C.ULB, C.DBL, C.UBR, C.DFR, C.UFL, C.DLF, C.DRB], co: [0, 1, 2, 0, 0, 2, 1, 0],
    ep: [E.UR, E.UF, E.BL, E.UB, E.DR, E.DF, E.FL, E.DB, E.FR, E.UL, E.DL, E.BR], eo: Z12,
  },
  { // B
    cp: [C.URF, C.UFL, C.UBR, C.DRB, C.DFR, C.DLF, C.ULB, C.DBL], co: [0, 0, 1, 2, 0, 0, 2, 1],
    ep: [E.UR, E.UF, E.UL, E.BR, E.DR, E.DF, E.DL, E.BL, E.FR, E.FL, E.UB, E.DB],
    eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
  },
];

/**
 * All 18 moves. Index = face * 3 + (power - 1), face order U R F D L B,
 * i.e. U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'.
 */
export const MOVES: Cubie[] = (() => {
  const all: Cubie[] = [];
  for (const base of BASE_MOVES) {
    const m1 = base;
    const m2 = multiply(m1, base);
    const m3 = multiply(m2, base);
    all.push(m1, m2, m3);
  }
  return all;
})();

export const MOVE_NAMES: string[] = (() => {
  const names: string[] = [];
  for (const f of FACE_LETTERS) names.push(f, f + '2', f + "'");
  return names;
})();

/** Parse "R U R' U' F2" (also accepts R2', R3, lowercase, extra whitespace). */
export function parseMoves(text: string): number[] {
  const out: number[] = [];
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const m = /^([URFDLB])([123]?)(['’]?)$/i.exec(tok);
    if (!m) throw new Error(`Invalid move "${tok}"`);
    const face = FACE_LETTERS.indexOf(m[1].toUpperCase());
    let power = m[2] ? parseInt(m[2], 10) : 1;
    if (m[3]) power = (4 - power) % 4;
    power %= 4;
    if (power === 0) continue;
    out.push(face * 3 + (power - 1));
  }
  return out;
}

export function applyMove(c: Cubie, move: number): Cubie {
  return multiply(c, MOVES[move]);
}

export function applyMoves(c: Cubie, moves: number[]): Cubie {
  let cur = c;
  for (const m of moves) cur = multiply(cur, MOVES[m]);
  return cur;
}

// ---------------------------------------------------------------------------
// Facelet <-> cubie
// ---------------------------------------------------------------------------

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

/** Facelet indices (0..53) of each corner slot, in clockwise order starting at the U/D sticker. */
export const CORNER_FACELET: number[][] = [
  [8, 9, 20],   // URF: U9 R1 F3
  [6, 18, 38],  // UFL: U7 F1 L3
  [0, 36, 47],  // ULB: U1 L1 B3
  [2, 45, 11],  // UBR: U3 B1 R3
  [29, 26, 15], // DFR: D3 F9 R7
  [27, 44, 24], // DLF: D1 L9 F7
  [33, 53, 42], // DBL: D7 B9 L7
  [35, 17, 51], // DRB: D9 R9 B7
];
const EDGE_FACELET: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46],   // UR UF UL UB
  [32, 16], [28, 25], [30, 43], [34, 52], // DR DF DL DB
  [23, 12], [21, 41], [50, 39], [48, 14], // FR FL BL BR
];
export const CORNER_COLOR: number[][] = [
  [U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B],
];
export const EDGE_COLOR: number[][] = [
  [U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R],
];

export const SOLVED_FACELETS =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB';

/** Convert a (valid) cubie cube to a 54-char URFDLB facelet string. */
export function cubieToFacelets(c: Cubie): string {
  const f = new Array<number>(54);
  for (let face = 0; face < 6; face++) for (let i = 0; i < 9; i++) f[face * 9 + i] = face;
  for (let i = 0; i < 8; i++) {
    const j = c.cp[i];
    const ori = c.co[i];
    for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + ori) % 3]] = CORNER_COLOR[j][n];
  }
  for (let i = 0; i < 12; i++) {
    const j = c.ep[i];
    const ori = c.eo[i];
    for (let n = 0; n < 2; n++) f[EDGE_FACELET[i][(n + ori) % 2]] = EDGE_COLOR[j][n];
  }
  return f.map((x) => FACE_LETTERS[x]).join('');
}

export type CubeErrorCode =
  | 'BAD_LENGTH'
  | 'BAD_SYMBOL'
  | 'BAD_CENTERS'
  | 'BAD_COLOR_COUNT'
  | 'UNKNOWN_CORNER'
  | 'UNKNOWN_EDGE'
  | 'DUPLICATE_CORNER'
  | 'DUPLICATE_EDGE'
  | 'CORNER_TWIST'
  | 'EDGE_FLIP'
  | 'PARITY';

export interface CubeError {
  ok: false;
  code: CubeErrorCode;
  message: string;
  /** Facelet indices (0..53) most likely involved, for highlighting in a UI. */
  facelets?: number[];
}

export type ParseResult = { ok: true; cubie: Cubie; facelets: string } | CubeError;

const CENTERS = [4, 13, 22, 31, 40, 49];
const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

/**
 * Normalise a 54-sticker string written with ANY six symbols (e.g. WOGRBY) into
 * URFDLB notation, using the six center stickers to decide which symbol is which face.
 */
export function normalizeFacelets(
  input: string,
): { ok: true; facelets: string } | CubeError {
  const s = input.replace(/\s+/g, '');
  if (s.length !== 54) {
    return { ok: false, code: 'BAD_LENGTH', message: `Expected 54 stickers but got ${s.length}.` };
  }
  const symbols = s.toUpperCase().split('');
  const centerSyms = CENTERS.map((i) => symbols[i]);
  if (new Set(centerSyms).size !== 6) {
    return {
      ok: false,
      code: 'BAD_CENTERS',
      message: 'The six center stickers must all be different colors (each center identifies its face).',
      facelets: CENTERS,
    };
  }
  const toFace = new Map<string, string>();
  centerSyms.forEach((sym, i) => toFace.set(sym, FACE_LETTERS[i]));
  const counts = new Map<string, number>();
  let out = '';
  for (let i = 0; i < 54; i++) {
    const face = toFace.get(symbols[i]);
    if (!face) {
      return {
        ok: false,
        code: 'BAD_SYMBOL',
        message: `Sticker ${i + 1} uses color "${symbols[i]}", which doesn't match any center color.`,
        facelets: [i],
      };
    }
    counts.set(face, (counts.get(face) ?? 0) + 1);
    out += face;
  }
  for (let f = 0; f < 6; f++) {
    const n = counts.get(FACE_LETTERS[f]) ?? 0;
    if (n !== 9) {
      return {
        ok: false,
        code: 'BAD_COLOR_COUNT',
        message: `The ${FACE_NAMES[f]}-center color appears ${n} times; every color must appear exactly 9 times.`,
      };
    }
  }
  return { ok: true, facelets: out };
}

function parity(p: number[]): number {
  let inv = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  return inv & 1;
}

/** Parse + fully validate a facelet string (any six symbols allowed). */
export function parseFacelets(input: string): ParseResult {
  const norm = normalizeFacelets(input);
  if (!norm.ok) return norm;
  const f = norm.facelets.split('').map((ch) => FACE_LETTERS.indexOf(ch));

  const cp = new Array<number>(8).fill(-1);
  const co = new Array<number>(8).fill(0);
  const ep = new Array<number>(12).fill(-1);
  const eo = new Array<number>(12).fill(0);

  for (let i = 0; i < 8; i++) {
    const fac = CORNER_FACELET[i];
    let ori = 0;
    for (ori = 0; ori < 3; ori++) if (f[fac[ori]] === U || f[fac[ori]] === D) break;
    if (ori === 3) {
      return {
        ok: false, code: 'UNKNOWN_CORNER',
        message: `The ${CORNER_NAMES[i]} corner has no Up/Down color, which is impossible.`,
        facelets: fac,
      };
    }
    const col1 = f[fac[(ori + 1) % 3]];
    const col2 = f[fac[(ori + 2) % 3]];
    let found = false;
    for (let j = 0; j < 8; j++) {
      if (col1 === CORNER_COLOR[j][1] && col2 === CORNER_COLOR[j][2]) {
        cp[i] = j;
        co[i] = ori;
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        ok: false, code: 'UNKNOWN_CORNER',
        message: `The ${CORNER_NAMES[i]} corner shows a color combination that doesn't exist on a real cube. Check those three stickers.`,
        facelets: fac,
      };
    }
  }

  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELET[i];
    let found = false;
    for (let j = 0; j < 12; j++) {
      if (f[a] === EDGE_COLOR[j][0] && f[b] === EDGE_COLOR[j][1]) {
        ep[i] = j; eo[i] = 0; found = true; break;
      }
      if (f[a] === EDGE_COLOR[j][1] && f[b] === EDGE_COLOR[j][0]) {
        ep[i] = j; eo[i] = 1; found = true; break;
      }
    }
    if (!found) {
      return {
        ok: false, code: 'UNKNOWN_EDGE',
        message: `The ${EDGE_NAMES[i]} edge shows a color combination that doesn't exist on a real cube. Check those two stickers.`,
        facelets: [a, b],
      };
    }
  }

  const seenC = new Set<number>();
  for (let i = 0; i < 8; i++) {
    if (seenC.has(cp[i])) {
      return {
        ok: false, code: 'DUPLICATE_CORNER',
        message: `The ${CORNER_NAMES[cp[i]]} corner appears more than once; some corner stickers are misread.`,
        facelets: CORNER_FACELET[i],
      };
    }
    seenC.add(cp[i]);
  }
  const seenE = new Set<number>();
  for (let i = 0; i < 12; i++) {
    if (seenE.has(ep[i])) {
      return {
        ok: false, code: 'DUPLICATE_EDGE',
        message: `The ${EDGE_NAMES[ep[i]]} edge appears more than once; some edge stickers are misread.`,
        facelets: EDGE_FACELET[i],
      };
    }
    seenE.add(ep[i]);
  }

  if (co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return {
      ok: false, code: 'CORNER_TWIST',
      message: 'One corner looks twisted in place. This cube state is impossible, so one corner has a misread sticker (or the cube was reassembled incorrectly).',
    };
  }
  if (eo.reduce((a, b) => a + b, 0) % 2 !== 0) {
    return {
      ok: false, code: 'EDGE_FLIP',
      message: 'One edge looks flipped in place. This cube state is impossible, so one edge has swapped stickers (or the cube was reassembled incorrectly).',
    };
  }
  if (parity(cp) !== parity(ep)) {
    return {
      ok: false, code: 'PARITY',
      message: 'Two pieces appear to be swapped, which cannot happen by turning the faces. Re-check the stickers for a swapped pair.',
    };
  }

  return { ok: true, cubie: { cp, co, ep, eo }, facelets: norm.facelets };
}
