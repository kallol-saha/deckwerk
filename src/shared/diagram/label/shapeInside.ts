/*
 * Text flow inside non-rectangular shapes (shapeInside=1): wrapped labels
 * follow the outline of an ellipse, rhombus, triangle, hexagon, … instead
 * of the label box.
 *
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024
 * JGraph Ltd / draw.io AG, Apache License 2.0: js/grapheditor/Graph.js
 * (Graph.prototype.shapeInsideMargin, getShapeInsidePadding,
 * Graph.mirrorShapeInsideOutline, Graph.getShapeInsideSize,
 * Graph.getShapeInsideTriangleDirection, Graph.shapeInsideOutlines,
 * Graph.shapeInsideBands, getShapeInsideBands, getShapeInsideOutline,
 * isShapeInsideEnabled, getShapeInsideFloats, getShapeInsideBox,
 * createShapeInsideMarkup, getShapeInsideGrow, createShapeInsideValue,
 * createShapeInsideBackground, measureShapeInsideFlow,
 * computeShapeInsideSpacer, computeShapeInsideFontSize,
 * getShapeInsideSpacer and the mxText.prototype.paint override that puts
 * the flow into the label).
 * Modified for DeckWerk: functions over a resolved style instead of Graph
 * methods; the registries are Maps (no prototype lookups from a style);
 * draw.io measures the flow in the DOM (measureShapeInsideFlow), which is
 * replaced by the DOM-free layout model in ./shapeInsideFlow.ts; the
 * markup is returned as XHTML and the label background's colours are
 * written into it (draw.io sets them through the CSSOM after painting).
 */

import type { Style } from '../types.js';
import { replaceTrailingNewlines } from './html.js';
import { layoutShapeInsideFlow } from './shapeInsideFlow.js';
import {
  BASE_SPACING_TOP, DEFAULT_FONTSIZE, FONT_BOLD, jsValue, LINE_HEIGHT, looseEq, type Padding,
} from './text.js';

/** One outline point, relative to the cell: [x / width, y / height]. */
export type OutlinePoint = [number, number];

/**
 * The exclusion regions of the left and right half of the label (one float
 * each), as relative points in cell coordinates; null when a side needs none.
 */
export interface ShapeInsideOutline {
  left: OutlinePoint[] | null;
  right: OutlinePoint[] | null;
}

/** The label content box in unscaled cell coordinates (getShapeInsideBox). */
export interface ShapeInsideBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** tau (relative height) -> [left, right], the interior of the shape at that height. */
export type ShapeInsideBand = (tau: number) => [number, number];

/** mxSvgCanvas2D.prototype.foreignObjectPadding. */
const FOREIGN_OBJECT_PADDING = 2;

/** Graph.prototype.shapeInsideMargin. */
export const SHAPE_INSIDE_MARGIN = 2;

/** mxUtils.getValue: the style's value, or the fallback when it is absent. */
function getValue<T>(style: Style, key: string, fallback: T): string | T {
  const value = style[key];
  return value == null ? fallback : value;
}

/** JavaScript `mxUtils.getValue(style, key, fallback) == literal` with draw.io's numeric style values. */
function valueIs(style: Style, key: string, fallback: string, literal: string): boolean {
  return looseEq(jsValue(style, key) ?? fallback, literal);
}

function direction(style: Style): string {
  return getValue(style, 'direction', 'east');
}

function flipH(style: Style): boolean {
  return valueIs(style, 'flipH', '0', '1');
}

function flipV(style: Style): boolean {
  return valueIs(style, 'flipV', '0', '1');
}

function fixedSize(style: Style): boolean {
  return !valueIs(style, 'fixedSize', '0', '0');
}

function sizeValue(style: Style, fallback: number): number {
  return parseFloat(String(getValue(style, 'size', fallback)));
}

/** Graph.prototype.getShapeInsidePadding: shapeInsidePadding as a safe, non-negative number. */
export function shapeInsidePadding(style: Style): number {
  const result = parseFloat(String(getValue(style, 'shapeInsidePadding', SHAPE_INSIDE_MARGIN)));
  return Number.isFinite(result) && result >= 0 ? result : SHAPE_INSIDE_MARGIN;
}

/** Graph.mirrorShapeInsideOutline: the outline mirrored horizontally (flipH). */
export function mirrorShapeInsideOutline(outline: ShapeInsideOutline): ShapeInsideOutline {
  const mirror = (pts: OutlinePoint[] | null): OutlinePoint[] | null => (pts == null ? null
    : pts.map(([x, y]): OutlinePoint => [1 - x, y]));
  return { left: mirror(outline.right), right: mirror(outline.left) };
}

/**
 * Graph.getShapeInsideSize: the relative width of the slanted or curved
 * sides of a parallelogram, data storage or step, or null if the direction
 * is not east or the size exceeds half the width.
 */
export function shapeInsideSize(style: Style, w: number, defaultSize: number): number | null {
  if (direction(style) !== 'east') return null;
  const s = fixedSize(style) ? Math.max(0, Math.min(w, sizeValue(style, 20)))
    : w * Math.max(0, Math.min(1, sizeValue(style, defaultSize)));
  return s > w / 2 ? null : s / w;
}

