/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/shape/mxPolyline.js, mxConnector.js, mxArrow.js,
 * mxArrowConnector.js; the edge shapes of js/grapheditor/Shapes.js (link,
 * flexArrow, wire, filledEdge, pipe, taperedArrow); and the curved-edge
 * parts of js/grapheditor/Graph.js (Graph.getCurvePoints,
 * Graph.getCurveSegments, mxConnector.isCurveTrimmed/paintCutCurve, and
 * the line jumps of mxConnector.paintLine/paintCutCurve/getLineJumpSize).
 * Modified for DeckWerk: flow animation and the handles of the tapered
 * arrow are left out; the routed points with the jumps are given to the
 * shape (routedPoints) instead of read from the cell state; the painting
 * code is otherwise unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { RoutedPoint } from '../lineJumps.js';
import { createMarker as createMarkerPainter, type MarkerPainter } from '../markers.js';
import type { Point, Style } from '../types.js';
import { Shape, type ConnectionConstraint } from './shape.js';
import {
  ARROW_SIZE, ARROW_SPACING, ARROW_WIDTH, DEFAULT_MARKERSIZE, LINE_ARCSIZE, NONE, clonePoint, getNumber, getString,
  getValue, intersection, looseEq, relativeCcw, styleValue, toNumber,
} from './util.js';

/** Graph.defaultJumpSize. */
const DEFAULT_JUMP_SIZE = 6;

/** Graph.curvePointSteps. */
const CURVE_POINT_STEPS = 16;

/**
 * Graph.getCurvePoints: the painted curve of curved (quadratic through the
 * midpoints) or bezier (cubic control points if they fit 3n+1) points as a
 * fine polyline.
 */
export function getCurvePoints(pts: Point[], bezier: boolean): Point[] {
  const n = pts.length;
  if (n < 3) return pts;
  const steps = CURVE_POINT_STEPS;
  const result: Point[] = [pts[0]];

  const quad = (p0: Point, pc: Point, p1: Point) => {
    for (let t = 1; t <= steps; t++) {
      const u = t / steps;
      const iu = 1 - u;
      result.push({
        x: iu * iu * p0.x + 2 * iu * u * pc.x + u * u * p1.x,
        y: iu * iu * p0.y + 2 * iu * u * pc.y + u * u * p1.y,
      });
    }
  };

  if (bezier && (n - 1) % 3 === 0) {
    // Points are cubic control points: [anchor, cp1, cp2, anchor, ...]
    for (let i = 1; i + 2 < n; i += 3) {
      const p0 = pts[i - 1];
      const c1 = pts[i];
      const c2 = pts[i + 1];
      const p1 = pts[i + 2];
      for (let t = 1; t <= steps; t++) {
        const u = t / steps;
        const iu = 1 - u;
        result.push({
          x: iu * iu * iu * p0.x + 3 * iu * iu * u * c1.x + 3 * iu * u * u * c2.x + u * u * u * p1.x,
          y: iu * iu * iu * p0.y + 3 * iu * iu * u * c1.y + 3 * iu * u * u * c2.y + u * u * u * p1.y,
        });
      }
    }
  } else {
    // Quadratic through the midpoints of consecutive control points
    let prev = pts[0];
    for (let i = 1; i < n - 2; i++) {
      const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      quad(prev, pts[i], mid);
      prev = mid;
    }
    quad(prev, pts[n - 2], pts[n - 1]);
  }
  return result;
}

/** Graph.getCurveSegments: the quadratic or cubic segments of the painted curve. */
export function getCurveSegments(pts: Point[], bezier: boolean): Point[][] {
  const segs: Point[][] = [];
  const n = pts.length;
  if (bezier && (n - 1) % 3 === 0) {
    for (let i = 1; i + 2 < n; i += 3) segs.push([pts[i - 1], pts[i], pts[i + 1], pts[i + 2]]);
  } else {
    let prev = pts[0];
    for (let i = 1; i < n - 2; i++) {
      const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      segs.push([prev, pts[i], mid]);
      prev = mid;
    }
    segs.push([prev, pts[n - 2], pts[n - 1]]);
  }
  return segs;
}

// --- mxPolyline ----------------------------------------------------------------------

export class Polyline extends Shape {
  override getRotation(): number { return 0; }
  override getShapeRotation(): number { return 0; }
  override isPaintBoundsInverted(): boolean { return false; }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    if (this.hasStyle && looseEq(styleValue(this.style, 'bezier'), 1)) this.paintBezierLine(c, pts);
    else if (this.hasStyle && looseEq(styleValue(this.style, 'curved'), 1)) this.paintCurvedLine(c, pts);
    else this.paintLine(c, pts, this.isRounded);
  }

  paintLine(c: SvgCanvas, pts: Point[], rounded: boolean): void {
    const arcSize = this.lineArcSize();
    c.begin();
    this.addPoints(c, pts, rounded, arcSize, false);
    c.stroke();
  }

  paintCurvedLine(c: SvgCanvas, pts: Point[]): void {
    c.begin();
    const pt = pts[0];
    const n = pts.length;
    c.moveTo(pt.x, pt.y);
    for (let i = 1; i < n - 2; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const ix = (p0.x + p1.x) / 2;
      const iy = (p0.y + p1.y) / 2;
      c.quadTo(p0.x, p0.y, ix, iy);
    }
    const p0 = pts[n - 2];
    const p1 = pts[n - 1];
    c.quadTo(p0.x, p0.y, p1.x, p1.y);
    c.stroke();
  }

  paintBezierLine(c: SvgCanvas, pts: Point[]): void {
    const n = pts.length;
    if (n < 2) return;
    c.begin();
    c.moveTo(pts[0].x, pts[0].y);

    // Handle simple 2-point case (straight line)
    if (n === 2) {
      c.lineTo(pts[1].x, pts[1].y);
      c.stroke();
      return;
    }

    if ((n - 1) % 3 === 0) {
      // If points fit 3n+1 pattern, use them directly as cubic bezier control points
      for (let i = 1; i + 2 < n; i += 3) {
        c.curveTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, pts[i + 2].x, pts[i + 2].y);
      }
    } else {
      // Points are through-points (e.g. from edge style routing),
      // use curved line interpolation
      for (let i = 1; i < n - 2; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        c.quadTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      c.quadTo(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x, pts[n - 1].y);
    }
    c.stroke();
  }
}

// --- mxConnector ----------------------------------------------------------------------

export class Connector extends Polyline {
  /** The ends of a trimmed curve before the markers moved them (Graph.js). */
  curveEnds: Point[] | null = null;

