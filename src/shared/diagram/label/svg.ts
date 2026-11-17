/*
 * Ported from draw.io (jgraph/drawio 32.7.4): mxgraph/src/shape/mxText.js
 * (paint, configureCanvas, updateSvgFilters/isShadowEnabled),
 * mxgraph/src/shape/mxShape.js (getShadowStyle, createDropShadow) and
 * mxgraph/src/util/mxSvgCanvas2D.js (text, createDiv, addForeignObject,
 * updateTextNodes, createCss, getTextCss, plainText, updateFont,
 * addTextBackground, getStringBoundingBox, getTextBackgroundBounds,
 * createClip, setClip).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: writes the SVG as a string (no DOM); the
 * foreignObject is placed at the label (mxSvgCanvas2D.placeForeignObjects,
 * as draw.io does when it paints in model units) so it works inside an SVG
 * of any size; plain-text backgrounds are sized from font metrics instead
 * of getBBox; no title, links, pointer events or SVG text conversion.
 */

import { colorWithAlpha, fmt } from '../canvas.js';
import type { Style } from '../types.js';
import type { LabelGeometry } from './bounds.js';
import { escapeAttr, escapeText, htmlEntities, replaceTrailingNewlines, sanitizeLabelHtml } from './html.js';
import { FONT_ASCENT, FONT_DESCENT, textWidth } from './metrics.js';
import {
  actualTextDirection, alignmentPoint, FONT_BOLD, FONT_ITALIC, FONT_STRIKETHROUGH, FONT_UNDERLINE,
  FONT_UNDERLINE_DOTTED, LINE_HEIGHT, numberValue, parseCssFontFamily, safeColor, truthy, WORD_WRAP,
  type Padding, type TextDirection, type TextProps,
} from './text.js';

/** mxSvgCanvas2D.foreignObjectPadding. */
const FOREIGN_OBJECT_PADDING = 2;
/** mxSvgCanvas2D.foreignObjectMargin. */
const FOREIGN_OBJECT_MARGIN = 10000;

/** The canvas state mxText.configureCanvas sets up for the text. */
interface TextState {
  scale: number;
  alpha: number;
  fontColor: string | null;
  fontBackgroundColor: string | null;
  fontBorderColor: string | null;
  fontBorderWidth: number;
  labelPadding: Padding | null;
  fontFamily: string;
  fontSize: number;
  fontStyle: number;
}