/** Graph.getShapeInsideTriangleDirection: where the apex points, flips applied. */
export function shapeInsideTriangleDirection(style: Style): string {
  let dir = direction(style);
  let fh = flipH(style);
  let fv = flipV(style);
  // Direction north/south swaps the flip axes (see mxShape.updateTransform)
  if (dir === 'north' || dir === 'south') [fh, fv] = [fv, fh];
  if (dir === 'east' || dir === 'west') {
    if (fh) dir = dir === 'east' ? 'west' : 'east';
  } else if (fv) {
    dir = dir === 'north' ? 'south' : 'north';
  }
  return dir;
}

/** The hexagon's slant in px along its side, or null when it exceeds half the side. */
function hexagonSlant(style: Style, w: number, h: number): { vertical: boolean; s: number } | null {
  const dir = direction(style);
  const vertical = dir === 'north' || dir === 'south';
  const side = vertical ? h : w;
  const s = fixedSize(style) ? Math.max(0, Math.min(side * 0.5, sizeValue(style, 20)))
    : side * Math.max(0, Math.min(1, sizeValue(style, 0.25)));
  return s > side / 2 ? null : { vertical, s };
}

function trapezoidSlant(style: Style, w: number): number {
  const dx = fixedSize(style) ? Math.max(0, Math.min(w * 0.5, sizeValue(style, 20)))
    : w * Math.max(0, Math.min(0.5, sizeValue(style, 0.2)));
  return dx / w;
}

/** Samples of the D-shaped curve of the or/xor shapes (smoothstep in y, see the ellipse). */
function orCurve(i: number, n: number): { tau: number; x: number } {
  const u = i / n;
  const tau = u * u * (3 - 2 * u);
  const t = Math.sqrt(2 * (tau <= 0.5 ? tau : 1 - tau));
  return { tau, x: 2 * t - t * t };
}

type OutlineFn = (style: Style, w: number, h: number) => ShapeInsideOutline | null;

/**
 * Graph.shapeInsideOutlines: text flow outlines by shape name. Each returns
 * the label exclusion regions of the left and right half of the label as
 * relative points, rendered as shape-outside polygons on two floats. Disjoint
 * regions in one half are joined by a hairline strip along the outer edge,
 * which does not change the line boxes.
 */
const OUTLINES = new Map<string, OutlineFn>([
  ['rhombus', () => ({
    left: [[0, 0], [0.5, 0], [0, 0.5], [0.5, 1], [0, 1]],
    right: [[1, 0], [0.5, 0], [1, 0.5], [0.5, 1], [1, 1]],
  })],
  ['ellipse', () => {
    const left: OutlinePoint[] = [[0, 0], [0.5, 0]];
    const right: OutlinePoint[] = [[1, 0], [0.5, 0]];
    const n = 20;
    for (let i = 1; i < n; i++) {
      // Smoothstep clusters the samples at the vertical extremes where the
      // curve is steep, so that the polygon chords stay close to the curve
      const u = i / n;
      const t = u * u * (3 - 2 * u);
      const x = 0.5 * (1 - Math.sqrt(1 - Math.pow(2 * t - 1, 2)));
      left.push([x, t]);
      right.push([1 - x, t]);
    }
    left.push([0.5, 1], [0, 1]);
    right.push([0.5, 1], [1, 1]);
    return { left, right };
  }],
  ['triangle', (style) => {
    const dir = shapeInsideTriangleDirection(style);
    if (dir === 'north') {
      return { left: [[0, 0], [0.5, 0], [0, 1]], right: [[1, 0], [0.5, 0], [1, 1]] };
    } else if (dir === 'south') {
      return { left: [[0, 1], [0.5, 1], [0, 0]], right: [[1, 1], [0.5, 1], [1, 0]] };
    } else if (dir === 'west') {
      return {
        left: [[0.5, 0], [0, 0], [0, 1], [0.5, 1], [0.5, 0.75], [0, 0.5], [0.5, 0.25]],
        right: [[1, 0], [0.5, 0], [0.5, 0.25], [0.999, 0.001], [0.999, 0.999], [0.5, 0.75], [0.5, 1], [1, 1]],
      };
    }
    return {
      left: [[0, 0], [0.5, 0], [0.5, 0.25], [0.001, 0.001], [0.001, 0.999], [0.5, 0.75], [0.5, 1], [0, 1]],
      right: [[0.5, 0], [1, 0], [1, 1], [0.5, 1], [0.5, 0.75], [1, 0.5], [0.5, 0.25]],
    };
  }],
  ['hexagon', (style, w, h) => {
    const slant = hexagonSlant(style, w, h);
    if (slant == null) return null;
    if (slant.vertical) {
      const su = slant.s / h;
      return {
        left: [[0, 0], [0.5, 0], [0, su], [0, 1 - su], [0.5, 1], [0, 1]],
        right: [[1, 0], [0.5, 0], [1, su], [1, 1 - su], [0.5, 1], [1, 1]],
      };
    }
    const su = slant.s / w;
    return {
      left: [[0, 0], [su, 0], [0, 0.5], [su, 1], [0, 1]],
      right: [[1, 0], [1 - su, 0], [1, 0.5], [1 - su, 1], [1, 1]],
    };
  }],
  ['parallelogram', (style, w) => {
    const du = shapeInsideSize(style, w, 0.2);
    if (du == null) return null;
    if (flipH(style) !== flipV(style)) {
      return { left: [[0, 0], [0, 1], [du, 1]], right: [[1, 0], [1 - du, 0], [1, 1]] };
    }
    return { left: [[0, 0], [du, 0], [0, 1]], right: [[1, 0], [1, 1], [1 - du, 1]] };
  }],
  ['trapezoid', (style, w) => {
    if (direction(style) !== 'east') return null;
    const du = trapezoidSlant(style, w);
    if (flipV(style)) {
      return { left: [[0, 1], [du, 1], [0, 0]], right: [[1, 1], [1 - du, 1], [1, 0]] };
    }
    return { left: [[0, 0], [du, 0], [0, 1]], right: [[1, 0], [1 - du, 0], [1, 1]] };
  }],
  ['dataStorage', (style, w) => {
    const su = shapeInsideSize(style, w, 0.1);
    if (su == null) return null;
    // Samples the quadratic curves of the outline (y is linear in the curve
    // parameter): left bulge x = s * (1 - 2t)^2, right indent
    // x = w - 4 * s * t * (1 - t)
    const left: OutlinePoint[] = [[0, 0], [su, 0]];
    const right: OutlinePoint[] = [[1, 0]];
    const n = 12;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      left.push([su * (1 - 2 * t) * (1 - 2 * t), t]);
      right.push([1 - 4 * su * t * (1 - t), t]);
    }
    left.push([su, 1], [0, 1]);
    right.push([1, 1]);
    const result = { left, right };
    return flipH(style) ? mirrorShapeInsideOutline(result) : result;
  }],
  ['or', (style) => {
    if (direction(style) !== 'east') return null;
    // The D-shaped outline: x = w * (2t - t^2) with t = sqrt(2 * tau) for
    // the upper half, mirrored below. The flat left edge needs no float.
    const right: OutlinePoint[] = [[0, 0]];
    const n = 24;
    for (let i = 1; i < n; i++) {
      const { tau, x } = orCurve(i, n);
      right.push([x, tau]);
    }
    right.push([0, 1], [1, 1], [1, 0]);
    const result = { left: null, right };
    return flipH(style) ? mirrorShapeInsideOutline(result) : result;
  }],
  ['xor', (style) => {
    if (direction(style) !== 'east') return null;
    // Right side as in the or shape, left indent x = w * tau * (1 - tau)
    const left: OutlinePoint[] = [[0, 0]];
    const right: OutlinePoint[] = [[0, 0]];
    const n = 24;
    for (let i = 1; i < n; i++) {
      const { tau, x } = orCurve(i, n);
      left.push([tau * (1 - tau), tau]);
      right.push([x, tau]);
    }
    left.push([0, 1]);
    right.push([0, 1], [1, 1], [1, 0]);
    const result = { left, right };
    return flipH(style) ? mirrorShapeInsideOutline(result) : result;
  }],
  ['step', (style, w) => {
    const su = shapeInsideSize(style, w, 0.2);
    if (su == null) return null;
    if (flipH(style)) {
      return {
        left: [[0, 0], [su, 0], [0, 0.5], [su, 1], [0, 1]],
        right: [[1, 0], [1 - su, 0.5], [1, 1]],
      };
    }
    return {
      left: [[0, 0], [su, 0.5], [0, 1]],
      right: [[1, 0], [1 - su, 0], [1, 0.5], [1 - su, 1], [1, 1]],
    };
  }],
]);

