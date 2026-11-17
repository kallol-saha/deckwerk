/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/view/mxEdgeStyle.js (EntityRelation, Loop, SegmentConnector,
 * OrthConnector and its route patterns, getJettySize, roundScaled,
 * scalePointArray, scaleCellState, getChannelBounds, getRoutePattern),
 * js/grapheditor/Graph.js (draw.io's ElbowConnector, SideToSide and
 * TopToBottom, which test containment in model units, and elbowContains),
 * js/grapheditor/Shapes.js (SequenceMessage with getSequenceAnchorY and
 * getSequenceMessageX, IsometricConnector) and mxgraph/src/view/
 * mxStyleRegistry.js (the names).
 * Modified for DeckWerk: typed functions over plain states; the view is an
 * interface that route.ts implements at scale 1 and translate 0; the scratch
 * arrays of OrthConnector are local instead of shared module state (every
 * entry is written before it is read, so the results are the same).
 */

import type { Point, Rect, Style } from './types.js';
import type { PerimeterVertex } from './perimeter.js';
import {
  DIRECTION_EAST, DIRECTION_MASK_ALL, DIRECTION_MASK_EAST, DIRECTION_MASK_NONE, DIRECTION_MASK_NORTH,
  DIRECTION_MASK_SOUTH, DIRECTION_MASK_WEST, DIRECTION_NORTH, DIRECTION_SOUTH, DIRECTION_WEST,
  centerX, centerY, contains, getBoundingBox, getNumber, getPortConstraints, getRotatedPoint, getValue,
  reversePortConstraints, toRadians, unscale,
} from './geometry.js';

/**
 * The state of a terminal (mxCellState of a vertex) as the edge styles see
 * it: its box in page space and its resolved style, plus what draw.io reads
 * from the cell itself.
 */
export interface VertexState extends PerimeterVertex {
  /** The cell id; null for the states edge styles make for fixed end points. */
  id: string | null;
  /** geometry.x if the terminal's geometry is relative (a port on its parent), else null. */
  relativeX?: number | null;
  /** Graph.getSequenceLifeline: the lifeline the cell belongs to (itself by default). */
  lifeline?: string | null;
}

/** The view functions the edge styles call (mxGraphView). */
export interface EdgeStyleView {
  readonly scale: number;
  readonly translate: Point;
  /** mxGraph.gridSize, the default segment of loops. */
  readonly gridSize: number;
  getRoutingCenterX(state: VertexState): number;
  getRoutingCenterY(state: VertexState): number;
  transformControlPoint(state: EdgeState, pt: Point, ignoreScale?: boolean): Point;
  /** Must return the given state itself when the channel is its bounds (identity is tested). */
  getChannelBounds(state: VertexState): Rect;
  getPerimeterPoint(terminal: VertexState, next: Point, orthogonal: boolean, border?: number): Point | null;
  getPixelSize(): number;
}

/** The state of the edge being routed (mxCellState of an edge). */
export interface EdgeState {
  style: Style;
  /** First and last are the fixed terminal points, or null where the end floats. */
  absolutePoints: (Point | null)[];
  view: EdgeStyleView;
}

/**
 * An edge style function: appends the routed waypoints to `result`, which
 * holds the (possibly null) source point when it is called.
 */
export type EdgeStyleFunction = (state: EdgeState, source: VertexState | null, target: VertexState | null,
  points: readonly Point[] | null, result: (Point | null)[]) => void;

// mxConstants
const ENTITY_SEGMENT = 30;
const DEFAULT_MARKERSIZE = 6;
const NONE = 'none';
const ELBOW_VERTICAL = 'vertical';

function pt(x: number, y: number): Point {
  return { x, y };
}

/** new mxCellState() at the given point: an empty box with an empty style. */
function pointState(p: Point): VertexState {
  return { id: null, x: p.x, y: p.y, width: 0, height: 0, style: {} };
}

/**
 * Implements an entity relation style for edges (as used in database
 * schema diagrams). At the time the function is called, the result
 * array contains a placeholder (null) for the first absolute point,
 * that is, the point where the edge and source terminal are connected.
 * The implementation of the style then adds all intermediate waypoints
 * except for the last point, that is, the connection point between the
 * edge and the target terminal. The first ant the last point in the
 * result array are then replaced with mxPoints that take into account
 * the terminal's perimeter and next point on the edge.
 *
 * state - the edge to be updated.
 * source - the source terminal.
 * target - the target terminal.
 * points - List of relative control points.
 * result - Array of points that represent the actual points of the edge.
 */
export const EntityRelation: EdgeStyleFunction = (state, source, target, _points, result) => {
  const view = state.view;
  const segment = Number(getValue(state.style, 'segment', ENTITY_SEGMENT)) * view.scale;

  const pts = state.absolutePoints;
  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  // Compares in model units so that the route does not depend on the scale or translate
  const isLess = (a: number, b: number) => unscale(a, view.scale, view.translate.x) <
    unscale(b, view.scale, view.translate.x);

  let isSourceLeft = false;

  if (source != null) {
    if (source.relativeX != null) {
      isSourceLeft = source.relativeX <= 0.5;
    } else if (target != null) {
      isSourceLeft = isLess((pe != null) ? pe.x : target.x + target.width, (p0 != null) ? p0.x : source.x);
    }
  }

  if (p0 != null) {
    source = pointState(p0);
  } else if (source != null) {
    const constraint = getPortConstraints(source, state, true, DIRECTION_MASK_NONE);

    if (constraint != DIRECTION_MASK_NONE && constraint != DIRECTION_MASK_WEST +
      DIRECTION_MASK_EAST) {
      isSourceLeft = constraint == DIRECTION_MASK_WEST;
    }
  } else {
    return;
  }

  let isTargetLeft = true;

  if (target != null) {
    if (target.relativeX != null) {
      isTargetLeft = target.relativeX <= 0.5;
    } else if (source != null) {
      isTargetLeft = isLess((p0 != null) ? p0.x : source.x + source.width, (pe != null) ? pe.x : target.x);
    }
  }

  if (pe != null) {
    target = pointState(pe);
  } else if (target != null) {
    const constraint = getPortConstraints(target, state, false, DIRECTION_MASK_NONE);

    if (constraint != DIRECTION_MASK_NONE && constraint != DIRECTION_MASK_WEST +
      DIRECTION_MASK_EAST) {
      isTargetLeft = constraint == DIRECTION_MASK_WEST;
    }
  }

  if (source != null && target != null) {
    const x0 = isSourceLeft ? source.x : source.x + source.width;
    const y0 = view.getRoutingCenterY(source);

    const xe = isTargetLeft ? target.x : target.x + target.width;
    const ye = view.getRoutingCenterY(target);

    const seg = segment;

    let dx = isSourceLeft ? -seg : seg;
    const dep = pt(x0 + dx, y0);

    dx = isTargetLeft ? -seg : seg;
    const arr = pt(xe + dx, ye);

    // Adds intermediate points if both go out on same side
    if (isSourceLeft == isTargetLeft) {
      const x = isSourceLeft ?
        Math.min(x0, xe) - segment :
        Math.max(x0, xe) + segment;

      result.push(pt(x, y0));
      result.push(pt(x, ye));
    } else if (isLess(dep.x, arr.x) == isSourceLeft) {
      const midY = y0 + (ye - y0) / 2;

      result.push(dep);
      result.push(pt(dep.x, midY));
      result.push(pt(arr.x, midY));
      result.push(arr);
    } else {
      result.push(dep);
      result.push(arr);
    }
  }
};

