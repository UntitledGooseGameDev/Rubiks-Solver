/**
 * 4x4x4 ("Revenge") cube solver, by reduction.
 *
 *   1. Centers: get each face's four center stickers to match, using short 3-cycles of center stickers.
 *   2. Edges: pair the 24 wing pieces into 12 whole edges, using 3-cycles of wings.
 *   3. Solve what is left as a 3x3 with the normal solver.
 *
 * Which wings get paired with which can leave the "3x3" impossible (the two parities that only a 4x4 has).
 * Rather than memorize parity algorithms, we solve the centers and edges a few different ways and keep the
 * shortest result whose 3x3 is valid. Every answer is replayed on the model before it is returned.
 *
 * Stickers: 96 symbols, faces in the order U R F D L B, each face read left to right, top to bottom
 * (4 by 4), like the 3x3 layout.
 */
import { CORNER_COLOR, CORNER_FACELET, FACE_LETTERS, parseFacelets } from '../cube/cubie';
import { solveFacelets } from '../cube/solver';
import {
  GEO, WINGS, WING_MATE, State, SOLVED, PERMS, applyMove, applyMoves, isSolved, moveFace, moveDepth, moveTurns,
  parseMoves as parseFourMoves, moveName, FACE_LETTERS as MODEL_LETTERS,
} from './model';
import { solveCenters, pairEdges, toThreeByThree, applyWord } from './reduce';

export { parseFourMoves };

export type FourErrorCode =
  | 'BAD_LENGTH' | 'BAD_COLOR_COUNT' | 'BAD_CORNER' | 'BAD_SCHEME' | 'DUPLICATE_CORNER' | 'CORNER_TWIST'
  | 'BAD_EDGE' | 'UNSOLVABLE';

export interface FourError {
  ok: false;
  code: FourErrorCode;
  message: string;
  /** Sticker indices (0..95) most likely involved. */
  stickers?: number[];
}

export interface FourPhase { name: string; moves: string[]; }
export type FourSolveResult =
  | { ok: true; moves: string[]; solution: string; length: number; ms: number; phases: FourPhase[] }
  | FourError;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const FOUR_SOLVED = 'UUUUUUUUUUUUUUUURRRRRRRRRRRRRRRRFFFFFFFFFFFFFFFFDDDDDDDDDDDDDDDDLLLLLLLLLLLLLLLLBBBBBBBBBBBBBBBB';
export const FOUR_FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

/** 3x3 facelet index -> 4x4 sticker index (only meant for corner stickers). */
const to4 = (i: number) => {
  const f = Math.floor(i / 9), r = Math.floor((i % 9) / 3), c = i % 3;
  return f * 16 + (r === 2 ? 3 : r) * 4 + (c === 2 ? 3 : c);
};
/** For each corner slot, the three 4x4 stickers in clockwise order starting at the U/D one. */
export const FOUR_CORNER_STICKERS: number[][] = CORNER_FACELET.map((tri) => tri.map(to4));

export type FourParse = { ok: true; state: State; facelets: string } | FourError;

/**
 * Read 96 stickers (any six symbols). The down-left-back corner fixes which color is which face
 * (colors opposite each other never share a corner), so the centers do not need to be in place.
 */
