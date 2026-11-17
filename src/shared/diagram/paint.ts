/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/view/mxCellRenderer.js (createShape, getShapeConstructor,
 * configureShape), mxgraph/src/shape/mxShape.js (redraw, checkBounds,
 * updateBoundsFromPoints, getSvgScreenOffset, augmentBoundingBox),
 * mxConnector/mxArrowConnector augmentBoundingBox, and
 * Graph.getAllConnectionConstraints from js/grapheditor/Graph.js.
 * Modified for DeckWerk: the entry points paint one cell into an
 * SvgCanvas (or an SVG string) from its resolved style and geometry.
 */

import { SvgCanvas } from './canvas.js';
import { isKnownMarker, markerNames } from './markers.js';
import { Connector, EDGE_SHAPES, ImageShape, RectangleShape, WedgeCalloutShape } from './shapes/index.js';
import {
  getShapeClass, registeredShapeNames, type ConnectionConstraint, type Shape, type ShapeClass,
} from './shapes/shape.js';
import { ARROW_SIZE, ARROW_WIDTH, DEFAULT_MARKERSIZE, getNumber, getString, getValue, isOne, looseEq, mod, toNumber } from './shapes/util.js';
import type { Point, Rect, Style } from './types.js';

export type { ConnectionConstraint } from './shapes/shape.js';

export interface PaintOptions {
  /** skip the style's `rotation` (DeckWerk rotates the element box itself) */
  ignoreRotation?: boolean;
  /** Style of the parent cell, for the colours `inherit`, `parentFillColor` and `parentStrokeColor`. */
  parentStyle?: Style | null;
  /**
   * Shift by half a pixel when the stroke width is odd, as draw.io's view
   * does for crisp lines at scale 1 (mxShape.updateSvgScreenOffset).
   */
  screenOffset?: boolean;
}

/** Every registered shape name. */
export const SHAPE_NAMES: readonly string[] = Object.freeze(registeredShapeNames());

/** Every marker name for startArrow / endArrow. */
export const MARKER_NAMES: readonly string[] = Object.freeze(markerNames());

/** True if the shape name has a painter here (stencils `mxgraph.*` do not, yet). */
export function isKnownShape(name: string): boolean {
  return getShapeClass(name) != null;
}

export { isKnownMarker };

/** mxCellRenderer.createShape/getShapeConstructor: unknown names paint as rectangle or connector. */
function shapeClassFor(style: Style, kind: 'vertex' | 'edge'): ShapeClass {
  return getShapeClass(style.shape) ?? (kind === 'edge' ? Connector : RectangleShape);
}

function createShape(style: Style, kind: 'vertex' | 'edge', parentStyle?: Style | null): Shape {
  const Ctor = shapeClassFor(style, kind);
  const shape = new Ctor();
  shape.configure(style, { parentStyle });
  return shape;
}

/**
 * mxShape.getSvgScreenOffset: 0.5 when the stroke width rounds to an odd
 * number of pixels (draw.io translates the shape by it), 0 otherwise.
 */
export function svgScreenOffset(style: Style, scale = 1): number {
  const shape = createShape(style, 'vertex');
  if (shape instanceof ImageShape) return 0;
  return mod(Math.max(1, Math.round(shape.strokewidth * scale)), 2) === 1 ? 0.5 : 0;
}

/**
 * Paints the shape into a fresh canvas state, as draw.io paints every shape
 * into a canvas of its own; the caller's translate, scale and transform are kept.
 */
function paintShapeInto(c: SvgCanvas, shape: Shape, screenOffset: boolean): void {
  c.save();
  const outer = c.state;
  const state = SvgCanvas.createState();
  state.dx = outer.dx;
  state.dy = outer.dy;
  state.scale = outer.scale;
  state.transform = outer.transform;
  state.rotation = outer.rotation;
  state.rotationCx = outer.rotationCx;
  state.rotationCy = outer.rotationCy;
  c.state = state;
  const offset = screenOffset && !(shape instanceof ImageShape)
    ? (mod(Math.max(1, Math.round(shape.strokewidth * state.scale)), 2) === 1 ? 0.5 : 0) : 0;
  if (offset !== 0) c.beginGroup(`transform="translate(${offset},${offset})"`);
  shape.paint(c);
  if (offset !== 0) c.endGroup();
  c.restore();
}

