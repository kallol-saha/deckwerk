/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/view/mxGraphView.js (updateEdgeState, updateFixedTerminalPoints,
 * getFixedTerminalPoint, updateBoundsFromStencil, updatePoints,
 * transformControlPoint, isLoopStyleEnabled, getEdgeStyle,
 * updateFloatingTerminalPoints, removeDuplicatePoints, getFloatingTerminalPoint,
 * getTerminalPort, getPerimeterPoint, getLabelPerimeterSide, isLabelPerimeter,
 * getLabelPerimeterPoint, getRoutingCenterX/Y, getPerimeterBounds,
 * getNextPoint, updateEdgeBounds, getPoint, getSegmentLengths,
 * getRelativePoint, updateEdgeLabelOffset), mxgraph/src/view/mxGraph.js
 * (getConnectionConstraint, getConnectionPoint, isOrthogonal),
 * mxgraph/src/view/mxCellState.js (getPerimeterBounds,
 * setAbsoluteTerminalPoint), mxgraph/src/view/mxConnectionConstraint.js and
 * draw.io's overrides in js/grapheditor/Graph.js (getFixedTerminalPoint for
 * centerPerimeter, updateFloatingTerminalPoint and snapToAnchorPoint for
 * snapToPoint, updateFixedPointSpacing, updateFloatingTerminalPoints,
 * updateMultipleTerminalPoint and getMultiplePerimeterPoint for multiple=1,
 * Graph.getMultipleCopies, getChannelBounds, getConnectionPoint,
 * getLegacyConnectionPoint, the rounded and outline perimeter points,
 * getAllConnectionConstraints for the `points` style, getLabelCurveState,
 * getPoint and getRelativePoint along curves, Graph.getEdgeCurvePoints,
 * Graph.getCurvePoints, Graph.edgeSupportsCurved) and js/grapheditor/
 * Shapes.js (isOrthogonal and isDuplicatePointsRemoved for isometric edges).
 * Modified for DeckWerk: a function from an edge and its terminals (in page
 * space) to the route, instead of cell states in a view; scale 1 and
 * translate 0 (draw.io's model coordinates), so control points are already
 * absolute; what draw.io reads from the model, the shapes and the measured
 * labels comes in on the terminal views.
 */

import type { Point, Rect, Style } from './types.js';
import {
  DIRECTION_NORTH, DIRECTION_SOUTH, DIRECTION_WEST, centerX, centerY, cloneRect, getRotatedPoint, getValue,
  grow, intersection, jsParseFloat, jsParseInt, ptSegDistSq, relativeCcw, rotate90, styleValue,
  toRadians, unscale,
} from './geometry.js';
import type { StyleValue } from './geometry.js';
import {
  BackbonePerimeter, CloudPerimeter, LifelinePerimeter, OrthogonalPerimeter, OutlinePerimeter,
  RectanglePerimeter, getOutlineBounds, getPerimeterFunction, getRoundedPerimeterArcCenter,
  getRoundedPerimeterArcSize, isOutlinePerimeter, isRoundedPerimeter, roundedPolygonPerimeter,
} from './perimeter.js';
import type { PerimeterFunction } from './perimeter.js';
import {
  IsometricConnector, Loop, getEdgeStyleFunction, isDuplicatePointsRemoved, isOrthogonalEdgeStyle, roundScaled,
} from './edgeStyle.js';
import type { EdgeState, EdgeStyleFunction, EdgeStyleView, VertexState } from './edgeStyle.js';

// --- public types ---------------------------------------------------------------

/** A connection point given as fractions of the terminal (mxConnectionConstraint). */
export interface ConnectionConstraint {
  /** Fractions of the width and height (exitX/exitY, entryX/entryY). */
  x: number;
  y: number;
  /** Project the point onto the perimeter (exitPerimeter/entryPerimeter). Default true. */
  perimeter?: boolean;
  /** Absolute offsets added after the fractions (exitDx/exitDy, entryDx/entryDy). */
  dx?: number;
  dy?: number;
}

export interface TerminalView {
  id: string;
  /** Absolute, unrotated box in page space. */
  bounds: Rect;
  /** Resolved vertex style incl. rotation, direction, flipH/V, perimeter, portConstraint, points. */
  style: Style;
  /** geometry.x if the terminal's geometry is relative (a port child): entityRelationEdgeStyle reads it. */
  relativeX?: number | null;
  /** The lifeline the terminal belongs to (Graph.getSequenceLifeline): its parent for an activation bar. Default: id. */
  lifeline?: string | null;
  /** True if the shape is a stencil (enables the legacy stencilFlipH/V keys). */
  stencil?: boolean;
  /** w0/h0 of a stencil with aspect="fixed": routing uses the box the stencil fills. */
  stencilAspect?: { width: number; height: number } | null;
  /** The measured box of the vertex label (labelPerimeter=1 keeps edges off an outside label). */
  labelBox?: Rect | null;
  /** The outline as painted (cloudPerimeter, polygons with roundedPerimeter=1), see perimeter.ts. */
  outline?: ((bounds: Rect) => Point[] | null) | null;
  /** The hull of what the shape paints (outlinePerimeter). */
  perimeterOutline?: ((bounds: Rect) => Point[] | null) | null;
  /** The shape's connection points (for snapToPoint), when the style has no `points`. */
  constraints?: readonly ConnectionConstraint[] | null;
}

export interface EdgeView {
  id: string;
  /** Resolved edge style. */
  style: Style;
  source: TerminalView | null;
  target: TerminalView | null;
  /** Absolute waypoints (geometry points already translated to page space). */
  points: Point[];
  /** Absolute loose ends when a terminal is missing. */
  sourcePoint?: Point | null;
  targetPoint?: Point | null;
  /** Looks up the cells that `sourcePort`/`targetPort` name (mxGraphView.getTerminalPort). */
  resolvePort?: ((id: string) => TerminalView | null) | null;
  /** mxGraph.gridSize (the page's gridSize), the default segment of loops. Default 10. */
  gridSize?: number;
}

// --- states ------------------------------------------------------------------------

/** mxCellState of a terminal, with what the view reads from the model and shape. */
interface TerminalState extends VertexState {
  stencilAspect?: { width: number; height: number } | null;
  labelBox?: Rect | null;
  constraints?: readonly ConnectionConstraint[] | null;
}

/** mxConnectionConstraint: a null point means a floating end. */
interface Constraint {
  point: Point | null;
  perimeter: boolean;
  dx: number;
  dy: number;
}

/** The fields of an edge state that the label positions read (mxGraphView.updateEdgeBounds). */
interface EdgeGeometryState {
  absolutePoints: Point[];
  segments: number[];
  length: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function pt(x: number, y: number): Point {
  return { x, y };
}

function terminalState(view: TerminalView): TerminalState {
  return {
    id: view.id,
    x: view.bounds.x,
    y: view.bounds.y,
    width: view.bounds.width,
    height: view.bounds.height,
    style: view.style,
    relativeX: view.relativeX ?? null,
    lifeline: view.lifeline ?? null,
    stencil: view.stencil ?? false,
    stencilAspect: view.stencilAspect ?? null,
    labelBox: view.labelBox ?? null,
    outline: view.outline ?? null,
    perimeterOutline: view.perimeterOutline ?? null,
    constraints: view.constraints ?? null,
  };
}

/** model.isVertex(state.cell): the states edge styles make for points have no cell. */
function isVertex(state: VertexState): boolean {
  return state.id != null;
}

/** mxCellState.setAbsoluteTerminalPoint */
function setAbsoluteTerminalPoint(state: EdgeState, point: Point | null, isSource: boolean): void {
  const pts = state.absolutePoints;

  if (isSource) {
    if (pts.length == 0) {
      pts.push(point);
    } else {
      pts[0] = point;
    }
  } else {
    if (pts.length == 0) {
      pts.push(null);
      pts.push(point);
    } else if (pts.length == 1) {
      pts.push(point);
    } else {
      pts[pts.length - 1] = point;
    }
  }
}

/**
 * Graph.getMultipleCopies: the number of copies and the offset between the
 * copies on the page for the given style with multiple=1, or null if no
 * copies are painted.
 */
function getMultipleCopies(style: Style | null): { count: number; dx: number; dy: number } | null {
  let copies: { count: number; dx: number; dy: number } | null = null;

  if (style != null && getValue(style, 'multiple', '0') == '1') {
    const count = Math.min(MAX_MULTIPLE_COUNT, jsParseInt(getValue(
      style, 'multipleCount', DEFAULT_MULTIPLE_COUNT)));
    const dx = jsParseFloat(getValue(style,
      'multipleDx', DEFAULT_MULTIPLE_DX));
    const dy = jsParseFloat(getValue(style,
      'multipleDy', DEFAULT_MULTIPLE_DY));

    if (count > 0 && Number.isFinite(dx) && Number.isFinite(dy)) {
      copies = { count, dx, dy };
    }
  }

  return copies;
}

const DEFAULT_MULTIPLE_COUNT = 2;
const MAX_MULTIPLE_COUNT = 10;
const DEFAULT_MULTIPLE_DX = 8;
const DEFAULT_MULTIPLE_DY = -8;

/**
 * The mxGraphView (and the parts of Graph it calls) that routes one edge,
 * at scale 1 and translate 0.
 */
class RouteView implements EdgeStyleView {
  readonly scale = 1;
  readonly translate: Point = pt(0, 0);
  readonly gridSize: number;
  private readonly states = new Map<string, TerminalState>();
  private readonly resolvePort: ((id: string) => TerminalView | null) | null;

  constructor(gridSize = 10, resolvePort: ((id: string) => TerminalView | null) | null = null) {
    this.gridSize = gridSize;
    this.resolvePort = resolvePort;
  }

  /** The one state per cell id, as mxGraphView.getState keeps them. */
  getState(view: TerminalView | null | undefined): TerminalState | null {
    if (view == null) return null;
    let state = this.states.get(view.id);

    if (state == null) {
      state = terminalState(view);
      this.states.set(view.id, state);
    }

    return state;
  }

  getPixelSize(): number {
    // Model coordinates at scale 1
    return this.scale;
  }

  // --- mxGraphView ----------------------------------------------------------------

  /**
   * Updates the absolute points of the given edge state: fixed ends, the
   * edge style or the waypoints, floating ends, duplicates removed
   * (mxGraphView.updateEdgeState for an edge whose terminals are valid).
   */
  updateEdgeState(state: EdgeState, points: Point[] | null, source: TerminalState | null, target: TerminalState | null): void {
    this.updateFixedTerminalPoints(state, source, target);
    this.updatePoints(state, points, source, target);
    this.updateFloatingTerminalPoints(state, source, target);
    this.removeDuplicatePoints(state, points, source, target);
  }

  /**
   * Sets the initial absolute terminal points in the given state before the edge
   * style is computed.
   */
  updateFixedTerminalPoints(edge: EdgeState, source: TerminalState | null, target: TerminalState | null): void {
    this.updateFixedTerminalPoint(edge, source, true,
      getConnectionConstraint(edge, source, true));
    this.updateFixedTerminalPoint(edge, target, false,
      getConnectionConstraint(edge, target, false));
  }

  /** Sets the fixed source or target terminal point on the given edge. */
  updateFixedTerminalPoint(edge: EdgeState, terminal: TerminalState | null, source: boolean, constraint: Constraint | null): void {
    setAbsoluteTerminalPoint(edge, this.getFixedTerminalPoint(edge, terminal, source, constraint), source);
  }

  /**
   * Returns the fixed source or target terminal point for the given edge.
   *
   * draw.io: adds support for centerPerimeter which is a special case of a
   * fixed point perimeter.
   */
  getFixedTerminalPoint(edge: EdgeState & { terminalPoints?: [Point | null, Point | null] }, terminal: TerminalState | null,
    source: boolean, constraint: Constraint | null): Point | null {
    if (terminal != null && terminal.style['perimeter'] == 'centerPerimeter') {
      return pt(centerX(terminal), centerY(terminal));
    }

    let p: Point | null = null;

    if (constraint != null) {
      p = this.getConnectionPoint(terminal, constraint, false); // FIXME Rounding introduced bugs when calculating label positions -> , this.graph.isOrthogonal(edge));
    }

    if (p == null && terminal == null) {
      // geo.getTerminalPoint(source), already in page space (origin 0)
      const tp = edge.terminalPoints != null ? edge.terminalPoints[source ? 0 : 1] : null;

      if (tp != null) {
        p = pt(this.scale * (this.translate.x + tp.x),
          this.scale * (this.translate.y + tp.y));
      }
    }

    return p;
  }

  /**
   * Updates the bounds of the given cell state to reflect the bounds of the stencil
   * if it has a fixed aspect and returns the previous bounds if the bounds have
   * been modified or null otherwise.
   */
  updateBoundsFromStencil(state: TerminalState | null): Rect | null {
    let previous: Rect | null = null;

    if (state != null && state.stencilAspect != null) {
      previous = cloneRect(state);
      const direction = state.style['direction'];
      const inverse = direction == DIRECTION_NORTH || direction == DIRECTION_SOUTH;
      const sw = inverse ? state.stencilAspect.height : state.stencilAspect.width;
      const sh = inverse ? state.stencilAspect.width : state.stencilAspect.height;
      const s = Math.min(state.width / sw, state.height / sh);

      const x = state.x + (state.width - sw * s) / 2;
      const y = state.y + (state.height - sh * s) / 2;
      state.x = x;
      state.y = y;
      state.width = sw * s;
      state.height = sh * s;
    }

    return previous;
  }

  /**
   * Updates the absolute points in the given state using the specified array
   * of points as the relative points.
   */
  updatePoints(edge: EdgeState, points: Point[] | null, source: TerminalState | null, target: TerminalState | null): void {
    if (edge.absolutePoints.length > 0) {
      const pts: (Point | null)[] = [];
      pts.push(edge.absolutePoints[0]);
      const edgeStyle = this.getEdgeStyle(edge, points, source, target);

      if (edgeStyle != null) {
        const src = this.getTerminalPort(edge, source, true);
        const trg = this.getTerminalPort(edge, target, false);

        // Uses the stencil bounds for routing and restores after routing
        const srcBounds = this.updateBoundsFromStencil(src);
        const trgBounds = (src != trg) ? this.updateBoundsFromStencil(trg) : null;

        try {
          edgeStyle(edge, src, trg, points, pts);
        } finally {
          // Restores previous bounds
          if (srcBounds != null && src != null) {
            Object.assign(src, srcBounds);
          }

          if (trgBounds != null && trg != null) {
            Object.assign(trg, trgBounds);
          }
        }
      } else if (points != null) {
        for (let i = 0; i < points.length; i++) {
          if (points[i] != null) {
            const p = pt(points[i].x, points[i].y);
            pts.push(this.transformControlPoint(edge, p));
          }
        }
      }

      const tmp = edge.absolutePoints;
      pts.push(tmp[tmp.length - 1]);

      edge.absolutePoints = pts;
    }
  }

  /** Transforms the given control point to an absolute point. */
  transformControlPoint(_state: EdgeState, p: Point, ignoreScale?: boolean): Point {
    // The control points are in page space already: the origin is 0
    const orig = pt(0, 0);
    const scale = ignoreScale ? 1 : this.scale;

    return pt(scale * (p.x + this.translate.x + orig.x),
      scale * (p.y + this.translate.y + orig.y));
  }

  /**
   * Returns true if the given edge should be routed with the default loop
   * style or the loopStyle defined for the given edge. This implementation
   * returns true if the given edge is a loop and does not have connections
   * constraints associated.
   */
  isLoopStyleEnabled(edge: EdgeState, points: readonly Point[] | null, source: VertexState | null, target: VertexState | null): boolean {
    const sc = getConnectionConstraint(edge, source, true);
    const tc = getConnectionConstraint(edge, target, false);

    if ((points == null || points.length < 2) &&
      (!getValue(edge.style, 'orthogonalLoop', false) ||
        ((sc == null || sc.point == null) && (tc == null || tc.point == null)))) {
      return source != null && source == target;
    }

    return false;
  }

  /** Returns the edge style function to be used to render the given edge state. */
  getEdgeStyle(edge: EdgeState, points: readonly Point[] | null = null, source: VertexState | null = null,
    target: VertexState | null = null): EdgeStyleFunction | null {
    let edgeStyle: StyleValue | EdgeStyleFunction | null | undefined;

    if (this.isLoopStyleEnabled(edge, points, source, target)) {
      // mxGraph.defaultLoopStyle is mxEdgeStyle.Loop
      const loop = styleValue(edge.style, 'loopStyle');
      edgeStyle = loop != null ? loop : Loop;
    } else {
      edgeStyle = !getValue(edge.style, 'noEdgeStyle', false) ?
        styleValue(edge.style, 'edgeStyle') : null;
    }

    // Converts string values to objects
    if (typeof edgeStyle == 'string') {
      edgeStyle = getEdgeStyleFunction(edgeStyle);
    }

    if (typeof edgeStyle == 'function') {
      return edgeStyle;
    }

    return null;
  }

  /**
   * Updates the terminal points in the given state after the edge style was
   * computed for the edge.
   *
   * draw.io: ends edges on the copies of multiple=1 once both ends and the
   * route are known. Connection points and other perimeter points stay on
   * the front shape. Connection points with fixedPointSpacing=1 end on the
   * copies in updateFixedPointSpacing, before the spacing is applied.
   */
  updateFloatingTerminalPoints(state: EdgeState, source: TerminalState | null, target: TerminalState | null): void {
    let pts = state.absolutePoints;

    // Connected ends that were already set are fixed connection points
    const fixedSource = pts[0] != null;
    const fixedTarget = pts[pts.length - 1] != null;
    const spacing = state.style != null && getValue(state.style,
      'fixedPointSpacing', 0) == 1;

    // mxGraphView.updateFloatingTerminalPoints
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    if (pe == null && target != null) {
      this.updateFloatingTerminalPoint(state, target, source, false);
    }

    if (p0 == null && source != null) {
      this.updateFloatingTerminalPoint(state, source, target, true);
    }

    // Connected ends that were already set are fixed connection points
    if (state.style != null && getValue(state.style,
      'fixedPointSpacing', 0) == 1) {
      this.updateFixedPointSpacing(state, (p0 != null) ? source : null,
        (pe != null) ? target : null);
    }

    pts = state.absolutePoints;

    if (pts.length > 1) {
      if (!fixedSource || !spacing) {
        this.updateMultipleTerminalPoint(state, source, true, fixedSource);
      }

      if (!fixedTarget || !spacing) {
        this.updateMultipleTerminalPoint(state, target, false, fixedTarget);
      }
    }
  }

  /**
   * Moves the end of the given edge on the given terminal to where the line
   * to the next point of the edge leaves the copies of multiple=1 (see
   * getMultiplePerimeterPoint). Fixed is true if the end is a connection
   * point, which leaves the copies without the perimeter spacing of the
   * edge: with fixedPointSpacing=1, updateFixedPointSpacing calls this
   * before it applies the spacing, so that the gap starts at the outline
   * of the copies.
   */
  updateMultipleTerminalPoint(edge: EdgeState, terminal: TerminalState | null, source: boolean, fixed: boolean): void {
    const pts = edge.absolutePoints;
    let point = pts[source ? 0 : pts.length - 1];
    let next = pts[source ? 1 : pts.length - 2];

    if (!fixed) {
      terminal = this.getTerminalPort(edge, terminal, source);
    }

    if (point != null && next != null && terminal != null &&
      isVertex(terminal) &&
      getMultipleCopies(terminal.style) != null) {
      let border = 0;

      if (!fixed) {
        border = jsParseFloat(getValue(edge.style, 'perimeterSpacing', null) || 0);
        border += jsParseFloat(getValue(edge.style, source ?
          'sourcePerimeterSpacing' : 'targetPerimeterSpacing', null) || 0);
      }

      // The perimeter is not rotated (see getFloatingTerminalPoint)
      const alpha = toRadians(Number(getValue(terminal.style, 'rotation', null) || '0'));
      const center = pt(centerX(terminal), centerY(terminal));

      if (alpha != 0) {
        const cos = Math.cos(-alpha);
        const sin = Math.sin(-alpha);
        point = getRotatedPoint(point, cos, sin, center);
        next = getRotatedPoint(next, cos, sin, center);
      }

      let p = this.getMultiplePerimeterPoint(terminal, next, border, point);

      if (p != point) {
        if (alpha != 0) {
          p = getRotatedPoint(p, Math.cos(alpha), Math.sin(alpha), center);
        }

        setAbsoluteTerminalPoint(edge, p, source);
      }
    }
  }

  /**
   * Returns the given point on the perimeter of the given vertex, or the
   * point where the line from the point to next leaves the copies of
   * multiple=1 behind the vertex that cover the point, one after the
   * other, but not beyond next. The point is returned if next is not
   * outside the point. The perimeter is not rotated.
   */
  getMultiplePerimeterPoint(terminal: TerminalState, next: Point, border: number, point: Point): Point {
    const copies = getMultipleCopies(terminal.style);
    let perimeter: PerimeterFunction | null = (copies != null) ? this.getPerimeterFunction(terminal) : null;

    // Lifelines and backbones end edges on a line, which covers nothing,
    // and orthogonal perimeters project onto the rectangle
    if (perimeter == LifelinePerimeter ||
      perimeter == BackbonePerimeter) {
      perimeter = null;
    } else if (perimeter == OrthogonalPerimeter) {
      perimeter = RectanglePerimeter;
    }

    if (perimeter != null && copies != null) {
      const perim = perimeter;
      const bounds = this.getPerimeterBounds(terminal, border);
      const cx = centerX(bounds);
      const cy = centerY(bounds);
      let ux = next.x - point.x;
      let uy = next.y - point.y;
      let max = Math.sqrt(ux * ux + uy * uy);

      if (max > 0 && ux * (point.x - cx) + uy * (point.y - cy) > 0) {
        ux /= max;
        uy /= max;

        // Offset of the copies on the page in the unrotated perimeter
        const rad = toRadians(Number(getValue(terminal.style,
          'rotation', 0)));
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = (copies.dx * cos + copies.dy * sin) * this.scale;
        const dy = (copies.dy * cos - copies.dx * sin) * this.scale;
        let flipH = getValue(terminal.style, 'flipH', 0) == 1;
        let flipV = getValue(terminal.style, 'flipV', 0) == 1;

        // Legacy support for stencilFlipH/V
        if (terminal.stencil) {
          flipH = flipH || getValue(terminal.style, 'stencilFlipH', 0) == 1;
          flipV = flipV || getValue(terminal.style, 'stencilFlipV', 0) == 1;
        }

        const size = bounds.width + bounds.height;

        // A point is inside a copy if the perimeter of the copy in the
        // direction of the point is beyond the point. Perimeters intersect
        // the line from next to the center, so next is a point far away
        // in that direction, which also makes the whole units of the
        // direction in EllipsePerimeter precise enough.
        const isInside = (x: number, y: number, index: number) => {
          x -= index * dx;
          y -= index * dy;
          x = flipH ? 2 * cx - x : x;
          y = flipV ? 2 * cy - y : y;
          const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          const f = 100 * Math.max(1, size) / d;
          const p = (d > 0) ? perim(bounds, terminal, pt(
            cx + (x - cx) * f, cy + (y - cy) * f), false) : null;

          return p != null && (p.x - x) * (x - cx) + (p.y - y) * (y - cy) > 0;
        };

        let x = point.x;
        let y = point.y;

        for (let i = 1; i <= copies.count; i++) {
          let t0 = 0;
          let t1 = Math.min(size, max);

          if (isInside(x, y, i) && !isInside(x + t1 * ux, y + t1 * uy, i)) {
            // Limits the steps for huge sizes, where the precision
            // of the numbers is less than the tolerance
            for (let j = 0; j < 50 && t1 - t0 > 1e-3; j++) {
              const t = (t0 + t1) / 2;

              if (isInside(x + t * ux, y + t * uy, i)) {
                t0 = t;
              } else {
                t1 = t;
              }
            }

            // Ignores copies that only touch the point
            if (t0 > 0) {
              x += t1 * ux;
              y += t1 * uy;
              max -= t1;
            }
          }
        }

        if (x != point.x || y != point.y) {
          point = pt(x, y);
        }
      }
    }

    return point;
  }

  /**
   * Removes the waypoints of the given edge state that are equal to the point
   * before or after them. This happens if a route ends inside a terminal, eg.
   * if the terminals are closer than the jetty size or overlap, or if two
   * elbows of a route are at the same location. This is only done if
   * isDuplicatePointsRemoved returns true. The terminal points are not
   * removed.
   */
  removeDuplicatePoints(state: EdgeState, points: Point[] | null, source: TerminalState | null, target: TerminalState | null): void {
    const pts = state.absolutePoints;

    if (pts.length > 2) {
      const tol = 0.01 * this.scale;

      const equals = (a: Point | null, b: Point | null) => {
        return a != null && b != null && Math.abs(a.x - b.x) < tol &&
          Math.abs(a.y - b.y) < tol;
      };

      let duplicates = false;

      for (let i = 1; i < pts.length && !duplicates; i++) {
        duplicates = equals(pts[i - 1], pts[i]);
      }

      if (duplicates && isDuplicatePointsRemoved(
        this.getEdgeStyle(state, points, source, target), points)) {
        for (let i = pts.length - 2; i > 0 && pts.length > 2; i--) {
          if (equals(pts[i], pts[i + 1]) || equals(pts[i], pts[i - 1])) {
            pts.splice(i, 1);
          }
        }
      }
    }
  }

  /**
   * Keeps a pixel of the view instead of a screen pixel of a segment that is
   * shortened by the spacing at fixed points. Routes are kept in model units
   * in model coordinates, where the pixel is a model unit, so that the ends
   * do not depend on the scale of the validation (getPixelSize is 1 on the
   * old path, so it is unchanged). The ends first leave the copies of
   * multiple=1 of their terminals, so that the spacing is kept from the
   * outline of the copies (see updateFloatingTerminalPoints).
   *
   * Moves the source and/or target end of the given edge state, which are
   * attached to fixed connection points, by sourcePerimeterSpacing and
   * targetPerimeterSpacing towards the neighbouring point of the route.
   * Negative values move the end away from that point along the same line.
   * An end is never moved past its neighbouring point.
   */
  updateFixedPointSpacing(state: EdgeState, source: TerminalState | null, target: TerminalState | null): void {
    if (source != null) {
      this.updateMultipleTerminalPoint(state, source, true, true);
    }

    if (target != null) {
      this.updateMultipleTerminalPoint(state, target, false, true);
    }

    const pts = state.absolutePoints;
    const n = pts.length;

    if (n > 1 && pts[0] != null && pts[n - 1] != null) {
      const scale = this.scale;

      const getSpacing = (key: string) => {
        const value = jsParseFloat(getValue(state.style, key, null) || 0);

        return (Number.isNaN(value) || !Number.isFinite(value)) ? 0 : value * scale;
      };

      // Returns the index of the first point that differs from the end
      const getNeighbour = (index: number, step: number) => {
        const p = pts[index]!;

        for (let i = index + step; i >= 0 && i < n; i += step) {
          const q = pts[i];

          if (q != null && (q.x != p.x || q.y != p.y)) {
            return i;
          }
        }

        return -1;
      };

      const p0 = pts[0]!;
      const pe = pts[n - 1]!;
      let ds = source ? getSpacing('sourcePerimeterSpacing') : 0;
      let dt = target ? getSpacing('targetPerimeterSpacing') : 0;
      const ns = (ds != 0) ? getNeighbour(0, 1) : -1;
      const nt = (dt != 0) ? getNeighbour(n - 1, -1) : -1;

      // Neighbours are taken before any end is moved
      const qs = (ns >= 0) ? pts[ns] : null;
      const qt = (nt >= 0) ? pts[nt] : null;
      const ls = (qs != null) ? Math.sqrt((qs.x - p0.x) * (qs.x - p0.x) +
        (qs.y - p0.y) * (qs.y - p0.y)) : 0;
      const lt = (qt != null) ? Math.sqrt((qt.x - pe.x) * (qt.x - pe.x) +
        (qt.y - pe.y) * (qt.y - pe.y)) : 0;

      // Clamps to the segment and splits a segment that is shared by both ends,
      // keeping a pixel of the segment so that the direction of markers is defined
      const px = this.getPixelSize();
      const ms = Math.max(0, ls - px);
      ds = Math.min(ds, ms);
      dt = Math.min(dt, Math.max(0, lt - px));

      if (ns == n - 1 && nt == 0 && ds > 0 && dt > 0 && ds + dt > ms) {
        const f = ms / (ds + dt);
        ds *= f;
        dt *= f;
      }

      if (qs != null && ds != 0) {
        setAbsoluteTerminalPoint(state, pt(
          p0.x + (qs.x - p0.x) * ds / ls,
          p0.y + (qs.y - p0.y) * ds / ls), true);
      }

      if (qt != null && dt != 0) {
        setAbsoluteTerminalPoint(state, pt(
          pe.x + (qt.x - pe.x) * dt / lt,
          pe.y + (qt.y - pe.y) * dt / lt), false);
      }
    }
  }

  /**
   * Updates the absolute terminal point in the given state for the given
   * start and end state, where start is the source if source is true.
   *
   * draw.io: adds support for snapToPoint style.
   */
  updateFloatingTerminalPoint(edge: EdgeState, start: TerminalState, end: TerminalState | null, source: boolean): void {
    if (start != null && edge != null &&
      (start.style['snapToPoint'] == '1' ||
        edge.style['snapToPoint'] == '1')) {
      const p = this.getFloatingTerminalPoint(edge, start, end, source);
      const port = this.getTerminalPort(edge, start, source) as TerminalState;
      setAbsoluteTerminalPoint(edge, this.snapToAnchorPoint(edge, port, end, source, p), source);
    } else {
      setAbsoluteTerminalPoint(edge, this.getFloatingTerminalPoint(edge, start, end, source), source);
    }
  }

  snapToAnchorPoint(edge: EdgeState, start: TerminalState | null, _end: TerminalState | null, _source: boolean, p: Point | null): Point | null {
    if (start != null && edge != null && p != null) {
      const constraints = getAllConnectionConstraints(start);
      let nearest: Point | null = null;
      let dist: number | null = null;

      // Routes are kept in model units in model coordinates, so the points
      // are rounded and compared in model units instead of screen pixels
      // to not depend on the scale of the validation
      const s = this.scale;
      const tr = this.translate;

      if (constraints != null) {
        for (let i = 0; i < constraints.length; i++) {
          const cp = this.getConnectionPoint(start, constraints[i], false);

          if (cp != null) {
            cp.x = roundScaled(cp.x, s, tr.x);
            cp.y = roundScaled(cp.y, s, tr.y);

            let tmp = (cp.x - p.x) * (cp.x - p.x) + (cp.y - p.y) * (cp.y - p.y);
            tmp = unscale(tmp, s * s);

            if (dist == null || tmp < dist) {
              nearest = cp;
              dist = tmp;
            }
          }
        }
      }

      if (nearest != null) {
        p = nearest;
      }
    }

    return p;
  }

  /**
   * Returns the floating terminal point for the given edge, start and end
   * state, where start is the source if source is true.
   */
  getFloatingTerminalPoint(edge: EdgeState, start: TerminalState, end: TerminalState | null, source: boolean): Point | null {
    const port = this.getTerminalPort(edge, start, source) as TerminalState;
    let next = this.getNextPoint(edge, end, source);

    const orth = this.isOrthogonal(edge);
    const rotation = Number(getValue(port.style, 'rotation', null) || '0');
    const alpha = toRadians(rotation);
    const center = pt(centerX(port), centerY(port));

    // Quarter turns keep vertical and horizontal lines, so orthogonal ends
    // are projected onto the unrotated shape (with exact sines and cosines)
    const quarter = rotation % 90 == 0;

    if (alpha != 0 && next != null) {
      let cos = Math.cos(-alpha);
      let sin = Math.sin(-alpha);

      if (quarter) {
        cos = Math.round(cos);
        sin = Math.round(sin);
      }

      next = getRotatedPoint(next, cos, sin, center);
    }

    let border = jsParseFloat(getValue(edge.style, 'perimeterSpacing', null) || 0);
    border += jsParseFloat(getValue(edge.style, source ?
      'sourcePerimeterSpacing' :
      'targetPerimeterSpacing', null) || 0);
    let p = this.getPerimeterPoint(port, next, quarter && orth, border);

    if (alpha != 0 && p != null) {
      let cos = Math.cos(alpha);
      let sin = Math.sin(alpha);

      if (quarter) {
        cos = Math.round(cos);
        sin = Math.round(sin);
      }

      p = getRotatedPoint(p, cos, sin, center);
    }

    return p;
  }

  /**
   * Returns the state that represents the source or target terminal or
   * port for the given edge (the cell that sourcePort/targetPort names).
   */
  getTerminalPort(state: EdgeState, terminal: TerminalState | null, source: boolean): TerminalState | null {
    const key = source ? 'sourcePort' : 'targetPort';
    const id = styleValue(state.style, key);

    if (id != null && this.resolvePort != null) {
      const view = this.resolvePort(String(id));
      const tmp = view != null ? this.getState(view) : null;

      // Only uses ports where a cell state exists
      if (tmp != null) {
        terminal = tmp;
      }
    }

    return terminal;
  }

  /**
   * Returns the point where the perimeter of the terminal meets the line
   * between its center and the given point (or the orthogonal projection).
   *
   * terminal - the source or target terminal.
   * next - point that lies outside of the given terminal.
   * orthogonal - Boolean that specifies if the orthogonal projection onto
   * the perimeter should be returned. If this is false then the intersection
   * of the perimeter and the line between the next and the center point is
   * returned.
   * border - Optional border between the perimeter and the shape.
   */
  getPerimeterPoint(terminal: VertexState | null, next: Point | null, orthogonal: boolean, border?: number): Point | null {
    let point: Point | null = null;

    if (terminal != null) {
      const perimeter = this.getPerimeterFunction(terminal);

      if (perimeter != null && next != null) {
        const bounds = this.getPerimeterBounds(terminal, border);

        if (bounds.width > 0 || bounds.height > 0) {
          point = pt(next.x, next.y);
          let flipH = false;
          let flipV = false;

          if (isVertex(terminal)) {
            flipH = getValue(terminal.style, 'flipH', 0) == 1;
            flipV = getValue(terminal.style, 'flipV', 0) == 1;

            // Legacy support for stencilFlipH/V
            if (terminal.stencil) {
              flipH = (getValue(terminal.style, 'stencilFlipH', 0) == 1) || flipH;
              flipV = (getValue(terminal.style, 'stencilFlipV', 0) == 1) || flipV;
            }

            if (flipH) {
              point.x = 2 * centerX(bounds) - point.x;
            }

            if (flipV) {
              point.y = 2 * centerY(bounds) - point.y;
            }
          }

          point = perimeter(bounds, terminal, point, orthogonal);

          if (point != null) {
            if (flipH) {
              point.x = 2 * centerX(bounds) - point.x;
            }

            if (flipV) {
              point.y = 2 * centerY(bounds) - point.y;
            }
          }

          point = this.getLabelPerimeterPoint(terminal, next, orthogonal, bounds, point);
        }
      }

      if (point == null) {
        // getPoint(terminal) of a vertex is its center
        point = pt(centerX(terminal), centerY(terminal));
      }
    }

    return point;
  }

  /**
   * Returns the side of the given vertex where its label is placed outside the
   * shape and reaches beyond it, if the vertex has labelPerimeter=1: one of
   * north, south, east and west, or null. Labels in a corner, rotated and
   * flipped vertices and vertices without a painted label return null.
   */
  getLabelPerimeterSide(state: TerminalState): string | null {
    let side: string | null = null;

    if (this.isLabelPerimeter(state)) {
      const bb = state.labelBox;
      const lp = getValue(state.style, 'labelPosition', 'center');
      const vlp = getValue(state.style, 'verticalLabelPosition', 'middle');

      if (bb == null) {
        // No painted label
      } else if (lp == 'center') {
        if (vlp == 'bottom' && bb.y + bb.height > state.y + state.height) {
          side = DIRECTION_SOUTH;
        } else if (vlp == 'top' && bb.y < state.y) {
          side = DIRECTION_NORTH;
        }
      } else if (vlp == 'middle') {
        if (lp == 'right' && bb.x + bb.width > state.x + state.width) {
          side = 'east';
        } else if (lp == 'left' && bb.x < state.x) {
          side = DIRECTION_WEST;
        }
      }
    }

    return side;
  }

  /** Returns true if the given state is a vertex with labelPerimeter=1 that is neither rotated nor flipped. */
  isLabelPerimeter(state: VertexState): boolean {
    return state != null && state.style != null &&
      isVertex(state) &&
      getValue(state.style, 'labelPerimeter', 0) == 1 &&
      getValue(state.style, 'rotation', 0) == 0 &&
      getValue(state.style, 'flipH', 0) != 1 &&
      getValue(state.style, 'flipV', 0) != 1 &&
      getValue(state.style, 'stencilFlipH', 0) != 1 &&
      getValue(state.style, 'stencilFlipV', 0) != 1;
  }

  /**
   * Returns the given perimeter point of the given terminal, or the point
   * where the edge meets the label of the terminal first if the terminal has
   * labelPerimeter=1 and its label is placed outside the shape (see
   * getLabelPerimeterSide): if the segment from the next point to the
   * perimeter point crosses the label, the edge ends where it enters the
   * label, so it never crosses it. A fixed connection point on the side of
   * the label (the next point on that side of the shape, within the label)
   * ends at the far edge of the label straight out from the shape.
   */
  getLabelPerimeterPoint(terminal: TerminalState, next: Point, _orthogonal: boolean, bounds: Rect, point: Point | null): Point | null {
    const side = (point != null && next != null) ? this.getLabelPerimeterSide(terminal) : null;

    if (side != null && point != null && terminal.labelBox != null) {
      // Keeps the perimeter spacing of the terminal between the edge and the label
      const spacing = Math.max(0, terminal.x - bounds.x);
      const bb = terminal.labelBox;
      const x0 = bb.x - spacing, y0 = bb.y - spacing;
      const x1 = bb.x + bb.width + spacing, y1 = bb.y + bb.height + spacing;
      const edges = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1]];
      let hit: Point | null = null;
      let dist: number | null = null;

      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const p = intersection(next.x, next.y, point.x, point.y, e[0], e[1], e[2], e[3]);

        if (p != null) {
          const d = (p.x - next.x) * (p.x - next.x) + (p.y - next.y) * (p.y - next.y);

          if (dist == null || d < dist) {
            hit = p;
            dist = d;
          }
        }
      }

      // A fixed connection point on the side of the label, where the next
      // point is the point on that side of the perimeter bounds. Other next
      // points in the label, such as the last bend of a route, keep the
      // perimeter point, as the end would be past the bend.
      if (hit == null) {
        const tol = 1;
        const right = bounds.x + bounds.width;
        const bottom = bounds.y + bounds.height;
        const inX = next.x >= bounds.x - tol && next.x <= right + tol && next.x > x0 && next.x < x1;
        const inY = next.y >= bounds.y - tol && next.y <= bottom + tol && next.y > y0 && next.y < y1;

        if (side == DIRECTION_SOUTH && inX && Math.abs(next.y - bottom) <= tol) {
          hit = pt(next.x, y1);
        } else if (side == DIRECTION_NORTH && inX && Math.abs(next.y - bounds.y) <= tol) {
          hit = pt(next.x, y0);
        } else if (side == 'east' && inY && Math.abs(next.x - right) <= tol) {
          hit = pt(x1, next.y);
        } else if (side == DIRECTION_WEST && inY && Math.abs(next.x - bounds.x) <= tol) {
          hit = pt(x0, next.y);
        }
      }

      if (hit != null) {
        point = hit;
      }
    }

    return point;
  }

  /** Returns the x-coordinate of the center point for automatic routing. */
  getRoutingCenterX(state: VertexState): number {
    const f = (state.style != null) ? jsParseFloat(getValue(state.style, 'routingCenterX', undefined)) || 0 : 0;

    return centerX(state) + f * state.width;
  }

  /** Returns the y-coordinate of the center point for automatic routing. */
  getRoutingCenterY(state: VertexState): number {
    const f = (state.style != null) ? jsParseFloat(getValue(state.style, 'routingCenterY', undefined)) || 0 : 0;

    return centerY(state) + f * state.height;
  }

  /**
   * Returns the bounds of the outline as painted for clouds, for polygons
   * with a rounded perimeter and for vertices with an outline perimeter, as
   * their bumps, rounded corners and outlines do not reach the bounds. A
   * waypoint level with the top, bottom or sides of the bounds then gets a
   * bend and an end at a right angle on the shape (see SegmentConnector)
   * instead of an end that misses the shape. Returns the given state if the
   * channel is its bounds.
   */
  getChannelBounds(state: VertexState): Rect {
    const perimeter = (state != null && isVertex(state) && state.style != null &&
      getValue(state.style, 'rotation', 0) == 0) ?
      this.getPerimeterFunction(state) : null;

    if (perimeter != null && (perimeter == CloudPerimeter ||
      perimeter == roundedPolygonPerimeter || perimeter == OutlinePerimeter)) {
      const bounds = cloneRect(state);
      const outline = (perimeter == OutlinePerimeter) ?
        (state.perimeterOutline != null ? state.perimeterOutline(bounds) : null) :
        (state.outline != null ? state.outline(bounds) : null);
      const b = getOutlineBounds(outline);

      if (b != null) {
        let x0 = b.x;
        let y0 = b.y;
        let x1 = b.x + b.width;
        let y1 = b.y + b.height;

        // Flips are applied to the outline as in getPerimeterPoint
        if (getValue(state.style, 'flipH', 0) == 1) {
          const tmp = x0;
          x0 = 2 * centerX(state) - x1;
          x1 = 2 * centerX(state) - tmp;
        }

        if (getValue(state.style, 'flipV', 0) == 1) {
          const tmp = y0;
          y0 = 2 * centerY(state) - y1;
          y1 = 2 * centerY(state) - tmp;
        }

        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      }
    }

    return state;
  }

  /**
   * Returns the perimeter bounds for the given terminal: its box (the box a
   * fixed-aspect stencil fills), grown by the border and the terminal's
   * perimeterSpacing.
   */
  getPerimeterBounds(terminal: VertexState, border?: number | null): Rect {
    let b = border != null ? border : 0;

    if (terminal != null) {
      b += jsParseFloat(getValue(terminal.style, 'perimeterSpacing', null) || 0);
    }

    // mxCellState.getPerimeterBounds (border || 0 also drops NaN)
    const amount = (b * this.scale) || 0;
    const bounds = cloneRect(terminal);
    const aspect = (terminal as TerminalState).stencilAspect;

    if (aspect != null) {
      const direction = terminal.style['direction'];
      const inverse = direction == DIRECTION_NORTH || direction == DIRECTION_SOUTH;
      const sw = inverse ? aspect.height : aspect.width;
      const sh = inverse ? aspect.width : aspect.height;
      const s = Math.min(bounds.width / sw, bounds.height / sh);

      bounds.x += (bounds.width - sw * s) / 2;
      bounds.y += (bounds.height - sh * s) / 2;
      bounds.width = sw * s;
      bounds.height = sh * s;
    }

    if (amount != 0) {
      grow(bounds, amount);
    }

    return bounds;
  }

  /** Returns the perimeter function for the given state (with draw.io's rounded perimeters). */
  getPerimeterFunction(state: VertexState): PerimeterFunction | null {
    return getPerimeterFunction(state);
  }

  /**
   * Returns the nearest point in the list of absolute points or the center
   * of the opposite terminal.
   */
  getNextPoint(edge: EdgeState, opposite: TerminalState | null, source: boolean): Point | null {
    const pts = edge.absolutePoints;
    let point: Point | null = null;

    if (pts != null && pts.length >= 2) {
      const count = pts.length;
      point = pts[source ? Math.min(1, count - 1) : Math.max(0, count - 2)];
    }

    if (point == null && opposite != null) {
      point = pt(centerX(opposite), centerY(opposite));
    }

    return point;
  }

  /**
   * mxGraph.isOrthogonal with the isometric override of Shapes.js: true if
   * perimeter points should be computed such that the resulting edge has
   * only horizontal or vertical segments.
   */
  isOrthogonal(edge: EdgeState): boolean {
    const orthogonal = styleValue(edge.style, 'orthogonal');
    let result: boolean;

    if (orthogonal != null) {
      result = Boolean(orthogonal);
    } else {
      result = isOrthogonalEdgeStyle(this.getEdgeStyle(edge));
    }

    return result && this.getEdgeStyle(edge) != IsometricConnector;
  }

  // --- Graph.getConnectionPoint ----------------------------------------------------

  /**
   * Returns the point for the given connection constraint on the given
   * terminal (Graph.getConnectionPoint): perimeter points on rounded
   * rectangles with roundedPerimeter=1 and on the sides of vertices with
   * perimeter=outlinePerimeter are moved onto the outline after they were
   * computed on the bounds; legacyAnchorPoints (default 1) rotates and flips
   * in draw.io's legacy order.
   */
  getConnectionPoint(vertex: TerminalState | null, constraint: Constraint, round?: boolean | null): Point | null {
    let point: Point | null = null;

    // Perimeter points on rounded rectangles with roundedPerimeter=1 and
    // on the sides of vertices with perimeter=outlinePerimeter are moved
    // onto the outline after they were computed on the bounds
    const outline = this.isOutlineSidePoint(vertex, constraint);
    const rounded = !outline && this.isRoundedPerimeterPoint(vertex, constraint);
    const r = (rounded || outline) ? false : round;

    // Legacy support for anchor points where the order of rotation and flipping
    // is different from the way shapes are drawn (this is the default)
    if (vertex != null && getValue(vertex.style, 'legacyAnchorPoints', 1) == 1) {
      point = this.getLegacyConnectionPoint(vertex, constraint, r);
    } else {
      point = this.getMxConnectionPoint(vertex, constraint, r);
    }

    if ((rounded || outline) && point != null && vertex != null) {
      point = rounded ? this.getRoundedPerimeterPoint(vertex, point) :
        this.getOutlineSidePoint(vertex, point);

      if (round == null || round) {
        point = pt(Math.round(point.x), Math.round(point.y));
      }
    }

    return point;
  }

  /**
   * mxGraph.getConnectionPoint: flips, then the direction, then the
   * perimeter, then the rotation.
   */
  getMxConnectionPoint(vertex: TerminalState | null, constraint: Constraint, round?: boolean | null): Point | null {
    const rnd = round != null ? round : true;
    let point: Point | null = null;

    if (vertex != null && constraint.point != null) {
      const bounds = this.getPerimeterBounds(vertex);
      const direction = vertex.style['direction'];
      const cx = pt(centerX(bounds), centerY(bounds));
      const scale = this.scale;

      // Bounds need to be rotated by 90 degrees for further computation
      if (direction == DIRECTION_NORTH ||
        direction == DIRECTION_SOUTH) {
        rotate90(bounds);
      }

      point = pt(bounds.x + constraint.point.x * bounds.width + constraint.dx * scale,
        bounds.y + constraint.point.y * bounds.height + constraint.dy * scale);

      // Horizontal and vertical shape flipping
      if (isVertex(vertex)) {
        let flipH = getValue(vertex.style, 'flipH', null) == 1;
        let flipV = getValue(vertex.style, 'flipV', null) == 1;

        // Legacy support for stencilFlipH/V
        if (vertex.stencil) {
          flipH = (getValue(vertex.style, 'stencilFlipH', 0) == 1) || flipH;
          flipV = (getValue(vertex.style, 'stencilFlipV', 0) == 1) || flipV;
        }

        if (direction == DIRECTION_NORTH ||
          direction == DIRECTION_SOUTH) {
          const temp = flipH;
          flipH = flipV;
          flipV = temp;
        }

        if (flipH) {
          point.x = 2 * centerX(bounds) - point.x;
        }

        if (flipV) {
          point.y = 2 * centerY(bounds) - point.y;
        }
      }

      // Shape direction
      let r1 = 0;

      // Bounds need to be rotated by 90 degrees for further computation
      if (direction != null && getValue(vertex.style,
        'anchorPointDirection', 1) == 1) {
        if (direction == DIRECTION_NORTH) {
          r1 += 270;
        } else if (direction == DIRECTION_WEST) {
          r1 += 180;
        } else if (direction == DIRECTION_SOUTH) {
          r1 += 90;
        }
      }

      // Only 90 degrees steps possible here so no trig needed
      if (r1 != 0) {
        let cos = 0;
        let sin = 0;

        if (r1 == 90) {
          sin = 1;
        } else if (r1 == 180) {
          cos = -1;
        } else if (r1 == 270) {
          sin = -1;
        }

        point = getRotatedPoint(point, cos, sin, cx);
      }

      // Projection on perimeter
      if (constraint.perimeter) {
        point = this.getPerimeterPoint(vertex, point, false);
      }

      // General shape rotation
      const r2 = Number(getValue(vertex.style, 'rotation', null) || 0);

      if (r2 != 0 && point != null) {
        const rad = toRadians(r2);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        point = getRotatedPoint(point, cos, sin, cx);
      }
    }

    // Optional rounding of result
    if (rnd && point != null) {
      point = pt(Math.round(point.x), Math.round(point.y));
    }

    return point;
  }

  /** Graph.getLegacyConnectionPoint: returns the connection point using the legacy method. */
  getLegacyConnectionPoint(vertex: TerminalState | null, constraint: Constraint, round?: boolean | null): Point | null {
    const rnd = round != null ? round : true;
    let point: Point | null = null;

    if (vertex != null && constraint.point != null) {
      const bounds = this.getPerimeterBounds(vertex);
      const cx = pt(centerX(bounds), centerY(bounds));
      const direction = vertex.style['direction'];
      let r1 = 0;

      // Bounds need to be rotated by 90 degrees for further computation
      if (direction != null && getValue(vertex.style,
        'anchorPointDirection', 1) == 1) {
        if (direction == DIRECTION_NORTH) {
          r1 += 270;
        } else if (direction == DIRECTION_WEST) {
          r1 += 180;
        } else if (direction == DIRECTION_SOUTH) {
          r1 += 90;
        }

        // Bounds need to be rotated by 90 degrees for further computation
        if (direction == DIRECTION_NORTH ||
          direction == DIRECTION_SOUTH) {
          rotate90(bounds);
        }
      }

      const scale = this.scale;
      point = pt(bounds.x + constraint.point.x * bounds.width + constraint.dx * scale,
        bounds.y + constraint.point.y * bounds.height + constraint.dy * scale);

      // Rotation for direction before projection on perimeter
      let r2 = Number(getValue(vertex.style, 'rotation', null) || 0);

      if (constraint.perimeter) {
        if (r1 != 0) {
          // Only 90 degrees steps possible here so no trig needed
          let cos = 0;
          let sin = 0;

          if (r1 == 90) {
            sin = 1;
          } else if (r1 == 180) {
            cos = -1;
          } else if (r1 == 270) {
            sin = -1;
          }

          point = getRotatedPoint(point, cos, sin, cx);
        }

        point = this.getPerimeterPoint(vertex, point, false);
      } else {
        r2 += r1;

        if (isVertex(vertex)) {
          let flipH = getValue(vertex.style, 'flipH', null) == 1;
          let flipV = getValue(vertex.style, 'flipV', null) == 1;

          // Legacy support for stencilFlipH/V
          if (vertex.stencil) {
            flipH = (getValue(vertex.style, 'stencilFlipH', 0) == 1) || flipH;
            flipV = (getValue(vertex.style, 'stencilFlipV', 0) == 1) || flipV;
          }

          if (direction == DIRECTION_NORTH ||
            direction == DIRECTION_SOUTH) {
            const temp = flipH;
            flipH = flipV;
            flipV = temp;
          }

          if (flipH) {
            point.x = 2 * centerX(bounds) - point.x;
          }

          if (flipV) {
            point.y = 2 * centerY(bounds) - point.y;
          }
        }
      }

      // Generic rotation after projection on perimeter
      if (r2 != 0 && point != null) {
        const rad = toRadians(r2);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        point = getRotatedPoint(point, cos, sin, cx);
      }
    }

    if (rnd && point != null) {
      point = pt(Math.round(point.x), Math.round(point.y));
    }

    return point;
  }

  /**
   * Returns true if the given constraint on the given vertex resolves on the
   * rounded outline: the constraint is projected on the perimeter and the vertex
   * has a rounded perimeter (see isRoundedPerimeter). Fixed points (perimeter=0)
   * are not affected.
   */
  isRoundedPerimeterPoint(vertex: TerminalState | null, constraint: Constraint): boolean {
    return constraint != null && constraint.point != null &&
      constraint.perimeter && isRoundedPerimeter(vertex);
  }

  /**
   * Returns the nearest point on the rounded outline of the given vertex for
   * the given point on its perimeter. Points on the straight parts are
   * returned unchanged, corner points move onto the arc at 45 degrees. The arc
   * radius is computed as in mxRectangleShape.paintBackground, the perimeter
   * spacing is added to it and the rotation of the vertex is taken into account.
   */
  getRoundedPerimeterPoint(vertex: TerminalState, point: Point): Point {
    const bounds = this.getPerimeterBounds(vertex);
    const radius = getRoundedPerimeterArcSize(vertex, bounds);

    if (radius > 0) {
      const cx = pt(centerX(bounds), centerY(bounds));
      const rot = toRadians(Number(getValue(vertex.style, 'rotation', 0)));
      let p = (rot != 0) ? getRotatedPoint(point, Math.cos(-rot), Math.sin(-rot), cx) : point;

      // The perimeter returns the point on the arc on the ray from the centre
      // (see roundedRectanglePerimeter) so the point on the bounds is restored
      p = RectanglePerimeter(bounds, vertex, p, false) as Point;
      const arc = getRoundedPerimeterArcCenter(bounds, radius, p);

      if (arc != null) {
        // Radial projection onto the arc
        const dx = p.x - arc.x;
        const dy = p.y - arc.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        p = pt(arc.x + dx * radius / d, arc.y + dy * radius / d);

        return (rot != 0) ? getRotatedPoint(p, Math.cos(rot), Math.sin(rot), cx) : p;
      }
    }

    return point;
  }

  /**
   * Returns true if the given constraint is projected on the perimeter, lies
   * on one side of the bounds and not in a corner or beyond the bounds, and
   * the given vertex has an outline perimeter (see getOutlineSidePoint).
   */
  isOutlineSidePoint(vertex: TerminalState | null, constraint: Constraint): boolean {
    const p = (constraint != null && constraint.perimeter &&
      isOutlinePerimeter(vertex)) ? constraint.point : null;

    return p != null && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 &&
      ((p.x == 0 || p.x == 1) != (p.y == 0 || p.y == 1));
  }

  /**
   * Returns the point on the outline of the given vertex along the normal of
   * the side of the bounds that the given perimeter point is projected from,
   * so that an orthogonal edge that leaves the side ends on the outline
   * without a bend. The perimeter projects points on the ray from the centre,
   * so the point on the bounds is restored as in getRoundedPerimeterPoint and
   * moved outside the side to use the axis of the orthogonal projection (see
   * OutlinePerimeter). Corners are returned unchanged.
   */
  getOutlineSidePoint(vertex: TerminalState, point: Point): Point {
    const bounds = this.getPerimeterBounds(vertex);
    const cx = pt(centerX(bounds), centerY(bounds));
    const rot = toRadians(Number(getValue(vertex.style, 'rotation', 0)));
    let p = (rot != 0) ? getRotatedPoint(point, Math.cos(-rot), Math.sin(-rot), cx) : point;
    p = RectanglePerimeter(bounds, vertex, p, false) as Point;

    const dx = (p.x <= bounds.x) ? -1 : ((p.x >= bounds.x + bounds.width) ? 1 : 0);
    const dy = (p.y <= bounds.y) ? -1 : ((p.y >= bounds.y + bounds.height) ? 1 : 0);

    if ((dx != 0) != (dy != 0)) {
      const q = this.getPerimeterPoint(vertex, pt(p.x + dx, p.y + dy), true) as Point;
      point = (rot != 0) ? getRotatedPoint(q, Math.cos(rot), Math.sin(rot), cx) : q;
    }

    return point;
  }
}

