/**
 * Two-phase (Kociemba-style) Rubik's Cube solver.
 *
 *  Phase 1: IDA* over all 18 moves until corner twist, edge flip and the
 *           middle-slice edge positions are solved (cube is in G1).
 *  Phase 2: IDA* over the 10 G1 moves until the cube is fully solved.
 *
 * The first solution is usually found within a few milliseconds and is then
 * improved until `targetLength` is reached or `timeoutMs` elapses.
 */
import {
  Cubie, MOVES, MOVE_NAMES, multiply, parseFacelets, CubeError, SOLVED_FACELETS,
} from './cubie';
import {
  getTables, twistOf, flipOf, sliceOf, cornerPermOf, udEdgePermOf, slicePermOf, G1_MOVES,
} from './coords';

export interface SolveOptions {
  /**
   * Stop as soon as a solution this short (or shorter) is found. Default 0 (off).
   *
   * Leave this off unless you need speed over quality: the first solution the
   * search finds is not necessarily short for easy cubes (a single R turn can
   * first come back as an 8-move solution). With it off, the search ends when
   * every shorter depth has been exhausted (instant for easy cubes) or when
   * `timeoutMs` expires (hard cubes).
   */
  targetLength?: number;
  /** After the first solution is found, keep improving for at most this many ms. Default 1000. */
  timeoutMs?: number;
  /** Never return solutions longer than this (searches until found). Default 30. */
  maxLength?: number;
  /** Give up (throw) if no solution at all has been found after this many ms. Default: never. */
  giveUpMs?: number;
}

export type SolveResult =
  | { ok: true; moves: string[]; solution: string; length: number; ms: number; phase1: number }
  | CubeError;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Search {
  private readonly T = getTables();
  private readonly path1: number[] = new Array(40).fill(0);
  private readonly path2: number[] = new Array(40).fill(0);
  private nodes = 0;
  private deadline = Infinity;
  private hardDeadline = Infinity;
  private timedOut = false;

  bestLen: number;
  best: number[] | null = null;
  /** Length of the phase-1 part of `best`. */
  bestPhase1 = 0;

  constructor(
    private readonly start: Cubie,
    private readonly targetLength: number,
    private readonly timeoutMs: number,
    maxLength: number,
    giveUpMs = Infinity,
  ) {
    this.bestLen = maxLength + 1; // a solution must be strictly shorter than this
    if (giveUpMs !== Infinity) this.hardDeadline = now() + giveUpMs;
  }

  run(): number[] | null {
    const twist = twistOf(this.start);
    const flip = flipOf(this.start);
    const slice = sliceOf(this.start);
    // A new solution must be strictly shorter than bestLen, so once the phase-1
    // depth reaches bestLen nothing shorter can exist in this search order.
    for (let limit = 0; limit < this.bestLen; limit++) {
      if (this.dfs1(twist, flip, slice, 0, limit, -1)) break;
      if ((this.best && now() > this.deadline) || this.timedOut || now() > this.hardDeadline) break;
    }
    return this.best;
  }

  private checkTime(): void {
    if ((++this.nodes & 0x3fff) === 0) {
      const t = now();
      if ((this.best && t > this.deadline) || t > this.hardDeadline) this.timedOut = true;
    }
  }

  private dfs1(
    twist: number, flip: number, slice: number, g: number, limit: number, lastFace: number,
  ): boolean {
    if (g === limit) {
      if (twist === 0 && flip === 0 && slice === 0) return this.tryPhase2(g, lastFace);
      return false;
    }
    const T = this.T;
    for (let face = 0; face < 6; face++) {
      if (face === lastFace) continue;
      if (lastFace >= 0 && face % 3 === lastFace % 3 && face < lastFace) continue;
      for (let k = 0; k < 3; k++) {
        const m = face * 3 + k;
        const nt = T.twistMove[twist * 18 + m];
        const nf = T.flipMove[flip * 18 + m];
        const ns = T.sliceMove[slice * 18 + m];
        const h1 = T.pruneSliceTwist[ns * 2187 + nt];
        const h2 = T.pruneSliceFlip[ns * 2048 + nf];
        if (g + 1 + (h1 > h2 ? h1 : h2) > limit) continue;
        this.path1[g] = m;
        if (this.dfs1(nt, nf, ns, g + 1, limit, face)) return true;
        this.checkTime();
        if (this.timedOut) return true;
      }
    }
    return false;
  }

  /** Called with a complete phase-1 path of length d1. Returns true to abort the whole search. */
  private tryPhase2(d1: number, lastFace: number): boolean {
    let c = this.start;
    for (let i = 0; i < d1; i++) c = multiply(c, MOVES[this.path1[i]]);

    const cp = cornerPermOf(c);
    const ep = udEdgePermOf(c);
    const sp = slicePermOf(c);
    const T = this.T;
    const h = Math.max(T.pruneCornerSlice[cp * 24 + sp], T.pruneUdEdgeSlice[ep * 24 + sp]);
    const maxD2 = Math.min(18, this.bestLen - 1 - d1);

    for (let lim = h; lim <= maxD2; lim++) {
      if (this.dfs2(cp, ep, sp, 0, lim, lastFace)) {
        this.best = [...this.path1.slice(0, d1), ...this.path2.slice(0, lim)];
        this.bestLen = this.best.length;
        this.bestPhase1 = d1;
        if (this.deadline === Infinity) this.deadline = now() + this.timeoutMs;
        return this.bestLen <= this.targetLength;
      }
    }
    return false;
  }

  private dfs2(
    cp: number, ep: number, sp: number, g: number, limit: number, lastFace: number,
  ): boolean {
    if (g === limit) return cp === 0 && ep === 0 && sp === 0;
    const T = this.T;
    for (let j = 0; j < G1_MOVES.length; j++) {
      const m = G1_MOVES[j];
      const face = (m / 3) | 0;
      if (face === lastFace) continue;
      if (lastFace >= 0 && face % 3 === lastFace % 3 && face < lastFace) continue;
      const ncp = T.cornerPermMove[cp * 10 + j];
      const nep = T.udEdgePermMove[ep * 10 + j];
      const nsp = T.slicePermMove[sp * 10 + j];
      const h1 = T.pruneCornerSlice[ncp * 24 + nsp];
      const h2 = T.pruneUdEdgeSlice[nep * 24 + nsp];
      if (g + 1 + (h1 > h2 ? h1 : h2) > limit) continue;
      this.path2[g] = m;
      if (this.dfs2(ncp, nep, nsp, g + 1, limit, face)) return true;
    }
    return false;
  }
}

