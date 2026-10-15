/**
 * Cube photo scanner: finds the 3x3 sticker grid in a photo, reads the nine
 * sticker colors, and classifies all 54 stickers of a cube into its six colors.
 *
 * Everything works on raw RGBA pixel data, so it runs in a browser (from a
 * canvas) and in Node (for tests) without any dependencies.
 *
 * How the colors are classified: the six center stickers never move, so each
 * center defines one of the six colors. Every other sticker is assigned to a
 * color by a minimum-cost assignment that enforces the real constraint that a
 * cube has exactly nine stickers of each color. That constraint is what keeps
 * the result stable when lighting differs between photos.
 */

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** The 3x3 grid area: centered at (cx, cy), `size` pixels across, rotated `angle` degrees clockwise. */
export interface GridTransform {
  cx: number;
  cy: number;
  size: number;
  angle: number;
}

export type Lab = [number, number, number];

export interface Sample {
  rgb: [number, number, number];
  lab: Lab;
}

export const FACE_LETTERS = 'URFDLB';

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

export function srgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Color distance. Lightness counts less than hue/chroma so shadows and glare hurt less. */
export function colorDistance(a: Lab, b: Lab): number {
  const dl = 0.6 * (a[0] - b[0]);
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ---------------------------------------------------------------------------
// Grid geometry and sampling
// ---------------------------------------------------------------------------

/** The nine cell centers in reading order (row by row), in image pixels. */
export function gridCenters(t: GridTransform): [number, number][] {
  const c = t.size / 3;
  const rad = (t.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: [number, number][] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const u = (col - 1) * c;
      const v = (row - 1) * c;
      out.push([t.cx + u * cos - v * sin, t.cy + u * sin + v * cos]);
    }
  }
  return out;
}

export function defaultTransform(img: RGBAImage): GridTransform {
  return { cx: img.width / 2, cy: img.height / 2, size: 0.7 * Math.min(img.width, img.height), angle: 0 };
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const n = values.length;
  return n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
}

/** Median color of a square patch around (x, y). The median shrugs off specks of glare. */
function samplePatch(img: RGBAImage, x: number, y: number, half: number): [number, number, number] {
  const x0 = Math.max(0, Math.round(x - half));
  const x1 = Math.min(img.width - 1, Math.round(x + half));
  const y0 = Math.max(0, Math.round(y - half));
  const y1 = Math.min(img.height - 1, Math.round(y + half));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const i = (yy * img.width + xx) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  }
  if (!rs.length) return [0, 0, 0];
  return [median(rs), median(gs), median(bs)];
}

/** Read the nine stickers of one face photo, in reading order of the photo. */
export function readFaceSamples(img: RGBAImage, t: GridTransform): Sample[] {
  const half = Math.max(1.5, (t.size / 3) * 0.2);
  return gridCenters(t).map(([x, y]) => {
    const rgb = samplePatch(img, x, y, half);
    return { rgb, lab: srgbToLab(rgb[0], rgb[1], rgb[2]) };
  });
}

/** Rotate a 3x3 reading-order array a quarter turn clockwise (use when a photo is sideways). */
export function rotateGridCW<T>(cells: T[]): T[] {
  const out = new Array<T>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i * 3 + j] = cells[(2 - j) * 3 + i];
  return out;
}

export function rotateGrid<T>(cells: T[], quarterTurnsCW: number): T[] {
  let out = cells;
  for (let k = 0; k < (((quarterTurnsCW % 4) + 4) % 4); k++) out = rotateGridCW(out);
  return out;
}

// ---------------------------------------------------------------------------
// Auto-fit: find the 3x3 grid in a photo
// ---------------------------------------------------------------------------

function downscale(img: RGBAImage, maxDim: number): { img: RGBAImage; scale: number } {
  const longest = Math.max(img.width, img.height);
  if (longest <= maxDim) return { img, scale: 1 };
  const scale = maxDim / longest;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y / scale), sy1 = Math.max(sy0 + 1, Math.min(img.height, Math.floor((y + 1) / scale)));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x / scale), sx1 = Math.max(sx0 + 1, Math.min(img.width, Math.floor((x + 1) / scale)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
  }
  return { img: { width: w, height: h, data }, scale };
}

/** Brightness (0..1) at the nearest pixel. */
function lumaAt(img: RGBAImage, x: number, y: number): number {
  const xx = x < 0 ? 0 : x > img.width - 1 ? img.width - 1 : Math.round(x);
  const yy = y < 0 ? 0 : y > img.height - 1 ? img.height - 1 : Math.round(y);
  const i = (yy * img.width + xx) * 4;
  return (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
}

const cellLuma = new Float64Array(9);
const PATCH: [number, number][] = [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]];
const WINDOW_STEP = 0.06; // in cells
const WINDOW_TAPS = [-3, -2, -1, 0, 1, 2, 3];

