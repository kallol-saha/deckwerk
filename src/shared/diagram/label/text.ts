/*
 * Ported from draw.io (jgraph/drawio 32.7.4): mxgraph/src/shape/mxText.js
 * (constructor, apply, updateMargin, getSpacing, getBorderWidth,
 * isPaintBoundsInverted, getActualTextDirection, getAutoDirection),
 * mxgraph/src/shape/mxShape.js (getTextRotation),
 * mxgraph/src/view/mxCellRenderer.js (createTextShape, createLabel),
 * mxgraph/src/view/mxGraph.js (getLabel, isWrapping, isLabelClipped,
 * getVerticalAlign), mxgraph/src/view/mxStylesheet.js (numeric values),
 * mxgraph/src/util/mxUtils.js (isNumeric, getAlignmentAsPoint,
 * parseCssSpacing, parseCssFontFamily, getRotatedPoint, unscale) and
 * js/grapheditor/Graph.js (isHtmlLabel, baseSpacingTop/Bottom,
 * getLabelAutoRotation).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: the text shape's properties are read from a
 * resolved style into a plain object instead of living on an mxText; no
 * DOM, no cell state.
 */

import { resolveColor } from '../canvas.js';
import type { Point, Style } from '../types.js';

/** mxConstants.LINE_HEIGHT (ABSOLUTE_LINE_HEIGHT is false). */
export const LINE_HEIGHT = 1.2;
export const DEFAULT_FONTSIZE = 11;
export const DEFAULT_FONTFAMILY = 'Arial,Helvetica';
/** mxConstants.WORD_WRAP. */
export const WORD_WRAP = 'normal';
/** Graph.js sets these to match mxGraph 1.x label positions. */
export const BASE_SPACING_TOP = 5;
export const BASE_SPACING_BOTTOM = 1;
export const BASE_SPACING_LEFT = 0;
export const BASE_SPACING_RIGHT = 0;
/** mxText.prototype.verticalTextRotation. */
export const VERTICAL_TEXT_ROTATION = -90;
export const FONT_BOLD = 1;
export const FONT_ITALIC = 2;
export const FONT_UNDERLINE = 4;
export const FONT_STRIKETHROUGH = 8;
export const FONT_UNDERLINE_DOTTED = 16;

// --- style values as mxStylesheet stores them ---------------------------------

/** mxUtils.isNumeric for a string. */
export function isNumeric(value: string): boolean {
  return !Number.isNaN(parseFloat(value)) && Number.isFinite(Number(value))
    && value.toLowerCase().indexOf('0x') < 0;
}

/**
 * The value draw.io holds for a key: mxStylesheet.getCellStyle turns numeric
 * strings into numbers, so `0` is falsy and `'1' == 1` holds.
 */
export function jsValue(style: Style, key: string): number | string | undefined {
  const value = style[key];
  if (value == null) return undefined;
  return isNumeric(value) ? parseFloat(value) : value;
}

/** JavaScript truthiness of a style value (mxUtils.getValue(style, key, fallback) in a condition). */
export function truthy(style: Style, key: string, fallback: boolean | number | string = false): boolean {
  const value = jsValue(style, key);
  return Boolean(value === undefined ? fallback : value);
}

/** JavaScript `==` between a style value and a literal. */
export function looseEq(a: number | string | boolean | undefined | null, b: number | string | boolean): boolean {
  if (a == null) return false;
  const na = typeof a === 'boolean' ? Number(a) : a;
  const nb = typeof b === 'boolean' ? Number(b) : b;
  if (typeof na === typeof nb) return na === nb;
  return Number(na) === Number(nb);
}

