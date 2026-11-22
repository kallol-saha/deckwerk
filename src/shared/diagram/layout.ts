/*
 * Automatic layout of diagram cells, after draw.io's Arrange → Layout.
 *
 * draw.io 32.7.4 (jgraph/drawio, Apache License 2.0) runs its flow, tree,
 * radial and organic layouts through its ELK bridge (js/elk/drawio-elk.min.js:
 * ElkLayout.MENU_PRESETS, ElkLayout.DEFAULTS, ElkApplier) and its circle
 * layout through mxCircleLayout (mxgraph/src/layout/mxCircleLayout.js). The
 * presets, the ELK options and the way results are written back to the cells
 * (ElkApplier's "orthogonalEdgeStyle" mode for flows: ELK's bend points as
 * waypoints of a live orthogonal connector, its ends pinned with
 * exitX/exitY/entryX/entryY; straight connectors for radial and organic
 * results) are taken from there. ELK itself is elkjs (Eclipse Public License
 * 2.0); draw.io bundles its own JavaScript port of the same library.
 * Modified for DeckWerk: DOM-free, on `vertex`/`connector` elements in slide
 * pixels; tree layouts route their connectors with draw.io's orthogonal
 * router from pinned stems instead of ElkApplier's tree-stem post-pass.
 */

import type { ConnectorEl, DiagramEl, Slide, VertexEl } from '../deck.js';
import { getStyleValue, resolveStyle, setStyleValue } from './style.js';
import { DiagramTree, isCell } from './structure.js';
import type { Point, Rect } from './types.js';

export type LayoutAlgorithm = 'layered' | 'tree' | 'radial' | 'organic' | 'circle';
export type LayoutDirection = 'right' | 'down' | 'left' | 'up';
export type LayoutCorners = 'keep' | 'straight' | 'rounded' | 'curved';

export const LAYOUT_ALGORITHMS: readonly LayoutAlgorithm[] = ['layered', 'tree', 'radial', 'organic', 'circle'];
export const LAYOUT_DIRECTIONS: readonly LayoutDirection[] = ['right', 'down', 'left', 'up'];

/** draw.io's Arrange → Layout entries (ElkLayout.MENU_PRESETS, plus Circle). */
export const LAYOUT_PRESETS: ReadonlyArray<{ id: string; title: string; algorithm: LayoutAlgorithm; direction?: LayoutDirection }> = [
  { id: 'horizontalFlow', title: 'Horizontal Flow', algorithm: 'layered', direction: 'right' },
  { id: 'verticalFlow', title: 'Vertical Flow', algorithm: 'layered', direction: 'down' },
  { id: 'horizontalTree', title: 'Horizontal Tree', algorithm: 'tree', direction: 'right' },
  { id: 'verticalTree', title: 'Vertical Tree', algorithm: 'tree', direction: 'down' },
  { id: 'radialTree', title: 'Radial Tree', algorithm: 'radial' },
  { id: 'organic', title: 'Organic', algorithm: 'organic' },
  { id: 'circle', title: 'Circle', algorithm: 'circle' },
];

/** ElkLayout.DEFAULTS of draw.io's bridge, per ELK algorithm. */
const ELK_DEFAULTS: Record<string, Record<string, string>> = {
  layered: {
    'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.spacing.nodeNode': '30',
    'elk.layered.spacing.nodeNodeBetweenLayers': '30', 'elk.layered.spacing.edgeNodeBetweenLayers': '16',
    'elk.edgeLabels.inline': 'true', 'elk.spacing.edgeLabel': '5',
    'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST', 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  },
  mrtree: {
    'elk.algorithm': 'mrtree', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '20',
    'elk.spacing.edgeNode': '10', 'elk.mrtree.weighting': 'MODEL_ORDER',
  },
  force: { 'elk.algorithm': 'force', 'elk.spacing.nodeNode': '10', 'elk.force.iterations': '300', 'elk.force.repulsivePower': '0' },
  radial: { 'elk.algorithm': 'radial', 'elk.spacing.nodeNode': '20', 'elk.edgeRouting': 'POLYLINE' },
};

const ELK_ALGORITHM: Record<Exclude<LayoutAlgorithm, 'circle'>, string> = {
  layered: 'layered', tree: 'mrtree', radial: 'radial', organic: 'force',
};

