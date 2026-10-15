/**
 * Macro search: find the fewest named algorithms (plus turns of the top layer)
 * that reach a goal. Used for every step of the Beginner method and for OLL/PLL.
 */
import { Cubie, multiply, parseMoves, MOVE_NAMES } from '../cube/cubie';
import { Alg, algCubie } from './algs';

export interface Macro {
  id: string;
  name: string;
  /** Move names, e.g. ["R","U","R'","U'"]. */
  moves: string[];
  cube: Cubie;
  /** A plain turn of the top layer (U, U2, U'): used to line things up, never twice in a row. */
  auf: boolean;
  /** How many times the base algorithm is repeated (for display, e.g. Righty x3). */
  repeat: number;
}

export function makeMacro(alg: Alg, repeat = 1, auf = false): Macro {
  const idx = parseMoves(alg.moves);
  const all: number[] = [];
  for (let i = 0; i < repeat; i++) all.push(...idx);
  let cube = algCubie('');
  for (const m of all) cube = multiply(cube, algCubie(MOVE_NAMES[m]));
  return {
    id: repeat > 1 ? `${alg.id}x${repeat}` : alg.id,
    name: alg.name,
    moves: all.map((m) => MOVE_NAMES[m]),
    cube,
    auf,
    repeat,
  };
}

export const AUF_MACROS: Macro[] = ['U', 'U2', "U'"].map((m) =>
  makeMacro({ id: `auf-${m}`, name: 'Turn the top layer', moves: m }, 1, true),
);

/**
 * Iterative deepening over macros. Returns the sequence that reaches `goal` with the
 * fewest macros (ties: fewest moves), or null if none exists within maxDepth.
 */
export function macroSearch(
  start: Cubie, macros: Macro[], goal: (c: Cubie) => boolean, maxDepth: number,
): Macro[] | null {
  if (goal(start)) return [];
  for (let depth = 1; depth <= maxDepth; depth++) {
    let best: Macro[] | null = null;
    let bestMoves = Infinity;
    const seq: Macro[] = [];
    const rec = (c: Cubie, left: number, lastAuf: boolean, moves: number) => {
      if (left === 0) {
        if (moves < bestMoves && goal(c)) { best = seq.slice(); bestMoves = moves; }
        return;
      }
      for (const m of macros) {
        if (m.auf && lastAuf) continue;
        seq.push(m);
        rec(multiply(c, m.cube), left - 1, m.auf, moves + m.moves.length);
        seq.pop();
      }
    };
    rec(start, depth, false, 0);
    if (best) return best;
  }
  return null;
}
