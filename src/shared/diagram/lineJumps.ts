/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * the line jumps of js/grapheditor/Graph.js (mxGraphView.updateLineJumps,
 * updateCurveLineJumps, getLineJumpSegments, isLineJumpEdge,
 * getLineJumpCurve, validateCellState's list of processed edges,
 * Graph.lineJumpsEnabled, Graph.maxLineJumpTests) and mxUtils.ptSegDistSq,
 * ptLineDist and intersects.
 * Modified for DeckWerk: a function over the connectors of a diagram in
 * paint order instead of the view's validation; the bucket index of the
 * processed edges (an optimisation with the same result) is left out; the
 * view is at scale 1, so routed points are in draw.io units.
 */

import { getCurvePoints } from './shapes/edges.js';
import { getValue, intersection, looseEq, styleValue } from './shapes/util.js';
import type { Point, Style } from './types.js';

/** A point of a routed edge (Graph.js routedPoints): type 0 is a waypoint or an end, 1 a jump. */
export interface RoutedPoint {
  x: number;
  y: number;
  type: 0 | 1;
  /** The curve segment of a jump on a curve (curveGeometry=1). */
  segment?: number;
}

/** A connector as the line jumps see it: its resolved style and its route, in draw.io units. */
export interface JumpEdge {
  id: string;
  style: Style;
  /** The absolute route, both ends included (mxCellState.absolutePoints). */
  points: readonly Point[] | null;
  /** The layer the edge is in, for jumpLayers=0 (edges then jump only edges of their own layer). */
  layer?: string | null;
}

/** Graph.maxLineJumpTests: edges with jumps after this much work are painted without jumps. */
const MAX_LINE_JUMP_TESTS = 150000000;

/** Graph.curvePointSteps. */
const CURVE_POINT_STEPS = 16;

interface Bounds { x0: number; x1: number; y0: number; y1: number }

interface Segment { p2: Point; p3: Point; pn: Point | undefined; pl: Point | null; bounds: Bounds }

interface EdgeState {
  edge: JumpEdge;
  pts: readonly Point[] | null;
  /** mxCellState bounds of the edge (mxGraphView.updateEdgeBounds). */
  rect: { x: number; y: number; width: number; height: number } | null;
  lineJumpCurve: Point[] | null;
  segments: Map<boolean, { segments: Segment[]; bounds: Bounds | null }>;
}

/** mxUtils.ptSegDistSq. */
function ptSegDistSq(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
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
    projlenSq = dotprod <= 0.0 ? 0.0 : dotprod * dotprod / (x2 * x2 + y2 * y2);
  }
  let lenSq = px * px + py * py - projlenSq;
  if (lenSq < 0) lenSq = 0;
  return lenSq;
}

/** mxUtils.ptLineDist. */
function ptLineDist(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  return Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1)
    / Math.sqrt((y2 - y1) * (y2 - y1) + (x2 - x1) * (x2 - x1));
}

/** mxUtils.intersects of two cell state bounds (no intersection if either has no size). */
function intersects(a: EdgeState['rect'], b: EdgeState['rect']): boolean {
  if (a == null || b == null) return false;
  let tw = a.width;
  let th = a.height;
  let rw = b.width;
  let rh = b.height;
  if (rw <= 0 || rh <= 0 || tw <= 0 || th <= 0) return false;
  const tx = a.x;
  const ty = a.y;
  const rx = b.x;
  const ry = b.y;
  rw += rx;
  rh += ry;
  tw += tx;
  th += ty;
  return ((rw < rx || rw > tx) && (rh < ry || rh > ty) && (tw < tx || tw > rx) && (th < ty || th > ry));
}

/** mxGraphView.updateEdgeBounds: the bounds of the points, at least 1 × 1 (the view scale). */
function edgeBounds(pts: readonly Point[] | null): EdgeState['rect'] {
  if (pts == null || pts.length === 0 || pts[0] == null) return null;
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = minX;
  let maxY = minY;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p == null) continue;
    minX = Math.min(p.x, minX);
    minY = Math.min(p.y, minY);
    maxX = Math.max(p.x, maxX);
    maxY = Math.max(p.y, maxY);
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/**
 * Returns the bounds of the segment between the given points with a
 * margin for the tolerance of mxUtils.intersection, so that segments
 * whose bounds do not overlap do not intersect.
 */