const ELK_DIRECTION: Record<LayoutDirection, string> = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };

/** mxCircleLayout.radius: the smallest radius a circle gets. */
export const CIRCLE_MIN_RADIUS = 100;

export interface LayoutOptions {
  algorithm: LayoutAlgorithm;
  /** Flow and tree direction; default down (draw.io's Vertical Flow / Vertical Tree). */
  direction?: LayoutDirection;
  /** Space between neighbouring shapes, draw.io units (elk.spacing.nodeNode; the circle's smallest radius). */
  spacing?: number;
  /** Space between layers of a flow, draw.io units (elk.layered.spacing.nodeNodeBetweenLayers). */
  layerSpacing?: number;
  /** Only these element ids (vertices; connectors among them follow). Default: the diagram's top-level shapes. */
  cells?: readonly string[];
  /** Lay out the children of this container (its draw.io cell id) instead of the top level. */
  parent?: string | null;
  diagramId?: string;
  /** Connector corners after the layout; default rounded for flows (draw.io's), keep otherwise. */
  corners?: LayoutCorners;
  /** Extra ELK options, e.g. `{"elk.layered.layering.strategy": "LONGEST_PATH"}`. */
  elk?: Record<string, string>;
  /** Where the laid-out cells' top-left corner goes, draw.io units; default: where it was. */
  at?: Point;
}

export interface LayoutResult {
  diagramId: string;
  /** Changed copies of every cell the layout moved or restyled. */
  elements: DiagramEl[];
  /** Element ids of the vertices laid out. */
  nodes: string[];
  /** Element ids of the connectors laid out. */
  edges: string[];
  /** Bounds of the laid-out shapes afterwards, slide pixels. */
  bounds: Rect | null;
}

interface Node {
  el: VertexEl;
  /** Box in draw.io units. */
  box: Rect;
}

interface Edge {
  el: ConnectorEl;
  source: string;
  target: string;
  /** An end that hangs off a cell inside a laid-out container: not pinned. */
  climbedSource: boolean;
  climbedTarget: boolean;
}

/** ELK's JSON graph, the part used here. */
interface ElkPointJson { x: number; y: number }
interface ElkEdgeJson {
  id: string;
  sources: string[];
  targets: string[];
  sections?: Array<{ startPoint: ElkPointJson; endPoint: ElkPointJson; bendPoints?: ElkPointJson[] }>;
}
interface ElkNodeJson {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNodeJson[];
  edges?: ElkEdgeJson[];
}
type ElkEngine = { layout: (graph: ElkNodeJson) => Promise<ElkNodeJson> };

let elkEngine: Promise<ElkEngine> | null = null;