/**
 * mxGraph.getConnectionConstraint: the connection point that the edge style
 * gives for the source (exitX/exitY/exitDx/exitDy/exitPerimeter) or target
 * (entry…) end. The point is null if the end floats.
 */
function getConnectionConstraint(edge: { style: Style }, _terminal: VertexState | null, source: boolean): Constraint {
  let point: Point | null = null;
  const x = styleValue(edge.style, source ? 'exitX' : 'entryX');

  if (x != null) {
    const y = styleValue(edge.style, source ? 'exitY' : 'entryY');

    if (y != null) {
      point = pt(jsParseFloat(x), jsParseFloat(y));
    }
  }

  let perimeter: StyleValue | boolean = false;
  let dx = 0, dy = 0;

  if (point != null) {
    perimeter = getValue(edge.style, source ? 'exitPerimeter' :
      'entryPerimeter', true);

    //Add entry/exit offset
    dx = jsParseFloat(styleValue(edge.style, source ? 'exitDx' : 'entryDx'));
    dy = jsParseFloat(styleValue(edge.style, source ? 'exitDy' : 'entryDy'));

    dx = Number.isFinite(dx) ? dx : 0;
    dy = Number.isFinite(dy) ? dy : 0;
  }

  return makeConstraint(point, perimeter, dx, dy);
}

