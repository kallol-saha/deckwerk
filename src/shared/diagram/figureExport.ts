/**
 * Figure export: a slide's diagram, or some of its cells, as a standalone
 * SVG, PNG or PDF for a paper, as draw.io's File ▸ Export as does
 * (js/diagramly/EditorUi.js exportSvg/exportImage, Editor.js
 * writeGraphModelToPng; jgraph/drawio 32.7.4, Apache-2.0):
 *
 * - cropped to what is drawn plus a border;
 * - vector: the SVG is the slide's own markup (labels are HTML in
 *   foreignObjects, with draw.io's <text> fallback for viewers without
 *   them), and PDF is printed from it by Chromium, so text stays text;
 * - the fonts the labels use are embedded (KaTeX's for typeset math, and
 *   any @font-face the caller provides);
 * - editable: the SVG carries the `.drawio` file in its `content`
 *   attribute and the PNG in a tEXt chunk named `mxfile`, exactly as
 *   draw.io writes them, so either reopens as a diagram here or in draw.io.
 *
 * This module is DOM-free. Measuring what labels cover, rasterising and
 * printing need a browser: figureRender.ts (editor, collab, CLI's Electron).
 */

import type { ConnectorEl, Slide, SlideElement } from '../deck.js';
import { slideDiagramIds, slideToDrawio } from './convert.js';
import { readDrawio, writeDrawio } from './drawioFile.js';
import { diagramContentBounds, diagramFigureSvg } from './figure.js';
import type { DrawioDocument } from './model.js';
import type { Rect } from './types.js';

export type FigureFormat = 'svg' | 'png' | 'pdf';

export interface FigureRequest {
  /** Element ids of the cells to export; empty or absent: every diagram cell of the slide. */
  cells?: readonly string[];
  /** Space around the drawing, in px of the output at scale 1 (draw.io's Border Width). */
  border?: number;
  /** Size factor (PNG resolution, SVG/PDF size); default 1. */
  scale?: number;
  /** Background colour; null or 'none' for transparent. Default: transparent for SVG and PNG. */
  background?: string | null;
}

type DiagramCellEl = Extract<SlideElement, { type: 'vertex' | 'connector' }>;

function isCell(el: SlideElement): el is DiagramCellEl {
  return el.type === 'vertex' || el.type === 'connector';
}

/**
 * The cells a figure shows: the chosen cells and everything inside them (a
 * group or container brings its children), or every diagram cell of the
 * slide. A connector whose end is left out keeps that end where it is
 * drawn, as a loose end, so the file reopens with the same picture.
 */
export function figureCells(slide: Pick<Slide, 'elements'>, cellIds?: readonly string[]): DiagramCellEl[] {
  const all = slide.elements.filter(isCell);
  if (!cellIds || cellIds.length === 0) return all;
  const wanted = new Set(cellIds);
  const chosen = all.filter((el) => wanted.has(el.id));
  const byParent = new Map<string, DiagramCellEl[]>();
  for (const el of all) {
    if (el.parent == null) continue;
    const key = `${el.diagram}\u0000${el.parent}`;
    byParent.set(key, [...(byParent.get(key) ?? []), el]);
  }
  const ids = new Set<string>();
  const visit = (el: DiagramCellEl) => {
    if (ids.has(el.id)) return;
    ids.add(el.id);
    for (const child of byParent.get(`${el.diagram}\u0000${el.cell}`) ?? []) visit(child);
  };
  chosen.forEach(visit);
  return all.filter((el) => ids.has(el.id)).map((el) => {
    if (el.type !== 'connector') return el;
    const loose: Partial<ConnectorEl> = {};
    if (el.source && !ids.has(el.source) && el.route.length > 0) {
      loose.source = null;
      loose.sourcePoint = { ...el.route[0] };
    }
    if (el.target && !ids.has(el.target) && el.route.length > 0) {
      loose.target = null;
      loose.targetPoint = { ...el.route[el.route.length - 1] };
    }
    return Object.keys(loose).length > 0 ? { ...el, ...loose } : el;
  });
}