type BandFn = (style: Style, w: number, h: number) => ShapeInsideBand | null;

/**
 * Graph.shapeInsideBands: the horizontal extent of the shape interior at a
 * relative height, for the SVG label conversion; mirrors the outlines.
 */
const BANDS = new Map<string, BandFn>([
  ['rhombus', () => (tau) => {
    const d = 0.5 * Math.abs(2 * tau - 1);
    return [d, 1 - d];
  }],
  ['ellipse', () => (tau) => {
    const d = 0.5 * (1 - Math.sqrt(Math.max(0, 1 - Math.pow(2 * tau - 1, 2))));
    return [d, 1 - d];
  }],
  ['triangle', (style) => {
    const dir = shapeInsideTriangleDirection(style);
    if (dir === 'north') return (tau) => [0.5 * (1 - tau), 1 - 0.5 * (1 - tau)];
    if (dir === 'south') return (tau) => [0.5 * tau, 1 - 0.5 * tau];
    if (dir === 'west') return (tau) => [Math.abs(2 * tau - 1), 1];
    return (tau) => [0, 1 - Math.abs(2 * tau - 1)];
  }],
  ['hexagon', (style, w, h) => {
    const slant = hexagonSlant(style, w, h);
    if (slant == null) return null;
    if (slant.vertical) {
      const sy = slant.s / h;
      return (tau) => {
        const d = 0.5 * Math.max(0, sy > 0 ? Math.max(1 - tau / sy, 1 - (1 - tau) / sy) : 0);
        return [d, 1 - d];
      };
    }
    const su = slant.s / w;
    return (tau) => {
      const d = su * Math.abs(2 * tau - 1);
      return [d, 1 - d];
    };
  }],
  ['parallelogram', (style, w) => {
    const du = shapeInsideSize(style, w, 0.2);
    if (du == null) return null;
    const mirrored = flipH(style) !== flipV(style);
    return (tau) => (mirrored ? [du * tau, 1 - du * (1 - tau)] : [du * (1 - tau), 1 - du * tau]);
  }],
  ['trapezoid', (style, w) => {
    if (direction(style) !== 'east') return null;
    const du = trapezoidSlant(style, w);
    const fv = flipV(style);
    return (tau) => {
      const d = fv ? du * tau : du * (1 - tau);
      return [d, 1 - d];
    };
  }],
  ['dataStorage', (style, w) => {
    const su = shapeInsideSize(style, w, 0.1);
    if (su == null) return null;
    const fh = flipH(style);
    return (tau) => {
      const xl = su * (1 - 2 * tau) * (1 - 2 * tau);
      const xr = 1 - 4 * su * tau * (1 - tau);
      return fh ? [1 - xr, 1 - xl] : [xl, xr];
    };
  }],
  ['or', (style) => {
    if (direction(style) !== 'east') return null;
    const fh = flipH(style);
    return (tau) => {
      const t = Math.sqrt(2 * Math.min(tau, 1 - tau));
      const xr = 2 * t - t * t;
      return fh ? [1 - xr, 1] : [0, xr];
    };
  }],
  ['xor', (style) => {
    if (direction(style) !== 'east') return null;
    const fh = flipH(style);
    return (tau) => {
      const t = Math.sqrt(2 * Math.min(tau, 1 - tau));
      const xl = tau * (1 - tau);
      const xr = 2 * t - t * t;
      return fh ? [1 - xr, 1 - xl] : [xl, xr];
    };
  }],
  ['step', (style, w) => {
    const su = shapeInsideSize(style, w, 0.2);
    if (su == null) return null;
    const fh = flipH(style);
    return (tau) => {
      const xl = su * (1 - Math.abs(2 * tau - 1));
      const xr = 1 - su * Math.abs(2 * tau - 1);
      return fh ? [1 - xr, 1 - xl] : [xl, xr];
    };
  }],
]);