function getLineJumpBounds(p0: Point, p1: Point): Bounds {
  const m = 1e-5 * (Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)) + 1;
  return {
    x0: Math.min(p0.x, p1.x) - m, x1: Math.max(p0.x, p1.x) + m,
    y0: Math.min(p0.y, p1.y) - m, y1: Math.max(p0.y, p1.y) + m,
  };
}

/** True if the bounds are apart (false if they overlap or a coordinate is NaN). */
function isLineJumpApart(a: Bounds, b: Bounds): boolean {
  return a.x0 > b.x1 || a.x1 < b.x0 || a.y0 > b.y1 || a.y1 < b.y0;
}

function jumpStyle(style: Style): string {
  return String(getValue(style, 'jumpStyle', 'none'));
}

/** Graph.edgeSupportsCurved. */
function edgeSupportsCurved(style: Style): boolean {
  const shape = style.shape ?? null;
  return shape == null || shape === 'connector' || shape === 'filledEdge' || shape === 'wire' || shape === 'pipe'
    || shape === 'link' || shape === 'flexArrow' || shape === 'taperedArrow';
}

/** mxGraphView.isLineJumpEdge: edges that are not curves, or curves whose jumps follow the curve. */
export function isLineJumpEdge(style: Style): boolean {
  return !looseEq(styleValue(style, 'curved'), 1) || looseEq(getValue(style, 'curveGeometry', '0'), '1');
}

/** Graph.getEdgeCurvePoints when the jumps follow the curve (mxGraphView.getLineJumpCurve). */
function getLineJumpCurve(style: Style, pts: readonly Point[] | null): Point[] | null {
  if (!looseEq(getValue(style, 'curveGeometry', '0'), '1')) return null;
  return (pts != null && pts.length > 2 && pts.indexOf(null as unknown as Point) < 0
    && (looseEq(styleValue(style, 'curved'), 1) || looseEq(styleValue(style, 'bezier'), 1)) && edgeSupportsCurved(style))
    ? getCurvePoints(pts.slice(), looseEq(styleValue(style, 'bezier'), 1)) : null;
}

/**
 * Computes draw.io's line jumps for the connectors of one diagram, given in
 * the order draw.io validates them (paint order: back to front). Each
 * connector with a jumpStyle other than none jumps over the connectors
 * before it that it crosses. Returns the routed points (the route with the
 * jumps between its points) by edge id, for the edges that have jumps
 * enabled; pass them to paintEdge / connectorMarkup as `routedPoints`.
 */
export function computeLineJumps(edges: readonly JumpEdge[]): Map<string, RoutedPoint[]> {
  const result = new Map<string, RoutedPoint[]>();
  const validEdges: EdgeState[] = [];
  const counter = { tests: 0 };

  for (const edge of edges) {
    const style = edge.style;
    const pts = edge.points != null && edge.points.length > 0 ? edge.points : null;
    const state: EdgeState = { edge, pts, rect: edgeBounds(pts), lineJumpCurve: null, segments: new Map() };
    if (!isLineJumpEdge(style)) continue;

    if (pts != null && jumpStyle(style) !== 'none') {
      const curve = getLineJumpCurve(style, pts);
      const routed = curve != null
        ? updateCurveLineJumps(state, curve, validEdges, counter)
        : updateLineJumps(state, validEdges, counter);
      if (routed != null) result.set(edge.id, routed);
    }

    // Adds to the list of edges that may intersect with later edges
    state.lineJumpCurve = getLineJumpCurve(style, pts);
    validEdges.push(state);
  }
  return result;
}

/**
 * mxGraphView.getLineJumpSegments: the segments of a processed edge that
 * later edges are tested against, with the points around each segment.
 */
function getLineJumpSegments(state: EdgeState, merge: boolean): { segments: Segment[]; bounds: Bounds | null } {
  let cached = state.segments.get(merge);
  if (cached == null) {
    const curve = state.lineJumpCurve;
    const pts = curve != null ? curve : state.pts;
    const segments: Segment[] = [];
    let bounds: Bounds | null = null;
    let pl: Point | null = null;

    for (let j = 0; pts != null && j < pts.length - 1; j++) {
      let p3 = pts[j + 1];
      const p2 = pts[j];
      let pn: Point | undefined = pts[j + 2];

      // Ignores waypoints on straight segments
      while (merge && curve == null && j < pts.length - 2
        && ptSegDistSq(p2.x, p2.y, pn.x, pn.y, p3.x, p3.y) < 1) {
        p3 = pn;
        j++;
        pn = pts[j + 2];
      }

      const b = getLineJumpBounds(p2, p3);
      segments.push({ p2, p3, pn, pl, bounds: b });
      pl = p2;
      bounds = bounds == null ? { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }
        : { x0: Math.min(bounds.x0, b.x0), x1: Math.max(bounds.x1, b.x1), y0: Math.min(bounds.y0, b.y0), y1: Math.max(bounds.y1, b.y1) };
    }
    cached = { segments, bounds };
    state.segments.set(merge, cached);
  }
  return cached;
}

