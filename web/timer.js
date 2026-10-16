/**
 * Speedcubing timer helpers: scrambles, penalties, averages and time formatting.
 * Pure functions only; the page wires them to the keyboard and the screen.
 */
const TimerLogic = (function () {
  'use strict';

  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  var AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  var SUFFIX = ['', '2', "'"];

  /** A random-move scramble: no face twice in a row, and no three turns in a row on one axis. */
  function scramble(rand, length) {
    var n = length || 20, out = [], last = null, prev = null;
    while (out.length < n) {
      var f = FACES[Math.floor(rand() * 6)];
      if (f === last) continue;
      if (prev !== null && last !== null && AXIS[f] === AXIS[last] && AXIS[f] === AXIS[prev]) continue;
      out.push(f + SUFFIX[Math.floor(rand() * 3)]);
      prev = last; last = f;
    }
    return out.join(' ');
  }

  /** What a solve counts as: milliseconds, or Infinity for a DNF. */
  function effective(s) {
    if (!s) return NaN;
    if (s.pen === -1) return Infinity;
    return s.ms + (s.pen === 2 ? 2000 : 0);
  }

  /** 12.34, 1:02.34, 1:02:03.40, or "DNF". Milliseconds are cut (not rounded) to hundredths, like a stopwatch. */
  function format(ms) {
    if (ms === Infinity) return 'DNF';
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return '–';
    var cs = Math.floor(ms / 10);
    var h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    var sec = (h || m ? (s < 10 ? '0' : '') : '') + s + '.' + (c < 10 ? '0' : '') + c;
    return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + sec : m ? m + ':' + sec : sec;
  }
  function formatSolve(s) {
    if (!s) return '–';
    var e = effective(s);
    return e === Infinity ? 'DNF' : format(e) + (s.pen === 2 ? '+' : '');
  }

  /**
   * Average of the last `n` solves the WCA way: drop the fastest and slowest (5%, at least one each),
   * average the rest. More than the dropped number of DNFs makes it a DNF. Needs n solves, else null.
   */
  function averageOf(solves, n) {
    if (solves.length < n) return null;
    var vals = solves.slice(solves.length - n).map(effective).sort(function (a, b) { return a - b; });
    var trim = Math.max(1, Math.ceil(n * 0.05));
    var kept = vals.slice(trim, n - trim);
    var sum = 0;
    for (var i = 0; i < kept.length; i++) { if (kept[i] === Infinity) return Infinity; sum += kept[i]; }
    return sum / kept.length;
  }

  /** The best average of `n` over the whole session, or null. */
  function bestAverageOf(solves, n) {
    var best = null;
    for (var end = n; end <= solves.length; end++) {
      var a = averageOf(solves.slice(0, end), n);
      if (a !== null && (best === null || a < best)) best = a;
    }
    return best;
  }

  /** Mean of all counting solves (DNFs ignored), or null if there are none. */
  function mean(solves) {
    var vals = solves.map(effective).filter(function (v) { return v !== Infinity; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function best(solves) {
    var vals = solves.map(effective).filter(function (v) { return v !== Infinity; });
    return vals.length ? Math.min.apply(null, vals) : null;
  }

  /** Inspection: the penalty for starting after `ms` of inspection. 0 = fine, 2 = +2, -1 = DNF. */
  function inspectionPenalty(ms) { return ms > 17000 ? -1 : ms > 15000 ? 2 : 0; }

  return { scramble: scramble, effective: effective, format: format, formatSolve: formatSolve,
    averageOf: averageOf, bestAverageOf: bestAverageOf, mean: mean, best: best, inspectionPenalty: inspectionPenalty };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TimerLogic;
