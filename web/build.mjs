// Builds web/index.html: bundles the TypeScript solver and inlines it with the page logic.
//   node web/build.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = process.env.ESBUILD || 'esbuild';

const bundle = execFileSync(esbuild, [
  join(root, 'src/web-entry.ts'),
  '--bundle', '--format=iife', '--global-name=CubeSolver', '--minify', '--target=es2020',
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

if (bundle.includes('</script')) throw new Error('bundle contains </script');

let logic = readFileSync(join(root, 'web/cubelogic.js'), 'utf8');
// The module.exports line is only for tests; drop it from the page.
logic = logic.replace(/\nif \(typeof module[\s\S]*$/, '\n');

let site = readFileSync(join(root, 'web/site-info.js'), 'utf8');
site = site.replace(/\nif \(typeof module[\s\S]*$/, '\n');

let wca = readFileSync(join(root, 'web/wca.js'), 'utf8');
wca = wca.replace(/\nif \(typeof module[\s\S]*$/, '\n');

let timer = readFileSync(join(root, 'web/timer.js'), 'utf8');
timer = timer.replace(/\nif \(typeof module[\s\S]*$/, '\n');

const page = readFileSync(join(root, 'web/template.html'), 'utf8')
  .replace('/*__BUNDLE__*/', () => bundle)
  .replace('/*__LOGIC__*/', () => logic)
  .replace('/*__SCANUI__*/', () => readFileSync(join(root, 'web/scan-ui.js'), 'utf8'))
  .replace('/*__SITEINFO__*/', () => site)
  .replace('/*__WCA__*/', () => wca)
  .replace('/*__TIMER__*/', () => timer);

writeFileSync(join(root, 'web/index.html'), page);
// GitHub Pages serves the docs/ folder, so keep a copy there.
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/index.html'), page);
console.log(`web/index.html and docs/index.html written (${(page.length / 1024).toFixed(1)} KB, solver bundle ${(bundle.length / 1024).toFixed(1)} KB)`);
