/*
 * Behaviour follows draw.io (jgraph/drawio 32.7.4, Apache License 2.0):
 * js/grapheditor/Graph.js (HoverIcons, connectVertex, the mxEdgeHandler and
 * mxConstraintHandler overrides), mxgraph/src/handler/mxEdgeHandler.js,
 * mxEdgeSegmentHandler.js, mxElbowEdgeHandler.js, mxConstraintHandler.js,
 * mxConnectionHandler.js (createTargetVertex) and mxGraphHandler.js
 * (selection propagation, drop targets). Modified for DeckWerk: the
 * geometry only, DOM-free, in slide pixels; the editor module
 * (renderer/editor/diagramEditing.ts) draws and dispatches.
 *
 * Coordinates. Everything here is in slide pixels unless it says draw.io
 * units. A cell's draw.io units are (slide px − origin) ÷ scale; draw.io's
 * own view coordinates are units × view scale, which is what slide pixels
 * are up to the origin, so draw.io's view-space tolerances (a pixel of the
 * route, a rounded difference) are applied to slide pixels. Tolerances that
 * draw.io measures on screen (the 4 px hit tolerance, the hover arrows) are
 * given in screen pixels and divided by the canvas zoom (`zoom`, screen
 * pixels per slide pixel).
 */

import type { ConnectorEl, SlideElement, VertexEl } from '../deck.js';
import {
  ElbowConnector, EntityRelation, Loop, OrthConnector, SegmentConnector, SideToSide, TopToBottom,
} from './edgeStyle.js';
import { connectorStyle, routeConnector, terminalView, vertexStyle } from './element.js';
import { shapeConstraints } from './paint.js';
import {
  connectionPoint, edgeConstraint, edgeOwnLabelPoint, edgeStyleOf, perimeterPoint, relativePointOnRoute,
  type ConnectionConstraint,
} from './route.js';
import {
  getPerimeterFunction, getRoundedPerimeterArcCenter, getRoundedPerimeterArcSize, getStylePerimeter,
  isRoundedPerimeter, isRoundedPolygonPerimeter, type PerimeterVertex,
} from './perimeter.js';
import { getStyleValue, parseStyleString, resolveStyle, setStyleValue, styleNames } from './style.js';
import type { Point, Rect, Style } from './types.js';

// --- draw.io's constants -------------------------------------------------------

/** HoverIcons and Graph defaults. Pixel values are screen pixels. */
export const HOVER = {
  /** HoverIcons.arrowSpacing */
  arrowSpacing: 2,
  /** HoverIcons.updateDelay: switching to another shape while inside the icons' box. */
  updateDelay: 500,
  /** HoverIcons.activationDelay: time on a shape before its arrows show. */
  activationDelay: 140,
  /** HoverIcons.inactiveOpacity, as a fraction. */
  inactiveOpacity: 0.15,
  /** mxGraph.tolerance */
  tolerance: 4,
  /** The hover box is grown by this much (HoverIcons.repaint). */
  bboxGrow: 10,
} as const;

/** Graph.defaultEdgeLength, in draw.io units. */
export const DEFAULT_EDGE_LENGTH = 80;

/** mxEdgeHandler.virtualBendOpacity, as a fraction. */
export const VIRTUAL_BEND_OPACITY = 0.4;

/** The arrow images' sizes (HoverIcons.triangleUp, …), screen pixels. */
export const ARROW_SIZE: Readonly<Record<Direction, { w: number; h: number }>> = {
  north: { w: 18, h: 28 },
  east: { w: 26, h: 18 },
  south: { w: 18, h: 26 },
  west: { w: 28, h: 18 },
};

/** mxConstraintHandler.pointImage is 5 × 5 screen pixels. */
export const POINT_ICON_SIZE = 5;

export type Direction = 'north' | 'east' | 'south' | 'west';
export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

// --- small helpers ---------------------------------------------------------------

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** mxUtils.intersects for two rectangles. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function growRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + 2 * amount, height: r.height + 2 * amount };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** mxUtils.ptSegDistSq */
export function ptSegDistSq(a: Point, b: Point, p: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const dx = a.x + t * vx - p.x;
  const dy = a.y + t * vy - p.y;
  return dx * dx + dy * dy;
}

