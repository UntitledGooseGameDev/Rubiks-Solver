import { PERMS, GEO, CENTERS, WINGS, N_MOVES, moveDepth, composePerm, invMove, isCenter } from './model';
import { WING_WORDS, CENTER_WORDS } from './macros';

/** A short move sequence and what it does to a set of stickers: the sticker at from[k] ends up at to[k]. */
export interface Macro { from: Uint8Array; to: Uint8Array; word: number[]; /** edge locations touched, filled in lazily */ locs?: Int8Array; }

const decodeWords = (s: string): number[][] => s.split(',').map((w) => Array.from(w, (ch) => ch.charCodeAt(0) - 48));

const permOf = (w: number[]) => {
  let p: Uint8Array = Uint8Array.from({ length: 96 }, (_, i) => i);
  for (const m of w) p = composePerm(p, PERMS[m]);
  return p;
};

/** All move sequences of up to two moves from `pool` (no two in a row on the same layer), including the empty one. */
function shortWords(pool: number[]): number[][] {
  const out: number[][] = [[]];
  for (const a of pool) out.push([a]);
  for (const a of pool) for (const b of pool) if (Math.floor(a / 3) !== Math.floor(b / 3)) out.push([a, b]);
  return out;
}

function build(base: number[][], conj: number[][], keep: (i: number) => boolean): Macro[] {
  const conjPerms = conj.map((w) => ({ w, q: permOf(w.slice().reverse().map(invMove)) }));
  const map = new Map<string, Macro>();
  for (const bw of base) {
    const bp = permOf(bw);
    const supp: number[] = [];
    for (let u = 0; u < 96; u++) if (bp[u] !== u && keep(u)) supp.push(u);
    if (!supp.length) continue;
    for (const c of conjPerms) {
      // do c.w, then the macro, then undo c.w: the sticker that ends where the macro read u started at c.q[u]
      const from = new Array<number>(supp.length), to = new Array<number>(supp.length);
      for (let k = 0; k < supp.length; k++) { from[k] = c.q[supp[k]]; to[k] = c.q[bp[supp[k]]]; }
      const key = from.join(',') + '|' + to.join(',');
      const old = map.get(key);
      const len = c.w.length * 2 + bw.length;
      if (!old || old.word.length > len) {
        map.set(key, { from: Uint8Array.from(from), to: Uint8Array.from(to), word: [...c.w, ...bw, ...c.w.slice().reverse().map(invMove)] });
      }
    }
  }
  return [...map.values()];
}
export { build, decodeWords, shortWords, permOf };

export let WING_CONJ = 1;
let wing: Macro[] | null = null;
let center: Macro[] | null = null;

/** Every wing 3-cycle we can build: the searched base sequences, conjugated by up to two outer turns. */
export function wingMacros(): Macro[] {
  if (wing) return wing;
  const outer: number[] = [];
  for (let m = 0; m < N_MOVES; m++) if (moveDepth(m) === 0) outer.push(m);
  wing = build(decodeWords(WING_WORDS), shortWords(outer).filter((w) => w.length <= WING_CONJ), (i) => !isCenter(i));
  return wing;
}

/** Center macros: pure 3-cycles of center stickers, plus short bare turns that do more at once. */
export function centerMacros(): Macro[] {
  if (center) return center;
  const all: number[] = [];
  for (let m = 0; m < N_MOVES; m++) all.push(m);
  const base = decodeWords(CENTER_WORDS);
  for (const a of all) base.push([a]);
  for (const a of all) for (const b of all) if (Math.floor(a / 3) !== Math.floor(b / 3)) base.push([a, b]);
  center = build(base, [[]], isCenter);
  return center;
}
void GEO; void CENTERS; void WINGS; void moveDepth;