/** The shape the flow follows: shapeInsideShape, else the shape. */
function flowShapeName(style: Style): string | null {
  const name = style.shapeInsideShape;
  return name != null && name !== '' ? name : style.shape ?? null;
}

/** Graph.prototype.getShapeInsideBands for a resolved style and unscaled cell size. */
export function shapeInsideBands(style: Style, w: number, h: number): ShapeInsideBand | null {
  if (!(w > 0 && h > 0)) return null;
  const name = flowShapeName(style);
  const fn = name != null ? BANDS.get(name) : undefined;
  return fn ? fn(style, w, h) : null;
}

/**
 * Graph.prototype.getShapeInsideOutline: the text flow outline for a
 * resolved style and unscaled cell size, or null if the shape or its
 * parameters (direction, flips, size) are not supported. Does not check
 * that the flow is enabled (shapeInsideFloats does).
 */
export function shapeInsideOutline(style: Style, w: number, h: number): ShapeInsideOutline | null {
  if (!(w > 0 && h > 0)) return null;
  const name = flowShapeName(style);
  const fn = name != null ? OUTLINES.get(name) : undefined;
  return fn ? fn(style, w, h) : null;
}

/**
 * Graph.prototype.isShapeInsideEnabled: shapeInside=1 on a wrapped label in
 * its default position, without overflow handling or a label width.
 */
export function isShapeInsideEnabled(style: Style | null | undefined): boolean {
  return style != null && valueIs(style, 'shapeInside', '0', '1')
    && getValue(style, 'whiteSpace', null) === 'wrap'
    && !valueIs(style, 'horizontal', '1', '0')
    && getValue(style, 'overflow', 'visible') === 'visible'
    && getValue(style, 'labelWidth', null) == null
    && getValue(style, 'labelPosition', 'center') === 'center'
    && getValue(style, 'verticalLabelPosition', 'middle') === 'middle';
}

/** Graph.prototype.getShapeInsideFloats: the outline if the flow is enabled and supported. */
export function shapeInsideFloats(style: Style, w: number, h: number): ShapeInsideOutline | null {
  return isShapeInsideEnabled(style) ? shapeInsideOutline(style, w, h) : null;
}

/**
 * Graph.prototype.getShapeInsideBox: the box the wrapped label content is
 * laid out in, in unscaled cell coordinates, from the spacing and the
 * foreignObject padding (mxSvgCanvas2D.createCss, rotateLabelBounds).
 */
export function shapeInsideBox(style: Style, w: number, h: number): ShapeInsideBox {
  const spacing = parseFloat(String(getValue(style, 'spacing', 2)));
  let top = spacing + parseFloat(String(getValue(style, 'spacingTop', 0)));
  const bottom = spacing + parseFloat(String(getValue(style, 'spacingBottom', 0)));
  const left = spacing + parseFloat(String(getValue(style, 'spacingLeft', 0)));
  const right = spacing + parseFloat(String(getValue(style, 'spacingRight', 0)));
  const fop = FOREIGN_OBJECT_PADDING;
  // Top-aligned labels are moved down by the base spacing, so the box
  // moves down with them to keep the carve on the shape
  if (getValue(style, 'verticalAlign', 'middle') === 'top') top += BASE_SPACING_TOP;
  return {
    x: left - fop / 2,
    y: top,
    width: Math.max(1, Math.round(w - left - right + fop)),
    height: Math.max(1, Math.round(h - top - bottom)),
  };
}

// --- the floats --------------------------------------------------------------------

/** One float of the flow: its width and its shape-outside polygon in percent of its box. */
export interface ShapeInsideFloat {
  side: 'left' | 'right';
  /** Left edge of the float in the label content box. */
  x: number;
  width: number;
  /** [x %, y %] as written into the CSS (rounded to 0.01, NaN when the float has no height). */
  polygon: Array<[number, number]>;
}

