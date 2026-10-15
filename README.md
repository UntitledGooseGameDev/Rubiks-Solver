# Rubik's Cube Solver

A real two-phase (Kociemba-style) Rubik's Cube solver in dependency-free TypeScript. It takes the 54 sticker colors of a cube, validates that the cube is physically possible, and returns a move sequence that solves it, typically 19–23 moves.

This is step one of a larger Rubik's Cube site (photo scanning, 3D animation and a WCA leaderboard are not built yet). The code lives in `src/lib/cube/` so it can be dropped into a Next.js app unchanged.

## Setup

Requires Node 20+ (tested on Node 22).

```bash
npm install
npm test            # 35 tests, about 4 minutes
npm run solve -- --scramble "R U R' U' F2 D L'"
npm run solve -- --random
npm run solve -- --facelets <54 stickers>
npm run typecheck
```

No API keys or external services are needed.

## Using it

```ts
import { solveFacelets } from './src/lib/cube';

// 54 stickers, faces in order U R F D L B, each face read left-to-right, top-to-bottom.
// Any six symbols work (e.g. W O G R B Y); the six center stickers say which face is which.
const result = solveFacelets(stickers);

if (result.ok) {
  result.moves;     // ["R'", "U2", "F", ...]  ready to animate move by move
  result.solution;  // "R' U2 F ..."
  result.length;    // number of moves
} else {
  result.code;      // e.g. "CORNER_TWIST", "BAD_COLOR_COUNT", "UNKNOWN_EDGE"
  result.message;   // beginner-friendly explanation
  result.facelets;  // sticker indices (0-53) to highlight for manual correction
}
```

Face layout (looking straight at each face, cube held with U on top and F toward you): for U the top of the diagram is the back; for D the top of the diagram is the front.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `timeoutMs` | 1000 | After the first solution is found, keep searching for a shorter one for at most this long. |
| `maxLength` | 30 | Never return a solution longer than this. |
| `targetLength` | 0 (off) | Stop as soon as a solution this short is found. Leave off unless you need speed over quality; the first solution found can be needlessly long for easy cubes. |

### Performance notes

- The first call builds lookup tables (about 0.7 s, then cached).
- Easy cubes finish instantly; hard cubes use the full `timeoutMs`.
- In a browser, run the solver in a Web Worker so the page doesn't freeze.

## How it works

1. **Validation** (`cubie.ts`): checks sticker counts, that the centers are distinct, that every corner and edge is a real piece and appears once, and the three physical-possibility rules (corner twist sum, edge flip sum, permutation parity). Errors name the problem and the stickers involved.
2. **Phase 1** (`solver.ts`, `coords.ts`): IDA* over all 18 moves until corner twist, edge flip and the middle-slice edge positions are solved, which puts the cube in the subgroup ⟨U, D, R2, L2, F2, B2⟩.
3. **Phase 2**: IDA* over those 10 moves to finish the cube. Both phases use pruning tables built by breadth-first search over coordinate pairs.
4. The search keeps improving the first solution until the time budget runs out.

## How it was tested

`npm test` runs 35 tests. The key idea is `tests/sim.ts`, a physical cube simulator that rotates stickers in 3D and shares no tables or conventions with the solver. It checks that:

- all 18 moves and 300 random 40-move scrambles produce the same stickers in the solver's model as in the simulator,
- every solution the solver returns actually solves the cube when replayed on the simulator, for single moves, all 324 two-move scrambles, 200 random scrambles, 200 uniformly random legal cube states (not built from scrambles), and the superflip,
- invalid cubes (twisted corner, flipped edge, swapped pieces, wrong counts, duplicate centers) are rejected with the right error.

Results from the last run: all 35 tests pass; random states averaged 20.3 moves (max 23); the superflip, whose optimal solution is 20 moves, was solved in 22.

## Web page

`web/` holds a single-file demo page: photo upload and scanning (below), an interactive 3D cube (plain CSS 3D, no libraries) with a clickable sticker net for painting your own cube, scramble and custom-move buttons, and solution playback (play/pause, step, jump to any move, speed slider). The solver runs in a Web Worker.

```bash
npm install            # installs esbuild, used only to bundle the solver
npm run build:web      # writes web/index.html
```

Open `web/index.html` in a browser. `web/cubelogic.js` (sticker geometry and move logic used by the page) is covered by `tests/web.test.ts`, which checks it against the solver's independent cube model. The page itself was exercised once in headless Chromium: solve in the worker, play back to a solved cube, validation highlighting, and no horizontal overflow at phone width.

## Photo scanning

The page can read a cube from six uploaded photos (everything runs in the browser; nothing is uploaded anywhere). The engine is in `src/lib/scan/scanner.ts`.

**Taking the photos.** Hold the cube with any face up and one face toward you. Photograph, filling the frame and straight on: Front, then turn the cube to show Right, Back and Left (Up face at the top of each photo). Then tilt it to show Up (Front face at the bottom of the photo) and Down (Front face at the top). On a phone, the file picker offers the camera. Photos can be added one by one, dragged onto a tile, or picked together (assigned in file-name order).

**How it works.**
1. `autoFit` finds the 3x3 grid in each photo by scoring candidate placements on uniform sticker-colored cells and on dark lines between the stickers and around the face, checked along their full length. It searches coarse to fine and takes about 0.15 s per photo.
2. `readFaceSamples` takes the median color of a small patch at each sticker center.
3. `classifyCube` uses the six center stickers as the six color references, then assigns the other 48 stickers with a minimum-cost assignment (Hungarian algorithm) under the rule that each color appears exactly nine times. That rule is what keeps results stable when lighting differs between photos. Stickers it is unsure about are marked with a dashed outline.
4. The result goes to the cube view and the solver. If the colors don't make a possible cube, the existing validation names the problem and highlights the suspect stickers.

**When it goes wrong.** Each photo opens in an editor: drag to move the grid, sliders for size and tilt, Auto-fit, and Rotate photo (for sideways photos). Stickers can also be repainted in the net.

**How well it works.** Tested on synthetic photos (tilt, perspective, color cast, lighting gradients, noise, glare, four background types), not on real photographs, so treat these as a guide rather than a guarantee:

| Conditions | Cubes read exactly |
| --- | --- |
| Easy and moderate | 60 of 60 |
| Harsh | 29 of 30 |
| Extreme (strong tilt, dim, glare) | 24 of 30 |

Every wrong reading in the extreme batch was an impossible cube that validation rejected, so a bad reading shows an error instead of a wrong solution. A wrong reading that happens to be a possible cube would not be caught. The grid-fit score does not reliably predict a bad fit, so the page shows the detected grid on every photo for you to check.

Known limits: the grid is a rotated square, so photos taken at a steep angle may need manual adjustment; HEIC files only work in browsers that can decode them; cubes with unusual sticker colors are read by their centers but shown in standard colors snapped to the nearest match.

## Not built yet

The WCA leaderboard.
