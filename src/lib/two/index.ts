/**
 * 2x2x2 ("pocket") cube solver.
 *
 * A 2x2 is the corners of a 3x3. Turning U, R and F never moves the down-left-back
 * corner, so holding that corner still leaves 7! * 3^6 = 3,674,160 positions, and
 * every one of them is solvable in at most 11 moves of U, R and F. We build a table
 * of the distance of every position from solved (breadth-first search, about a second,
 * once), then solve any cube by always stepping to a neighbor that is one closer.
 * The result is a shortest solution (counting a half turn as one move).
 *
 * Stickers: 24 symbols, faces in the order U R F D L B, each face read left to right,
 * top to bottom, like the 3x3 layout but with 2 by 2 stickers per face.
 */
import { Cubie, MOVES, MOVE_NAMES, CORNER_COLOR, CORNER_FACELET, FACE_LETTERS, identity, multiply } from '../cube/cubie';

export type TwoErrorCode =
  | 'BAD_LENGTH' | 'BAD_COLOR_COUNT' | 'BAD_CORNER' | 'BAD_SCHEME' | 'DUPLICATE_CORNER' | 'CORNER_TWIST';

export interface TwoError {
  ok: false;
  code: TwoErrorCode;
  message: string;
  /** Sticker indices (0..23) most likely involved. */
  stickers?: number[];
}

export type TwoSolveResult =
  | { ok: true; moves: string[]; solution: string; length: number; ms: number }
  | TwoError;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 3x3 facelet index of a corner sticker -> 2x2 sticker index. */
const to2 = (i: number) => Math.floor(i / 9) * 4 + (((i % 9) / 3) | 0) / 2 * 2 + (i % 3) / 2;
/** For each corner slot, the three 2x2 stickers in clockwise order starting at the U/D one. */
export const TWO_CORNER_STICKERS: number[][] = CORNER_FACELET.map((tri) => tri.map(to2));

const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

/** The 2x2 sticker string of the solved cube. */
export const TWO_SOLVED = 'UUUURRRRFFFFDDDDLLLLBBBB';

/** Convert a Cubie (only the corners matter) to 24 stickers. */
export function cubieToTwoFacelets(c: Cubie): string {
  const out = new Array<string>(24).fill('?');
  for (let slot = 0; slot < 8; slot++) {
    const piece = c.cp[slot], ori = c.co[slot];
    for (let n = 0; n < 3; n++) out[TWO_CORNER_STICKERS[slot][(n + ori) % 3]] = FACE_LETTERS[CORNER_COLOR[piece][n]];
  }
  return out.join('');
}

export type TwoParse = { ok: true; cubie: Cubie; facelets: string } | TwoError;

/**
 * Read 24 stickers (any six symbols). The down-left-back corner fixes which color is
 * which face; colors opposite each other never share a corner, so the other three faces follow.
 */