  /**
   * The route with its line jumps (mxCellState.routedPoints, see
   * ../lineJumps.ts) in the coordinates of the painted points, or null
   * when the edge has none to paint.
   */
  routedPoints: RoutedPoint[] | null = null;

  /** mxConnector.isLineJumpsPainted: jumps are painted when routed points were given. */
  isLineJumpsPainted(): boolean {
    return this.routedPoints != null && !this.outline;
  }

  /** Graph.js mxConnector.getLineJumpSize: the distance of the ends of a jump from the intersection. */
  getLineJumpSize(): number {
    return (parseInt(String(getValue(this.style, 'jumpSize', DEFAULT_JUMP_SIZE)), 10) - 2) / 2 + this.strokewidth;
  }

  /** Graph.js mxConnector.paintLine: the line with the jumps of its routed points. */
  override paintLine(c: SvgCanvas, absPts: Point[], rounded: boolean): void {
    const rpts = this.routedPoints;
    if (!this.isLineJumpsPainted() || !this.hasStyle || rpts == null || rpts.length === 0) {
      super.paintLine(c, absPts, rounded);
      return;
    }
    const arcSize = toNumber(getValue(this.style, 'arcSize', LINE_ARCSIZE)) / 2;
    const size = this.getLineJumpSize();
    const style = String(getValue(this.style, 'jumpStyle', 'none'));
    let moveTo = true;
    let last: Point | null = null;
    let len: number | null = null;
    let pts: Point[] = [];
    let n: Point | null = null;
    c.begin();

    for (let i = 0; i < rpts.length; i++) {
      const rpt = rpts[i];
      let pt: Point = { x: rpt.x, y: rpt.y };

      // Takes first and last point from passed-in array
      if (i === 0) pt = absPts[0];
      else if (i === rpts.length - 1) pt = absPts[absPts.length - 1];

      let done = false;

      // Type 1 is an intersection
      if (last != null && rpt.type === 1) {
        // Checks if next/previous points are too close
        const next = rpts[i + 1];
        let dx = next.x - pt.x;
        let dy = next.y - pt.y;
        let dist = dx * dx + dy * dy;

        if (n == null) {
          n = { x: pt.x - last.x, y: pt.y - last.y };
          len = Math.sqrt(n.x * n.x + n.y * n.y);
          if (len > 0) {
            n.x = n.x * size / len;
            n.y = n.y * size / len;
          } else {
            n = null;
          }
        }

        if (dist > size * size && len != null && len > 0 && n != null) {
          dx = last.x - pt.x;
          dy = last.y - pt.y;
          dist = dx * dx + dy * dy;

          if (dist > size * size) {
            const p0 = { x: pt.x - n.x, y: pt.y - n.y };
            const p1 = { x: pt.x + n.x, y: pt.y + n.y };
            pts.push(p0);
            this.addPoints(c, pts, rounded, arcSize, false, null, moveTo);
            let f = (Math.round(n.x) < 0 || (Math.round(n.x) === 0 && Math.round(n.y) <= 0)) ? 1 : -1;
            moveTo = false;

            if (style === 'sharp') {
              c.lineTo(p0.x - n.y * f, p0.y + n.x * f);
              c.lineTo(p1.x - n.y * f, p1.y + n.x * f);
              c.lineTo(p1.x, p1.y);
            } else if (style === 'line') {
              c.moveTo(p0.x + n.y * f, p0.y - n.x * f);
              c.lineTo(p0.x - n.y * f, p0.y + n.x * f);
              c.moveTo(p1.x - n.y * f, p1.y + n.x * f);
              c.lineTo(p1.x + n.y * f, p1.y - n.x * f);
              c.moveTo(p1.x, p1.y);
            } else if (style === 'arc') {
              f *= 1.3;
              c.curveTo(p0.x - n.y * f, p0.y + n.x * f, p1.x - n.y * f, p1.y + n.x * f, p1.x, p1.y);
            } else {
              c.moveTo(p1.x, p1.y);
              moveTo = true;
            }

            pts = [p1];
            done = true;
          }
        }
      } else {
        n = null;
      }

      if (!done) {
        pts.push(pt);
        last = pt;
      }
    }

    this.addPoints(c, pts, rounded, arcSize, false, null, moveTo);
    c.stroke();
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // The indirection via functions for markers is needed in
    // order to apply the offsets before painting the line and
    // paint the markers after painting the line.
    const sourceMarker = this.createMarker(c, pts, true);
    const targetMarker = this.createMarker(c, pts, false);

    super.paintEdgeShape(c, pts);

    // Disables shadows, dashed styles and fixes fill and stroke color for markers
    c.setShadow(false);
    c.setDashed(false);
    let startStroke: string | null = null;

    if (sourceMarker != null) {
      c.setFillColor(getString(this.style, 'startFillColor', this.stroke));
      startStroke = getString(this.style, 'startStrokeColor', null);
      if (startStroke != null) c.setStrokeColor(startStroke);
      sourceMarker();
    }

    if (targetMarker != null) {
      c.setFillColor(getString(this.style, 'endFillColor', this.stroke));
      const endStroke = getString(this.style, 'endStrokeColor', null);
      if (endStroke != null) c.setStrokeColor(endStroke);
      else if (startStroke != null) c.setStrokeColor(this.stroke);
      targetMarker();
    }
  }

  /** mxConnector.createMarker, storing the ends of trimmed curves first (Graph.js). */
  createMarker(c: SvgCanvas, pts: Point[], source: boolean): MarkerPainter | null {
    if (this.isCurveTrimmed(pts)) {
      if (this.curveEnds == null) this.curveEnds = [];
      this.curveEnds[source ? 0 : 1] = clonePoint(pts[source ? 0 : pts.length - 1]);
    }

    let result: MarkerPainter | null = null;
    const n = pts.length;
    const type = getString(this.style, source ? 'startArrow' : 'endArrow', null);
    const p0 = source ? pts[1] : pts[n - 2];
    const pe = source ? pts[0] : pts[n - 1];

    if (type != null && p0 != null && pe != null) {
      // Computes the norm and the inverse norm
      const dx = pe.x - p0.x;
      const dy = pe.y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / dist;
      const unitY = dy / dist;
      const size = getNumber(this.style, source ? 'startSize' : 'endSize', DEFAULT_MARKERSIZE);

      // Allow for stroke width in the end point used and the
      // orthogonal vectors describing the direction of the marker
      const filled = !looseEq(styleValue(this.style, source ? 'startFill' : 'endFill'), 0);
      result = createMarkerPainter(c, this, type, pe, unitX, unitY, size, source, this.strokewidth, filled);
    }
    return result;
  }

