/**
 * Piece tracking for the human-method solvers.
 *
 * Instead of moving a whole cubie cube around inside a search, we follow a few
 * individual pieces. A corner's state is slot*3 + twist (0..23); an edge's state
 * is slot*2 + flip (0..23). Turning a face maps each state to a new state, so a
 * search step is just a few table lookups.
 */
import { Cubie, MOVES } from '../cube/cubie';

/** NEXT_C[move*24 + state] = state of a corner after that move. */
export const NEXT_C = new Uint8Array(18 * 24);
/** NEXT_E[move*24 + state] = state of an edge after that move. */
export const NEXT_E = new Uint8Array(18 * 24);

for (let m = 0; m < 18; m++) {
  const mv = MOVES[m];
  for (let i = 0; i < 8; i++) {
    const from = mv.cp[i]; // the corner now in slot i came from slot `from`
    for (let o = 0; o < 3; o++) NEXT_C[m * 24 + from * 3 + o] = i * 3 + ((o + mv.co[i]) % 3);
  }
  for (let i = 0; i < 12; i++) {
    const from = mv.ep[i];
    for (let o = 0; o < 2; o++) NEXT_E[m * 24 + from * 2 + o] = i * 2 + ((o + mv.eo[i]) % 2);
  }
}

export const cornerState = (c: Cubie, piece: number): number => {
  for (let s = 0; s < 8; s++) if (c.cp[s] === piece) return s * 3 + c.co[s];
  throw new Error('corner not found');
};
export const edgeState = (c: Cubie, piece: number): number => {
  for (let s = 0; s < 12; s++) if (c.ep[s] === piece) return s * 2 + c.eo[s];
  throw new Error('edge not found');
};
export const cornerHome = (c: Cubie, piece: number): boolean => c.cp[piece] === piece && c.co[piece] === 0;
export const edgeHome = (c: Cubie, piece: number): boolean => c.ep[piece] === piece && c.eo[piece] === 0;

/** All three turns of each listed face, e.g. faces [0,1] (U,R) -> 6 moves. */
export function movesOfFaces(faces: number[]): number[] {
  const out: number[] = [];
  for (const f of faces) out.push(f * 3, f * 3 + 1, f * 3 + 2);
  return out;
}
export const ALL_MOVE_IDS: number[] = movesOfFaces([0, 1, 2, 3, 4, 5]);

// ---------------------------------------------------------------- pruning tables
const tableCache = new Map<string, Uint8Array>();

function nextOf(kind: 'c' | 'e'): Uint8Array {
  return kind === 'c' ? NEXT_C : NEXT_E;
}
const homeState = (kind: 'c' | 'e', piece: number) => (kind === 'c' ? piece * 3 : piece * 2);

/** Distance (in moves from `moves`) of one piece from home, for all 24 states. 255 = unreachable. */
function singleTable(kind: 'c' | 'e', piece: number, moves: number[], target?: number): Uint8Array {
  const key = `s${kind}${piece}:${target ?? 'h'}:${moves.join(',')}`;
  let t = tableCache.get(key);
  if (t) return t;
  t = new Uint8Array(24).fill(255);
  const next = nextOf(kind);
  const start = target ?? homeState(kind, piece);
  t[start] = 0;
  let frontier = [start];
  for (let d = 1; frontier.length; d++) {
    const nf: number[] = [];
    for (const s of frontier) for (const m of moves) {
      const n = next[m * 24 + s];
      if (t[n] === 255) { t[n] = d; nf.push(n); }
    }
    frontier = nf;
  }
  tableCache.set(key, t);
  return t;
}

