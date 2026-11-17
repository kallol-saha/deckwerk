/**
 * draw.io cells as DeckWerk elements: drawing a vertex or a connector from
 * its own fields, and routing connectors from the vertices they join.
 *
 * Coordinates: element boxes, waypoints and routes are slide pixels. draw.io
 * works in its own units, which are slide pixels divided by the cell's
 * `scale` (draw.io's view scale). Routing and painting run in draw.io units
 * with the canvas scaled, exactly as draw.io paints a zoomed view, so a
 * style's `strokeWidth=2` or `fontSize=12` means what it means in draw.io.
 */

import type { ConnectorEl, SlideElement, VertexEl } from '../deck.js';
import { SvgCanvas } from './canvas.js';
import { edgeLabelSvg, vertexLabelSvg } from './label.js';
import { paintEdge, paintVertex, vertexOutline, vertexPaintMargin } from './paint.js';
import { edgeLabelPoint, edgeOwnLabelPoint, routeEdge, type TerminalView } from './route.js';
import { resolveStyle, styleNumber } from './style.js';
import type { Point, Rect, Style } from './types.js';

/** The style a vertex draws with: its string resolved, rotation from the element. */
export function vertexStyle(el: Pick<VertexEl, 'dio' | 'rot'>): Style {
  const style = resolveStyle(el.dio, 'vertex');
  if (el.rot) style.rotation = String(el.rot);
  else delete style.rotation;
  return style;
}

export function connectorStyle(el: Pick<ConnectorEl, 'dio'>): Style {
  return resolveStyle(el.dio, 'edge');
}