/** new mxConnectionConstraint(point, perimeter, null, dx, dy) */
function makeConstraint(point: Point | null, perimeter: unknown, dx: unknown, dy: unknown): Constraint {
  return {
    point,
    // Only the truthiness of the perimeter flag is ever read
    perimeter: perimeter != null ? Boolean(perimeter) : true,
    dx: dx ? Number(dx) : 0,
    dy: dy ? Number(dy) : 0,
  };
}

function toConstraint(c: ConnectionConstraint): Constraint {
  return makeConstraint(pt(c.x, c.y), c.perimeter, c.dx, c.dy);
}

/**
 * Graph.getAllConnectionConstraints: the connection points of a terminal,
 * from its `points` style (an array of [x, y, perimeter (0 or 1), dx, dy]),
 * or the shape's own.
 */
function getAllConnectionConstraints(terminal: TerminalState): Constraint[] | null {
  const constraints = getValue(terminal.style, 'points', null);

  if (constraints != null) {
    // Requires an array of arrays with x, y (0..1), an optional
    // [perimeter (0 or 1), dx, and dy] eg. points=[[0,0,1,-10,10],[0,1,0],[1,1]]
    const result: Constraint[] = [];

    try {
      const c = JSON.parse(String(constraints)) as unknown[][];

      for (let i = 0; i < c.length; i++) {
        const tmp = c[i];
        result.push(makeConstraint(pt(tmp[0] as number, tmp[1] as number), (tmp.length > 2) ? tmp[2] != '0' : true,
          (tmp.length > 3) ? tmp[3] : 0, (tmp.length > 4) ? tmp[4] : 0));
      }
    } catch {
      // ignore
    }

    return result;
  } else if (terminal.constraints != null) {
    return terminal.constraints.map(toConstraint);
  }

  return null;
}