  /**
   * Graph.js: true if a curve is cut where the markers start (trimCurve=1);
   * other curves end where the markers move their ends.
   */
  isCurveTrimmed(pts: Point[]): boolean {
    return pts.length > 2 && looseEq(getValue(this.style, 'trimCurve', '0'), '1')
      && (looseEq(getValue(this.style, 'curved', '0'), '1') || looseEq(getValue(this.style, 'bezier', '0'), '1'));
  }

  override paintCurvedLine(c: SvgCanvas, pts: Point[]): void {
    if (!this.paintCutCurve(c, pts, false)) super.paintCurvedLine(c, pts);
  }

  override paintBezierLine(c: SvgCanvas, pts: Point[]): void {
    if (!this.paintCutCurve(c, pts, true)) super.paintBezierLine(c, pts);
  }

  /**
   * Graph.js mxConnector.paintCutCurve: the curve with its original ends
   * cut where the markers start if it is trimmed, and with the jumps of its
   * routed points (curveGeometry=1), each cutting the curve before and after
   * the intersection. False if the curve is not trimmed and has no jumps.
   */
  paintCutCurve(c: SvgCanvas, pts: Point[], bezier: boolean): boolean {
    const rpts = this.routedPoints;
    const style = String(getValue(this.style, 'jumpStyle', 'none'));
    const trimmed = this.isCurveTrimmed(pts);
    let hasJumps = false;
    for (let i = 0; rpts != null && i < rpts.length && !hasJumps; i++) hasJumps = rpts[i].type === 1;
    hasJumps = hasJumps && style !== 'none' && this.isLineJumpsPainted();

    if ((!hasJumps && !trimmed) || pts.length < 2) return false;
    if (pts.length < 3) {
      // Painted as a straight line with the jumps of a straight line
      this.paintLine(c, pts, false);
      return true;
    }

    let segs = getCurveSegments(pts, bezier);
    const n = pts.length;

    // Points of the polar form (blossom) of a segment, where t0 = t1 =
    // t2 = t is the point on the curve at t and the blossoms of t0 and t1
    // are the control points of the part of the segment from t0 to t1
    const blossom = (seg: Point[], t: number[]): Point => {
      let w: number[];
      if (seg.length === 3) {
        w = [(1 - t[0]) * (1 - t[1]), (1 - t[0]) * t[1] + t[0] * (1 - t[1]), t[0] * t[1]];
      } else {
        w = [(1 - t[0]) * (1 - t[1]) * (1 - t[2]),
          (1 - t[0]) * (1 - t[1]) * t[2] + (1 - t[0]) * t[1] * (1 - t[2]) + t[0] * (1 - t[1]) * (1 - t[2]),
          (1 - t[0]) * t[1] * t[2] + t[0] * (1 - t[1]) * t[2] + t[0] * t[1] * (1 - t[2]),
          t[0] * t[1] * t[2]];
      }
      let x = 0;
      let y = 0;
      for (let i = 0; i < seg.length; i++) {
        x += w[i] * seg[i].x;
        y += w[i] * seg[i].y;
      }
      return { x, y };
    };

    // Positions on the curve are the index of the segment plus the
    // parameter in the segment
    const getPoint = (pos: number): Point => {
      const i = Math.min(Math.floor(pos), segs.length - 1);
      const t = pos - i;
      return blossom(segs[i], [t, t, t]);
    };

    const dist = (a: Point, b: Point) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

    // Adds the curve from the given start to the given end position
    const addCurve = (from: number, to: number) => {
      for (let i = Math.floor(from); i < segs.length && i < to; i++) {
        const t0 = Math.max(0, from - i);
        const t1 = Math.min(1, to - i);
        if (t1 > t0) {
          const seg = segs[i];
          if (seg.length === 3) {
            const cp = blossom(seg, [t0, t1]);
            const pe = blossom(seg, [t1, t1]);
            c.quadTo(cp.x, cp.y, pe.x, pe.y);
          } else {
            const cp1 = blossom(seg, [t0, t0, t1]);
            const cp2 = blossom(seg, [t0, t1, t1]);
            const pe = blossom(seg, [t1, t1, t1]);
            c.curveTo(cp1.x, cp1.y, cp2.x, cp2.y, pe.x, pe.y);
          }
        }
      }
    };

    // First position on the curve at the given distance from the point at
    // the given end position in the given direction, or null if the curve
    // is not that long
    const cut = (pos: number, length: number, dir: number): number | null => {
      const p = getPoint(pos);
      let lo = pos;
      let hi: number | null = pos;
      // Steps of 1/16 end exactly at the other end of the curve
      while (hi != null && dist(getPoint(hi), p) < length) {
        lo = hi;
        hi = lo + dir / 16;
        hi = hi >= 0 && hi <= segs.length ? hi : null;
      }
      for (let i = 0; i < 40 && hi != null; i++) {
        const mid = (lo + hi) / 2;
        if (dist(getPoint(mid), p) < length) lo = mid;
        else hi = mid;
      }
      return hi;
    };

    // Position on the curve that is nearest to the given point, searched
    // in the given segment and its neighbors if a segment is given
    const getPosition = (pt: Point, segment?: number): number => {
      const steps = 32;
      let best = 0;
      let bestDist: number | null = null;
      const firstSeg = segment != null ? Math.max(0, segment - 1) : 0;
      const lastSeg = segment != null ? Math.min(segs.length, segment + 2) : segs.length;
      for (let i = firstSeg * steps; i <= lastSeg * steps; i++) {
        const d = dist(getPoint(i / steps), pt);
        if (bestDist == null || d < bestDist) {
          best = i / steps;
          bestDist = d;
        }
      }
      let lo = Math.max(0, best - 1 / steps);
      let hi = Math.min(segs.length, best + 1 / steps);
      for (let i = 0; i < 24; i++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (dist(getPoint(m1), pt) < dist(getPoint(m2), pt)) hi = m2;
        else lo = m1;
      }
      return (lo + hi) / 2;
    };

    // Position at the given distance along the curve from the given
    // position in the given direction, or null at the end of the curve
    const advance = (pos: number, length: number, dir: number): number | null => {
      const step = dir / 64;
      let prev = getPoint(pos);
      while (length > 0) {
        const next = pos + step;
        if (next < 0 || next > segs.length) return null;
        const pt = getPoint(next);
        const d = dist(prev, pt);
        if (d >= length) return pos + step * length / d;
        length -= d;
        pos = next;
        prev = pt;
      }
      return pos;
    };

    let start: number | null = 0;
    let end: number | null = segs.length;

    // Paints the curve with the original ends from where the markers
    // start if it is longer than the markers (see createMarker)
    if (trimmed && this.curveEnds != null && this.curveEnds[0] != null && this.curveEnds[1] != null) {
      const curve = pts.slice();
      curve[0] = this.curveEnds[0];
      curve[n - 1] = this.curveEnds[1];
      const moved = segs;
      segs = getCurveSegments(curve, bezier);
      start = cut(0, dist(curve[0], pts[0]), 1);
      end = cut(segs.length, dist(curve[n - 1], pts[n - 1]), -1);
      if (start == null || end == null || start >= end) {
        segs = moved;
        start = 0;
        end = segs.length;
      }
    }

    const startPos = start ?? 0;
    const endPos = end ?? segs.length;
    const first = getPoint(startPos);
    let current = startPos;
    c.begin();
    c.moveTo(first.x, first.y);

    if (hasJumps && rpts != null) {
      const size = this.getLineJumpSize();
      for (const rpt of rpts) {
        if (rpt.type !== 1) continue;
        const pos = getPosition({ x: rpt.x, y: rpt.y }, rpt.segment);
        const from = advance(pos, size, -1);
        const to = advance(pos, size, 1);

        // Ignores jumps that are too close to the previous jump or
        // to the ends of the curve
        if (from != null && to != null && from > current && to <= endPos) {
          addCurve(current, from);
          const p0 = getPoint(from);
          const p1 = getPoint(to);
          const nx = (p1.x - p0.x) / 2;
          const ny = (p1.y - p0.y) / 2;
          let f = (Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)) ? 1 : -1;

          if (style === 'sharp') {
            c.lineTo(p0.x - ny * f, p0.y + nx * f);
            c.lineTo(p1.x - ny * f, p1.y + nx * f);
            c.lineTo(p1.x, p1.y);
          } else if (style === 'line') {
            c.moveTo(p0.x + ny * f, p0.y - nx * f);
            c.lineTo(p0.x - ny * f, p0.y + nx * f);
            c.moveTo(p1.x - ny * f, p1.y + nx * f);
            c.lineTo(p1.x + ny * f, p1.y - nx * f);
            c.moveTo(p1.x, p1.y);
          } else if (style === 'arc') {
            f *= 1.3;
            c.curveTo(p0.x - ny * f, p0.y + nx * f, p1.x - ny * f, p1.y + nx * f, p1.x, p1.y);
          } else {
            c.moveTo(p1.x, p1.y);
          }
          current = to;
        }
      }
    }