/** A number from the style, or the fallback for absent or non-numeric values. */
export function numberValue(style: Style, key: string, fallback: number): number {
  const value = style[key];
  if (value == null) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** parseInt(value) as mxText.apply reads spacing, with the fallback for junk. */
function intValue(style: Style, key: string, fallback: number): number {
  const value = style[key];
  if (value == null) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** mxUtils.unscale. */
export function unscale(value: number, scale: number, translate = 0): number {
  return Math.round((value / scale - translate) * 1e6) / 1e6;
}

/** mxUtils.getRotatedPoint for an angle in degrees. */
export function rotatePoint(pt: Point, degrees: number, center: Point): Point {
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = pt.x - center.x;
  const y = pt.y - center.y;
  return { x: x * cos - y * sin + center.x, y: y * cos + x * sin + center.y };
}

/** mxUtils.getAlignmentAsPoint. */
export function alignmentPoint(align: string, valign: string): Point {
  let dx = -0.5;
  let dy = -0.5;
  if (align === 'left') dx = 0;
  else if (align === 'right') dx = -1;
  if (valign === 'top') dy = 0;
  else if (valign === 'bottom') dy = -1;
  return { x: dx, y: dy };
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** mxUtils.parseCssSpacing: 1–4 CSS-style numbers, null when all are zero. */
export function parseCssSpacing(value: string | number | null | undefined): Padding | null {
  if (value == null || value === '') return null;
  const values: number[] = [];
  for (const token of String(value).split(/\s+/)) {
    if (values.length >= 4) break;
    if (token.length > 0) {
      const v = parseFloat(token);
      values.push(Number.isFinite(v) ? Math.max(0, v) : 0);
    }
  }
  if (values.length === 0) return null;
  const top = values[0];
  const right = values.length > 1 ? values[1] : top;
  const bottom = values.length > 2 ? values[2] : top;
  const left = values.length > 3 ? values[3] : right;
  return top > 0 || right > 0 || bottom > 0 || left > 0 ? { top, right, bottom, left } : null;
}

/** mxUtils.parseCssFontFamily: quotes families that are not CSS identifiers. */
export function parseCssFontFamily(fontFamily: string): string {
  return fontFamily.split(',').map((raw) => {
    let token = raw.trim();
    const hasQuotes = token.length > 2 && ((token.endsWith('"') && token.startsWith('"'))
      || (token.endsWith('\'') && token.startsWith('\'')));
    if (hasQuotes) token = token.substring(1, token.length - 1);
    const needsQuotes = hasQuotes || !/^-?[A-Za-z_\u00A0-\uFFFF][\w\u00A0-\uFFFF-]*$/.test(token);
    return needsQuotes ? `'${token.replace(/'/g, '\\\'')}'` : token;
  }).join(', ');
}

/**
 * A colour safe to put into CSS or an SVG attribute: `none`, resource
 * references (mxUtils.hasResourceReference) and anything that could close
 * the declaration are dropped. light-dark() resolves to its light side.
 */
export function safeColor(value: string | null | undefined): string | null {
  const color = resolveColor(value);
  if (color == null) return null;
  if (/url\s*\(|[;{}<>"'\\]|\/\*|@/i.test(color)) return null;
  return color;
}

// --- the text shape --------------------------------------------------------------

export type TextDirection = 'ltr' | 'rtl' | 'vertical-lr' | 'vertical-rl' | null;

/** What mxText holds after createTextShape and apply(state). */
export interface TextProps {
  /** mxGraph.isHtmlLabel in draw.io: html=1 or whiteSpace=wrap. */
  html: boolean;
  /** html=1 (the value is markup, not text). */
  markup: boolean;
  align: string;
  valign: string;
  /** spacing plus the side's own spacing, as mxText stores them. */
  spacing: number;
  spacingTop: number;
  spacingRight: number;
  spacingBottom: number;
  spacingLeft: number;
  /** mxText.isPaintBoundsInverted: horizontal=0 on a vertex. */
  inverted: boolean;
  color: string | null;
  family: string;
  size: number;
  fontStyle: number;
  background: string | null;
  border: string | null;
  borderWidth: number;
  labelPadding: Padding | null;
  wrap: boolean;
  clipped: boolean;
  overflow: string;
  /** textOpacity, 0–100. */
  opacity: number;
  textDirection: string;
}

/** Graph.isHtmlLabel. */
export function isHtmlLabel(style: Style): boolean {
  return looseEq(jsValue(style, 'html'), '1') || style.whiteSpace === 'wrap';
}

/** mxGraph.getVerticalAlign: `verticalAlign || middle`. */
export function verticalAlign(style: Style): string {
  return style.verticalAlign || 'middle';
}

/**
 * mxCellRenderer.createTextShape followed by mxText.resetStyles and apply,
 * which is how every label is configured before it is first painted.
 */
export function textProps(style: Style, kind: 'vertex' | 'edge'): TextProps {
  const html = isHtmlLabel(style);
  const spacing = intValue(style, 'spacing', 2);
  const horizontal = jsValue(style, 'horizontal');
  const borderWidthValue = parseFloat(style.labelBorderWidth ?? '1');
  const fontSize = parseFloat(style.fontSize ?? String(DEFAULT_FONTSIZE));
  const fontStyle = Number(jsValue(style, 'fontStyle') ?? 0);
  const opacity = parseFloat(style.textOpacity ?? '100');
  return {
    html,
    markup: html && !looseEq(jsValue(style, 'html') ?? '0', '0'),
    align: style.align ?? 'center',
    valign: verticalAlign(style),
    spacing,
    spacingTop: intValue(style, 'spacingTop', 0) + spacing,
    spacingRight: intValue(style, 'spacingRight', 0) + spacing,
    spacingBottom: intValue(style, 'spacingBottom', 0) + spacing,
    spacingLeft: intValue(style, 'spacingLeft', 0) + spacing,
    inverted: kind === 'vertex' && horizontal !== undefined && !horizontal,
    color: style.fontColor == null ? 'black' : safeColor(style.fontColor),
    family: style.fontFamily ?? DEFAULT_FONTFAMILY,
    size: Number.isFinite(fontSize) ? fontSize : DEFAULT_FONTSIZE,
    fontStyle: Number.isFinite(fontStyle) ? fontStyle | 0 : 0,
    background: safeColor(style.labelBackgroundColor),
    border: safeColor(style.labelBorderColor),
    borderWidth: Number.isFinite(borderWidthValue) && borderWidthValue >= 0 ? borderWidthValue : 1,
    labelPadding: parseCssSpacing(style.labelPadding ?? 0),
    wrap: style.whiteSpace === 'wrap' && html,
    clipped: style.overflow === 'hidden',
    overflow: style.overflow ?? 'visible',
    opacity: Number.isFinite(opacity) ? opacity : 100,
    textDirection: style.textDirection ?? '',
  };
}

/** mxCellRenderer.createLabel / mxGraph.getLabel: is a label painted at all. */
export function labelEnabled(style: Style): boolean {
  if (truthy(style, 'noLabel')) return false;
  const size = style.fontSize;
  if (size == null || size === 'inherit') return true;
  return parseFloat(size) > 0;
}

/** mxText.getSpacing. */
export function textSpacing(t: TextProps, noBase: boolean, margin: Point | null): Point {
  let dx: number;
  let dy: number;
  if ((margin != null && margin.x === -0.5) || (margin == null && t.align === 'center')) {
    dx = (t.spacingLeft - t.spacingRight) / 2;
  } else if ((margin != null && margin.x === -1) || (margin == null && t.align === 'right')) {
    dx = -t.spacingRight - (noBase ? 0 : BASE_SPACING_RIGHT);
  } else {
    dx = t.spacingLeft + (noBase ? 0 : BASE_SPACING_LEFT);
  }
  if (t.valign === 'middle') dy = (t.spacingTop - t.spacingBottom) / 2;
  else if (t.valign === 'bottom') dy = -t.spacingBottom - (noBase ? 0 : BASE_SPACING_BOTTOM);
  else dy = t.spacingTop + (noBase ? 0 : BASE_SPACING_TOP);
  return { x: dx, y: dy };
}

/**
 * mxShape.getTextRotation (vertices: the style's rotation; edges: 0, as
 * mxPolyline.getRotation) plus -90° for horizontal=0, or the angle of
 * labelAutoRotate=1 (Graph.getLabelAutoRotation) when the edge angle is given.
 */
export function textRotation(style: Style, kind: 'vertex' | 'edge', options: {
  ignoreRotation?: boolean;
  edgeAngle?: number | null;
} = {}): number {
  if (options.edgeAngle != null && style.labelAutoRotate === '1') {
    let angle = ((options.edgeAngle % 360) + 360) % 360;
    if (angle > 90 && angle < 270) angle -= 180;
    return angle;
  }
  let rot = kind === 'vertex' && !options.ignoreRotation ? numberValue(style, 'rotation', 0) : 0;
  if (!looseEq(jsValue(style, 'horizontal') ?? 1, 1)) rot += VERTICAL_TEXT_ROTATION;
  return rot;
}

/** mxText.getActualTextDirection (auto reads the label's first strong character). */
export function actualTextDirection(direction: string, value: string): TextDirection {
  let dir = direction;
  if (dir === 'auto') {
    const match = /[A-Za-z\u05d0-\u065f\u066a-\u06ef\u06fa-\u07ff\ufb1d-\ufdff\ufe70-\ufefc]/.exec(value);
    dir = match != null && match[0] > 'z' ? 'rtl' : 'ltr';
  }
  return dir === 'ltr' || dir === 'rtl' || dir === 'vertical-lr' || dir === 'vertical-rl' ? dir : null;
}