/** elkjs, loaded on first use (it is large and only layouts need it). */
async function elk(): Promise<ElkEngine> {
  elkEngine ??= import('elkjs/lib/elk.bundled.js').then((mod) => {
    const Ctor = ((mod as { default?: unknown }).default ?? mod) as new () => ElkEngine;
    return new Ctor();
  });
  return elkEngine;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function round(n: number): number {
  return Math.round(n);
}

/** The cells a layout works on, and the connectors between them. */
export function layoutScope(slide: Pick<Slide, 'elements' | 'diagrams'>, options: Pick<LayoutOptions, 'cells' | 'parent' | 'diagramId'>): {
  diagramId: string; nodes: VertexEl[]; edges: Edge[]; tree: DiagramTree;
} {
  const tree = new DiagramTree(slide);
  const cells = slide.elements.filter(isCell);
  const named = options.cells ? cells.filter((el) => options.cells!.includes(el.id)) : [];
  const diagramId = options.diagramId
    ?? named[0]?.diagram
    ?? Object.keys(slide.diagrams ?? {})[0]
    ?? cells[0]?.diagram
    ?? 'diagram-1';
  const usable = (el: DiagramEl): el is VertexEl => el.type === 'vertex' && el.diagram === diagramId
    && !el.hidden && !el.concealed && !el.relative;
  let nodes: VertexEl[];
  if (options.cells) {
    const chosen = named.filter(usable);
    const ids = new Set(chosen.map((el) => el.id));
    // A container named with its children is laid out as one node.
    nodes = chosen.filter((el) => !tree.ancestors(el).some((a) => ids.has(a.id)));
  } else {
    nodes = cells.filter(usable).filter((el) => {
      const parent = tree.parentOf(el);
      return options.parent ? parent?.cell === options.parent : parent == null;
    });
    // Edge labels drawn as vertices and other connector children are not shapes to place.
    nodes = nodes.filter((el) => !(el.parent && cells.some((c) => c.type === 'connector' && c.cell === el.parent && c.diagram === diagramId)));
  }
  const nodeIds = new Set(nodes.map((el) => el.id));
  const nodeFor = (id: string | null): { id: string; climbed: boolean } | null => {
    const el = tree.vertex(id);
    if (!el) return null;
    if (nodeIds.has(el.id)) return { id: el.id, climbed: false };
    const up = tree.ancestors(el).find((a) => nodeIds.has(a.id));
    return up ? { id: up.id, climbed: true } : null;
  };
  const edges: Edge[] = [];
  for (const el of cells) {
    if (el.type !== 'connector' || el.diagram !== diagramId || el.hidden || el.concealed) continue;
    const s = nodeFor(el.source);
    const t = nodeFor(el.target);
    if (!s || !t || s.id === t.id) continue;
    edges.push({ el, source: s.id, target: t.id, climbedSource: s.climbed, climbedTarget: t.climbed });
  }
  return { diagramId, nodes, edges, tree };
}

/**
 * Runs a layout and returns the changed cells (copies; the slide is not
 * touched). Connectors re-route from the result wherever the deck is
 * updated (reroute.ts).
 */
export async function layoutDiagram(slide: Pick<Slide, 'elements' | 'diagrams'>, options: LayoutOptions): Promise<LayoutResult> {
  const { diagramId, nodes: vertices, edges, tree } = layoutScope(slide, options);
  const result: LayoutResult = { diagramId, elements: [], nodes: vertices.map((v) => v.id), edges: edges.map((e) => e.el.id), bounds: null };
  if (vertices.length === 0) return result;
  const unit = (el: VertexEl): Rect => {
    const s = el.scale || 1;
    return { x: (el.x - el.origin.x) / s, y: (el.y - el.origin.y) / s, width: el.w / s, height: el.h / s };
  };
  const nodes: Node[] = vertices.map((el) => ({ el, box: unit(el) }));
  const before = boundsOf(nodes.map((n) => n.box));

  let placed: Map<string, Point>;
  let routes = new Map<string, Point[]>();
  let treeEdges: Set<string> | null = null;
  if (options.algorithm === 'circle') {
    placed = circleLayout(nodes, options.spacing ?? CIRCLE_MIN_RADIUS);
  } else {
    let elkEdges = edges;
    if (options.algorithm === 'tree' || options.algorithm === 'radial') {
      treeEdges = spanningForest(nodes.map((n) => n.el.id), edges);
      elkEdges = edges.filter((e) => treeEdges!.has(e.el.id));
    }
    const out = await runElk(nodes, elkEdges, options);
    placed = out.placed;
    routes = out.routes;
  }

  // Keep the laid-out cells where they were (draw.io's preserveOrigin), or put them at `at`.
  const after = boundsOf(nodes.map((n) => ({ ...n.box, ...placed.get(n.el.id)! })));
  const target = options.at ?? { x: before.x, y: before.y };
  const dx = round(target.x - after.x);
  const dy = round(target.y - after.y);
  for (const [id, p] of placed) placed.set(id, { x: round(p.x + dx), y: round(p.y + dy) });
  for (const [id, route] of routes) routes.set(id, route.map((p) => ({ x: round(p.x + dx), y: round(p.y + dy) })));

  const changed = new Map<string, DiagramEl>();
  const copy = <T extends DiagramEl>(el: T): T => {
    const existing = changed.get(el.id);
    if (existing) return existing as T;
    const next = clone(el);
    changed.set(el.id, next);
    return next;
  };
  const boxes = new Map<string, Rect>();
  for (const node of nodes) {
    const p = placed.get(node.el.id)!;
    const s = node.el.scale || 1;
    const x = node.el.origin.x + p.x * s;
    const y = node.el.origin.y + p.y * s;
    const ddx = x - node.el.x;
    const ddy = y - node.el.y;
    boxes.set(node.el.id, { x: p.x, y: p.y, width: node.box.width, height: node.box.height });
    if (Math.abs(ddx) < 1e-9 && Math.abs(ddy) < 1e-9) continue;
    const moved = copy(node.el);
    moved.x = x;
    moved.y = y;
    // Contents follow their container, as in draw.io.
    for (const child of tree.descendants(node.el)) shift(copy(child), ddx, ddy);
  }

  const corners = options.corners ?? (options.algorithm === 'layered' ? 'rounded' : 'keep');
  for (const edge of edges) {
    const el = copy(edge.el);
    el.points = [];
    let dio = setStyleValue(el.dio, 'innerLoopWaypoints', null);
    // ElkLayout._applyEdgeStyleRecursive: the old ports go unless pinned with an offset.
    if (getStyleValue(dio, 'exitDx') == null) dio = setStyleValue(setStyleValue(dio, 'exitX', null), 'exitY', null);
    if (getStyleValue(dio, 'entryDx') == null) dio = setStyleValue(setStyleValue(dio, 'entryX', null), 'entryY', null);
    const s = el.scale || 1;
    const toSlide = (p: Point): Point => ({ x: el.origin.x + p.x * s, y: el.origin.y + p.y * s });
    if (options.algorithm === 'layered') {
      const route = routes.get(edge.el.id);
      const applied = route && route.length >= 2 ? flowEdge(dio, route, boxes.get(edge.source)!, boxes.get(edge.target)!, {
        ...edge, roundSource: nonRect(tree.vertex(edge.source)), roundTarget: nonRect(tree.vertex(edge.target)),
      }) : null;
      if (applied) {
        dio = applied.dio;
        el.points = applied.points.map(toSlide);
      } else {
        dio = orthogonal(dio);
      }
    } else if (options.algorithm === 'tree') {
      dio = orthogonal(dio);
      if (treeEdges?.has(edge.el.id)) {
        dio = treeStem(dio, options.direction ?? 'down', edge);
        el.points = stemPoints(boxes.get(edge.source)!, boxes.get(edge.target)!, options.direction ?? 'down').map(toSlide);
      }
    } else {
      // Straight lines between the shapes (draw.io's "straight" mode; mxCircleLayout's disableEdgeStyle).
      dio = setStyleValue(dio, 'noEdgeStyle', '1');
      if (options.algorithm !== 'circle') {
        dio = setStyleValue(setStyleValue(dio, 'edgeStyle', null), 'orthogonal', null);
      }
    }
    if (corners !== 'keep') {
      dio = setStyleValue(setStyleValue(dio, 'rounded', corners === 'rounded' ? '1' : '0'), 'curved', corners === 'curved' ? '1' : '0');
    }
    el.dio = dio;
  }

  result.elements = [...changed.values()];
  const all = nodes.map((n) => {
    const b = boxes.get(n.el.id)!;
    const sc = n.el.scale || 1;
    return { x: n.el.origin.x + b.x * sc, y: n.el.origin.y + b.y * sc, width: b.width * sc, height: b.height * sc };
  });
  result.bounds = boundsOf(all);
  return result;
}

function shift(el: DiagramEl, dx: number, dy: number): void {
  el.x += dx;
  el.y += dy;
  if (el.type === 'connector') {
    const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
    el.points = el.points.map(move);
    el.route = el.route.map(move);
    if (el.sourcePoint) el.sourcePoint = move(el.sourcePoint);
    if (el.targetPoint) el.targetPoint = move(el.targetPoint);
  }
}

function boundsOf(boxes: readonly Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: bottom - y };
}