    addCurve(current, endPos);
    c.stroke();
    return true;
  }
}

// --- mxArrow --------------------------------------------------------------------------

/** mxArrow (shape=arrow): a block arrow between the first and the last point. */
export class Arrow extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // Geometry of arrow
    const spacing = ARROW_SPACING;
    const width = ARROW_WIDTH;
    const arrow = ARROW_SIZE;

    // Base vector (between end points)
    const p0 = pts[0];
    const pe = pts[pts.length - 1];
    const dx = pe.x - p0.x;
    const dy = pe.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const length = dist - 2 * spacing - arrow;

    // Computes the norm and the inverse norm
    const nx = dx / dist;
    const ny = dy / dist;
    const basex = length * nx;
    const basey = length * ny;
    const floorx = width * ny / 3;
    const floory = -width * nx / 3;

    // Computes points
    const p0x = p0.x - floorx / 2 + spacing * nx;
    const p0y = p0.y - floory / 2 + spacing * ny;
    const p1x = p0x + floorx;
    const p1y = p0y + floory;
    const p2x = p1x + basex;
    const p2y = p1y + basey;
    const p3x = p2x + floorx;
    const p3y = p2y + floory;
    // p4 not necessary
    const p5x = p3x - 3 * floorx;
    const p5y = p3y - 3 * floory;

    c.begin();
    c.moveTo(p0x, p0y);
    c.lineTo(p1x, p1y);
    c.lineTo(p2x, p2y);
    c.lineTo(p3x, p3y);
    c.lineTo(pe.x - spacing * nx, pe.y - spacing * ny);
    c.lineTo(p5x, p5y);
    c.lineTo(p5x + floorx, p5y + floory);
    c.close();
    c.fillAndStroke();
  }
}

// --- mxArrowConnector -------------------------------------------------------------------

/** mxArrowConnector: an outlined band along the route with arrow heads. */
export class ArrowConnector extends Shape {
  arrowWidth = ARROW_WIDTH;
  arrowSpacing = ARROW_SPACING;
  /** draw.io paints in model units (mxGraphView.modelCoordinates). */
  inModelUnits = true;

  constructor() {
    super();
    this.startSize = ARROW_SIZE / 5;
    this.endSize = ARROW_SIZE / 5;
  }

  override isRoundable(): boolean { return true; }

