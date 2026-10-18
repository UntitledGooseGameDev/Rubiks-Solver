import { GEO, CENTERS, WINGS, WING_MATE, isCenter, isWing, stickerFace, N_MOVES, State, applyMove, PERMS } from './model';
import { Macro, centerMacros, wingMacros } from './macros-lib';

/** Sticker values are face indices 0..5 after the color scheme is applied. */

export const centerTarget = (i: number) => stickerFace(i);
export const countCentersRight = (s: State) => CENTERS.reduce((n, i) => n + (s[i] === stickerFace(i) ? 1 : 0), 0);

function applyMacro(s: State, m: Macro): void {
  const tmp = Array.from(m.from, (i) => s[i]);
  for (let k = 0; k < m.from.length; k++) s[m.to[k]] = tmp[k];
}
export function applyWord(s: State, w: number[]): void {
  for (const m of w) { const t = applyMove(s, m); s.set(t); }
}

// ---------------------------------------------------------------- centers
export function solveCenters(s: State, rand: () => number, jitter = 0): number[] | null {
  const macros = centerMacros();
  const out: number[] = [];
  let guard = 0;
  while (countCentersRight(s) < 24) {
    if (++guard > 400) return null;
    let best: Macro | null = null, bestScore = 0;
    for (const m of macros) {
      let d = 0;
      for (let k = 0; k < m.from.length; k++) {
        const t = stickerFace(m.to[k]);
        d += (s[m.from[k]] === t ? 1 : 0) - (s[m.to[k]] === t ? 1 : 0);
      }
      if (d <= 0) continue;
      const sc = d - 0.06 * m.word.length + (jitter ? rand() * jitter : 0);
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    if (!best) {
      // stuck: shake things up with a random macro and try again
      best = macros[Math.floor(rand() * macros.length)];
    }
    // a center macro only lists the center stickers it moves; run the whole sequence so the wings follow too
    applyWord(s, best.word);
    out.push(...best.word);
  }
  return out;
}

// ---------------------------------------------------------------- edges
/** The 12 edge locations; for each, [aFirst, aSecond, bFirst, bSecond]: wing a's two stickers and wing b's, faces matching. */
export const LOCS: number[][] = [];
const LOC_OF = new Int8Array(96).fill(-1);
(() => {
  const done = new Set<number>();
  for (const i of WINGS) {
    if (done.has(i)) continue;
    const gi = GEO[i];
    // all four stickers on the same two faces at this position pair
    const posKey = (g: typeof gi) => g.pos.join(',');
    const a1 = i, a2 = WING_MATE[i];
    // the other wing at the same edge: shares both normals
    const others = WINGS.filter((j) => j !== a1 && j !== a2 && GEO[j].nor.join() === gi.nor.join()
      && GEO[WING_MATE[j]].nor.join() === GEO[a2].nor.join());
    // the partner must be the same edge: two wings sit on one edge when they touch the same two faces and are adjacent
    const b1 = others.find((j) => {
      const d = GEO[j].pos.map((v, k) => Math.abs(v - gi.pos[k])).reduce((x, y) => x + y, 0);
      return d === 2;
    })!;
    const b2 = WING_MATE[b1];
    const loc = LOCS.length;
    LOCS.push([a1, a2, b1, b2]);
    for (const x of [a1, a2, b1, b2]) { done.add(x); LOC_OF[x] = loc; }
    void posKey;
  }
})();

export const locPaired = (s: State, l: number) => {
  const q = LOCS[l];
  return s[q[0]] === s[q[2]] && s[q[1]] === s[q[3]] ? 1 : 0;
};
export const countPaired = (s: State) => { let n = 0; for (let l = 0; l < LOCS.length; l++) n += locPaired(s, l); return n; };

const LOCQ = Int16Array.from(LOCS.flat());
const locPairedFast = (s: State, l: number) => {
  const o = l * 4;
  return s[LOCQ[o]] === s[LOCQ[o + 2]] && s[LOCQ[o + 1]] === s[LOCQ[o + 3]] ? 1 : 0;
};
function locsOf(m: Macro): Int8Array {
  if (!m.locs) {
    const set = new Set<number>();
    for (let k = 0; k < m.from.length; k++) { set.add(LOC_OF[m.from[k]]); set.add(LOC_OF[m.to[k]]); }
    m.locs = Int8Array.from(set);
  }
  return m.locs;
}

/** How many more edges are paired if the macro is applied (negative if it unpairs some). */
function pairDelta(s: State, m: Macro, scratch: Uint8Array): number {
  const ls = m.locs ?? locsOf(m);
  let before = 0;
  for (let i = 0; i < ls.length; i++) before += locPairedFast(s, ls[i]);
  const n = m.from.length;
  for (let k = 0; k < n; k++) scratch[k] = s[m.from[k]];
  for (let k = 0; k < n; k++) s[m.to[k]] = scratch[k];
  let after = 0;
  for (let i = 0; i < ls.length; i++) after += locPairedFast(s, ls[i]);
  // the stickers a macro writes to are the ones it reads from, so this puts everything back
  for (let k = 0; k < n; k++) s[m.from[k]] = scratch[k];
  return after - before;
}

/** Pair up the wings with 3-cycles. Returns the moves used, and whether every edge ended up paired. */
export function pairEdges(s: State, rand: () => number, jitter = 0): { moves: number[]; done: boolean } {
  const macros = wingMacros();
  const scratch = new Uint8Array(16);
  const out: number[] = [];
  let stuck = 0;
  for (let guard = 0; guard < 200 && countPaired(s) < 12; guard++) {
    let best: Macro | null = null, bestScore = 0;
    for (const m of macros) {
      const d = pairDelta(s, m, scratch);
      if (d <= 0) continue;
      const sc = d - 0.02 * m.word.length + (jitter ? rand() * jitter : 0);
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    if (!best) {
      // no single step helps: look for two steps that help together (the first may unpair something)
      const pair = bestPair(s, macros, scratch);
      if (!pair) {
        if (++stuck > 12) return { moves: out, done: false };
        best = macros[Math.floor(rand() * macros.length)];
      } else {
        for (const m of pair) { applyWord(s, m.word); out.push(...m.word); }
        continue;
      }
    }
    applyWord(s, best.word);
    out.push(...best.word);
  }
  return { moves: out, done: countPaired(s) === 12 };
}

let bySticker: Int32Array[] | null = null;
function stickerIndex(macros: Macro[]): Int32Array[] {
  if (bySticker) return bySticker;
  const lists: number[][] = Array.from({ length: 96 }, () => []);
  macros.forEach((m, mi) => { for (const f of m.from) lists[f].push(mi); });
  bySticker = lists.map((l) => Int32Array.from(l));
  return bySticker;
}

/**
 * When no single 3-cycle helps, look for two that do together (the first may unpair something).
 * The first must move at least two unpaired wings; the second must move one that is still unpaired.
 */
function bestPair(s: State, macros: Macro[], scratch: Uint8Array): Macro[] | null {
  const idx = stickerIndex(macros);
  const badStickers: number[] = [];
  for (let l = 0; l < LOCS.length; l++) if (!locPaired(s, l)) badStickers.push(...LOCS[l]);
  const hits = new Map<number, number>();
  for (const b of badStickers) for (const mi of idx[b]) hits.set(mi, (hits.get(mi) ?? 0) + 1);
  let best: Macro[] | null = null, bestScore = 0;
  const first: Macro[] = [];
  for (const [mi, n] of hits) if (n >= 4) first.push(macros[mi]); // at least two of the unpaired wings
  first.sort((a, b) => a.word.length - b.word.length);
  for (const m1 of first.slice(0, 60)) {
    const d1 = pairDelta(s, m1, scratch);
    const saved = Array.from(m1.from, (i) => s[i]);
    for (let k = 0; k < m1.from.length; k++) s[m1.to[k]] = saved[k];
    let b0 = -1;
    for (let l = 0; l < LOCS.length && b0 < 0; l++) if (!locPaired(s, l)) b0 = LOCS[l][0];
    if (b0 >= 0) {
      for (const mj of idx[b0]) {
        const m2 = macros[mj];
        const total = d1 + pairDelta(s, m2, scratch);
        if (total <= 0) continue;
        const sc = total - 0.02 * (m1.word.length + m2.word.length);
        if (sc > bestScore) { bestScore = sc; best = [m1, m2]; }
      }
    }
    for (let k = 0; k < m1.from.length; k++) s[m1.from[k]] = saved[k];
  }
  return best;
}

// ---------------------------------------------------------------- hand over to the 3x3 solver
const FACE_LETTERS = 'URFDLB';
/** The 54 stickers of the 3x3 hiding inside a reduced 4x4 (every edge paired, every center face solid). */
export function toThreeByThree(s: State): string {
  const out: string[] = [];
  const at = [0, 1, 3]; // 3x3 index 0,1,2 -> 4x4 index 0, (1 or 2), 3
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      out.push(FACE_LETTERS[s[f * 16 + at[r] * 4 + at[c]]]);
    }
  }
  return out.join('');
}