/** Implements a self-reference, aka. loop. */
export const Loop: EdgeStyleFunction = (state, source, _target, points, result) => {
  const pts = state.absolutePoints;

  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  if (p0 != null && pe != null) {
    if (points != null && points.length > 0) {
      for (let i = 0; i < points.length; i++) {
        const p = state.view.transformControlPoint(state, points[i]);
        result.push(pt(p.x, p.y));
      }
    }

    return;
  }

  if (source != null) {
    const view = state.view;
    let p: Point | null = (points != null && points.length > 0) ? points[0] : null;

    if (p != null) {
      p = view.transformControlPoint(state, p);

      if (contains(source, p.x, p.y)) {
        p = null;
      }
    }

    let x = 0;
    let dx = 0;
    let y = 0;
    let dy = 0;

    const seg = Number(getValue(state.style, 'segment', view.gridSize)) * view.scale;
    const dir = getValue(state.style, 'direction', DIRECTION_WEST);

    if (dir == DIRECTION_NORTH ||
      dir == DIRECTION_SOUTH) {
      x = view.getRoutingCenterX(source);
      dx = seg;
    } else {
      y = view.getRoutingCenterY(source);
      dy = seg;
    }

    if (p == null ||
      p.x < source.x ||
      p.x > source.x + source.width) {
      if (p != null) {
        x = p.x;
        dy = Math.max(Math.abs(y - p.y), dy);
      } else {
        if (dir == DIRECTION_NORTH) {
          y = source.y - 2 * dx;
        } else if (dir == DIRECTION_SOUTH) {
          y = source.y + source.height + 2 * dx;
        } else if (dir == DIRECTION_EAST) {
          x = source.x - 2 * dy;
        } else {
          x = source.x + source.width + 2 * dy;
        }
      }
    } else if (p != null) {
      x = view.getRoutingCenterX(source);
      dx = Math.max(Math.abs(x - p.x), dy);
      y = p.y;
      dy = 0;
    }

    result.push(pt(x - dx, y - dy));
    result.push(pt(x + dx, y + dy));
  }
};

/**
 * Returns true if the given point is in the given state, compared in model
 * units. The elbow styles test if their points are in a terminal, which is
 * a tie if a point is on the border of the terminal. Compared in screen
 * units, floating point noise that depends on the scale and translate of
 * the view decided these ties, so collinear points were added or dropped
 * depending on the zoom of the validation.
 */
function elbowContains(view: EdgeStyleView, state: VertexState, x: number, y: number): boolean {
  const s = view.scale;
  const tr = view.translate;
  // Bends next to the bumps of clouds are kept (see getChannelBounds)
  const b = view.getChannelBounds(state);

  return contains({
    x: unscale(b.x, s, tr.x), y: unscale(b.y, s, tr.y),
    width: unscale(b.width, s), height: unscale(b.height, s),
  }, unscale(x, s, tr.x), unscale(y, s, tr.y));
}

/**
 * Uses either SideToSide or TopToBottom depending on the horizontal
 * flag in the cell style. SideToSide is used if horizontal is true or
 * unspecified. See EntityRelation for a description of the parameters.
 *
 * draw.io's copy (Graph.js), which tests if the terminals touch
 * (left == right and top == bottom) in model units.
 */
export const ElbowConnector: EdgeStyleFunction = (state, source, target, points, result) => {
  let p: Point | null = (points != null && points.length > 0) ? points[0] : null;

  let vertical = false;
  let horizontal = false;

  if (source != null && target != null) {
    if (p != null) {
      const left = Math.min(source.x, target.x);
      const right = Math.max(source.x + source.width,
        target.x + target.width);

      const top = Math.min(source.y, target.y);
      const bottom = Math.max(source.y + source.height,
        target.y + target.height);

      p = state.view.transformControlPoint(state, p);

      vertical = p.y < top || p.y > bottom;
      horizontal = p.x < left || p.x > right;
    } else {
      const left = Math.max(source.x, target.x);
      const right = Math.min(source.x + source.width,
        target.x + target.width);

      vertical = unscale(left, state.view.scale, state.view.translate.x) ==
        unscale(right, state.view.scale, state.view.translate.x);

      if (!vertical) {
        const top = Math.max(source.y, target.y);
        const bottom = Math.min(source.y + source.height,
          target.y + target.height);

        horizontal = unscale(top, state.view.scale, state.view.translate.y) ==
          unscale(bottom, state.view.scale, state.view.translate.y);
      }
    }
  }

  if (!horizontal && (vertical ||
    state.style['elbow'] == ELBOW_VERTICAL)) {
    TopToBottom(state, source, target, points, result);
  } else {
    SideToSide(state, source, target, points, result);
  }
};

/**
 * Implements a vertical elbow edge. See EntityRelation for a description
 * of the parameters.
 *
 * draw.io's copy (Graph.js), which tests if a point is in a terminal in
 * model units (elbowContains).
 */
export const SideToSide: EdgeStyleFunction = (state, source, target, points, result) => {
  const view = state.view;
  let p: Point | null = (points != null && points.length > 0) ? points[0] : null;
  const pts = state.absolutePoints;
  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  if (p != null) {
    p = view.transformControlPoint(state, p);
  }

  if (p0 != null) {
    source = pointState(p0);
  }

  if (pe != null) {
    target = pointState(pe);
  }

  if (source != null && target != null) {
    const l = Math.max(source.x, target.x);
    const r = Math.min(source.x + source.width,
      target.x + target.width);

    const x = (p != null) ? p.x : roundScaled(
      r + (l - r) / 2, view.scale, view.translate.x);

    let y1 = view.getRoutingCenterY(source);
    let y2 = view.getRoutingCenterY(target);

    if (p != null) {
      // Waypoints level with the cloud bumps only (see getChannelBounds)
      const sc = view.getChannelBounds(source);
      const tc = view.getChannelBounds(target);

      if (p.y >= sc.y && p.y <= sc.y + sc.height) {
        y1 = p.y;
      }

      if (p.y >= tc.y && p.y <= tc.y + tc.height) {
        y2 = p.y;
      }
    }

    if (!elbowContains(view, target, x, y1) &&
      !elbowContains(view, source, x, y1)) {
      result.push(pt(x, y1));
    }

    if (!elbowContains(view, target, x, y2) &&
      !elbowContains(view, source, x, y2)) {
      result.push(pt(x, y2));
    }

    if (result.length == 1) {
      if (p != null) {
        if (!elbowContains(view, target, x, p.y) &&
          !elbowContains(view, source, x, p.y)) {
          result.push(pt(x, p.y));
        }
      } else {
        const t = Math.max(source.y, target.y);
        const b = Math.min(source.y + source.height,
          target.y + target.height);

        result.push(pt(x, t + (b - t) / 2));
      }
    }
  }
};

/**
 * Implements a horizontal elbow edge. See EntityRelation for a
 * description of the parameters.
 *
 * draw.io's copy (Graph.js), which tests if a point is in a terminal in
 * model units (elbowContains).
 */
export const TopToBottom: EdgeStyleFunction = (state, source, target, points, result) => {
  const view = state.view;
  let p: Point | null = (points != null && points.length > 0) ? points[0] : null;
  const pts = state.absolutePoints;
  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  if (p != null) {
    p = view.transformControlPoint(state, p);
  }

  if (p0 != null) {
    source = pointState(p0);
  }

  if (pe != null) {
    target = pointState(pe);
  }

  if (source != null && target != null) {
    const t = Math.max(source.y, target.y);
    const b = Math.min(source.y + source.height,
      target.y + target.height);

    let x = view.getRoutingCenterX(source);
    // Waypoints level with the cloud bumps only (see getChannelBounds)
    const sc = view.getChannelBounds(source);
    const tc = view.getChannelBounds(target);

    if (p != null &&
      p.x >= sc.x &&
      p.x <= sc.x + sc.width) {
      x = p.x;
    }

    const y = (p != null) ? p.y : roundScaled(
      b + (t - b) / 2, view.scale, view.translate.y);

    if (!elbowContains(view, target, x, y) &&
      !elbowContains(view, source, x, y)) {
      result.push(pt(x, y));
    }

    if (p != null &&
      p.x >= tc.x &&
      p.x <= tc.x + tc.width) {
      x = p.x;
    } else {
      x = view.getRoutingCenterX(target);
    }

    if (!elbowContains(view, target, x, y) &&
      !elbowContains(view, source, x, y)) {
      result.push(pt(x, y));
    }

    if (result.length == 1) {
      if (p != null && result.length == 1) {
        if (!elbowContains(view, target, p.x, y) &&
          !elbowContains(view, source, p.x, y)) {
          result.push(pt(p.x, y));
        }
      } else {
        const l = Math.max(source.x, target.x);
        const r = Math.min(source.x + source.width,
          target.x + target.width);

        result.push(pt(l + (r - l) / 2, y));
      }
    }
  }
};

