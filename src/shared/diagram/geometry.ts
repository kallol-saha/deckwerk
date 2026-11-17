/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/util/mxUtils.js (the geometry helpers), mxgraph/src/util/
 * mxRectangle.js, mxgraph/src/util/mxConstants.js (the direction masks) and
 * mxgraph/src/view/mxStylesheet.js (how style values are typed).
 * Modified for DeckWerk: plain functions over plain {x, y} and
 * {x, y, width, height} objects instead of mxPoint/mxRectangle instances,
 * typed for TypeScript; no DOM.
 */

import type { Point, Rect, Style } from './types.js';

// --- mxConstants -------------------------------------------------------------

export const DIRECTION_NORTH = 'north';
export const DIRECTION_SOUTH = 'south';
export const DIRECTION_EAST = 'east';
export const DIRECTION_WEST = 'west';

export const DIRECTION_MASK_NONE = 0;
export const DIRECTION_MASK_WEST = 1;
export const DIRECTION_MASK_NORTH = 2;
export const DIRECTION_MASK_SOUTH = 4;
export const DIRECTION_MASK_EAST = 8;
export const DIRECTION_MASK_ALL = 15;

// --- style values as mxStylesheet types them ------------------------------------

/**
 * A style value as draw.io holds it after mxStylesheet.getCellStyle parsed
 * the style string: numeric strings become numbers (parseFloat), everything
 * else stays a string. The routing code compares and adds these values with
 * JavaScript's loose semantics (`== 1`, `|| 0`, `parseFloat(…)`), so the port
 * reads them through `getValue` to get exactly the same results.
 */
export type StyleValue = string | number;

/** mxUtils.isNumeric */
export function isNumeric(n: unknown): boolean {
  if (typeof n === 'number') return Number.isFinite(n);
  if (typeof n !== 'string') return false;
  return !Number.isNaN(parseFloat(n)) && Number.isFinite(Number(n)) && n.toLowerCase().indexOf('0x') < 0;
}

/** The value of `key` as mxStylesheet.getCellStyle stores it, or undefined. */
export function styleValue(style: Style | null | undefined, key: string): StyleValue | undefined {
  const value = style != null ? style[key] : undefined;
  if (value == null) return undefined;
  return isNumeric(value) ? parseFloat(value) : value;
}

/** mxUtils.getValue over a parsed style. */
export function getValue<T>(style: Style | null | undefined, key: string, defaultValue: T): StyleValue | T {
  const value = styleValue(style, key);
  return value == null ? defaultValue : value;
}

/** JavaScript truthiness of a style value (`if (value)`). */
export function truthy(value: unknown): boolean {
  return Boolean(value);
}

/** mxUtils.getNumber: Number(value), or the default (or 0) for no value. */
export function getNumber(style: Style | null | undefined, key: string, defaultValue = 0): number {
  const value = styleValue(style, key);
  return Number(value == null ? defaultValue || 0 : value);
}

/** parseFloat as JavaScript applies it to any value (numbers go through String). */
export function jsParseFloat(value: unknown): number {
  return parseFloat(String(value));
}

/** parseInt as JavaScript applies it to a number (through its string form). */
export function jsParseInt(value: unknown): number {
  return parseInt(String(value), 10);
}

// --- mxRectangle --------------------------------------------------------------

export function centerX(r: Rect): number {
  return r.x + r.width / 2;
}

export function centerY(r: Rect): number {
  return r.y + r.height / 2;
}