/** The processed edges near the given edge that it may jump (mxGraphView.getLineJumpEdges plus the filters). */
function nearEdges(state: EdgeState, validEdges: readonly EdgeState[], counter: { tests: number }): EdgeState[] {
  // Only jumps edges in the same layer if jumpLayers is 0
  const layer = looseEq(getValue(state.edge.style, 'jumpLayers', '1'), '0') ? (state.edge.layer ?? null) : null;
  const near: EdgeState[] = [];
  for (const state2 of validEdges) {
    const pts2 = state2.lineJumpCurve != null ? state2.lineJumpCurve : state2.pts;
    counter.tests++;
    if (pts2 != null && intersects(state.rect, state2.rect) && state2.edge.style.noJump !== '1'
      && (layer == null || (state2.edge.layer ?? null) === layer)) {
      near.push(state2);
    }
  }
  return near;
}

/** mxGraphView.updateLineJumps for a straight or polyline edge. */
function updateLineJumps(state: EdgeState, validEdges: readonly EdgeState[], counter: { tests: number }): RoutedPoint[] | null {
  const pts = state.pts;
  if (pts == null || counter.tests > MAX_LINE_JUMP_TESTS) return null;
  const thresh = 0.5;
  let actual: RoutedPoint[] | null = [];

  // Previous edges whose bounds intersect this edge
  const near = nearEdges(state, validEdges, counter);

  const addPoint = (type: 0 | 1, x: number, y: number) => {
    actual?.push({ x, y, type });
  };

  for (let i = 0; i < pts.length - 1 && actual != null; i++) {
    let p1 = pts[i + 1];
    const p0 = pts[i];
    const list: Array<{ distSq: number; x: number; y: number }> = [];

    // Ignores waypoints on straight segments
    let pn: Point | undefined = pts[i + 2];
    while (i < pts.length - 2 && ptSegDistSq(p0.x, p0.y, pn.x, pn.y, p1.x, p1.y) < 1) {
      p1 = pn;
      i++;
      pn = pts[i + 2];
    }

    addPoint(0, p0.x, p0.y);

    // Processes the previous edges near this edge
    const bounds = getLineJumpBounds(p0, p1);

    for (let e = 0; e < near.length && actual != null; e++) {
      const segs = getLineJumpSegments(near[e], true);
      counter.tests++;
      if (segs.bounds == null || isLineJumpApart(bounds, segs.bounds)) continue;
      const segments = segs.segments;
      counter.tests += segments.length;

      // Compares each segment of the edge with the current segment
      for (const seg of segments) {
        // Segments whose bounds are apart do not intersect
        if (isLineJumpApart(bounds, seg.bounds)) continue;
        const p2 = seg.p2;
        const p3 = seg.p3;
        const pl = seg.pl;
        const segPn = seg.pn;
        counter.tests += 4;
        const pt = intersection(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);

        // Handles intersection between two segments
        if (pt != null && (Math.abs(pt.x - p0.x) > thresh || Math.abs(pt.y - p0.y) > thresh)
          && (Math.abs(pt.x - p1.x) > thresh || Math.abs(pt.y - p1.y) > thresh)
          // Removes jumps on overlapping incoming segments
          && (pl == null || ptLineDist(p0.x, p0.y, p1.x, p1.y, pl.x, pl.y) > thresh
            || ptLineDist(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y) > thresh)
          // Removes jumps on overlapping outgoing segments
          && (segPn == null || ptLineDist(p0.x, p0.y, p1.x, p1.y, segPn.x, segPn.y) > thresh
            || ptLineDist(p0.x, p0.y, p1.x, p1.y, p3.x, p3.y) > thresh)) {
          const dx = pt.x - p0.x;
          const dy = pt.y - p0.y;
          const temp = { distSq: dx * dx + dy * dy, x: pt.x, y: pt.y };

          // Intersections must be ordered by distance from start of
          // segment, after the ones at the same distance
          let idx = 0;
          let hi = list.length;
          while (idx < hi) {
            const mid = (idx + hi) >> 1;
            if (list[mid].distSq > temp.distSq) hi = mid;
            else idx = mid + 1;
          }

          // Ignores multiple intersections at segment joints and
          // where overlapping edges cross the current segment
          if ((idx === 0 || Math.abs(list[idx - 1].x - temp.x) > thresh || Math.abs(list[idx - 1].y - temp.y) > thresh)
            && (idx === list.length || Math.abs(list[idx].x - temp.x) > thresh || Math.abs(list[idx].y - temp.y) > thresh)) {
            list.splice(idx, 0, temp);
          }
        }
      }

      // Paints the edge without jumps after too many tests
      if (counter.tests > MAX_LINE_JUMP_TESTS) actual = null;
    }

    // Adds ordered intersections to routed points
    for (let j = 0; j < list.length && actual != null; j++) {
      addPoint(1, list[j].x, list[j].y);
      counter.tests += 100;
    }
  }

  if (actual != null) {
    const pt = pts[pts.length - 1];
    addPoint(0, pt.x, pt.y);
  }
  return actual;
}