  override apply(style: Style): void {
    super.apply(style);
    this.startSize = getNumber(style, 'startSize', ARROW_SIZE / 5) * 3;
    this.endSize = getNumber(style, 'endSize', ARROW_SIZE / 5) * 3;
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // Approximates the curve with a fine polyline so that the outline is
    // computed with the straight segment logic below
    const isCurved = this.isCurved() && pts.length > 2;
    if (isCurved) pts = this.getCurvePoints(pts);

    // Geometry of arrow
    let strokeWidth = this.strokewidth;
    if (this.outline) strokeWidth = Math.max(1, getNumber(this.style, 'strokeWidth', this.strokewidth));

    const startWidth = this.getStartArrowWidth() + strokeWidth;
    const endWidth = this.getEndArrowWidth() + strokeWidth;
    const edgeWidth = this.outline ? this.getEdgeWidth() + strokeWidth : this.getEdgeWidth();
    const openEnded = this.isOpenEnded();
    const markerStart = this.isMarkerStart();
    const markerEnd = this.isMarkerEnd();
    const spacing = openEnded ? 0 : this.arrowSpacing + strokeWidth / 2;
    const startSize = this.startSize + strokeWidth;
    const endSize = this.endSize + strokeWidth;

    // Rounded joins make no visual difference on the fine polyline and their
    // fixed-size control point offsets overshoot its short segments
    const isRounded = !isCurved && this.isArrowRounded();

    // Markers are painted straight so the curve is cut where the marker
    // starts and the removed part replaced by the chord that the marker
    // rides on, with its base on the curve
    if (isCurved && !openEnded) {
      if (markerStart) pts = this.trimCurveForMarker(pts, spacing + startSize, true);
      if (markerEnd) pts = this.trimCurveForMarker(pts, spacing + endSize, false);
    }

    // Base vector (between first points)
    const pe = pts[pts.length - 1];
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    // Computes the norm and the inverse norm
    let nx = dx / dist;
    let nx2: number;
    let nx1 = nx;
    let ny = dy / dist;
    let ny2: number;
    let ny1 = ny;
    let orthx = edgeWidth * ny;
    let orthy = -edgeWidth * nx;

    // Stores the inbound function calls in reverse order in fns
    const fns: Array<() => void> = [];

    if (isRounded) c.setLineJoin('round');
    else if (pts.length > 2) c.setMiterLimit(1.42); // Only mitre if there are waypoints

    c.begin();
    const startNx = nx;
    const startNy = ny;

    if (markerStart && !openEnded) {
      this.paintMarker(c, pts[0].x, pts[0].y, nx, ny, startSize, startWidth, edgeWidth, spacing, true);
    } else {
      const outStartX = pts[0].x + orthx / 2 + spacing * nx;
      const outStartY = pts[0].y + orthy / 2 + spacing * ny;
      const inEndX = pts[0].x - orthx / 2 + spacing * nx;
      const inEndY = pts[0].y - orthy / 2 + spacing * ny;
      if (openEnded) {
        c.moveTo(outStartX, outStartY);
        fns.push(() => c.lineTo(inEndX, inEndY));
      } else {
        c.moveTo(inEndX, inEndY);
        c.lineTo(outStartX, outStartY);
      }
    }

    let dx1 = 0;
    let dy1 = 0;
    let dist1 = 0;

    for (let i = 0; i < pts.length - 2; i++) {
      // Work out in which direction the line is bending
      const pos = relativeCcw(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, pts[i + 2].x, pts[i + 2].y);
      dx1 = pts[i + 2].x - pts[i + 1].x;
      dy1 = pts[i + 2].y - pts[i + 1].y;
      dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      if (dist1 !== 0) {
        nx1 = dx1 / dist1;
        ny1 = dy1 / dist1;
        const tmp1 = nx * nx1 + ny * ny1;
        const tmp = Math.max(Math.sqrt((tmp1 + 1) / 2), 0.04);

        // Work out the normal orthogonal to the line through the control point and the edge sides intersection
        nx2 = nx + nx1;
        ny2 = ny + ny1;
        const dist2 = Math.sqrt(nx2 * nx2 + ny2 * ny2);

        if (dist2 !== 0) {
          nx2 = nx2 / dist2;
          ny2 = ny2 / dist2;

          // Higher strokewidths require a larger minimum bend, 0.35 covers all but the most extreme cases
          const strokeWidthFactor = Math.max(tmp, Math.min(this.strokewidth / 200 + 0.04, 0.35));
          const angleFactor = (pos !== 0 && isRounded) ? Math.max(0.1, strokeWidthFactor) : Math.max(tmp, 0.06);

          const outX = pts[i + 1].x + ny2 * edgeWidth / 2 / angleFactor;
          const outY = pts[i + 1].y - nx2 * edgeWidth / 2 / angleFactor;
          const inX = pts[i + 1].x - ny2 * edgeWidth / 2 / angleFactor;
          const inY = pts[i + 1].y + nx2 * edgeWidth / 2 / angleFactor;

          if (pos === 0 || !isRounded) {
            // If the two segments are aligned, or if we're not drawing curved sections between segments
            // just draw straight to the intersection point
            c.lineTo(outX, outY);
            fns.push(() => c.lineTo(inX, inY));
          } else if (pos === -1) {
            const c1x = inX + ny * edgeWidth;
            const c1y = inY - nx * edgeWidth;
            const c2x = inX + ny1 * edgeWidth;
            const c2y = inY - nx1 * edgeWidth;
            c.lineTo(c1x, c1y);
            c.quadTo(outX, outY, c2x, c2y);
            fns.push(() => c.lineTo(inX, inY));
          } else {
            c.lineTo(outX, outY);
            const c1x = outX - ny * edgeWidth;
            const c1y = outY + nx * edgeWidth;
            const c2x = outX - ny1 * edgeWidth;
            const c2y = outY + nx1 * edgeWidth;
            fns.push(() => c.quadTo(inX, inY, c1x, c1y));
            fns.push(() => c.lineTo(c2x, c2y));
          }

          nx = nx1;
          ny = ny1;
        }
      }
    }

    orthx = edgeWidth * ny1;
    orthy = -edgeWidth * nx1;

    if (markerEnd && !openEnded) {
      this.paintMarker(c, pe.x, pe.y, -nx, -ny, endSize, endWidth, edgeWidth, spacing, false);
    } else {
      c.lineTo(pe.x - spacing * nx1 + orthx / 2, pe.y - spacing * ny1 + orthy / 2);
      const inStartX = pe.x - spacing * nx1 - orthx / 2;
      const inStartY = pe.y - spacing * ny1 - orthy / 2;
      if (!openEnded) {
        c.lineTo(inStartX, inStartY);
      } else {
        c.moveTo(inStartX, inStartY);
        fns.splice(0, 0, () => c.moveTo(inStartX, inStartY));
      }
    }

    for (let i = fns.length - 1; i >= 0; i--) fns[i]();

    if (openEnded) {
      c.end();
      c.stroke();
    } else {
      c.close();
      c.fillAndStroke();
    }

    // Workaround for shadow on top of base arrow
    c.setShadow(false);

    // Need to redraw the markers without the low miter limit
    c.setMiterLimit(4);
    if (isRounded) c.setLineJoin('flat');

    if (pts.length > 2) {
      // Only to repaint markers if no waypoints
      // Need to redraw the markers without the low miter limit
      c.setMiterLimit(4);
      if (markerStart && !openEnded) {
        c.begin();
        this.paintMarker(c, pts[0].x, pts[0].y, startNx, startNy, startSize, startWidth, edgeWidth, spacing, true);
        c.stroke();
        c.end();
      }
      if (markerEnd && !openEnded) {
        c.begin();
        this.paintMarker(c, pe.x, pe.y, -nx, -ny, endSize, endWidth, edgeWidth, spacing, true);
        c.stroke();
        c.end();
      }
    }
  }

