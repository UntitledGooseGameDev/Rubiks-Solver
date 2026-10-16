import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Live = require('../web/live.js');

const comp = (id: string, start: string, end: string, extra: object = {}) => ({ id, name: `Comp ${id}`, city: 'X', country_iso2: 'US', start_date: start, end_date: end, event_ids: ['333', '222'], ...extra });

test('addDays works across month and year ends', () => {
  assert.equal(Live.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(Live.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Live.addDays('2026-03-01', -1), '2026-02-28');
});

test('sort: on-now, starting soon, ignores finished, future and unreadable rows; de-duplicates', () => {
  const rows = [
    comp('A', '2026-10-16', '2026-10-16'), // today
    comp('B', '2026-10-15', '2026-10-17'), // spans today
    comp('C', '2026-10-10', '2026-10-12'), // over
    comp('D', '2026-10-17', '2026-10-18'), // soon
    comp('E', '2026-10-25', '2026-10-26'), // too far
    comp('A', '2026-10-16', '2026-10-16'), // duplicate
    { id: 'F', name: 'bad dates', start_date: 'x', end_date: 'y' },
    null,
    comp('G', '2026-10-14', '2026-10-16', { url: 'https://evil.example/x' }),
  ];
  const r = Live.sort(rows, '2026-10-16', 2);
  assert.deepEqual(r.now.map((c: any) => c.id), ['G', 'B', 'A']);
  assert.deepEqual(r.soon.map((c: any) => c.id), ['D']);
  assert.equal(r.now.find((c: any) => c.id === 'G').url, 'https://www.worldcubeassociation.org/competitions/G'); // only official links are used
  assert.equal(r.now[0].events, 2);
});