/**
 * Implements an orthogonal edge style. Use mxEdgeSegmentHandler
 * as an interactive handler for this style.
 *
 * state - the edge to be updated.
 * sourceScaled - the source terminal.
 * targetScaled - the target terminal.
 * controlHints - List of relative control points.
 * result - Array of points that represent the actual points of the edge.
 */
export const SegmentConnector: EdgeStyleFunction = (state, sourceScaled, targetScaled, controlHints, result) => {
  // Creates array of all way- and terminalpoints in model units
  const s = state.view.scale;
  const tr = state.view.translate;
  const pts = scalePointArray(state.absolutePoints, s, tr);
  const source = scaleCellState(sourceScaled, s, tr);
  const target = scaleCellState(targetScaled, s, tr);
  const sourceChannel = getChannelBounds(state.view, sourceScaled, source, s, tr);
  const targetChannel = getChannelBounds(state.view, targetScaled, target, s, tr);
  const tol = 1;

  // Adds points in model units for precise collision checks
  const tempPoints: Point[] = [];

  const addPoint = (p: Point) => {
    tempPoints.push(p);
  };

  // Whether the first segment outgoing from the source end is horizontal
  let lastPushed: Point | null = (result.length > 0 && result[0] != null) ?
    pt(unscale(result[0].x, s, tr.x), unscale(result[0].y, s, tr.y)) : null;
  let horizontal = true;
  let hint: Point | null = null;

  // Adds waypoints only if outside of tolerance in model units so
  // that the result does not depend on the scale or translate
  const pushPoint = (p: Point) => {
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;

    if (lastPushed == null || Math.abs(lastPushed.x - p.x) >= tol || Math.abs(lastPushed.y - p.y) >= tol) {
      result.push(pt((p.x + tr.x) * s, (p.y + tr.y) * s));
      lastPushed = p;
    }

    return lastPushed;
  };

  // Adds the first point
  let p: Point | null = pts[0];

  if (p == null && source != null) {
    p = pt(state.view.getRoutingCenterX(source), state.view.getRoutingCenterY(source));
  } else if (p != null) {
    p = pt(p.x, p.y);
  }

  const lastInx = pts.length - 1;
  // Declared with var in draw.io: only set if there are control hints
  let pe: Point | null | undefined;

  // Adds the waypoints
  if (controlHints != null && controlHints.length > 0) {
    // Converts all hints and removes nulls
    let hints: Point[] = [];

    for (let i = 0; i < controlHints.length; i++) {
      const tmp = state.view.transformControlPoint(state, controlHints[i], true);

      if (tmp != null) {
        hints.push(pt(unscale(tmp.x, 1, tr.x), unscale(tmp.y, 1, tr.y)));
      }
    }

    if (hints.length == 0) {
      return;
    }

    // Aligns source and target hint to fixed points
    if (p != null && hints[0] != null) {
      if (Math.abs(hints[0].x - p.x) < tol) {
        hints[0].x = p.x;
      }

      if (Math.abs(hints[0].y - p.y) < tol) {
        hints[0].y = p.y;
      }
    }

    pe = pts[lastInx];

    if (pe != null && hints[hints.length - 1] != null) {
      if (Math.abs(hints[hints.length - 1].x - pe.x) < tol) {
        hints[hints.length - 1].x = pe.x;
      }

      if (Math.abs(hints[hints.length - 1].y - pe.y) < tol) {
        hints[hints.length - 1].y = pe.y;
      }
    }

    hint = hints[0];

    let currentTerm: VertexState | null = source;
    let currentChannel: Rect | null = sourceChannel;
    let currentPt: Point | null = pts[0];
    let hozChan = false;
    let vertChan = false;
    let currentHint = hint;

    if (currentPt != null) {
      currentTerm = null;
    }

    // Check for alignment with fixed points and with channels
    // at source and target segments only
    for (let i = 0; i < 2; i++) {
      const fixedVertAlign = currentPt != null && currentPt.x == currentHint.x;
      const fixedHozAlign = currentPt != null && currentPt.y == currentHint.y;

      const inHozChan = currentTerm != null && currentChannel != null && (currentHint.y >= currentChannel.y &&
        currentHint.y <= currentChannel.y + currentChannel.height);
      const inVertChan = currentTerm != null && currentChannel != null && (currentHint.x >= currentChannel.x &&
        currentHint.x <= currentChannel.x + currentChannel.width);

      hozChan = fixedHozAlign || (currentPt == null && inHozChan);
      vertChan = fixedVertAlign || (currentPt == null && inVertChan);

      // If the current hint falls in both the hor and vert channels in the case
      // of a floating port, or if the hint is exactly co-incident with a
      // fixed point, ignore the source and try to work out the orientation
      // from the target end
      if (i == 0 && ((hozChan && vertChan) || (fixedVertAlign && fixedHozAlign))) {
        // (empty in draw.io)
      } else {
        if (currentPt != null && (!fixedHozAlign && !fixedVertAlign) && (inHozChan || inVertChan)) {
          horizontal = inHozChan ? false : true;
          break;
        }

        if (vertChan || hozChan) {
          horizontal = hozChan;

          if (i == 1) {
            // Work back from target end
            horizontal = hints.length % 2 == 0 ? hozChan : vertChan;
          }

          break;
        }
      }

      currentTerm = target;
      currentChannel = targetChannel;
      currentPt = pts[lastInx];

      if (currentPt != null) {
        currentTerm = null;
      }

      currentHint = hints[hints.length - 1];

      if (fixedVertAlign && fixedHozAlign) {
        hints = hints.slice(1);
      }
    }

    // p is set here: either pts[0] or the routing center of the source
    // (draw.io throws if both are missing)
    const start = p as Point;

    if (horizontal && ((pts[0] != null && pts[0].y != hint.y) ||
      (pts[0] == null && source != null && sourceChannel != null &&
        (hint.y < sourceChannel.y || hint.y > sourceChannel.y + sourceChannel.height)))) {
      addPoint(pt(start.x, hint.y));
    } else if (!horizontal && ((pts[0] != null && pts[0].x != hint.x) ||
      (pts[0] == null && source != null && sourceChannel != null &&
        (hint.x < sourceChannel.x || hint.x > sourceChannel.x + sourceChannel.width)))) {
      addPoint(pt(hint.x, start.y));
    }

    if (horizontal) {
      start.y = hint.y;
    } else {
      start.x = hint.x;
    }

    for (let i = 0; i < hints.length; i++) {
      horizontal = !horizontal;
      hint = hints[i];

      if (horizontal) {
        start.y = hint.y;
      } else {
        start.x = hint.x;
      }

      addPoint(pt(start.x, start.y));
    }
  } else {
    hint = p;
    // FIXME: First click in connect preview toggles orientation
    horizontal = true;
  }

  // Adds the last point
  p = pts[lastInx];

  if (p == null && target != null) {
    p = pt(state.view.getRoutingCenterX(target), state.view.getRoutingCenterY(target));
  }

  if (p != null) {
    if (hint != null) {
      if (horizontal && ((pts[lastInx] != null && pts[lastInx]!.y != hint.y) ||
        (pts[lastInx] == null && target != null && targetChannel != null &&
          (hint.y < targetChannel.y || hint.y > targetChannel.y + targetChannel.height)))) {
        addPoint(pt(p.x, hint.y));
      } else if (!horizontal && ((pts[lastInx] != null && pts[lastInx]!.x != hint.x) ||
        (pts[lastInx] == null && target != null && targetChannel != null &&
          (hint.x < targetChannel.x || hint.x > targetChannel.x + targetChannel.width)))) {
        addPoint(pt(hint.x, p.y));
      }
    }
  }

  // Keeps bends inside the shape for self-loops with innerLoopWaypoints
  if (sourceScaled == null || sourceScaled != targetScaled ||
    getValue(state.style, 'innerLoopWaypoints', '0') != '1') {
    // Removes bends inside the source terminal
    if (pts[0] == null && source != null && sourceChannel != null) {
      while (tempPoints.length > 0 && tempPoints[0] != null &&
        contains(sourceChannel, tempPoints[0].x, tempPoints[0].y)) {
        tempPoints.splice(0, 1);
      }
    }

    // Removes bends inside the target terminal
    if (pts[lastInx] == null && target != null && targetChannel != null) {
      while (tempPoints.length > 0 && tempPoints[tempPoints.length - 1] != null &&
        contains(targetChannel, tempPoints[tempPoints.length - 1].x, tempPoints[tempPoints.length - 1].y)) {
        tempPoints.splice(tempPoints.length - 1, 1);
      }
    }
  }

  // Scales and smoothens edges
  for (let i = 0; i < tempPoints.length; i++) {
    pushPoint(tempPoints[i]);
  }

  // Removes last point if inside tolerance with end point
  // using model units as pe is in model units
  const last = result[result.length - 1];

  if (pe != null && last != null &&
    Math.abs(pe.x - unscale(last.x, s, tr.x)) <= tol &&
    Math.abs(pe.y - unscale(last.y, s, tr.y)) <= tol) {
    result.splice(result.length - 1, 1);

    // Lines up second last point in result with end point
    const prev = result[result.length - 1];

    if (prev != null) {
      if (Math.abs(unscale(prev.x, s, tr.x) - pe.x) < tol) {
        prev.x = (pe.x + tr.x) * s;
      }

      if (Math.abs(unscale(prev.y, s, tr.y) - pe.y) < tol) {
        prev.y = (pe.y + tr.y) * s;
      }
    }
  }
};