/** mxEdgeHandler.roundLength: two decimals, so fractional grids are kept. */
export function roundLength(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A cell's frame: where draw.io's page origin sits on the slide and its view scale. */
export interface CellFrame {
  origin: Point;
  scale: number;
}

export function frameOf(el: Pick<VertexEl, 'origin' | 'scale'>): CellFrame {
  return { origin: el.origin ?? { x: 0, y: 0 }, scale: el.scale || 1 };
}

export function toUnits(p: Point, frame: CellFrame): Point {
  return { x: (p.x - frame.origin.x) / frame.scale, y: (p.y - frame.origin.y) / frame.scale };
}

export function fromUnits(p: Point, frame: CellFrame): Point {
  return { x: frame.origin.x + p.x * frame.scale, y: frame.origin.y + p.y * frame.scale };
}

/**
 * mxEdgeHandler.convertPoint without the grid: a slide point rounded the
 * way draw.io stores a waypoint (two decimals of a draw.io unit), returned
 * in slide pixels.
 */
export function storedPoint(p: Point, frame: CellFrame): Point {
  const u = toUnits(p, frame);
  return fromUnits({ x: roundLength(u.x), y: roundLength(u.y) }, frame);
}

/** mxGraph.snap on the diagram's grid (draw.io units), in slide pixels. */
export function snapToGrid(p: Point, frame: CellFrame, gridSize: number): Point {
  if (!(gridSize > 0)) return p;
  const u = toUnits(p, frame);
  return fromUnits({ x: Math.round(u.x / gridSize) * gridSize, y: Math.round(u.y / gridSize) * gridSize }, frame);
}

/** The bounds of a box turned by `rot` degrees about its centre. */
export function rotatedBox(box: { x: number; y: number; w: number; h: number; rot?: number }): Rect {
  const rot = box.rot ?? 0;
  if (!rot) return { x: box.x, y: box.y, width: box.w, height: box.h };
  const rad = (rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = box.w * cos + box.h * sin;
  const h = box.w * sin + box.h * cos;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/** True if `p` lies in the (possibly rotated) box of an element. */
export function boxContains(box: { x: number; y: number; w: number; h: number; rot?: number }, p: Point, tolerance = 0): boolean {
  let { x, y } = p;
  if (box.rot) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rad = (-box.rot * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }
  return x >= box.x - tolerance && x <= box.x + box.w + tolerance && y >= box.y - tolerance && y <= box.y + box.h + tolerance;
}

// --- hover icons -------------------------------------------------------------------

/**
 * Where HoverIcons.repaint puts the four arrows around a shape: its
 * (rotated) bounds grown by the graph tolerance and the arrow spacing,
 * the arrows centred on the shape's middle, positions rounded on screen.
 * `zoom` is screen pixels per slide pixel; the result is in slide pixels.
 */
export function hoverArrowRects(bounds: Rect, center: Point, zoom: number): Record<Direction, Rect> {
  const s = zoom;
  const grow = HOVER.tolerance + HOVER.arrowSpacing;
  const bx = bounds.x * s - grow;
  const by = bounds.y * s - grow;
  const bw = bounds.width * s + 2 * grow;
  const bh = bounds.height * s + 2 * grow;
  const cx = center.x * s;
  const cy = center.y * s;
  const upX = Math.round(cx - ARROW_SIZE.north.w / 2);
  const upY = Math.round(by - ARROW_SIZE.north.h);
  const rightX = Math.round(bx + bw);
  const rightY = Math.round(cy - ARROW_SIZE.east.h / 2);
  const screen: Record<Direction, Rect> = {
    north: { x: upX, y: upY, width: ARROW_SIZE.north.w, height: ARROW_SIZE.north.h },
    east: { x: rightX, y: rightY, width: ARROW_SIZE.east.w, height: ARROW_SIZE.east.h },
    south: { x: upX, y: Math.round(by + bh), width: ARROW_SIZE.south.w, height: ARROW_SIZE.south.h },
    west: { x: Math.round(bx - ARROW_SIZE.west.w), y: rightY, width: ARROW_SIZE.west.w, height: ARROW_SIZE.west.h },
  };
  const out = {} as Record<Direction, Rect>;
  for (const dir of DIRECTIONS) {
    const r = screen[dir];
    out[dir] = { x: r.x / s, y: r.y / s, width: r.width / s, height: r.height / s };
  }
  return out;
}

/**
 * The points HoverIcons.repaint probes for a shape beside each arrow
 * (checkCollisions): half an arrow beyond the grown bounds, on the
 * shape's middle lines. Slide pixels.
 */
export function hoverCollisionProbes(bounds: Rect, center: Point, zoom: number): Record<Direction, Point> {
  const grow = (HOVER.tolerance + HOVER.arrowSpacing) / zoom;
  const b = growRect(bounds, grow);
  return {
    east: { x: b.x + b.width + ARROW_SIZE.east.w / 2 / zoom, y: center.y },
    west: { x: b.x - ARROW_SIZE.west.w / 2 / zoom, y: center.y },
    north: { x: center.x, y: b.y - ARROW_SIZE.north.h / 2 / zoom },
    south: { x: center.x, y: b.y + b.height + ARROW_SIZE.south.h / 2 / zoom },
  };
}

/**
 * HoverIcons' collision rule: an arrow is hidden when another shape lies
 * beside it, unless that shape is an ancestor of the hovered one, a
 * swimlane, or at least three times its size in either direction; and all
 * four show when the same shape is behind all of them.
 */
export function visibleArrows(
  hovered: { w: number; h: number },
  beside: Record<Direction, { id: string; w: number; h: number; ignore: boolean } | null>,
): Record<Direction, boolean> {
  const ids = DIRECTIONS.map((d) => beside[d]?.id ?? null);
  const sameEverywhere = ids[0] != null && ids.every((id) => id === ids[0]);
  const out = {} as Record<Direction, boolean>;
  for (const dir of DIRECTIONS) {
    const cell = sameEverywhere ? null : beside[dir];
    out[dir] = !(cell != null && !cell.ignore && cell.h < 3 * hovered.h && cell.w < 3 * hovered.w);
  }
  return out;
}

/** HoverIcons' memory between two mouse events. */
export interface HoverMemory {
  /** The cell under the pointer at the last event (HoverIcons.prev). */
  prev: string | null;
  /** When the pointer reached `prev` (HoverIcons.startTime). */
  startTime: number | null;
  /** The cell whose arrows are shown (HoverIcons.currentState). */
  current: string | null;
}

export interface HoverStep {
  memory: HoverMemory;
  /** The cell to show arrows for now, null to hide them, undefined to leave them. */
  show?: string | null;
  /** Start the timer that repeats the update when the pointer rests (updateDelay + 10 ms). */
  armTimer: boolean;
  /** Cancel that timer. */
  clearTimer: boolean;
}

/**
 * HoverIcons.update as a pure step: which arrows to show for the cell under
 * the pointer at time `now`. `inside` says whether the pointer is in the
 * current icons' box (null when there is no box or no pointer position);
 * `active` whether an arrow is being hovered or dragged.
 */
export function hoverStep(memory: HoverMemory, cell: string | null, now: number, inside: boolean | null, active = false): HoverStep {
  let { prev, startTime, current } = memory;
  let timeOnTarget = 0;
  let armTimer = false;
  let clearTimer = false;
  let show: string | null | undefined;

  if (prev !== cell || active) {
    startTime = now;
    prev = cell;
    timeOnTarget = 0;
    clearTimer = true;
    if (cell != null) armTimer = true;
  } else if (startTime != null) {
    timeOnTarget = now - startTime;
  }

  if (current != null && current !== cell && timeOnTarget < HOVER.activationDelay && inside === false) {
    // reset(false): hides the arrows but keeps the timer
    current = null;
    show = null;
  } else if (current != null || timeOnTarget > HOVER.activationDelay) {
    if (current !== cell && ((timeOnTarget > HOVER.updateDelay && cell != null) || inside !== true)) {
      if (cell != null) {
        current = cell;
        show = cell;
      } else {
        current = null;
        show = null;
        clearTimer = true;
      }
    }
  }
  return { memory: { prev, startTime, current }, show, armTimer, clearTimer };
}

// --- connectVertex: where a clone goes -------------------------------------------------

/**
 * Graph.connectVertex: the point `length` beyond the middle of the side of
 * `box` facing `dir` (where draw.io looks for an existing target), and the
 * box of a clone of `size` placed there (centred one half-size further on).
 */
export function connectTarget(box: Rect, dir: Direction, length: number, size: { width: number; height: number } = box): { probe: Point; clone: Rect } {
  const probe = { x: box.x, y: box.y };
  const pt = { x: box.x, y: box.y };
  if (dir === 'north') {
    probe.x += box.width / 2;
    probe.y -= length;
  } else if (dir === 'south') {
    probe.x += box.width / 2;
    probe.y += box.height + length;
  } else if (dir === 'west') {
    probe.x -= length;
    probe.y += box.height / 2;
  } else {
    probe.x += box.width + length;
    probe.y += box.height / 2;
  }
  pt.x = probe.x;
  pt.y = probe.y;
  // duplicate: the source's half size moves the centre on (draw.io uses the
  // source geometry here, the clone's own for its box)
  if (dir === 'north') pt.y -= box.height / 2;
  else if (dir === 'south') pt.y += box.height / 2;
  else if (dir === 'west') pt.x -= box.width / 2;
  else pt.x += box.width / 2;
  return { probe, clone: { x: pt.x - size.width / 2, y: pt.y - size.height / 2, width: size.width, height: size.height } };
}

/**
 * mxConnectionHandler.createTargetVertex: a clone of the source centred on
 * the drop point, rounded to draw.io units, and aligned with the source
 * where it is within `tolerance` units of it.
 */
export function dropClonePlacement(source: Rect, drop: Point, frame: CellFrame, tolerance = HOVER.tolerance): Rect {
  const u = toUnits(drop, frame);
  const su = toUnits({ x: source.x, y: source.y }, frame);
  const w = source.width / frame.scale;
  const h = source.height / frame.scale;
  let x = Math.round(u.x - w / 2);
  let y = Math.round(u.y - h / 2);
  if (Math.abs(su.x - x) <= tolerance) x = Math.round(su.x);
  if (Math.abs(su.y - y) <= tolerance) y = Math.round(su.y);
  const at = fromUnits({ x, y }, frame);
  return { x: at.x, y: at.y, width: source.width, height: source.height };
}

// --- connection points --------------------------------------------------------------

/**
 * A vertex's connection points (the blue x's) in slide pixels, from its
 * `points` style or its shape (Graph.getAllConnectionConstraints), each
 * placed as draw.io places the icon (Graph.getConnectionPoint).
 */
export function vertexConnectionPoints(el: VertexEl): Array<{ constraint: ConnectionConstraint; at: Point }> {
  const style = vertexStyle(el);
  const frame = frameOf(el);
  const constraints = shapeConstraints(style, { width: el.w / frame.scale, height: el.h / frame.scale }) ?? [];
  const view = terminalView(el, frame);
  const out: Array<{ constraint: ConnectionConstraint; at: Point }> = [];
  for (const c of constraints) {
    const p = connectionPoint(view, c, true);
    if (p) out.push({ constraint: { x: c.x, y: c.y, perimeter: c.perimeter, dx: c.dx, dy: c.dy }, at: fromUnits(p, frame) });
  }
  return out;
}

/**
 * mxConstraintHandler.update: the connection point whose icon the mouse
 * touches (icon and mouse rectangles, the mouse grown by the tolerance),
 * nearest first; -1 for none. `zoom` converts the screen sizes.
 */
export function nearestConnectionPoint(points: readonly Point[], pointer: Point, zoom: number,
  tolerance: number = HOVER.tolerance): number {
  const half = POINT_ICON_SIZE / 2 / zoom;
  const tol = tolerance / zoom;
  const mouse = { x: pointer.x - tol, y: pointer.y - tol, width: 2 * tol, height: 2 * tol };
  let best = -1;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const icon = { x: p.x - half, y: p.y - half, width: 2 * half, height: 2 * half };
    if (!rectsIntersect(icon, mouse)) return;
    const d = (p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * The area in which draw.io keeps a shape's connection points showing
 * (mxConstraintHandler.currentFocusArea): its box and every icon, grown by
 * the tolerance.
 */
export function focusArea(box: Rect, points: readonly Point[], zoom: number): Rect {
  const half = POINT_ICON_SIZE / 2 / zoom;
  const rects = [box, ...points.map((p) => ({ x: p.x - half, y: p.y - half, width: 2 * half, height: 2 * half }))];
  return growRect(unionRects(rects)!, HOVER.tolerance / zoom);
}

/**
 * mxGraph.setConnectionConstraint on a style string: a fixed point writes
 * the X/Y fractions and the offsets, and `…Perimeter=0` only when it is not
 * projected (1 is the default); a floating end removes all five keys.
 */
export function withConnectionConstraint(dio: string, source: boolean, constraint: ConnectionConstraint | null): string {
  const p = source ? 'exit' : 'entry';
  let out = dio;
  if (!constraint) {
    for (const key of ['X', 'Y', 'Dx', 'Dy', 'Perimeter']) out = setStyleValue(out, `${p}${key}`, null);
    return out;
  }
  out = setStyleValue(out, `${p}X`, constraint.x);
  out = setStyleValue(out, `${p}Y`, constraint.y);
  out = setStyleValue(out, `${p}Dx`, constraint.dx ?? 0);
  out = setStyleValue(out, `${p}Dy`, constraint.dy ?? 0);
  out = setStyleValue(out, `${p}Perimeter`, constraint.perimeter === false ? '0' : null);
  return out;
}

/** The fixed connection point an end of a connector is attached to, or null when it floats. */
export function endConstraint(el: Pick<ConnectorEl, 'dio'>, source: boolean): ConnectionConstraint | null {
  return edgeConstraint(connectorStyle(el), source);
}

/**
 * Graph.applyNewEdgeStyle: the keys of the source's `newEdgeStyle` (a JSON
 * object) written over the new edge's style, with the elbow set from the
 * direction for elbowEdgeStyle.
 */
export function applyNewEdgeStyle(edgeDio: string, source: Pick<VertexEl, 'dio'> | null, dir: Direction | null = null): string {
  const raw = source ? getStyleValue(source.dio, 'newEdgeStyle') : null;
  if (!raw) return edgeDio;
  let out = edgeDio;
  try {
    // Graph.decodeNewEdgeStyle: URI-encoded when it starts with '%'
    const styles = JSON.parse(raw.charAt(0) === '%' ? decodeURIComponent(raw) : raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(styles)) {
      out = setStyleValue(out, key, value == null ? null : String(value));
      if (key === 'edgeStyle' && value === 'elbowEdgeStyle' && dir != null) {
        out = setStyleValue(out, 'elbow', dir === 'south' || dir === 'north' ? 'vertical' : 'horizontal');
      }
    }
  } catch {
    // ignore, as draw.io does
  }
  return out;
}

// --- the selected connector's handles -------------------------------------------------

/**
 * Which of draw.io's edge handlers a connector gets (mxGraph.createEdgeHandler
 * and the self-loop override in Graph.js): elbow (one middle handle),
 * segment (a handle per segment) or default (waypoints and virtual bends;
 * entity-relation edges show only their ends).
 */
export type EdgeHandlerKind = 'default' | 'elbow' | 'segment' | 'entity';

export function edgeHandlerKind(el: Pick<ConnectorEl, 'dio' | 'source' | 'target'>): EdgeHandlerKind {
  const fn = edgeStyleOf(connectorStyle(el));
  if (el.source != null && el.source === el.target) return 'segment';
  if (fn === Loop || fn === ElbowConnector || fn === SideToSide || fn === TopToBottom) return 'elbow';
  if (fn === SegmentConnector || fn === OrthConnector) return 'segment';
  if (fn === EntityRelation) return 'entity';
  return 'default';
}

/** Looks of a terminal handle (mxEdgeHandler.createHandleShape in Graph.js). */
export type TerminalLook = 'fixed' | 'terminal' | 'loose';

/**
 * A fixed connection point shows the green handle, an end attached to a
 * shape's perimeter the blue ringed one, a loose end the plain blue one.
 */
export function terminalLook(el: Pick<ConnectorEl, 'dio' | 'source' | 'target'>, source: boolean): TerminalLook {
  const attached = source ? el.source : el.target;
  if (!attached) return 'loose';
  return endConstraint(el, source) ? 'fixed' : 'terminal';
}

export interface EdgeHandle {
  kind: 'terminal' | 'bend' | 'virtual' | 'segment' | 'elbow';
  /** terminal: 0 source, 1 target. bend: index in the route. virtual: segment index. segment: handle index (1-based, draw.io's bend index). */
  index: number;
  at: Point;
  /** Drawn at the virtual bend opacity. */
  faint?: boolean;
}

/**
 * mxEdgeSegmentHandler.getCurrentPoints: the route, with a straight
 * two- or three-point edge given a virtual middle segment so it can be
 * moved sideways. `tol` is draw.io's max(1, view scale).
 */
export function segmentCurrentPoints(route: readonly Point[], tol = 1): Point[] {
  const pts = route.slice();
  if (pts.length === 2 || (pts.length === 3 && (
    (Math.abs(pts[0].x - pts[1].x) < tol && Math.abs(pts[1].x - pts[2].x) < tol) ||
    (Math.abs(pts[0].y - pts[1].y) < tol && Math.abs(pts[1].y - pts[2].y) < tol)))) {
    const cx = pts[0].x + (pts[pts.length - 1].x - pts[0].x) / 2;
    const cy = pts[0].y + (pts[pts.length - 1].y - pts[0].y) / 2;
    return [pts[0], { x: cx, y: cy }, { x: cx, y: cy }, pts[pts.length - 1]];
  }
  return pts;
}

/**
 * The handles of a selected connector, where draw.io's handler for its
 * edge style draws them: both ends, then the waypoints and the virtual
 * bends (default), a handle in the middle of each segment (segment) or
 * one between the elbows (elbow).
 */
export function edgeHandles(el: Pick<ConnectorEl, 'dio' | 'source' | 'target' | 'route' | 'points' | 'scale'>): EdgeHandle[] {
  const route = el.route;
  if (route.length < 2) return [];
  const out: EdgeHandle[] = [
    { kind: 'terminal', index: 0, at: route[0] },
    { kind: 'terminal', index: 1, at: route[route.length - 1] },
  ];
  const kind = edgeHandlerKind(el);
  if (kind === 'entity') return out;
  if (kind === 'default') {
    for (let i = 1; i < route.length - 1; i++) out.push({ kind: 'bend', index: i, at: route[i] });
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      out.push({ kind: 'virtual', index: i - 1, at: { x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 }, faint: true });
    }
    return out;
  }
  if (kind === 'elbow') {
    const p0 = route.length > 1 ? route[1] : route[0];
    const pe = route.length > 1 ? route[route.length - 2] : route[route.length - 1];
    out.push({ kind: 'elbow', index: 1, at: { x: p0.x + (pe.x - p0.x) / 2, y: p0.y + (pe.y - p0.y) / 2 }, faint: el.points.length === 0 });
    return out;
  }
  // segment (mxEdgeSegmentHandler.redrawInnerBends)
  const pts = segmentCurrentPoints(route, Math.max(1, el.scale));
  let straight = false;
  if (pts.length === 4 && Math.round(pts[1].x - pts[2].x) === 0 && Math.round(pts[1].y - pts[2].y) === 0) {
    straight = true;
    if (Math.round(pts[0].y - pts[pts.length - 1].y) === 0) {
      const cx = pts[0].x + (pts[pts.length - 1].x - pts[0].x) / 2;
      pts[1] = { x: cx, y: pts[1].y };
      pts[2] = { x: cx, y: pts[2].y };
    } else {
      const cy = pts[0].y + (pts[pts.length - 1].y - pts[0].y) / 2;
      pts[1] = { x: pts[1].x, y: cy };
      pts[2] = { x: pts[2].x, y: cy };
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const faint = straight ? i === 0 || i === 2 : el.points.length === 0;
    out.push({ kind: 'segment', index: i + 1, at: { x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 }, faint });
  }
  return out;
}

/** The cursor draw.io gives a segment handle: across the segment. */
export function segmentCursor(route: readonly Point[], index: number, scale = 1): 'col-resize' | 'row-resize' {
  const pts = segmentCurrentPoints(route, Math.max(1, scale));
  const i = index - 1;
  let horizontal = Math.round(pts[i].x - pts[i + 1].x) === 0;
  if (Math.round(pts[i].y - pts[i + 1].y) === 0 && i < pts.length - 2) horizontal = Math.round(pts[i].x - pts[i + 2].x) === 0;
  return horizontal ? 'col-resize' : 'row-resize';
}

/** Graph.flipEdge: an elbow connector's elbow turned the other way. */
export function flippedElbow(dio: string): string {
  const elbow = resolveStyle(dio, 'edge').elbow ?? 'horizontal';
  return setStyleValue(dio, 'elbow', elbow === 'horizontal' ? 'vertical' : 'horizontal');
}

/**
 * mxEdgeHandler.getPointForEvent's terminal snapping (snapToTerminals,
 * within `tolerance`): x and y each move onto the nearest of `targets`
 * (the terminals' routing centres and the route's points) when close.
 */
export function snapToPoints(p: Point, targets: readonly Point[], tolerance: number): { point: Point; snappedX: boolean; snappedY: boolean } {
  const point = { ...p };
  let snappedX = false;
  let snappedY = false;
  for (const t of targets) {
    if (Math.abs(p.x - t.x) < tolerance) {
      point.x = t.x;
      snappedX = true;
    }
    if (Math.abs(p.y - t.y) < tolerance) {
      point.y = t.y;
      snappedY = true;
    }
  }
  return { point, snappedX, snappedY };
}

/** The cursor of the elbow handle (mxElbowEdgeHandler.getCursorForBend). */
export function elbowCursor(style: Style): 'col-resize' | 'row-resize' {
  const edge = style.edgeStyle;
  return edge === 'topToBottomEdgeStyle' || (edge === 'elbowEdgeStyle' && style.elbow === 'vertical') ? 'row-resize' : 'col-resize';
}

// --- dragging waypoints (mxEdgeHandler.getPreviewPoints) ----------------------------

export interface BendDrag {
  /** The connector's waypoints when the drag began, slide px. */
  points: readonly Point[];
  /** Its route when the drag began, slide px. */
  route: readonly Point[];
  /** A waypoint handle: its index in the route (1 … n-2). */
  bend?: number;
  /** A virtual bend: the index of the segment it sits on (it becomes waypoint `virtual`). */
  virtual?: number;
  /** The pointer, already rounded to a stored point. */
  pointer: Point;
  /** The other bends' hit boxes, by route index (a waypoint dropped on one is removed). */
  bendBoxes: ReadonlyArray<Rect | null>;
  /**
   * The routing centres of ends that are not on a fixed point (draw.io
   * measures straightness against them), else null to use the route end.
   */
  sourceCenter?: Point | null;
  targetCenter?: Point | null;
  /** draw.io's graph tolerance in slide pixels (straightening). */
  tolerance: number;
  /** Alt held: no straightening. */
  alt?: boolean;
}

/**
 * The waypoints while a waypoint or a virtual bend is dragged: the
 * dragged point replaces (or, from a virtual bend, is inserted as) a
 * waypoint, unless it is dropped on another handle or straightens its
 * segment, either of which removes it (mergeRemoveEnabled /
 * straightRemoveEnabled in draw.io).
 */
export function bendPreviewPoints(d: BendDrag): Point[] {
  const virtual = d.virtual != null;
  // An edge without waypoints takes the point as its only one (draw.io's
  // `points == null` branch, which neither merges nor straightens).
  if (d.points.length === 0) return [{ ...d.pointer }];
  const points = d.points.map((p) => ({ ...p }));
  const index = virtual ? -1 : d.bend!;
  if (virtual) points.splice(d.virtual!, 0, { ...d.pointer });

  // Removes point if dragged on terminal point
  for (let i = 0; i < d.bendBoxes.length; i++) {
    if (i === index) continue;
    const box = d.bendBoxes[i];
    if (box && rectContains(box, d.pointer)) {
      if (virtual) points.splice(d.virtual!, 1);
      else points.splice(index - 1, 1);
      return points;
    }
  }

  // Removes point if user tries to straighten a segment
  if (!virtual && !d.alt) {
    const abs = d.route.map((p) => ({ ...p }));
    abs[index] = d.pointer;
    if (d.sourceCenter) abs[0] = d.sourceCenter;
    if (d.targetCenter) abs[abs.length - 1] = d.targetCenter;
    if (index > 0 && index < abs.length - 1 &&
      ptSegDistSq(abs[index - 1], abs[index + 1], d.pointer) < d.tolerance * d.tolerance) {
      points.splice(index - 1, 1);
      return points;
    }
  }
  if (!virtual) points[index - 1] = { ...d.pointer };
  return points;
}

/**
 * The waypoint index a double-click on route point `bend` removes, or -1
 * (mxEdgeHandler.removePoint: only inner points of the route).
 */
export function removableWaypoint(route: readonly Point[], points: readonly Point[], bend: number): number {
  if (bend > 0 && bend < route.length - 1 && points.length >= bend) return bend - 1;
  return -1;
}

// --- dragging segments (mxEdgeSegmentHandler) ----------------------------------------

/**
 * mxEdgeSegmentHandler.getPreviewPoints: the segment `index` (between
 * points index-1 and index of the current points) moved across to the
 * pointer, returned as the inner points that hint the router. `ends` are
 * the source and target boxes: a single hint inside one becomes two.
 */
export function segmentHintPoints(route: readonly Point[], index: number, pointer: Point,
  ends: { source?: Rect | null; target?: Rect | null } = {}, scale = 1): Point[] {
  const pts = segmentCurrentPoints(route, Math.max(1, scale)).map((p) => ({ ...p }));
  // draw.io compares in its units after convertPoint: a unit is `scale` slide px
  const unit = scale > 0 ? scale : 1;
  let last = { ...pts[0] };
  let result: Point[] = [];
  for (let i = 1; i < pts.length; i++) {
    const pt = { ...pts[i] };
    if (i === index) {
      if (Math.abs(last.x - pt.x) < unit) {
        last.x = pointer.x;
        pt.x = pointer.x;
      }
      if (Math.abs(last.y - pt.y) < unit) {
        last.y = pointer.y;
        pt.y = pointer.y;
      }
      // the moved start of this segment is the previous result point
      if (result.length > 0) result[result.length - 1] = { ...last };
    }
    if (i < pts.length - 1) result.push(pt);
    last = pt;
  }
  if (result.length === 1) {
    const p = result[0];
    if ((ends.source && rectContains(ends.source, p)) || (ends.target && rectContains(ends.target, p))) {
      result = [{ ...pointer }, { ...pointer }];
    }
  }
  return result;
}

/**
 * The corners of a routed orthogonal edge (mxEdgeSegmentHandler.
 * updatePreviewState): its inner points without those that lie on a
 * straight run, which become the stored waypoints.
 */
export function routeCorners(route: readonly Point[]): Point[] {
  const result: Point[] = [];
  if (route.length < 3) return result;
  let pt0 = route[0];
  let pt1 = route[1];
  for (let i = 2; i < route.length; i++) {
    const pt2 = route[i];
    if ((Math.round(pt0.x - pt1.x) !== 0 || Math.round(pt1.x - pt2.x) !== 0) &&
      (Math.round(pt0.y - pt1.y) !== 0 || Math.round(pt1.y - pt2.y) !== 0)) {
      result.push({ ...pt1 });
    }
    pt0 = pt1;
    pt1 = pt2;
  }
  return result;
}

/** mxEdgeSegmentHandler.getRoutePoints: a route without repeated or collinear points. */
export function simplifiedRoute(route: readonly Point[]): Point[] {
  const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  const onSegment = (p0: Point, pt: Point, p1: Point) =>
    (Math.abs(p0.x - pt.x) < 1 && Math.abs(pt.x - p1.x) < 1 && (pt.y - p0.y) * (p1.y - pt.y) >= 0) ||
    (Math.abs(p0.y - pt.y) < 1 && Math.abs(pt.y - p1.y) < 1 && (pt.x - p0.x) * (p1.x - pt.x) >= 0);
  const result: Point[] = [];
  for (const p of route) {
    if (result.length > 0 && same(result[result.length - 1], p)) continue;
    while (result.length > 1 && onSegment(result[result.length - 2], result[result.length - 1], p)) result.pop();
    result.push(p);
  }
  return result;
}

/** mxEdgeSegmentHandler.isDefaultRoute: the edge routes the same way without waypoints. */
export function isDefaultRoute(withPoints: readonly Point[], without: readonly Point[]): boolean {
  const a = simplifiedRoute(withPoints);
  const b = simplifiedRoute(without);
  if (a.length !== b.length) return false;
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 1 && Math.abs(p.y - b[i].y) < 1);
}

/**
 * The waypoints after moving segment `index` of an orthogonal or segment
 * connector to `pointer` (slide px): the hint points are routed, the
 * corners of that route kept (rounded as draw.io stores them), and none
 * at all when the edge would route the same way without them.
 */
export function segmentDragPoints(el: ConnectorEl, index: number, pointer: Point,
  findVertex: (id: string) => VertexEl | undefined): Point[] {
  const frame = frameOf(el);
  const source = el.source ? findVertex(el.source) : undefined;
  const target = el.target ? findVertex(el.target) : undefined;
  const box = (v: VertexEl | undefined) => (v ? { x: v.x, y: v.y, width: v.w, height: v.h } : null);
  const hint = segmentHintPoints(el.route, index, pointer, { source: box(source), target: box(target) }, el.scale)
    .map((p) => storedPoint(p, frame));
  const routed = routeConnector({ ...el, points: hint }, findVertex);
  let result = routeCorners(routed).map((p) => storedPoint(p, frame));
  const ends = routed.length > 1 ? [routed[0], routed[routed.length - 1]] : null;
  if (result.length === 0 && ends && (Math.round(ends[0].x - ends[1].x) === 0 || Math.round(ends[0].y - ends[1].y) === 0)) {
    const p = storedPoint(pointer, frame);
    result = [p, { ...p }];
  }
  if (result.length > 0) {
    const withPoints = routeConnector({ ...el, points: result }, findVertex);
    const without = routeConnector({ ...el, points: [] }, findVertex);
    if (isDefaultRoute(withPoints, without)) return [];
  }
  return result;
}

// --- labels ----------------------------------------------------------------------------

/**
 * mxEdgeHandler.moveLabel for an edge's own label: the relative position
 * along the route (x rounded to four decimals, y to a unit) and the offset
 * that puts the label's anchor exactly at `at` (slide px).
 */
export function labelGeometryAt(el: Pick<ConnectorEl, 'route' | 'origin' | 'scale' | 'dio' | 'labelGeometry'>, at: Point): { x: number; y: number; offset: Point } {
  const frame = frameOf(el);
  const style = connectorStyle(el);
  const units = el.route.map((p) => toUnits(p, frame));
  const p = toUnits(at, frame);
  const rel = relativePointOnRoute(units, p, style);
  const x = Math.round(rel.x * 10000) / 10000;
  const y = Math.round(rel.y);
  const anchor = edgeOwnLabelPoint(units, { x, y, offset: null }, style);
  return { x, y, offset: { x: Math.round(p.x - anchor.x), y: Math.round(p.y - anchor.y) } };
}

/** Where an edge's own label is anchored (its handle), slide px. */
export function labelAnchor(el: Pick<ConnectorEl, 'route' | 'origin' | 'scale' | 'dio' | 'labelGeometry'>): Point | null {
  if (el.route.length < 2) return null;
  const frame = frameOf(el);
  const units = el.route.map((p) => toUnits(p, frame));
  const g = el.labelGeometry ?? { x: 0, y: 0, offset: null };
  return fromUnits(edgeOwnLabelPoint(units, { x: g.x, y: g.y, offset: g.offset ?? null }, connectorStyle(el)), frame);
}

// --- groups, containers, parents ------------------------------------------------------

/** The vertex a cell's `parent` names (a group or container), or undefined for a layer. */
export function parentVertex(elements: readonly SlideElement[], el: VertexEl | ConnectorEl): VertexEl | undefined {
  if (!el.parent) return undefined;
  return elements.find((c): c is VertexEl => c.type === 'vertex' && c.diagram === el.diagram && c.cell === el.parent);
}

/** The vertex ancestors of a cell, nearest first. */
export function ancestors(elements: readonly SlideElement[], el: VertexEl | ConnectorEl): VertexEl[] {
  const out: VertexEl[] = [];
  const seen = new Set<string>([el.id]);
  let next = parentVertex(elements, el);
  while (next && !seen.has(next.id)) {
    out.push(next);
    seen.add(next.id);
    next = parentVertex(elements, next);
  }
  return out;
}

/** mxGraph.isSwimlane in Graph.js: swimlane, table or table row shapes. */
export function isSwimlaneStyle(style: Style): boolean {
  const shape = style.shape;
  return shape === 'swimlane' || shape === 'table' || shape === 'tableRow';
}

/**
 * mxGraph.getDropTarget: the cell under the pointer that is not being
 * moved, or its nearest ancestor that takes the drop (`valid`, e.g.
 * structure.ts's isValidDropTarget); never one of the moved cells or a
 * descendant of one. `under` is the topmost vertex at the pointer among
 * those not moved. (The drop itself is structure.ts's reparent.)
 */
export function dropTarget(elements: readonly SlideElement[], under: VertexEl | null, moved: ReadonlySet<string>,
  valid: (cell: VertexEl) => boolean): VertexEl | null {
  let cell: VertexEl | undefined = under ?? undefined;
  while (cell && !valid(cell)) cell = parentVertex(elements, cell);
  if (!cell) return null;
  // Checks if parent is dropped into child
  if (moved.has(cell.id) || ancestors(elements, cell).some((a) => moved.has(a.id))) return null;
  return cell;
}

/**
 * The cell a click selects first (mxGraphHandler.getInitialCellForEvent
 * with draw.io's propagation rules): from the clicked cell up through its
 * vertex parents while they are not selected, not swimlanes (a relative
 * child always goes up), not transparent-bounds groups, and no sibling of
 * the cell is selected; selectParentFirst=1 on a parent always climbs.
 */
export function initialCell(elements: readonly SlideElement[], hit: VertexEl | ConnectorEl, selected: ReadonlySet<string>): VertexEl | ConnectorEl {
  let cell: VertexEl | ConnectorEl = hit;
  if (selected.has(cell.id)) return cell;
  for (;;) {
    const parent = parentVertex(elements, cell);
    if (!parent || selected.has(parent.id)) return cell;
    if (!propagates(elements, cell, parent, selected)) return cell;
    cell = parent;
  }
}

function propagates(elements: readonly SlideElement[], cell: VertexEl | ConnectorEl, parent: VertexEl, selected: ReadonlySet<string>): boolean {
  const parentStyle = resolveStyle(parent.dio, 'vertex');
  const siblingSelected = elements.some((el) => el.id !== cell.id && selected.has(el.id) &&
    (el.type === 'vertex' || el.type === 'connector') && el.diagram === cell.diagram && el.parent === cell.parent);
  if (parentStyle.selectParentFirst === '1') return !siblingSelected;
  if (parentStyle.transparentBounds === '1') return false;
  const relative = cell.type === 'vertex' && cell.relative != null;
  return !siblingSelected && (relative || !isSwimlaneStyle(parentStyle));
}

/**
 * The cell a click selects when one of its ancestors is already selected
 * (mxGraphHandler.selectDelayed → selectCellForEvent): the ancestor of the
 * clicked cell that is a child of the selected one, so each click goes one
 * level down. Null when no ancestor is selected (or the cell itself is).
 */
export function delayedSelectionCell(elements: readonly SlideElement[], hit: VertexEl | ConnectorEl, selected: ReadonlySet<string>): VertexEl | ConnectorEl | null {
  if (selected.has(hit.id)) return null;
  const chain = [hit, ...ancestors(elements, hit)];
  const at = chain.findIndex((c) => selected.has(c.id));
  if (at <= 0) return null;
  return chain[at - 1];
}

/**
 * Moving a connector without the shapes it is attached to detaches it from
 * them, as draw.io does (mxGraph.disconnectGraph, disconnectOnMove): each
 * end whose terminal (or an ancestor of it) is not among `moved` becomes a
 * loose end where the route ends now. Null when nothing changes.
 */
export function detachedForMove(el: ConnectorEl, moved: ReadonlySet<string>, elements: readonly SlideElement[]): ConnectorEl | null {
  const stays = (id: string | null): boolean => {
    if (!id) return true;
    if (moved.has(id)) return true;
    const v = elements.find((c): c is VertexEl => c.type === 'vertex' && c.id === id);
    return v != null && ancestors(elements, v).some((a) => moved.has(a.id));
  };
  const sourceLoose = !stays(el.source);
  const targetLoose = !stays(el.target);
  if (!sourceLoose && !targetLoose) return null;
  const first = el.route[0];
  const last = el.route[el.route.length - 1];
  if (!first || !last) return null;
  const frame = frameOf(el);
  return {
    ...el,
    ...(sourceLoose ? { source: null, sourcePoint: storedPoint(first, frame) } : {}),
    ...(targetLoose ? { target: null, targetPoint: storedPoint(last, frame) } : {}),
  };
}

// --- styles ------------------------------------------------------------------------------

/** True if a vertex accepts connections (Graph.isCellConnectable). */
export function isConnectable(el: VertexEl): boolean {
  if (el.connectable === false) return false;
  const value = getStyleValue(el.dio, 'connectable');
  if (value != null) return value !== '0';
  return true;
}

/** HoverIcons.update: `allowArrows=0` turns the arrows off for a shape. */
export function allowsArrows(el: VertexEl): boolean {
  return getStyleValue(el.dio, 'allowArrows') !== '0';
}

/** draw.io's group style (a named `group` token) or pointerEvents=0 without fill. */
export function isGroupVertex(el: VertexEl): boolean {
  return styleNames(el.dio).includes('group') || parseStyleString(el.dio).some((e) => e.key === 'shape' && e.value === 'group');
}

// --- outline connect (mxGraph/Graph.getOutlineConstraint) ----------------------------------

/** mxConstants.OUTLINE_HIGHLIGHT_COLOR and _STROKEWIDTH: the highlight of an outline connection. */
export const OUTLINE_HIGHLIGHT = { color: '#00FF00', width: 5 } as const;

/** draw.io's edge handler connects to the outline after resting this long on a shape (Graph.js). */
export const OUTLINE_CONNECT_DELAY = 2000;

function rotateAbout(p: Point, deg: number, c: Point): Point {
  if (!deg) return p;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/**
 * The fixed connection point for an end dropped at `point` (slide px) on a
 * shape's outline (mxGraph.getOutlineConstraint with Graph's override): the
 * point as fractions of the shape's bounds, turned back by its rotation,
 * mirrored by its flips and direction, rounded to thousandths, not
 * projected (perimeter=0). On rounded perimeters (roundedPerimeter=1) the
 * point on the bounds that the perimeter resolves to it is stored instead,
 * projected (perimeter=1).
 */
export function outlineConstraint(el: VertexEl, point: Point): ConnectionConstraint {
  const frame = frameOf(el);
  const style = vertexStyle(el);
  const u = toUnits(point, frame);
  const b0 = { x: (el.x - frame.origin.x) / frame.scale, y: (el.y - frame.origin.y) / frame.scale, width: el.w / frame.scale, height: el.h / frame.scale };
  const centre = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 };
  const rotation = el.rot || 0;
  const pv: PerimeterVertex = { ...b0, style };
  let roundedPoint: Point | null = null;
  if (isRoundedPerimeter(pv)) {
    // Graph.getRoundedBoundsPoint
    const pt = rotateAbout(u, -rotation, centre);
    const arc = getRoundedPerimeterArcCenter(b0, getRoundedPerimeterArcSize(pv, b0), pt);
    if (arc) {
      const dx = pt.x - arc.x;
      const dy = pt.y - arc.y;
      const t = Math.min((((dx < 0) ? b0.x : b0.x + b0.width) - arc.x) / dx, (((dy < 0) ? b0.y : b0.y + b0.height) - arc.y) / dy);
      roundedPoint = rotateAbout({ x: arc.x + dx * t, y: arc.y + dy * t }, rotation, centre);
    } else {
      roundedPoint = u;
    }
  } else if (getPerimeterFunction(pv) != null && isRoundedPolygonPerimeter(pv, getStylePerimeter(style))) {
    // Graph.getRayBoundsPoint
    const pt = rotateAbout(u, -rotation, centre);
    const dx = pt.x - centre.x;
    const dy = pt.y - centre.y;
    if (dx !== 0 || dy !== 0) {
      const t = Math.min(dx !== 0 ? b0.width / 2 / Math.abs(dx) : Infinity, dy !== 0 ? b0.height / 2 / Math.abs(dy) : Infinity);
      roundedPoint = rotateAbout({ x: centre.x + dx * t, y: centre.y + dy * t }, rotation, centre);
    }
  }
  const base = fractionsOnBounds(roundedPoint ?? u, b0, style, rotation);
  if (roundedPoint) {
    // perimeter points are not flipped in legacy mode (legacyAnchorPoints)
    let { x, y } = base;
    if (getStyleValue(el.dio, 'legacyAnchorPoints') !== '0') {
      let flipH = style.flipH === '1';
      let flipV = style.flipV === '1';
      if (style.direction === 'north' || style.direction === 'south') [flipH, flipV] = [flipV, flipH];
      if (flipH) x = Math.round((1 - x) * 1000) / 1000;
      if (flipV) y = Math.round((1 - y) * 1000) / 1000;
    }
    return { x, y, perimeter: true, dx: 0, dy: 0 };
  }
  return { ...base, perimeter: false, dx: 0, dy: 0 };
}

/** mxGraph.getOutlineConstraint's arithmetic (units). */
function fractionsOnBounds(point: Point, b0: Rect, style: Style, rotation: number): { x: number; y: number } {
  const bounds = { ...b0 };
  const direction = style.direction;
  if (direction === 'north' || direction === 'south') {
    bounds.x += bounds.width / 2 - bounds.height / 2;
    bounds.y += bounds.height / 2 - bounds.width / 2;
    [bounds.width, bounds.height] = [bounds.height, bounds.width];
  }
  const p = rotateAbout(point, -rotation, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  let flipH = style.flipH === '1';
  let flipV = style.flipV === '1';
  if (direction === 'north' || direction === 'south') [flipH, flipV] = [flipV, flipH];
  const sx = flipH ? -1 : 1;
  const sy = flipV ? -1 : 1;
  const dx = flipH ? -bounds.width : 0;
  const dy = flipV ? -bounds.height : 0;
  const q = { x: (p.x - bounds.x) * sx - dx + bounds.x, y: (p.y - bounds.y) * sy - dy + bounds.y };
  return {
    x: bounds.width === 0 ? 0 : Math.round((q.x - bounds.x) * 1000 / bounds.width) / 1000,
    y: bounds.height === 0 ? 0 : Math.round((q.y - bounds.y) * 1000 / bounds.height) / 1000,
  };
}

/**
 * How far `point` is from a shape's outline along the ray from its centre
 * (slide px): what decides whether the pointer is on draw.io's outline
 * highlight (a 5 px stroke, hit within the graph tolerance).
 */
export function outlineDistance(el: VertexEl, point: Point): number {
  const frame = frameOf(el);
  const view = terminalView(el, frame);
  const p = toUnits(point, frame);
  const at = perimeterPoint(view, p, false);
  if (!at) return Infinity;
  const centre = { x: view.bounds.x + view.bounds.width / 2, y: view.bounds.y + view.bounds.height / 2 };
  const toPointer = Math.hypot(p.x - centre.x, p.y - centre.y);
  const toOutline = Math.hypot(at.x - centre.x, at.y - centre.y);
  return Math.abs(toPointer - toOutline) * frame.scale;
}

// --- the grid (mxGraphView.createSvgGrid, mxGraph.snapDelta) ------------------------------

/** mxGraphView's grid look in Graph.js. */
export const GRID = { steps: 4, minSize: 4, color: '#e6e6e6', minorOpacity: 0.2 } as const;

/**
 * mxGraphView.getGridLineDistance: the screen distance between minor grid
 * lines, doubled until it is at least `minSize` screen pixels.
 */
export function gridLineDistance(gridSize: number, scale: number, zoom: number): number {
  let tmp = gridSize * scale * zoom;
  if (!(tmp > 0 && Number.isFinite(tmp))) tmp = GRID.minSize;
  while (tmp < GRID.minSize) tmp *= 2;
  return tmp;
}

/**
 * mxGraphView.createSvgGrid in slide pixels: one tile of `steps` minor
 * lines (20 % opacity) with the major lines on all four edges, strokes one
 * screen pixel wide. Returns the tile size (slide px) and the SVG.
 */
export function gridTileSvg(gridSize: number, scale: number, zoom: number, color: string = GRID.color): { tile: number; svg: string } {
  const d = gridLineDistance(gridSize, scale, zoom) / zoom;
  const tile = GRID.steps * d;
  const minor: string[] = [];
  for (let i = 1; i < GRID.steps; i++) {
    const v = i * d;
    minor.push(`M 0 ${v} L ${tile} ${v} M ${v} 0 L ${v} ${tile}`);
  }
  const major = `M ${tile} 0 L 0 0 0 ${tile} M ${tile} 0 L ${tile} ${tile} L 0 ${tile}`;
  const w = 1 / zoom;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">`
    + `<path d="${minor.join(' ')}" fill="none" stroke="${color}" opacity="${GRID.minorOpacity}" stroke-width="${w}"/>`
    + `<path d="${major}" fill="none" stroke="${color}" stroke-width="${w}"/></svg>`;
  return { tile, svg };
}

/**
 * mxGraph.snapDelta with the grid on, for one axis, in slide pixels: the
 * move `delta` of a box whose edge is at `pos` becomes one that puts the
 * edge on the grid (`g` slide px apart, lines through `origin`), or 0 when
 * that is within half a grid step of not moving.
 */
export function snapDeltaToGrid(delta: number, pos: number, origin: number, g: number): number {
  if (!(g > 0)) return delta;
  const snapped = origin + Math.round((pos - origin) / g) * g;
  const t = pos - snapped;
  if (Math.abs(delta - t) < g * 0.5) return 0;
  return Math.round(delta / g) * g - t;
}

/** mxGraph.snap on one coordinate, slide px. */
export function snapToGridLine(value: number, origin: number, g: number): number {
  return g > 0 ? origin + Math.round((value - origin) / g) * g : value;
}

// --- the shape picker (EditorUi.getCellsForShapePicker) ----------------------------------

export interface PickerEntry {
  style: string;
  /** draw.io units. */
  width: number;
  height: number;
  value?: string;
}

/** The basic shapes draw.io's picker offers after the clone of the source. */
export const PICKER_SHAPES: readonly PickerEntry[] = [
  { style: 'whiteSpace=wrap;html=1;', width: 120, height: 60 },
  { style: 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;', width: 80, height: 80 },
  { style: 'rhombus;whiteSpace=wrap;html=1;shapeInside=1;', width: 80, height: 80 },
  { style: 'rounded=1;whiteSpace=wrap;html=1;', width: 120, height: 60 },
  { style: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
  { style: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
  { style: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
  { style: 'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
  { style: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 120, height: 60 },
  { style: 'triangle;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
  { style: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', width: 120, height: 80 },
  { style: 'shape=tape;whiteSpace=wrap;html=1;', width: 120, height: 100 },
  { style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;perimeter=cloudPerimeter;', width: 120, height: 80 },
  { style: 'shape=singleArrow;whiteSpace=wrap;html=1;arrowWidth=0.4;arrowSize=0.4;', width: 80, height: 60 },
  { style: 'shape=waypoint;sketch=0;size=6;pointerEvents=1;points=[];fillColor=none;resizable=0;rotatable=0;perimeter=centerPerimeter;snapToPoint=1;', width: 20, height: 20 },
];

/** draw.io's Text entry, offered first when there is no source shape. */
export const PICKER_TEXT: PickerEntry = {
  style: 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;',
  width: 60,
  height: 30,
  value: 'Text',
};

/**
 * The picker's entries: the source shape itself first, then the basic
 * shapes (getCellsForShapePicker without a palette match); a hover picker
 * shows only the first four.
 */
export function pickerEntries(source: Pick<VertexEl, 'dio' | 'label' | 'w' | 'h' | 'scale'> | null, hovering: boolean): PickerEntry[] {
  const first: PickerEntry = source
    ? { style: source.dio, width: source.w / (source.scale || 1), height: source.h / (source.scale || 1), value: source.label }
    : PICKER_TEXT;
  const all = [first, ...PICKER_SHAPES];
  return hovering ? all.slice(0, 4) : all;
}

/** Sidebar.ignoredStyles without Graph.cellStyles (passed in as `cellStyles`). */
const KEY_IGNORED = ['html', 'whiteSpace', 'aspect', 'points', 'verticalLabelPosition', 'labelPosition', 'outlineConnect', 'labelPerimeter'];

/** Sidebar.getShapeName: the leading named style or `shape=`, images with their image. */
export function shapeNameOf(style: string): string {
  const tokens = style.split(';');
  let name = tokens[0] != null && !tokens[0].includes('=') ? tokens[0] : '';
  let image: string | null = null;
  for (const token of tokens) {
    const i = token.indexOf('=');
    if (i <= 0) continue;
    const key = token.slice(0, i);
    if (key === 'shape') name = token.slice(i + 1);
    else if (key === 'image') image = token.slice(i + 1);
  }
  return name === 'image' && image != null ? `${name}\n${image}` : name;
}

/** Sidebar.getKeyStyle: the style without the keys that do not identify a shape. */
export function keyStyleOf(style: string, cellStyles: readonly string[]): string {
  const ignored = new Set([...KEY_IGNORED, ...cellStyles]);
  return style.split(';').map((t) => t.split('=')).filter((t) => t.length > 1 && !ignored.has(t[0]))
    .map((t) => `${t[0]}=${t[1]}`).join(';');
}

/** The draw.io library a palette belongs to (Sidebar.setCurrentSearchEntryLibrary). */
export function libraryOfPalette(paletteId: string): string {
  if (paletteId === 'general' || paletteId === 'misc' || paletteId === 'advanced') return 'general';
  if (paletteId === 'arrows2') return 'arrows';
  return paletteId;
}

export interface PalettePickerItem {
  id: string;
  title: string;
  cells: ReadonlyArray<{ style: string; value?: string; edge?: boolean; geometry: { width: number; height: number } }>;
}

interface PaletteShape { palette: string; lib: string; index: number; name: string; key: string; style: string; value: string; width: number; height: number }

/**
 * EditorUi.getPaletteCellsForShapePicker over the given palettes: when the
 * source is a shape of a library other than the basic one (Sidebar.
 * getShapeMatches: same shape name, the same key or else the closest keys;
 * the default shape only with the same key), the library's shapes for the
 * picker — those used on the slide most first, then the palette's shapes
 * after the source, of the same kind first (getPickerShapes) — at most
 * `max`, each with the source's changed look (getPaletteStyle). Null for a
 * basic or unknown shape (the caller offers the basic shapes).
 */
export function libraryPickerEntries(source: Pick<VertexEl, 'dio'>, palettes: ReadonlyArray<{ id: string; items: readonly PalettePickerItem[] }>,
  usedStyles: readonly string[], cellStyles: readonly string[], max = 15): PickerEntry[] | null {
  const shapes: PaletteShape[] = [];
  for (const palette of palettes) {
    palette.items.forEach((item, index) => {
      const vertices = item.cells.filter((c) => !c.edge);
      if (item.cells.length !== 1 || vertices.length !== 1) return;
      const c = vertices[0];
      shapes.push({
        palette: palette.id, lib: libraryOfPalette(palette.id), index,
        name: shapeNameOf(c.style), key: keyStyleOf(c.style, cellStyles), style: c.style, value: c.value ?? '',
        width: c.geometry.width, height: c.geometry.height,
      });
    });
  }
  const matchesOf = (style: string): PaletteShape[] => {
    const name = shapeNameOf(style);
    const key = keyStyleOf(style, cellStyles);
    const named = shapes.filter((s) => s.name === name);
    let best = named.filter((s) => s.key === key);
    if (best.length === 0 && name.length > 0 && named.length > 0) {
      // Sidebar.getClosestKeys: fewest values not in both keys
      const values = new Set(key.split(';').filter((v) => v && !v.startsWith('shape=')));
      const diff = (s: PaletteShape) => {
        const other = new Set(s.key.split(';').filter((v) => v && !v.startsWith('shape=')));
        let n = 0;
        for (const v of values) if (!other.has(v)) n++;
        for (const v of other) if (!values.has(v)) n++;
        return n;
      };
      const min = Math.min(...named.map(diff));
      best = named.filter((s) => diff(s) === min);
    }
    // the first shape of each library
    const seen = new Set<string>();
    return best.filter((s) => (seen.has(s.lib) ? false : (seen.add(s.lib), true)));
  };
  const matches = matchesOf(source.dio);
  if (matches.length === 0 || !matches.some((m) => m.lib !== 'general')) return null;
  // EditorUi.getShapePickerMatch: the library most used on the page
  const counts = new Map<string, number>();
  for (const style of usedStyles) {
    for (const lib of new Set(matchesOf(style).map((m) => m.lib))) counts.set(lib, (counts.get(lib) ?? 0) + 1);
  }
  let match = matches[0];
  for (const m of matches.slice(1)) if ((counts.get(m.lib) ?? 0) > (counts.get(match.lib) ?? 0)) match = m;
  if (match.lib === 'general') return null;
  const inPalette = shapes.filter((s) => s.palette === match.palette);
  const entries: PaletteShape[] = [];
  const add = (list: readonly PaletteShape[]) => {
    for (const s of list) {
      if (entries.length >= max) return;
      if ((s.name !== match.name || s.key !== match.key) && !entries.includes(s)) entries.push(s);
    }
  };
  // shapes of the library used on the slide, the most used first
  const used = new Map<PaletteShape, number>();
  for (const style of usedStyles) {
    const m = matchesOf(style).find((x) => x.lib === match.lib);
    const entry = m ? inPalette.find((s) => s.name === m.name && s.key === m.key) : undefined;
    if (entry) used.set(entry, (used.get(entry) ?? 0) + 1);
  }
  add([...used.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s));
  // Sidebar.getPickerShapes: after the source's entry, its kind first
  const kind = (name: string) => (name.includes('\n') ? name.slice(0, name.indexOf('\n')) : name);
  const start = inPalette.findIndex((s) => s.index === match.index) + 1;
  const same: PaletteShape[] = [];
  const others: PaletteShape[] = [];
  for (let i = 0; i < inPalette.length; i++) {
    const s = inPalette[(start + i) % inPalette.length];
    (kind(s.name) === kind(match.name) ? same : others).push(s);
  }
  add([...same, ...others]);
  return entries.map((s) => ({ style: paletteStyle(source.dio, s.style, match.style, cellStyles), width: s.width, height: s.height, value: s.value }));
}

/**
 * EditorUi.getPaletteStyle, simplified: an entry's style with the keys of
 * the look (Graph.cellStyles, whiteSpace, perimeter; not the alignments)
 * that the source changed from its own palette entry.
 */
export function paletteStyle(sourceDio: string, entryDio: string, previousDio: string, cellStyles: readonly string[]): string {
  const parse = (s: string) => {
    const out: Record<string, string> = {};
    for (const e of parseStyleString(s)) if (e.key != null) out[e.key] = e.value;
    return out;
  };
  const values = parse(sourceDio);
  const before = parse(previousDio);
  let out = entryDio;
  for (const key of [...cellStyles, 'whiteSpace', 'perimeter']) {
    if (key === 'align' || key === 'verticalAlign') continue;
    if ((values[key] ?? null) !== (before[key] ?? null)) out = setStyleValue(out, key, values[key] ?? null);
  }
  return out;
}

/**
 * Graph.pasteStyle with Graph.cellStyles: the source's look (`keys`
 * present in its resolved style) written over an entry's style.
 */
export function pastedStyle(entryDio: string, sourceStyle: Style, keys: readonly string[]): string {
  let out = entryDio;
  for (const key of keys) {
    const value = sourceStyle[key];
    if (value != null) out = setStyleValue(out, key, value);
  }
  return out;
}

// --- keyboard (EditorUi.selectCellInDirection) --------------------------------------------

export interface Edges4 {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** EditorUi.getDirectionalDistance between two boxes. */
export function directionalDistance(a: Edges4, b: Edges4, dx: number, dy: number): number | null {
  const tol = 2;
  const along = dx > 0 ? b.left - a.right : dx < 0 ? a.left - b.right : dy > 0 ? b.top - a.bottom : a.top - b.bottom;
  if (along < -tol) return null;
  const across = dx !== 0 ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
    : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const offset = dx !== 0 ? Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2 : Math.abs((a.left + a.right) - (b.left + b.right)) / 2;
  return Math.max(0, along) + (dx !== 0 ? 30 : 2) * across + offset / 100;
}

// --- hit testing ------------------------------------------------------------------------------

/**
 * Whether a vertex is hit at a point the way draw.io's SVG takes the
 * pointer: a shape with `pointerEvents=0` and no fill (a group) is hit only
 * along its stroke, and not at all without one.
 */
export function vertexHitAt(el: VertexEl, point: Point, tolerance: number): boolean {
  const style = vertexStyle(el);
  const noFill = style.fillColor == null || style.fillColor === 'none';
  if (style.pointerEvents !== '0' || !noFill) return true;
  const noStroke = style.strokeColor == null || style.strokeColor === 'none';
  if (noStroke) return false;
  const inner = { x: el.x + tolerance, y: el.y + tolerance, w: el.w - 2 * tolerance, h: el.h - 2 * tolerance, rot: el.rot };
  return boxContains(el, point, tolerance) && !(inner.w > 0 && inner.h > 0 && boxContains(inner, point));
}
