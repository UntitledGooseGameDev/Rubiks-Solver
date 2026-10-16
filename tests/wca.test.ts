import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Wca = require('../web/wca.js');

test('formatTime: centiseconds to the WCA style', () => {
  assert.equal(Wca.formatTime(342), '3.42');
  assert.equal(Wca.formatTime(5), '0.05');
  assert.equal(Wca.formatTime(6237), '1:02.37');
  assert.equal(Wca.formatTime(6005), '1:00.05');
  assert.equal(Wca.formatTime(372340), '1:02:03.40');
  assert.equal(Wca.formatTime(0), '');
  assert.equal(Wca.formatTime(NaN), '');
});

test('parseRanking: sorts, caps at 100, shares ranks on ties and skips unreadable rows', () => {
  const items = [];
  for (let i = 0; i < 150; i++) items.push({ personId: `2020TEST${String(i % 100).padStart(2, '0')}`, personName: `P${i}`, countryId: 'US', best: 400 + i });
  items.push({ personId: '2019BEST01', personName: 'Best', countryId: 'FR', best: 300 });
  items.push({ personId: '2019TIE001', personName: 'Tie', countryId: 'FR', best: 300 });
  items.push({ nothing: true });
  items.push({ personId: '2018BADD01', best: -1 });
  const rows = Wca.parseRanking({ pagination: { page: 1 }, total: 153, items: items.reverse() }, 100);
  assert.equal(rows.length, 100);
  assert.deepEqual(rows.slice(0, 3).map((r: any) => [r.rank, r.best]), [[1, 300], [1, 300], [3, 400]]);
  assert.ok(rows.every((r: any, i: number) => i === 0 || rows[i - 1].best <= r.best));
});

test('parseRanking: accepts nested person objects and a bare array, rejects other shapes', () => {
  const rows = Wca.parseRanking([{ person: { id: '2015ABCD01', name: 'A B', countryId: 'DE' }, result: 512, rank: { world: 4 } }], 100);
  assert.equal(rows[0].id, '2015ABCD01');
  assert.equal(rows[0].name, 'A B');
  assert.equal(rows[0].country, 'DE');
  assert.throws(() => Wca.parseRanking({ hello: 1 }, 100), /expected format/);
  assert.throws(() => Wca.parseRanking({ items: [{ foo: 1 }] }, 100), /no readable/);
});
