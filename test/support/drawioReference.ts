/**
 * draw.io as the reference for DeckWerk's diagram port.
 *
 * `test/fixtures/drawio/<name>.drawio` are small focused diagrams. For each,
 * `scripts/drawio-reference.mts` loaded draw.io 32.7.4's own code in Electron
 * and recorded what it computed, committed beside the fixture:
 *
 * - `<name>.reference.json` — per page and per cell: the resolved style, the
 *   absolute state bounds, edge routes (`absolutePoints`), terminal and
 *   perimeter points, the label box, its measured bounding box, margin and
 *   the exact `text()` call draw.io's canvas received (see DrawioReference).
 * - `<name>.<page>.svg` — draw.io's SVG export of the page (Graph.getSvg).
 * - `<name>.<page>.png` — that SVG rasterised by Chromium at 2x over white.
 *
 * A comparison test renders the same fixture with the port, positions its
 * SVG with the page's `svg.translate`/`svg.width`/`svg.height` (so both crop
 * the same page rectangle), rasterises it with `rasterizeSvgFiles` (the very
 * routine that made the reference PNGs) and compares with `comparePngs`.
 * Rasterising launches Electron: a suite that calls it belongs in the browser
 * tier (test/testTiers.ts) and should mark itself as such.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { electronChildEnv, headlessElectronArgs } from '../../src/cli/electronDisplay.js';
import type { DrawioDocument } from '../../src/shared/diagram/model.js';

export const DRAWIO_FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/drawio');

/** Scale and background of the reference PNGs. */
export const REFERENCE_PNG_SCALE = 2;
export const REFERENCE_PNG_BACKGROUND = '#ffffff';

// --- the reference JSON ------------------------------------------------------------
//
// Every number is rounded to 3 decimals and every object's keys are sorted,
// so a regenerated reference diffs line by line. Coordinates are page
// coordinates: draw.io's view at scale 1 and translate 0.

export interface RefPoint { x: number; y: number }
export interface RefRect { x: number; y: number; width: number; height: number }

export interface DrawioReference {
  /** The fixture's file name, e.g. `edges-orthogonal.drawio`. */
  fixture: string;
  generator: {
    /** draw.io release (EditorUi.VERSION) and the bundles that were loaded. */
    drawio: string;
    bundles: string[];
    /** Text metrics depend on these. */
    electron: string;
    chromium: string;
    platform: string;
  };
  pages: ReferencePage[];
}

export interface ReferencePage {
  index: number;
  /** `<diagram id>` and `name`. */
  id: string;
  name: string;
  /** The page's `<mxGraphModel>` attributes (background, shadow, …). */
  model: Record<string, string>;
  /** graph.getGraphBounds(). */
  graphBounds: RefRect | null;
  svg: {
    file: string;
    /** Size of the SVG in px (its width/height attributes). */
    width: number;
    height: number;
    scale: number;
    border: number;
    /** Page point (x, y) is at SVG point ((x + translate.x) * scale, (y + translate.y) * scale). */
    translate: RefPoint;
    /** The page background passed to getSvg (null: transparent). */
    background: string | null;
  };
  png: { file: string; width: number; height: number; scale: number; background: string };
  /** Every cell of the page, depth-first from the root (draw.io's paint order). */
  cells: ReferenceCell[];
}

export type StyleValue = string | number | boolean | null;

export interface ReferenceCell {
  id: string;
  kind: 'root' | 'layer' | 'vertex' | 'edge' | 'other';
  parent: string | null;
  /** Index in `cells`. */
  order: number;
  /** The cell's style string as stored. */
  style: string;
  /** graph.getLabel: the label draw.io shows (placeholders resolved). */
  label: string | null;
  /** The cell's own visible flag. */
  visible: boolean;
  /** The geometry as draw.io decoded it (parent-relative, as in the file). */
  geometry: RefGeometry | null;
  /** The style draw.io drew with (state.style, else graph.getCellStyle); functions by registry name. */
  resolvedStyle: Record<string, StyleValue>;
  /** What draw.io computed for the cell; null when it drew nothing (hidden, hidden layer, root, layer). */
  state: ReferenceState | null;
}