function orthogonal(dio: string): string {
  return setStyleValue(setStyleValue(setStyleValue(dio, 'noEdgeStyle', null), 'orthogonal', null), 'edgeStyle', 'orthogonalEdgeStyle');
}

/** A tree edge leaves its parent and enters its child on the sides facing the tree's direction. */
function treeStem(dio: string, direction: LayoutDirection, edge: Edge): string {
  const ports: Record<LayoutDirection, [number, number, number, number]> = {
    down: [0.5, 1, 0.5, 0], up: [0.5, 0, 0.5, 1], right: [1, 0.5, 0, 0.5], left: [0, 0.5, 1, 0.5],
  };
  const [ex, ey, nx, ny] = ports[direction];
  let out = dio;
  if (!edge.climbedSource) out = setStyleValue(setStyleValue(out, 'exitX', ex), 'exitY', ey);
  if (!edge.climbedTarget) out = setStyleValue(setStyleValue(out, 'entryX', nx), 'entryY', ny);
  return out;
}

/**
 * Shared stems (drawio-elk's collapseTreeStems): a tree edge turns halfway
 * between parent and child, so siblings share one bus line however small
 * the gap between levels is.
 */
function stemPoints(parent: Rect, child: Rect, direction: LayoutDirection): Point[] {
  const pcx = parent.x + parent.width / 2;
  const pcy = parent.y + parent.height / 2;
  const ccx = child.x + child.width / 2;
  const ccy = child.y + child.height / 2;
  let a: Point;
  let b: Point;
  if (direction === 'down' || direction === 'up') {
    const mid = direction === 'down' ? (parent.y + parent.height + child.y) / 2 : (child.y + child.height + parent.y) / 2;
    a = { x: pcx, y: mid };
    b = { x: ccx, y: mid };
  } else {
    const mid = direction === 'right' ? (parent.x + parent.width + child.x) / 2 : (child.x + child.width + parent.x) / 2;
    a = { x: mid, y: pcy };
    b = { x: mid, y: ccy };
  }
  const r = (p: Point) => ({ x: round(p.x), y: round(p.y) });
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS ? [r(a)] : [r(a), r(b)];
}