// --- OrthConnector -------------------------------------------------------------------

export const orthBuffer = 10;

export const orthPointsFallback = true;

const dirVectors: readonly (readonly [number, number])[] = [[-1, 0],
  [0, -1], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]];

export const routePatterns: readonly (readonly (readonly number[])[])[] = [
  [[513, 2308, 2081, 2562], [513, 1090, 514, 2184, 2114, 2561],
    [513, 1090, 514, 2564, 2184, 2562],
    [513, 2308, 2561, 1090, 514, 2568, 2308]],
  [[514, 1057, 513, 2308, 2081, 2562], [514, 2184, 2114, 2561],
    [514, 2184, 2562, 1057, 513, 2564, 2184],
    [514, 1057, 513, 2568, 2308, 2561]],
  [[1090, 514, 1057, 513, 2308, 2081, 2562], [2114, 2561],
    [1090, 2562, 1057, 513, 2564, 2184],
    [1090, 514, 1057, 513, 2308, 2561, 2568]],
  [[2081, 2562], [1057, 513, 1090, 514, 2184, 2114, 2561],
    [1057, 513, 1090, 514, 2184, 2562, 2564],
    [1057, 2561, 1090, 514, 2568, 2308]]];

export const inlineRoutePatterns: readonly (readonly (readonly number[] | null)[])[] = [
  [null, [2114, 2568], null, null],
  [null, [514, 2081, 2114, 2568], null, null],
  [null, [2114, 2561], null, null],
  [[2081, 2562], [1057, 2114, 2568],
    [2184, 2562],
    null]];

export const LEFT_MASK = 32;
export const TOP_MASK = 64;
export const RIGHT_MASK = 128;
export const BOTTOM_MASK = 256;
export const LEFT = 1;
export const TOP = 2;
export const RIGHT = 4;
export const BOTTOM = 8;
// TODO remove magic numbers
export const SIDE_MASK = 480;
// LEFT_MASK | TOP_MASK | RIGHT_MASK | BOTTOM_MASK
export const CENTER_MASK = 512;
export const SOURCE_MASK = 1024;
export const TARGET_MASK = 2048;
export const VERTEX_MASK = 3072;
// SOURCE_MASK | TARGET_MASK

/** The size of the straight piece at the given end of an orthogonal edge (jettySize, 'auto'). */
export function getJettySize(state: { style: Style }, isSource: boolean): number {
  let value = getValue(state.style, isSource ? 'sourceJettySize' :
    'targetJettySize', getValue(state.style,
    'jettySize', orthBuffer));

  if (value == 'auto') {
    // Computes the automatic jetty size
    const type = getValue(state.style, isSource ? 'startArrow' : 'endArrow', NONE);

    if (type != NONE) {
      const size = getNumber(state.style, isSource ? 'startSize' : 'endSize', DEFAULT_MARKERSIZE);
      value = Math.max(2, Math.ceil((size + orthBuffer) / orthBuffer)) * orthBuffer;
    } else {
      value = 2 * orthBuffer;
    }
  }

  return Number(value);
}

/**
 * Rounds the given scaled coordinate to an integer in model units and
 * returns the scaled result so that it does not depend on the scale or
 * translate of the view.
 *
 * value - Scaled coordinate to be rounded.
 * scale - Scale of the view.
 * translate - Translate of the view along the axis of the coordinate.
 */
export function roundScaled(value: number, scale: number, translate: number): number {
  return (Math.round(unscale(value, scale, translate)) + translate) * scale;
}

/**
 * Scales an array of points.
 *
 * points - array of points to scale
 * scale - the scaling to divide by
 * translate - optional point to subtract after scaling
 */
export function scalePointArray(points: readonly (Point | null)[], scale: number, translate?: Point | null): (Point | null)[] {
  const result: (Point | null)[] = [];
  const tx = translate != null ? translate.x : 0;
  const ty = translate != null ? translate.y : 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    if (p != null) {
      result[i] = pt(Math.round(unscale(p.x, scale, tx) * 10) / 10,
        Math.round(unscale(p.y, scale, ty) * 10) / 10);
    } else {
      result[i] = null;
    }
  }

  return result;
}

/**
 * Returns the channel bounds of the given terminal in model units (see
 * mxGraphView.getChannelBounds), or the given scaled state if they are
 * the bounds of the terminal.
 */
export function getChannelBounds(view: EdgeStyleView, state: VertexState | null, scaled: VertexState | null,
  scale: number, translate?: Point | null): Rect | null {
  const bounds = (state != null) ? view.getChannelBounds(state) : null;

  if (bounds != null && bounds != state) {
    const tx = translate != null ? translate.x : 0;
    const ty = translate != null ? translate.y : 0;

    return {
      x: Math.round(unscale(bounds.x, scale, tx) * 10) / 10,
      y: Math.round(unscale(bounds.y, scale, ty) * 10) / 10,
      width: Math.round(unscale(bounds.width, scale) * 10) / 10,
      height: Math.round(unscale(bounds.height, scale) * 10) / 10,
    };
  }

  return scaled;
}

/**
 * Scales a cell state (a copy with the box in model units, rounded to a
 * tenth).
 *
 * state - state to scale
 * scale - the scaling to divide by
 * translate - optional point to subtract after scaling
 */
