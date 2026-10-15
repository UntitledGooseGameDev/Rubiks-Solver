/**
 * Page-side cube logic: sticker geometry, move permutations, notation parsing.
 * Works on any 54-sticker string (even impossible ones the user painted), so
 * moves can be animated on a cube that has not been validated.
 * Plain JS so it can be inlined into the page and also required from tests.
 */
const CubeLogic = (() => {
  const LETTERS = 'URFDLB';
  const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  /** Outward axis of each face, world coords: x right, y up, z toward the viewer. */
  const AXES = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  /** Rotate v about unit axis k by phi radians (right-hand rule). */
  function rotate(v, k, phi) {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const kv = dot(k, v);
    const kxv = cross(k, v);
    return [0, 1, 2].map((i) => v[i] * c + kxv[i] * s + k[i] * kv * (1 - c));
  }

  /** Exact integer clockwise quarter turn (as seen from outside) about unit axis k. */
  function quarterCW(v, k) {
    const kxv = cross(k, v);
    const kv = dot(k, v);
    return [0, 1, 2].map((i) => -kxv[i] + k[i] * kv + 0);
  }

  /** Cubie position (-1..1 each axis) and outward normal of facelet i (URFDLB reading order). */
  function faceletGeometry(i) {
    const face = Math.floor(i / 9);
    const r = Math.floor((i % 9) / 3);
    const c = i % 3;
    switch (face) {
      case 0: return { pos: [c - 1, 1, r - 1], nor: [0, 1, 0] };
      case 1: return { pos: [1, 1 - r, 1 - c], nor: [1, 0, 0] };
      case 2: return { pos: [c - 1, 1 - r, 1], nor: [0, 0, 1] };
      case 3: return { pos: [c - 1, -1, 1 - r], nor: [0, -1, 0] };
      case 4: return { pos: [-1, 1 - r, c - 1], nor: [-1, 0, 0] };
      default: return { pos: [1 - c, 1 - r, -1], nor: [0, 0, -1] };
    }
  }

  const key = (p, n) => p.join(',') + '|' + n.join(',');
  const GEO = Array.from({ length: 54 }, (_, i) => faceletGeometry(i));
  const INDEX = new Map(GEO.map((g, i) => [key(g.pos, g.nor), i]));

  /** PERMS[face*3 + power-1][i] = where the sticker at i ends up. */
  const PERMS = [];
  for (let face = 0; face < 6; face++) {
    for (let power = 1; power <= 3; power++) {
      const perm = new Array(54);
      for (let i = 0; i < 54; i++) {
        const g = GEO[i];
        if (dot(g.pos, AXES[face]) === 1) {
          let p = g.pos;
          let n = g.nor;
          for (let q = 0; q < power; q++) {
            p = quarterCW(p, AXES[face]);
            n = quarterCW(n, AXES[face]);
          }
          perm[i] = INDEX.get(key(p, n));
        } else {
          perm[i] = i;
        }
      }
      PERMS.push(perm);
    }
  }

  function applyMove(state, face, power) {
    const perm = PERMS[face * 3 + power - 1];
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
    return out.join('');
  }

  function moveName(m) {
    return LETTERS[m.face] + ['', '2', "'"][m.power - 1];
  }

  function invertMove(m) {
    return { face: m.face, power: m.power === 2 ? 2 : 4 - m.power };
  }

  /** Parse "R U R' U' F2". Returns an array of {face, power}; throws Error on a bad token. */
  function parseAlg(text) {
    const out = [];
    for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
      const m = /^([URFDLB])([123]?)(['’]?)$/i.exec(tok);
      if (!m) throw new Error('"' + tok + '" is not a valid move. Use U R F D L B with an optional 2 or \'.');
      const face = LETTERS.indexOf(m[1].toUpperCase());
      let power = m[2] ? parseInt(m[2], 10) : 1;
      if (m[3]) power = (4 - power) % 4;
      power %= 4;
      if (power === 0) continue;
      out.push({ face, power });
    }
    return out;
  }

  function applyMoves(state, moves) {
    let s = state;
    for (const m of moves) s = applyMove(s, m.face, m.power);
    return s;
  }

  function applyAlg(state, text) {
    return applyMoves(state, parseAlg(text));
  }

  /** Random scramble: no two consecutive turns of the same face. */
  function scramble(length, rand) {
    const rnd = rand || Math.random;
    const out = [];
    let last = -1;
    while (out.length < length) {
      const face = Math.floor(rnd() * 6);
      if (face === last) continue;
      last = face;
      out.push({ face, power: 1 + Math.floor(rnd() * 3) });
    }
    return out;
  }

  function isSolved(state) {
    for (let f = 0; f < 6; f++) {
      for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== state[f * 9]) return false;
    }
    return true;
  }

  /** The 156 renderable cubie faces (26 cubies x 6); idx is the facelet index, or -1 for plain plastic. */
  function renderFaces() {
    const out = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const c = [x, y, z];
          for (const n of AXES) {
            out.push({ c, n, idx: dot(c, n) === 1 ? INDEX.get(key(c, n)) : -1 });
          }
        }
      }
    }
    return out;
  }

  return {
    LETTERS, SOLVED, AXES, GEO, dot, cross, rotate,
    applyMove, applyMoves, applyAlg, parseAlg, moveName, invertMove, scramble, isSolved, renderFaces,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CubeLogic;
