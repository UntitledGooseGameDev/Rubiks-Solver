/**
 * Version number and update log. This is the single place both are kept: the page
 * header, the Update log page and the tests all read it. Newest release first.
 */
const SiteInfo = {
  version: '2.0',
  repo: 'https://github.com/UntitledGooseGameDev/Rubiks-Solver',
  changelog: [
    {
      version: '2.0',
      date: '2026-10-15',
      title: 'Learn to solve, not just copy moves',
      sections: [
        {
          heading: 'New',
          items: [
            'Method switcher: solve with the Beginner method, with CFOP, or with Fastest (the original shortest-moves notation).',
            'Beginner method uses named algorithms: Righty and Lefty for the bottom corners, the right-hand and left-hand algorithms for the middle layer, the top-cross algorithm, Sune + U, Niklas, and the corner twist (R’ D’ R D).',
            'CFOP method: Cross, four F2L pairs, two-look OLL (line and L-shape, Sune, Antisune, H, Pi and U cases) and all 21 PLL algorithms.',
            'Every step is a named algorithm with a dropdown that shows the exact moves. Click a step to jump to it, or use “Show all moves” to open every dropdown.',
            'Version number next to the title, this update log, and a troubleshooting page with a button that copies details for a bug report.',
          ],
        },
        {
          heading: 'Changed',
          items: [
            'Fastest mode now splits its moves into the solver’s two phases instead of one long list.',
            'The Solution section shows which step you are on while the cube plays.',
          ],
        },
        {
          heading: 'Good to know',
          items: [
            'Beginner and CFOP build the bottom layer first and finish on top. Keep the cube held the way the 3D view shows it while you follow the steps.',
            'CFOP solves OLL in two looks. The 57 single-look OLL algorithms are not included.',
          ],
        },
      ],
    },
    {
      version: '1.2',
      date: '2026-10-14',
      title: 'Clearer photo labels',
      sections: [
        {
          heading: 'Changed',
          items: [
            'Photo tiles are now named by the center color of the face (Green center, Red center, and so on) instead of Front, Right, Back and Left, with short notes on how to hold the cube for each.',
          ],
        },
      ],
    },
    {
      version: '1.1',
      date: '2026-10-14',
      title: 'Scan your cube from photos',
      sections: [
        {
          heading: 'New',
          items: [
            'Upload six photos, one per face. Sticker colors are read automatically in your browser and the cube is solved right away.',
            'Photo editor: drag the sticker grid, adjust size and tilt, auto-fit, rotate a sideways photo, or replace a photo.',
            'Stickers the scan was unsure about get a dashed outline so you can double-check them.',
          ],
        },
      ],
    },
    {
      version: '1.0',
      date: '2026-10-14',
      title: 'First release',
      sections: [
        {
          heading: 'New',
          items: [
            'Two-phase (Kociemba-style) solver that returns a correct solution for any valid cube, usually in 19 to 23 moves.',
            'Interactive 3D cube with move-by-move animation, play and pause, step forward and back, and a speed slider.',
            'Paint your own cube on a sticker net, with clear errors and highlighted stickers when the colors do not make a possible cube.',
          ],
        },
      ],
    },
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = SiteInfo;