// --- public API: routing ---------------------------------------------------------

/**
 * The absolute route of an edge, as draw.io computes mxCellState.absolutePoints
 * (mxGraphView.updateEdgeState): the first and last points are the terminal
 * points, the ones between are the routed bends or the waypoints. Returns []
 * for an edge draw.io would not draw (an end with neither a terminal nor a
 * terminal point).
 */
export function routeEdge(edge: EdgeView): Point[] {
  const view = new RouteView(edge.gridSize ?? 10, edge.resolvePort ?? null);
  const source = view.getState(edge.source);
  const target = view.getState(edge.target);

  // This will remove edges with no terminals and no terminal points
  // as such edges are invalid and produce NPEs in the edge styles.
  if ((source == null && edge.sourcePoint == null) ||
    (target == null && edge.targetPoint == null)) {
    return [];
  }

  const state: EdgeState & { terminalPoints: [Point | null, Point | null] } = {
    style: edge.style,
    absolutePoints: [],
    view,
    terminalPoints: [edge.sourcePoint ?? null, edge.targetPoint ?? null],
  };
  const points = edge.points != null ? edge.points.map((p) => pt(p.x, p.y)) : null;

  view.updateEdgeState(state, points, source, target);

  const pts = state.absolutePoints;

  // This will remove edges with invalid points from the list of states in the view.
  // Happens if the one of the terminals and the corresponding terminal point is null.
  if (pts.length < 2 || pts[0] == null || pts[pts.length - 1] == null) {
    return [];
  }

  return pts.filter((p): p is Point => p != null).map((p) => pt(p.x, p.y));
}

