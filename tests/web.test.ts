import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identity, applyMoves, parseMoves, cubieToFacelets, SOLVED_FACELETS } from '../src/lib/cube/cubie';
import { solveFacelets } from '../src/lib/cube/solver';
import { rng } from './sim';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const L = require('../web/cubelogic.js');

test('page move logic matches the solver\'s independent cubie model', () => {
  const rand = rng(4242);
  for (let n = 0; n < 300; n++) {
    const moves = L.scramble(1 + Math.floor(rand() * 40), rand);
    const text = moves.map((m: unknown) => L.moveName(m)).join(' ');
    const page = L.applyMoves(L.SOLVED, moves);
    const model = cubieToFacelets(applyMoves(identity(), parseMoves(text)));
    assert.equal(page, model, text);
  }
});

test('page logic: inverse moves undo, solved check, parsing', () => {
  const rand = rng(1);
  const moves = L.scramble(30, rand);
  const scrambled = L.applyMoves(L.SOLVED, moves);
  assert.ok(!L.isSolved(scrambled));
  const undo = [...moves].reverse().map((m: unknown) => L.invertMove(m));
  assert.equal(L.applyMoves(scrambled, undo), SOLVED_FACELETS);
  assert.ok(L.isSolved(SOLVED_FACELETS));
  assert.deepEqual(L.parseAlg("R R' R2 r"), L.parseAlg("R R3 R2 R"));
  assert.throws(() => L.parseAlg('R X'), /not a valid move/);
});

test('page logic works on impossible, user-painted states without throwing', () => {
  const painted = 'R' + SOLVED_FACELETS.slice(1);
  const out = L.applyAlg(painted, "R U F'");
  assert.equal(out.length, 54);
});

test('end to end: page-made scramble -> solver -> page-applied solution is solved', () => {
  const rand = rng(8);
  for (let n = 0; n < 15; n++) {
    const scrambled = L.applyMoves(L.SOLVED, L.scramble(25, rand));
    const r = solveFacelets(scrambled, { timeoutMs: 100 });
    assert.ok(r.ok);
    if (r.ok) assert.ok(L.isSolved(L.applyAlg(scrambled, r.solution)), r.solution);
  }
});

test('renderFaces gives 26 cubies x 6 faces with exactly 54 stickers', () => {
  const faces = L.renderFaces();
  assert.equal(faces.length, 156);
  const stickers = faces.filter((f: { idx: number }) => f.idx >= 0);
  assert.equal(stickers.length, 54);
  assert.equal(new Set(stickers.map((f: { idx: number }) => f.idx)).size, 54);
});

// ---------------------------------------------------------------- site info + built page
import { readFileSync } from 'node:fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Site = require('../web/site-info.js');

test('version number: the page, the update log and package.json agree', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(`${Site.version}.0`, pkg.version, 'package.json version should be the site version plus .0');
  assert.equal(Site.changelog[0].version, Site.version, 'the newest update-log entry is the current version');
  assert.equal(Site.version, '2.0');
});

test('update log: every release has a date, a title and non-empty sections, newest first', () => {
  const versions = new Set<string>();
  let prev = '9999-12-31';
  for (const rel of Site.changelog) {
    assert.match(rel.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(rel.date <= prev, `${rel.version} is out of order`);
    prev = rel.date;
    assert.ok(rel.title && rel.sections.length > 0);
    for (const sec of rel.sections) assert.ok(sec.heading && sec.items.length > 0 && sec.items.every((i: string) => i.length > 0));
    assert.ok(!versions.has(rel.version), 'duplicate version');
    versions.add(rel.version);
  }
});

test('built page: has the three methods, both new pages, and docs/ matches web/', () => {
  const web = readFileSync('web/index.html', 'utf8');
  const docs = readFileSync('docs/index.html', 'utf8');
  assert.equal(docs, web, 'run npm run build:web: docs/index.html is out of date');
  for (const needle of ['data-m="beginner"', 'data-m="cfop"', 'data-m="fast"', 'id="view-troubleshooting"', 'id="view-updates"', 'solveForMethod', 'Niklas']) {
    assert.ok(web.includes(needle), `missing ${needle}`);
  }
  assert.ok(!web.includes('/*__'), 'a build placeholder was left in the page');
});
