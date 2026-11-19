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
import { computeLineJumps, type JumpEdge, type RoutedPoint } from './lineJumps.js';
import { paintEdge, paintVertex, vertexOutline, vertexPaintMargin } from './paint.js';
import { edgeLabelPoint, edgeOwnLabelPoint, routeEdge, type TerminalView } from './route.js';
import { resolveStyle, styleNumber } from './style.js';
import { paintTableExtras, tableShapeStyle, type TablePaint } from './table.js';
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
 * `%id%` the cell id; values are escaped in HTML labels). A name the cell
 * does not have comes from `inherited`: its ancestors', then the page's
 * (getPlaceholderCell; see cellContext.ts).
 */
export function displayLabel(
  el: Pick<VertexEl, 'label' | 'cell' | 'object' | 'dio'>,
  inherited?: PlaceholderLookup | null,
): string {
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
    const value = Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : inherited?.(name);
    return value != null ? escape(value) : whole;
  });
}

/** A custom property of a cell's ancestors or its page, by name (undefined: none has it). */
export type PlaceholderLookup = (name: string) => string | undefined;

/** Not drawn: hidden itself, or by a layer or collapsed container above it. */
export function isConcealed(el: Pick<VertexEl, 'hidden' | 'concealed'>): boolean {
  return Boolean(el.hidden || el.concealed);
}

/**
 * The SVG a vertex is drawn with, sized to its box. Rotation is the
 * element's (the wrapper turns), so the painter skips the style's own.
 */
export function vertexMarkup(el: VertexEl, options: CellMarkupOptions = {}): string {
  if (isConcealed(el)) return svgOpen(el.w, el.h) + '</svg>';
  const style = vertexStyle(el);
  const s = el.scale;
  const c = new SvgCanvas({ idPrefix: defsPrefix(el.id) });
  c.scale(s);
  // Painted at its place on the draw.io page, as draw.io paints it (the
  // sketch style's strokes depend on it), with the canvas moved to the box
  const vt = boxViewTranslate(el);
  c.translate(vt.x, vt.y);
  // A table's rows and cells take their parent's colours (strokeColor=inherit)
  // and the table paints its grid lines (table.ts, from cellContext.ts).
  const table = options.table ?? null;
  paintVertex(c, tableShapeStyle(style, table), { x: -vt.x, y: -vt.y, width: el.w / s, height: el.h / s }, {
    ignoreRotation: true, cellId: el.cell, patternOrigin: vt, parentStyle: table?.parentStyle ?? null,
  });
  if (table) {
    c.translate(-vt.x, -vt.y);
    paintTableExtras(c, table);
  }
  const label = el.label
    ? vertexLabelSvg(style, displayLabel(el, options.placeholders), { x: 0, y: 0, width: el.w, height: el.h }, s, {
      ignoreRotation: true,
      offset: el.offset ?? null,
      math: options.math,
      textFallback: options.textFallback,
    })
    : '';
  return `${svgOpen(el.w, el.h)}${withPageShadow(c.markup() + label, options.pageShadow, s)}</svg>`;
}

/**
 * draw.io's view translate for a cell painted in its own box: the box's
 * origin less its position on the draw.io page, in draw.io units.
 */