/** Distance for two pieces solved together: index = stateA * 24 + stateB. */
function pairTable(ka: 'c' | 'e', pa: number, kb: 'c' | 'e', pb: number, moves: number[], ta?: number, tb?: number): Uint8Array {
  const key = `p${ka}${pa}${kb}${pb}:${ta ?? 'h'}:${tb ?? 'h'}:${moves.join(',')}`;
  let t = tableCache.get(key);
  if (t) return t;
  t = new Uint8Array(576).fill(255);
  const na = nextOf(ka), nb = nextOf(kb);
  const start = (ta ?? homeState(ka, pa)) * 24 + (tb ?? homeState(kb, pb));
  t[start] = 0;
  let frontier = [start];
  for (let d = 1; frontier.length; d++) {
    const nf: number[] = [];
    for (const s of frontier) {
      const a = (s / 24) | 0, b = s % 24;
      for (const m of moves) {
        const n = na[m * 24 + a] * 24 + nb[m * 24 + b];
        if (t[n] === 255) { t[n] = d; nf.push(n); }
      }
    }
    frontier = nf;
  }
  tableCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- tracked IDA*
export interface Tracked {
  /** Corner pieces (0..7) that must end at home. */
  corners: number[];
  /** Edge pieces (0..11) that must end at home. */
  edges: number[];
  /**
   * Pairs of pieces to use for stronger pruning, as indices into [...corners, ...edges].
   * Every piece also gets a single-piece table automatically.
   */
  pairs: [number, number][];
  /** Optional goal states (slot*3+twist or slot*2+flip) for [...corners, ...edges]; default is home. */
  targets?: number[];
}

export interface SearchLimits {
  maxDepth: number;
  /** Give up (return null) after visiting this many nodes. */
  maxNodes: number;
}

/**
 * IDA* that finds a shortest sequence of `moves` bringing every tracked piece home.
 * Returns null if nothing is found within the limits.
 */
export function trackedSearch(
  cube: Cubie, tr: Tracked, moves: number[], limits: SearchLimits,
): number[] | null {
  const nC = tr.corners.length;
  const n = nC + tr.edges.length;
  const kinds: ('c' | 'e')[] = [];
  const pieces: number[] = [];
  const st0 = new Uint8Array(n);
  tr.corners.forEach((p, i) => { kinds.push('c'); pieces.push(p); st0[i] = cornerState(cube, p); });
  tr.edges.forEach((p, i) => { kinds.push('e'); pieces.push(p); st0[nC + i] = edgeState(cube, p); });

  const singles = pieces.map((p, i) => singleTable(kinds[i], p, moves, tr.targets?.[i]));
  const pairTabs = tr.pairs.map(([a, b]) => pairTable(kinds[a], pieces[a], kinds[b], pieces[b], moves, tr.targets?.[a], tr.targets?.[b]));
  const nextArr = kinds.map((k) => nextOf(k));

  const heur = (st: Uint8Array): number => {
    let h = 0;
    for (let i = 0; i < n; i++) { const v = singles[i][st[i]]; if (v > h) h = v; }
    for (let k = 0; k < pairTabs.length; k++) {
      const v = pairTabs[k][st[tr.pairs[k][0]] * 24 + st[tr.pairs[k][1]]];
      if (v > h) h = v;
    }
    return h;
  };

  const h0 = heur(st0);
  if (h0 === 0) return [];
  if (h0 === 255) return null;

  const stack: Uint8Array[] = [];
  for (let d = 0; d <= limits.maxDepth + 1; d++) stack.push(new Uint8Array(n));
  const path: number[] = new Array(limits.maxDepth + 1).fill(0);
  let nodes = 0;
  let aborted = false;
  const nm = moves.length;

  const dfs = (g: number, limit: number, lastFace: number): boolean => {
    const cur = stack[g], nxt = stack[g + 1];
    for (let j = 0; j < nm; j++) {
      const m = moves[j];
      const face = (m / 3) | 0;
      if (face === lastFace) continue;
      if (lastFace >= 0 && face % 3 === lastFace % 3 && face < lastFace) continue;
      if (++nodes > limits.maxNodes) { aborted = true; return false; }
      for (let i = 0; i < n; i++) nxt[i] = nextArr[i][m * 24 + cur[i]];
      const h = heur(nxt);
      if (h === 0) { path[g] = m; path.length = g + 1; return true; }
      if (g + 1 + h > limit) continue;
      path[g] = m;
      if (dfs(g + 1, limit, face)) return true;
      if (aborted) return false;
    }
    return false;
  };

  stack[0].set(st0);
  for (let limit = h0; limit <= limits.maxDepth; limit++) {
    if (dfs(0, limit, -1)) return path.slice(0, path.length);
    if (aborted) return null;
  }
  return null;
}