/**
 * The point where an edge leaves the terminal towards `next`
 * (mxGraphView.getPerimeterPoint): the terminal's perimeter in its unrotated
 * frame, with flips, perimeterSpacing (+ border) and labelPerimeter. Falls
 * back to the center for a terminal without a perimeter.
 */
export function perimeterPoint(terminal: TerminalView, next: Point, orthogonal: boolean, border?: number): Point | null {
  const view = new RouteView();
  return view.getPerimeterPoint(view.getState(terminal), next, orthogonal, border);
}

/**
 * The page-space point of a connection constraint on a terminal
 * (Graph.getConnectionPoint, as getFixedTerminalPoint calls it: not rounded
 * unless asked): fractions of the perimeter bounds plus dx/dy, turned for
 * the direction, flipped, projected onto the perimeter unless
 * perimeter=false, then rotated with the terminal.
 */
export function connectionPoint(terminal: TerminalView, constraint: ConnectionConstraint, round = false): Point | null {
  const view = new RouteView();
  return view.getConnectionPoint(view.getState(terminal), toConstraint(constraint), round);
}

/**
 * The connection constraint an edge style gives for one end (exitX/exitY/
 * exitDx/exitDy/exitPerimeter for the source, entry… for the target), or
 * null if the end floats.
 */
