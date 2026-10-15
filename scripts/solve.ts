/**
 * CLI for the solver.
 *
 *   npm run solve -- --scramble "R U R' U' F2 D L'"
 *   npm run solve -- --random
 *   npm run solve -- --facelets UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
 *
 * --facelets takes 54 stickers in U R F D L B face order (each face read left-to-right,
 * top-to-bottom). Any six symbols work (e.g. WOGRBY); the center stickers decide which
 * face each symbol is.
 */
import { solveFacelets } from '../src/lib/cube/solver';
import { Sim, rng, randomScramble } from '../tests/sim';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : undefined;
}

let facelets: string;
let scramble: string | undefined;

if (process.argv.includes('--random')) {
  scramble = randomScramble(25, rng(Date.now()));
  facelets = new Sim().apply(scramble).facelets();
  console.log(`Scramble:  ${scramble}`);
} else if (arg('scramble') !== undefined) {
  scramble = arg('scramble')!;
  facelets = new Sim().apply(scramble).facelets();
} else if (arg('facelets') !== undefined) {
  facelets = arg('facelets')!;
} else {
  console.error('Usage: solve --scramble "R U R\' U\'" | --random | --facelets <54 stickers>');
  process.exit(2);
}

const result = solveFacelets(facelets);
if (!result.ok) {
  console.error(`Cannot solve: ${result.message} [${result.code}]`);
  process.exit(1);
}

const verified = new Sim(facelets.length === 54 && /^[URFDLB]+$/.test(facelets) ? facelets : undefined);
console.log(`Solution:  ${result.solution || '(already solved)'}`);
console.log(`Moves:     ${result.length}   Time: ${result.ms.toFixed(0)} ms`);
if (/^[URFDLB]{54}$/.test(facelets)) {
  console.log(`Verified:  ${verified.apply(result.solution).isSolved() ? 'solved on independent simulator' : 'FAILED'}`);
}