/**
 * mxGraphView.updateCurveLineJumps: the start and end of the painted curve
 * and the intersections with the processed edges in between, ordered along
 * the curve.
 */
function updateCurveLineJumps(state: EdgeState, curve: Point[], validEdges: readonly EdgeState[], counter: { tests: number }): RoutedPoint[] {
  const thresh = 0.5;
  let jumps: Array<{ pos: number; x: number; y: number }> = [];
  let edges: EdgeState[] | null = counter.tests <= MAX_LINE_JUMP_TESTS ? validEdges.slice() : null;
  const layer = looseEq(getValue(state.edge.style, 'jumpLayers', '1'), '0') ? (state.edge.layer ?? null) : null;
  const curveBounds: Bounds[] = [];

  for (let i = 0; edges != null && i < curve.length - 1; i++) curveBounds.push(getLineJumpBounds(curve[i], curve[i + 1]));

  for (let e = 0; edges != null && e < edges.length; e++) {
    const state2 = edges[e];
    const pts2 = state2.lineJumpCurve != null ? state2.lineJumpCurve : state2.pts;
    counter.tests++;
    if (pts2 != null && intersects(state.rect, state2.rect) && state2.edge.style.noJump !== '1'
      && (layer == null || (state2.edge.layer ?? null) === layer)) {
      const segments = getLineJumpSegments(state2, false);
      for (let i = 0; i < curve.length - 1 && segments.bounds != null; i++) {
        const p0 = curve[i];
        const p1 = curve[i + 1];
        const bounds = curveBounds[i];
        counter.tests++;
        if (isLineJumpApart(bounds, segments.bounds)) continue;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len2 = dx * dx + dy * dy;
        counter.tests += segments.segments.length;
        for (const seg of segments.segments) {
          // Segments whose bounds are apart do not intersect
          if (isLineJumpApart(bounds, seg.bounds)) continue;
          const p2 = seg.p2;
          const p3 = seg.p3;
          counter.tests += 4;
          const pt = intersection(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          if (pt != null) {
            jumps.push({ pos: i + (len2 > 0 ? ((pt.x - p0.x) * dx + (pt.y - p0.y) * dy) / len2 : 0), x: pt.x, y: pt.y });
          }
        }

        // Paints the curve without jumps after too many tests
        if (counter.tests > MAX_LINE_JUMP_TESTS) {
          jumps = [];
          edges = null;
          break;
        }
      }
    }
  }

  jumps.sort((a, b) => a.pos - b.pos);

  // Type 0 is the start or end of the curve, 1 is a jump
  const actual: RoutedPoint[] = [];
  const start = curve[0];
  const end = curve[curve.length - 1];
  const near = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) <= thresh && Math.abs(p.y - y) <= thresh;

  actual.push({ x: start.x, y: start.y, type: 0 });
  let last: { x: number; y: number } = start;

  for (const jump of jumps) {
    // Ignores intersections at the ends of the curve and at shared
    // points of the segments of the curve or of the other edges
    if (!near(last, jump.x, jump.y) && !near(end, jump.x, jump.y)) {
      // Curve segment of the intersection for painting
      actual.push({ x: jump.x, y: jump.y, type: 1, segment: Math.floor(jump.pos / CURVE_POINT_STEPS) });
      counter.tests += 100;
      last = jump;
    }
  }

  actual.push({ x: end.x, y: end.y, type: 0 });
  return actual;
}