  paintMarker(c: SvgCanvas, ptX: number, ptY: number, nx: number, ny: number, size: number, arrowWidth: number,
    edgeWidth: number, spacing: number, initialMove: boolean): void {
    const widthArrowRatio = edgeWidth / arrowWidth;
    const orthx = edgeWidth * ny / 2;
    const orthy = -edgeWidth * nx / 2;
    const spaceX = (spacing + size) * nx;
    const spaceY = (spacing + size) * ny;

    if (initialMove) c.moveTo(ptX - orthx + spaceX, ptY - orthy + spaceY);
    else c.lineTo(ptX - orthx + spaceX, ptY - orthy + spaceY);

    c.lineTo(ptX - orthx / widthArrowRatio + spaceX, ptY - orthy / widthArrowRatio + spaceY);
    c.lineTo(ptX + spacing * nx, ptY + spacing * ny);
    c.lineTo(ptX + orthx / widthArrowRatio + spaceX, ptY + orthy / widthArrowRatio + spaceY);
    c.lineTo(ptX + orthx + spaceX, ptY + orthy + spaceY);
  }

  isArrowRounded(): boolean {
    return this.isRounded;
  }

  isCurved(): boolean {
    return this.hasStyle && looseEq(styleValue(this.style, 'curved'), 1);
  }

  /** The quadratic curve through the midpoints as a fine polyline. */
  getCurvePoints(pts: Point[]): Point[] {
    const result: Point[] = [pts[0]];
    const n = pts.length;
    let p0 = pts[0];
    const s = this.inModelUnits ? Math.max(this.scale, 4) : this.scale;

    for (let i = 1; i < n - 1; i++) {
      const pc = pts[i];
      const pe = i < n - 2 ? { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 } : pts[i + 1];
      const dx0 = pc.x - p0.x;
      const dy0 = pc.y - p0.y;
      const dx1 = pe.x - pc.x;
      const dy1 = pe.y - pc.y;
      const len = (Math.sqrt(dx0 * dx0 + dy0 * dy0) + Math.sqrt(dx1 * dx1 + dy1 * dy1)) * s;
      const steps = Math.max(4, Math.min(Math.ceil(len / 8), 64));

      for (let j = 1; j <= steps; j++) {
        const u = j / steps;
        const iu = 1 - u;
        result.push({
          x: iu * iu * p0.x + 2 * iu * u * pc.x + u * u * pe.x,
          y: iu * iu * p0.y + 2 * iu * u * pc.y + u * u * pe.y,
        });
      }
      p0 = pe;
    }
    return result;
  }

  /** Cuts the curve at the given distance from its end and keeps the chord to the end. */
  trimCurveForMarker(pts: Point[], dist: number, source: boolean): Point[] {
    const n = pts.length;
    const pc = source ? pts[0] : pts[n - 1];

    // Returns the point between the outer point p0 and the inner point p1
    // at the given distance to the terminal point
    const cutPoint = (p0: Point, p1: Point): Point => {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const fx = p0.x - pc.x;
      const fy = p0.y - pc.y;
      const a = dx * dx + dy * dy;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - dist * dist;
      const disc = b * b - 4 * a * c;
      if (a === 0 || disc < 0) return p0;
      const t = Math.max(0, Math.min(1, (-b - Math.sqrt(disc)) / (2 * a)));
      return { x: p0.x + t * dx, y: p0.y + t * dy };
    };

    if (source) {
      for (let i = 1; i < n - 1; i++) {
        const dx = pts[i].x - pc.x;
        const dy = pts[i].y - pc.y;
        if (dx * dx + dy * dy >= dist * dist) return [pc, cutPoint(pts[i], pts[i - 1])].concat(pts.slice(i));
      }
    } else {
      for (let i = n - 2; i > 0; i--) {
        const dx = pts[i].x - pc.x;
        const dy = pts[i].y - pc.y;
        if (dx * dx + dy * dy >= dist * dist) {
          const result = pts.slice(0, i + 1);
          result.push(cutPoint(pts[i], pts[i + 1]));
          result.push(pc);
          return result;
        }
      }
    }
    return pts;
  }

  getStartArrowWidth(): number { return ARROW_WIDTH; }
  getEndArrowWidth(): number { return ARROW_WIDTH; }
  getEdgeWidth(): number { return ARROW_WIDTH / 3; }
  isOpenEnded(): boolean { return false; }

  isMarkerStart(): boolean {
    return getString(this.style, 'startArrow', NONE) !== NONE;
  }

  isMarkerEnd(): boolean {
    return getString(this.style, 'endArrow', NONE) !== NONE;
  }
}

/** Link shape: two parallel lines (an open-ended arrow connector). */
export class LinkShape extends ArrowConnector {
  defaultWidth = 4;

  override isOpenEnded(): boolean { return true; }

  override getEdgeWidth(): number {
    return getNumber(this.style, 'width', this.defaultWidth) + Math.max(0, this.strokewidth - 1);
  }

  override isArrowRounded(): boolean { return this.isRounded; }
}

/** Generic arrow (flexArrow). */
export class FlexArrowShape extends ArrowConnector {
  defaultWidth = 10;
  defaultArrowWidth = 20;

  override getStartArrowWidth(): number {
    return this.getEdgeWidth() + getNumber(this.style, 'startWidth', this.defaultArrowWidth);
  }

  override getEndArrowWidth(): number {
    return this.getEdgeWidth() + getNumber(this.style, 'endWidth', this.defaultArrowWidth);
  }

  override getEdgeWidth(): number {
    return getNumber(this.style, 'width', this.defaultWidth) + Math.max(0, this.strokewidth - 1);
  }
}

// --- Wire, filled edge, pipe ------------------------------------------------------------

/** Wire Shape: a solid line in the stroke colour under a dashed line in the fill colour. */
export class WireShape extends Connector {
  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // The indirection via functions for markers is needed in
    // order to apply the offsets before painting the line and
    // paint the markers after painting the line.
    const sourceMarker = this.createMarker(c, pts, true);
    const targetMarker = this.createMarker(c, pts, false);

    // Paints base line without dash pattern
    c.setDashed(false);
    Polyline.prototype.paintEdgeShape.call(this, c, pts);

    // Paints dashed line with dash pattern and fill color
    if (this.isDashed != null) {
      c.setDashed(this.isDashed, this.hasStyle ? looseEq(getValue(this.style, 'fixDash', false), 1) : false);
    }

    c.setShadow(false);
    c.setStrokeColor(this.fill);
    Polyline.prototype.paintEdgeShape.call(this, c, pts);

    // Paints markers with stroke color
    c.setStrokeColor(this.stroke);
    c.setFillColor(this.stroke);
    c.setDashed(false);

    if (sourceMarker != null) sourceMarker();
    if (targetMarker != null) targetMarker();
  }
}

/** FilledEdge: the connector, then the same route in the fill colour 2px narrower. */
export class FilledEdge extends Connector {
  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // Markers modify incoming points array
    const temp = pts.map(clonePoint);