/**
 * How much does this grid placement look like a cube face?
 *
 *  - Cells should be uniform and sticker-colored (up to 9 points).
 *  - The dark lines between stickers (at +-0.5 cells) and around the face edge
 *    (at +-1.5 cells) should be dark along their whole length. This is what
 *    rules out grids that are too big, too small or turned the wrong way.
 *
 * `sigma` (in cells) sets how forgiving the line check is about exact alignment.
 */
function gridScore(img: RGBAImage, cx: number, cy: number, size: number, angle: number, sigma: number): number {
  const c = size / 3;
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const vx = -uy, vy = ux;

  let uniform = 0;
  let lumaSum = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const px = cx + (col - 1) * c * ux + (row - 1) * c * vx;
      const py = cy + (col - 1) * c * uy + (row - 1) * c * vy;
      let sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0;
      for (let k = 0; k < 5; k++) {
        const x = Math.round(Math.min(img.width - 1, Math.max(0, px + PATCH[k][0] * c * ux + PATCH[k][1] * c * vx)));
        const y = Math.round(Math.min(img.height - 1, Math.max(0, py + PATCH[k][0] * c * uy + PATCH[k][1] * c * vy)));
        const i = (y * img.width + x) * 4;
        const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        sr += r; sg += g; sb += b; sr2 += r * r; sg2 += g * g; sb2 += b * b;
      }
      const mr = sr / 5, mg = sg / 5, mb = sb / 5;
      const variance = (sr2 / 5 - mr * mr + sg2 / 5 - mg * mg + sb2 / 5 - mb * mb) / 3;
      const mx = Math.max(mr, mg, mb), mn = Math.min(mr, mg, mb);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const val = mx / 255;
      const stickerLike = sat > 0.4 && val > 0.2 ? 1 : sat < 0.3 && val > 0.55 ? 0.9 : 0.15;
      uniform += Math.exp(-Math.max(0, variance) / 400) * stickerLike;
      const l = (0.299 * mr + 0.587 * mg + 0.114 * mb) / 255;
      cellLuma[row * 3 + col] = l;
      lumaSum += l;
    }
  }
  const ref = Math.max(lumaSum / 9, 0.25);

  // Gaussian weights across a line, in cells
  let wSum = 0;
  const weights = WINDOW_TAPS.map((k) => {
    const w = Math.exp(-0.5 * ((k * WINDOW_STEP) / sigma) ** 2);
    wSum += w;
    return w;
  });

  let lines = 0;
  let count = 0;
  const along = [-1, -0.5, 0, 0.5, 1];
  for (const a of [-1.5, -0.5, 0.5, 1.5]) {
    for (const t of along) {
      for (let axis = 0; axis < 2; axis++) {
        // axis 0: a vertical line at u = a, sampled at v = t; axis 1: a horizontal line at v = a, u = t
        const u = axis === 0 ? a : t;
        const v = axis === 0 ? t : a;
        const bx = cx + u * c * ux + v * c * vx;
        const by = cy + u * c * uy + v * c * vy;
        // step perpendicular to the line
        const sx = (axis === 0 ? ux : vx) * c * WINDOW_STEP;
        const sy = (axis === 0 ? uy : vy) * c * WINDOW_STEP;
        let acc = 0;
        for (let k = 0; k < WINDOW_TAPS.length; k++) {
          const l = lumaAt(img, bx + WINDOW_TAPS[k] * sx, by + WINDOW_TAPS[k] * sy);
          const contrast = (ref - l) / ref;
          acc += weights[k] * (contrast < 0 ? 0 : contrast > 1 ? 1 : contrast);
        }
        lines += acc / wSum;
        count++;
      }
    }
  }
  return uniform + 14 * (lines / count);
}

/**
 * Find the 3x3 sticker grid in a face photo. Best effort: the page always shows
 * the result so it can be adjusted by hand.
 */