/**
 * Tree edges for a tree or radial layout: a spanning forest grown from the
 * shapes nothing points to (in model order), following connectors from
 * source to target. The other connectors are left to route themselves.
 */
function spanningForest(ids: readonly string[], edges: readonly Edge[]): Set<string> {
  const out = new Map<string, Edge[]>();
  const incoming = new Set<string>();
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    incoming.add(e.target);
  }
  const seen = new Set<string>();
  const kept = new Set<string>();
  const grow = (root: string) => {
    if (seen.has(root)) return;
    seen.add(root);
    const queue = [root];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const e of out.get(id) ?? []) {
        if (seen.has(e.target)) continue;
        seen.add(e.target);
        kept.add(e.el.id);
        queue.push(e.target);
      }
    }
  };
  for (const id of ids) if (!incoming.has(id)) grow(id);
  for (const id of ids) grow(id);
  return kept;
}

/** mxCircleLayout.execute: every shape on one circle, starting at the top, in model order. */
export function circleLayout(nodes: readonly Node[], minRadius = CIRCLE_MIN_RADIUS): Map<string, Point> {
  let max = 0;
  let top = Infinity;
  let left = Infinity;
  for (const n of nodes) {
    top = Math.min(top, n.box.y);
    left = Math.min(left, n.box.x);
    max = Math.max(max, Math.max(n.box.width, n.box.height));
  }
  const r = Math.max((nodes.length * max) / Math.PI, minRadius);
  const phi = (2 * Math.PI) / nodes.length;
  const out = new Map<string, Point>();
  nodes.forEach((n, i) => {
    out.set(n.el.id, {
      x: Math.round(left + r + r * Math.cos(i * phi - Math.PI / 2)),
      y: Math.round(top + r + r * Math.sin(i * phi - Math.PI / 2)),
    });
  });
  return out;
}

/** The ELK options a layout runs with: draw.io's defaults, the direction and spacing asked for, then `elk`. */
export function elkOptions(options: LayoutOptions): Record<string, string> {
  if (options.algorithm === 'circle') return {};
  const algorithm = ELK_ALGORITHM[options.algorithm];
  const out: Record<string, string> = { ...ELK_DEFAULTS[algorithm] };
  if ((algorithm === 'layered' || algorithm === 'mrtree') && options.direction) out['elk.direction'] = ELK_DIRECTION[options.direction];
  if (options.spacing != null) out['elk.spacing.nodeNode'] = String(options.spacing);
  if (options.layerSpacing != null && algorithm === 'layered') out['elk.layered.spacing.nodeNodeBetweenLayers'] = String(options.layerSpacing);
  // Containers are placed as single shapes: their contents keep their arrangement.
  delete out['elk.hierarchyHandling'];
  Object.assign(out, options.elk ?? {});
  return out;
}