    // paintEdgeShape resets dashed to false
    const dashed = c.state.dashed;
    const fixDash = c.state.fixDash;
    super.paintEdgeShape(c, temp);

    if (c.state.strokeWidth >= 3) {
      const fillClr = getString(this.style, 'fillColor', null);
      if (fillClr != null) {
        c.setStrokeColor(fillClr);
        c.setStrokeWidth(c.state.strokeWidth - 2);
        c.setDashed(dashed, fixDash);
        super.paintEdgeShape(c, pts);
      }
    }
  }
}

/** Pipe shape: a casing in the stroke colour around a line of `width` in the fill colour. */
export class PipeShape extends Connector {
  defaultWidth = 4;

  getEdgeWidth(): number {
    return Math.max(0, getNumber(this.style, 'width', this.defaultWidth));
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // Markers modify incoming points array
    const temp = pts.map(clonePoint);

    // paintEdgeShape resets dashed to false
    const dashed = c.state.dashed;
    const fixDash = c.state.fixDash;
    const width = this.getEdgeWidth();
    c.setStrokeWidth(width + 2 * this.strokewidth);
    c.setDashed(false);

    super.paintEdgeShape(c, temp);

    const fillClr = getString(this.style, 'fillColor', null);
    if (fillClr != null) {
      c.setStrokeWidth(width);
      c.setStrokeColor(fillClr);
      c.setDashed(dashed, fixDash);
      super.paintEdgeShape(c, pts);
    }
  }
}

// --- Tapered arrow ------------------------------------------------------------------------

interface TaperHead { cl: Point; tip: Point; cr: Point }

/**
 * Tapered arrow shape: a band whose width changes linearly from startWidth
 * at the source to endWidth at the target (before the marker), filled with
 * fillColor (and gradientColor) and outlined with strokeColor.
 */
export class TaperedArrowShape extends Connector {
  defaultStartWidth = 12;
  defaultEndWidth = 2;
  heads: Array<TaperHead | null> | null = null;
  bandPainted = false;
  /** Classic and block heads are part of the outline, with these width factors. */
  outlineHeads: Record<string, number> = { classic: 2, block: 2, classicThin: 3, blockThin: 3 };
  /** Markers that are added to the band path and filled with it. */
  mergedMarkers = ['classic', 'classicThin', 'block', 'blockThin', 'diamond', 'diamondThin', 'doubleBlock', 'box'];
  maxLoopPoints = 1000;

  getStartWidth(): number {
    return Math.max(0, getNumber(this.style, 'startWidth', this.defaultStartWidth));
  }

  getEndWidth(): number {
    return Math.max(0, getNumber(this.style, 'endWidth', this.defaultEndWidth));
  }

  override paintLine(c: SvgCanvas, pts: Point[], rounded: boolean): void {
    if (rounded) pts = this.getRoundedPoints(pts, this.lineArcSize());
    this.paintTaperedLine(c, pts);
  }

  override paintCurvedLine(c: SvgCanvas, pts: Point[]): void {
    this.paintTaperedLine(c, getCurvePoints(pts, false));
  }

  override paintBezierLine(c: SvgCanvas, pts: Point[]): void {
    this.paintTaperedLine(c, getCurvePoints(pts, true));
  }

  /** The polyline with the corners replaced by fine quadratic curves (as addPoints rounds them). */
  getRoundedPoints(pts: Point[], arcSize: number): Point[] {
    const n = pts.length;
    if (n < 3) return pts;
    const steps = 8;
    const result: Point[] = [pts[0]];
    let pt = pts[0];

    for (let i = 1; i < n - 1; i++) {
      const tmp = pts[i];
      let dx = pt.x - tmp.x;
      let dy = pt.y - tmp.y;
      if (dx === 0 && dy === 0) continue;

      let dist = Math.sqrt(dx * dx + dy * dy);
      const p1 = { x: tmp.x + dx * Math.min(arcSize, dist / 2) / dist, y: tmp.y + dy * Math.min(arcSize, dist / 2) / dist };
      result.push(p1);

      // Uses next non-overlapping point
      let next = pts[i + 1];
      while (i < n - 2 && Math.round(next.x - tmp.x) === 0 && Math.round(next.y - tmp.y) === 0) {
        next = pts[i + 2];
        i++;
      }

      dx = next.x - tmp.x;
      dy = next.y - tmp.y;
      dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const p2 = { x: tmp.x + dx * Math.min(arcSize, dist / 2) / dist, y: tmp.y + dy * Math.min(arcSize, dist / 2) / dist };

      for (let t = 1; t <= steps; t++) {
        const u = t / steps;
        const iu = 1 - u;
        result.push({
          x: iu * iu * p1.x + 2 * iu * u * tmp.x + u * u * p2.x,
          y: iu * iu * p1.y + 2 * iu * u * tmp.y + u * u * p2.y,
        });
      }
      pt = p2;
    }
    result.push(pts[n - 1]);
    return result;
  }

