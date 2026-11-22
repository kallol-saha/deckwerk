/**
 * A slide's diagram as one standalone SVG: every vertex and connector drawn
 * by the same code the slide uses, placed and turned as on the slide, inside
 * a viewBox. This is figure export's core and what the tests rasterise to
 * compare with draw.io's own rendering.
 */

import type { DiagramMeta, SlideElement } from '../deck.js';
import { cellMarkupOptions } from './cellContext.js';
import { connectorLineJumps, connectorMarkup, vertexMarkup } from './element.js';
import { pointsBounds } from './element.js';
import { vertexPaintMargin, edgePaintMargin } from './paint.js';
import { resolveStyle } from './style.js';
import type { Rect } from './types.js';

export interface FigureOptions {
  /** The region of the slide to show, in slide pixels; default: the diagram's bounds plus `margin`. */
  viewBox?: Rect;
  /** Space around the drawn content when the viewBox is computed, in slide pixels. */
  margin?: number;
  /** Output size; default: the viewBox size (1 slide pixel = 1 SVG unit). */
  width?: number;
  height?: number;
  /** A background colour, or none. */
  background?: string | null;
  /**
   * The slide's diagrams (`slide.diagrams`), for what a page sets for all
   * its cells: shadow="1" draws every cell with the page shadow, math="1"
   * typesets TeX in labels, and the layers and root hold properties that
   * `%placeholders%` read.
   */
  diagrams?: Readonly<Record<string, Readonly<Partial<DiagramMeta>>>>;
  /**
   * All of the slide's elements, when `elements` is only part of them (a
   * selection): placeholders still read the ancestors that are left out.
   */
  slideElements?: readonly SlideElement[];
  /** HTML labels carry draw.io's SVG <text> fallback for viewers without foreignObject. */
  textFallback?: boolean;
  /** A stylesheet to embed (fonts, KaTeX's styles). */
  css?: string;
  /** More attributes for the root <svg> (draw.io's `content`), unescaped. */
  attributes?: Readonly<Record<string, string>>;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function drawn(el: SlideElement): boolean {
  return (el.type === 'vertex' || el.type === 'connector') && !el.hidden && !el.concealed;
}

/** What the drawn diagram cells cover, painted extras included, in slide pixels. */
export function diagramContentBounds(elements: readonly SlideElement[]): Rect | null {
  const boxes: Rect[] = [];
  for (const el of elements) {
    if (!drawn(el)) continue;
    if (el.type === 'vertex') {
      const m = vertexPaintMargin(resolveStyle(el.dio, 'vertex'), { width: el.w / el.scale, height: el.h / el.scale }) * el.scale;
      boxes.push({ x: el.x - m, y: el.y - m, width: el.w + 2 * m, height: el.h + 2 * m });
    } else if (el.type === 'connector' && el.route.length > 0) {
      const b = pointsBounds(el.route);
      const m = edgePaintMargin(resolveStyle(el.dio, 'edge')) * el.scale;
      boxes.push({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });
    }
  }
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The diagram cells among `elements` (in paint order) as one SVG document. */
export function diagramFigureSvg(elements: readonly SlideElement[], options: FigureOptions = {}): string {
  const cells = elements
    .map((el, index) => ({ el, index }))
    .filter(({ el }) => drawn(el))
    .sort((a, b) => (a.el.z - b.el.z) || (a.index - b.index))
    .map(({ el }) => el);
  const margin = options.margin ?? 10;
  const content = diagramContentBounds(cells) ?? { x: 0, y: 0, width: 1, height: 1 };
  const vb = options.viewBox ?? {
    x: content.x - margin, y: content.y - margin, width: content.width + 2 * margin, height: content.height + 2 * margin,
  };
  const width = options.width ?? vb.width;
  const height = options.height ?? vb.height;
  let body = '';
  const jumps = connectorLineJumps(cells);
  const slide = { elements: options.slideElements ?? elements, diagrams: options.diagrams ?? null };
  for (const el of cells) {
    if (el.type !== 'vertex' && el.type !== 'connector') continue;
    // The page's shadow and math, placeholders from ancestors (cellContext.ts).
    const cellOptions = { ...cellMarkupOptions(slide, el), textFallback: options.textFallback };
    if (el.type === 'vertex') {
      const turn = el.rot ? ` rotate(${fmt(el.rot)} ${fmt(el.w / 2)} ${fmt(el.h / 2)})` : '';
      body += `<g transform="translate(${fmt(el.x)} ${fmt(el.y)})${turn}">${vertexMarkup(el, cellOptions)}</g>`;
    } else {
      body += `<g transform="translate(${fmt(el.x)} ${fmt(el.y)})">${connectorMarkup(el, { ...cellOptions, routedPoints: jumps.get(el.id) })}</g>`;
    }
  }
  const background = options.background
    ? `<rect x="${fmt(vb.x)}" y="${fmt(vb.y)}" width="${fmt(vb.width)}" height="${fmt(vb.height)}" fill="${escapeAttr(options.background)}"/>`
    : '';
  const css = options.css
    ? `<defs><style type="text/css"><![CDATA[${options.css.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]></style></defs>`
    : '';
  const extra = Object.entries(options.attributes ?? {}).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"`
    + ` width="${fmt(width)}" height="${fmt(height)}" viewBox="${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.width)} ${fmt(vb.height)}"${extra}>`
    + `${css}${background}${body}</svg>\n`;
}