function textState(t: TextProps, scale: number): TextState {
  return {
    scale,
    alpha: t.opacity / 100,
    fontColor: t.color,
    fontBackgroundColor: t.background,
    fontBorderColor: t.borderWidth > 0 ? t.border : null,
    fontBorderWidth: t.borderWidth,
    labelPadding: t.labelPadding,
    // Characters that could end a CSS string or declaration are dropped.
    fontFamily: t.family.replace(/[\\"<>{};\n\r]/g, ''),
    fontSize: t.size,
    fontStyle: t.fontStyle,
  };
}

/** A line feed for each trailing newline, then <br/> for the others (mxText.paint). */
function withLineBreaks(html: string): string {
  return replaceTrailingNewlines(html, '<div><br/></div>').replace(/\n/g, '<br/>');
}

/**
 * The value draw.io paints (cellRenderer.getLabelValue): markup for html=1,
 * escaped text for other HTML labels (whiteSpace=wrap), the text itself for
 * plain labels. Line endings are normalised as an HTML parser does.
 */
export function paintedValue(t: TextProps, raw: string): string {
  if (!t.html) return raw.replace(/\r\n/g, '\n').replace(/\r/g, ' ');
  if (t.markup) return sanitizeLabelHtml(raw.replace(/\r\n?/g, '\n'));
  return htmlEntities(raw.replace(/\r\n/g, '\n').replace(/\r/g, ' '));
}

/** mxShape.getShadowStyle + createDropShadow for textShadow=1. */
function textShadowFilter(style: Style, scale: number): string | null {
  if (!truthy(style, 'textShadow')) return null;
  const dx = numberValue(style, 'shadowOffsetX', 2);
  const dy = numberValue(style, 'shadowOffsetY', 3);
  const blur = numberValue(style, 'shadowBlur', 2);
  const color = safeColor(style.shadowColor ?? '#000000') ?? '#000000';
  const opacity = numberValue(style, 'shadowOpacity', 25) / 100;
  const r = (v: number) => Math.round(v * scale * 100) / 100;
  return `drop-shadow(${r(dx)}px ${r(dy)}px ${r(blur)}px ${colorWithAlpha(color, opacity)})`;
}

/**
 * mxText.paint into an SVG string: the label of `g` (from
 * vertexLabelGeometry/edgeLabelGeometry) as draw.io's text node, a <g>
 * holding the foreignObject (HTML labels) or the <text> lines.
 */
export function paintLabel(g: LabelGeometry, style: Style, raw: string): string {
  const t = g.text;
  const s = g.scale;
  const value = paintedValue(t, raw);
  const x = g.paintAnchor.x / s;
  const y = g.paintAnchor.y / s;
  const w = g.width / s;
  const h = g.height / s;
  const state = textState(t, s);
  const dir = actualTextDirection(t.textDirection, value);
  const body = t.html
    ? htmlText(x, y, w, h, withLineBreaks(value), t, g.rotation, dir, state)
    : plainText(x, y, w, h, value, t, g.rotation, dir, state);
  const filter = textShadowFilter(style, s);
  return `<g${filter ? ` style="${escapeAttr(`filter: ${filter};`)}"` : ''}>${body}</g>`;
}

// --- HTML labels: mxSvgCanvas2D.addForeignObject / updateTextNodes ------------------

interface Css {
  dx: number;
  dy: number;
  flex: string;
  item: string;
  block: string;
}

/** mxSvgCanvas2D.createCss. */
export function createCss(
  w: number, h: number, align: string, valign: string, wrap: boolean, overflow: string, clip: boolean,
  dir: TextDirection, bg: string | null, border: string | null, padding: Padding | null,
  flex: string, block: string, borderWidth: number | null,
): Css {
  const vertical = dir != null && dir.startsWith('vertical-');
  let item = 'box-sizing: border-box; font-size: 0; ';
  if (vertical) {
    item += `text-align: ${valign === 'top' ? 'left' : valign === 'bottom' ? 'right' : 'center'}; `;
  } else {
    item += `text-align: ${align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'}; `;
  }
  const pt = alignmentPoint(align, valign);
  let ofl = 'overflow: hidden; ';
  let fw = 'width: 1px; ';
  let fh = 'height: 1px; ';
  let dx = pt.x * w;
  let dy = pt.y * h;
  if (clip) {
    fw = `width: ${Math.round(w)}px; `;
    item += `max-height: ${Math.round(h)}px; `;
    dy = 0;
  } else if (overflow === 'fill') {
    fw = `width: ${Math.round(w)}px; `;
    fh = `height: ${Math.round(h)}px; `;
    block += 'width: 100%; height: 100%; ';
    item += `width: ${Math.round(w - 2)}px; ${fh}`;
  } else if (overflow === 'width') {
    fw = `width: ${Math.round(w - 2)}px; `;
    block += 'width: 100%; ';
    item += fw;
    dy = 0;
    if (h > 0) item += `max-height: ${Math.round(h)}px; `;
  } else if (overflow === 'block') {
    fw = `width: ${Math.round(w - 2)}px; `;
    block += 'width: 100%; ';
    ofl = '';
    dy = 0;
    item += fw;
    if (valign === 'middle') item += `max-height: ${Math.round(h)}px; `;
  } else {
    ofl = '';
    if (vertical) dx = 0;
    else dy = 0;
  }
  let bgc = '';
  if (bg != null) bgc += `background-color: ${bg}; `;
  const bw = border != null && borderWidth != null ? borderWidth : 1;
  const grow = border != null ? bw - 1 : 0;
  if (border != null) {
    bgc += `border-width: ${bw}px; border-style: solid; border-color: inherit; border: ${bw}px solid ${border}; `;
  }
  if (bgc !== '' && (padding != null || grow !== 0)) {
    const p = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    if (padding != null) bgc += `padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px; `;
    if (ofl === '' || clip) {
      bgc += `margin: ${-p.top - grow}px ${-p.right - grow}px ${-p.bottom - grow}px ${-p.left - grow}px; `;
    }
  }
  if (ofl === '' || clip) block += bgc;
  else item += bgc;
  if (wrap && ((vertical && h > 0) || (!vertical && w > 0))) {
    block += `white-space: normal; word-wrap: ${WORD_WRAP}; `;
    if (vertical) fh = `height: ${Math.round(h)}px; `;
    else fw = `width: ${Math.round(w)}px; `;
    if (ofl !== '' && overflow !== 'fill') {
      if (vertical) dx = 0;
      else dy = 0;
    }
  } else {
    block += 'white-space: nowrap; ';
    if (ofl === '' && overflow !== 'block') dx = 0;
  }
  return { dx, dy, flex: flex + fw + fh, item: item + ofl, block };
}

/** mxSvgCanvas2D.getTextCss. */
function textCss(state: TextState): string {
  let css = `display: inline-block; font-size: ${state.fontSize}px; `
    + `font-family: ${parseCssFontFamily(state.fontFamily)}; color: ${state.fontColor ?? 'transparent'}; `
    + `line-height: ${LINE_HEIGHT}; pointer-events: none; `;
  if ((state.fontStyle & FONT_BOLD) === FONT_BOLD) css += 'font-weight: bold; ';
  if ((state.fontStyle & FONT_ITALIC) === FONT_ITALIC) css += 'font-style: italic; ';
  const deco = textDecoration(state.fontStyle);
  if (deco.length > 0) {
    if ((state.fontStyle & FONT_UNDERLINE_DOTTED) === FONT_UNDERLINE_DOTTED) deco.push('dotted');
    css += `text-decoration: ${deco.join(' ')}; `;
  }
  return css;
}

function textDecoration(fontStyle: number): string[] {
  const deco: string[] = [];
  if ((fontStyle & FONT_UNDERLINE) === FONT_UNDERLINE) deco.push('underline');
  if ((fontStyle & FONT_STRIKETHROUGH) === FONT_STRIKETHROUGH) deco.push('line-through');
  return deco;
}

/** mxSvgCanvas2D.text for format=html: createDiv + addForeignObject + updateTextNodes. */
function htmlText(
  x: number, y: number, w: number, h: number, html: string, t: TextProps, rotation: number,
  dir: TextDirection, state: TextState,
): string {
  const s = state.scale;
  const { align, valign } = t;
  const vertical = dir != null && dir.startsWith('vertical-');
  let alignItems: string;
  let justifyContent: string;
  if (vertical) {
    const rl = dir.endsWith('-rl');
    alignItems = align === 'left' ? (rl ? 'flex-end' : 'flex-start')
      : align === 'right' ? (rl ? 'flex-start' : 'flex-end') : 'center';
    justifyContent = valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';
  } else {
    alignItems = valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';
    justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  }
  const bg = state.fontBackgroundColor;
  const border = state.fontBorderColor;
  const padding = bg != null || border != null ? state.labelPadding : null;
  const css = createCss(w + FOREIGN_OBJECT_PADDING, h, align, valign, t.wrap, t.overflow, t.clipped, dir,
    bg, border, padding,
    `display: flex; align-items: unsafe ${alignItems}; justify-content: unsafe ${justifyContent}; `
      + (vertical ? `writing-mode: ${dir};` : ''),
    textCss(state), state.fontBorderWidth);
  let { flex, item } = css;
  item += `color: ${state.fontColor ?? 'transparent'}; `;
  item += bg != null ? `background-color: ${bg}; ` : '';
  item += border != null ? `border-color: ${border}; ` : '';
  let transform = s !== 1 ? `scale(${s})` : '';
  const xp = Math.round(x + css.dx);
  const yp = Math.round(y + css.dy);
  // placeForeignObjects: the foreignObject surrounds the label.
  const m = FOREIGN_OBJECT_MARGIN;
  const fo = `x="${xp - m}" y="${yp - m}" width="${Math.ceil(w) + 2 * m}" height="${Math.ceil(h) + 2 * m}"`;
  flex += `padding-top: ${m}px; `;
  const div = `${flex}margin-left: ${m}px;`;
  if (rotation !== 0) transform += `rotate(${rotation} ${fmt(x)} ${fmt(y)})`;
  const gAttrs = (transform ? ` transform="${transform}"` : '') + (state.alpha !== 1 ? ` opacity="${state.alpha}"` : '');
  const dirAttr = dir != null && !vertical ? ` dir="${dir}"` : '';
  return `<g${gAttrs}><foreignObject style="overflow: visible; text-align: left;" pointer-events="none" ${fo}>`
    + `<div xmlns="http://www.w3.org/1999/xhtml"${dirAttr} style="${escapeAttr(div)}">`
    + `<div style="${escapeAttr(item)}"><div style="${escapeAttr(css.block)}">${html}</div></div>`
    + '</div></foreignObject></g>';
}

// --- plain labels: mxSvgCanvas2D.plainText ---------------------------------------------

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** mxSvgCanvas2D.plainText for a new node. */
function plainText(
  x: number, y: number, w: number, h: number, str: string, t: TextProps, rotation: number,
  dir: TextDirection, state: TextState,
): string {
  const s = state.scale;
  const size = state.fontSize;
  const { align, valign, overflow, clipped: clip } = t;
  const attrs: string[] = [];
  // updateFont
  attrs.push(`fill="${escapeAttr(state.fontColor ?? 'transparent')}"`);
  attrs.push(`font-family="${escapeAttr(parseCssFontFamily(state.fontFamily))}"`);
  if ((state.fontStyle & FONT_BOLD) === FONT_BOLD) attrs.push('font-weight="bold"');
  if ((state.fontStyle & FONT_ITALIC) === FONT_ITALIC) attrs.push('font-style="italic"');
  const deco = textDecoration(state.fontStyle);
  if (deco.length > 0) {
    attrs.push(`text-decoration="${deco.join(' ')}"`);
    if ((state.fontStyle & FONT_UNDERLINE_DOTTED) === FONT_UNDERLINE_DOTTED) {
      attrs.push('style="text-decoration-style: dotted;"');
    }
  }
  attrs.push('pointer-events="none"');
  let tr = '';
  if (rotation !== 0) tr += `rotate(${rotation},${fmt(x * s)},${fmt(y * s)})`;
  if (dir != null && !dir.startsWith('vertical-')) attrs.push(`direction="${dir}"`);
  const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
  attrs.push(`text-anchor="${anchor}"`);
  if (tr.length > 0) attrs.push(`transform="${tr}"`);
  if (state.alpha < 1) attrs.push(`opacity="${state.alpha}"`);

  const lines = str.split('\n');
  const lh = Math.round(size * LINE_HEIGHT);
  const textHeight = size + (lines.length - 1) * lh;
  let cy = y + size - 1;
  if (valign === 'middle') {
    if (overflow === 'fill') cy -= h / 2;
    else cy -= (clip && h > 0 ? Math.min(textHeight, h) : textHeight) / 2;
  } else if (valign === 'bottom') {
    if (overflow === 'fill') cy -= h;
    else cy -= (clip && h > 0 ? Math.min(textHeight, h) : textHeight) + 1;
  }
  attrs.push(`font-size="${size * s}px"`);
  const texts: string[] = [];
  const baselines: Array<{ line: string; y: number }> = [];
  for (const line of lines) {
    if (line.length > 0 && line.trim().length > 0) {
      texts.push(`<text x="${fmt(x * s)}" y="${fmt(cy * s)}">${escapeText(line)}</text>`);
      baselines.push({ line, y: cy });
    }
    cy += lh;
  }
  const background = textBackground(state, str, x, y, w, overflow === 'fill' ? h : textHeight, t, anchor, baselines);
  let clipMarkup = '';
  if (clip && w > 0 && h > 0) {
    let cx = x;
    let ccy = y;
    if (align === 'center') cx -= w / 2;
    else if (align === 'right') cx -= w;
    if (overflow !== 'fill') {
      if (valign === 'middle') ccy -= h / 2;
      else if (valign === 'bottom') ccy -= h;
    }
    const c = {
      x: Math.round(cx * s - 2), y: Math.round(ccy * s - 2), w: Math.round(w * s + 4), h: Math.round(h * s + 4),
    };
    const id = `mx-clip-${c.x}-${c.y}-${c.w}-${c.h}-0`;
    attrs.push(`clip-path="url(#${id})"`);
    clipMarkup = `<clipPath id="${id}"><rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/></clipPath>`;
  }
  return `<g ${attrs.join(' ')}>${background}${texts.join('')}</g>${clipMarkup}`;
}

/**
 * mxSvgCanvas2D.addTextBackground: the rect behind a plain label, from the
 * text's bounding box (approximated, as getBBox would measure it) or, for
 * overflow=fill/width, from the label box; then getTextBackgroundBounds
 * with one screen pixel as the grid.
 */
function textBackground(
  state: TextState, str: string, x: number, y: number, w: number, h: number, t: TextProps,
  anchor: 'start' | 'middle' | 'end', baselines: Array<{ line: string; y: number }>,
): string {
  if (state.fontBackgroundColor == null && state.fontBorderColor == null) return '';
  const s = state.scale;
  const { align, valign, overflow } = t;
  let bbox: Box;
  let dy = 0;
  if (overflow === 'fill' || overflow === 'width') {
    let bx = x;
    let by = y;
    if (align === 'center') bx -= w / 2;
    else if (align === 'right') bx -= w;
    if (valign === 'middle') by -= h / 2;
    else if (valign === 'bottom') by -= h;
    bbox = { x: (bx + 1) * s, y: by * s, width: (w - 2) * s, height: (h + 2) * s };
  } else if (baselines.length > 0) {
    bbox = measuredBox(baselines, x, anchor, state);
    dy = 1;
  } else {
    bbox = stringBox(str, x, y, align, valign, state);
  }
  const padding = overflow !== 'fill' && overflow !== 'width' ? state.labelPadding : null;
  const strokeWidth = state.fontBorderColor != null ? fmt(s * state.fontBorderWidth) : null;
  // getTextBackgroundBounds(node, px = 1, ox = 0, oy = 0)
  let bxx = bbox.x;
  let byy = bbox.y + dy;
  let bw = bbox.width;
  let bh = bbox.height;
  if (padding != null) {
    bxx -= padding.left * s;
    byy -= padding.top * s;
    bw += (padding.left + padding.right) * s;
    bh += (padding.top + padding.bottom) * s;
  }
  const grow = strokeWidth != null ? Math.max(0, strokeWidth - s) / 2 : 0;
  bxx -= grow;
  byy -= grow;
  bw += 2 * grow;
  bh += 2 * grow;
  const sw = strokeWidth != null ? Math.max(1, strokeWidth) : 0;
  const rx = Math.floor(bxx - 1);
  const ry = Math.floor(byy - 1);
  const rw = Math.ceil(bw + 2);
  const rh = Math.ceil(bh);
  return `<rect fill="${escapeAttr(state.fontBackgroundColor ?? 'none')}" stroke="${escapeAttr(state.fontBorderColor ?? 'none')}"`
    + ` x="${rx}" y="${ry}" width="${rw}" height="${rh}" stroke-width="${sw}"/>`;
}

/**
 * What getBBox reports for the <text> lines, from Helvetica/Arial metrics.
 * draw.io measures in model units (the text is painted at the unscaled font
 * size), where Chromium rounds the font's ascent and descent to whole
 * pixels; the box is then scaled to the drawing.
 */
function measuredBox(baselines: Array<{ line: string; y: number }>, x: number, anchor: 'start' | 'middle' | 'end', state: TextState): Box {
  const s = state.scale;
  const size = state.fontSize;
  const ascent = Math.round(FONT_ASCENT * size);
  const descent = Math.round(FONT_DESCENT * size);
  const bold = (state.fontStyle & FONT_BOLD) === FONT_BOLD;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { line, y } of baselines) {
    const width = textWidth(line, size, bold);
    const ax = fmt(x);
    const left = anchor === 'end' ? ax - width : anchor === 'middle' ? ax - width / 2 : ax;
    const base = fmt(y);
    x0 = Math.min(x0, left);
    x1 = Math.max(x1, left + width);
    y0 = Math.min(y0, base - ascent);
    y1 = Math.max(y1, base + descent);
  }
  return { x: x0 * s, y: y0 * s, width: (x1 - x0) * s, height: (y1 - y0) * s };
}

/** mxSvgCanvas2D.getStringBoundingBox (the size of the string as a block of lines). */
function stringBox(str: string, x: number, y: number, align: string, valign: string, state: TextState): Box {
  const lines = str.split('\n');
  const bold = (state.fontStyle & FONT_BOLD) === FONT_BOLD;
  const w = Math.max(0, ...lines.map((line) => textWidth(line, Math.round(state.fontSize), bold)));
  const h = lines.length * Math.round(state.fontSize) * LINE_HEIGHT;
  let bx = x;
  let by = y;
  if (align === 'center') bx -= w / 2;
  else if (align === 'right') bx -= w;
  if (valign === 'middle') by -= h / 2;
  else if (valign === 'bottom') by -= h;
  const s = state.scale;
  return { x: (bx + 1) * s, y: (by + 2) * s, width: w * s, height: (h + 1) * s };
}
