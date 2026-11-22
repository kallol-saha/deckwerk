/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/util/mxUtils.js (getValue, getNumber, isNumeric, mod,
 * relativeCcw, intersection, parseColor, addAlphaToColor) and
 * mxgraph/src/util/mxConstants.js (the constants below).
 * Modified for DeckWerk: typed helpers over a resolved string style that
 * reproduce how draw.io reads a parsed style (numeric strings are numbers).
 */

import type { Point, Style } from '../types.js';

/** mxConstants values the shapes use (draw.io's overrides applied). */
export const DEFAULT_MARKERSIZE = 6;
export const DEFAULT_STARTSIZE = 40;
export const DEFAULT_IMAGESIZE = 24;
export const RECTANGLE_ROUNDING_FACTOR = 0.15;
export const LINE_ARCSIZE = 20;
export const ARROW_SPACING = 0;
export const ARROW_WIDTH = 30;
export const ARROW_SIZE = 30;
/** Graph.js sets SHADOWCOLOR to black and SHADOW_OPACITY to 0.25. */
export const SHADOWCOLOR = '#000000';
export const SHADOW_OPACITY = 0.25;
export const SHADOW_OFFSET_X = 2;
export const SHADOW_OFFSET_Y = 3;
export const SHADOW_BLUR = 2;
export const NONE = 'none';

/** A style value as draw.io holds it after mxStylesheet.getCellStyle. */
export type JsValue = string | number | boolean | null | undefined;

/** mxUtils.isNumeric. */
export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return !Number.isNaN(parseFloat(value)) && Number.isFinite(Number(value))
    && value.toLowerCase().indexOf('0x') < 0;
}

/**
 * The value mxStylesheet.getCellStyle stores for `key`: numeric strings
 * become numbers (so `rounded=0` is falsy and `dashPattern=5` is not a
 * string), everything else stays a string; undefined when absent.
 */
export function styleValue(style: Style | null | undefined, key: string): string | number | undefined {
  if (style == null) return undefined;
  const raw = style[key];
  if (raw == null) return undefined;
  return isNumeric(raw) ? parseFloat(raw) : raw;
}

/** mxUtils.getValue: the parsed value or the default. */
export function getValue<T extends JsValue>(style: Style | null | undefined, key: string, fallback: T): string | number | T {
  const value = styleValue(style, key);
  return value == null ? fallback : value;
}

/** mxUtils.getNumber: Number() of the value, or of the default (0 if none). */
export function getNumber(style: Style | null | undefined, key: string, fallback?: number): number {
  const value = styleValue(style, key);
  return Number(value == null ? (fallback || 0) : value);
}

/** `parseFloat(mxUtils.getValue(style, key, fallback))`. */
export function getFloat(style: Style | null | undefined, key: string, fallback: JsValue): number {
  return toFloat(getValue(style, key, fallback));
}

/** parseFloat as JavaScript applies it to any value. */
export function toFloat(value: JsValue): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

/** ToNumber, as JavaScript arithmetic applies it to a value. */
export function toNumber(value: JsValue): number {
  return Number(value);
}

/** JavaScript truthiness of a parsed style value. */
export function truthy(value: JsValue): boolean {
  return Boolean(value);
}

/** JavaScript `a == b` for parsed style values, as the ported code compares. */
export function looseEq(a: unknown, b: unknown): boolean {
  // Deliberately loose: draw.io compares parsed numbers with strings ('1' == 1).
  return a == b;
}

/** `mxUtils.getValue(style, key, fallback) == 1`, the usual flag test. */
export function isOne(style: Style | null | undefined, key: string, fallback: JsValue = 0): boolean {
  return looseEq(getValue(style, key, fallback), 1);
}

/** A string style value, or the default (getValue for keys whose values are names). */
export function getString(style: Style | null | undefined, key: string, fallback: string): string;
export function getString(style: Style | null | undefined, key: string, fallback: string | null): string | null;
export function getString(style: Style | null | undefined, key: string, fallback: string | null): string | null {
  if (style == null) return fallback;
  const value = style[key];
  return value == null ? fallback : value;
}