export function edgeConstraint(style: Style, source: boolean): ConnectionConstraint | null {
  const c = getConnectionConstraint({ style }, null, source);
  return c.point != null ? { x: c.point.x, y: c.point.y, perimeter: c.perimeter, dx: c.dx, dy: c.dy } : null;
}

/**
 * The connection points of a terminal (Graph.getAllConnectionConstraints):
 * its `points` style, else `terminal.constraints`, else null.
 */
export function terminalConstraints(terminal: TerminalView): ConnectionConstraint[] | null {
  const all = getAllConnectionConstraints(terminalState(terminal));
  return all == null ? null : all.filter((c) => c.point != null)
    .map((c) => ({ x: c.point!.x, y: c.point!.y, perimeter: c.perimeter, dx: c.dx, dy: c.dy }));
}

/**
 * True if draw.io projects the ends of this edge orthogonally
 * (mxGraph.isOrthogonal: the `orthogonal` style, else an orthogonal edge style).
 */
export function isOrthogonalEdge(style: Style): boolean {
  const view = new RouteView();
  return view.isOrthogonal({ style, absolutePoints: [], view });
}

/** The edge style function the style names (edgeStyle, or noEdgeStyle=1 for none). */
export function edgeStyleOf(style: Style): EdgeStyleFunction | null {
  const view = new RouteView();
  return view.getEdgeStyle({ style, absolutePoints: [], view });
}