/** Solve an already-validated cubie cube. Returns move indices (see MOVES). */
export function solveCubie(
  cubie: Cubie, options: SolveOptions = {},
): number[] {
  return solveCubieDetailed(cubie, options).moves;
}

/** Like solveCubie, but also reports how many of the moves belong to phase 1. */
export function solveCubieDetailed(
  cubie: Cubie, options: SolveOptions = {},
): { moves: number[]; phase1: number } {
  const search = new Search(
    cubie,
    options.targetLength ?? 0,
    options.timeoutMs ?? 1000,
    options.maxLength ?? 30,
    options.giveUpMs,
  );
  const sol = search.run();
  if (!sol) throw new Error('No solution found within maxLength; try a larger maxLength.');
  return { moves: sol, phase1: search.bestPhase1 };
}

/**
 * Solve a cube given as 54 stickers. Any six symbols may be used (e.g. "WOGRBY");
 * the center stickers define which face each symbol belongs to.
 */
export function solveFacelets(input: string, options: SolveOptions = {}): SolveResult {
  const parsed = parseFacelets(input);
  if (!parsed.ok) return parsed;
  const t0 = now();
  if (parsed.facelets === SOLVED_FACELETS) {
    return { ok: true, moves: [], solution: '', length: 0, ms: 0, phase1: 0 };
  }
  const found = solveCubieDetailed(parsed.cubie, options);
  const moves = found.moves.map((m) => MOVE_NAMES[m]);
  return { ok: true, moves, solution: moves.join(' '), length: moves.length, ms: now() - t0, phase1: found.phase1 };
}