/** What createShapeInsideMarkup lays out: the floats, their height and margin, and the spacer. */
export interface ShapeInsideLayout {
  floats: ShapeInsideFloat[];
  floatHeight: number;
  margin: number;
  /** Height of the spacer block above the text (0 for none). */
  spacer: number;
}

/** Keeps the polygon on one side of the horizontal line y, inserting the crossings. */
function clipPolygon(pts: Array<[number, number]>, y: number, below: boolean): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const in0 = below ? p0[1] <= y : p0[1] >= y;
    const in1 = below ? p1[1] <= y : p1[1] >= y;
    if (in0) result.push(p0);
    if (in0 !== in1 && p1[1] !== p0[1]) {
      result.push([p0[0] + (p1[0] - p0[0]) * (y - p0[1]) / (p1[1] - p0[1]), y]);
    }
  }
  return result;
}

/**
 * The geometry of Graph.prototype.createShapeInsideMarkup: two floats (one
 * per half of the label box) whose shape-outside polygons carve the outline
 * out of the line boxes, and the spacer for the vertical alignment.
 *
 * Negative spacers implement centred overflow: the floats grow at the top
 * by the offset (baked into the polygon, as shape-outside resolves against
 * the margin box), so the carve stays on the shape while the text flows
 * above and below it. `clip` ends the floats below the last fitted line so
 * that trailing words that fit nowhere continue at the end of the block.
 */
export function shapeInsideLayout(
  outline: ShapeInsideOutline, box: ShapeInsideBox, spacer: number | null, w: number, h: number,
  padding: number | null, clip: number | null,
): ShapeInsideLayout {
  const leftWidth = Math.floor(box.width / 2);
  const rightWidth = box.width - leftWidth;
  const margin = padding != null ? padding : SHAPE_INSIDE_MARGIN;
  const off = spacer != null && spacer < 0 ? Math.round(-spacer) : 0;
  const floatHeight = Math.round(clip != null ? Math.max(0, Math.min(clip, box.height)) : box.height) + off;

  // The outline spans the shape while the float spans the label box, so the
  // polygon is clipped at the top and bottom of the float: clamping the
  // points would change the slopes of the adjacent edges
  const createPolygon = (points: OutlinePoint[], offset: number, width: number): Array<[number, number]> | null => {
    let pts = points.map(([px, py]): [number, number] => [px * w - box.x - offset, off + py * h - box.y]);
    pts = clipPolygon(clipPolygon(pts, 0, false), floatHeight, true);
    const result = pts.map(([px, py]): [number, number] => {
      const x = Math.max(0.05, Math.min(99.95, px / width * 100));
      const y = Math.max(0.05, Math.min(99.95, py / floatHeight * 100));
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    });
    return result.length > 2 ? result : null;
  };

  const floats: ShapeInsideFloat[] = [];
  const left = outline.left != null ? createPolygon(outline.left, 0, leftWidth) : null;
  const right = outline.right != null ? createPolygon(outline.right, leftWidth, rightWidth) : null;
  if (left != null) floats.push({ side: 'left', x: 0, width: leftWidth, polygon: left });
  if (right != null) floats.push({ side: 'right', x: leftWidth, width: rightWidth, polygon: right });
  return { floats, floatHeight, margin, spacer: spacer != null && spacer > 0 ? Math.round(spacer) : 0 };
}

/** Graph.prototype.createShapeInsideMarkup: the floats and the spacer as markup (numbers only, no user input). */
export function createShapeInsideMarkup(
  outline: ShapeInsideOutline, box: ShapeInsideBox, spacer: number | null, w: number, h: number,
  padding: number | null, clip: number | null,
): string {
  const layout = shapeInsideLayout(outline, box, spacer, w, h, padding, clip);
  let result = '';
  for (const f of layout.floats) {
    const polygon = `polygon(${f.polygon.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
    result += `<div data-shape-inside="1" contenteditable="false" style="float:${f.side};width:${f.width}px;`
      + `height:${layout.floatHeight}px;shape-outside:${polygon};shape-margin:${layout.margin}px;pointer-events:none;"></div>`;
  }
  if (layout.spacer > 0) {
    result += `<div data-shape-inside="1" contenteditable="false" style="height:${layout.spacer}px;pointer-events:none;"></div>`;
  }
  return result;
}

/**
 * Graph.prototype.getShapeInsideGrow: how much the wrapper grows for
 * overflow (negative spacers), so that the flex container aligns the
 * overflow above and below the shape (middle) or above it (bottom).
 */
export function shapeInsideGrow(spacer: number | null, valign: string): number {
  return spacer != null && spacer < 0 ? (valign === 'bottom' ? -spacer : -2 * spacer) : 0;
}

/**
 * Graph.prototype.createShapeInsideValue: the sanitised label value in a
 * floated block with the size of the label box, after the floats. The fixed
 * size keeps the flow on the shape when the text overflows; the float keeps
 * overflowing lines from stretching the label's line box.
 */