async function runElk(nodes: readonly Node[], edges: readonly Edge[], options: LayoutOptions): Promise<{ placed: Map<string, Point>; routes: Map<string, Point[]> }> {
  const graph: ElkNodeJson = {
    id: '__root',
    layoutOptions: elkOptions(options),
    children: nodes.map((n) => ({ id: n.el.id, width: n.box.width, height: n.box.height })),
    edges: edges.map((e) => ({ id: e.el.id, sources: [e.source], targets: [e.target] })),
  };
  const laid = await (await elk()).layout(graph);
  const placed = new Map<string, Point>();
  for (const child of laid.children ?? []) placed.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  for (const n of nodes) if (!placed.has(n.el.id)) placed.set(n.el.id, { x: n.box.x, y: n.box.y });
  const routes = new Map<string, Point[]>();
  for (const edge of laid.edges ?? []) {
    const points: Point[] = [];
    for (const section of edge.sections ?? []) {
      points.push({ x: section.startPoint.x, y: section.startPoint.y });
      for (const b of section.bendPoints ?? []) points.push({ x: b.x, y: b.y });
      points.push({ x: section.endPoint.x, y: section.endPoint.y });
    }
    if (points.length >= 2) routes.set(edge.id, points);
  }
  return { placed, routes };
}

/** ElkApplier.NON_RECT_PERIMETER_SHAPES. */
const NON_RECT_PERIMETER_SHAPES = new Set(['ellipse', 'doubleEllipse', 'rhombus', 'triangle', 'hexagon', 'parallelogram', 'step', 'trapezoid']);

function nonRect(el: VertexEl | undefined): boolean {
  return el != null && NON_RECT_PERIMETER_SHAPES.has(resolveStyle(el.dio, 'vertex').shape ?? '');
}

/** The middle of the side of `box` nearest to `p`. */
function sideMidpoint(box: Rect, p: Point): Point {
  const d = [Math.abs(p.x - box.x), Math.abs(p.x - box.x - box.width), Math.abs(p.y - box.y), Math.abs(p.y - box.y - box.height)];
  const side = d.indexOf(Math.min(...d));
  if (side === 0) return { x: box.x, y: box.y + box.height / 2 };
  if (side === 1) return { x: box.x + box.width, y: box.y + box.height / 2 };
  if (side === 2) return { x: box.x + box.width / 2, y: box.y };
  return { x: box.x + box.width / 2, y: box.y + box.height };
}

// --- ElkApplier, "orthogonalEdgeStyle" mode -------------------------------------------

const EPS = 0.5;

/** ElkApplier._isOrthogonalChain: every inner segment horizontal or vertical. */
function isOrthogonalChain(l: readonly Point[]): boolean {
  for (let e = 2; e <= l.length - 2; e++) {
    if (Math.abs(l[e].x - l[e - 1].x) > EPS && Math.abs(l[e].y - l[e - 1].y) > EPS) return false;
  }
  return true;
}

/** ElkApplier._simplifyOrthogonal: drops points in the middle of a straight run. */
export function simplifyOrthogonal(n: readonly Point[]): Point[] {
  if (n.length <= 2) return [...n];
  const out = [n[0]];
  for (let o = 1; o < n.length - 1; o++) {
    const r = out[out.length - 1];
    const i = n[o];
    const s = n[o + 1];
    const vertical = Math.abs(r.x - i.x) <= EPS && Math.abs(i.x - s.x) <= EPS;
    const horizontal = Math.abs(r.y - i.y) <= EPS && Math.abs(i.y - s.y) <= EPS;
    if (!vertical && !horizontal) out.push(i);
  }
  out.push(n[n.length - 1]);
  return out;
}

/**
 * ElkApplier._applyEndpointConstraint: the port (0–1 on the box) where ELK's
 * route meets the shape; with orthogonal routing, slid along its side so the
 * first segment runs straight to the next point.
 */
