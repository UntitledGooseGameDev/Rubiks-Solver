/**
 * Photo upload UI: six photo slots, an editor to adjust the sticker grid, and
 * the hand-off to the cube view and solver (window.CubeApp, defined by the main script).
 * Depends on the global CubeSolver bundle (scanner + solver).
 */
(function () {
  'use strict';
  var CS = CubeSolver;
  var $ = function (id) { return document.getElementById(id); };

  // Capture order, with which cube face each photo shows and how it should be held.
  var SLOTS = [
    { name: 'Front', face: 2, sub: 'Up face at the top' },
    { name: 'Right', face: 1, sub: 'Up face at the top' },
    { name: 'Back', face: 5, sub: 'Up face at the top' },
    { name: 'Left', face: 4, sub: 'Up face at the top' },
    { name: 'Up', face: 0, sub: 'Front face at the bottom' },
    { name: 'Down', face: 3, sub: 'Front face at the top' }
  ];
  var LETTERS = 'URFDLB';
  var NOMINAL = {
    U: [243, 245, 248], R: [229, 35, 47], F: [23, 180, 91], D: [255, 214, 10], L: [255, 125, 26], B: [43, 109, 245]
  };
  var MAX_DIM = 640;

  var slots = [null, null, null, null, null, null];
  var tiles = [];
  var active = -1;
  var reading = null;
  var schemeRGB = {};
  LETTERS.split('').forEach(function (l) { schemeRGB[l] = NOMINAL[l]; });

  function rgbCss(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }

  // ---------------------------------------------------------------- status
  function setStatus(text, kind, spinner) {
    var el = $('scanStatus');
    el.className = 'status scan-status' + (kind === 'bad' ? ' bad' : '');
    el.innerHTML = '';
    if (spinner) { var s = document.createElement('span'); s.className = 'spin'; el.appendChild(s); }
    var t = document.createElement('span'); t.textContent = text; el.appendChild(t);
  }

  // ------------------------------------------------------- image geometry
  // A photo can be turned in quarter turns clockwise (s.rot) so "up" in the photo is up.
  function dispDims(s) { return s.rot % 2 ? [s.image.height, s.image.width] : [s.image.width, s.image.height]; }
  function toDisp(s, x, y) {
    var w = s.image.width, h = s.image.height;
    switch (s.rot) { case 0: return [x, y]; case 1: return [h - y, x]; case 2: return [w - x, h - y]; default: return [y, w - x]; }
  }
  function fromDisp(s, X, Y) {
    var w = s.image.width, h = s.image.height;
    switch (s.rot) { case 0: return [X, Y]; case 1: return [Y, h - X]; case 2: return [w - X, h - Y]; default: return [w - Y, X]; }
  }
  function gridPoint(t, u, v) {
    var c = t.size / 3, a = t.angle * Math.PI / 180;
    return [t.cx + u * c * Math.cos(a) - v * c * Math.sin(a), t.cy + u * c * Math.sin(a) + v * c * Math.cos(a)];
  }

  // ------------------------------------------------------------- drawing
  function draw(canvas, s) {
    var d = dispDims(s);
    canvas.width = d[0]; canvas.height = d[1];
    var ctx = canvas.getContext('2d');
    ctx.save();
    var w = s.image.width, h = s.image.height;
    if (s.rot === 0) ctx.setTransform(1, 0, 0, 1, 0, 0);
    else if (s.rot === 1) ctx.setTransform(0, 1, -1, 0, h, 0);
    else if (s.rot === 2) ctx.setTransform(-1, 0, 0, -1, w, h);
    else ctx.setTransform(0, -1, 1, 0, 0, w);
    ctx.drawImage(s.canvas, 0, 0);
    ctx.restore();

    var lw = Math.max(2, d[0] / 200);
    function line(p, q) {
      var a = toDisp(s, p[0], p[1]), b = toDisp(s, q[0], q[1]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    var segs = [];
    [-1.5, -0.5, 0.5, 1.5].forEach(function (k) {
      segs.push([gridPoint(s.t, k, -1.5), gridPoint(s.t, k, 1.5)]);
      segs.push([gridPoint(s.t, -1.5, k), gridPoint(s.t, 1.5, k)]);
    });
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = lw * 2.4;
    segs.forEach(function (sg) { line(sg[0], sg[1]); });
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = lw;
    segs.forEach(function (sg) { line(sg[0], sg[1]); });

    var centers = CS.gridCenters(s.t);
    var r = Math.max(5, (s.t.size / 3) * 0.14);
    centers.forEach(function (c, k) {
      var p = toDisp(s, c[0], c[1]);
      var fill = s.letters ? rgbCss(schemeRGB[s.letters[k]]) : rgbCss(s.samples[k].rgb);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = lw * 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = lw * 0.7; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
    });
  }

  // -------------------------------------------------------------- tiles
  function buildTiles() {
    var host = $('slots');
    SLOTS.forEach(function (def, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'slot'; b.dataset.i = i;
      b.innerHTML = '<span class="thumb"><span class="plus">+</span></span>' +
        '<span class="name"></span><span class="sub"></span>';
      b.querySelector('.name').textContent = def.name;
      b.querySelector('.sub').textContent = def.sub;
      b.addEventListener('click', function () {
        if (slots[i]) openEditor(i); else chooseFor(i);
      });
      host.appendChild(b);
      tiles.push(b);
      renderTile(i);
    });
    host.addEventListener('dragover', function (e) {
      e.preventDefault();
      var t = e.target.closest ? e.target.closest('.slot') : null;
      tiles.forEach(function (x) { x.classList.toggle('dragover', x === t); });
    });
    host.addEventListener('dragleave', function () { tiles.forEach(function (x) { x.classList.remove('dragover'); }); });
    host.addEventListener('drop', function (e) {
      e.preventDefault();
      tiles.forEach(function (x) { x.classList.remove('dragover'); });
      var t = e.target.closest ? e.target.closest('.slot') : null;
      var files = Array.prototype.slice.call(e.dataTransfer ? e.dataTransfer.files : []);
      if (!files.length) return;
      var start = t ? +t.dataset.i : Math.max(0, slots.findIndex(function (s) { return !s; }));
      addFiles(start, files);
    });
  }

  function renderTile(i) {
    var tile = tiles[i], s = slots[i], thumb = tile.querySelector('.thumb');
    tile.classList.toggle('filled', !!s);
    tile.classList.toggle('active', i === active);
    tile.setAttribute('aria-label', SLOTS[i].name + ' photo: ' + (s ? 'added. Open to adjust.' : 'empty. Choose a file.'));
    if (!s) {
      thumb.innerHTML = '<span class="plus">+</span>';
      return;
    }
    var canvas = thumb.querySelector('canvas');
    if (!canvas) { thumb.innerHTML = ''; canvas = document.createElement('canvas'); thumb.appendChild(canvas); }
    draw(canvas, s);
  }

  // ------------------------------------------------------------ decoding
  function decodeFile(file) {
    return (async function () {
      var bmp = null;
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e1) { try { bmp = await createImageBitmap(file); } catch (e2) { bmp = null; } }
      var src, w, h;
      if (bmp) { src = bmp; w = bmp.width; h = bmp.height; }
      else {
        src = await new Promise(function (resolve, reject) {
          var img = new Image(), url = URL.createObjectURL(file);
          img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
          img.src = url;
        });
        w = src.naturalWidth; h = src.naturalHeight;
      }
      if (!w || !h) throw new Error('empty image');
      var k = Math.min(1, MAX_DIM / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(src, 0, 0, cw, ch);
      if (bmp && bmp.close) bmp.close();
      var px = ctx.getImageData(0, 0, cw, ch);
      return { canvas: canvas, image: { width: cw, height: ch, data: px.data } };
    })();
  }

  var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  function addFiles(start, files) {
    return (async function () {
      var n = 0, failed = [];
      for (var k = 0; k < files.length && start + k < 6; k++) {
        var file = files[k], i = start + k;
        if (file.type && file.type.indexOf('image/') !== 0) { failed.push(file.name); continue; }
        setStatus('Reading ' + SLOTS[i].name + ' photo (' + file.name + ')…', 'info', true);
        await tick();
        try {
          var d = await decodeFile(file);
          var fit = CS.autoFit(d.image);
          slots[i] = { name: file.name, canvas: d.canvas, image: d.image, t: fit.transform, rot: 0, samples: null, letters: null };
          sample(slots[i]);
          n++;
        } catch (err) { failed.push(file.name); }
        await tick();
      }
      if (files.length > 6 - start) failed.push('(only ' + (6 - start) + ' more photo' + (6 - start === 1 ? '' : 's') + ' fit from here)');
      if (active >= 0 && slots[active]) openEditor(active); else if (active >= 0) closeEditor();
      refresh(true);
      if (failed.length) {
        var msg = "Couldn't read " + failed.join(', ') + '. Use JPG or PNG photos.';
        if (n === 0) setStatus(msg, 'bad');
        else $('scanStatus').lastChild.textContent += ' ' + msg;
      }
    })();
  }

  // ---------------------------------------------------- reading + solving
  function sample(s) { s.samples = CS.readFaceSamples(s.image, s.t); }

  function applyScheme(centerLabs) {
    // Snap each center color to the nearest standard cube color so the 3D cube looks like yours.
    var nomLab = LETTERS.split('').map(function (l) { return CS.srgbToLab(NOMINAL[l][0], NOMINAL[l][1], NOMINAL[l][2]); });
    var cost = centerLabs.map(function (lab) { return nomLab.map(function (n) { return CS.colorDistance(lab, n); }); });
    var a = CS.hungarian(cost);
    var ok = a.every(function (j, f) { return cost[f][j] < 50; });
    LETTERS.split('').forEach(function (letter, f) {
      var rgb = ok ? NOMINAL[LETTERS[a[f]]] : NOMINAL[letter];
      schemeRGB[letter] = rgb;
      document.documentElement.style.setProperty('--c-' + letter, rgbCss(rgb));
    });
  }
  function resetScheme() {
    LETTERS.split('').forEach(function (l) {
      schemeRGB[l] = NOMINAL[l];
      document.documentElement.style.removeProperty('--c-' + l);
    });
  }

  /** Re-read everything. `final` is true when a change is finished (a drag ending, a photo added). */
  function refresh(final) {
    var count = slots.filter(Boolean).length;
    reading = null;
    slots.forEach(function (s) { if (s) s.letters = null; });

    if (count === 6) {
      var faces = new Array(6);
      slots.forEach(function (s, i) { faces[SLOTS[i].face] = CS.rotateGrid(s.samples, s.rot); });
      reading = CS.classifyCube(faces);
      slots.forEach(function (s, i) {
        var upright = reading.facelets.slice(SLOTS[i].face * 9, SLOTS[i].face * 9 + 9).split('');
        s.letters = CS.rotateGrid(upright, (4 - s.rot) % 4);
      });
      applyScheme(faces.map(function (f) { return f[4].lab; }));
    }

    slots.forEach(function (s, i) { if (s) renderTile(i); else renderTile(i); });
    if (active >= 0 && slots[active]) draw($('edCanvas'), slots[active]);

    if (count < 6) {
      if (final) setStatus(count === 0 ? '' : count + ' of 6 photos added. Add the rest to read the whole cube.', 'info');
      return;
    }

    var valid = CS.parseFacelets(reading.facelets).ok;
    if (final) {
      var msg;
      if (reading.similarCenters.length) {
        var pair = reading.similarCenters[0];
        var names = SLOTS.filter(function (d) { return d.face === pair[0] || d.face === pair[1]; }).map(function (d) { return d.name; });
        msg = 'The ' + names.join(' and ') + ' photos show the same center color. Check that each photo is in the right slot.';
        setStatus(msg, 'bad');
      } else if (!valid) {
        setStatus('Read all six photos, but the colors don’t make a possible cube. Adjust a photo’s grid, or fix the highlighted stickers below.', 'bad');
      } else if (reading.uncertain.length) {
        setStatus('Read all six photos. ' + reading.uncertain.length + ' sticker' + (reading.uncertain.length === 1 ? ' is' : 's are') + ' marked with a dashed outline below; compare ' + (reading.uncertain.length === 1 ? 'it' : 'them') + ' with your cube.', 'info');
      } else {
        setStatus('Read all six photos.', 'info');
      }
    }
    if (window.CubeApp) window.CubeApp.loadScanned(reading.facelets, reading.uncertain, final);
  }

  // -------------------------------------------------------------- editor
  var drag = null;

  function openEditor(i) {
    active = i;
    var s = slots[i];
    $('editor').hidden = false;
    $('edTitle').textContent = SLOTS[i].name + ' photo · ' + SLOTS[i].sub.toLowerCase();
    var m = Math.min(s.image.width, s.image.height);
    $('edSize').min = String(Math.round(0.2 * m)); $('edSize').max = String(Math.round(1.1 * m));
    syncEditor();
    tiles.forEach(function (_, k) { renderTile(k); });
  }
  function closeEditor() {
    active = -1; drag = null;
    $('editor').hidden = true;
    tiles.forEach(function (_, k) { renderTile(k); });
  }
  function syncEditor() {
    var s = slots[active];
    if (!s) return;
    $('edSize').value = s.t.size;
    $('edAngle').value = s.t.angle;
    var canvas = $('edCanvas');
    draw(canvas, s);
    var wrapW = $('edWrap').clientWidth || 320;
    var k = Math.min(wrapW / canvas.width, 420 / canvas.height);
    canvas.style.width = Math.round(canvas.width * k) + 'px';
    canvas.style.height = Math.round(canvas.height * k) + 'px';
  }
  function changed(final) {
    var s = slots[active];
    if (!s) return;
    sample(s);
    refresh(final);
    $('edSize').value = s.t.size; $('edAngle').value = s.t.angle;
  }
  function pointerImg(e) {
    var s = slots[active], canvas = $('edCanvas'), r = canvas.getBoundingClientRect();
    return fromDisp(s, (e.clientX - r.left) / r.width * canvas.width, (e.clientY - r.top) / r.height * canvas.height);
  }

  function chooseFor(i) {
    var input = $('fileOne');
    input.dataset.slot = i;
    input.click();
  }

  function init() {
    buildTiles();

    $('fileOne').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      var i = +e.target.dataset.slot;
      e.target.value = '';
      if (f) addFiles(i, [f]);
    });
    $('btnPickSix').addEventListener('click', function () { $('fileSix').click(); });
    $('fileSix').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      files.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
      addFiles(0, files.slice(0, 6)).then(function () {
        if (files.length >= 2) setStatusAppend('Photos were assigned in name order: ' + SLOTS.map(function (d) { return d.name; }).join(', ') + '.');
      });
    });
    $('btnClearPhotos').addEventListener('click', function () {
      slots = [null, null, null, null, null, null];
      reading = null; closeEditor(); resetScheme();
      tiles.forEach(function (_, k) { renderTile(k); });
      setStatus('', 'info');
    });

    $('edClose').addEventListener('click', closeEditor);
    $('edReplace').addEventListener('click', function () { if (active >= 0) chooseFor(active); });
    $('edRemove').addEventListener('click', function () {
      if (active < 0) return;
      slots[active] = null; closeEditor(); refresh(true);
    });
    $('edRot').addEventListener('click', function () {
      var s = slots[active]; if (!s) return;
      s.rot = (s.rot + 1) % 4; syncEditor(); changed(true);
    });
    $('edFit').addEventListener('click', function () {
      var s = slots[active]; if (!s) return;
      s.t = CS.autoFit(s.image).transform; syncEditor(); changed(true);
    });
    $('edSize').addEventListener('input', function (e) { var s = slots[active]; if (!s) return; s.t.size = +e.target.value; syncEditor(); changed(false); });
    $('edSize').addEventListener('change', function () { changed(true); });
    $('edAngle').addEventListener('input', function (e) { var s = slots[active]; if (!s) return; s.t.angle = +e.target.value; syncEditor(); changed(false); });
    $('edAngle').addEventListener('change', function () { changed(true); });

    var wrap = $('edWrap');
    wrap.addEventListener('pointerdown', function (e) {
      if (!slots[active]) return;
      drag = pointerImg(e);
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
    });
    wrap.addEventListener('pointermove', function (e) {
      var s = slots[active];
      if (!drag || !s) return;
      var p = pointerImg(e);
      s.t.cx += p[0] - drag[0]; s.t.cy += p[1] - drag[1];
      drag = p;
      syncEditor(); changed(false);
    });
    function endDrag() { if (drag) { drag = null; changed(true); } }
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', function () { if (active >= 0) syncEditor(); });
  }

  function setStatusAppend(text) {
    var el = $('scanStatus');
    if (el.lastChild) el.lastChild.textContent += ' ' + text; else setStatus(text, 'info');
  }

  init();
  // for tests
  window.__scan = { get slots() { return slots; }, get reading() { return reading; } };
})();
