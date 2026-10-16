/**
 * Live competitions: which WCA competitions are on right now (or about to start).
 * Uses the official WCA API (https://www.worldcubeassociation.org/api/v0/competitions),
 * which is not officially supported, so every field is read defensively.
 */
const LiveComps = (function () {
  'use strict';

  var API = 'https://www.worldcubeassociation.org/api/v0/competitions';
  var MAX_PAGES = 20, PER_PAGE = 25;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** yyyy-mm-dd for a Date, in the viewer's local time. */
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(str, n) {
    var p = str.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  var isDate = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); };

  /** Read one competition; null if it has no usable id, name or dates. */
  function readComp(c) {
    if (!c || typeof c !== 'object' || !c.id || !c.name || !isDate(c.start_date) || !isDate(c.end_date)) return null;
    return {
      id: String(c.id), name: String(c.name), city: String(c.city || ''), country: String(c.country_iso2 || ''),
      start: c.start_date, end: c.end_date,
      events: Array.isArray(c.event_ids) ? c.event_ids.length : 0,
      limit: typeof c.competitor_limit === 'number' ? c.competitor_limit : null,
      url: typeof c.url === 'string' && /^https:\/\/www\.worldcubeassociation\.org\//.test(c.url) ? c.url : 'https://www.worldcubeassociation.org/competitions/' + encodeURIComponent(String(c.id)),
    };
  }

  /** 'now' = on today, 'soon' = starts within `soonDays` days, else null. */
  function classify(c, today, soonDays) {
    if (c.start <= today && today <= c.end) return 'now';
    if (c.start > today && c.start <= addDays(today, soonDays)) return 'soon';
    return null;
  }

  /** Split raw API rows into { now, soon }, de-duplicated, sorted by start date then name. */
  function sort(rows, today, soonDays) {
    var seen = {}, now = [], soon = [];
    (rows || []).forEach(function (r) {
      var c = readComp(r);
      if (!c || seen[c.id]) return;
      seen[c.id] = 1;
      var k = classify(c, today, soonDays);
      if (k === 'now') now.push(c); else if (k === 'soon') soon.push(c);
    });
    var by = function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0; };
    return { now: now.sort(by), soon: soon.sort(by) };
  }

  function getPage(from, to, page, signal) {
    var url = API + '?start=' + from + '&end=' + to + '&page=' + page;
    return fetch(url, { signal: signal, cache: 'no-cache', headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /** Fetch every competition that starts in the window and sort out which are on. */
  function load(today, soonDays, signal) {
    // A competition lasts at most about a week, so one that is on today started within the last week.
    var from = addDays(today, -7), to = addDays(today, 7 + soonDays);
    var rows = [], page = 1, done = false;
    function batch() {
      if (done || page > MAX_PAGES) return Promise.resolve();
      var pages = []; for (var i = 0; i < 4 && page + i <= MAX_PAGES; i++) pages.push(page + i);
      page += pages.length;
      return Promise.all(pages.map(function (p) { return getPage(from, to, p, signal); })).then(function (res) {
        res.forEach(function (list) {
          if (!Array.isArray(list)) throw new Error('unexpected reply');
          rows = rows.concat(list);
          if (list.length < PER_PAGE) done = true;
        });
        return batch();
      });
    }
    return batch().then(function () { return sort(rows, today, soonDays); }, function (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new Error('Could not load the competition list from the WCA (' + (e && e.message || 'network error') + ').');
    });
  }

  return { dateStr: dateStr, addDays: addDays, readComp: readComp, classify: classify, sort: sort, load: load };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LiveComps;