/** The figure's cells as a draw.io document: one page per diagram they belong to. */
export function figureDocument(slide: Pick<Slide, 'elements' | 'diagrams'>, cells: readonly DiagramCellEl[]): DrawioDocument {
  const part = { elements: cells as SlideElement[], diagrams: slide.diagrams };
  const ids = slideDiagramIds(part).filter((id) => cells.some((el) => el.diagram === id));
  return slideToDrawio(part, ids);
}

/** The `.drawio` text a figure carries. */
export async function figureDrawioXml(slide: Pick<Slide, 'elements' | 'diagrams'>, cells: readonly DiagramCellEl[]): Promise<string> {
  const text = await writeDrawio(figureDocument(slide, cells), { compressed: false, pretty: false });
  return text.trim();
}

/** Whether any figure cell draws typeset math (its page has math="1" and its label TeX). */
export function figureUsesMath(slide: Pick<Slide, 'diagrams'>, cells: readonly DiagramCellEl[]): boolean {
  return cells.some((el) => slide.diagrams?.[el.diagram]?.model?.math === '1'
    && [el.label, ...(el.type === 'connector' ? el.labels.map((l) => l.label) : [])]
      .some((label) => /\$\$|\\\(|\\\[|\\begin\{|`[^`]+`/.test(label)));
}

/** The font families the drawing asks for (font-family in styles and attributes). */
export function figureFontFamilies(svg: string): Set<string> {
  const families = new Set<string>();
  const add = (list: string) => {
    for (const part of list.split(',')) {
      const name = part.trim().replace(/^["']|["']$/g, '').replace(/&quot;/g, '').trim();
      if (name) families.add(name.toLowerCase());
    }
  };
  for (const m of svg.matchAll(/font-family:\s*([^;"]+?)(?:;|")/g)) add(m[1].replace(/&quot;/g, '"'));
  for (const m of svg.matchAll(/font-family="([^"]*)"/g)) add(m[1].replace(/&quot;/g, '"'));
  return families;
}

/**
 * The @font-face rules of `css` for the families in `families`, each `url()`
 * replaced by what `inline` returns for it (a data: URI; null drops the
 * source). This is draw.io's "Embed Fonts" for SVG export.
 */
export async function embedFontFaces(
  css: string,
  families: ReadonlySet<string>,
  inline: (url: string) => Promise<string | null>,
): Promise<string> {
  const out: string[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[1];
    const family = /font-family\s*:\s*([^;]+)/i.exec(body)?.[1]?.trim().replace(/^["']|["']$/g, '').toLowerCase();
    if (!family || !families.has(family)) continue;
    let replaced = body;
    for (const u of body.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      if (u[2].startsWith('data:')) continue;
      const data = await inline(u[2]);
      replaced = replaced.replace(u[0], data ? `url("${data}")` : 'url("")');
    }
    out.push(`@font-face{${replaced}}`);
  }
  return out.join('\n');
}

/**
 * The part of KaTeX's stylesheet (`katexCss`, with its fonts as data URIs:
 * src/shared/katexInline.ts) that the typeset labels in `svg` use: every
 * rule, and the @font-face of each family a rule matching the drawing's
 * classes names.
 */
export function katexCssFor(svg: string, katexCss: string): string {
  const classes = new Set<string>();
  for (const m of svg.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  const families = new Set<string>(['KaTeX_Main', 'KaTeX_Math']);
  const rules: string[] = [];
  const faces: Array<{ family: string; rule: string }> = [];
  for (const m of katexCss.matchAll(/(@font-face\s*\{[^}]*\})|([^{}@]+)\{([^{}]*)\}/g)) {
    if (m[1]) {
      const family = /font-family:\s*([^;}]+)/.exec(m[1])?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (family) faces.push({ family, rule: m[1] });
      continue;
    }
    const selector = m[2];
    const body = m[3];
    rules.push(`${selector}{${body}}`);
    const family = /font(?:-family)?:[^;}]*?(KaTeX_[A-Za-z0-9_]+)/.exec(body)?.[1];
    if (!family) continue;
    const used = selector.split(',').some((sel) => {
      const names = [...sel.matchAll(/\.([\w-]+)/g)].map((c) => c[1]);
      return names.length > 0 && names.every((c) => classes.has(c));
    });
    if (used) families.add(family);
  }
  return [...faces.filter((f) => families.has(f.family)).map((f) => f.rule), ...rules].join('');
}

export interface FigureSvgOptions extends FigureRequest {
  /** What the drawing covers, from figureRender.ts's measureFigure; default: the cells' painted bounds. */
  bounds?: Rect | null;
  /** CSS to embed: fonts and KaTeX's styles. */
  css?: string;
  /** The `.drawio` text for the `content` attribute; null leaves it out. */
  drawio?: string | null;
}

/** The figure's viewBox: what is drawn, plus the border. */
export function figureViewBox(bounds: Rect, border: number): Rect {
  const b = Math.max(0, border);
  const x = Math.floor(bounds.x) - b;
  const y = Math.floor(bounds.y) - b;
  return { x, y, width: Math.ceil(bounds.x + bounds.width) + b - x, height: Math.ceil(bounds.y + bounds.height) + b - y };
}

/**
 * The figure as an SVG document. Without `bounds` the crop is the cells'
 * painted bounds: labels reaching outside their shapes are only covered
 * when the caller measured them (figureRender.ts measureFigure).
 */
export function figureSvg(slide: Pick<Slide, 'elements' | 'diagrams'>, cells: readonly DiagramCellEl[], options: FigureSvgOptions = {}): string {
  const bounds = options.bounds ?? diagramContentBounds(cells) ?? { x: 0, y: 0, width: 1, height: 1 };
  const vb = figureViewBox(bounds, options.border ?? 10);
  const scale = options.scale ?? 1;
  const background = options.background && options.background !== 'none' ? options.background : null;
  return diagramFigureSvg(cells, {
    viewBox: vb,
    width: vb.width * scale,
    height: vb.height * scale,
    background,
    diagrams: slide.diagrams,
    slideElements: slide.elements,
    textFallback: true,
    css: options.css,
    attributes: {
      ...(options.drawio ? { content: options.drawio } : {}),
      style: `background-color: ${background ?? 'transparent'}; color-scheme: light;`,
    },
  });
}

/** A loose first guess at what labels may cover, for a measuring pass: the bounds grown generously. */
export function measuringBounds(cells: readonly DiagramCellEl[]): Rect {
  const b = diagramContentBounds(cells) ?? { x: 0, y: 0, width: 1, height: 1 };
  const pad = Math.max(400, Math.max(b.width, b.height));
  return { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad };
}

/**
 * An HTML page showing the SVG at its size on a page of exactly that size,
 * for printing to PDF (Chromium keeps foreignObject text as text, which is
 * how draw.io's own PDF export keeps it).
 */
export function figurePrintPage(svg: string, width: number, height: number, title = 'Figure'): string {
  const inline = svg.replace(/^<\?xml[^>]*\?>\s*/, '');
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<title>${title.replace(/[<&]/g, '')}</title>`
    + `<style>@page{size:${w}px ${h}px;margin:0}html,body{margin:0;padding:0;background:transparent}`
    + `svg{display:block;width:${w}px;height:${h}px}</style></head><body>${inline}</body></html>`;
}

// --- PNG chunks ----------------------------------------------------------------------

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array, start: number, end: number, crc = 0xffffffff): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = crc;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, (crc32(out, 4, 8 + data.length) ^ 0xffffffff) >>> 0);
  return out;
}

/** Inserts chunks before the first IDAT (Editor.writeGraphModelToPng), replacing ones `drop` says to. */
function insertChunks(png: Uint8Array, chunks: Uint8Array[], drop: (type: string, data: Uint8Array) => boolean): Uint8Array {
  if (!isPng(png)) throw new Error('Not a PNG');
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let at = 8;
  let inserted = false;
  while (at + 8 <= png.length) {
    const length = u32(png, at);
    const type = latin1(png, at + 4, at + 8);
    const end = at + 12 + length;
    if (type === 'IDAT' && !inserted) {
      parts.push(...chunks);
      inserted = true;
    }
    if (!drop(type, png.subarray(at + 8, at + 8 + length))) parts.push(png.subarray(at, end));
    at = end;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * The PNG with the diagram in a tEXt chunk `mxfile` (the URI-encoded file,
 * as draw.io writes it) and, given `dpi`, a pHYs chunk.
 */
export function pngWithDiagram(png: Uint8Array, drawio: string | null, dpi?: number | null): Uint8Array {
  const chunks: Uint8Array[] = [];
  if (drawio) {
    const text = `mxfile\u0000${encodeURIComponent(drawio)}`;
    const data = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) data[i] = text.charCodeAt(i);
    chunks.push(chunk('tEXt', data));
  }
  if (dpi != null && dpi > 0) {
    const dpm = Math.round(dpi / 0.0254);
    const data = new Uint8Array(9);
    const view = new DataView(data.buffer);
    view.setUint32(0, dpm);
    view.setUint32(4, dpm);
    data[8] = 1;
    chunks.push(chunk('pHYs', data));
  }
  return insertChunks(png, chunks, (type, data) => type === 'pHYs' && dpi != null
    || ((type === 'tEXt' || type === 'zTXt') && drawio != null && /^(mxfile|mxGraphModel)\u0000/.test(latin1(data, 0, Math.min(data.length, 13)))));
}

/**
 * Editor.extractGraphModelFromPng: the diagram a PNG carries, from a tEXt or
 * zTXt chunk named `mxfile` or `mxGraphModel`, or null. `inflate` decodes
 * zTXt (zlib, or raw deflate as old draw.io CLIs wrote).
 */
export function drawioFromPng(png: Uint8Array, inflate?: (data: Uint8Array) => Uint8Array): string | null {
  if (!isPng(png)) return null;
  let at = 8;
  let result: string | null = null;
  while (at + 8 <= png.length && result == null) {
    const length = u32(png, at);
    const type = latin1(png, at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT' || type === 'IEND') break;
    const nul = data.indexOf(0);
    const keyword = nul > 0 ? latin1(data, 0, nul) : '';
    if (keyword === 'mxfile' || keyword === 'mxGraphModel') {
      if (type === 'tEXt') {
        result = latin1(data, nul + 1, data.length);
      } else if (type === 'zTXt' && inflate) {
        const bytes = inflate(data.subarray(nul + 2));
        result = new TextDecoder().decode(bytes).replace(/\+/g, ' ');
      } else if (type === 'iTXt') {
        // keyword\0 flag method lang\0 translated\0 text
        let i = nul + 3;
        i = data.indexOf(0, i) + 1;
        i = data.indexOf(0, i) + 1;
        const body = data.subarray(i);
        result = new TextDecoder().decode(data[nul + 1] === 1 && inflate ? inflate(body) : body);
      }
    }
    at += 12 + length;
  }
  for (let i = 0; i < 2 && result != null && result.charAt(0) === '%'; i++) {
    try {
      result = decodeURIComponent(result);
    } catch {
      break;
    }
  }
  return result;
}

/**
 * Reads any file draw.io can reopen: `.drawio`/`.xml`, an editable SVG
 * (the file in its `content` attribute) or an editable PNG (an `mxfile`
 * chunk). Throws when it holds no diagram.
 */
export async function readDiagramFile(data: Uint8Array | string, inflate?: (data: Uint8Array) => Uint8Array): Promise<DrawioDocument> {
  if (typeof data !== 'string' && isPng(data)) {
    const text = drawioFromPng(data, inflate);
    if (!text) throw new Error('This PNG carries no draw.io diagram (export it from draw.io with "Include a copy of my diagram").');
    return readDrawio(text);
  }
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
  return readDrawio(text.replace(/^﻿/, ''));
}
