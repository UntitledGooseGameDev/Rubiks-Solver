/**
 * Version number and update log. This is the single place both are kept: the page
 * header, the Update log page and the tests all read it. Newest release first.
 */
const SiteInfo = {
  version: '2.9',
  repo: 'https://github.com/UntitledGooseGameDev/Rubiks-Solver',
  changelog: [
    {
      version: '2.9',
      date: '2026-10-16',
      title: '2×2 solver',
      sections: [
        {
          heading: 'New',
          items: [
            '2×2 page: paint your 2×2, scramble it, apply your own moves and watch it turn in 3D.',
            'The solver finds the shortest possible solution (never more than 11 moves) by searching all 3,674,160 positions of a 2×2. Press play to watch it, or click a move to jump to it.',
          ],
        },
        {
          heading: 'Good to know',
          items: [
            'Photo scanning is for 3×3 cubes only. A 2×2 has no center stickers, so the solver works out which color is which face from the corners. Solutions use U, R and F turns only.',
          ],
        },
      ],
    },
    {
      version: '2.8',
      date: '2026-10-16',
      title: 'Short fixes for nearly solved cubes',
      sections: [
        {
          heading: 'Fixed',
          items: [
            'Beginner and CFOP no longer rebuild a whole cube that is only a few turns from solved. If 8 moves or fewer solve it, you get just those moves, for example one turn for a cube scrambled with a single R.',
          ],
        },
      ],
    },
    {
      version: '2.7',
      date: '2026-10-16',
      title: 'Slice moves',
      sections: [
        {
          heading: 'New',
          items: [
            'Apply your own moves now accepts the slice moves M, E and S (with 2 and ’), animated on the 3D cube. M turns like L, E like D and S like F.',
            'The solver works from the cube’s center colors, so you can scramble with slice moves and still solve it.',
          ],
        },
        {
          heading: 'Good to know',
          items: [
            'Solutions still use face turns only (U R F D L B). Slice moves are for your own moves.',
          ],
        },
      ],
    },
    {
      version: '2.6',
      date: '2026-10-16',
      title: 'Live competitions',
      sections: [
        {
          heading: 'New',
          items: [
            'Live page: WCA competitions that are on today and ones starting in the next 3 days, with flag, place, dates and a link to the competition on the WCA website. Loaded from the WCA’s own competition list.',
          ],
        },
        {
          heading: 'Good to know',
          items: [
            'This shows which competitions are running, not live results. Each card opens the competition on worldcubeassociation.org, and there is a link to WCA Live.',
          ],
        },
      ],
    },
    {
      version: '2.5',
      date: '2026-10-16',
      title: 'Timer',
      sections: [
        {
          heading: 'New',
          items: [
            'Timer page: hold Space until the time turns green, release to start, press any key to stop. Works by touch on a phone too.',
            'A random-move scramble for each solve, optional 15-second inspection with +2 and DNF, and +2 / DNF / delete on any solve.',
            'Best, mean, average of 5, best average of 5 and average of 12 (fastest and slowest dropped, as in WCA averages). Solves are saved in your browser.',
          ],
        },
      ],
    },
    {
      version: '2.4',
      date: '2026-10-16',
      title: 'Flags on the leaderboard',
      sections: [
        { heading: 'New', items: ['Country flags next to each name on the WCA Top 100 page.'] },
        { heading: 'Fixed', items: ['The WCA Top 100 page now loads the real ranking files.'] },
      ],
    },
    {
      version: '2.3',
      date: '2026-10-15',
      title: 'WCA Top 100',
      sections: [
        {
          heading: 'New',
          items: [
            'WCA Top 100 page: the world’s fastest official results for 15 events, single or average, loaded in your browser from the World Cube Association results export (republished daily by an unofficial public API). Names link to the WCA profile.',
          ],
        },
        {
          heading: 'Good to know',
          items: [
            'The page needs an internet connection. If the data cannot be loaded, it says so and links to the official WCA rankings.',
          ],
        },
      ],
    },
    {
      version: '2.2',
      date: '2026-10-15',
      title: 'Daisy first, four algorithms',
      sections: [
        {
          heading: 'Changed',
          items: [
            'Beginner now starts with the daisy (the four first-color edges around the opposite center), then turns each petal down to make the cross.',
            'The middle-layer algorithms are now called Righty and Lefty, so Beginner uses just Righty, Lefty, Sune and Niklas. The top cross is shown as F, Righty, F’ and the corner twist as Righty on the bottom.',
          ],
        },
      ],
    },
    {
      version: '2.1',
      date: '2026-10-15',
      title: 'Start with white',
      sections: [
        {
          heading: 'New',
          items: [
            'Start with: choose the color for the first layer and cross in Beginner and CFOP. Any of the six colors works.',
            'The 3D cube turns so your chosen color is on the bottom, and the steps tell you which colors are on top and facing you.',
          ],
        },
        {
          heading: 'Changed',
          items: [
            'White is now the default first color. Before, the cross was always yellow.',
            'Moves like R and U in Beginner and CFOP always mean the right and top of the cube as you hold it in the 3D view.',
          ],
        },
      ],
    },
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