export function createShapeInsideValue(
  outline: ShapeInsideOutline, box: ShapeInsideBox, spacer: number | null, w: number, h: number, value: string,
  padding: number | null, valign: string, clip: number | null, background: string | null,
): string {
  const height = Math.round(box.height + shapeInsideGrow(spacer, valign));
  // Text decorations do not propagate into out-of-flow boxes, so the
  // wrapper inherits them; with a background it is a stacking context so
  // that the background stays behind the text and in front of the shape
  return `<div style="float:left;text-decoration:inherit;${background != null ? 'position:relative;z-index:0;' : ''}`
    + `width:${Math.round(box.width)}px;height:${height}px;">${background ?? ''}`
    + `${createShapeInsideMarkup(outline, box, spacer, w, h, padding, clip)}${value}</div>`;
}

/** The text of a flow as measureShapeInsideFlow reports it, relative to the label content box. */
export interface ShapeInsideFlow {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** [top, bottom] of each line. */
  lines: Array<[number, number]>;
}

/**
 * Graph.prototype.createShapeInsideBackground: the label background sized
 * to the flowed text (the wrapper fills the label box, so the box that
 * carries the background in createCss would cover the whole shape), out of
 * flow. draw.io sets the colours through the CSSOM after painting; here
 * they are written into the style (they are sanitised colours).
 */
export function createShapeInsideBackground(
  flow: ShapeInsideFlow | null, padding: Padding | null, background: string | null, border: string | null,
): string | null {
  if (flow == null) return null;
  const pad = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return '<div data-shape-inside="1" data-shape-inside-background="1" contenteditable="false" '
    + 'style="position:absolute;z-index:-1;box-sizing:border-box;pointer-events:none;'
    + (border != null ? 'border-style:solid;border-width:1px;' : '')
    + `left:${Math.round(flow.left - pad.left)}px;top:${Math.round(flow.top - pad.top)}px;`
    + `width:${Math.round(flow.right - flow.left + pad.left + pad.right)}px;`
    + `height:${Math.round(flow.bottom - flow.top + pad.top + pad.bottom)}px;`
    + (background != null ? `background-color: ${background};` : '')
    + (border != null ? `border-color: ${border};` : '')
    + '"></div>';
}

// --- measuring and aligning the flow -------------------------------------------------------

/**
 * Graph.prototype.measureShapeInsideFlow: the text flow of the sanitised
 * label markup in the label content box with the given outline and spacer
 * (and font size), or null if no text is laid out. draw.io measures it in a
 * hidden <div>; this asks the DOM-free layout model (./shapeInsideFlow.ts).
 */
export function measureShapeInsideFlow(
  value: string, style: Style, outline: ShapeInsideOutline, box: ShapeInsideBox, spacer: number | null,
  w: number, h: number, fontSize: number | null = null, clip: number | null = null,
): ShapeInsideFlow | null {
  const size = fontSize != null ? fontSize : parseFloat(String(getValue(style, 'fontSize', DEFAULT_FONTSIZE)));
  const fontStyle = parseInt(String(getValue(style, 'fontStyle', 0)), 10);
  const layout = shapeInsideLayout(outline, box, spacer, w, h, shapeInsidePadding(style), clip);
  return layoutShapeInsideFlow(value, {
    fontSize: Number.isFinite(size) ? Math.round(size) : DEFAULT_FONTSIZE,
    bold: (fontStyle & FONT_BOLD) === FONT_BOLD,
    align: String(getValue(style, 'align', 'center')),
  }, layout, box.width);
}

/** The vertical alignment of a flow: the spacer (negative: the overflow offset) and the float clip. */
export interface ShapeInsideAlign {
  spacer: number;
  clip: number | null;
}

interface Probe {
  spacer: number;
  top: number;
  btm: number;
  overflow: boolean;
  lines: number;
}

interface Best {
  spacer: number;
  score: number;
  fits: boolean;
}

/** The horizontal extent of the outline boundary at a relative height (computeShapeInsideSpacer's flat bottom check). */
function crossing(points: OutlinePoint[] | null, tau: number, left: boolean): number | null {
  let result: number | null = null;
  if (points != null) {
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];
      if (p0[1] !== p1[1] && tau >= Math.min(p0[1], p1[1]) && tau <= Math.max(p0[1], p1[1])) {
        const x = p0[0] + (p1[0] - p0[0]) * (tau - p0[1]) / (p1[1] - p0[1]);
        result = result == null ? x : left ? Math.max(result, x) : Math.min(result, x);
      }
    }
  }
  return result;
}

/**
 * Graph.prototype.computeShapeInsideSpacer: the vertical alignment of the
 * flow inside the shape for the sanitised label markup. The line widths
 * depend on the offset, so the offset is found by measuring: for middle the
 * flow is balanced (equal margins, or equal overflow above and below), for
 * bottom it ends as close to the bottom of the box as the outline allows.
 * A short tail that fits the outline nowhere is joined to the block by
 * clipping the floats below the last fitted line.
 */
