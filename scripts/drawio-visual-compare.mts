/**
 * Draws every draw.io fixture with DeckWerk's diagram engine and compares
 * it, pixel by pixel, with draw.io's own rendering of the same file
 * (test/fixtures/drawio/<name>.<page>.png, made by drawio-reference.mts).
 *
 *   npx vite-node --config vitest.config.ts scripts/drawio-visual-compare.mts -- [--out <dir>] [fixture …]
 *
 * Writes <out>/<name>.<page>.svg (ours), .png (ours, rasterised exactly as
 * the references were) and .diff.png (the reference faded, differences in
 * red), and prints the fraction of differing pixels per page.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Slide } from '../src/shared/deck.js';
import { pageToElements } from '../src/shared/diagram/convert.js';
import { diagramFigureSvg } from '../src/shared/diagram/figure.js';
import {
  comparePngs, encodePng, listDrawioFixtures, loadDrawioFixture, rasterizeSvgFiles, referencePngPath,
} from '../test/support/drawioReference.js';

const args = process.argv.slice(2).filter((a) => a !== '--');
let out = join(tmpdir(), 'drawio-visual-compare');
const names: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = resolve(args[++i]);
  else names.push(args[i]);
}
await mkdir(out, { recursive: true });

const fixtures = names.length > 0 ? names : listDrawioFixtures();
const jobs: Array<{ name: string; page: number; svgPath: string; pngPath: string }> = [];
let n = 0;
for (const name of fixtures) {
  const fixture = await loadDrawioFixture(name);
  fixture.document.pages.forEach((page, index) => {
    const ref = fixture.reference.pages[index];
    const { elements } = pageToElements(page, {
      diagramId: 'd', placement: { origin: { x: 0, y: 0 }, scale: 1 }, makeId: (p) => `${p}-${++n}`,
    });
    const s = ref.svg.scale;
    const svg = diagramFigureSvg(elements as Slide['elements'], {
      viewBox: { x: -ref.svg.translate.x, y: -ref.svg.translate.y, width: ref.svg.width / s, height: ref.svg.height / s },
      width: ref.svg.width,
      height: ref.svg.height,
      background: page.model.background && page.model.background !== 'none' ? page.model.background : null,
    });
    const svgPath = join(out, `${name}.${index}.svg`);
    jobs.push({ name, page: index, svgPath, pngPath: join(out, `${name}.${index}.png`) });
    void writeFile(svgPath, svg, 'utf8');
  });
}
await new Promise((r) => setTimeout(r, 200));
await rasterizeSvgFiles(jobs.map((j) => ({ svgPath: j.svgPath, pngPath: j.pngPath })));
const rows: string[] = [];
for (const job of jobs) {
  const result = comparePngs(await readFile(referencePngPath(job.name, job.page)), await readFile(job.pngPath));
  await writeFile(join(out, `${job.name}.${job.page}.diff.png`), encodePng(result.diff));
  rows.push(`${(result.fraction * 100).toFixed(2).padStart(6)}%  ${job.name}.${job.page}${result.sizeMismatch ? '  (size mismatch)' : ''}`);
}
console.log(rows.join('\n'));
console.log(`\nwritten to ${out}`);