export function parseTwo(input: string): TwoParse {
  const s = Array.from(String(input).replace(/\s+/g, ''));
  if (s.length !== 24) {
    return { ok: false, code: 'BAD_LENGTH', message: `A 2x2 has 24 stickers, but ${s.length} were given.` };
  }
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  if (counts.size !== 6 || [...counts.values()].some((n) => n !== 4)) {
    return {
      ok: false, code: 'BAD_COLOR_COUNT',
      message: counts.size !== 6
        ? `A 2x2 uses exactly 6 colors, but ${counts.size} were found.`
        : 'Every color must appear exactly 4 times.',
    };
  }
  // colors that share a corner can't be opposite faces
  const meets = new Map<string, Set<string>>();
  for (const ch of counts.keys()) meets.set(ch, new Set());
  for (let slot = 0; slot < 8; slot++) {
    const tri = TWO_CORNER_STICKERS[slot].map((i) => s[i]);
    if (new Set(tri).size !== 3) {
      return {
        ok: false, code: 'BAD_CORNER',
        message: 'A corner shows the same color twice, which is impossible. Check the highlighted stickers.',
        stickers: TWO_CORNER_STICKERS[slot],
      };
    }
    for (const a of tri) for (const b of tri) if (a !== b) meets.get(a)!.add(b);
  }
  const opposite = new Map<string, string>();
  for (const [ch, set] of meets) {
    const rest = [...counts.keys()].filter((o) => o !== ch && !set.has(o));
    if (rest.length !== 1) {
      return {
        ok: false, code: 'BAD_SCHEME',
        message: 'The colors do not pair up into three opposite pairs, so some stickers must be wrong. Check the corners.',
      };
    }
    opposite.set(ch, rest[0]);
  }
  for (const [a, b] of opposite) if (opposite.get(b) !== a) {
    return { ok: false, code: 'BAD_SCHEME', message: 'The colors do not pair up into three opposite pairs, so some stickers must be wrong.' };
  }
  // the DBL corner's three stickers are the D, B, L faces' colors (in the cubie model: D sticker, B sticker, L sticker)
  const dbl = TWO_CORNER_STICKERS[6].map((i) => s[i]); // order: D, B, L
  const colorOf: Record<string, number> = {};
  const faceColors: string[] = [];
  faceColors[3] = dbl[0]; faceColors[5] = dbl[1]; faceColors[4] = dbl[2];
  faceColors[0] = opposite.get(dbl[0])!; faceColors[2] = opposite.get(dbl[1])!; faceColors[1] = opposite.get(dbl[2])!;
  faceColors.forEach((ch, f) => { colorOf[ch] = f; });
  const face = s.map((ch) => colorOf[ch]);

  const cp = new Array<number>(8).fill(-1);
  const co = new Array<number>(8).fill(0);
  for (let slot = 0; slot < 8; slot++) {
    const st = TWO_CORNER_STICKERS[slot];
    let ori = 0;
    for (; ori < 3; ori++) if (face[st[ori]] === 0 || face[st[ori]] === 3) break;
    if (ori === 3) {
      return { ok: false, code: 'BAD_CORNER', message: 'A corner has no top or bottom color, which is impossible.', stickers: st };
    }
    const c1 = face[st[(ori + 1) % 3]], c2 = face[st[(ori + 2) % 3]];
    const piece = CORNER_COLOR.findIndex((cc) => cc[1] === c1 && cc[2] === c2 && (cc[0] === face[st[ori]]));
    if (piece < 0) {
      return { ok: false, code: 'BAD_CORNER', message: 'A corner shows a color combination that does not exist on a real 2x2. Check those stickers.', stickers: st };
    }
    cp[slot] = piece; co[slot] = ori;
  }
  const seen = new Set<number>();
  for (let slot = 0; slot < 8; slot++) {
    if (seen.has(cp[slot])) {
      return { ok: false, code: 'DUPLICATE_CORNER', message: 'The same corner appears twice, so some stickers must be wrong.', stickers: TWO_CORNER_STICKERS[slot] };
    }
    seen.add(cp[slot]);
  }
  if (co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return { ok: false, code: 'CORNER_TWIST', message: 'One corner looks twisted in place. That is impossible on a real 2x2, so a sticker is probably wrong (or a corner was put back twisted).' };
  }
  const cubie: Cubie = { ...identity(), cp, co };
  return { ok: true, cubie, facelets: face.map((f) => FACE_LETTERS[f]).join('') };
}

// ---------------------------------------------------------------- distance table
const SLOTS = [0, 1, 2, 3, 4, 5, 7]; // the corner slots that U, R, F can move (DBL = 6 stays put)
const SLOT_INDEX: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6 };
const N_PERM = 5040, N_TWIST = 729, N_MOVES = 9; // moves 0..8 = U U2 U' R R2 R' F F2 F'

const FACT = [1, 1, 2, 6, 24, 120, 720];
function rankPerm(p: number[]): number { // p: permutation of 0..6
  let r = 0;
  for (let i = 0; i < 7; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 7; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[6 - i];
  }
  return r;
}
function unrankPerm(r: number): number[] {
  const avail = [0, 1, 2, 3, 4, 5, 6], out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const f = FACT[6 - i], k = Math.floor(r / f);
    r %= f;
    out.push(avail.splice(k, 1)[0]);
  }
  return out;
}
function twistIndex(co7: number[]): number { // first six twists, base 3 (the seventh follows)
  let t = 0;
  for (let i = 0; i < 6; i++) t = t * 3 + co7[i];
  return t;
}
function twistFromIndex(t: number): number[] {
  const co = new Array<number>(7).fill(0);
  let sum = 0;
  for (let i = 5; i >= 0; i--) { co[i] = t % 3; t = Math.floor(t / 3); sum += co[i]; }
  co[6] = (3 - (sum % 3)) % 3;
  return co;
}