export function autoFit(image: RGBAImage): { transform: GridTransform; score: number } {
  const { img, scale } = downscale(image, 160);
  const W = img.width, H = img.height, m = Math.min(W, H);
  const stepPx = Math.max(2, m * 0.04);

  type Cand = { cx: number; cy: number; size: number; angle: number; s: number };
  const cands: Cand[] = [];
  for (let size = 0.4 * m; size <= 0.98 * m; size += stepPx) {
    for (let angle = -20; angle <= 20; angle += 10) {
      for (let cy = 0.25 * H; cy <= 0.75 * H; cy += stepPx) {
        for (let cx = 0.25 * W; cx <= 0.75 * W; cx += stepPx) {
          cands.push({ cx, cy, size, angle, s: gridScore(img, cx, cy, size, angle, 0.1) });
        }
      }
    }
  }
  cands.sort((a, b) => b.s - a.s);

  // Refine the best few distinct candidates by hill climbing with shrinking steps and a stricter line check.
  const starts: Cand[] = [];
  for (const c of cands) {
    if (starts.length >= 3) break;
    if (starts.every((o) => Math.hypot(o.cx - c.cx, o.cy - c.cy) > 0.08 * m || Math.abs(o.size - c.size) > 0.1 * m)) starts.push(c);
  }
  let best: Cand = { ...starts[0], s: -Infinity };
  for (const start of starts) {
    const cur = { ...start };
    cur.s = gridScore(img, cur.cx, cur.cy, cur.size, cur.angle, 0.06);
    for (const [step, sigma] of [[2, 0.06], [1, 0.05], [0.5, 0.045]] as const) {
      cur.s = gridScore(img, cur.cx, cur.cy, cur.size, cur.angle, sigma);
      let improved = true;
      while (improved) {
        improved = false;
        for (const key of ['cx', 'cy', 'size', 'angle'] as const) {
          for (const dir of [-1, 1]) {
            const next = { ...cur, [key]: cur[key] + dir * step };
            const s = gridScore(img, next.cx, next.cy, next.size, next.angle, sigma);
            if (s > cur.s + 1e-9) { cur.cx = next.cx; cur.cy = next.cy; cur.size = next.size; cur.angle = next.angle; cur.s = s; improved = true; }
          }
        }
      }
    }
    const final = gridScore(img, cur.cx, cur.cy, cur.size, cur.angle, 0.045);
    if (final > best.s) best = { ...cur, s: final };
  }

  return {
    transform: { cx: best.cx / scale, cy: best.cy / scale, size: best.size / scale, angle: best.angle },
    score: best.s,
  };
}

// ---------------------------------------------------------------------------
// Classification: 54 stickers -> six colors
// ---------------------------------------------------------------------------

/** Minimum-cost assignment (Hungarian algorithm). Returns, for each row, its assigned column. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Infinity;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array<number>(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}

export interface CubeReading {
  /** 54 stickers in U R F D L B order, written with the face letters of the matching centers. */
  facelets: string;
  /** Sticker indices (0-53) the classifier is not confident about. */
  uncertain: number[];
  /** Pairs of faces whose center colors look the same (usually photos in the wrong slots). */
  similarCenters: [number, number][];
}

/**
 * Classify a whole cube. `faces[f]` holds the nine samples of face f
 * (f = 0..5 for U R F D L B), each already in that face's reading order.
 */
export function classifyCube(faces: Sample[][]): CubeReading {
  if (faces.length !== 6 || faces.some((f) => f.length !== 9)) throw new Error('classifyCube needs 6 faces of 9 samples');
  const labs: Lab[] = [];
  for (const f of faces) for (const s of f) labs.push(s.lab);

  const refs: Lab[] = faces.map((f) => [...f[4].lab] as Lab);
  const others: number[] = [];
  for (let i = 0; i < 54; i++) if (i % 9 !== 4) others.push(i);

  let assigned = new Array<number>(others.length).fill(0);
  for (let iter = 0; iter < 4; iter++) {
    // 48 stickers x 48 slots (6 colors x 8 free stickers each)
    const cost = others.map((idx) => {
      const row = new Array<number>(48);
      for (let slot = 0; slot < 48; slot++) row[slot] = colorDistance(labs[idx], refs[Math.floor(slot / 8)]);
      return row;
    });
    const cols = hungarian(cost);
    assigned = cols.map((slot) => Math.floor(slot / 8));
    // Re-estimate each color from all nine of its stickers (center included).
    for (let k = 0; k < 6; k++) {
      const sum: Lab = [...labs[k * 9 + 4]] as Lab;
      let n = 1;
      others.forEach((idx, i) => {
        if (assigned[i] === k) { sum[0] += labs[idx][0]; sum[1] += labs[idx][1]; sum[2] += labs[idx][2]; n++; }
      });
      refs[k] = [sum[0] / n, sum[1] / n, sum[2] / n];
    }
  }

  const letters = new Array<string>(54);
  for (let f = 0; f < 6; f++) letters[f * 9 + 4] = FACE_LETTERS[f];
  const uncertain: number[] = [];
  others.forEach((idx, i) => {
    letters[idx] = FACE_LETTERS[assigned[i]];
    const d = refs.map((r) => colorDistance(labs[idx], r));
    const mine = d[assigned[i]];
    const sorted = [...d].sort((a, b) => a - b);
    const nearest = d.indexOf(sorted[0]);
    const runnerUp = nearest === assigned[i] ? sorted[1] : sorted[0];
    if (nearest !== assigned[i] || runnerUp < mine * 1.5 + 4) uncertain.push(idx);
  });

  const similarCenters: [number, number][] = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
    if (colorDistance(faces[a][4].lab, faces[b][4].lab) < 12) similarCenters.push([a, b]);
  }

  return { facelets: letters.join(''), uncertain, similarCenters };
}
