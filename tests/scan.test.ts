import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoFit, classifyCube, readFaceSamples, rotateGridCW, rotateGrid, gridCenters, srgbToLab, hungarian,
  type Sample, type GridTransform,
} from '../src/lib/scan';
import { solveFacelets } from '../src/lib/cube/solver';
import { Sim, rng, randomScramble } from './sim';
import { renderFace, randomOpts, NOMINAL, type PhotoOpts } from './synth';

const FACE_ORDER = 'URFDLB';

function neutral(over: Partial<PhotoOpts> = {}): PhotoOpts {
  return {
    width: 320, height: 260, cell: 66, angle: 0, dx: 0, dy: 0, tint: [1, 1, 1],
    brightness: 1, gradient: 0, noise: 0, glare: false, skew: 0, bg: 'gray', ...over,
  };
}

/** Scan six synthetic photos of `facelets` end to end: auto-fit, read, classify. */
function scanSynthetic(facelets: string, optsFor: (face: number) => PhotoOpts, rand: () => number) {
  const faces: Sample[][] = [];
  const fits: GridTransform[] = [];
  for (let f = 0; f < 6; f++) {
    const photo = renderFace(facelets.slice(f * 9, f * 9 + 9), optsFor(f), rand);
    const fit = autoFit(photo);
    fits.push(fit.transform);
    faces.push(readFaceSamples(photo, fit.transform));
  }
  return { reading: classifyCube(faces), fits };
}

test('srgbToLab: white, black and red land where expected', () => {
  const w = srgbToLab(255, 255, 255), k = srgbToLab(0, 0, 0), r = srgbToLab(255, 0, 0);
  assert.ok(Math.abs(w[0] - 100) < 0.5 && Math.abs(w[1]) < 0.5 && Math.abs(w[2]) < 0.5);
  assert.ok(Math.abs(k[0]) < 0.5);
  assert.ok(r[1] > 70 && r[2] > 50);
});

test('rotateGridCW: four turns are the identity and one turn moves bottom-left to top-left', () => {
  const g = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  assert.deepEqual(rotateGrid(g, 4), g);
  assert.equal(rotateGridCW(g)[0], 'g');
  assert.deepEqual(rotateGridCW(g), ['g', 'd', 'a', 'h', 'e', 'b', 'i', 'f', 'c']);
  assert.deepEqual(rotateGrid(g, -1), rotateGrid(g, 3));
});

test('hungarian matches brute force on small random matrices', () => {
  const rand = rng(3);
  const perms = (n: number): number[][] =>
    n === 1 ? [[0]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
  for (let t = 0; t < 40; t++) {
    const n = 2 + Math.floor(rand() * 5);
    const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rand() * 20)));
    const a = hungarian(cost);
    assert.equal(new Set(a).size, n);
    const got = a.reduce((s, c, r) => s + cost[r][c], 0);
    const best = Math.min(...perms(n).map((p) => p.reduce((s, c, r) => s + cost[r][c], 0)));
    assert.equal(got, best);
  }
});

test('gridCenters: unrotated, spaced by one cell, rotation turns the grid', () => {
  const c = gridCenters({ cx: 100, cy: 50, size: 90, angle: 0 });
  assert.deepEqual(c[4], [100, 50]);
  assert.deepEqual(c[0], [70, 20]);
  assert.deepEqual(c[8], [130, 80]);
  const r = gridCenters({ cx: 100, cy: 50, size: 90, angle: 90 });
  assert.ok(Math.abs(r[0][0] - 130) < 1e-9 && Math.abs(r[0][1] - 20) < 1e-9);
});

test('clean photos: colors are read exactly', () => {
  const rand = rng(1);
  const facelets = new Sim().apply("R U R' U' F2 D L' B2 U2 R D' F").facelets();
  const { reading } = scanSynthetic(facelets, () => neutral(), rand);
  assert.equal(reading.facelets, facelets);
  assert.deepEqual(reading.similarCenters, []);
});

test('auto-fit finds the grid in a clean photo (position, size, rotation)', () => {
  const rand = rng(2);
  const letters = 'UFRDLBUFR';
  const photo = renderFace(letters, neutral({ angle: 7, dx: 9, dy: -6, cell: 60 }), rand);
  const { transform: t } = autoFit(photo);
  assert.ok(Math.hypot(t.cx - (160 + 9), t.cy - (130 - 6)) < 10, `center ${t.cx},${t.cy}`);
  assert.ok(Math.abs(t.size - 180) < 22, `size ${t.size}`);
  assert.ok(Math.abs(t.angle - 7) < 6, `angle ${t.angle}`);
});