function endpointConstraint(box: Rect, end: Point, next: Point | undefined): [number, number] {
  let h = (end.x - box.x) / box.width;
  let u = (end.y - box.y) / box.height;
  const f = 0.02;
  if (next) {
    if (h < f || h > 1 - f) u = (next.y - box.y) / box.height;
    else if (u < f || u > 1 - f) h = (next.x - box.x) / box.width;
  }
  h = Math.min(1, Math.max(0, h));
  u = Math.min(1, Math.max(0, u));
  return [Math.round(h * 1e4) / 1e4, Math.round(u * 1e4) / 1e4];
}

/** ElkApplier._alignEndpointSegment: the waypoint next to an end lines up with it. */
function alignEndpointSegment(points: Point[], l: readonly Point[], start: boolean): void {
  if (points.length === 0) return;
  const i = points[start ? 0 : points.length - 1];
  const s = start ? l[0] : l[l.length - 1];
  if (Math.abs(i.x - s.x) <= EPS || Math.abs(i.y - s.y) <= EPS) return;
  const far = (start ? l[2] : l[l.length - 3]) ?? (start ? l[l.length - 1] : l[0]);
  if (Math.abs(i.x - far.x) >= Math.abs(i.y - far.y)) i.x = round(s.x);
  else i.y = round(s.y);
}

/** ElkApplier._synthesizeZ: a waypoint (or two) halfway, so a straight ELK edge stays a live orthogonal one. */
function synthesizeZ(l: readonly Point[]): Point[] {
  const e = l[0];
  const o = l[l.length - 1];
  let r: Point;
  let i: Point;
  if (Math.abs(o.y - e.y) >= Math.abs(o.x - e.x)) {
    const m = round((e.y + o.y) / 2);
    r = { x: round(e.x), y: m };
    i = { x: round(o.x), y: m };
  } else {
    const m = round((e.x + o.x) / 2);
    r = { x: m, y: round(e.y) };
    i = { x: m, y: round(o.y) };
  }
  return Math.abs(r.x - i.x) <= EPS && Math.abs(r.y - i.y) <= EPS ? [r] : [r, i];
}

/**
 * One flow connector from ELK's orthogonal route (draw.io units): a live
 * orthogonalEdgeStyle connector through ELK's bends, ends pinned where ELK
 * put them; a route that is not orthogonal becomes a polyline.
 */
export function flowEdge(dio: string, route: readonly Point[], source: Rect, target: Rect,
  ends: { climbedSource?: boolean; climbedTarget?: boolean; roundSource?: boolean; roundTarget?: boolean } = {}): { dio: string; points: Point[] } {
  const l = route.map((p) => ({ ...p }));
  // A shape whose outline is not its box (a rhombus, an ellipse…) is met in
  // the middle of the side ELK chose, where the outline touches the box
  // (ElkApplier._terminalDiagonal / _pinPerpendicularPerimeter).
  if (ends.roundSource && !ends.climbedSource) l[0] = sideMidpoint(source, l[0]);
  if (ends.roundTarget && !ends.climbedTarget) l[l.length - 1] = sideMidpoint(target, l[l.length - 1]);
  let points = l.slice(1, -1).map((p) => ({ x: round(p.x), y: round(p.y) }));
  let out = dio;
  const pin = (start: boolean, chain: readonly Point[]) => {
    if (start ? ends.climbedSource : ends.climbedTarget) return;
    const box = start ? source : target;
    const end = start ? chain[0] : chain[chain.length - 1];
    const next = start ? chain[1] : chain[chain.length - 2];
    const [h, u] = endpointConstraint(box, end, next);
    out = setStyleValue(setStyleValue(out, start ? 'exitX' : 'entryX', h), start ? 'exitY' : 'entryY', u);
  };
  if (isOrthogonalChain(l)) {
    if (points.length > 0) {
      alignEndpointSegment(points, l, true);
      alignEndpointSegment(points, l, false);
    } else {
      points = synthesizeZ(l);
    }
    const chain = [l[0], ...points, l[l.length - 1]];
    pin(true, chain);
    pin(false, chain);
    points = simplifyOrthogonal(chain).slice(1, -1);
    if (points.length === 0) points = synthesizeZ(l);
    out = orthogonal(out);
  } else {
    pin(true, l);
    pin(false, l);
    out = setStyleValue(setStyleValue(out, 'edgeStyle', null), 'noEdgeStyle', '1');
  }
  return { dio: out, points };
}