function boxViewTranslate(el: VertexEl | ConnectorEl): Point {
  const origin = el.origin ?? { x: 0, y: 0 };
  return { x: (origin.x - el.x) / el.scale, y: (origin.y - el.y) / el.scale };
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
export function connectorMarkup(el: ConnectorEl, options: ConnectorMarkupOptions = {}): string {
  if (isConcealed(el) || el.route.length < 2) return svgOpen(el.w, el.h) + '</svg>';
  const style = connectorStyle(el);
  const s = el.scale;
  const units = localUnits(el);
  const c = new SvgCanvas({ idPrefix: defsPrefix(el.id) });
  c.scale(s);
  // Painted along its route on the draw.io page (where its routed points
  // and sketch strokes are), with the canvas moved to the box
  const vt = boxViewTranslate(el);
  c.translate(vt.x, vt.y);
  const origin = el.origin ?? { x: 0, y: 0 };
  const page = el.route.map((p) => ({ x: (p.x - origin.x) / s, y: (p.y - origin.y) / s }));
  const routedPoints = options.routedPoints != null && options.routedPoints.length > 0 ? options.routedPoints.slice() : null;
  paintEdge(c, style, page, { routedPoints, cellId: el.cell, patternOrigin: vt });
  let labels = '';
  if (el.label) {
    const g = el.labelGeometry ?? { x: 0, y: 0, offset: null };
    const at = edgeOwnLabelPoint(units, { x: g.x, y: g.y, offset: g.offset }, style);
    labels += edgeLabelSvg(style, displayLabel(el, options.placeholders), { x: at.x * s, y: at.y * s }, s,
      { width: g.w ?? 0, height: g.h ?? 0, math: options.math, textFallback: options.textFallback });
  }
  // A label cell's ancestors are the connector, then the connector's own.
  const own = el.object?.attrs;
  const fromEdge: PlaceholderLookup = (name) => (own && Object.prototype.hasOwnProperty.call(own, name)
    ? own[name] : options.placeholders?.(name));
  for (const label of el.labels) {
    if (label.hidden || !label.label) continue;
    const labelStyle = connectorLabelStyle(style, label.dio);
    const at = edgeLabelPoint(units, { x: label.x, y: label.y, offset: label.offset }, labelStyle);
    labels += vertexLabelSvg(labelStyle, displayLabel({ ...label, object: label.object ?? null }, fromEdge),
      { x: at.x * s, y: at.y * s, width: label.w * s, height: label.h * s }, s,
      { math: options.math, textFallback: options.textFallback });
  }
  return `${svgOpen(el.w, el.h)}${withPageShadow(c.markup() + labels, options.pageShadow, s)}</svg>`;
}

/** Options for drawing a cell that depend on the rest of its diagram. */
export interface CellMarkupOptions {
  /**
   * The diagram's page has shadow="1" (draw.io's Edit ▸ Page Setup ▸
   * Shadow): everything drawn, labels included, casts the page shadow.
   */
  pageShadow?: boolean;
  /** The page has math="1": TeX in HTML labels is typeset (mathLabel.ts). */
  math?: boolean;
  /** `%name%` values from the cell's ancestors and the page (cellContext.ts). */
  placeholders?: PlaceholderLookup | null;
  /** HTML labels carry draw.io's SVG <text> fallback (a standalone SVG file). */
  textFallback?: boolean;
  /** The parent's colours and a table's grid (table.ts tablePaint). */
  table?: TablePaint | null;
}

export interface ConnectorMarkupOptions extends CellMarkupOptions {
  /**
   * The connector's route with its line jumps, in the diagram's draw.io
   * units, from {@link connectorLineJumps}. Omit (or null) for no jumps.
   */
  routedPoints?: readonly RoutedPoint[] | null;
}

/**
 * Graph.updateShadowFilter for a page with shadow="1": draw.io puts
 * `drop-shadow(3px 3px 1.7px rgba(61,69,116,0.4))` (svgShadowSize,
 * svgShadowBlur, svgShadowColor/Opacity) on the group of all cells; here
 * each cell carries it, at the cell's scale.
 */
export function pageShadowFilter(scale: number): string {
  const r = (v: number) => Math.round(v * scale * 100) / 100;
  return `drop-shadow(${r(3)}px ${r(3)}px ${r(1.7)}px rgba(61, 69, 116, 0.4))`;
}

function withPageShadow(markup: string, pageShadow: boolean | undefined, scale: number): string {
  if (!pageShadow || markup.length === 0) return markup;
  return `<g style="filter:${pageShadowFilter(scale)}">${markup}</g>`;
}

/**
 * The line jumps of the connectors among `elements` (a slide's elements):
 * per diagram, in paint order (z, then position in the list, as the figure
 * and the slide draw them), each connector with a jumpStyle jumps the
 * connectors drawn before it that it crosses (mxGraphView.updateLineJumps).
 * Returns the routed points by connector id, in the diagram's draw.io
 * units; pass each to connectorMarkup as `routedPoints`. Connectors
 * without jumps are not in the map.
 */
export function connectorLineJumps(elements: readonly SlideElement[]): Map<string, RoutedPoint[]> {
  const result = new Map<string, RoutedPoint[]>();
  const connectors = elements
    .map((el, index) => ({ el, index }))
    .filter((e): e is { el: ConnectorEl; index: number } => e.el.type === 'connector' && !isConcealed(e.el) && e.el.route.length > 1)
    .sort((a, b) => (a.el.z - b.el.z) || (a.index - b.index))
    .map(({ el }) => el);
  if (!connectors.some((el) => /(?:^|;)\s*jumpStyle\s*=/.test(el.dio))) return result;
  // The layer of a cell: its topmost ancestor's parent (for jumpLayers=0)
  const byCell = new Map<string, SlideElement>();
  for (const el of elements) {
    if (el.type === 'vertex' || el.type === 'connector') byCell.set(`${el.diagram}\u0000${el.cell}`, el);
  }
  const layerOf = (el: ConnectorEl): string | null => {
    let parent = el.parent;
    for (let i = 0; i < 100 && parent != null; i++) {
      const up = byCell.get(`${el.diagram}\u0000${parent}`);
      if (up == null || (up.type !== 'vertex' && up.type !== 'connector')) break;
      parent = up.parent;
    }
    return parent;
  };
  const diagrams = new Map<string, JumpEdge[]>();
  for (const el of connectors) {
    const origin = el.origin ?? { x: 0, y: 0 };
    const s = el.scale;
    const edges = diagrams.get(el.diagram) ?? [];
    edges.push({
      id: el.id,
      style: connectorStyle(el),
      points: el.route.map((p) => ({ x: (p.x - origin.x) / s, y: (p.y - origin.y) / s })),
      layer: layerOf(el),
    });
    diagrams.set(el.diagram, edges);
  }
  for (const edges of diagrams.values()) {
    for (const [id, points] of computeLineJumps(edges)) result.set(id, points);
  }
  return result;
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
