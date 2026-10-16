import { Cubie, MOVE_NAMES, FACE_LETTERS, CORNER_COLOR, EDGE_COLOR, applyMoves, parseMoves } from '../cube/cubie';
import { Macro } from './macro';

export type MethodId = 'beginner' | 'cfop';

export interface Stage {
  key: string;
  title: string;
  /** One or two plain sentences. [U] [R] [F] [D] [L] [B] stand for the color of that face. */
  blurb: string;
}

export interface Step {
  stage: string; // Stage.key
  /** The name shown on the step: an algorithm name, or what to do. */
  title: string;
  /** Plain-language note. Same [X] color tokens as Stage.blurb. */
  detail?: string;
  /** 'alg' = a named, memorised algorithm; 'setup' = a quick top-layer turn; 'free' = figured out on the spot. */
  kind: 'alg' | 'setup' | 'free';
  moves: string[];
}

export interface Plan {
  method: MethodId | 'fast';
  stages: Stage[];
  steps: Step[];
  /** Every move in order (same as steps flattened), written for the cube held with `frame.bottom` down. */
  moves: string[];
  length: number;
  /** The same moves on the real faces, for animating the cube as it is. */
  actualMoves: string[];
  /** Which real face is held at the bottom, and what each letter in `moves` means on the real cube. */
  frame: { bottom: string; map: Record<string, string> };
}

export const faceToken = (face: number) => `[${FACE_LETTERS[face]}]`;
/** "[D]-[R]" style label for an edge piece, using the faces of its two stickers. */
export const edgeLabel = (piece: number) => EDGE_COLOR[piece].map(faceToken).join('-');
export const cornerLabel = (piece: number) => CORNER_COLOR[piece].map(faceToken).join('-');

/** Collects steps while keeping a running cube state. */
export class PlanBuilder {
  cube: Cubie;
  steps: Step[] = [];
  constructor(start: Cubie, public stages: Stage[]) { this.cube = start; }

  addMoves(stage: string, title: string, kind: Step['kind'], moveNames: string[], detail?: string) {
    if (!moveNames.length) return;
    this.cube = applyMoves(this.cube, parseMoves(moveNames.join(' ')));
    this.steps.push({ stage, title, kind, moves: moveNames, detail });
  }

  addIndices(stage: string, title: string, kind: Step['kind'], idx: number[], detail?: string) {
    this.addMoves(stage, title, kind, idx.map((m) => MOVE_NAMES[m]), detail);
  }

  addMacros(stage: string, macros: Macro[], detailOf: (m: Macro) => string | undefined) {
    for (const m of macros) {
      if (m.auf) {
        this.addMoves(stage, m.name, 'setup', m.moves, detailOf(m));
      } else {
        const title = m.repeat > 1 ? `${m.name} ×${m.repeat}` : m.name;
        this.addMoves(stage, title, 'alg', m.moves, detailOf(m));
      }
    }
  }

  /** Merge neighbouring plain top-layer turns (U U2 -> U', U U' -> nothing) so no step is wasted. */
  private tidy(): Step[] {
    const net = (s: Step): number | null => {
      if (s.kind !== 'setup') return null;
      let n = 0;
      for (const m of s.moves) {
        if (m === 'U') n += 1; else if (m === 'U2') n += 2; else if (m === "U'") n += 3; else return null;
      }
      return n;
    };
    const out: Step[] = [];
    for (const s of this.steps) {
      const prev = out[out.length - 1];
      const a = prev ? net(prev) : null;
      const b = net(s);
      if (prev && prev.stage === s.stage && a !== null && b !== null) {
        const k = (a + b) % 4;
        out.pop();
        if (k) out.push({ ...s, moves: [k === 1 ? 'U' : k === 2 ? 'U2' : "U'"] });
      } else out.push(s);
    }
    return out;
  }

  build(method: MethodId): Plan {
    this.steps = this.tidy();
    const moves = this.steps.flatMap((s) => s.moves);
    const ident: Record<string, string> = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };
    return { method, stages: this.stages, steps: this.steps, moves, length: moves.length, actualMoves: moves, frame: { bottom: 'D', map: ident } };
  }
}
