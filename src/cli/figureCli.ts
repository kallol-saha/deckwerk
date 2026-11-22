/**
 * `slide-agent figure`: a slide's diagram (or some of its cells) as a figure
 * file for a paper — SVG, PNG or PDF, cropped to the drawing plus a border.
 * The SVG and PNG carry the `.drawio` file, as draw.io's exports do, so
 * `diagram import`/`apply` (and draw.io) reopen them as diagrams.
 *
 *   figure [deck] --slide <s> [--cells id,…] -o out.svg|.png|.pdf
 *          [--scale 2] [--border 10] [--transparent] [--background #fff] [--no-diagram]
 *
 * The drawing is the slide's own markup (src/shared/diagram/figureExport.ts);
 * Chromium (Electron, scripts/figure-export.cjs) measures the labels,
 * rasterises PNGs and prints PDFs, so all three match the slide.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Deck, Slide, SlideElement } from '@shared/deck.js';
import { diagramContentBounds } from '@shared/diagram/figure.js';
import {
  embedFontFaces, figureCells, figureDrawioXml, figureFontFamilies, figurePrintPage, figureSvg, figureUsesMath,
  figureViewBox, katexCssFor, measuringBounds, pngWithDiagram, type FigureFormat,
} from '@shared/diagram/figureExport.js';
import { figureRenderScript } from '@shared/diagram/figureRender.js';
import type { Rect } from '@shared/diagram/types.js';
import { electronChildEnv, headlessElectronArgs } from './electronDisplay.js';
import { removeTempDir, tempDir, trackHelper } from './scratch.js';

export interface FigureCliIo {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface FigureCliDeps {
  resolveDeckDir: (candidate: string | undefined) => string;
  loadDeck: (deckDir: string) => Promise<Deck>;
  usageError: (message: string) => Error;
}

const USAGE = 'usage: slide-agent figure [deck] --slide <s> [--cells id,…] -o <out.svg|.png|.pdf> '
  + '[--scale <n>] [--border <px>] [--transparent] [--background <colour>] [--no-diagram]';

const VALUED = new Set(['slide', 'cells', 'output', 'scale', 'border', 'background']);
const FLAGS = new Set([...VALUED, 'transparent', 'no-diagram']);

/**
 * A long-lived Electron page that measures, rasterises and prints figures
 * (scripts/figure-export.cjs), asked through request files in a scratch
 * folder: Electron has no usable stdin on Windows.
 */
class FigureBrowser {
  private next = 0;
  private stderr = '';
  private exited: Error | null = null;

  private constructor(private readonly child: ReturnType<typeof spawn>, private readonly dir: string) {
    child.stderr!.on('data', (chunk) => { this.stderr += String(chunk); });
    child.on('close', (code) => {
      this.exited = new Error(`The figure renderer stopped (exit ${code}). ${this.stderr.trim().slice(-2000)}`);
    });
  }