// --- public API: labels ------------------------------------------------------------

/**
 * mxGraphView.updateEdgeBounds: the segment lengths, the total length and
 * the bounding box (at least 1 wide and high) of a route.
 */
function edgeGeometry(points: readonly Point[]): EdgeGeometryState {
  const absolutePoints = points.map((p) => pt(p.x, p.y));
  const result: EdgeGeometryState = { absolutePoints, segments: [], length: 0, x: 0, y: 0, width: 0, height: 0 };
  const p0 = absolutePoints[0];

  if (p0 != null) {
    let p = p0;
    let length = 0;
    const segments: number[] = [];
    let minX = p.x;
    let minY = p.y;
    let maxX = minX;
    let maxY = minY;

    for (let i = 1; i < absolutePoints.length; i++) {
      const tmp = absolutePoints[i];

      if (tmp != null) {
        const dx = p.x - tmp.x;
        const dy = p.y - tmp.y;

        const segment = Math.sqrt(dx * dx + dy * dy);
        segments.push(segment);
        length += segment;

        p = tmp;

        minX = Math.min(p.x, minX);
        minY = Math.min(p.y, minY);
        maxX = Math.max(p.x, maxX);
        maxY = Math.max(p.y, maxY);
      }
    }

    result.length = length;
    result.segments = segments;

    // Minimum size of 1 in model units (TODO: include marker size)
    const markerSize = 1;

    result.x = minX;
    result.y = minY;
    result.width = Math.max(markerSize, maxX - minX);
    result.height = Math.max(markerSize, maxY - minY);
  }

  return result;
}

/** Graph.edgeSupportsCurved */
function edgeSupportsCurved(style: Style): boolean {
  const shape = getValue(style, 'shape', null);

  return shape == null || shape == 'connector' || shape == 'filledEdge' ||
    shape == 'wire' || shape == 'pipe' || shape == 'link' ||
    shape == 'flexArrow' || shape == 'taperedArrow';
}

/** Number of points per curve segment in Graph.getCurvePoints. */
const CURVE_POINT_STEPS = 16;

/**
 * Subdivides the given absolute points into a fine polyline that approximates
 * the curve actually drawn for curved/bezier edges, so the tangent is taken
 * from the rendered spline instead of the straight control polygon. Mirrors
 * mxPolyline.paintCurvedLine (quadratic through midpoints) and
 * paintBezierLine (cubic when the points form an [anchor, cp, cp, anchor, ...]
 * sequence, otherwise the same quadratic fallback). Returns the points
 * unchanged when none are curved.
 */
