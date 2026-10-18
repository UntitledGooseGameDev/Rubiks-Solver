/**
 * The 4x4 page: paint a 4x4, scramble it, watch it in 3D and solve it.
 * Self-contained: it builds its own 3D cube (96 stickers) and talks to the shared solver bundle.
 * Moves: U R F D L B turn the outer layer, 2R turns the layer under it, Rw (or r) turns both,
 * each with an optional 2 or '.
 */
const FourUI = (function () {
  'use strict';

  var LETTERS = 'URFDLB';
  var SOLVED = 'UUUUUUUUUUUUUUUURRRRRRRRRRRRRRRRFFFFFFFFFFFFFFFFDDDDDDDDDDDDDDDDLLLLLLLLLLLLLLLLBBBBBBBBBBBBBBBB';
  var AXES = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  function rotate(v, k, phi) {
    var c = Math.cos(phi), s = Math.sin(phi), kv = dot(k, v), kxv = cross(k, v);
    return [0, 1, 2].map(function (i) { return v[i] * c + kxv[i] * s + k[i] * kv * (1 - c); });
  }
  function quarterCW(v, k) { var kxv = cross(k, v), kv = dot(k, v); return [0, 1, 2].map(function (i) { return -kxv[i] + k[i] * kv + 0; }); }

  /** Position (cubie coordinates, each -3, -1, 1 or 3) and outward normal of sticker i. */
  function geometry(i) {
    var face = Math.floor(i / 16), r = Math.floor((i % 16) / 4), c = i % 4;
    var k = function (x) { return 2 * x - 3; };
    switch (face) {
      case 0: return { pos: [k(c), 3, k(r)], nor: [0, 1, 0] };
      case 1: return { pos: [3, -k(r), -k(c)], nor: [1, 0, 0] };
      case 2: return { pos: [k(c), -k(r), 3], nor: [0, 0, 1] };
      case 3: return { pos: [k(c), -3, -k(r)], nor: [0, -1, 0] };
      case 4: return { pos: [-3, -k(r), k(c)], nor: [-1, 0, 0] };
      default: return { pos: [-k(c), -k(r), -3], nor: [0, 0, -1] };
    }
  }
  var GEO = [], INDEX = {};
  var key = function (p, n) { return p.join(',') + '|' + n.join(','); };
  for (var gi = 0; gi < 96; gi++) { GEO.push(geometry(gi)); INDEX[key(GEO[gi].pos, GEO[gi].nor)] = gi; }

  // PERMS[face][depth][power-1]
  var PERMS = [];
  for (var face = 0; face < 6; face++) {
    PERMS.push([]);
    for (var depth = 0; depth < 2; depth++) {
      PERMS[face].push([]);
      for (var power = 1; power <= 3; power++) {
        var perm = [];
        for (var i = 0; i < 96; i++) {
          var g = GEO[i];
          if (dot(g.pos, AXES[face]) === 3 - 2 * depth) {
            var p = g.pos, n = g.nor;
            for (var q = 0; q < power; q++) { p = quarterCW(p, AXES[face]); n = quarterCW(n, AXES[face]); }
            perm.push(INDEX[key(p, n)]);
          } else perm.push(i);
        }
        PERMS[face][depth].push(perm);
      }
    }
  }
  /** A move: face 0..5, depths it turns ([0] outer, [1] second layer, [0, 1] both), power 1..3. */
  function applyMove(state, m) {
    var s = state;
    for (var d = 0; d < m.depths.length; d++) {
      var perm = PERMS[m.face][m.depths[d]][m.power - 1], out = new Array(96);
      for (var i = 0; i < 96; i++) out[perm[i]] = s[i];
      s = out.join('');
    }
    return s;
  }
  function applyMoves(state, moves) { var s = state; for (var i = 0; i < moves.length; i++) s = applyMove(s, moves[i]); return s; }
  function moveName(m) {
    var suffix = ['', '2', "'"][m.power - 1], L = LETTERS[m.face];
    if (m.depths.length === 2) return L + 'w' + suffix;
    return (m.depths[0] === 1 ? '2' : '') + L + suffix;
  }
  function parseAlg(text) {
    var out = [], toks = text.trim().split(/\s+/).filter(Boolean);
    for (var t = 0; t < toks.length; t++) {
      var m = /^(2?)([URFDLB])(w?)([123]?)(['’]?)$/i.exec(toks[t]);
      var bad = 'is not a valid move. Use U R F D L B for outer turns, 2R for the layer under, Rw (or r) for both, with an optional 2 or \'.';
      if (!m) throw new Error('"' + toks[t] + '" ' + bad);
      var lower = m[2] === m[2].toLowerCase() && /[a-z]/.test(m[2]);
      var wide = m[3].toLowerCase() === 'w' || lower;
      if (m[1] && wide) throw new Error('"' + toks[t] + '" ' + bad);
      var f = LETTERS.indexOf(m[2].toUpperCase()), pw = m[4] ? parseInt(m[4], 10) : 1;
      if (m[5]) pw = (4 - pw) % 4;
      pw %= 4;
      if (pw) out.push({ face: f, depths: wide ? [0, 1] : [m[1] ? 1 : 0], power: pw });
    }
    return out;
  }
  function scramble(length) {
    var out = [], last = -1, prev = -1;
    while (out.length < length) {
      var f = Math.floor(Math.random() * 6);
      if (f === last || (prev >= 0 && f % 3 === last % 3 && f % 3 === prev % 3)) continue;
      prev = last; last = f;
      out.push({ face: f, depths: Math.random() < 0.4 ? [0, 1] : [0], power: 1 + Math.floor(Math.random() * 3) });
    }
    return out;
  }

  function init(opts) {
    var COLOR = opts.colors, NAMES = opts.names, Solver = opts.solver;
    var $ = function (id) { return document.getElementById(id); };
    var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var state = SOLVED, startState = SOLVED, moves = [], phases = [], idx = 0, playing = false, busy = false, solving = false, speed = 1;
    var paint = 'U', flagged = [], S = 40, rx = -28, ry = -38, drag = null;
    var cubeEl = $('cube4'), stage = $('stage4'), planEl = $('t4Plan');

    // ---- 3D cube: the 56 outside cubies, each with 6 faces (the ones with a sticker get a color) ----
    var faces = [];
    var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
    var C = [-3, -1, 1, 3];
    C.forEach(function (x) { C.forEach(function (y) { C.forEach(function (z) {
      if (Math.abs(x) !== 3 && Math.abs(y) !== 3 && Math.abs(z) !== 3) return; // inside
      NORMALS.forEach(function (n) {
        var idxS = INDEX[key([x, y, z], n)];
        var d = el('div', 'f'); d.dataset.s = idxS === undefined ? '0' : '1';
        cubeEl.appendChild(d);
        faces.push({ el: d, c: [x, y, z], n: n, idx: idxS === undefined ? -1 : idxS });
      });
    }); }); });
    function r5(x) { return Math.round(x * 100000) / 100000; }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    function render(anim) {
      var ax = anim ? AXES[anim.face] : null;
      for (var i = 0; i < faces.length; i++) {
        var f = faces[i], p = f.c, n = f.n;
        if (ax) {
          var h = dot(p, ax);
          if ((h === 3 && anim.depths.indexOf(0) >= 0) || (h === 1 && anim.depths.indexOf(1) >= 0)) { p = rotate(p, ax, anim.phi); n = rotate(n, ax, anim.phi); }
        }
        // a cubie is S wide and its center sits at p * S / 2
        var tx = (p[0] + n[0]) * S / 2, ty = -(p[1] + n[1]) * S / 2, tz = (p[2] + n[2]) * S / 2;
        var nn = [n[0], -n[1], n[2]];
        var ref = Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        var u = norm(cross(ref, nn)), v = cross(nn, u);
        f.el.style.transform = 'matrix3d(' + [r5(u[0]), r5(u[1]), r5(u[2]), 0, r5(v[0]), r5(v[1]), r5(v[2]), 0, r5(nn[0]), r5(nn[1]), r5(nn[2]), 0, r5(tx), r5(ty), r5(tz), 1].join(',') + ')';
      }
    }
    function applyView() { cubeEl.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)'; }
    function paintCube() { for (var i = 0; i < faces.length; i++) if (faces[i].idx >= 0) faces[i].el.style.setProperty('--c', COLOR[state[faces[i].idx]]); }
    function layout() {
      var r = stage.getBoundingClientRect();
      if (!r.width) return; // hidden page
      S = Math.max(24, Math.min(r.width, r.height) / 7.6);
      stage.style.perspective = Math.round(S * 22) + 'px';
      for (var i = 0; i < faces.length; i++) { var st = faces[i].el.style; st.width = st.height = S + 'px'; st.margin = (-S / 2) + 'px 0 0 ' + (-S / 2) + 'px'; }
      render(null);
    }
    window.addEventListener('resize', layout);

    var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    function animateMove(m, ms) {
      return new Promise(function (resolve) {
        var angle = m.power === 1 ? Math.PI / 2 : m.power === 2 ? Math.PI : -Math.PI / 2;
        var dur = reduceMotion ? 120 : ms, t0 = performance.now();
        function done() { state = applyMove(state, m); paintCube(); render(null); paintNet(); resolve(); }
        function frame(now) {
          var t = Math.min(1, (now - t0) / dur);
          render({ face: m.face, depths: m.depths, phi: -angle * ease(t) });
          if (t < 1) requestAnimationFrame(frame); else done();
        }
        requestAnimationFrame(frame);
      });
    }
    var turnMs = function (m) { return (m.power === 2 ? 1.35 : 1) * 420 / speed; };

    stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; stage.classList.add('dragging'); try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      ry += (e.clientX - drag.x) * 0.5; rx -= (e.clientY - drag.y) * 0.5;
      rx = Math.max(-89, Math.min(89, rx)); drag = { x: e.clientX, y: e.clientY }; applyView();
    });
    var endDrag = function () { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

    // ---- net + palette ----
    var netEl = $('net4'), stickerEls = new Array(96);
    ['U', 'L', 'F', 'R', 'B', 'D'].forEach(function (letter) {
      var fi = LETTERS.indexOf(letter), wrap = el('div', 'face four'); wrap.dataset.f = letter;
      for (var k = 0; k < 16; k++) {
        var b = el('button', 'st'); b.type = 'button'; b.dataset.i = fi * 16 + k;
        stickerEls[fi * 16 + k] = b; wrap.appendChild(b);
      }
      netEl.appendChild(wrap);
    });
    netEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.st') : null;
      if (!b || busy || solving) return;
      var i = +b.dataset.i;
      if (state[i] === paint) return;
      state = state.slice(0, i) + paint + state.slice(i + 1);
      clearSolution(); paintCube(); paintNet(); refreshValidity();
    });
    var pal = $('palette4');
    LETTERS.split('').forEach(function (letter) {
      var b = el('button', 'sw', letter); b.type = 'button'; b.style.setProperty('--c', COLOR[letter]);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', NAMES[letter]); b.setAttribute('aria-checked', letter === paint ? 'true' : 'false');
      b.addEventListener('click', function () {
        paint = letter;
        Array.prototype.forEach.call(pal.children, function (c) { c.setAttribute('aria-checked', c === b ? 'true' : 'false'); });
      });
      pal.appendChild(b);
    });
    function paintNet() {
      for (var i = 0; i < 96; i++) {
        stickerEls[i].style.setProperty('--c', COLOR[state[i]]);
        stickerEls[i].classList.toggle('flag', flagged.indexOf(i) >= 0);
        stickerEls[i].setAttribute('aria-label', 'Sticker ' + (i + 1) + ': ' + NAMES[state[i]]);
      }
    }

    function refreshValidity() {
      var r = Solver.parseFour(state), v = $('t4Valid');
      flagged = r.ok ? [] : (r.stickers || []);
      v.classList.toggle('bad', !r.ok);
      v.lastElementChild.textContent = r.ok ? (state === SOLVED ? 'This cube is already solved.' : 'This looks like a possible 4×4.') : r.message;
      paintNet();
      return r;
    }

    // ---- solution + playback ----
    function setStatus(text, bad, spinner) {
      var s = $('t4Status'); s.className = 'status' + (bad ? ' bad' : ''); s.innerHTML = '';
      if (spinner) s.appendChild(el('span', 'spin'));
      s.appendChild(el('span', '', text));
    }
    function clearSolution() { playing = false; moves = []; phases = []; idx = 0; startState = state; planEl.innerHTML = ''; setStatus('', false); updateTransport(); }
    function buildPlan() {
      planEl.innerHTML = '';
      var k = 0;
      phases.forEach(function (ph) {
        if (!ph.moves.length) return;
        planEl.appendChild(el('h3', 'phase', ph.name + ' · ' + ph.moves.length + (ph.moves.length === 1 ? ' move' : ' moves')));
        var box = el('div', 'chipbox');
        ph.moves.forEach(function (m) {
          var b = el('button', 'chip', moveName(m)); b.type = 'button'; b.dataset.i = k;
          b.setAttribute('aria-label', 'Go to after move ' + (k + 1) + ', ' + moveName(m));
          box.appendChild(b); k++;
        });
        planEl.appendChild(box);
      });
    }
    planEl.addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.chip') : null;
      if (c && !busy) gotoStep(+c.dataset.i + 1);
    });
    function updateTransport() {
      var has = moves.length > 0;
      $('t4Restart').disabled = !has || busy || idx === 0;
      $('t4Back').disabled = !has || busy || idx === 0;
      $('t4Next').disabled = !has || busy || idx >= moves.length;
      $('t4Play').disabled = !has;
      var label = playing ? 'Pause' : (has && idx >= moves.length ? 'Replay' : 'Play');
      $('t4Play').title = label; $('t4Play').setAttribute('aria-label', label);
      $('t4PlayIcon').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
      var chips = planEl.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) { chips[i].classList.toggle('done', i < idx); chips[i].classList.toggle('current', i === idx - 1); chips[i].disabled = busy; }
      $('t4Label').textContent = idx > 0 && has ? moveName(moves[idx - 1]) : '';
      $('t4Progress').textContent = has ? (idx >= moves.length ? 'Solved in ' + moves.length + (moves.length === 1 ? ' move' : ' moves') : 'Move ' + (idx + 1) + ' of ' + moves.length + ' · next ' + moveName(moves[idx])) : '';
      $('t4Scramble').disabled = busy || solving; $('t4Reset').disabled = busy || solving; $('t4Solve').disabled = busy || solving;
    }
    function gotoStep(k) { playing = false; state = applyMoves(startState, moves.slice(0, k)); idx = k; paintCube(); render(null); paintNet(); updateTransport(); }
    function stepForward() {
      if (busy || idx >= moves.length) return Promise.resolve();
      busy = true; updateTransport();
      var m = moves[idx];
      return animateMove(m, turnMs(m)).then(function () { idx++; busy = false; updateTransport(); });
    }
    function play() {
      if (!moves.length) return;
      if (idx >= moves.length) gotoStep(0);
      playing = true; updateTransport();
      (function loop() {
        if (!playing) return;
        if (idx >= moves.length) { playing = false; updateTransport(); return; }
        stepForward().then(function () { if (playing) setTimeout(loop, reduceMotion ? 0 : 60 / speed); });
      })();
    }
    function pause() { playing = false; updateTransport(); }
    $('t4Play').addEventListener('click', function () { playing ? pause() : play(); });
    $('t4Next').addEventListener('click', function () { playing = false; stepForward(); });
    $('t4Back').addEventListener('click', function () { if (!busy && idx > 0) gotoStep(idx - 1); });
    $('t4Restart').addEventListener('click', function () { if (!busy) gotoStep(0); });
    $('t4Speed').addEventListener('input', function (e) { speed = +e.target.value; $('t4SpeedOut').textContent = speed.toFixed(1) + '×'; });

    function runMoves(list, ms) {
      busy = true; updateTransport();
      var p = Promise.resolve();
      list.forEach(function (m) { p = p.then(function () { return animateMove(m, ms); }); });
      return p.then(function () { busy = false; updateTransport(); });
    }
    $('t4Scramble').addEventListener('click', function () {
      if (busy || solving) return;
      var list = scramble(40); clearSolution();
      $('t4ScrambleLine').innerHTML = '';
      var b = el('b', '', 'Scramble: '); $('t4ScrambleLine').appendChild(b); $('t4ScrambleLine').appendChild(document.createTextNode(list.map(moveName).join(' ')));
      runMoves(list, 70).then(function () { startState = state; refreshValidity(); updateTransport(); });
    });
    $('t4Reset').addEventListener('click', function () {
      if (busy || solving) return;
      state = SOLVED; clearSolution(); $('t4ScrambleLine').textContent = ''; paintCube(); render(null); refreshValidity();
    });
    $('t4AlgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || solving) return;
      var msg = $('t4AlgMsg'), list;
      try { list = parseAlg($('t4AlgInput').value); } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; return; }
      if (!list.length) { msg.className = 'msg bad'; msg.textContent = 'Type some moves first, like R U Rw’ 2L F2.'; return; }
      msg.className = 'msg'; msg.textContent = ''; clearSolution();
      $('t4ScrambleLine').textContent = 'Applied: ' + list.map(moveName).join(' ');
      runMoves(list, 120).then(function () { startState = state; refreshValidity(); updateTransport(); });
    });
    $('t4Solve').addEventListener('click', function () {
      if (busy || solving) return;
      var v = refreshValidity();
      if (!v.ok) { setStatus((flagged.length ? 'Fix the highlighted stickers first. ' : 'Fix the cube first. ') + v.message, true); return; }
      if (state === SOLVED) { clearSolution(); setStatus('The cube is already solved. Scramble it to see a solution.', false); return; }
      solving = true; clearSolution(); updateTransport(); setStatus('Solving… this can take a few seconds.', false, true);
      var snapshot = state;
      setTimeout(function () {
        var r;
        try { r = Solver.solveFour(snapshot); } catch (err) { r = { ok: false, message: String(err && err.message || err) }; }
        solving = false;
        if (!r.ok) { setStatus(r.message || 'The solver could not finish.', true); updateTransport(); return; }
        startState = snapshot; phases = r.phases.map(function (ph) { return { name: ph.name, moves: parseAlg(ph.moves.join(' ')) }; });
        moves = []; phases.forEach(function (ph) { moves = moves.concat(ph.moves); });
        idx = 0; buildPlan();
        setStatus('Found ' + (/^(8|11|18|8\d)$/.test(String(r.length)) ? 'an ' : 'a ') + r.length + '-move solution in ' + (r.ms / 1000).toFixed(1) + ' s. A 4×4 has no fixed centers, so the colors may end up on different faces than where they started.', false);
        updateTransport();
      }, 40);
    });

    applyView(); paintCube(); paintNet(); refreshValidity(); updateTransport();
    return { pause: pause, layout: layout };
  }

  return { init: init, applyMoves: applyMoves, parseAlg: parseAlg, moveName: moveName, SOLVED: SOLVED };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FourUI;