export interface RefGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  relative: boolean;
  offset: RefPoint | null;
  points: RefPoint[] | null;
  sourcePoint: RefPoint | null;
  targetPoint: RefPoint | null;
}

export interface ReferenceState {
  /** Absolute bounds of the cell state. For edges, the bounds of the route. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** state.origin (absolute origin of the cell) and state.absoluteOffset (label anchor offset). */
  origin: RefPoint;
  absoluteOffset: RefPoint;
  shape: ReferenceShape | null;
  text: ReferenceText | null;
  /** Vertices: where draw.io's perimeter meets rays from the centre. */
  perimeter?: ReferencePerimeter;
  /** Edges: the route. */
  edge?: ReferenceEdge;
}

export interface ReferenceShape {
  /** The style's `shape` value. */
  name: string | null;
  /** The registered shape class draw.io used (`stencil` for stencils), e.g. `rectangle` for an unknown name. */
  implementation: string | null;
  stencil: boolean;
  bounds: RefRect | null;
  /** Painted extent (shape.boundingBox) including stroke and markers. */
  boundingBox: RefRect | null;
  rotation: number;
  direction: string | null;
  flipH: boolean;
  flipV: boolean;
  strokeWidth: number | null;
}

export interface ReferenceText {
  /** Rendered as HTML (html=1 or an element value). */
  html: boolean;
  /** The label box mxCellRenderer.getLabelBounds gave the mxText. */
  bounds: RefRect | null;
  /** The measured label extent (mxText.boundingBox), rotated. */
  boundingBox: RefRect | null;
  unrotatedBoundingBox: RefRect | null;
  /** mxText.margin: fractions of the label size the text box is shifted by (align/valign). */
  margin: RefPoint | null;
  /** mxText spacing; top/right/bottom/left already include `base`. */
  spacing: { base: number; top: number; right: number; bottom: number; left: number };
  align: string | null;
  valign: string | null;
  horizontal: boolean;
  /** mxText.getTextRotation(). */
  rotation: number;
  wrap: boolean;
  clipped: boolean;
  overflow: string | null;
  font: { size: number; family: string; style: number; color: string | null };
  background: string | null;
  border: string | null;
  opacity: number;
  textOpacity: number;
  textDirection: string | null;
  /** Each `canvas.text(...)` call mxText.paint made during the SVG export. */
  draws: CanvasTextCall[];
}

export interface CanvasTextCall {
  /** Page coordinates as passed to mxAbstractCanvas2D.text (before the canvas translate). */
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  align: string | null;
  valign: string | null;
  wrap: boolean;
  format: string;
  overflow: string | null;
  clip: boolean;
  rotation: number;
  dir: string | null;
  /** The canvas state at the call: translate (dx, dy), rotation, font. */
  canvas: Record<string, StyleValue>;
}

export interface ReferencePerimeter {
  /** Registry name of the perimeter function, null when there is none. */
  name: string | null;
  /** view.getPerimeterPoint(state, toward, false, 0) for 16 rays from the centre, every 22.5°. */
  probes: Array<{ angle: number; toward: RefPoint; point: RefPoint | null }>;
}

export interface ReferenceEdge {
  /** state.absolutePoints: terminal point, routed points, terminal point. */
  points: RefPoint[];
  /** Visible terminal cells. */
  source: string | null;
  target: string | null;
  /** First and last of `points`: where the route meets the terminals (or the loose ends). */
  sourcePoint: RefPoint | null;
  targetPoint: RefPoint | null;
  /** Registry name of the edge style function that routed it (`loopEdgeStyle` for loops), null for straight. */
  edgeStyle: string | null;
  length: number;
  terminalDistance: number;
  segments: number[] | null;
}

// --- fixtures ----------------------------------------------------------------------

export function fixturePath(name: string): string {
  return join(DRAWIO_FIXTURE_DIR, `${name}.drawio`);
}