export function computeShapeInsideSpacer(
  value: string, style: Style, outline: ShapeInsideOutline, box: ShapeInsideBox, w: number, h: number,
): ShapeInsideAlign {
  const valign = String(getValue(style, 'verticalAlign', 'middle'));
  const lineHeight = parseFloat(String(getValue(style, 'fontSize', DEFAULT_FONTSIZE))) * LINE_HEIGHT;
  const measure = (s: number, clip: number | null = null) => measureShapeInsideFlow(value, style, outline, box, s, w, h, null, clip);
  let centered = valign !== 'bottom';
  let h0: number | null = null;
  let spacer = 0;

  if (valign !== 'top') {
    const xl = crossing(outline.left, 0.999, true);
    const xr = crossing(outline.right, 0.999, false);
    const flat = ((xr == null ? 1 : xr) - (xl == null ? 0 : xl)) * w >= 24;

    // Iterates as the line widths depend on the offset: positive spacers
    // push the flow down within the box, negative ones grow the wrapper
    // for overflow. Tracks the best offset, as the line-quantised flow does
    // not always converge.
    const run = (bottom: boolean): Best | null => {
      let result = null as Best | null;
      const probes: Probe[] = [];
      let feas: number | null = null;
      let infeas: number | null = null;

      // Measures the flow at an offset, scores it against the alignment
      // target and keeps the best offset, preferring flows that fit except
      // for bottom alignment within the box
      const probe = (s: number): Probe | null => {
        const flow = measure(s);
        if (flow == null) return null;
        // Flow position in box coordinates (the measurement contains the
        // offset for positive spacers only)
        const off = Math.min(0, s);
        const top = flow.top + off;
        const btm = flow.bottom + off;
        if (h0 == null) h0 = btm - top;
        const overflow = h0 > box.height;
        const fits = btm <= box.height + 0.5 && (bottom || top >= -0.5);
        let score: number | null = null;
        if (!bottom) {
          score = fits ? Math.abs(top - (box.height - btm)) : Math.abs(top + btm - box.height);
        } else if (overflow) {
          score = Math.abs(box.height - btm);
        } else if (s >= 0) {
          // Within the box: for flat bottoms a line slightly below the box
          // beats a flow ending far above it; for pointed shapes the last
          // line must never fall below the outline
          score = fits ? box.height - btm : flat ? 1.5 * (btm - box.height) : null;
        }
        const pref = !bottom || overflow;
        if (score != null && (result == null || (pref && fits && !result.fits)
          || ((!pref || fits === result.fits) && score < result.score))) {
          result = { spacer: s, score, fits };
        }
        const entry = { spacer: s, top, btm, overflow, lines: flow.lines.length };
        probes.push(entry);
        return entry;
      };

      // The best offset aligns the flow within a pixel
      const aligned = () => result != null && result.fits && result.score <= 1;

      let s = 0;
      for (let i = 0; i < (bottom ? 8 : 5); i++) {
        const p = probe(s);
        if (p == null) return null;
        if (aligned()) break;
        let next = bottom ? s + box.height - p.btm : s + (box.height - p.top - p.btm) / 2;
        if (bottom) {
          // The end of the flow jumps where the wrap changes, so the offset
          // at the jump is bisected between the largest offset ending
          // within the box and the smallest offset above it that does not
          if (p.btm <= box.height + 0.5) feas = feas == null ? s : Math.max(feas, s);
          else if (feas == null || s > feas) infeas = infeas == null ? s : Math.min(infeas, s);
          if (feas != null && infeas != null && infeas - feas > 1) next = (feas + infeas) / 2;
          if (!p.overflow) next = Math.max(0, next);
        }
        // Stops if the next offset repeats the measurement
        if (Math.round(next) === Math.round(s)) break;
        s = next;
      }

      // In narrowing outlines the balanced offset of a wrap can lie outside
      // the offsets that produce it, so the iteration oscillates between
      // wraps: bisect between adjacent probes with different wraps
      if (!bottom && !aligned()) {
        const sameWrap = (p0: Probe, p1: Probe) => p0.lines === p1.lines
          && Math.abs((p1.btm - p1.top) - (p0.btm - p0.top)) <= 1;
        const sorted = probes.slice().sort((a, b) => a.spacer - b.spacer);
        let n = 8;
        for (let i = 0; i < sorted.length - 1 && n > 0 && !aligned(); i++) {
          let p0 = sorted[i];
          let p1 = sorted[i + 1];
          while (n > 0 && !aligned() && !sameWrap(p0, p1) && p1.spacer - p0.spacer > 1) {
            const mid = Math.round((p0.spacer + p1.spacer) / 2);
            if (mid <= p0.spacer || mid >= p1.spacer) break;
            const pm = probe(mid);
            n--;
            if (pm == null) break;
            else if (sameWrap(p0, pm)) p0 = pm;
            else p1 = pm;
          }
        }
      }
      return result;
    };

    let r = run(valign === 'bottom');
    // For bottom alignment of overflowing text the narrowing outline can
    // block every flow ending near the bottom; then the overflow is centred
    if (valign === 'bottom' && h0 != null && h0 > box.height && (r == null || !r.fits || r.score > 2 * lineHeight)) {
      r = run(false);
      centered = true;
    }
    spacer = Math.round(r != null ? r.spacer : 0);
  }

  // Trailing lines that fit the outline nowhere are pushed below the floats
  // by the browser. A short tail is joined to the block instead by clipping
  // the floats at the last fitted line (in box coordinates), or null if
  // there is no short detached tail at the offset.
  const deriveClip = (s: number): number | null => {
    let result: number | null = null;
    const flow = measure(s);
    if (flow != null && flow.lines.length > 0) {
      const off = Math.max(0, -s);
      const floatBottom = Math.round(box.height) + off;
      let k = flow.lines.length;
      while (k > 0 && flow.lines[k - 1][0] >= floatBottom - 1) k--;
      if (k < flow.lines.length) {
        const tail = flow.lines[flow.lines.length - 1][1] - flow.lines[k][0];
        const gap = k > 0 ? flow.lines[k][0] - flow.lines[k - 1][1] : 0;
        if (tail <= 2 * lineHeight + 2 && (k === 0 || gap > 2)) result = k > 0 ? flow.lines[k - 1][1] - off : 0;
      }
    }
    return result;
  };

  let clip = deriveClip(spacer);

  // Realigns the joined block, rederiving the clip after each shift; a
  // shift is kept only if it improves the alignment (one retry at half)
  if (clip != null && valign !== 'top') {
    const score = (flow: ShapeInsideFlow, s: number) => {
      const boff = Math.min(0, s);
      return centered ? Math.abs(box.height - (flow.top + boff) - (flow.bottom + boff))
        : Math.abs(box.height - (flow.bottom + boff));
    };
    let joined = measure(spacer, clip);
    for (let i = 0; i < 3 && joined != null; i++) {
      const boff = Math.min(0, spacer);
      let delta = Math.round(centered ? (box.height - (joined.top + boff) - (joined.bottom + boff)) / 2
        : box.height - (joined.bottom + boff));
      let accepted = false;
      for (let j = 0; j < 2 && delta !== 0; j++) {
        let nextClip = deriveClip(spacer + delta);
        nextClip = nextClip != null ? nextClip : clip + delta;
        const check = measure(spacer + delta, nextClip);
        // Keeps the shift if it improves the alignment, except if the
        // shifted flow extends below the box for bottom alignment
        if (check != null && score(check, spacer + delta) < score(joined, spacer)
          && (centered || check.bottom + Math.min(0, spacer + delta) <= box.height + 0.5)) {
          spacer += delta;
          clip = nextClip;
          joined = check;
          accepted = true;
          break;
        }
        delta = Math.round(delta / 2);
      }
      if (!accepted) break;
    }
  }
  return { spacer: Math.round(spacer), clip: clip != null ? Math.round(clip) : null };
}