/** mxShape.checkBounds. */
function validBounds(b: Rect): boolean {
  return Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)
    && b.width > 0 && b.height > 0;
}

/** Paints a vertex with the given resolved style in the given bounds. */
export function paintVertex(c: SvgCanvas, style: Style, bounds: Rect, options: PaintOptions = {}): void {
  if (!validBounds(bounds)) return;
  const shape = createShape(style, 'vertex', options.parentStyle);
  if (options.ignoreRotation) shape.rotation = 0;
  shape.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  paintShapeInto(c, shape, options.screenOffset === true);
}

/** mxShape.updateBoundsFromPoints. */
function boundsFromPoints(points: Point[]): Rect {
  let x0 = points[0].x;
  let y0 = points[0].y;
  let x1 = x0 + 1;
  let y1 = y0 + 1;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + 1);
    y1 = Math.max(y1, p.y + 1);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** points: absolute route incl. both terminal points (as mxCellState.absolutePoints) */
export function paintEdge(c: SvgCanvas, style: Style, points: Point[], options: Omit<PaintOptions, 'ignoreRotation'> = {}): void {
  if (points.length < 2 || points.some((p) => p == null || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
  const shape = createShape(style, 'edge', options.parentStyle);
  shape.points = points.map((p) => ({ x: p.x, y: p.y }));
  shape.bounds = boundsFromPoints(points);
  paintShapeInto(c, shape, options.screenOffset === true);
}

/** `<defs>` plus the painted markup of a vertex. */
export function vertexSvg(style: Style, bounds: Rect, options: PaintOptions & { idPrefix?: string } = {}): string {
  const c = new SvgCanvas({ idPrefix: options.idPrefix });
  paintVertex(c, style, bounds, options);
  return c.markup();
}

/** `<defs>` plus the painted markup of an edge. */
export function edgeSvg(style: Style, points: Point[], options: Omit<PaintOptions, 'ignoreRotation'> & { idPrefix?: string } = {}): string {
  const c = new SvgCanvas({ idPrefix: options.idPrefix });
  paintEdge(c, style, points, options);
  return c.markup();
}

/**
 * Default connection points of a shape (the blue x's), from the `points`
 * style key or the shape's constraints; null = none defined. `size` is the
 * shape's width and height (before rotation), for shapes whose points depend
 * on it (note, card, cube, folder, …); 100 × 100 if omitted.
 */
export function shapeConstraints(style: Style, size?: { width: number; height: number }): ConnectionConstraint[] | null {
  const points = getValue(style, 'points', null);
  if (points != null) {
    // Requires an array of arrays with x, y (0..1), an optional
    // [perimeter (0 or 1), dx, and dy] eg. points=[[0,0,1,-10,10],[0,1,0],[1,1]]
    const result: ConnectionConstraint[] = [];
    try {
      const parsed: unknown = JSON.parse(String(points));
      if (Array.isArray(parsed)) {
        for (const tmp of parsed as unknown[][]) {
          result.push({
            x: Number(tmp[0]),
            y: Number(tmp[1]),
            perimeter: tmp.length > 2 ? !looseEq(tmp[2], '0') : true,
            dx: tmp.length > 3 ? Number(tmp[3]) || 0 : 0,
            dy: tmp.length > 4 ? Number(tmp[4]) || 0 : 0,
          });
        }
      }
    } catch {
      // ignore
    }
    return result;
  }

  const shape = createShape(style, 'vertex');
  let w = size?.width ?? 100;
  let h = size?.height ?? 100;
  if (shape.direction === 'north' || shape.direction === 'south') {
    const tmp = w;
    w = h;
    h = tmp;
  }
  const computed = shape.getConstraints(style, w, h);
  if (computed != null) return computed;
  return shape.constraints != null ? shape.constraints.map((cc) => ({ ...cc })) : null;
}

/** Shadow extent outside the bounds (mxShape.augmentShadowBoundingBox). */
function shadowMargin(shape: Shape): number {
  if (!shape.isShadowEnabled()) return 0;
  const ss = shape.getShadowStyle();
  return Math.max(Math.abs(ss.dx), Math.abs(ss.dy)) + Math.max(ss.blur, 0) * 2;
}

/** Stroke extent outside the outline, allowing for miter joins up to the miter limit. */
function strokeMargin(shape: Shape, style: Style): number {
  if (shape.stroke == null) return 0;
  const sw = shape.strokewidth;
  const join = getString(style, 'linejoin', 'miter');
  if (join === 'round' || join === 'bevel') return sw / 2;
  const miter = Math.max(1, toNumber(getValue(style, 'miterlimit', 10)) || 10);
  return sw / 2 * miter;
}

/**
 * Extra space a vertex paints outside its bounds (stroke, shadow, glass,
 * multiple=1 copies, the tail of a wedge callout), so callers can size an
 * SVG viewport. Pass the bounds for shapes whose overhang depends on them.
 */
export function vertexPaintMargin(style: Style, bounds?: { width: number; height: number }): number {
  const shape = createShape(style, 'vertex');
  let margin = Math.max(strokeMargin(shape, style), shape.glass ? Math.ceil(shape.strokewidth / 2) : 0);
  margin += shadowMargin(shape);

  const copies = shape.getMultipleCopies();
  if (copies != null) margin += copies.count * Math.max(Math.abs(copies.dx), Math.abs(copies.dy));

  if (shape instanceof WedgeCalloutShape && bounds != null) {
    let w = bounds.width;
    let h = bounds.height;
    if (shape.isPaintBoundsInverted()) {
      const tmp = w;
      w = h;
      h = tmp;
    }
    const tail = shape.getTailPoints(w, h);
    if (tail != null) {
      const tip = tail.points[1];
      const out = Math.max(-tip.x, tip.x - w, -tip.y, tip.y - h, 0);
      margin += out;
    }
  }
  return margin;
}

/**
 * Extra space an edge paints beyond its route (mxConnector and
 * mxArrowConnector.augmentBoundingBox): half the stroke, markers, the width
 * of arrow bands and the shadow.
 */
export function edgePaintMargin(style: Style): number {
  const shape = createShape(style, 'edge');
  let margin = shape.stroke != null ? shape.strokewidth / 2 : 0;
  const name = style.shape;
  if (name === 'flexArrow' || name === 'link' || name === 'arrowConnector' || name === 'arrow') {
    const edgeWidth = name === 'arrow' ? ARROW_WIDTH
      : (name === 'arrowConnector' ? ARROW_WIDTH / 3
        : getNumber(style, 'width', name === 'link' ? 4 : 10) + Math.max(0, shape.strokewidth - 1));
    let w = edgeWidth;
    if (name === 'flexArrow') {
      if (getString(style, 'startArrow', 'none') !== 'none') w = Math.max(w, edgeWidth + getNumber(style, 'startWidth', 20));
      if (getString(style, 'endArrow', 'none') !== 'none') w = Math.max(w, edgeWidth + getNumber(style, 'endWidth', 20));
    } else if (name === 'arrowConnector' || name === 'arrow') {
      w = Math.max(w, name === 'arrow' ? ARROW_SIZE : ARROW_WIDTH);
    }
    margin += w / 2 + shape.strokewidth;
  } else {
    let size = 0;
    if (getString(style, 'startArrow', 'none') !== 'none') size = getNumber(style, 'startSize', DEFAULT_MARKERSIZE) + 1;
    if (getString(style, 'endArrow', 'none') !== 'none') {
      size = Math.max(size, getNumber(style, 'endSize', DEFAULT_MARKERSIZE)) + 1;
    }
    margin += size + shape.strokewidth;
    if (name === 'taperedArrow') {
      margin += Math.max(getNumber(style, 'startWidth', 12), getNumber(style, 'endWidth', 2));
    } else if (name === 'pipe') {
      margin += Math.max(0, getNumber(style, 'width', 4)) / 2 + shape.strokewidth;
    }
  }
  return margin + shadowMargin(shape);
}

/** True if the style paints along an edge route (connector, flexArrow, link, …). */
export function isEdgeShape(name: string | null | undefined): boolean {
  return name != null && EDGE_SHAPES.includes(name);
}

/** Whether the style has a drop shadow (shadow=1). */
export function hasShadow(style: Style): boolean {
  return isOne(style, 'shadow', 0);
}

/**
 * A canvas that records the first subpath a shape paints, in raw model
 * coordinates (no rounding), as Graph.getRoundedPolygonOutline's canvas does.
 */
class OutlineRecorder extends SvgCanvas {
  ops: Array<string | number> = [];

  private put(op: string, coords: number[]): void {
    const s = this.state;
    this.ops.push(op);
    for (let i = 0; i + 1 < coords.length; i += 2) {
      this.lastX = coords[i];
      this.lastY = coords[i + 1];
      this.ops.push((coords[i] + s.dx) * s.scale, (coords[i + 1] + s.dy) * s.scale);
    }
  }

  override begin(): void {
    this.lastX = 0;
    this.lastY = 0;
  }

  override moveTo(x: number, y: number): void { this.put('M', [x, y]); }
  override lineTo(x: number, y: number): void { this.put('L', [x, y]); }
  override quadTo(x1: number, y1: number, x2: number, y2: number): void { this.put('Q', [x1, y1, x2, y2]); }
  override curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.put('C', [x1, y1, x2, y2, x3, y3]);
  }
  override close(): void { this.ops.push('Z'); }
  override fill(): void { /* records only */ }
  override stroke(): void { /* records only */ }
  override fillAndStroke(): void { /* records only */ }
}

/**
 * Graph.getRoundedPolygonOutline: the outline of a vertex as painted, curves
 * flattened into eight segments each, as a closed list of points in
 * `bounds` (the perimeter bounds, spacing included), turned for the shape's
 * direction. `size` is the vertex's own size in draw.io units. Null when the
 * shape paints no path. Used for cloudPerimeter and rounded polygon
 * perimeters, so connectors end on the bumps and rounded corners.
 */
export function vertexOutline(style: Style, size: { width: number; height: number }, bounds: Rect): Point[] | null {
  const shape = createShape(style, 'vertex');
  const inverted = shape.isPaintBoundsInverted();
  const w = inverted ? size.height : size.width;
  const h = inverted ? size.width : size.height;
  if (!(w > 0) || !(h > 0)) return null;
  const c = new OutlineRecorder();
  try {
    shape.paintVertexShape(c, 0, 0, w, h);
  } catch {
    return null;
  }
  const path = c.ops;
  if (path.length === 0) return null;
  const pw = inverted ? bounds.height : bounds.width;
  const ph = inverted ? bounds.width : bounds.height;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  let rot = 0;
  if (shape.direction === 'north') rot = 270;
  else if (shape.direction === 'west') rot = 180;
  else if (shape.direction === 'south') rot = 90;
  const cos = Math.cos(rot * Math.PI / 180);
  const sin = Math.sin(rot * Math.PI / 180);
  const pts: Point[] = [];
  let last: Point = { x: 0, y: 0 };
  const add = (x: number, y: number) => {
    last = { x, y };
    // mxUtils.getRotatedPoint about the centre.
    const px = cx + (x / w - 0.5) * pw - cx;
    const py = cy + (y / h - 0.5) * ph - cy;
    pts.push({ x: px * cos - py * sin + cx, y: py * cos + px * sin + cy });
  };
  for (let i = 0; i < path.length; i++) {
    const op = path[i];
    if (op === 'M') {
      if (pts.length > 0) break;
      add(path[i + 1] as number, path[i + 2] as number);
      i += 2;
    } else if (op === 'L') {
      add(path[i + 1] as number, path[i + 2] as number);
      i += 2;
    } else if (op === 'Q' || op === 'C') {
      const x0 = last.x;
      const y0 = last.y;
      const n = op === 'Q' ? 4 : 6;
      const x1 = path[i + 1] as number;
      const y1 = path[i + 2] as number;
      const x2 = path[i + 3] as number;
      const y2 = path[i + 4] as number;
      const x3 = op === 'C' ? path[i + 5] as number : x2;
      const y3 = op === 'C' ? path[i + 6] as number : y2;
      for (let j = 1; j <= 8; j++) {
        const t = j / 8;
        const u = 1 - t;
        if (op === 'Q') add(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
        else {
          add(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
        }
      }
      i += n;
    } else if (op === 'Z') {
      break;
    }
  }
  if (pts.length > 2) {
    pts.push(pts[0]);
    return pts;
  }
  return null;
}