export function parseFour(input: string): FourParse {
  const s = Array.from(String(input).replace(/\s+/g, ''));
  if (s.length !== 96) {
    return { ok: false, code: 'BAD_LENGTH', message: `A 4x4 has 96 stickers, but ${s.length} were given.` };
  }
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  if (counts.size !== 6 || [...counts.values()].some((n) => n !== 16)) {
    return {
      ok: false, code: 'BAD_COLOR_COUNT',
      message: counts.size !== 6 ? `A 4x4 uses exactly 6 colors, but ${counts.size} were found.` : 'Every color must appear exactly 16 times.',
    };
  }
  const meets = new Map<string, Set<string>>();
  for (const ch of counts.keys()) meets.set(ch, new Set());
  for (let slot = 0; slot < 8; slot++) {
    const tri = FOUR_CORNER_STICKERS[slot].map((i) => s[i]);
    if (new Set(tri).size !== 3) {
      return { ok: false, code: 'BAD_CORNER', message: 'A corner shows the same color twice, which is impossible. Check the highlighted stickers.', stickers: FOUR_CORNER_STICKERS[slot] };
    }
    for (const a of tri) for (const b of tri) if (a !== b) meets.get(a)!.add(b);
  }
  const opposite = new Map<string, string>();
  for (const [ch, set] of meets) {
    const rest = [...counts.keys()].filter((o) => o !== ch && !set.has(o));
    if (rest.length !== 1) {
      return { ok: false, code: 'BAD_SCHEME', message: 'The colors do not pair up into three opposite pairs, so some stickers must be wrong. Check the corners.' };
    }
    opposite.set(ch, rest[0]);
  }
  for (const [a, b] of opposite) if (opposite.get(b) !== a) {
    return { ok: false, code: 'BAD_SCHEME', message: 'The colors do not pair up into three opposite pairs, so some stickers must be wrong.' };
  }
  const dbl = FOUR_CORNER_STICKERS[6].map((i) => s[i]); // D, B, L
  const faceColors: string[] = [];
  faceColors[3] = dbl[0]; faceColors[5] = dbl[1]; faceColors[4] = dbl[2];
  faceColors[0] = opposite.get(dbl[0])!; faceColors[2] = opposite.get(dbl[1])!; faceColors[1] = opposite.get(dbl[2])!;
  const colorOf: Record<string, number> = {};
  faceColors.forEach((ch, f) => { colorOf[ch] = f; });
  const face = s.map((ch) => colorOf[ch]);

  // corners: a real piece in each slot, none twice, twists adding up
  const seen = new Set<number>();
  let twist = 0;
  for (let slot = 0; slot < 8; slot++) {
    const st = FOUR_CORNER_STICKERS[slot];
    let ori = 0;
    for (; ori < 3; ori++) if (face[st[ori]] === 0 || face[st[ori]] === 3) break;
    if (ori === 3) return { ok: false, code: 'BAD_CORNER', message: 'A corner has no top or bottom color, which is impossible.', stickers: st };
    const c1 = face[st[(ori + 1) % 3]], c2 = face[st[(ori + 2) % 3]];
    const piece = CORNER_COLOR.findIndex((cc) => cc[0] === face[st[ori]] && cc[1] === c1 && cc[2] === c2);
    if (piece < 0) return { ok: false, code: 'BAD_CORNER', message: 'A corner shows a color combination that does not exist on a real 4x4. Check those stickers.', stickers: st };
    if (seen.has(piece)) return { ok: false, code: 'DUPLICATE_CORNER', message: 'The same corner appears twice, so some stickers must be wrong.', stickers: st };
    seen.add(piece);
    twist += ori;
  }
  if (twist % 3 !== 0) {
    return { ok: false, code: 'CORNER_TWIST', message: 'One corner looks twisted in place. That is impossible on a real 4x4, so a sticker is probably wrong.' };
  }
  // wings: every edge (a pair of colors that are not opposite) must show up on exactly two wings
  const edgeSeen = new Map<string, number[]>();
  for (const i of WINGS) {
    const j = WING_MATE[i];
    if (j < i) continue;
    const a = face[i], b = face[j];
    if (a === b || Math.abs(a - b) === 3) {
      return { ok: false, code: 'BAD_EDGE', message: 'An edge piece shows two colors that cannot touch, so one of its stickers is wrong. Check the highlighted stickers.', stickers: [i, j] };
    }
    const key = `${Math.min(a, b)}${Math.max(a, b)}`;
    (edgeSeen.get(key) ?? edgeSeen.set(key, []).get(key)!).push(i, j);
  }
  for (const [key, list] of edgeSeen) {
    if (list.length !== 4) {
      return {
        ok: false, code: 'BAD_EDGE',
        message: `The ${MODEL_LETTERS[+key[0]]}${MODEL_LETTERS[+key[1]]} edge should have exactly two wing pieces, but ${list.length / 2} were found. Check the stickers on edge pieces.`,
        stickers: list,
      };
    }
  }
  return { ok: true, state: Uint8Array.from(face), facelets: face.map((f) => FACE_LETTERS[f]).join('') };
}