/**
 * Graph.prototype.computeShapeInsideFontSize: the largest font size (6..84)
 * whose flow fits the outline, or null if the flow cannot be measured
 * (for autosizeText, which DeckWerk does not apply itself).
 */
export function computeShapeInsideFontSize(value: string, style: Style, outline: ShapeInsideOutline, w: number, h: number): number | null {
  const box = shapeInsideBox(style, w, h);
  if (measureShapeInsideFlow(value, style, outline, box, 0, w, h, 1) == null) return null;
  let lo = 1;
  let hi = 84;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const flow = measureShapeInsideFlow(value, style, outline, box, 0, w, h, mid);
    const fits = flow != null && flow.bottom <= box.height + 0.5 && flow.right <= box.width + 0.5;
    if (fits) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(6, lo);
}

// --- the label -------------------------------------------------------------------------------

const SPACER_CACHE = new Map<string, ShapeInsideAlign>();
const SPACER_CACHE_SIZE = 256;

/**
 * Graph.prototype.getShapeInsideSpacer: computeShapeInsideSpacer, cached on
 * every input of the flow (draw.io caches it in the cell state).
 */
export function shapeInsideSpacer(
  value: string, style: Style, outline: ShapeInsideOutline, box: ShapeInsideBox, w: number, h: number,
): ShapeInsideAlign {
  const key = JSON.stringify([box, w, h, shapeInsidePadding(style), outline,
    ...['verticalAlign', 'fontSize', 'fontStyle', 'align'].map((k) => style[k] ?? null), value]);
  const hit = SPACER_CACHE.get(key);
  if (hit != null) {
    SPACER_CACHE.delete(key);
    SPACER_CACHE.set(key, hit);
    return hit;
  }
  const result = computeShapeInsideSpacer(value, style, outline, box, w, h);
  SPACER_CACHE.set(key, result);
  if (SPACER_CACHE.size > SPACER_CACHE_SIZE) SPACER_CACHE.delete(SPACER_CACHE.keys().next().value as string);
  return result;
}

/** The label colours and padding the flow takes over (mxText.background, border, labelPadding). */
export interface ShapeInsideText {
  background: string | null;
  border: string | null;
  labelPadding: Padding | null;
}

/**
 * The mxText.prototype.paint override of Graph.js for an HTML label of a
 * vertex `w` × `h` (unscaled): the painted value (sanitised or escaped,
 * before newlines become <br/>) wrapped in its text flow, or null when the
 * label has none. `background` is true when the flow paints the label
 * background and border, which the label box then must not paint.
 */
export function shapeInsideLabel(
  style: Style, value: string, w: number, h: number, text: ShapeInsideText,
): { html: string; background: boolean } | null {
  if (value === '') return null;
  const outline = shapeInsideFloats(style, w, h);
  if (outline == null) return null;
  const box = shapeInsideBox(style, w, h);
  // Trailing newlines are handled here as the wrapper hides them from the paint
  const flowValue = replaceTrailingNewlines(value, '<div><br/></div>');
  const align = shapeInsideSpacer(flowValue, style, outline, box, w, h);
  let background: string | null = null;
  if (text.background != null || text.border != null) {
    const flow = measureShapeInsideFlow(flowValue, style, outline, box, align.spacer, w, h, null, align.clip);
    background = createShapeInsideBackground(flow, text.labelPadding, text.background, text.border);
  }
  const html = createShapeInsideValue(outline, box, align.spacer, w, h, flowValue, shapeInsidePadding(style),
    String(getValue(style, 'verticalAlign', 'middle')), align.clip, background);
  return { html, background: background != null };
}
