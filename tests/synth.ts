/**
 * Synthetic "photos" of a cube face for testing the scanner without real images.
 * Includes rotation, tilt (perspective), lighting gradient, color cast, noise,
 * glare and several backgrounds. This is a stand-in for real photos, not a
 * guarantee about them.
 */
import type { RGBAImage } from '../src/lib/scan';

export const NOMINAL: Record<string, [number, number, number]> = {
  U: [238, 240, 243], // white
  R: [200, 28, 38],   // red
  F: [18, 165, 88],   // green
  D: [250, 208, 15],  // yellow
  L: [245, 118, 22],  // orange
  B: [30, 98, 230],   // blue
};

export interface PhotoOpts {
  width: number;
  height: number;
  /** pixels per sticker cell */
  cell: number;
  /** rotation of the cube in the photo, degrees */
  angle: number;
  /** offset of the face center from the photo center, pixels */
  dx: number;
  dy: number;
  /** color cast multipliers */
  tint: [number, number, number];
  brightness: number;
  /** left-to-right lighting change, e.g. 0.3 = +-15% */
  gradient: number;
  noise: number;
  glare: boolean;
  /** tilt: perspective shrink along the vertical axis */
  skew: number;
  bg: 'wood' | 'gray' | 'dark' | 'bright';
}

function gaussian(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const BG: Record<PhotoOpts['bg'], [number, number, number]> = {
  wood: [150, 105, 70],
  gray: [120, 122, 125],
  dark: [26, 26, 30],
  bright: [226, 223, 216],
};

/** Render one face (nine letters in reading order, e.g. "UUURRRFFF") as a photo. */
export function renderFace(letters: string, o: PhotoOpts, rand: () => number): RGBAImage {
  const { width: W, height: H } = o;
  const data = new Uint8ClampedArray(W * H * 4);
  const rad = (o.angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const wear = Array.from({ length: 9 }, () => 1 + (rand() - 0.5) * 0.12);
  const gx = o.glare ? W * (0.3 + 0.4 * rand()) : 0;
  const gy = o.glare ? H * (0.3 + 0.4 * rand()) : 0;
  const bgBase = BG[o.bg];

  const shade = (x: number, y: number): [number, number, number] => {
    const [u, v] = toPlane(x, y);
    const i = Math.round(u), j = Math.round(v);
    const du = u - i, dv = v - j;
    if (Math.abs(i) <= 1 && Math.abs(j) <= 1 && Math.pow(Math.abs(du), 6) + Math.pow(Math.abs(dv), 6) < Math.pow(0.45, 6)) {
      const k = (j + 1) * 3 + (i + 1);
      const c = NOMINAL[letters[k]];
      return [c[0] * wear[k], c[1] * wear[k], c[2] * wear[k]];
    }
    if (Math.abs(u) < 1.58 && Math.abs(v) < 1.58) return [22, 22, 26]; // black plastic
    const tex = 1 + 0.08 * Math.sin(x * 0.07 + y * 0.02) + 0.05 * Math.sin(y * 0.13);
    return [bgBase[0] * tex, bgBase[1] * tex, bgBase[2] * tex];
  };

  function toPlane(x: number, y: number): [number, number] {
    const px = x - (W / 2 + o.dx), py = y - (H / 2 + o.dy);
    const rx = px * cos + py * sin;
    const ry = -px * sin + py * cos;
    const u = rx / o.cell, v = ry / o.cell;
    const w = 1 + (o.skew * v) / 3;
    return [u / w, v / w];
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = shade(x + sx, y + sy);
        r += c[0]; g += c[1]; b += c[2];
      }
      r /= 4; g /= 4; b /= 4;
      const light = o.brightness * (1 + o.gradient * (x / W - 0.5));
      let glare = 0;
      if (o.glare) glare = 85 * Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / (2 * (0.07 * W) ** 2));
      const i = (y * W + x) * 4;
      data[i] = r * light * o.tint[0] + glare + gaussian(rand) * o.noise;
      data[i + 1] = g * light * o.tint[1] + glare + gaussian(rand) * o.noise;
      data[i + 2] = b * light * o.tint[2] + glare + gaussian(rand) * o.noise;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

const pick = <T>(arr: T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number, rand: () => number) => a + (b - a) * rand();

/** Random everyday-photo conditions. `severity` 0 = easy, 1 = hard. */
export function randomOpts(rand: () => number, severity = 0.5): PhotoOpts {
  const W = 320, H = 260;
  const tints: [number, number, number][] = [
    [1, 1, 1], [1.08, 1.0, 0.88], [0.92, 1.0, 1.1], [1.05, 1.0, 0.95], [0.95, 1.02, 1.0],
  ];
  return {
    width: W,
    height: H,
    cell: between(0.19, 0.27, rand) * Math.min(W, H),
    angle: between(-14, 14, rand) * (0.4 + severity),
    dx: between(-14, 14, rand),
    dy: between(-12, 12, rand),
    tint: pick(tints, rand),
    brightness: between(1 - 0.35 * severity, 1.1, rand),
    gradient: between(-0.3, 0.3, rand) * (0.3 + severity),
    noise: between(2, 4 + 8 * severity, rand),
    glare: rand() < 0.25 * (0.5 + severity),
    skew: between(-0.1, 0.1, rand) * (0.3 + severity),
    bg: pick(['wood', 'gray', 'dark', 'bright'] as const, rand),
  };
}
