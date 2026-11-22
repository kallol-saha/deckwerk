/*
 * A DOM-free stand-in for draw.io's measureShapeInsideFlow
 * (js/grapheditor/Graph.js, jgraph/drawio 32.7.4, Copyright (c) 2006-2024
 * JGraph Ltd / draw.io AG, Apache License 2.0): draw.io renders the label
 * after the shape-outside floats of createShapeInsideMarkup in a hidden
 * <div> and reads the text's client rects. Without a DOM this lays the
 * label out the way Chromium does and reports the same rects.
 *
 * Modified for DeckWerk: written for DeckWerk as a model of the browser,
 * not ported code. What it models:
 * - the float area of a shape-outside polygon with shape-margin (Blink's
 *   PolygonShape::GetExcludedInterval: every non-horizontal edge offset by
 *   the margin both ways, plus a circle of that radius at each vertex,
 *   clipped to the line's band; clamped to the float's margin box);
 * - LayoutNG's placement of a line next to shape exclusions: the line is
 *   broken in the width left at a 1px band, then again in the width left
 *   over its full height, and moved down 1px at a time while its first
 *   word does not fit next to the shapes;
 * - line boxes of `line-height: 1.2` (the computed height in 1/64 px, the
 *   half-leading floored to whole pixels above the text) and text rects
 *   from the font's ascent and descent rounded to whole pixels;
 * - widths from Helvetica/Arial advance widths (./metrics.ts), breaks at
 *   spaces, after hyphens and around wide characters, `<br>` and block
 *   edges as line ends, and the font size and weight of b, strong, h1–h6,
 *   big, small, sub, sup, <font size> and inline font-size/font-weight.
 * Margins of blocks, images, tables and other fonts' metrics are not
 * modelled, so the flow of rich labels is approximate.
 */

import { FONT_ASCENT, FONT_DESCENT, textWidth } from './metrics.js';
import { BLOCKS, tokenize, VOID_HTML } from './html.js';
import type { ShapeInsideFlow, ShapeInsideLayout } from './shapeInside.js';
import { LINE_HEIGHT } from './text.js';

/** The font of a piece of text. */
interface Font {
  size: number;
  bold: boolean;
}

interface Frag {
  text: string;
  font: Font;
  width: number;
}

/** What a line is built from: unbreakable words, forced breaks and block edges. */
type Entry =
  | { type: 'word'; frags: Frag[]; width: number; gap: number }
  | { type: 'br' }
  | { type: 'block' };

// --- the label as inline content --------------------------------------------------------

const HTML_FONT_SIZES = [10, 13, 16, 18, 24, 32, 48];
const HEADING_SCALE: Record<string, number> = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };

/** A CSS font-size relative to the parent's, or null for values not understood. */
function cssFontSize(value: string, parent: number): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px|pt|em|rem|%)?\s*$/i.exec(value);
  if (m == null) {
    const v = value.trim().toLowerCase();
    if (v === 'smaller') return parent / 1.2;
    if (v === 'larger') return parent * 1.2;
    return null;
  }
  const n = parseFloat(m[1]);
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'pt': return n * 4 / 3;
    case 'em': return n * parent;
    case 'rem': return n * 16;
    case '%': return n * parent / 100;
    default: return n;
  }
}