export function getCurvePoints(pts: readonly Point[], bezier: boolean): Point[] {
  const n = pts.length;

  if (n < 3) {
    return pts.slice();
  }

  const steps = CURVE_POINT_STEPS;
  const result: Point[] = [pts[0]];

  const quad = (p0: Point, pc: Point, p1: Point) => {
    for (let t = 1; t <= steps; t++) {
      const u = t / steps, iu = 1 - u;
      result.push(pt(
        iu * iu * p0.x + 2 * iu * u * pc.x + u * u * p1.x,
        iu * iu * p0.y + 2 * iu * u * pc.y + u * u * p1.y));
    }
  };

  if (bezier && (n - 1) % 3 == 0) {
    // Points are cubic control points: [anchor, cp1, cp2, anchor, ...]
    for (let i = 1; i + 2 < n; i += 3) {
      const p0 = pts[i - 1], c1 = pts[i], c2 = pts[i + 1], p1 = pts[i + 2];

      for (let t = 1; t <= steps; t++) {
        const u = t / steps, iu = 1 - u;
        result.push(pt(
          iu * iu * iu * p0.x + 3 * iu * iu * u * c1.x + 3 * iu * u * u * c2.x + u * u * u * p1.x,
          iu * iu * iu * p0.y + 3 * iu * iu * u * c1.y + 3 * iu * u * u * c2.y + u * u * u * p1.y));
      }
    }
  } else {
    // Quadratic through the midpoints of consecutive control points
    let prev = pts[0];

    for (let i = 1; i < n - 2; i++) {
      const mid = pt((pts[i].x + pts[i + 1].x) / 2,
        (pts[i].y + pts[i + 1].y) / 2);
      quad(prev, pts[i], mid);
      prev = mid;
    }

    quad(prev, pts[n - 2], pts[n - 1]);
  }

  return result;
}

/**
 * mxGraphView.getLabelCurveState: the route of the painted curve instead of
 * the control points if curveGeometry is 1 and the edge is painted as a
 * curve (curved=1 or bezier=1), or null otherwise.
 */
function labelCurveState(points: readonly Point[], style: Style | null | undefined): EdgeGeometryState | null {
  if (style != null && getValue(style, 'curveGeometry', '0') == '1' &&
    points.length > 2 && (getValue(style, 'curved', null) == 1 ||
      getValue(style, 'bezier', null) == 1) && edgeSupportsCurved(style)) {
    return edgeGeometry(getCurvePoints(points, getValue(style, 'bezier', null) == 1));
  }

  return null;
}

/**
 * mxGraphView.getPoint: the absolute point on the edge for the given
 * relative geometry (x from -1 at the source to 1 at the target, y the
 * perpendicular distance, plus the offset).
 */
function getPoint(state: EdgeGeometryState, geometry: { relative: boolean; x: number; y: number; offset?: Point | null } | null): Point {
  let x = centerX(state);
  let y = centerY(state);
  const scale = 1;

  if (state.segments != null && (geometry == null || geometry.relative)) {
    const gx = (geometry != null) ? geometry.x / 2 : 0;
    const pointCount = state.absolutePoints.length;
    // Rounds in model units so that the result does not depend on the scale
    const dist = Math.round(unscale((gx + 0.5) * state.length, scale)) * scale;
    const lengths = getSegmentLengths(state);
    let index = 1;
    let hi = pointCount - 1;

    // Finds the first point whose rounded length from the first point is
    // greater than the distance, as a walk over the segments would, in
    // logarithmic time, as the labels of an edge each search its points
    while (index < hi) {
      const mid = (index + hi) >> 1;

      if (dist >= Math.round(unscale(lengths[mid], scale)) * scale) {
        index = mid + 1;
      } else {
        hi = mid;
      }
    }

    const segment = state.segments[index - 1];
    const length = lengths[index - 1];
    const factor = (segment == 0) ? 0 : (dist - length) / segment;
    const p0 = state.absolutePoints[index - 1];
    const pe = state.absolutePoints[index];

    if (p0 != null && pe != null) {
      let gy = 0;
      let offsetX = 0;
      let offsetY = 0;

      if (geometry != null) {
        gy = geometry.y;
        const offset = geometry.offset;

        if (offset != null) {
          offsetX = offset.x;
          offsetY = offset.y;
        }
      }

      const dx = pe.x - p0.x;
      const dy = pe.y - p0.y;
      const nx = (segment == 0) ? 0 : dy / segment;
      const ny = (segment == 0) ? 0 : dx / segment;

      x = p0.x + dx * factor + (nx * gy + offsetX) * scale;
      y = p0.y + dy * factor - (ny * gy - offsetY) * scale;
    }
  } else if (geometry != null) {
    const offset = geometry.offset;

    if (offset != null) {
      x += offset.x;
      y += offset.y;
    }
  }

  return pt(x, y);
}

/**
 * Returns the lengths of the given edge state from its first point to each
 * point, the sums of its segments in their order.
 */
function getSegmentLengths(state: EdgeGeometryState): number[] {
  const segments = state.segments;
  const lengths = [0];

  for (let i = 0; i < segments.length; i++) {
    lengths.push(lengths[i] + segments[i]);
  }

  return lengths;
}

/**
 * The anchor of a label child cell on a routed edge (mxGraphView.getPoint,
 * the origin of the label cell's state): its relative geometry x in [-1, 1]
 * along the route, y px perpendicular to the segment (positive to the left
 * of the direction of travel in screen coordinates, as draw.io), plus the
 * geometry offset. With curveGeometry=1 on a curved edge the position follows
 * the painted curve.
 */
export function edgeLabelPoint(points: Point[], geometry: { x: number; y: number; offset?: Point | null }, style?: Style): Point {
  const state = labelCurveState(points, style) ?? edgeGeometry(points);
  return getPoint(state, { relative: true, x: geometry.x, y: geometry.y, offset: geometry.offset ?? null });
}

/**
 * The anchor of the edge's own label (mxGraphView.updateEdgeLabelOffset,
 * state.absoluteOffset): along the route for relative geometry (draw.io's
 * edges always have it), else the middle between the end points plus the
 * offset.
 */
export function edgeOwnLabelPoint(points: Point[], geometry: { x: number; y: number; offset?: Point | null; relative?: boolean },
  style?: Style): Point {
  const state = edgeGeometry(points);
  let result = pt(centerX(state), centerY(state));

  if (points.length > 0 && state.segments != null) {
    if (geometry.relative !== false) {
      const curve = labelCurveState(points, style);
      result = getPoint(curve ?? state, { relative: true, x: geometry.x, y: geometry.y, offset: geometry.offset ?? null });
    } else {
      const p0 = points[0];
      const pe = points[points.length - 1];

      if (p0 != null && pe != null) {
        const dx = pe.x - p0.x;
        const dy = pe.y - p0.y;
        let x0 = 0;
        let y0 = 0;

        const off = geometry.offset;

        if (off != null) {
          x0 = off.x;
          y0 = off.y;
        }

        result = pt(p0.x + dx / 2 + x0, p0.y + dy / 2 + y0);
      }
    }
  }

  return result;
}

/**
 * The relative geometry (x in [-1, 1] along the route, y the signed
 * distance) for a label whose anchor is at `p` (mxGraphView.getRelativePoint),
 * for dragging labels.
 */
export function relativePointOnRoute(points: Point[], p: Point, style?: Style): { x: number; y: number } {
  const edgeState = labelCurveState(points, style) ?? edgeGeometry(points);
  const x = p.x;
  const y = p.y;
  const pointCount = edgeState.absolutePoints.length;

  if (pointCount > 1) {
    const totalLength = edgeState.length;
    const segments = edgeState.segments;

    // Works out which line segment the point of the label is closest to
    let p0 = edgeState.absolutePoints[0];
    let pe = edgeState.absolutePoints[1];
    let minDist = ptSegDistSq(p0.x, p0.y, pe.x, pe.y, x, y);
    let length = 0;
    let index = 0;
    let tmp = 0;

    for (let i = 2; i < pointCount; i++) {
      p0 = pe;
      pe = edgeState.absolutePoints[i];
      const dist = ptSegDistSq(p0.x, p0.y, pe.x, pe.y, x, y);
      tmp += segments[i - 2];

      if (dist <= minDist) {
        minDist = dist;
        index = i - 1;
        length = tmp;
      }
    }

    const seg = segments[index];
    p0 = edgeState.absolutePoints[index];
    pe = edgeState.absolutePoints[index + 1];

    const x2 = p0.x;
    const y2 = p0.y;

    const x1 = pe.x;
    const y1 = pe.y;

    let px = x;
    let py = y;

    const xSegment = x2 - x1;
    const ySegment = y2 - y1;

    px -= x1;
    py -= y1;
    let projlenSq = 0;

    px = xSegment - px;
    py = ySegment - py;
    const dotprod = px * xSegment + py * ySegment;

    if (dotprod <= 0.0) {
      projlenSq = 0;
    } else {
      projlenSq = dotprod * dotprod /
        (xSegment * xSegment + ySegment * ySegment);
    }

    let projlen = Math.sqrt(projlenSq);

    if (projlen > seg) {
      projlen = seg;
    }

    let yDistance = Math.sqrt(ptSegDistSq(p0.x, p0.y, pe.x, pe.y, x, y));
    const direction = relativeCcw(p0.x, p0.y, pe.x, pe.y, x, y);

    if (direction == -1) {
      yDistance = -yDistance;
    }

    // Constructs the relative point for the label
    return {
      x: (totalLength > 0) ? ((totalLength / 2 - length - projlen) / totalLength) * -2 : 0,
      y: yDistance / 1,
    };
  }

  return { x: 0, y: 0 };
}