export function cloneRect(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** mxRectangle.grow (in place). */
export function grow(r: Rect, amount: number): Rect {
  r.x -= amount;
  r.y -= amount;
  r.width += 2 * amount;
  r.height += 2 * amount;
  return r;
}

/** mxRectangle.rotate90: rotates the rectangle by 90 degree around its center (in place). */
export function rotate90(r: Rect): void {
  const t = (r.width - r.height) / 2;
  r.x += t;
  r.y -= t;
  const tmp = r.width;
  r.width = r.height;
  r.height = tmp;
}

/** mxRectangle.add: adds the given rectangle to this rectangle (in place). */
export function addRect(r: Rect, rect: Rect | null | undefined): void {
  if (rect != null) {
    const minX = Math.min(r.x, rect.x);
    const minY = Math.min(r.y, rect.y);
    const maxX = Math.max(r.x + r.width, rect.x + rect.width);
    const maxY = Math.max(r.y + r.height, rect.y + rect.height);
    r.x = minX;
    r.y = minY;
    r.width = maxX - minX;
    r.height = maxY - minY;
  }
}

// --- mxUtils --------------------------------------------------------------------

/** Converts the given degree to radians. */
export function toRadians(deg: number): number {
  return Math.PI * deg / 180;
}

/** Converts the given radians to degree. */
export function toDegree(rad: number): number {
  return rad * 180 / Math.PI;
}

/**
 * Returns the remainder of division of n by m. You should use this instead
 * of the built-in operation as the built-in operation does not properly
 * handle negative numbers.
 */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Returns the given scaled coordinate in model units, that is, divided by
 * scale minus the optional translate, without the floating point noise of
 * the conversion so that rounding the result does not depend on the scale
 * or translate of the view.
 */
export function unscale(value: number, scale: number, translate?: number | null): number {
  const tr = translate != null ? translate : 0;
  return Math.round((value / scale - tr) * 1e6) / 1e6;
}

/**
 * Returns the bounding box for the rotated rectangle.
 *
 * rect - rectangle to be rotated.
 * rotation - angle in degrees.
 * cx - Optional rotation center. If no rotation center is given then the
 * center of rect is used.
 */
export function getBoundingBox(rect: Rect | null, rotation: number | null, cx?: Point | null): Rect | null {
  let result: Rect | null = null;

  if (rect != null && rotation != null && rotation != 0) {
    const rad = toRadians(rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const c = cx != null ? cx : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    let p1: Point = { x: rect.x, y: rect.y };
    let p2: Point = { x: rect.x + rect.width, y: rect.y };
    let p3: Point = { x: p2.x, y: rect.y + rect.height };
    let p4: Point = { x: rect.x, y: p3.y };

    p1 = getRotatedPoint(p1, cos, sin, c);
    p2 = getRotatedPoint(p2, cos, sin, c);
    p3 = getRotatedPoint(p3, cos, sin, c);
    p4 = getRotatedPoint(p4, cos, sin, c);

    result = { x: p1.x, y: p1.y, width: 0, height: 0 };
    addRect(result, { x: p2.x, y: p2.y, width: 0, height: 0 });
    addRect(result, { x: p3.x, y: p3.y, width: 0, height: 0 });
    addRect(result, { x: p4.x, y: p4.y, width: 0, height: 0 });
  }

  return result;
}

/** Rotates the given point by the given cos and sin. */
export function getRotatedPoint(pt: Point, cos: number, sin: number, c?: Point | null): Point {
  const center = c != null ? c : { x: 0, y: 0 };
  const x = pt.x - center.x;
  const y = pt.y - center.y;

  const x1 = x * cos - y * sin;
  const y1 = y * cos + x * sin;

  return { x: x1 + center.x, y: y1 + center.y };
}

/**
 * Returns an integer mask of the port constraints of the given map.
 *
 * terminal - the terminal (its style is read).
 * edge - the edge (its style is read).
 * source - Boolean that specifies if the terminal is the source terminal.
 * defaultValue - Default value to be returned.
 */
export function getPortConstraints(terminal: { style: Style }, edge: { style: Style }, source: boolean, defaultValue: number): number {
  const value = getValue(terminal.style, 'portConstraint',
    getValue(edge.style, source ? 'sourcePortConstraint' : 'targetPortConstraint', null));

  if (value == null) {
    return defaultValue;
  } else {
    const directions = value.toString();
    let returnValue = DIRECTION_MASK_NONE;
    const constraintRotationEnabled = getValue(terminal.style, 'portConstraintRotation', 0);
    let rotation = 0;

    if (constraintRotationEnabled == 1) {
      // Relational comparisons in JavaScript convert with Number()
      rotation = Number(getValue(terminal.style, 'rotation', 0));
    }

    let quad = 0;

    if (rotation > 45) {
      quad = 1;

      if (rotation >= 135) {
        quad = 2;
      }
    } else if (rotation < -45) {
      quad = 3;

      if (rotation <= -135) {
        quad = 2;
      }
    }

    if (directions.indexOf(DIRECTION_NORTH) >= 0) {
      switch (quad) {
        case 0: returnValue |= DIRECTION_MASK_NORTH; break;
        case 1: returnValue |= DIRECTION_MASK_EAST; break;
        case 2: returnValue |= DIRECTION_MASK_SOUTH; break;
        case 3: returnValue |= DIRECTION_MASK_WEST; break;
      }
    }
    if (directions.indexOf(DIRECTION_WEST) >= 0) {
      switch (quad) {
        case 0: returnValue |= DIRECTION_MASK_WEST; break;
        case 1: returnValue |= DIRECTION_MASK_NORTH; break;
        case 2: returnValue |= DIRECTION_MASK_EAST; break;
        case 3: returnValue |= DIRECTION_MASK_SOUTH; break;
      }
    }
    if (directions.indexOf(DIRECTION_SOUTH) >= 0) {
      switch (quad) {
        case 0: returnValue |= DIRECTION_MASK_SOUTH; break;
        case 1: returnValue |= DIRECTION_MASK_WEST; break;
        case 2: returnValue |= DIRECTION_MASK_NORTH; break;
        case 3: returnValue |= DIRECTION_MASK_EAST; break;
      }
    }
    if (directions.indexOf(DIRECTION_EAST) >= 0) {
      switch (quad) {
        case 0: returnValue |= DIRECTION_MASK_EAST; break;
        case 1: returnValue |= DIRECTION_MASK_SOUTH; break;
        case 2: returnValue |= DIRECTION_MASK_WEST; break;
        case 3: returnValue |= DIRECTION_MASK_NORTH; break;
      }
    }

    return returnValue;
  }
}

/**
 * Reverse the port constraint bitmask. For example, north | east
 * becomes south | west
 */
export function reversePortConstraints(constraint: number): number {
  let result = 0;

  result = (constraint & DIRECTION_MASK_WEST) << 3;
  result |= (constraint & DIRECTION_MASK_NORTH) << 1;
  result |= (constraint & DIRECTION_MASK_SOUTH) >> 1;
  result |= (constraint & DIRECTION_MASK_EAST) >> 3;

  return result;
}

/**
 * Finds the index of the nearest segment of the given absolute points
 * (mxCellState.absolutePoints) for the specified coordinate pair.
 */
export function findNearestSegment(absolutePoints: readonly Point[], x: number, y: number): number {
  let index = -1;

  if (absolutePoints.length > 0) {
    let last = absolutePoints[0];
    let min: number | null = null;

    for (let i = 1; i < absolutePoints.length; i++) {
      const current = absolutePoints[i];
      const dist = ptSegDistSq(last.x, last.y, current.x, current.y, x, y);

      if (min == null || dist < min) {
        min = dist;
        index = i - 1;
      }

      last = current;
    }
  }

  return index;
}

/**
 * Adds the given margins to the given rectangle and rotates and flips the
 * rectangle according to the respective styles in style. The margins in
 * `m` are rounded and clamped in place, as draw.io does.
 */
export function getDirectedBounds(rect: Rect, m: Rect, style: Style | null, flipH?: boolean | null, flipV?: boolean | null): Rect {
  const d = getValue(style, 'direction', DIRECTION_EAST);
  const fh = flipH != null ? flipH : getValue(style, 'flipH', false);
  const fv = flipV != null ? flipV : getValue(style, 'flipV', false);

  m.x = Math.round(Math.max(0, Math.min(rect.width, m.x)));
  m.y = Math.round(Math.max(0, Math.min(rect.height, m.y)));
  m.width = Math.round(Math.max(0, Math.min(rect.width, m.width)));
  m.height = Math.round(Math.max(0, Math.min(rect.height, m.height)));

  if ((fv && (d == DIRECTION_SOUTH || d == DIRECTION_NORTH)) ||
    (fh && (d == DIRECTION_EAST || d == DIRECTION_WEST))) {
    const tmp = m.x;
    m.x = m.width;
    m.width = tmp;
  }

  if ((fh && (d == DIRECTION_SOUTH || d == DIRECTION_NORTH)) ||
    (fv && (d == DIRECTION_EAST || d == DIRECTION_WEST))) {
    const tmp = m.y;
    m.y = m.height;
    m.height = tmp;
  }

  const m2 = cloneRect(m);

  if (d == DIRECTION_SOUTH) {
    m2.y = m.x;
    m2.x = m.height;
    m2.width = m.y;
    m2.height = m.width;
  } else if (d == DIRECTION_WEST) {
    m2.y = m.height;
    m2.x = m.width;
    m2.width = m.x;
    m2.height = m.y;
  } else if (d == DIRECTION_NORTH) {
    m2.y = m.width;
    m2.x = m.y;
    m2.width = m.height;
    m2.height = m.x;
  }

  return { x: rect.x + m2.x, y: rect.y + m2.y, width: rect.width - m2.width - m2.x, height: rect.height - m2.height - m2.y };
}

/**
 * Returns the intersection between the polygon defined by the array of
 * points and the line between center and point.
 */
export function getPerimeterPoint(pts: readonly Point[], center: Point, point: Point): Point | null {
  let min: { p: Point; distSq: number } | null = null;

  for (let i = 0; i < pts.length - 1; i++) {
    const pt = intersection(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y,
      center.x, center.y, point.x, point.y);

    if (pt != null) {
      const dx = point.x - pt.x;
      const dy = point.y - pt.y;
      const ip = { p: pt, distSq: dy * dy + dx * dx };

      if (min == null || min.distSq > ip.distSq) {
        min = ip;
      }
    }
  }

  return min != null ? min.p : null;
}

/** Returns true if the given rectangle intersects the given segment. */
export function rectangleIntersectsSegment(bounds: Rect, p1: Point, p2: Point): boolean {
  const top = bounds.y;
  const left = bounds.x;
  const bottom = top + bounds.height;
  const right = left + bounds.width;

  // Find min and max X for the segment
  let minX = p1.x;
  let maxX = p2.x;

  if (p1.x > p2.x) {
    minX = p2.x;
    maxX = p1.x;
  }

  // Find the intersection of the segment's and rectangle's x-projections
  if (maxX > right) {
    maxX = right;
  }

  if (minX < left) {
    minX = left;
  }

  if (minX > maxX) { // If their projections do not intersect return false
    return false;
  }

  // Find corresponding min and max Y for min and max X we found before
  let minY = p1.y;
  let maxY = p2.y;
  const dx = p2.x - p1.x;

  if (Math.abs(dx) > 0.0000001) {
    const a = (p2.y - p1.y) / dx;
    const b = p1.y - a * p1.x;
    minY = a * minX + b;
    maxY = a * maxX + b;
  }

  if (minY > maxY) {
    const tmp = maxY;
    maxY = minY;
    minY = tmp;
  }

  // Find the intersection of the segment's and rectangle's y-projections
  if (maxY > bottom) {
    maxY = bottom;
  }

  if (minY < top) {
    minY = top;
  }

  if (minY > maxY) { // If Y-projections do not intersect return false
    return false;
  }

  return true;
}

/** Returns true if the specified point (x, y) is contained in the given rectangle. */
export function contains(bounds: Rect, x: number, y: number): boolean {
  return bounds.x <= x && bounds.x + bounds.width >= x &&
    bounds.y <= y && bounds.y + bounds.height >= y;
}

/**
 * Returns the intersection of two line segments, or null.
 *
 * x0, y0, x1, y1 - the first line's start and end point.
 * x2, y2, x3, y3 - the second line's start and end point.
 */
export function intersection(x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number): Point | null {
  const denom = ((y3 - y2) * (x1 - x0)) - ((x3 - x2) * (y1 - y0));
  const numeA = ((x3 - x2) * (y0 - y2)) - ((y3 - y2) * (x0 - x2));
  const numeB = ((x1 - x0) * (y0 - y2)) - ((y1 - y0) * (x0 - x2));

  const ua = numeA / denom;
  const ub = numeB / denom;

  // Makes more robust against rounding errors
  const eps = 0.000001;

  if (ua >= -eps && ua <= 1.0 + eps && ub >= -eps && ub <= 1.0 + eps) {
    // Get the intersection point
    const x = x0 + ua * (x1 - x0);
    const y = y0 + ua * (y1 - y0);

    return { x, y };
  }

  // No intersection
  return null;
}

/**
 * Returns the square distance between a segment and a point. To get the
 * distance between a point and a line (with infinite length) use ptLineDist.
 */
export function ptSegDistSq(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  x2 -= x1;
  y2 -= y1;

  px -= x1;
  py -= y1;

  let dotprod = px * x2 + py * y2;
  let projlenSq: number;

  if (dotprod <= 0.0) {
    projlenSq = 0.0;
  } else {
    px = x2 - px;
    py = y2 - py;
    dotprod = px * x2 + py * y2;

    if (dotprod <= 0.0) {
      projlenSq = 0.0;
    } else {
      projlenSq = dotprod * dotprod / (x2 * x2 + y2 * y2);
    }
  }

  let lenSq = px * px + py * py - projlenSq;

  if (lenSq < 0) {
    lenSq = 0;
  }

  return lenSq;
}

/**
 * Returns the distance between a line defined by two points and a point.
 * To get the distance between a point and a segment (with a specific
 * length) use ptSegDistSq.
 */
export function ptLineDist(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  return Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) /
    Math.sqrt((y2 - y1) * (y2 - y1) + (x2 - x1) * (x2 - x1));
}

/**
 * Returns 1 if the given point on the right side of the segment, 0 if its
 * on the segment, and -1 if the point is on the left side of the segment.
 */
export function relativeCcw(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  x2 -= x1;
  y2 -= y1;
  px -= x1;
  py -= y1;
  let ccw = px * y2 - py * x2;

  if (ccw == 0.0) {
    ccw = px * x2 + py * y2;

    if (ccw > 0.0) {
      px -= x2;
      py -= y2;
      ccw = px * x2 + py * y2;

      if (ccw < 0.0) {
        ccw = 0.0;
      }
    }
  }

  return ccw < 0.0 ? -1 : (ccw > 0.0 ? 1 : 0);
}