export function scaleCellState(state: VertexState | null, scale: number, translate?: Point | null): VertexState | null {
  let result: VertexState | null = null;

  if (state != null) {
    const tx = translate != null ? translate.x : 0;
    const ty = translate != null ? translate.y : 0;
    result = {
      ...state,
      x: Math.round(unscale(state.x, scale, tx) * 10) / 10,
      y: Math.round(unscale(state.y, scale, ty) * 10) / 10,
      width: Math.round(unscale(state.width, scale) * 10) / 10,
      height: Math.round(unscale(state.height, scale) * 10) / 10,
    };
  } else {
    result = null;
  }

  return result;
}

/**
 * Implements a local orthogonal router between the given cells.
 *
 * state - the edge to be updated.
 * sourceScaled - the source terminal.
 * targetScaled - the target terminal.
 * controlHints - List of relative control points.
 * result - Array of points that represent the actual points of the edge.
 */
export const OrthConnector: EdgeStyleFunction = (state, sourceScaled, targetScaled, controlHints, result) => {
  const pts = scalePointArray(state.absolutePoints, state.view.scale, state.view.translate);
  const source = scaleCellState(sourceScaled, state.view.scale, state.view.translate);
  const target = scaleCellState(targetScaled, state.view.scale, state.view.translate);

  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  // Without a terminal the end is fixed (route.ts does not route an edge
  // that has neither), as draw.io assumes
  let sourceX = source != null ? source.x : p0!.x;
  let sourceY = source != null ? source.y : p0!.y;
  let sourceWidth = source != null ? source.width : 1;
  let sourceHeight = source != null ? source.height : 1;

  let targetX = target != null ? target.x : pe!.x;
  let targetY = target != null ? target.y : pe!.y;
  let targetWidth = target != null ? target.width : 1;
  let targetHeight = target != null ? target.height : 1;

  let sourceBuffer = getJettySize(state, true);
  let targetBuffer = getJettySize(state, false);

  // Workaround for loop routing within buffer zone
  // (the states are copies made by scaleCellState, so this never holds
  // in draw.io either; kept as written)
  if (source != null && target == source) {
    targetBuffer = Math.max(sourceBuffer, targetBuffer);
    sourceBuffer = targetBuffer;
  }

  const totalBuffer = targetBuffer + sourceBuffer;
  let tooShort = false;

  // Checks minimum distance for fixed points and falls back to segment connector
  if (p0 != null && pe != null) {
    const dx = pe.x - p0.x;
    const dy = pe.y - p0.y;

    tooShort = dx * dx + dy * dy < totalBuffer * totalBuffer;
  }

  if (tooShort || (orthPointsFallback && (controlHints != null &&
    controlHints.length > 0))) {
    SegmentConnector(state, sourceScaled, targetScaled, controlHints, result);

    return;
  }

  // Determine the side(s) of the source and target vertices
  // that the edge may connect to
  // portConstraint [source, target]
  const portConstraint = [DIRECTION_MASK_ALL, DIRECTION_MASK_ALL];
  let rotation = 0;

  if (source != null) {
    portConstraint[0] = getPortConstraints(source, state, true,
      DIRECTION_MASK_ALL);
    rotation = Number(getValue(source.style, 'rotation', 0));

    if (rotation != 0) {
      const newRect = getBoundingBox({ x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight }, rotation)!;
      sourceX = newRect.x;
      sourceY = newRect.y;
      sourceWidth = newRect.width;
      sourceHeight = newRect.height;
    }
  }

  if (target != null) {
    portConstraint[1] = getPortConstraints(target, state, false,
      DIRECTION_MASK_ALL);
    rotation = Number(getValue(target.style, 'rotation', 0));

    if (rotation != 0) {
      const newRect = getBoundingBox({ x: targetX, y: targetY, width: targetWidth, height: targetHeight }, rotation)!;
      targetX = newRect.x;
      targetY = newRect.y;
      targetWidth = newRect.width;
      targetHeight = newRect.height;
    }
  }

  if (sourceWidth == 0 || sourceHeight == 0 ||
    targetWidth == 0 || targetHeight == 0) {
    return;
  }

  const dir = [0, 0];

  // Work out which faces of the vertices present against each other
  // in a way that would allow a 3-segment connection if port constraints
  // permitted.
  // geo -> [source, target] [x, y, width, height]
  const geo = [[sourceX, sourceY, sourceWidth, sourceHeight],
    [targetX, targetY, targetWidth, targetHeight]];
  const buffer = [sourceBuffer, targetBuffer];
  const limits = [[0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]];

  for (let i = 0; i < 2; i++) {
    limits[i][1] = geo[i][0] - buffer[i];
    limits[i][2] = geo[i][1] - buffer[i];
    limits[i][4] = geo[i][0] + geo[i][2] + buffer[i];
    limits[i][8] = geo[i][1] + geo[i][3] + buffer[i];
  }

  // Work out which quad the target is in
  const sourceCenX = geo[0][0] + geo[0][2] / 2.0;
  const sourceCenY = geo[0][1] + geo[0][3] / 2.0;
  const targetCenX = geo[1][0] + geo[1][2] / 2.0;
  const targetCenY = geo[1][1] + geo[1][3] / 2.0;

  const dx = sourceCenX - targetCenX;
  const dy = sourceCenY - targetCenY;

  let quad = 0;

  // 0 | 1
  // -----
  // 3 | 2

  if (dx < 0) {
    if (dy < 0) {
      quad = 2;
    } else {
      quad = 1;
    }
  } else {
    if (dy <= 0) {
      quad = 3;

      // Special case on x = 0 and negative y
      if (dx == 0) {
        quad = 2;
      }
    }
  }

  // Check for connection constraints
  let currentTerm: Point | null = null;

  if (source != null) {
    currentTerm = p0;
  }

  const constraint = [[0.5, 0.5], [0.5, 0.5]];

  // The only assumed cases for the below is an unattached end, source/target has no dims in that case.
  if (!source) constraint[0] = [0, 0]; // use top-left corner (= exact p0)
  if (!target) constraint[1] = [0, 0]; // use top-left corner (= exact pe)

  for (let i = 0; i < 2; i++) {
    if (currentTerm != null) {
      constraint[i][0] = (currentTerm.x - geo[i][0]) / geo[i][2];

      if (Math.abs(currentTerm.x - geo[i][0]) <= 1) {
        dir[i] = DIRECTION_MASK_WEST;
      } else if (Math.abs(currentTerm.x - geo[i][0] - geo[i][2]) <= 1) {
        dir[i] = DIRECTION_MASK_EAST;
      }

      constraint[i][1] = (currentTerm.y - geo[i][1]) / geo[i][3];

      if (Math.abs(currentTerm.y - geo[i][1]) <= 1) {
        dir[i] = DIRECTION_MASK_NORTH;
      } else if (Math.abs(currentTerm.y - geo[i][1] - geo[i][3]) <= 1) {
        dir[i] = DIRECTION_MASK_SOUTH;
      }
    }

    currentTerm = null;

    if (target != null) {
      currentTerm = pe;
    }
  }

  const sourceTopDist = geo[0][1] - (geo[1][1] + geo[1][3]);
  const sourceLeftDist = geo[0][0] - (geo[1][0] + geo[1][2]);
  const sourceBottomDist = geo[1][1] - (geo[0][1] + geo[0][3]);
  const sourceRightDist = geo[1][0] - (geo[0][0] + geo[0][2]);

  const vertexSeperations: number[] = [];
  vertexSeperations[1] = Math.max(sourceLeftDist - totalBuffer, 0);
  vertexSeperations[2] = Math.max(sourceTopDist - totalBuffer, 0);
  vertexSeperations[4] = Math.max(sourceBottomDist - totalBuffer, 0);
  vertexSeperations[3] = Math.max(sourceRightDist - totalBuffer, 0);

  //==============================================================
  // Start of source and target direction determination

  // Work through the preferred orientations by relative positioning
  // of the vertices and list them in preferred and available order

  const dirPref: number[] = [];
  const horPref: number[] = [];
  const vertPref: number[] = [];

  horPref[0] = (sourceLeftDist >= sourceRightDist) ? DIRECTION_MASK_WEST
    : DIRECTION_MASK_EAST;
  vertPref[0] = (sourceTopDist >= sourceBottomDist) ? DIRECTION_MASK_NORTH
    : DIRECTION_MASK_SOUTH;

  horPref[1] = reversePortConstraints(horPref[0]);
  vertPref[1] = reversePortConstraints(vertPref[0]);

  const preferredHorizDist = sourceLeftDist >= sourceRightDist ? sourceLeftDist
    : sourceRightDist;
  const preferredVertDist = sourceTopDist >= sourceBottomDist ? sourceTopDist
    : sourceBottomDist;

  const prefOrdering = [[0, 0], [0, 0]];
  let preferredOrderSet = false;

  // If the preferred port isn't available, switch it
  for (let i = 0; i < 2; i++) {
    if (dir[i] != 0x0) {
      continue;
    }

    if ((horPref[i] & portConstraint[i]) == 0) {
      horPref[i] = reversePortConstraints(horPref[i]);
    }

    if ((vertPref[i] & portConstraint[i]) == 0) {
      vertPref[i] = reversePortConstraints(vertPref[i]);
    }

    prefOrdering[i][0] = vertPref[i];
    prefOrdering[i][1] = horPref[i];
  }

  if (preferredVertDist > 0 &&
    preferredHorizDist > 0) {
    // Possibility of two segment edge connection
    if (((horPref[0] & portConstraint[0]) > 0) &&
      ((vertPref[1] & portConstraint[1]) > 0)) {
      prefOrdering[0][0] = horPref[0];
      prefOrdering[0][1] = vertPref[0];
      prefOrdering[1][0] = vertPref[1];
      prefOrdering[1][1] = horPref[1];
      preferredOrderSet = true;
    } else if (((vertPref[0] & portConstraint[0]) > 0) &&
      ((horPref[1] & portConstraint[1]) > 0)) {
      prefOrdering[0][0] = vertPref[0];
      prefOrdering[0][1] = horPref[0];
      prefOrdering[1][0] = horPref[1];
      prefOrdering[1][1] = vertPref[1];
      preferredOrderSet = true;
    }
  }

  if (preferredVertDist > 0 && !preferredOrderSet) {
    prefOrdering[0][0] = vertPref[0];
    prefOrdering[0][1] = horPref[0];
    prefOrdering[1][0] = vertPref[1];
    prefOrdering[1][1] = horPref[1];
    preferredOrderSet = true;
  }

  if (preferredHorizDist > 0 && !preferredOrderSet) {
    prefOrdering[0][0] = horPref[0];
    prefOrdering[0][1] = vertPref[0];
    prefOrdering[1][0] = horPref[1];
    prefOrdering[1][1] = vertPref[1];
    preferredOrderSet = true;
  }

  // The source and target prefs are now an ordered list of
  // the preferred port selections
  // If the list contains gaps, compact it

  for (let i = 0; i < 2; i++) {
    if (dir[i] != 0x0) {
      continue;
    }

    if ((prefOrdering[i][0] & portConstraint[i]) == 0) {
      prefOrdering[i][0] = prefOrdering[i][1];
    }

    dirPref[i] = prefOrdering[i][0] & portConstraint[i];
    dirPref[i] |= (prefOrdering[i][1] & portConstraint[i]) << 8;
    dirPref[i] |= (prefOrdering[1 - i][i] & portConstraint[i]) << 16;
    dirPref[i] |= (prefOrdering[1 - i][1 - i] & portConstraint[i]) << 24;

    if ((dirPref[i] & 0xF) == 0) {
      dirPref[i] = dirPref[i] << 8;
    }

    if ((dirPref[i] & 0xF00) == 0) {
      dirPref[i] = (dirPref[i] & 0xF) | dirPref[i] >> 8;
    }

    if ((dirPref[i] & 0xF0000) == 0) {
      dirPref[i] = (dirPref[i] & 0xFFFF) |
        ((dirPref[i] & 0xF000000) >> 8);
    }

    dir[i] = dirPref[i] & 0xF;

    if (portConstraint[i] == DIRECTION_MASK_WEST ||
      portConstraint[i] == DIRECTION_MASK_NORTH ||
      portConstraint[i] == DIRECTION_MASK_EAST ||
      portConstraint[i] == DIRECTION_MASK_SOUTH) {
      dir[i] = portConstraint[i];
    }
  }

  //==============================================================
  // End of source and target direction determination

  let sourceIndex = dir[0] == DIRECTION_MASK_EAST ? 3
    : dir[0];
  let targetIndex = dir[1] == DIRECTION_MASK_EAST ? 3
    : dir[1];

  sourceIndex -= quad;
  targetIndex -= quad;

  if (sourceIndex < 1) {
    sourceIndex += 4;
  }

  if (targetIndex < 1) {
    targetIndex += 4;
  }

  const routePattern = routePatterns[sourceIndex - 1][targetIndex - 1];

  const wayPoints1 = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
    [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];

  wayPoints1[0][0] = geo[0][0];
  wayPoints1[0][1] = geo[0][1];

  switch (dir[0]) {
    case DIRECTION_MASK_WEST:
      wayPoints1[0][0] -= sourceBuffer;
      wayPoints1[0][1] += constraint[0][1] * geo[0][3];
      break;
    case DIRECTION_MASK_SOUTH:
      wayPoints1[0][0] += constraint[0][0] * geo[0][2];
      wayPoints1[0][1] += geo[0][3] + sourceBuffer;
      break;
    case DIRECTION_MASK_EAST:
      wayPoints1[0][0] += geo[0][2] + sourceBuffer;
      wayPoints1[0][1] += constraint[0][1] * geo[0][3];
      break;
    case DIRECTION_MASK_NORTH:
      wayPoints1[0][0] += constraint[0][0] * geo[0][2];
      wayPoints1[0][1] -= sourceBuffer;
      break;
  }

  let currentIndex = 0;

  // Orientation, 0 horizontal, 1 vertical
  let lastOrientation = (dir[0] & (DIRECTION_MASK_EAST | DIRECTION_MASK_WEST)) > 0 ? 0
    : 1;
  const initialOrientation = lastOrientation;
  let currentOrientation = 0;

  for (let i = 0; i < routePattern.length; i++) {
    const nextDirection = routePattern[i] & 0xF;

    // Rotate the index of this direction by the quad
    // to get the real direction
    let directionIndex = nextDirection == DIRECTION_MASK_EAST ? 3
      : nextDirection;

    directionIndex += quad;

    if (directionIndex > 4) {
      directionIndex -= 4;
    }

    const direction = dirVectors[directionIndex - 1];

    currentOrientation = (directionIndex % 2 > 0) ? 0 : 1;
    // Only update the current index if the point moved
    // in the direction of the current segment move,
    // otherwise the same point is moved until there is
    // a segment direction change
    if (currentOrientation != lastOrientation) {
      currentIndex++;
      // Copy the previous way point into the new one
      // We can't base the new position on index - 1
      // because sometime elbows turn out not to exist,
      // then we'd have to rewind.
      wayPoints1[currentIndex][0] = wayPoints1[currentIndex - 1][0];
      wayPoints1[currentIndex][1] = wayPoints1[currentIndex - 1][1];
    }

    const tar = (routePattern[i] & TARGET_MASK) > 0;
    const sou = (routePattern[i] & SOURCE_MASK) > 0;
    let side = (routePattern[i] & SIDE_MASK) >> 5;
    side = side << quad;

    if (side > 0xF) {
      side = side >> 4;
    }

    const center = (routePattern[i] & CENTER_MASK) > 0;

    if ((sou || tar) && side < 9) {
      let limit = 0;
      const souTar = sou ? 0 : 1;

      if (center && currentOrientation == 0) {
        limit = geo[souTar][0] + constraint[souTar][0] * geo[souTar][2];
      } else if (center) {
        limit = geo[souTar][1] + constraint[souTar][1] * geo[souTar][3];
      } else {
        limit = limits[souTar][side];
      }

      if (currentOrientation == 0) {
        const lastX = wayPoints1[currentIndex][0];
        const deltaX = (limit - lastX) * direction[0];

        if (deltaX > 0) {
          wayPoints1[currentIndex][0] += direction[0] *
            deltaX;
        }
      } else {
        const lastY = wayPoints1[currentIndex][1];
        const deltaY = (limit - lastY) * direction[1];

        if (deltaY > 0) {
          wayPoints1[currentIndex][1] += direction[1] *
            deltaY;
        }
      }
    } else if (center) {
      // Which center we're travelling to depend on the current direction
      wayPoints1[currentIndex][0] += direction[0] *
        Math.abs(vertexSeperations[directionIndex] / 2);
      wayPoints1[currentIndex][1] += direction[1] *
        Math.abs(vertexSeperations[directionIndex] / 2);
    }

    if (currentIndex > 0 &&
      wayPoints1[currentIndex][currentOrientation] == wayPoints1[currentIndex - 1][currentOrientation]) {
      currentIndex--;
    } else {
      lastOrientation = currentOrientation;
    }
  }

  for (let i = 0; i <= currentIndex; i++) {
    if (i == currentIndex) {
      // Last point can cause last segment to be in
      // same direction as jetty/approach. If so,
      // check the number of points is consistent
      // with the relative orientation of source and target
      // jx. Same orientation requires an even
      // number of turns (points), different requires
      // odd.
      const targetOrientation = (dir[1] & (DIRECTION_MASK_EAST | DIRECTION_MASK_WEST)) > 0 ? 0
        : 1;
      const sameOrient = targetOrientation == initialOrientation ? 0 : 1;

      // (currentIndex + 1) % 2 is 0 for even number of points,
      // 1 for odd
      if (sameOrient != (currentIndex + 1) % 2) {
        // The last point isn't required
        break;
      }
    }

    // Rounds in model units so that the result does not depend on the scale or translate
    result.push(pt((Math.round(wayPoints1[i][0] * 10) / 10 +
      state.view.translate.x) * state.view.scale,
    (Math.round(wayPoints1[i][1] * 10) / 10 +
      state.view.translate.y) * state.view.scale));
  }

  // Removes duplicates
  let index = 1;

  while (index < result.length) {
    const a = result[index - 1];
    const b = result[index];

    if (a == null || b == null ||
      a.x != b.x ||
      a.y != b.y) {
      index++;
    } else {
      result.splice(index, 1);
    }
  }
};

