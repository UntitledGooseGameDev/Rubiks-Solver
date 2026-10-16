import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { rng } from './sim';
const require = createRequire(import.meta.url);
const T = require('../web/timer.js');

const S = (ms: number, pen = 0) => ({ ms, pen });

test('format: stopwatch style, cut to hundredths', () => {
  assert.equal(T.format(0), '0.00');
  assert.equal(T.format(9429), '9.42');
  assert.equal(T.format(62379), '1:02.37');
  assert.equal(T.format(60050), '1:00.05');
  assert.equal(T.format(3723400), '1:02:03.40');
  assert.equal(T.format(Infinity), 'DNF');
  assert.equal(T.formatSolve(S(10000, 2)), '12.00+');
  assert.equal(T.formatSolve(S(10000, -1)), 'DNF');
});

test('scramble: 20 turns, no repeated face, no three on one axis, deterministic per seed', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sc = T.scramble(rng(seed), 20).split(' ');
    assert.equal(sc.length, 20);
    sc.forEach((m: string, i: number) => {
      assert.match(m, /^[URFDLB](2|')?$/);
      if (i) assert.notEqual(m[0], sc[i - 1][0]);
    });
    const axis: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
    for (let i = 2; i < sc.length; i++) assert.ok(!(axis[sc[i][0]] === axis[sc[i - 1][0]] && axis[sc[i][0]] === axis[sc[i - 2][0]]));
  }
  assert.equal(T.scramble(rng(5), 20), T.scramble(rng(5), 20));
});

test('averages: WCA trimming, DNF rules, best-of-session', () => {
  const five = [S(10000), S(9000), S(12000), S(11000), S(8000)];
  assert.equal(T.averageOf(five, 5), 10000); // drops 8000 and 12000: (9000+10000+11000)/3
  assert.equal(T.averageOf(five.slice(0, 4), 5), null);
  // one DNF is dropped as the worst; two DNFs make the average a DNF
  assert.equal(T.averageOf([S(10000), S(9000), S(12000), S(11000), S(1, -1)], 5), 11000);
  assert.equal(T.averageOf([S(10000), S(9000), S(12000), S(1, -1), S(1, -1)], 5), Infinity);
  // +2 counts as two seconds more
  assert.equal(T.averageOf([S(10000), S(10000), S(10000), S(10000, 2), S(10000)], 5), 10000);
  assert.equal(T.bestAverageOf([...five, S(5000), S(5000), S(5000)], 5), 6000);
  assert.equal(T.mean([S(1000), S(3000), S(1, -1)]), 2000);
  assert.equal(T.best([S(3000), S(1000, 2), S(1, -1)]), 3000);
  assert.equal(T.mean([S(1, -1)]), null);
});

test('inspection penalties', () => {
  assert.equal(T.inspectionPenalty(14999), 0);
  assert.equal(T.inspectionPenalty(15001), 2);
  assert.equal(T.inspectionPenalty(17001), -1);
});