  static async start(): Promise<FigureBrowser> {
    const dir = await tempDir('slide-agent-figure-');
    const scriptPath = join(dir, 'figure-render.js');
    await writeFile(scriptPath, figureRenderScript(), 'utf8');
    const helper = fileURLToPath(new URL('../../scripts/figure-export.cjs', import.meta.url));
    const binary = process.versions.electron ? process.execPath : createRequire(import.meta.url)('electron') as unknown as string;
    const child = spawn(binary, [helper, scriptPath, dir, ...headlessElectronArgs()], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: electronChildEnv(),
    });
    trackHelper(child);
    return new FigureBrowser(child, dir);
  }

  private async send(request: Record<string, unknown>): Promise<number> {
    const n = this.next++;
    const tmp = join(this.dir, `req-${n}.tmp`);
    await writeFile(tmp, JSON.stringify(request), 'utf8');
    await rename(tmp, join(this.dir, `req-${n}.json`));
    return n;
  }

  async call<T>(request: Record<string, unknown>): Promise<T> {
    const n = await this.send(request);
    const answer = join(this.dir, `res-${n}.json`);
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const parsed = JSON.parse(await readFile(answer, 'utf8')) as { ok: boolean; value?: T; error?: string };
        if (!parsed.ok) throw new Error(parsed.error ?? 'figure renderer failed');
        return parsed.value as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (this.exited) throw this.exited;
      if (Date.now() > deadline) throw new Error(`The figure renderer did not answer (${String(request.cmd)}). ${this.stderr.trim().slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async close(): Promise<void> {
    if (!this.exited) {
      await this.send({ cmd: 'quit' });
      await new Promise((r) => { this.child.once('close', r); setTimeout(r, 5000); });
    }
    await removeTempDir(this.dir);
  }
}

function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

const FONT_TYPES: Record<string, string> = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** The deck's own @font-face rules (theme.css) for the families the figure uses, fonts inlined. */
async function deckFontCss(deckDir: string, families: ReadonlySet<string>): Promise<string> {
  let css = '';
  try {
    css = await readFile(join(deckDir, 'theme.css'), 'utf8');
  } catch {
    return '';
  }
  return embedFontFaces(css, families, async (url) => {
    if (/^[a-z]+:/i.test(url)) return null;
    try {
      const path = resolve(deckDir, decodeURIComponent(url.split(/[?#]/)[0]));
      const type = FONT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
      return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
    } catch {
      return null;
    }
  });
}

function slideFor(deck: Deck, ref: string | undefined, deps: FigureCliDeps): Slide {
  if (!ref) throw deps.usageError(`Name the slide with --slide <id|number>.\n${USAGE}`);
  let index = deck.slides.findIndex((s) => s.id === ref);
  if (index < 0 && /^\d+$/.test(ref)) index = Number(ref) - 1;
  const slide = deck.slides[index];
  if (!slide) throw deps.usageError(`No slide ${ref}; the deck has ${deck.slides.length}.`);
  return slide;
}

export async function figureCommand(argv: string[], io: FigureCliIo, deps: FigureCliDeps): Promise<number> {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o') {
      flags.set('output', argv[++i] ?? '');
      continue;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2);
    if (!FLAGS.has(name)) throw deps.usageError(`Unknown flag --${name} for figure.\n${USAGE}`);
    if (inline !== undefined) flags.set(name, inline);
    else if (VALUED.has(name)) flags.set(name, argv[++i] ?? '');
    else flags.set(name, true);
  }
  const output = flags.get('output');
  if (typeof output !== 'string' || !output) throw deps.usageError(`Name the file with -o <out.svg|.png|.pdf>.\n${USAGE}`);
  const format = extname(output).slice(1).toLowerCase() as FigureFormat;
  if (!['svg', 'png', 'pdf'].includes(format)) throw deps.usageError(`The output must end in .svg, .png or .pdf.\n${USAGE}`);
  const scale = flags.has('scale') ? Number(flags.get('scale')) : 1;
  if (!(scale > 0)) throw deps.usageError('--scale must be a positive number.');
  const border = flags.has('border') ? Number(flags.get('border')) : 10;
  if (!(border >= 0)) throw deps.usageError('--border must be 0 or more.');

  const deckDir = deps.resolveDeckDir(positional[0]);
  const deck = await deps.loadDeck(deckDir);
  const slide = slideFor(deck, flags.get('slide') as string | undefined, deps);
  // --cells takes element ids or draw.io cell ids.
  let ids: string[] | undefined;
  const cellsFlag = flags.get('cells');
  if (typeof cellsFlag === 'string' && cellsFlag) {
    const names = cellsFlag.split(',').map((s) => s.trim()).filter(Boolean);
    ids = [];
    for (const name of names) {
      const found = slide.elements.filter((el) => (el.type === 'vertex' || el.type === 'connector') && (el.id === name || el.cell === name));
      if (found.length === 0) throw deps.usageError(`Slide ${slide.id} has no diagram cell ${name}.`);
      ids.push(...found.map((el) => el.id));
    }
  }
  const cells = figureCells(slide, ids);
  if (cells.length === 0) throw deps.usageError(`Slide ${slide.id} has no diagram.`);

  const transparent = flags.get('transparent') === true;
  const backgroundFlag = flags.get('background');
  const background = format === 'pdf' || !transparent ? (typeof backgroundFlag === 'string' ? backgroundFlag : '#ffffff') : null;
  const drawio = flags.get('no-diagram') === true || format === 'pdf' ? null : await figureDrawioXml(slide, cells);

  const probe = figureSvg(slide, cells, { bounds: measuringBounds(cells), border: 0 });
  let css = await deckFontCss(deckDir, figureFontFamilies(probe));
  if (figureUsesMath(slide, cells)) {
    const { KATEX_CSS } = await import('@shared/katexInline.js');
    css = `${katexCssFor(probe, KATEX_CSS)}\n${css}`.trim();
  }
  const browser = await FigureBrowser.start();
  let bytes: Uint8Array | string;
  let vb: Rect;
  try {
    const measured = await browser.call<Rect | null>({ cmd: 'measure', svg: figureSvg(slide, cells, { bounds: measuringBounds(cells), border: 0, css }) });
    const bounds = union(measured, diagramContentBounds(cells as SlideElement[])) ?? { x: 0, y: 0, width: 1, height: 1 };
    vb = figureViewBox(bounds, border);
    const svg = figureSvg(slide, cells, { bounds, border, scale, background, css, drawio });
    const width = vb.width * scale;
    const height = vb.height * scale;
    if (format === 'svg') {
      bytes = svg;
    } else if (format === 'png') {
      const base64 = await browser.call<string>({ cmd: 'png', svg, width, height, background });
      bytes = pngWithDiagram(new Uint8Array(Buffer.from(base64, 'base64')), drawio, Math.round(96 * scale));
    } else {
      const base64 = await browser.call<string>({ cmd: 'pdf', html: figurePrintPage(svg, width, height, slide.name || 'Figure') });
      bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    }
  } finally {
    await browser.close();
  }
  const target = resolve(io.cwd, output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  io.out(`${JSON.stringify({
    status: 'exported',
    slide: slide.id,
    format,
    file: target,
    cells: cells.length,
    size: { width: Math.round(vb.width * scale), height: Math.round(vb.height * scale) },
    editable: drawio != null,
  }, null, 2)}\n`);
  return 0;
}