/**
 * The route pattern for the given directions and quad, using the inline
 * patterns if the terminals are aligned. Unused by draw.io, whose copy
 * refers to the tables without their namespace.
 */
export function getRoutePattern(dir: readonly number[], quad: number, dx: number, dy: number): readonly number[] {
  let sourceIndex = dir[0] == DIRECTION_MASK_EAST ? 3
    : dir[0];
  let targetIndex = dir[1] == DIRECTION_MASK_EAST ? 3
    : dir[1];

  sourceIndex -= quad;
  targetIndex -= quad;

  if (sourceIndex < 1) {
    sourceIndex += 4;
  }
  if (targetIndex < 1) {
    targetIndex += 4;
  }

  let result = routePatterns[sourceIndex - 1][targetIndex - 1];

  if (dx == 0 || dy == 0) {
    const inline = inlineRoutePatterns[sourceIndex - 1][targetIndex - 1];

    if (inline != null) {
      result = inline;
    }
  }

  return result;
}

// --- Shapes.js: sequence messages -----------------------------------------------------

/** Graph.sequenceSelfCallSize: width and default height of a self-call. */
export const SEQUENCE_SELF_CALL_SIZE = 30;

function lifelineOf(state: VertexState): string | null {
  return state.lifeline != null ? state.lifeline : state.id;
}