function svgOpen(w: number, h: number, extra = ''): string {
  const W = Math.max(w, 0);
  const H = Math.max(h, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="diagram-svg" width="${W}" height="${H}" `
    + `viewBox="0 0 ${W} ${H}" overflow="visible" style="position:absolute;left:0;top:0;overflow:visible"${extra}>`;
}

/** Unique-enough ids for gradients inside one element's SVG. */
function defsPrefix(id: string): string {
  return `dg-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * The label a cell shows: its value, with draw.io's `%key%` placeholders
 * filled from its own custom properties when the cell has
 * `placeholders="1"` (Graph.replacePlaceholders; `%%` is a literal `%`,
 * `%id%` the cell id; values are escaped in HTML labels). Ancestors' and
 * the page's properties are not consulted yet.
 */
export function displayLabel(el: Pick<VertexEl, 'label' | 'cell' | 'object' | 'dio'>): string {
  const attrs = el.object?.attrs;
  if (!attrs || attrs.placeholders !== '1' || !el.label.includes('%')) return el.label;
  const html = /(?:^|;)html=1(?:;|$)/.test(el.dio);
  const escape = (text: string) => (html
    ? text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : text);
  return el.label.replace(/%%|%([^%\s<>]+)%/g, (whole: string, name: string | undefined) => {
    if (whole === '%%') return '%';
    if (name === 'label' || name === 'tooltip' || name == null) return whole;
    if (name === 'id') return escape(el.cell);
    const value = Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : undefined;
    return value != null ? escape(value) : whole;
  });
}

/** Not drawn: hidden itself, or by a layer or collapsed container above it. */
export function isConcealed(el: Pick<VertexEl, 'hidden' | 'concealed'>): boolean {
  return Boolean(el.hidden || el.concealed);
}

/**
 * The SVG a vertex is drawn with, sized to its box. Rotation is the
 * element's (the wrapper turns), so the painter skips the style's own.
 */
export function vertexMarkup(el: VertexEl): string {
  if (isConcealed(el)) return svgOpen(el.w, el.h) + '</svg>';
  const style = vertexStyle(el);
  const s = el.scale;
  const c = new SvgCanvas({ idPrefix: defsPrefix(el.id) });
  c.scale(s);
  paintVertex(c, style, { x: 0, y: 0, width: el.w / s, height: el.h / s }, { ignoreRotation: true });
  const label = el.label
    ? vertexLabelSvg(style, displayLabel(el), { x: 0, y: 0, width: el.w, height: el.h }, s, {
      ignoreRotation: true,
      offset: el.offset ?? null,
    })
    : '';
  return `${svgOpen(el.w, el.h)}${c.markup()}${label}</svg>`;
}

/** The connector's route in its own box, in draw.io units. */
function localUnits(el: ConnectorEl): Point[] {
  const s = el.scale;
  return el.route.map((p) => ({ x: (p.x - el.x) / s, y: (p.y - el.y) / s }));
}

/**
 * The SVG a connector is drawn with, in its box's coordinates: the line and
 * its markers, its own label, and its label cells. A label cell is a vertex
 * in draw.io, so it is laid out as one, at the point on the route its
 * relative geometry names.
 */
export function connectorMarkup(el: ConnectorEl): string {
  if (isConcealed(el) || el.route.length < 2) return svgOpen(el.w, el.h) + '</svg>';
  const style = connectorStyle(el);
  const s = el.scale;
  const units = localUnits(el);
  const c = new SvgCanvas({ idPrefix: defsPrefix(el.id) });
  c.scale(s);
  paintEdge(c, style, units);
  let labels = '';
  if (el.label) {
    const g = el.labelGeometry ?? { x: 0, y: 0, offset: null };
    const at = edgeOwnLabelPoint(units, { x: g.x, y: g.y, offset: g.offset }, style);
    labels += edgeLabelSvg(style, displayLabel(el), { x: at.x * s, y: at.y * s }, s, { width: g.w ?? 0, height: g.h ?? 0 });
  }
  for (const label of el.labels) {
    if (label.hidden || !label.label) continue;
    const labelStyle = connectorLabelStyle(style, label.dio);
    const at = edgeLabelPoint(units, { x: label.x, y: label.y, offset: label.offset }, labelStyle);
    labels += vertexLabelSvg(labelStyle, displayLabel({ ...label, object: label.object ?? null }), { x: at.x * s, y: at.y * s, width: label.w * s, height: label.h * s }, s);
  }
  return `${svgOpen(el.w, el.h)}${c.markup()}${labels}</svg>`;
}

/** Text keys an edge label cell takes from its edge (Graph.inheritedLabelStyles). */
const INHERITED_LABEL_KEYS = [
  'fontFamily', 'fontSize', 'fontColor', 'fontStyle', 'textOpacity', 'labelBorderColor',
  'labelBorderWidth', 'labelBackgroundColor', 'defaultLabelBackgroundColor', 'labelPadding',
];

/**
 * The style of a label cell on an edge: its own string over the vertex
 * defaults, with the edge's text keys inherited where draw.io inherits them
 * (Graph.resolveInheritedLabelStyles: a label written without them follows
 * its edge).
 */
export function connectorLabelStyle(edgeStyle: Style, labelDio: string): Style {
  const own = resolveStyle(labelDio, 'vertex');
  const written = new Set(labelDio.split(';').map((t) => t.split('=')[0]));
  for (const key of INHERITED_LABEL_KEYS) {
    if (!written.has(key) && edgeStyle[key] != null) own[key] = edgeStyle[key];
  }
  return own;
}

// --- routing -----------------------------------------------------------------

/**
 * A vertex as the router sees it, in draw.io page coordinates: slide
 * position less the diagram origin, over the scale.
 */
export function terminalView(el: VertexEl, frame: { origin: Point; scale: number }): TerminalView {
  const { origin, scale } = frame;
  const style = vertexStyle(el);
  const size = { width: el.w / scale, height: el.h / scale };
  return {
    id: el.id,
    bounds: { x: (el.x - origin.x) / scale, y: (el.y - origin.y) / scale, ...size },
    style,
    // The outline as painted, for clouds and rounded polygons (the router
    // asks for it only where draw.io does).
    outline: (bounds) => vertexOutline(style, size, bounds),
  };
}

/**
 * Route a connector against the vertices it joins, in draw.io's page
 * coordinates (so every rounding step rounds where draw.io's does), and
 * return it in slide pixels.
 */
export function routeConnector(el: ConnectorEl, findVertex: (id: string) => VertexEl | undefined): Point[] {
  const frame = { origin: el.origin ?? { x: 0, y: 0 }, scale: el.scale };
  const { origin, scale: s } = frame;
  const source = el.source ? findVertex(el.source) : undefined;
  const target = el.target ? findVertex(el.target) : undefined;
  const toUnits = (p: Point) => ({ x: (p.x - origin.x) / s, y: (p.y - origin.y) / s });
  const route = routeEdge({
    id: el.id,
    style: connectorStyle(el),
    source: source && !isConcealed(source) ? terminalView(source, frame) : null,
    target: target && !isConcealed(target) ? terminalView(target, frame) : null,
    points: el.points.map(toUnits),
    sourcePoint: el.sourcePoint ? toUnits(el.sourcePoint) : null,
    targetPoint: el.targetPoint ? toUnits(el.targetPoint) : null,
  });
  return route.map((p) => ({ x: origin.x + p.x * s, y: origin.y + p.y * s }));
}

/** Bounds of a set of points. */
export function pointsBounds(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The element box for a route: its bounds grown by the arrowheads and
 * stroke, and never thinner than a pixel (boxes must have size). The SVG
 * overflows the box anyway, so this is the selectable area, not a clip.
 */
export function connectorBox(route: readonly Point[], style: Style, scale: number): { x: number; y: number; w: number; h: number } {
  const b = pointsBounds(route);
  const marker = Math.max(styleNumber(style, 'startSize', 6), styleNumber(style, 'endSize', 6));
  const pad = (Math.max(styleNumber(style, 'strokeWidth', 1), 1) / 2 + marker / 2) * scale;
  return { x: b.x - pad, y: b.y - pad, w: Math.max(b.width + 2 * pad, 1), h: Math.max(b.height + 2 * pad, 1) };
}

/** A connector with its route and box brought up to date. */
export function rerouted(el: ConnectorEl, findVertex: (id: string) => VertexEl | undefined): ConnectorEl {
  const route = routeConnector(el, findVertex);
  const box = connectorBox(route, connectorStyle(el), el.scale);
  return { ...el, route, ...box };
}

function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 1e-6 || Math.abs(a[i].y - b[i].y) > 1e-6) return false;
  }
  return true;
}

/**
 * Every connector among `elements` whose route changes, re-routed. With
 * `touched`, only connectors attached to (or being) one of those ids are
 * considered. Returns the replacements by id; unchanged connectors are left
 * out so callers commit nothing for them.
 */
export function rerouteConnectors(
  elements: readonly SlideElement[],
  touched?: ReadonlySet<string>,
): Map<string, ConnectorEl> {
  const vertices = new Map<string, VertexEl>();
  for (const el of elements) if (el.type === 'vertex') vertices.set(el.id, el);
  const find = (id: string) => vertices.get(id);
  const out = new Map<string, ConnectorEl>();
  for (const el of elements) {
    if (el.type !== 'connector') continue;
    if (touched && !touched.has(el.id) && !(el.source && touched.has(el.source)) && !(el.target && touched.has(el.target))) continue;
    const next = rerouted(el, find);
    if (!samePoints(next.route, el.route) || next.x !== el.x || next.y !== el.y || next.w !== el.w || next.h !== el.h) {
      out.set(el.id, next);
    }
  }
  return out;
}

/** Extra space a vertex paints outside its box, in slide pixels. */
export function vertexOverflow(el: VertexEl): number {
  return vertexPaintMargin(vertexStyle(el)) * el.scale;
}