export function referenceJsonPath(name: string): string {
  return join(DRAWIO_FIXTURE_DIR, `${name}.reference.json`);
}

export function referenceSvgPath(name: string, page: number): string {
  return join(DRAWIO_FIXTURE_DIR, `${name}.${page}.svg`);
}

export function referencePngPath(name: string, page: number): string {
  return join(DRAWIO_FIXTURE_DIR, `${name}.${page}.png`);
}

/** Fixture names (without `.drawio`), sorted. */
export function listDrawioFixtures(): string[] {
  if (!existsSync(DRAWIO_FIXTURE_DIR)) return [];
  return readdirSync(DRAWIO_FIXTURE_DIR)
    .filter((file) => file.endsWith('.drawio'))
    .map((file) => file.slice(0, -'.drawio'.length))
    .sort();
}

export interface LoadedDrawioFixture {
  name: string;
  path: string;
  /** The `.drawio` text. */
  text: string;
  /** The file as DeckWerk's reader sees it. */
  document: DrawioDocument;
  /** What draw.io computed. */
  reference: DrawioReference;
}

export async function loadDrawioFixture(name: string): Promise<LoadedDrawioFixture> {
  const path = fixturePath(name);
  const text = await readFile(path, 'utf8');
  const reference = JSON.parse(await readFile(referenceJsonPath(name), 'utf8')) as DrawioReference;
  // Imported here, not at the top: scripts/drawio-reference.mts uses this
  // module too, and regenerating the reference must not depend on the port.
  const { readDrawio } = await import('../../src/shared/diagram/drawioFile.js');
  return { name, path, text, document: await readDrawio(text), reference };
}

/** A page's reference cells by id. */
export function referenceCells(page: ReferencePage): Map<string, ReferenceCell> {
  return new Map(page.cells.map((cell) => [cell.id, cell]));
}

// --- PNG -------------------------------------------------------------------------------

/** 8-bit RGBA pixels, row-major. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decodes a non-interlaced 8-bit PNG (grey, RGB, palette, grey+alpha or
 * RGBA — what Chromium and Electron write) to RGBA.
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Not a PNG file.');
  }
  let at = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported.');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error(`Bad PNG filter ${filter}.`);
      out[x] = value & 0xff;
    }
    previous = out;
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const o = i * 4;
    if (colorType === 6) {
      data[o] = pixels[j]; data[o + 1] = pixels[j + 1]; data[o + 2] = pixels[j + 2]; data[o + 3] = pixels[j + 3];
    } else if (colorType === 2) {
      data[o] = pixels[j]; data[o + 1] = pixels[j + 1]; data[o + 2] = pixels[j + 2]; data[o + 3] = 255;
    } else if (colorType === 0) {
      data[o] = data[o + 1] = data[o + 2] = pixels[j]; data[o + 3] = 255;
    } else if (colorType === 4) {
      data[o] = data[o + 1] = data[o + 2] = pixels[j]; data[o + 3] = pixels[j + 1];
    } else {
      const index = pixels[j];
      if (!palette) throw new Error('Palette PNG without PLTE.');
      data[o] = palette[index * 3]; data[o + 1] = palette[index * 3 + 1]; data[o + 2] = palette[index * 3 + 2];
      data[o + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  return { width, height, data };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'latin1');
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

/** Encodes RGBA pixels as a PNG, e.g. to write a diff image next to a failing comparison. */
export function encodePng(image: RgbaImage): Buffer {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

// --- pixel comparison ------------------------------------------------------------------

interface PixelCompareOptions {
  /** Per-channel difference that still counts as equal (0-255). Default 24. */
  channelTolerance?: number;
  /** Larger tolerance where either image has an edge (anti-aliasing). Default: channelTolerance. */
  edgeChannelTolerance?: number;
  /** A pixel also matches a pixel this many px away (sub-pixel placement). Default 1. */
  radius?: number;
}

const { comparePixelBuffers } = createRequire(import.meta.url)('../../scripts/pixel-compare.cjs') as {
  comparePixelBuffers: (
    reference: Uint8Array, actual: Uint8Array, width: number, height: number, options?: PixelCompareOptions,
  ) => { differing: number; total: number; different: Uint8Array };
};

export interface PixelComparison {
  width: number;
  height: number;
  /** True when the images had different sizes (compared on the larger canvas, padded with white). */
  sizeMismatch: boolean;
  differing: number;
  total: number;
  /** differing / total. */
  fraction: number;
  /** The reference faded, with differing pixels in red. */
  diff: RgbaImage;
}

function padTo(image: RgbaImage, width: number, height: number): Uint8Array {
  if (image.width === width && image.height === height) return image.data;
  const out = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < image.height; y++) {
    out.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), y * width * 4);
  }
  return out;
}