function inlineFont(name: string, attrs: Array<[string, string]>, parent: Font): Font {
  let { size, bold } = parent;
  if (name === 'b' || name === 'strong' || name === 'th') bold = true;
  if (HEADING_SCALE[name] != null) {
    size = parent.size * HEADING_SCALE[name];
    bold = true;
  }
  if (name === 'big') size = parent.size * 1.2;
  if (name === 'small' || name === 'sub' || name === 'sup') size = parent.size / 1.2;
  for (const [attr, value] of attrs) {
    if (name === 'font' && attr === 'size') {
      const m = /^\s*([+-]?)(\d+)/.exec(value);
      if (m) {
        let n = parseInt(m[2], 10);
        if (m[1] === '+') n = 3 + n;
        else if (m[1] === '-') n = 3 - n;
        size = HTML_FONT_SIZES[Math.max(1, Math.min(7, n)) - 1];
      }
    } else if (attr === 'style') {
      for (const decl of value.split(';')) {
        const colon = decl.indexOf(':');
        if (colon < 0) continue;
        const prop = decl.slice(0, colon).trim().toLowerCase();
        const v = decl.slice(colon + 1).trim().toLowerCase();
        if (prop === 'font-size') size = cssFontSize(v, parent.size) ?? size;
        else if (prop === 'font-weight') bold = v === 'bold' || v === 'bolder' || (parseInt(v, 10) >= 600);
      }
    }
  }
  return { size, bold };
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** Splits a run of non-space text at its break opportunities (after hyphens, around wide characters). */
function breakableParts(text: string): string[] {
  const parts: string[] = [];
  let cur = '';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (WIDE.test(ch)) {
      if (cur) parts.push(cur);
      parts.push(ch);
      cur = '';
      continue;
    }
    cur += ch;
    if (ch === '-' && i > 0 && /[\p{L}\p{N}]/u.test(chars[i - 1]) && i + 1 < chars.length && /\p{L}/u.test(chars[i + 1])) {
      parts.push(cur);
      cur = '';
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * The label markup as line-building entries, with white space collapsed as
 * `white-space: normal` does (newlines are spaces, as in draw.io's
 * measuring <div>).
 */
function flowEntries(html: string, base: Font): Entry[] {
  const entries: Entry[] = [];
  const stack: Array<{ name: string; font: Font }> = [];
  let font = base;
  let word: Frag[] | null = null;
  let gap = 0;
  let space = false;
  const endWord = () => {
    if (word != null && word.length > 0) {
      entries.push({ type: 'word', frags: word, width: word.reduce((s, f) => s + f.width, 0), gap });
      gap = 0;
    }
    word = null;
  };
  const addText = (text: string) => {
    if (text === '') return;
    word ??= [];
    word.push({ text, font, width: textWidth(text, font.size, font.bold) });
  };
  for (const token of tokenize(html)) {
    if (token.type === 'text') {
      for (const piece of token.text.split(/([ \t\n\r\f]+)/)) {
        if (piece === '') continue;
        if (/^[ \t\n\r\f]+$/.test(piece)) {
          if (!space) {
            endWord();
            gap = textWidth(' ', font.size, font.bold);
            space = true;
          }
          continue;
        }
        space = false;
        const parts = breakableParts(piece);
        parts.forEach((part, i) => {
          if (i > 0) endWord();
          addText(part);
        });
      }
    } else if (token.type === 'start') {
      if (token.name === 'br') {
        endWord();
        entries.push({ type: 'br' });
        gap = 0;
        space = false;
        continue;
      }
      if (BLOCKS.has(token.name)) {
        endWord();
        entries.push({ type: 'block' });
        gap = 0;
        space = false;
      }
      if (VOID_HTML.has(token.name) || token.selfClosing) continue;
      stack.push({ name: token.name, font });
      font = inlineFont(token.name, token.attrs, font);
    } else {
      const at = stack.map((e) => e.name).lastIndexOf(token.name);
      if (at < 0) continue;
      font = stack[at].font;
      stack.length = at;
      if (BLOCKS.has(token.name)) {
        endWord();
        entries.push({ type: 'block' });
        gap = 0;
        space = false;
      }
    }
  }
  endWord();
  return entries;
}

// --- fonts and line boxes ---------------------------------------------------------------

/** Ascent and descent of the font in whole pixels, as Chromium rounds them. */
function fontHeight(size: number): { ascent: number; descent: number } {
  return { ascent: Math.round(FONT_ASCENT * size), descent: Math.round(FONT_DESCENT * size) };
}

/** `line-height: 1.2` of a font, in LayoutUnits (1/64 px). */
function lineHeight(size: number): number {
  return Math.trunc(size * LINE_HEIGHT * 64) / 64;
}

/** The part of an inline box above and below the baseline with its half-leading. */
function inlineMetrics(size: number): { above: number; below: number } {
  const { ascent, descent } = fontHeight(size);
  const lh = lineHeight(size);
  const above = ascent + Math.floor((lh - ascent - descent) / 2);
  return { above, below: lh - above };
}

// --- the float area of the shapes ----------------------------------------------------------

type Pt = [number, number];
type Interval = [number, number] | null;

function unite(a: Interval, b: Interval): Interval {
  if (a == null) return b;
  if (b == null) return a;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

/** The x range of the segment a-b within y1..y2 (OffsetPolygonEdge::ClippedEdgeXRange). */
function clippedEdgeXRange(a: Pt, b: Pt, y1: number, y2: number): Interval {
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  if (minY > y2 || maxY < y1 || (y1 === maxY && minY <= y1) || (y2 === minY && maxY >= y2)) return null;
  if (y1 <= minY && y2 >= maxY) return [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [lo, hi] = a[1] < b[1] ? [a, b] : [b, a];
  const xAt = (y: number) => lo[0] + (y - lo[1]) * (hi[0] - lo[0]) / (hi[1] - lo[1]);
  const x1 = lo[1] < y1 ? xAt(y1) : lo[0];
  const x2 = hi[1] > y2 ? xAt(y2) : hi[0];
  return [Math.min(x1, x2), Math.max(x1, x2)];
}

/** The x range of a circle within y1..y2. */
function clippedCircleXRange(c: Pt, r: number, y1: number, y2: number): Interval {
  if (y1 >= c[1] + r || y2 <= c[1] - r) return null;
  if (c[1] >= y1 && c[1] <= y2) return [c[0] - r, c[0] + r];
  const dy = (c[1] > y2 ? y2 : y1) - c[1];
  const xi = r * Math.sqrt(1 - (dy * dy) / (r * r));
  return [c[0] - xi, c[0] + xi];
}

/** The x range a polygon with shape-margin excludes from the band y1..y2. */
export function polygonExcludedInterval(poly: readonly Pt[], margin: number, y1: number, y2: number): Interval {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (Math.max(...xs) - Math.min(...xs) <= 0 || maxY - minY <= 0) return null;
  const top = y1 - margin;
  const bottom = y2 + margin;
  if (!(bottom >= top && bottom >= minY && top <= maxY)) return null;
  let result: Interval = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.max(a[1], b[1]) < top || Math.min(a[1], b[1]) > bottom || a[1] === b[1]) continue;
    if (margin === 0) {
      result = unite(result, clippedEdgeXRange(a, b, y1, y2));
      continue;
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / len * margin;
    const ny = -(b[0] - a[0]) / len * margin;
    result = unite(result, clippedEdgeXRange([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], y1, y2));
    result = unite(result, clippedEdgeXRange([a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], y1, y2));
    result = unite(result, clippedCircleXRange(a, margin, y1, y2));
    result = unite(result, clippedCircleXRange(b, margin, y1, y2));
  }
  return result;
}

interface Exclusion {
  side: 'left' | 'right';
  x: number;
  width: number;
  height: number;
  /** The polygon in px of the float's box, or null for a plain (rectangular) float. */
  polygon: Pt[] | null;
  margin: number;
}

/** The line's room [left, right] next to the floats for the band y..y+height (height 0: a point). */
function opening(exclusions: readonly Exclusion[], width: number, y: number, height: number): { left: number; right: number } {
  let left = 0;
  let right = width;
  for (const e of exclusions) {
    const intersects = e.height > y && (height === 0 ? y >= 0 : y + height > 0);
    if (!intersects) continue;
    let segment: Interval;
    if (e.polygon == null) segment = [0, e.width];
    else segment = polygonExcludedInterval(e.polygon, e.margin, y, y + Math.max(height, 1));
    if (segment == null) continue;
    if (e.side === 'left') left = Math.max(left, Math.min(e.x + segment[1], e.x + e.width));
    else right = Math.min(right, Math.max(e.x + segment[0], e.x));
  }
  return { left, right };
}

// --- lines ---------------------------------------------------------------------------------

interface Line {
  /** The words on the line; the next line starts at entry `next`. */
  words: Array<Extract<Entry, { type: 'word' }>>;
  next: number;
  /** Width of the words and the gaps between them (trailing spaces hang). */
  width: number;
  /** The first word alone is wider than the room. */
  overflow: boolean;
  /** Line box above and below the baseline (strut and every font on the line). */
  above: number;
  below: number;
}

/** Breaks one line starting at entry `start` in `available` px. */
function breakLine(entries: readonly Entry[], start: number, available: number, strut: Font): Line {
  const words: Array<Extract<Entry, { type: 'word' }>> = [];
  let width = 0;
  let i = start;
  for (; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === 'br') {
      i += 1;
      break;
    }
    if (e.type === 'block') {
      if (words.length > 0) {
        i += 1;
        break;
      }
      continue;
    }
    if (words.length === 0) {
      words.push(e);
      width = e.width;
    } else if (width + e.gap + e.width <= available + 1e-6) {
      words.push(e);
      width += e.gap + e.width;
    } else {
      break;
    }
  }
  const strutMetrics = inlineMetrics(strut.size);
  let above = strutMetrics.above;
  let below = strutMetrics.below;
  for (const w of words) {
    for (const f of w.frags) {
      const m = inlineMetrics(f.font.size);
      above = Math.max(above, m.above);
      below = Math.max(below, m.below);
    }
  }
  return { words, next: i, width, overflow: width > available + 1e-6, above, below };
}

/** Where text-align puts the line's content in its room (overflowing lines start at the start). */
function alignOffset(align: string, room: number, width: number): number {
  const space = Math.max(0, room - width);
  if (align === 'right') return space;
  if (align === 'center') return space / 2;
  return 0;
}

export interface FlowOptions {
  /** Font size in px (rounded, as draw.io's measuring <div> takes it). */
  fontSize: number;
  bold: boolean;
  align: string;
}

/**
 * The label value laid out after the floats and the spacer of
 * createShapeInsideMarkup (`layout`) in a block `width` px wide, as
 * measureShapeInsideFlow reads it: the text's extent relative to the block
 * and its lines (fragments closer than 2px merged), or null without text.
 */
export function layoutShapeInsideFlow(value: string, options: FlowOptions, layout: ShapeInsideLayout, width: number): ShapeInsideFlow | null {
  const exclusions: Exclusion[] = layout.floats.map((f) => {
    const polygon = f.polygon.map(([x, y]): Pt => [x / 100 * f.width, y / 100 * layout.floatHeight]);
    const valid = polygon.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    return { side: f.side, x: f.x, width: f.width, height: layout.floatHeight, polygon: valid ? polygon : null, margin: layout.margin };
  });
  const strut: Font = { size: Math.round(options.fontSize), bold: options.bold };
  const entries = flowEntries(value, strut);
  const rects: Array<{ top: number; bottom: number; left: number; right: number }> = [];
  let y = layout.spacer;
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (e.type === 'block') {
      i += 1;
      continue;
    }
    if (e.type === 'br') {
      // A line holding only a forced break: as tall as the strut, no text.
      const m = inlineMetrics(strut.size);
      y += m.above + m.below;
      i += 1;
      continue;
    }
    let top = y;
    let line: Line;
    let room: { left: number; right: number };
    for (;;) {
      // Broken in the room at a point first, which gives the line's height,
      // then in the room over that height; moved down 1px while the first
      // word does not fit next to the shapes.
      const first = opening(exclusions, width, top, 0);
      const probe = breakLine(entries, i, Math.max(0, first.right - first.left), strut);
      room = opening(exclusions, width, top, probe.above + probe.below);
      line = breakLine(entries, i, Math.max(0, room.right - room.left), strut);
      const narrowed = room.left > 0 || room.right < width;
      if (!(line.overflow && narrowed)) break;
      top += 1;
    }
    const baseline = top + line.above;
    let x = room.left + alignOffset(options.align, room.right - room.left, line.width);
    line.words.forEach((word, k) => {
      if (k > 0) x += word.gap;
      for (const f of word.frags) {
        const { ascent, descent } = fontHeight(f.font.size);
        if (f.width > 0) rects.push({ top: baseline - ascent, bottom: baseline + descent, left: x, right: x + f.width });
        x += f.width;
      }
    });
    y = top + line.above + line.below;
    i = line.next;
  }
  if (rects.length === 0) return null;
  const bands = rects.map((r): [number, number] => [r.top, r.bottom]).sort((a, b) => a[0] - b[0]);
  const lines: Array<[number, number]> = [];
  for (const band of bands) {
    const last = lines.length > 0 ? lines[lines.length - 1] : null;
    if (last != null && band[0] < last[1] - 2) last[1] = Math.max(last[1], band[1]);
    else lines.push([band[0], band[1]]);
  }
  return {
    top: Math.min(...rects.map((r) => r.top)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    lines,
  };
}