/** mxUtils.mod. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

/** mxUtils.relativeCcw. */
export function relativeCcw(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  x2 -= x1;
  y2 -= y1;
  px -= x1;
  py -= y1;
  let ccw = px * y2 - py * x2;
  if (ccw === 0) {
    ccw = px * x2 + py * y2;
    if (ccw > 0) {
      px -= x2;
      py -= y2;
      ccw = px * x2 + py * y2;
      if (ccw < 0) ccw = 0;
    }
  }
  return ccw < 0 ? -1 : (ccw > 0 ? 1 : 0);
}

/** mxUtils.intersection: the intersection of two line segments, or null. */
export function intersection(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
): Point | null {
  const denom = ((y3 - y2) * (x1 - x0)) - ((x3 - x2) * (y1 - y0));
  const numeA = ((x3 - x2) * (y0 - y2)) - ((y3 - y2) * (x0 - x2));
  const numeB = ((x1 - x0) * (y0 - y2)) - ((y1 - y0) * (x0 - x2));
  const ua = numeA / denom;
  const ub = numeB / denom;
  // Makes more robust against rounding errors
  const eps = 0.000001;
  if (ua >= -eps && ua <= 1 + eps && ub >= -eps && ub <= 1 + eps) {
    return { x: x0 + ua * (x1 - x0), y: y0 + ua * (y1 - y0) };
  }
  return null;
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Rgba { r: number; g: number; b: number; a: number }

/**
 * mxUtils.parseColor for the forms that need no DOM: #rgb, #rrggbb,
 * #rrggbbaa and rgb()/rgba(). Returns null for anything else.
 */
export function parseColor(color: string): Rgba | null {
  const value = color.trim();
  if (/^rgba?\(/i.test(value)) {
    const parts = value.replace(/[^\d,.]/g, '').split(',');
    return {
      r: parseInt(parts[0], 10), g: parseInt(parts[1], 10), b: parseInt(parts[2], 10),
      a: parts.length === 4 ? parseFloat(parts[3]) : 1,
    };
  }
  let hex = value;
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16),
    a: match[4] != null ? parseFloat((parseInt(match[4], 16) / 255).toFixed(3)) : 1,
  };
}

/** mxUtils.addAlphaToColor: rgba() with the alpha multiplied in; unknown forms unchanged. */
export function addAlphaToColor(color: string, alpha: number): string {
  if (color === 'transparent') return color;
  const rgb = parseColor(color);
  if (rgb == null) return color;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${rgb.a * alpha})`;
}

/** The light side of a `light-dark(a, b)` colour (slides are light). */
export function lightColor(color: string): string {
  const match = /^\s*light-dark\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/i.exec(color);
  return match ? match[1] : color;
}

/**
 * Image sources come from cell styles, which are untrusted (mxSvgCanvas2D.image
 * rejects script schemes), and short data URIs in styles get their
 * `;base64` back (mxGraph.postProcessCellStyle).
 */
export function normalizeImageSource(image: string | null | undefined): string | null {
  if (image == null || image === '') return null;
  let src = image;
  if (src.substring(0, 11) === 'data:image/') {
    if (src.substring(0, 20) === 'data:image/svg+xml,<') {
      src = src.substring(0, 19) + encodeURIComponent(src.substring(19));
    } else if (src.substring(0, 22) !== 'data:image/svg+xml,%3C') {
      const comma = src.indexOf(',');
      if (comma > 0 && src.substring(comma - 7, comma + 1) !== ';base64,') {
        src = `${src.substring(0, comma)};base64,${src.substring(comma + 1)}`;
      }
    }
  }
  if (/^\s*(javascript|vbscript|livescript)\s*:/i.test(src.replace(/[\x00-\x1F\x7F]/g, ''))) return '';
  return src;
}