// ---------------------------------------------------------------- notation
/** Merge neighbors on the same layer and join "R" + "2R" into "Rw", for people to read. */
export function compressMoves(moves: number[]): string[] {
  // 1. combine consecutive turns of one layer
  const stack: { layer: number; turns: number }[] = [];
  for (const m of moves) {
    const layer = Math.floor(m / 3), turns = (m % 3) + 1;
    const top = stack[stack.length - 1];
    if (top && top.layer === layer) {
      top.turns = (top.turns + turns) % 4;
      if (top.turns === 0) stack.pop();
    } else stack.push({ layer, turns });
  }
  // 2. an outer layer and the layer under it turned the same way is a wide turn
  const out: string[] = [];
  const name = (face: number, turns: number) => ['', '2', "'"][turns - 1] ?? '';
  for (let i = 0; i < stack.length; i++) {
    const a = stack[i], b = stack[i + 1];
    const fa = Math.floor(a.layer / 2);
    if (b && Math.floor(b.layer / 2) === fa && a.layer !== b.layer && a.turns === b.turns) {
      out.push(`${MODEL_LETTERS[fa]}w${name(fa, a.turns)}`);
      i++;
    } else {
      const depth = a.layer % 2;
      out.push(`${depth ? '2' : ''}${MODEL_LETTERS[fa]}${name(fa, a.turns)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the solver
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const colorsMatch = (s: State) => s.every((v, i) => v === SOLVED[i]);

interface Attempt { reduced: State; moves: number[]; phases: { name: string; moves: number[] }[]; }

/** Solve the centers and pair the edges one way; null if that way leaves an impossible 3x3. */
function attempt(start: State, trial: number, seed: number): Attempt | null {
  const rand = mulberry32(seed * 7919 + trial * 104729);
  const s = Uint8Array.from(start);
  const phases: Attempt['phases'] = [];
  const jitter = trial === 0 ? 0 : 0.7;
  const centerMoves: number[] = [];
  if (trial > 0) {
    // Some loose turns first, so this attempt pairs things up differently from the last. Positions that are
    // already almost reduced (a lone flipped edge, say) need a real shake-up: ten slice turns.
    const kick: number[] = [];
    if (trial < 4) kick.push(Math.floor(rand() * 36), Math.floor(rand() * 36));
    else while (kick.length < 10) { const m = Math.floor(rand() * 36); if (moveDepth(m) === 1) kick.push(m); }
    applyWord(s, kick);
    centerMoves.push(...kick);
  }
  const c = solveCenters(s, rand, jitter);
  if (!c) return null;
  centerMoves.push(...c);
  phases.push({ name: 'Centers', moves: centerMoves });
  const e = pairEdges(s, rand, jitter);
  if (!e.done) return null;
  phases.push({ name: 'Edges', moves: e.moves });
  if (!parseFacelets(toThreeByThree(s)).ok) return null;
  return { reduced: s, moves: phases.flatMap((x) => x.moves), phases };
}

// The six colors can be called the six faces in 24 ways (turning the whole cube); the centers
// are free to be in any of them, so start from whichever already has the most centers in place.
const FRAMES: number[][] = (() => {
  const gen = (word: string) => {
    const s = applyMoves(SOLVED, parseFourMoves(word));
    const pi = new Array<number>(6);
    for (let f = 0; f < 6; f++) pi[s[f * 16 + 5]] = f;
    return pi;
  };
  const gens = [gen("R 2R 2L' L'"), gen("U 2U 2D' D'")];
  const key = (p: number[]) => p.join('');
  const all = new Map<string, number[]>([[key([0, 1, 2, 3, 4, 5]), [0, 1, 2, 3, 4, 5]]]);
  let frontier = [[0, 1, 2, 3, 4, 5]];
  while (frontier.length) {
    const next: number[][] = [];
    for (const p of frontier) for (const g of gens) {
      const q = p.map((v) => g[v]);
      if (!all.has(key(q))) { all.set(key(q), q); next.push(q); }
    }
    frontier = next;
  }
  return [...all.values()];
})();

function pickFrame(state: State): State {
  let best = state, bestScore = -1;
  for (const pi of FRAMES) {
    let score = 0;
    for (let f = 0; f < 6; f++) for (const k of [5, 6, 9, 10]) if (pi[state[f * 16 + k]] === f) score++;
    if (score > bestScore) { bestScore = score; best = Uint8Array.from(state, (v) => pi[v]); }
  }
  return best;
}

export function solveFourState(state: State, opts: { maxTrials?: number; wanted?: number; seed?: number; budgetMs?: number } = {}): FourSolveResult {
  const t0 = now();
  const maxTrials = opts.maxTrials ?? 80, wanted = opts.wanted ?? 3, seed = opts.seed ?? 1, budget = opts.budgetMs ?? 2500;
  const start = pickFrame(state);
  const found: Attempt[] = [];
  for (let trial = 0; trial < maxTrials && found.length < wanted; trial++) {
    if (found.length && now() - t0 > budget) break;
    const a = attempt(start, trial, seed);
    if (a) found.push(a);
  }
  found.sort((a, b) => a.moves.length - b.moves.length);
  for (const a of found) {
    const sol = solveFacelets(toThreeByThree(a.reduced), { timeoutMs: 100, maxLength: 24 });
    if (!sol.ok) continue;
    const last = parseFourMoves(sol.moves.join(' '));
    const fin = Uint8Array.from(a.reduced);
    applyWord(fin, last);
    if (!isSolved(fin) || !colorsMatch(fin)) continue;
    const phases = [...a.phases, { name: '3×3 stage', moves: last }].map((p) => ({ name: p.name, moves: compressMoves(p.moves) }));
    const moves = phases.flatMap((p) => p.moves);
    return { ok: true, moves, solution: moves.join(' '), length: moves.length, ms: now() - t0, phases };
  }
  return {
    ok: false, code: 'UNSOLVABLE',
    message: 'This position cannot be solved. It is probably not a real 4x4 position: check the corners and edge pieces, and make sure no center stickers are misread.',
  };
}

export function solveFour(input: string, opts?: Parameters<typeof solveFourState>[1]): FourSolveResult {
  const parsed = parseFour(input);
  if (!parsed.ok) return parsed;
  return solveFourState(parsed.state, opts);
}

/** The 96 stickers (as U R F D L B letters) of a solved cube after the given moves. */
export function scrambleToFacelets(moves: string): string {
  const s = applyMoves(SOLVED, parseFourMoves(moves));
  return Array.from(s, (f) => FACE_LETTERS[f]).join('');
}
void GEO; void PERMS; void applyMove; void moveFace; void moveDepth; void moveTurns; void moveName;