interface Tables { permMove: Uint16Array; twistMove: Uint16Array; dist: Int8Array }
let tables: Tables | null = null;

function build(): Tables {
  const permMove = new Uint16Array(N_PERM * N_MOVES);
  const twistMove = new Uint16Array(N_TWIST * N_MOVES);
  for (let m = 0; m < N_MOVES; m++) {
    const mv = MOVES[m];
    for (let r = 0; r < N_PERM; r++) {
      const p = unrankPerm(r);
      const cp = [0, 1, 2, 3, 4, 5, 6, 7];
      SLOTS.forEach((slot, i) => { cp[slot] = SLOTS[p[i]]; });
      const out = multiply({ ...identity(), cp }, mv);
      permMove[r * N_MOVES + m] = rankPerm(SLOTS.map((slot) => SLOT_INDEX[out.cp[slot]]));
    }
    for (let t = 0; t < N_TWIST; t++) {
      const co7 = twistFromIndex(t);
      const co = new Array<number>(8).fill(0);
      SLOTS.forEach((slot, i) => { co[slot] = co7[i]; });
      const out = multiply({ ...identity(), co }, mv);
      twistMove[t * N_MOVES + m] = twistIndex(SLOTS.map((slot) => out.co[slot]));
    }
  }
  const dist = new Int8Array(N_PERM * N_TWIST).fill(-1);
  const queue = new Int32Array(N_PERM * N_TWIST);
  let head = 0, tail = 0;
  dist[0] = 0; queue[tail++] = 0; // solved: identity permutation (rank 0), no twist (index 0)
  while (head < tail) {
    const s = queue[head++];
    const p = Math.floor(s / N_TWIST), t = s % N_TWIST, d = dist[s] + 1;
    for (let m = 0; m < N_MOVES; m++) {
      const n = permMove[p * N_MOVES + m] * N_TWIST + twistMove[t * N_MOVES + m];
      if (dist[n] < 0) { dist[n] = d; queue[tail++] = n; }
    }
  }
  return { permMove, twistMove, dist };
}

/** Build the distance table now (it is built on first use otherwise). Returns how long it took in ms. */
export function prepareTwo(): number {
  if (tables) return 0;
  const t0 = now();
  tables = build();
  return now() - t0;
}

/** A shortest solution as move indices (0..8 = U U2 U' R R2 R' F F2 F'), found by walking down the table. */
export function solveTwoCubie(c: Cubie): number[] {
  if (c.cp[6] !== 6 || c.co[6] !== 0) {
    // The down-left-back corner is not where it belongs: the parse step only builds cubies where it is.
    throw new Error('The down-left-back corner must be the reference corner.');
  }
  prepareTwo();
  const T = tables!;
  let p = rankPerm(SLOTS.map((slot) => SLOT_INDEX[c.cp[slot]]));
  let t = twistIndex(SLOTS.map((slot) => c.co[slot]));
  const path: number[] = [];
  let d = T.dist[p * N_TWIST + t];
  if (d < 0) throw new Error('2x2 position not reachable.');
  while (d > 0) {
    let moved = false;
    for (let m = 0; m < N_MOVES; m++) {
      const np = T.permMove[p * N_MOVES + m], nt = T.twistMove[t * N_MOVES + m];
      if (T.dist[np * N_TWIST + nt] === d - 1) { path.push(m); p = np; t = nt; d--; moved = true; break; }
    }
    if (!moved) throw new Error('2x2 table is inconsistent.');
  }
  return path;
}

/** Solve a 2x2 given as 24 stickers. */
export function solveTwo(input: string): TwoSolveResult {
  const parsed = parseTwo(input);
  if (!parsed.ok) return parsed;
  const t0 = now();
  const moves = solveTwoCubie(parsed.cubie).map((m) => MOVE_NAMES[m]);
  return { ok: true, moves, solution: moves.join(' '), length: moves.length, ms: now() - t0 };
}

export { FACE_NAMES as TWO_FACE_NAMES };

/** How many positions are at each distance from solved (index = distance). For tests and curiosity. */
export function twoDistanceCounts(): number[] {
  prepareTwo();
  const counts: number[] = [];
  for (const d of tables!.dist) counts[d] = (counts[d] ?? 0) + 1;
  return counts;
}