/**
 * Returns the two waypoints of a self-call that leaves the given terminal
 * state at y1 and returns at y2 (all in view coordinates): the loop runs
 * sequenceSelfCallSize to the right of the anchor at y1.
 */
function getSequenceSelfCallPoints(view: EdgeStyleView, state: VertexState, y1: number, y2: number): Point[] {
  const size = SEQUENCE_SELF_CALL_SIZE * view.scale;
  const p = view.getPerimeterPoint(state, pt(
    state.x + state.width + size, y1), false);
  const x = ((p != null) ? p.x : state.x + state.width) + size;

  return [pt(x, y1), pt(x, y2)];
}

/**
 * Returns the topmost (top is true) or bottommost y at which the given
 * terminal state anchors a connection, by probing its perimeter far above
 * or below the shape. Works for any perimeter (lifelinePerimeter clamps to
 * the body below the head, orthogonalPerimeter to the shape bounds) and
 * returns the shape center for a shape with no perimeter.
 */
function getSequenceAnchorY(view: EdgeStyleView, terminal: VertexState, top: boolean): number {
  const far = centerY(terminal) + (top ? -1e5 : 1e5);
  const p = view.getPerimeterPoint(terminal, pt(
    centerX(terminal), far), false);

  return (p != null) ? p.y : (top ? terminal.y : terminal.y + terminal.height);
}

/**
 * Returns the x for the routed point of a sequence message: the middle
 * between the two terminals, pushed out of both. A point inside a terminal
 * that uses an orthogonal perimeter (the activation bar is only 10px wide,
 * so the middle can land inside it) is projected onto that terminal's top
 * or bottom edge instead of its side, which would tilt the message.
 */
function getSequenceMessageX(view: EdgeStyleView, source: VertexState, target: VertexState): number {
  let x = (centerX(source) + centerX(target)) / 2;
  const dir = (centerX(source) <= centerX(target)) ? 1 : -1;

  const clear = (terminal: VertexState, side: number) => {
    if (x > terminal.x && x < terminal.x + terminal.width) {
      const px = view.getPixelSize();
      x = (side > 0) ? terminal.x + terminal.width + px : terminal.x - px;
    }
  };

  clear(source, dir);
  clear(target, -dir);

  return x;
}

/**
 * Routes a UML sequence message as a horizontal line at the message's own y.
 *
 * A message between two floating terminals has no y of its own: the
 * floating endpoints are resolved against the opposite terminal's center
 * (see mxGraphView.getNextPoint), so both ends collapse onto that center
 * line and the message jumps to the vertical center of its terminals on
 * every connect, reconnect and re-route. This style gives the message a y
 * and emits it as the single routed point, which both floating endpoints
 * then resolve against (lifelinePerimeter and orthogonalPerimeter both keep
 * the y of the next point), so the message stays where it was put.
 *
 * The y is taken from, in order of precedence:
 *
 * 1. a pinned endpoint (exitX/entryX or a dangling terminal point), since
 *    the routed point cannot move it and the message would kink,
 * 2. the single waypoint, where Graph.setSequenceMessageY stores the
 *    message y (the encoding the mermaid sequence renderer emits),
 * 3. the middle between the two terminal centers, so a message with no
 *    stored y (older diagram, cleared waypoints) is at least horizontal.
 *
 * For 2. and 3. the y is clamped to the vertical range both terminals can
 * anchor in, so moving or shortening an activation bar keeps the message
 * horizontal instead of tilting it towards the clamped end.
 */