  paintTaperedLine(c: SvgCanvas, pts: Point[]): void {
    // Removes duplicate points
    const p: Point[] = [];
    for (const point of pts) {
      if (point != null && (p.length === 0 || point.x !== p[p.length - 1].x || point.y !== p[p.length - 1].y)) {
        p.push(point);
      }
    }
    if (p.length < 2) return;

    // Normals and lengths of the segments
    const normals: Point[] = [];
    const lengths = [0];
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].x - p[i - 1].x;
      const dy = p[i].y - p[i - 1].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      normals.push({ x: -dy / dist, y: dx / dist });
      lengths.push(lengths[i - 1] + dist);
    }

    const total = lengths[lengths.length - 1];
    const sw = this.getStartWidth();
    const ew = this.getEndWidth();
    let left: Point[] = [];
    let right: Point[] = [];

    for (let i = 0; i < p.length; i++) {
      const w = (sw + (ew - sw) * lengths[i] / total) / 2;
      const n0 = normals[Math.max(0, i - 1)];
      const n1 = normals[Math.min(normals.length - 1, i)];
      let nx = n0.x + n1.x;
      let ny = n0.y + n1.y;
      const nl = Math.sqrt(nx * nx + ny * ny);

      // Mitered offset limited to twice the width for sharp angles
      const cos = nl === 0 ? 0 : nl / 2;
      const f = w / Math.max(0.5, cos);
      nx = nl === 0 ? n1.x : nx / nl;
      ny = nl === 0 ? n1.y : ny / nl;

      left.push({ x: p[i].x + nx * f, y: p[i].y + ny * f });
      right.push({ x: p[i].x - nx * f, y: p[i].y - ny * f });
    }

    // The inner side of corners and curves with a radius below the
    // half width loops back on itself
    const span = 2 * Math.max(sw, ew);
    left = this.removeLoops(left, lengths, span);
    right = this.removeLoops(right, lengths, span);

    // Adds the band to the current path, which is filled and stroked in
    // paintEdgeShape together with the filled markers
    c.begin();
    c.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) c.lineTo(left[i].x, left[i].y);

    // Heads that are part of the outline are added between the sides
    const endHead = this.heads != null ? this.heads[1] : null;
    const startHead = this.heads != null ? this.heads[0] : null;

    if (endHead != null) {
      c.lineTo(endHead.cl.x, endHead.cl.y);
      c.lineTo(endHead.tip.x, endHead.tip.y);
      c.lineTo(endHead.cr.x, endHead.cr.y);
    }

    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);

    if (startHead != null) {
      c.lineTo(startHead.cr.x, startHead.cr.y);
      c.lineTo(startHead.tip.x, startHead.tip.y);
      c.lineTo(startHead.cl.x, startHead.cl.y);
    }

    c.close();
    this.bandPainted = true;
  }

  /**
   * Creates the markers. Classic and block heads with the default fill
   * become part of the outline of the band (heads), others are scaled with
   * the width at their end.
   */
  override createMarker(c: SvgCanvas, pts: Point[], source: boolean): MarkerPainter | null {
    let result: MarkerPainter | null = null;
    const n = pts.length;
    const type = getString(this.style, source ? 'startArrow' : 'endArrow', null);
    const p0 = source ? pts[1] : pts[n - 2];
    const pe = source ? pts[0] : pts[n - 1];

    if (type != null && p0 != null && pe != null) {
      const dx = pe.x - p0.x;
      const dy = pe.y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const ux = dx / dist;
        const uy = dy / dist;
        const w = source ? this.getStartWidth() : this.getEndWidth();
        const wf = this.isMergedMarker(source) ? this.outlineHeads[type] : undefined;
        let size = getNumber(this.style, source ? 'startSize' : 'endSize', DEFAULT_MARKERSIZE);

        if (wf != null) {
          // Same geometry as mxMarker.createArrow with the half width of
          // the head larger than the half width of the band
          size += w * wf / 2;
          const sw = this.strokewidth;
          const endOffsetX = ux * sw * 1.118;
          const endOffsetY = uy * sw * 1.118;
          const unitX = ux * (size + sw);
          const unitY = uy * (size + sw);
          const tip = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
          const f = (type === 'classic' || type === 'classicThin') ? 3 / 4 : 1;
          pe.x += -unitX * f - endOffsetX;
          pe.y += -unitY * f - endOffsetY;

          const c1 = { x: tip.x - unitX - unitY / wf, y: tip.y - unitY + unitX / wf };
          const c2 = { x: tip.x + unitY / wf - unitX, y: tip.y - unitY - unitX / wf };

          // Corners on the left and right side of the band (whose direction
          // is reversed at the start)
          if (this.heads != null) {
            this.heads[source ? 0 : 1] = source ? { cl: c2, tip, cr: c1 } : { cl: c1, tip, cr: c2 };
          }
        } else {
          const filled = !looseEq(styleValue(this.style, source ? 'startFill' : 'endFill'), 0);
          result = createMarkerPainter(c, this, type, pe, ux, uy, size + w, source, this.strokewidth, filled);
        }
      }
    }
    return result;
  }

  /** Removes the loops of an offset line within the given span of lengths. */
  removeLoops(pts: Point[], lengths: number[], span: number): Point[] {
    const n = pts.length;
    let cur = pts[0];
    const result = [cur];
    let i = 0;

    while (i < n - 1) {
      let ip: Point | null = null;
      let j = i + 2;
      while (j < n - 1 && j < i + 2 + this.maxLoopPoints && lengths[j] - lengths[i + 1] <= span) j++;

      // Uses the last intersection to remove nested loops
      for (j--; j >= i + 2 && ip == null; j--) {
        ip = intersection(cur.x, cur.y, pts[i + 1].x, pts[i + 1].y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y);
      }

      if (ip != null) {
        cur = ip;
        i = j + 1;
      } else {
        cur = pts[i + 1];
        i++;
      }
      result.push(cur);
    }
    return result;
  }

  /** True if the marker at the given end is added to the band (see mergedMarkers). */
  isMergedMarker(source: boolean): boolean {
    return this.mergedMarkers.indexOf(String(getValue(this.style, source ? 'startArrow' : 'endArrow', null))) >= 0
      && !looseEq(getValue(this.style, source ? 'startFill' : 'endFill', 1), 0)
      && getValue(this.style, source ? 'startFillColor' : 'endFillColor', null) == null;
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    this.heads = [null, null];
    const sourceMarker = this.createMarker(c, pts, true);
    const targetMarker = this.createMarker(c, pts, false);
    const merged: Array<{ paint: MarkerPainter; source: boolean }> = [];
    const separate: Array<{ paint: MarkerPainter; source: boolean }> = [];

    if (sourceMarker != null) (this.isMergedMarker(true) ? merged : separate).push({ paint: sourceMarker, source: true });
    if (targetMarker != null) (this.isMergedMarker(false) ? merged : separate).push({ paint: targetMarker, source: false });

    this.bandPainted = false;
    Polyline.prototype.paintEdgeShape.call(this, c, pts);

    if (merged.length > 0) {
      if (!this.bandPainted) {
        c.begin();
        this.bandPainted = true;
      }

      // Collects the paths of the markers in the current path
      const begin = c.begin;
      const fill = c.fill;
      const stroke = c.stroke;
      const fillAndStroke = c.fillAndStroke;
      const nop = (): void => { /* collected into the band */ };
      c.begin = nop;
      c.fill = nop;
      c.stroke = nop;
      c.fillAndStroke = nop;

      try {
        for (const marker of merged) marker.paint();
      } finally {
        c.begin = begin;
        c.fill = fill;
        c.stroke = stroke;
        c.fillAndStroke = fillAndStroke;
      }
    }

    // Outlines (selection border and the preview of the edge handler)
    // replace fillAndStroke with stroke
    if (this.bandPainted) c.fillAndStroke();

    // Other markers use the fill color of the band without gradient
    if (separate.length > 0) {
      c.setShadow(false);
      c.setDashed(false);
      for (const marker of separate) {
        c.setFillColor(getString(this.style, marker.source ? 'startFillColor' : 'endFillColor', this.fill));
        marker.paint();
      }
    }
  }
}
