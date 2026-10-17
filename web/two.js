/**
 * The 2x2 page: paint a 2x2, scramble it, watch it in 3D and solve it.
 * Self-contained: it builds its own 3D cube (24 stickers) and talks to the shared solver bundle.
 * Moves are U R F D L B with an optional 2 or ', just like the 3x3 page.
 */
const TwoUI = (function () {
  'use strict';

  var LETTERS = 'URFDLB';
  var SOLVED = 'UUUURRRRFFFFDDDDLLLLBBBB';
  var AXES = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  function rotate(v, k, phi) {
    var c = Math.cos(phi), s = Math.sin(phi), kv = dot(k, v), kxv = cross(k, v);
    return [0, 1, 2].map(function (i) { return v[i] * c + kxv[i] * s + k[i] * kv * (1 - c); });
  }
  function quarterCW(v, k) { var kxv = cross(k, v), kv = dot(k, v); return [0, 1, 2].map(function (i) { return -kxv[i] + k[i] * kv + 0; }); }

  /** Position (cubie coordinates, each -1 or 1) and outward normal of sticker i. */
  function geometry(i) {
    var face = Math.floor(i / 4), r = Math.floor((i % 4) / 2), c = i % 2;
    switch (face) {
      case 0: return { pos: [2 * c - 1, 1, 2 * r - 1], nor: [0, 1, 0] };
      case 1: return { pos: [1, 1 - 2 * r, 1 - 2 * c], nor: [1, 0, 0] };
      case 2: return { pos: [2 * c - 1, 1 - 2 * r, 1], nor: [0, 0, 1] };
      case 3: return { pos: [2 * c - 1, -1, 1 - 2 * r], nor: [0, -1, 0] };
      case 4: return { pos: [-1, 1 - 2 * r, 2 * c - 1], nor: [-1, 0, 0] };
      default: return { pos: [1 - 2 * c, 1 - 2 * r, -1], nor: [0, 0, -1] };
    }
  }
  var GEO = [], INDEX = {};
  var key = function (p, n) { return p.join(',') + '|' + n.join(','); };
  for (var gi = 0; gi < 24; gi++) { GEO.push(geometry(gi)); INDEX[key(GEO[gi].pos, GEO[gi].nor)] = gi; }

  var PERMS = [];
  for (var face = 0; face < 6; face++) {
    for (var power = 1; power <= 3; power++) {
      var perm = [];
      for (var i = 0; i < 24; i++) {
        var g = GEO[i];
        if (dot(g.pos, AXES[face]) === 1) {
          var p = g.pos, n = g.nor;
          for (var q = 0; q < power; q++) { p = quarterCW(p, AXES[face]); n = quarterCW(n, AXES[face]); }
          perm.push(INDEX[key(p, n)]);
        } else perm.push(i);
      }
      PERMS.push(perm);
    }
  }
  function applyMove(state, m) {
    var perm = PERMS[m.face * 3 + m.power - 1], out = new Array(24);
    for (var i = 0; i < 24; i++) out[perm[i]] = state[i];
    return out.join('');
  }
  function applyMoves(state, moves) { var s = state; for (var i = 0; i < moves.length; i++) s = applyMove(s, moves[i]); return s; }
  function moveName(m) { return LETTERS[m.face] + ['', '2', "'"][m.power - 1]; }
  function parseAlg(text) {
    var out = [], toks = text.trim().split(/\s+/).filter(Boolean);
    for (var t = 0; t < toks.length; t++) {
      var m = /^([URFDLB])([123]?)(['’]?)$/i.exec(toks[t]);
      if (!m) throw new Error('"' + toks[t] + '" is not a valid move. Use U R F D L B with an optional 2 or \'.');
      var f = LETTERS.indexOf(m[1].toUpperCase()), pw = m[2] ? parseInt(m[2], 10) : 1;
      if (m[3]) pw = (4 - pw) % 4;
      pw %= 4;
      if (pw) out.push({ face: f, power: pw });
    }
    return out;
  }
  function scramble(length) {
    var out = [], last = -1;
    while (out.length < length) {
      var f = Math.floor(Math.random() * 3); // U, R, F only: the other turns are the same moves seen from the other side
      if (f === last) continue;
      last = f; out.push({ face: f, power: 1 + Math.floor(Math.random() * 3) });
    }
    return out;
  }

  function init(opts) {
    var COLOR = opts.colors, NAMES = opts.names, Solver = opts.solver;
    var $ = function (id) { return document.getElementById(id); };
    var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var state = SOLVED, startState = SOLVED, moves = [], idx = 0, playing = false, busy = false, solving = false, speed = 1;
    var paint = 'U', flagged = [], S = 70, rx = -28, ry = -38, drag = null;
    var cubeEl = $('cube2'), stage = $('stage2'), planEl = $('t2Plan');

    // ---- 3D cube: 8 cubies, each with 6 faces (24 of them show a sticker) ----
    var faces = [];
    var NORMALS = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
    [-1, 1].forEach(function (x) { [-1, 1].forEach(function (y) { [-1, 1].forEach(function (z) {
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
        if (ax && dot(p, ax) === 1) { p = rotate(p, ax, anim.phi); n = rotate(n, ax, anim.phi); }
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
      S = Math.max(40, Math.min(r.width, r.height) / 3.9);
      stage.style.perspective = Math.round(S * 12) + 'px';
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
          render({ face: m.face, phi: -angle * ease(t) });
          if (t < 1) requestAnimationFrame(frame); else done();
        }
        requestAnimationFrame(frame);
      });
    }
    var turnMs = function (m) { return (m.power === 2 ? 1.35 : 1) * 520 / speed; };

    stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; stage.classList.add('dragging'); try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return;
      ry += (e.clientX - drag.x) * 0.5; rx -= (e.clientY - drag.y) * 0.5;
      rx = Math.max(-89, Math.min(89, rx)); drag = { x: e.clientX, y: e.clientY }; applyView();
    });
    var endDrag = function () { drag = null; stage.classList.remove('dragging'); };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

    // ---- net + palette ----
    var netEl = $('net2'), stickerEls = new Array(24);
    ['U', 'L', 'F', 'R', 'B', 'D'].forEach(function (letter) {
      var fi = LETTERS.indexOf(letter), wrap = el('div', 'face two'); wrap.dataset.f = letter;
      for (var k = 0; k < 4; k++) {
        var b = el('button', 'st'); b.type = 'button'; b.dataset.i = fi * 4 + k;
        stickerEls[fi * 4 + k] = b; wrap.appendChild(b);
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
    var pal = $('palette2');
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
      for (var i = 0; i < 24; i++) {
        stickerEls[i].style.setProperty('--c', COLOR[state[i]]);
        stickerEls[i].classList.toggle('flag', flagged.indexOf(i) >= 0);
        stickerEls[i].setAttribute('aria-label', 'Sticker ' + (i + 1) + ': ' + NAMES[state[i]]);
      }
    }

    function refreshValidity() {
      var r = Solver.parseTwo(state), v = $('t2Valid');
      flagged = r.ok ? [] : (r.stickers || []);
      v.classList.toggle('bad', !r.ok);
      v.lastElementChild.textContent = r.ok ? (state === SOLVED ? 'This cube is already solved.' : 'This is a possible 2×2, so it can be solved.') : r.message;
      paintNet();
      return r;
    }

    // ---- solution + playback ----
    function setStatus(text, bad, spinner) {
      var s = $('t2Status'); s.className = 'status' + (bad ? ' bad' : ''); s.innerHTML = '';
      if (spinner) s.appendChild(el('span', 'spin'));
      s.appendChild(el('span', '', text));
    }
    function clearSolution() { playing = false; moves = []; idx = 0; startState = state; planEl.innerHTML = ''; setStatus('', false); updateTransport(); }
    function buildPlan() {
      planEl.innerHTML = '';
      var box = el('div', 'chipbox');
      moves.forEach(function (m, k) {
        var b = el('button', 'chip', moveName(m)); b.type = 'button'; b.dataset.i = k;
        b.setAttribute('aria-label', 'Go to after move ' + (k + 1) + ', ' + moveName(m));
        box.appendChild(b);
      });
      planEl.appendChild(box);
    }
    planEl.addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.chip') : null;
      if (c && !busy) gotoStep(+c.dataset.i + 1);
    });
    function updateTransport() {
      var has = moves.length > 0;
      $('t2Restart').disabled = !has || busy || idx === 0;
      $('t2Back').disabled = !has || busy || idx === 0;
      $('t2Next').disabled = !has || busy || idx >= moves.length;
      $('t2Play').disabled = !has;
      var label = playing ? 'Pause' : (has && idx >= moves.length ? 'Replay' : 'Play');
      $('t2Play').title = label; $('t2Play').setAttribute('aria-label', label);
      $('t2PlayIcon').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
      var chips = planEl.querySelectorAll('.chip');
      for (var i = 0; i < chips.length; i++) { chips[i].classList.toggle('done', i < idx); chips[i].classList.toggle('current', i === idx - 1); chips[i].disabled = busy; }
      $('t2Label').textContent = idx > 0 && has ? moveName(moves[idx - 1]) : '';
      $('t2Progress').textContent = has ? (idx >= moves.length ? 'Solved in ' + moves.length + (moves.length === 1 ? ' move' : ' moves') : 'Move ' + (idx + 1) + ' of ' + moves.length + ' · next ' + moveName(moves[idx])) : '';
      $('t2Scramble').disabled = busy || solving; $('t2Reset').disabled = busy || solving; $('t2Solve').disabled = busy || solving;
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
        stepForward().then(function () { if (playing) setTimeout(loop, reduceMotion ? 0 : 90 / speed); });
      })();
    }
    function pause() { playing = false; updateTransport(); }
    $('t2Play').addEventListener('click', function () { playing ? pause() : play(); });
    $('t2Next').addEventListener('click', function () { playing = false; stepForward(); });
    $('t2Back').addEventListener('click', function () { if (!busy && idx > 0) gotoStep(idx - 1); });
    $('t2Restart').addEventListener('click', function () { if (!busy) gotoStep(0); });
    $('t2Speed').addEventListener('input', function (e) { speed = +e.target.value; $('t2SpeedOut').textContent = speed.toFixed(1) + '×'; });

    function runMoves(list, ms) {
      busy = true; updateTransport();
      var p = Promise.resolve();
      list.forEach(function (m) { p = p.then(function () { return animateMove(m, ms); }); });
      return p.then(function () { busy = false; updateTransport(); });
    }
    $('t2Scramble').addEventListener('click', function () {
      if (busy || solving) return;
      var list = scramble(14); clearSolution();
      $('t2ScrambleLine').innerHTML = '';
      var b = el('b', '', 'Scramble: '); $('t2ScrambleLine').appendChild(b); $('t2ScrambleLine').appendChild(document.createTextNode(list.map(moveName).join(' ')));
      runMoves(list, 130).then(function () { startState = state; refreshValidity(); updateTransport(); });
    });
    $('t2Reset').addEventListener('click', function () {
      if (busy || solving) return;
      state = SOLVED; clearSolution(); $('t2ScrambleLine').textContent = ''; paintCube(); render(null); refreshValidity();
    });
    $('t2AlgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || solving) return;
      var msg = $('t2AlgMsg'), list;
      try { list = parseAlg($('t2AlgInput').value); } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; return; }
      if (!list.length) { msg.className = 'msg bad'; msg.textContent = 'Type some moves first, like R U R’ U’.'; return; }
      msg.className = 'msg'; msg.textContent = ''; clearSolution();
      $('t2ScrambleLine').textContent = 'Applied: ' + list.map(moveName).join(' ');
      runMoves(list, 160).then(function () { startState = state; refreshValidity(); updateTransport(); });
    });
    $('t2Solve').addEventListener('click', function () {
      if (busy || solving) return;
      var v = refreshValidity();
      if (!v.ok) { setStatus((flagged.length ? 'Fix the highlighted stickers first. ' : 'Fix the cube first. ') + v.message, true); return; }
      if (state === SOLVED) { clearSolution(); setStatus('The cube is already solved. Scramble it to see a solution.', false); return; }
      solving = true; clearSolution(); updateTransport(); setStatus('Solving…', false, true);
      var snapshot = state;
      setTimeout(function () {
        var r;
        try { r = Solver.solveTwo(snapshot); } catch (err) { r = { ok: false, message: String(err && err.message || err) }; }
        solving = false;
        if (!r.ok) { setStatus(r.message || 'The solver could not finish.', true); updateTransport(); return; }
        startState = snapshot; moves = parseAlg(r.moves.join(' ')); idx = 0; buildPlan();
        setStatus('Found a ' + r.length + '-move solution in ' + (r.ms / 1000).toFixed(2) + ' s. That is the shortest possible.', false);
        updateTransport();
      }, 40);
    });

    applyView(); paintCube(); paintNet(); refreshValidity(); updateTransport();
    return { pause: pause, layout: layout };
  }

  return { init: init, applyMoves: applyMoves, parseAlg: parseAlg, SOLVED: SOLVED };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TwoUI;