/** Flattens alpha onto white, so transparent and white compare equal. */
function flatten(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out[i] = Math.round(data[i] * a + 255 * (1 - a));
    out[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    out[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

function asImage(input: RgbaImage | Uint8Array): RgbaImage {
  return input instanceof Uint8Array ? decodePng(input) : input;
}

/**
 * The fraction of pixels that differ beyond the tolerance, using the same
 * anti-aliasing-aware rule as DeckWerk's other image comparisons
 * (scripts/pixel-compare.cjs). Accepts decoded images or PNG bytes.
 */
export function comparePngs(
  referenceInput: RgbaImage | Uint8Array,
  actualInput: RgbaImage | Uint8Array,
  options: PixelCompareOptions = {},
): PixelComparison {
  const reference = asImage(referenceInput);
  const actual = asImage(actualInput);
  const width = Math.max(reference.width, actual.width);
  const height = Math.max(reference.height, actual.height);
  const a = flatten(padTo(reference, width, height));
  const b = flatten(padTo(actual, width, height));
  const { differing, total, different } = comparePixelBuffers(a, b, width, height, {
    channelTolerance: options.channelTolerance ?? 24,
    edgeChannelTolerance: options.edgeChannelTolerance,
    radius: options.radius ?? 1,
  });
  const diff = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (different[i]) {
      diff[o] = 255; diff[o + 1] = 0; diff[o + 2] = 0;
    } else {
      diff[o] = 255 - ((255 - a[o]) >> 2);
      diff[o + 1] = 255 - ((255 - a[o + 1]) >> 2);
      diff[o + 2] = 255 - ((255 - a[o + 2]) >> 2);
    }
    diff[o + 3] = 255;
  }
  return {
    width,
    height,
    sizeMismatch: reference.width !== actual.width || reference.height !== actual.height,
    differing,
    total,
    fraction: total === 0 ? 0 : differing / total,
    diff: { width, height, data: diff },
  };
}

// --- Electron ----------------------------------------------------------------------

function electronBinary(): string {
  if (process.versions.electron) return process.execPath;
  return createRequire(import.meta.url)('electron') as unknown as string;
}

export interface ElectronScriptOptions {
  timeoutMs: number;
  /** Each line the script writes to stderr. */
  onLine?: (line: string) => void;
}

/**
 * Runs `source` as an Electron main script with `job` (JSON) as its only
 * argument and returns its stdout. The script reads the job from
 * `process.argv[2]`. Used by the reference generator and the rasteriser.
 */
export async function runElectronScript(source: string, job: unknown, options: ElectronScriptOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'drawio-reference-electron-'));
  const scriptPath = join(dir, 'main.cjs');
  const jobPath = join(dir, 'job.json');
  await writeFile(scriptPath, source, 'utf8');
  await writeFile(jobPath, JSON.stringify(job), 'utf8');
  try {
    return await new Promise<string>((resolvePromise, reject) => {
      const child = spawn(electronBinary(), [scriptPath, jobPath, ...headlessElectronArgs()], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: electronChildEnv(),
      });
      let out = '';
      let err = '';
      let partial = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Electron script timed out after ${Math.round(options.timeoutMs / 1000)} s.\n${err}`));
      }, options.timeoutMs);
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => {
        err += chunk;
        if (!options.onLine) return;
        const lines = (partial + String(chunk)).split(/\r?\n/);
        partial = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) options.onLine(line.trim());
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolvePromise(out);
        else reject(new Error(`Electron script failed (exit ${code}).\n${err.trim()}`));
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Electron main script of `rasterizeSvgFiles`: shows each SVG as an <img>
 * at `scale` over the background in a hidden offscreen window and captures
 * it. An <img> (not a canvas, which foreignObject labels would taint) is how
 * a browser displays an .svg file; software rendering at device scale 1
 * keeps the output deterministic on one machine.
 */
const RASTERIZE_MAIN = String.raw`
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{margin:0;padding:0;overflow:hidden}img{display:block}</style></head><body><script>' +
  'window.show = async function (src, scale, background) {' +
  '  document.body.style.background = background;' +
  '  const img = new Image();' +
  '  img.src = src;' +
  '  await img.decode();' +
  '  const width = Math.round(img.naturalWidth * scale);' +
  '  const height = Math.round(img.naturalHeight * scale);' +
  '  img.width = width; img.height = height;' +
  '  document.body.replaceChildren(img);' +
  '  return { width, height };' +
  '};' +
  'window.settle = function (width, height) {' +
  '  return new Promise(function (resolve) {' +
  '    function check() {' +
  '      if (window.innerWidth === width && window.innerHeight === height) {' +
  '        requestAnimationFrame(function () { requestAnimationFrame(resolve); });' +
  '      } else setTimeout(check, 10);' +
  '    }' +
  '    check();' +
  '  });' +
  '};' +
  '</' + 'script></body></html>';

app.whenReady().then(async () => {
  const pagePath = join(job.dir, 'rasterize.html');
  writeFileSync(pagePath, PAGE);
  const win = new BrowserWindow({
    width: 400, height: 300, show: false, useContentSize: true, enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadURL(pathToFileURL(pagePath).href);
  const results = [];
  for (const item of job.items) {
    const size = await win.webContents.executeJavaScript('show(' + JSON.stringify(pathToFileURL(item.svgPath).href) +
      ', ' + item.scale + ', ' + JSON.stringify(item.background) + ')');
    win.setContentSize(size.width, size.height);
    await win.webContents.executeJavaScript('settle(' + size.width + ', ' + size.height + ')');
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size.width, height: size.height });
    const got = image.getSize();
    if (got.width !== size.width || got.height !== size.height) {
      throw new Error(item.svgPath + ': captured ' + got.width + 'x' + got.height + ', expected ' + size.width + 'x' + size.height);
    }
    writeFileSync(item.pngPath, image.toPNG());
    results.push({ pngPath: item.pngPath, width: size.width, height: size.height });
  }
  process.stdout.write(JSON.stringify(results));
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String((error && error.stack) || error));
  app.exit(1);
});
`;

export interface RasterizeJob {
  svgPath: string;
  pngPath: string;
  /** Default REFERENCE_PNG_SCALE. */
  scale?: number;
  /** CSS colour under the SVG. Default REFERENCE_PNG_BACKGROUND. */
  background?: string;
}

/**
 * Rasterises SVG files to PNGs exactly as the draw.io reference PNGs were
 * made, in one Electron run. Launches Electron.
 */
export async function rasterizeSvgFiles(jobs: RasterizeJob[]): Promise<Array<{ pngPath: string; width: number; height: number }>> {
  if (jobs.length === 0) return [];
  const dir = await mkdtemp(join(tmpdir(), 'drawio-rasterize-'));
  try {
    const out = await runElectronScript(RASTERIZE_MAIN, {
      dir,
      items: jobs.map((job) => ({
        svgPath: resolve(job.svgPath),
        pngPath: resolve(job.pngPath),
        scale: job.scale ?? REFERENCE_PNG_SCALE,
        background: job.background ?? REFERENCE_PNG_BACKGROUND,
      })),
    }, { timeoutMs: 60_000 + jobs.length * 5_000 });
    return JSON.parse(out) as Array<{ pngPath: string; width: number; height: number }>;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