export const SequenceMessage: EdgeStyleFunction = (state, source, target, points, result) => {
  const view = state.view;
  const pts = state.absolutePoints;
  const p0 = pts[0];
  const pe = pts[pts.length - 1];

  // A self-call (both ends on one lifeline) is a loop that leaves at the
  // y of the first waypoint (or pinned source) and returns at the y of the
  // last waypoint (or pinned target), at the x of the first waypoint. A
  // loop with more waypoints (eg. a curve) keeps them (see below).
  if (source != null && target != null &&
    (points == null || points.length <= 2) &&
    lifelineOf(source) == lifelineOf(target)) {
    const size = SEQUENCE_SELF_CALL_SIZE * view.scale;
    const first = (points != null && points.length > 0 && points[0] != null) ?
      view.transformControlPoint(state, points[0]) : null;
    const last = (points != null && points.length > 1 && points[points.length - 1] != null) ?
      view.transformControlPoint(state, points[points.length - 1]) : null;
    const y1 = (p0 != null) ? p0.y : ((first != null) ? first.y : centerY(source));
    const y2 = (pe != null) ? pe.y : ((last != null) ? last.y : y1 + size);
    const x = (first != null) ? first.x : getSequenceSelfCallPoints(view, source, y1, y2)[0].x;

    if (Number.isFinite(x) && Number.isFinite(y1) && Number.isFinite(y2)) {
      result.push(pt(x, y1));
      result.push(pt(x, y2));
    }

    return;
  }

  // Hand-routed message (more than one waypoint) or a self-message keeps
  // its waypoints, which are not used at all for a routed edge style
  if ((points != null && points.length > 1) ||
    source == null || target == null || source == target) {
    if (points != null) {
      for (let i = 0; i < points.length; i++) {
        if (points[i] != null) {
          result.push(view.transformControlPoint(state, points[i]));
        }
      }
    }

    return;
  }

  // Both ends pinned: the endpoints define the message, nothing to align
  if (p0 != null && pe != null) {
    return;
  }

  let y: number;

  if (p0 != null || pe != null) {
    const floating = (p0 != null) ? target : source;
    y = (p0 != null) ? p0.y : pe!.y;

    // A pinned y out of reach of the floating end gives a straight line
    // (the floating end is clamped towards the pin) instead of a kink
    if (y < getSequenceAnchorY(view, floating, true) ||
      y > getSequenceAnchorY(view, floating, false)) {
      return;
    }
  } else {
    const p = (points != null && points.length > 0 && points[0] != null) ?
      view.transformControlPoint(state, points[0]) : null;

    // Ignores a stored y that is not a number (invalid input)
    y = (p != null && Number.isFinite(p.y)) ? p.y :
      (centerY(source) + centerY(target)) / 2;

    const top = Math.max(getSequenceAnchorY(view, source, true),
      getSequenceAnchorY(view, target, true));
    const bottom = Math.min(getSequenceAnchorY(view, source, false),
      getSequenceAnchorY(view, target, false));

    // Terminals with no common range give a straight line between them
    if (!(top <= bottom)) {
      return;
    }

    y = Math.min(bottom, Math.max(top, y));
  }

  if (Number.isFinite(y)) {
    result.push(pt(getSequenceMessageX(view, source, target), y));
  }
};

// --- Shapes.js: isometric connector ------------------------------------------------------

const isoHVector = (() => {
  const alpha1 = toRadians(-30);
  return getRotatedPoint(pt(1, 0), Math.cos(alpha1), Math.sin(alpha1));
})();

const isoVVector = (() => {
  const alpha2 = toRadians(-150);
  return getRotatedPoint(pt(1, 0), Math.cos(alpha2), Math.sin(alpha2));
})();

export const IsometricConnector: EdgeStyleFunction = (state, source, target, points, result) => {
  const view = state.view;
  let p: Point | null = (points != null && points.length > 0) ? points[0] : null;
  const pts = state.absolutePoints;
  let p0 = pts[0];
  let pe = pts[pts.length - 1];

  if (p != null) {
    p = view.transformControlPoint(state, p);
  }

  if (p0 == null) {
    if (source != null) {
      p0 = pt(centerX(source), centerY(source));
    }
  }

  if (pe == null) {
    if (target != null) {
      pe = pt(centerX(target), centerY(target));
    }
  }

  const a1 = isoHVector.x;
  const a2 = isoHVector.y;

  const b1 = isoVVector.x;
  const b2 = isoVVector.y;

  const elbow = getValue(state.style, 'elbow', 'horizontal') == 'horizontal';

  if (pe != null && p0 != null) {
    let last: Point = p0;

    const isoLineTo = (x: number, y: number, ignoreFirst: boolean) => {
      const c1 = x - last.x;
      const c2 = y - last.y;

      // Solves for isometric base vectors
      const h = (b2 * c1 - b1 * c2) / (a1 * b2 - a2 * b1);
      const v = (a2 * c1 - a1 * c2) / (a2 * b1 - a1 * b2);

      if (elbow) {
        if (ignoreFirst) {
          last = pt(last.x + a1 * h, last.y + a2 * h);
          result.push(last);
        }

        last = pt(last.x + b1 * v, last.y + b2 * v);
        result.push(last);
      } else {
        if (ignoreFirst) {
          last = pt(last.x + b1 * v, last.y + b2 * v);
          result.push(last);
        }

        last = pt(last.x + a1 * h, last.y + a2 * h);
        result.push(last);
      }
    };

    if (p == null) {
      p = pt(p0.x + (pe.x - p0.x) / 2, p0.y + (pe.y - p0.y) / 2);
    }

    isoLineTo(p.x, p.y, true);
    isoLineTo(pe.x, pe.y, false);
  }
};

// --- mxStyleRegistry ----------------------------------------------------------------------

/**
 * Edge styles by their style name (`edgeStyle=…`, `loopStyle=…`), as
 * registered with mxStyleRegistry by mxGraph and draw.io (draw.io replaces
 * the elbow styles with its copies). No prototype, so names from a style
 * cannot resolve inherited members.
 */
export const EDGE_STYLES: Readonly<Record<string, EdgeStyleFunction>> = Object.assign(Object.create(null) as Record<string, EdgeStyleFunction>, {
  elbowEdgeStyle: ElbowConnector,
  entityRelationEdgeStyle: EntityRelation,
  loopEdgeStyle: Loop,
  sideToSideEdgeStyle: SideToSide,
  topToBottomEdgeStyle: TopToBottom,
  orthogonalEdgeStyle: OrthConnector,
  segmentEdgeStyle: SegmentConnector,
  sequenceEdgeStyle: SequenceMessage,
  isometricEdgeStyle: IsometricConnector,
});

/** The edge style function registered under the given name, or null. */
export function getEdgeStyleFunction(name: string | null | undefined): EdgeStyleFunction | null {
  return name != null ? EDGE_STYLES[name] ?? null : null;
}

/**
 * mxGraph.isOrthogonalEdgeStyle: true if the given edge style function
 * routes orthogonally, which implies `orthogonal` if the style does not
 * define it.
 */
export function isOrthogonalEdgeStyle(edgeStyle: EdgeStyleFunction | null): boolean {
  return edgeStyle == SegmentConnector ||
    edgeStyle == ElbowConnector ||
    edgeStyle == SideToSide ||
    edgeStyle == TopToBottom ||
    edgeStyle == EntityRelation ||
    edgeStyle == OrthConnector;
}

/**
 * mxGraphView.isDuplicatePointsRemoved with the isometric override of
 * Shapes.js: true for edge styles that compute the waypoints and do not map
 * them to control points.
 */
export function isDuplicatePointsRemoved(edgeStyle: EdgeStyleFunction | null, points: readonly Point[] | null): boolean {
  return edgeStyle == IsometricConnector ||
    (edgeStyle == OrthConnector && (points == null || points.length == 0)) ||
    edgeStyle == ElbowConnector || edgeStyle == SideToSide ||
    edgeStyle == TopToBottom || edgeStyle == EntityRelation;
}
