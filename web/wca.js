/**
 * WCA Top 100 leaderboard (runs in the browser).
 *
 * Data comes from the unofficial WCA REST API, which publishes the official WCA
 * results export as static JSON files, refreshed once a day:
 *   api/rank/{region}/{type}/{event}.json
 * This file only fetches and reads that data; nothing is stored or made up.
 * Field names are read defensively so a small change in the API's shape does not
 * silently show wrong numbers: anything unreadable becomes a clear error.
 */
const WcaBoard = (function () {
  'use strict';

  var BASES = [
    'https://wca-rest-api.robiningelbrecht.be/api/',
    'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master/api/',
  ];

  var EVENTS = [
    { id: '333', name: '3x3x3 Cube' }, { id: '222', name: '2x2x2 Cube' }, { id: '444', name: '4x4x4 Cube' },
    { id: '555', name: '5x5x5 Cube' }, { id: '666', name: '6x6x6 Cube' }, { id: '777', name: '7x7x7 Cube' },
    { id: '333bf', name: '3x3x3 Blindfolded' }, { id: '333oh', name: '3x3x3 One-Handed' },
    { id: 'clock', name: 'Clock' }, { id: 'minx', name: 'Megaminx' }, { id: 'pyram', name: 'Pyraminx' },
    { id: 'skewb', name: 'Skewb' }, { id: 'sq1', name: 'Square-1' },
    { id: '444bf', name: '4x4x4 Blindfolded' }, { id: '555bf', name: '5x5x5 Blindfolded' },
  ];
  var NO_AVERAGE = { '333bf': 0, '444bf': 0, '555bf': 0 }; // blindfold events: only single is offered here

  /** Centiseconds -> "9.42", "1:02.37", "1:02:03.40". */
  function formatTime(cs) {
    if (typeof cs !== 'number' || !isFinite(cs) || cs <= 0) return '';
    var total = Math.round(cs);
    var h = Math.floor(total / 360000), m = Math.floor((total % 360000) / 6000);
    var s = Math.floor((total % 6000) / 100), c = total % 100;
    var sec = (h || m ? (s < 10 ? '0' : '') : '') + s + '.' + (c < 10 ? '0' : '') + c;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + sec : m ? m + ':' + sec : sec;
  }

  function num(v) { var n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; }
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) { var v = o[keys[i]]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; }

  /** Read one ranking entry; returns null if it has no usable id or time. */
  function readItem(it, index) {
    if (!it || typeof it !== 'object') return null;
    var person = it.person && typeof it.person === 'object' ? it.person : {};
    var id = pick(it, ['personId', 'wcaId', 'person_id']) || person.id || person.wcaId || (typeof it.id === 'string' && /^\d{4}[A-Z]{4}\d{2}$/.test(it.id) ? it.id : undefined);
    var best = num(pick(it, ['best', 'result', 'value', 'time']));
    if (!id || best === null || best <= 0) return null;
    var rank = it.rank;
    var worldRank = rank && typeof rank === 'object' ? num(rank.world) : num(rank);
    return {
      id: String(id),
      name: pick(it, ['personName', 'name']) || person.name || '',
      country: String(pick(it, ['countryId', 'country', 'personCountryId']) || person.countryId || (person.country && person.country.id) || ''),
      best: best,
      rank: worldRank,
      order: index,
    };
  }

  /** Turn the API's JSON into the top `limit` rows, fastest first, with ties sharing a rank. */
  function parseRanking(json, limit) {
    var list = Array.isArray(json) ? json : json && Array.isArray(json.items) ? json.items : null;
    if (!list) throw new Error('The ranking file is not in the expected format.');
    var rows = [];
    for (var i = 0; i < list.length; i++) { var r = readItem(list[i], i); if (r) rows.push(r); }
    if (!rows.length) throw new Error('The ranking file has no readable results.');
    rows.sort(function (a, b) { return a.best - b.best || a.order - b.order; });
    rows = rows.slice(0, limit || 100);
    for (var k = 0; k < rows.length; k++) rows[k].rank = k > 0 && rows[k].best === rows[k - 1].best ? rows[k - 1].rank : k + 1;
    return rows;
  }

  function getJSON(url, signal) {
    return fetch(url, { signal: signal, cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /** Try each data source in turn. */
  function fetchFirst(path, signal) {
    var errors = [];
    return BASES.reduce(function (p, base) {
      return p.catch(function () { return getJSON(base + path, signal); });
    }, Promise.reject(new Error('start'))).catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('Could not load the WCA data (' + (e && e.message || 'network error') + ').');
    });
  }

  /** Fill in names for rows whose ranking entry had none, a few at a time. */
  function fillNames(rows, signal, onProgress) {
    var todo = rows.filter(function (r) { return !r.name || !r.country; });
    var next = 0;
    function worker() {
      if (next >= todo.length) return Promise.resolve();
      var row = todo[next++];
      return fetchFirst('persons/' + row.id + '.json', signal).then(function (p) {
        row.name = row.name || p.name || (p.person && p.person.name) || row.id;
        row.country = row.country || (p.country && (p.country.id || p.country)) || p.countryId || '';
      }, function (e) { if (e && e.name === 'AbortError') throw e; row.name = row.name || row.id; }).then(function () { onProgress && onProgress(); return worker(); });
    }
    var ws = []; for (var i = 0; i < 8; i++) ws.push(worker());
    return Promise.all(ws);
  }

  function load(eventId, type, signal, onNames) {
    return fetchFirst('rank/world/' + type + '/' + eventId + '.json', signal).then(function (json) {
      var rows = parseRanking(json, 100);
      return fillNames(rows, signal, onNames).then(function () { return rows; });
    });
  }

  return { EVENTS: EVENTS, NO_AVERAGE: NO_AVERAGE, formatTime: formatTime, parseRanking: parseRanking, load: load };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WcaBoard;