test('a sideways photo is fixed by rotating its reading order', () => {
  const rand = rng(4);
  const facelets = new Sim().apply("F R U' L2 D B' R2").facelets();
  const faces: Sample[][] = [];
  for (let f = 0; f < 6; f++) {
    const quarter = f === 2 ? 1 : 0; // photograph the Front face turned a quarter clockwise
    let letters = facelets.slice(f * 9, f * 9 + 9).split('');
    letters = rotateGridCW(rotateGridCW(rotateGridCW(letters))); // what a clockwise-turned photo shows
    if (quarter === 0) letters = facelets.slice(f * 9, f * 9 + 9).split('');
    const photo = renderFace(letters.join(''), neutral(), rand);
    const fit = autoFit(photo);
    let cells = readFaceSamples(photo, fit.transform);
    if (quarter) cells = rotateGrid(cells, 1);
    faces.push(cells);
  }
  assert.equal(classifyCube(faces).facelets, facelets);
});

test('similar centers are reported (e.g. two photos of the same face)', () => {
  const rand = rng(5);
  const facelets = new Sim().apply("R U R' U'").facelets();
  const faces: Sample[][] = [];
  for (let f = 0; f < 6; f++) {
    const photoOf = f === 3 ? 0 : f; // the "Down" photo is really another photo of Up
    const photo = renderFace(facelets.slice(photoOf * 9, photoOf * 9 + 9), neutral(), rand);
    faces.push(readFaceSamples(photo, autoFit(photo).transform));
  }
  assert.ok(classifyCube(faces).similarCenters.some(([a, b]) => a === 0 && b === 3));
});

/** Run many random cubes through the whole scan pipeline; return the stats. */
function accuracyRun(seed: number, trials: number, severity: number) {
  const rand = rng(seed);
  let exact = 0, solvable = 0, wrongStickers = 0, wrongButFlagged = 0, solvedOk = 0;
  for (let n = 0; n < trials; n++) {
    const scramble = randomScramble(25, rand);
    const truth = new Sim().apply(scramble).facelets();
    const { reading } = scanSynthetic(truth, () => randomOpts(rand, severity), rand);
    if (reading.facelets === truth) exact++;
    for (let i = 0; i < 54; i++) {
      if (reading.facelets[i] !== truth[i]) {
        wrongStickers++;
        if (reading.uncertain.includes(i)) wrongButFlagged++;
      }
    }
    const r = solveFacelets(reading.facelets, { timeoutMs: 20, targetLength: 40 });
    if (r.ok) {
      solvable++;
      if (reading.facelets === truth && new Sim(truth).apply(r.solution).isSolved()) solvedOk++;
    }
  }
  return { trials, exact, solvable, wrongStickers, wrongButFlagged, solvedOk };
}

test('pipeline accuracy on varied synthetic photos (easy and moderate)', () => {
  const easy = accuracyRun(100, 40, 0.15);
  const moderate = accuracyRun(200, 40, 0.5);
  console.log(`# easy:     ${JSON.stringify(easy)}`);
  console.log(`# moderate: ${JSON.stringify(moderate)}`);
  assert.ok(easy.exact >= 38, `easy exact ${easy.exact}/40`);
  assert.ok(moderate.exact >= 34, `moderate exact ${moderate.exact}/40`);
  // every sticker the classifier got wrong should have been marked "check"
  assert.ok(easy.wrongStickers + moderate.wrongStickers === 0 ||
    (easy.wrongButFlagged + moderate.wrongButFlagged) / (easy.wrongStickers + moderate.wrongStickers) >= 0.5);
});

test('nominal colors are all distinct from each other in Lab', () => {
  const letters = Object.keys(NOMINAL);
  for (let a = 0; a < letters.length; a++) for (let b = a + 1; b < letters.length; b++) {
    const la = srgbToLab(...NOMINAL[letters[a]]), lb = srgbToLab(...NOMINAL[letters[b]]);
    assert.ok(Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) > 20, `${letters[a]} vs ${letters[b]}`);
  }
  assert.equal(FACE_ORDER.length, 6);
});
