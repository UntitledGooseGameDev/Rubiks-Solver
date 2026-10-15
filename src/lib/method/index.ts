import { parseFacelets, solveFacelets, CubeError } from '../cube';
import { Plan, MethodId, Stage, Step } from './plan';
import { solveBeginner, BEGINNER_STAGES } from './beginner';
import { solveCfop, CFOP_STAGES } from './cfop';

export type { Plan, MethodId, Stage, Step } from './plan';
export { solveBeginner, BEGINNER_STAGES } from './beginner';
export { solveCfop, CFOP_STAGES } from './cfop';
export * as algs from './algs';

export type SolveMethod = 'fast' | MethodId;
export type MethodResult = ({ ok: true; ms: number } & Plan) | CubeError;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const FAST_SINGLE: Stage[] = [
  { key: 'sol', title: 'Shortest solution', blurb: 'The shortest solution the search found. There are no named algorithms here: just the moves.' },
];
const FAST_STAGES: Stage[] = [
  { key: 'p1', title: 'Phase 1', blurb: 'Set the cube up so that only half-turns of the sides (R2, L2, F2, B2) and any turns of the top and bottom are needed to finish.' },
  { key: 'p2', title: 'Phase 2', blurb: 'Finish the cube using only those moves.' },
];

/**
 * Solve a cube (54 stickers, any six symbols) with the chosen method:
 *   'fast'     the shortest two-phase solution, grouped into its two phases
 *   'beginner' layer by layer with named algorithms
 *   'cfop'     Cross, F2L, OLL (two-look), PLL
 */
export function solveForMethod(input: string, method: SolveMethod): MethodResult {
  const parsed = parseFacelets(input);
  if (!parsed.ok) return parsed;
  const t0 = now();
  try {
    if (method === 'beginner') {
      const plan = solveBeginner(parsed.cubie);
      return { ok: true, ms: now() - t0, ...plan };
    }
    if (method === 'cfop') {
      const plan = solveCfop(parsed.cubie);
      return { ok: true, ms: now() - t0, ...plan };
    }
    const r = solveFacelets(input);
    if (!r.ok) return r;
    const p1 = r.moves.slice(0, r.phase1);
    const p2 = r.moves.slice(r.phase1);
    if (!p1.length || !p2.length) {
      const only: Step[] = r.moves.length ? [{ stage: 'sol', title: 'Solution', kind: 'free', moves: r.moves }] : [];
      return { ok: true, ms: r.ms, method: 'fast', stages: FAST_SINGLE, steps: only, moves: r.moves, length: r.length };
    }
    const steps: Step[] = [
      { stage: 'p1', title: 'Phase 1', kind: 'free', moves: p1 },
      { stage: 'p2', title: 'Phase 2', kind: 'free', moves: p2 },
    ];
    return { ok: true, ms: r.ms, method: 'fast', stages: FAST_STAGES, steps, moves: r.moves, length: r.length };
  } catch (err) {
    return { ok: false, code: 'INTERNAL' as never, message: String((err as Error)?.message ?? err) };
  }
}

export const METHOD_STAGES = { beginner: BEGINNER_STAGES, cfop: CFOP_STAGES, fast: FAST_STAGES };
