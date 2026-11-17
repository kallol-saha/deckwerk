/**
 * draw.io pages ⇄ DeckWerk elements.
 *
 * Reading: every vertex becomes a `vertex` element and every edge a
 * `connector`; label cells on edges become the connector's `labels`;
 * layers and the model's attributes go to the slide's `diagrams` entry.
 * Positions are draw.io page coordinates times the placement's scale plus
 * its origin. Writing reverses it exactly, so a page read and written back
 * keeps its cells, ids, styles, values and geometry.
 */

import type {
  ConnectorEl, ConnectorLabel, DiagramMeta, Slide, SlideElement, VertexEl,
} from '../deck.js';
import { rerouted } from './element.js';
import {
  absoluteBounds, cellIndex, cellLabel,
  type CellGeometry, type DiagramCell, type DiagramPage, type DrawioDocument,
} from './model.js';
import { getStyleValue, setStyleValue } from './style.js';
import type { Point, Rect } from './types.js';

export interface Placement {
  /** Where draw.io's page origin goes on the slide. */
  origin: Point;
  /** draw.io's view scale. */
  scale: number;
}

/** Bounds of every drawn cell of a page (vertices, edge points), in page units. */
export function pageContentBounds(page: DiagramPage): Rect | null {
  const boxes = absoluteBounds(page);
  const byId = cellIndex(page);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const cell of page.cells) {
    if (cell.kind === 'vertex') {
      const parent = cell.parent != null ? byId.get(cell.parent) : undefined;
      if (parent?.kind === 'edge') continue;
      const b = boxes.get(cell.id);
      if (b) {
        add(b.x, b.y);
        add(b.x + b.width, b.y + b.height);
      }
    } else if (cell.kind === 'edge' && cell.geometry) {
      const o = originOfParent(cell, boxes);
      for (const p of [...(cell.geometry.points ?? []), cell.geometry.sourcePoint, cell.geometry.targetPoint]) {
        if (p) add(o.x + p.x, o.y + p.y);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function originOfParent(cell: DiagramCell, boxes: Map<string, Rect>): Point {
  if (cell.parent == null) return { x: 0, y: 0 };
  const b = boxes.get(cell.parent);
  return b ? { x: b.x, y: b.y } : { x: 0, y: 0 };
}

/**
 * Where to put a page on a canvas: centred, and scaled to fill most of it
 * without going past `maxScale` (diagrams drawn for a page are small on a
 * 1920×1080 slide; scaling is draw.io's zoom, so styles keep their values).
 */
export function fitPlacement(
  page: DiagramPage,
  canvas: { w: number; h: number },
  options: { margin?: number; maxScale?: number; scale?: number } = {},
): Placement {
  const bounds = pageContentBounds(page) ?? { x: 0, y: 0, width: 1, height: 1 };
  const margin = options.margin ?? 0.08;
  const fit = Math.min(
    (canvas.w * (1 - 2 * margin)) / Math.max(bounds.width, 1),
    (canvas.h * (1 - 2 * margin)) / Math.max(bounds.height, 1),
  );
  const scale = options.scale ?? Math.max(0.1, Math.min(options.maxScale ?? 2, fit));
  return {
    scale,
    origin: {
      x: canvas.w / 2 - (bounds.x + bounds.width / 2) * scale,
      y: canvas.h / 2 - (bounds.y + bounds.height / 2) * scale,
    },
  };
}

const MIN_SIZE = 0.01;

export interface PageImport {
  elements: SlideElement[];
  meta: DiagramMeta;
}

/**
 * The elements for one draw.io page. `makeId` names new elements (DeckWerk
 * ids are deck-wide unique); `diagramId` is the slide's key for the page;
 * `z` is the paint order given to the first element.
 */
export function pageToElements(
  page: DiagramPage,
  options: {
    diagramId: string;
    placement: Placement;
    makeId: (prefix: string) => string;
    z?: number;
    fileAttributes?: Record<string, string>;
  },
): PageImport {
  const { scale, origin } = options.placement;
  const byId = cellIndex(page);
  const boxes = absoluteBounds(page);
  const root = page.cells.find((c) => c.kind === 'root') ?? page.cells.find((c) => c.parent == null);
  const rootId = root?.id ?? '0';
  const layerCells = page.cells.filter((c) => c.kind === 'layer' || (c.parent === rootId && c.kind === 'other'));
  const toSlide = (p: Point): Point => ({ x: origin.x + p.x * scale, y: origin.y + p.y * scale });

  // Paint order: draw.io draws the model depth first, parents before children.
  const children = new Map<string, DiagramCell[]>();
  for (const cell of page.cells) {
    if (cell.parent == null) continue;
    const list = children.get(cell.parent) ?? [];
    list.push(cell);
    children.set(cell.parent, list);
  }
  const ordered: DiagramCell[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      ordered.push(child);
      walk(child.id);
    }
  };
  walk(rootId);
  // Cells whose parent is missing still get drawn, last.
  for (const cell of page.cells) if (!seen.has(cell.id) && cell.kind !== 'root') ordered.push(cell);

  const hiddenByAncestor = (cell: DiagramCell): boolean => {
    let parent = cell.parent != null ? byId.get(cell.parent) : undefined;
    const guard = new Set<string>();
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id);
      if (!parent.visible) return true;
      if (parent.kind === 'vertex' && parent.collapsed) return true;
      parent = parent.parent != null ? byId.get(parent.parent) : undefined;
    }
    return false;
  };

  const elementIdOf = new Map<string, string>();
  for (const cell of ordered) {
    if (cell.kind === 'vertex' || cell.kind === 'edge') {
      const parent = cell.parent != null ? byId.get(cell.parent) : undefined;
      if (cell.kind === 'vertex' && parent?.kind === 'edge') continue; // an edge label
      elementIdOf.set(cell.id, options.makeId(cell.kind === 'vertex' ? 'vertex' : 'connector'));
    }
  }

  const common = (cell: DiagramCell) => ({
    dio: cell.style,
    label: cellLabel(cell),
    cell: cell.id,
    diagram: options.diagramId,
    parent: cell.parent,
    scale,
    origin: { ...origin },
    ...(cell.object ? { object: cell.object } : {}),
    ...(Object.keys(cell.extra).length > 0 ? { extra: { ...cell.extra } } : {}),
    ...(!cell.visible ? { hidden: true } : {}),
    ...(hiddenByAncestor(cell) ? { concealed: true } : {}),
  });

  const elements: SlideElement[] = [];
  const connectors: ConnectorEl[] = [];
  let z = options.z ?? 0;
  for (const cell of ordered) {
    const id = elementIdOf.get(cell.id);
    if (!id) continue;
    if (cell.kind === 'vertex') {
      const box = boxes.get(cell.id) ?? { x: 0, y: 0, width: 0, height: 0 };
      const at = toSlide(box);
      const g = cell.geometry;
      const parent = cell.parent != null ? byId.get(cell.parent) : undefined;
      const vertex: VertexEl = {
        type: 'vertex',
        id,
        x: at.x,
        y: at.y,
        w: Math.max(box.width * scale, MIN_SIZE),
        h: Math.max(box.height * scale, MIN_SIZE),
        rot: Number(getStyleValue(cell.style, 'rotation') ?? 0) || 0,
        z: z++,
        opacity: 1,
        class: [],
        style: {},
        ...common(cell),
        ...(cell.collapsed ? { collapsed: true } : {}),
        ...(!cell.connectable ? { connectable: false } : {}),
        ...(g?.relative && parent?.kind === 'vertex'
          ? { relative: { x: g.x, y: g.y, offset: g.offset ?? null } }
          : g?.offset ? { offset: { ...g.offset } } : {}),
        ...(g?.alternateBounds
          ? { alternateBounds: { x: g.alternateBounds.x, y: g.alternateBounds.y, w: g.alternateBounds.width, h: g.alternateBounds.height } }
          : {}),
      };
      elements.push(vertex);
    } else {
      const g = cell.geometry;
      const o = originOfParent(cell, boxes);
      const abs = (p: Point | undefined) => (p ? toSlide({ x: o.x + p.x, y: o.y + p.y }) : null);
      const labels: ConnectorLabel[] = (children.get(cell.id) ?? [])
        .filter((c) => c.kind === 'vertex')
        .map((c) => ({
          cell: c.id,
          label: cellLabel(c),
          dio: c.style,
          x: c.geometry?.x ?? 0,
          y: c.geometry?.y ?? 0,
          offset: c.geometry?.offset ?? null,
          w: c.geometry?.width ?? 0,
          h: c.geometry?.height ?? 0,
          ...(!c.connectable ? { connectable: false } : {}),
          ...(c.object ? { object: c.object } : {}),
          ...(Object.keys(c.extra).length > 0 ? { extra: { ...c.extra } } : {}),
          ...(!c.visible ? { hidden: true } : {}),
        }));
      const connector: ConnectorEl = {
        type: 'connector',
        id,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        rot: 0,
        z: z++,
        opacity: 1,
        class: [],
        style: {},
        ...common(cell),
        source: cell.source ? elementIdOf.get(cell.source) ?? null : null,
        target: cell.target ? elementIdOf.get(cell.target) ?? null : null,
        points: (g?.points ?? []).map((p) => toSlide({ x: o.x + p.x, y: o.y + p.y })),
        sourcePoint: abs(g?.sourcePoint),
        targetPoint: abs(g?.targetPoint),
        labelGeometry: g && (g.x !== 0 || g.y !== 0 || g.offset || g.width !== 0 || g.height !== 0)
          ? {
            x: g.x, y: g.y, offset: g.offset ?? null,
            ...(g.width !== 0 ? { w: g.width } : {}),
            ...(g.height !== 0 ? { h: g.height } : {}),
          }
          : null,
        labels,
        route: [],
      };
      connectors.push(connector);
      elements.push(connector);
    }
  }

  // Route once every vertex is placed.
  const vertices = new Map<string, VertexEl>();
  for (const el of elements) if (el.type === 'vertex') vertices.set(el.id, el);
  const routed = new Map(connectors.map((c) => [c.id, rerouted(c, (vid) => vertices.get(vid))]));
  const finalElements = elements.map((el) => routed.get(el.id) ?? el);

  const meta: DiagramMeta = {
    name: page.name,
    pageId: page.id,
    model: { ...page.model },
    root: rootId,
    layers: layerCells.map((c) => ({
      cell: c.id,
      label: cellLabel(c),
      dio: c.style,
      ...(!c.visible ? { hidden: true } : {}),
      ...(c.object ? { object: c.object } : {}),
      ...(Object.keys(c.extra).length > 0 ? { extra: { ...c.extra } } : {}),
    })),
    origin,
    scale,
    ...(page.model.animation ? { animation: page.model.animation } : {}),
    ...(options.fileAttributes ? { fileAttributes: options.fileAttributes } : {}),
    ...(Object.keys(page.extra).length > 0 ? { pageAttributes: { ...page.extra } } : {}),
  };
  if (meta.layers.length === 0) meta.layers = [{ cell: '1', label: '', dio: '' }];
  return { elements: finalElements, meta };
}

// --- writing back -----------------------------------------------------------------

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundPoint(p: Point): Point {
  return { x: round(p.x), y: round(p.y) };
}

const DEFAULT_META: DiagramMeta = {
  name: 'Page-1',
  model: {},
  root: '0',
  layers: [{ cell: '1', label: '', dio: '' }],
  origin: { x: 0, y: 0 },
  scale: 1,
};

/** The diagram ids used on a slide, in paint order of their first cell. */
export function slideDiagramIds(slide: Pick<Slide, 'elements' | 'diagrams'>): string[] {
  const ids: string[] = [];
  for (const el of slide.elements) {
    if ((el.type === 'vertex' || el.type === 'connector') && !ids.includes(el.diagram)) ids.push(el.diagram);
  }
  for (const id of Object.keys(slide.diagrams ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/**
 * One diagram of a slide as a draw.io page: its cells with geometry back in
 * draw.io page coordinates (parent-relative), in paint order with parents
 * before their children.
 */
export function elementsToPage(slide: Pick<Slide, 'elements' | 'diagrams'>, diagramId: string): DiagramPage {
  const meta = slide.diagrams?.[diagramId] ?? DEFAULT_META;
  const { origin } = meta;
  const cells = slide.elements
    .filter((el): el is VertexEl | ConnectorEl => (el.type === 'vertex' || el.type === 'connector') && el.diagram === diagramId)
    .map((el, index) => ({ el, index }))
    .sort((a, b) => (a.el.z - b.el.z) || (a.index - b.index))
    .map(({ el }) => el);
  const byElementId = new Map(cells.map((el) => [el.id, el]));
  const byCell = new Map(cells.map((el) => [el.cell, el]));
  // Each cell carries the frame it was placed in; the diagram's record is the fallback.
  const toPage = (el: { scale: number; origin?: Point }, p: Point): Point => {
    const o = el.origin ?? origin;
    return { x: (p.x - o.x) / el.scale, y: (p.y - o.y) / el.scale };
  };

  // Page-space origin of each vertex, for parent-relative geometry.
  const pageBox = (el: VertexEl): Rect => {
    const at = toPage(el, { x: el.x, y: el.y });
    return { x: at.x, y: at.y, width: el.w / el.scale, height: el.h / el.scale };
  };
  const parentOrigin = (parent: string | null): Point => {
    const p = parent != null ? byCell.get(parent) : undefined;
    if (!p || p.type !== 'vertex') return { x: 0, y: 0 };
    const box = pageBox(p);
    return { x: box.x, y: box.y };
  };

  const layerIds = new Set(meta.layers.map((l) => l.cell));
  const out: DiagramCell[] = [];
  const blank = (id: string, parent: string | null, kind: DiagramCell['kind']): DiagramCell => ({
    id, parent, kind, value: '', style: '', source: null, target: null,
    visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {},
  });
  out.push(blank(meta.root, null, 'root'));
  for (const layer of meta.layers) {
    out.push({
      ...blank(layer.cell, meta.root, 'layer'),
      value: layer.object ? '' : layer.label,
      style: layer.dio,
      visible: !layer.hidden,
      object: layer.object ? { tag: layer.object.tag, attrs: { ...layer.object.attrs, label: layer.label } } : null,
      extra: { ...(layer.extra ?? {}) },
    });
  }
  // Parents a cell names that are neither layers nor cells of this diagram
  // (it was pasted from elsewhere) fall back to the first layer.
  const firstLayer = meta.layers[0]?.cell ?? '1';
  const parentFor = (parent: string | null): string => {
    if (parent != null && (layerIds.has(parent) || byCell.has(parent))) return parent;
    return firstLayer;
  };

  const valueAndObject = (label: string, object: VertexEl['object']) => (object
    ? { value: '', object: { tag: object.tag, attrs: { ...object.attrs, label } } }
    : { value: label, object: null });

  for (const el of cells) {
    const parent = parentFor(el.parent);
    if (el.type === 'vertex') {
      let style = el.dio;
      const written = Number(getStyleValue(style, 'rotation') ?? 0) || 0;
      if (round(written) !== round(el.rot)) style = setStyleValue(style, 'rotation', el.rot ? round(el.rot) : null);
      const box = pageBox(el);
      let geometry: CellGeometry;
      const parentVertex = byCell.get(parent);
      if (el.relative && parentVertex && parentVertex.type === 'vertex') {
        const pb = pageBox(parentVertex);
        const off = el.relative.offset ?? { x: 0, y: 0 };
        geometry = {
          x: round(pb.width ? (box.x - pb.x - off.x) / pb.width : el.relative.x),
          y: round(pb.height ? (box.y - pb.y - off.y) / pb.height : el.relative.y),
          width: round(box.width),
          height: round(box.height),
          relative: true,
          ...(el.relative.offset ? { offset: roundPoint(el.relative.offset) } : {}),
        };
      } else {
        const o = parentOrigin(parent);
        geometry = {
          x: round(box.x - o.x), y: round(box.y - o.y), width: round(box.width), height: round(box.height), relative: false,
          ...(el.offset ? { offset: roundPoint(el.offset) } : {}),
        };
      }
      if (el.alternateBounds) {
        geometry.alternateBounds = { x: el.alternateBounds.x, y: el.alternateBounds.y, width: el.alternateBounds.w, height: el.alternateBounds.h };
      }
      out.push({
        ...blank(el.cell, parent, 'vertex'),
        ...valueAndObject(el.label, el.object ?? null),
        style,
        visible: !el.hidden,
        collapsed: Boolean(el.collapsed),
        connectable: el.connectable !== false,
        geometry,
        extra: { ...(el.extra ?? {}) },
      });
    } else {
      const o = parentOrigin(parent);
      const rel = (p: Point): Point => {
        const q = toPage(el, p);
        return roundPoint({ x: q.x - o.x, y: q.y - o.y });
      };
      const g = el.labelGeometry;
      const geometry: CellGeometry = {
        x: g?.x ?? 0,
        y: g?.y ?? 0,
        width: g?.w ?? 0,
        height: g?.h ?? 0,
        relative: true,
        ...(el.sourcePoint && !el.source ? { sourcePoint: rel(el.sourcePoint) } : {}),
        ...(el.targetPoint && !el.target ? { targetPoint: rel(el.targetPoint) } : {}),
        ...(el.points.length > 0 ? { points: el.points.map(rel) } : {}),
        ...(g?.offset ? { offset: roundPoint(g.offset) } : {}),
      };
      const source = el.source ? byElementId.get(el.source) : undefined;
      const target = el.target ? byElementId.get(el.target) : undefined;
      out.push({
        ...blank(el.cell, parent, 'edge'),
        ...valueAndObject(el.label, el.object ?? null),
        style: el.dio,
        source: source ? source.cell : null,
        target: target ? target.cell : null,
        visible: !el.hidden,
        geometry,
        extra: { ...(el.extra ?? {}) },
      });
      for (const label of el.labels) {
        out.push({
          ...blank(label.cell, el.cell, 'vertex'),
          ...valueAndObject(label.label, label.object ?? null),
          style: label.dio,
          visible: !label.hidden,
          connectable: label.connectable !== false,
          geometry: {
            x: label.x, y: label.y, width: label.w, height: label.h, relative: true,
            ...(label.offset ? { offset: roundPoint(label.offset) } : {}),
          },
          extra: { ...(label.extra ?? {}) },
        });
      }
    }
  }

  // Parents before children, so the file reads top-down as draw.io writes it.
  const position = new Map(out.map((c, i) => [c.id, i]));
  const sorted: DiagramCell[] = [];
  const placed = new Set<string>();
  const place = (cell: DiagramCell, guard: Set<string>) => {
    if (placed.has(cell.id) || guard.has(cell.id)) return;
    guard.add(cell.id);
    if (cell.parent != null) {
      const parentCell = out[position.get(cell.parent) ?? -1];
      if (parentCell) place(parentCell, guard);
    }
    placed.add(cell.id);
    sorted.push(cell);
  };
  for (const cell of out) place(cell, new Set());

  const model = { ...meta.model };
  if (meta.animation) model.animation = meta.animation;
  return {
    id: meta.pageId ?? diagramId,
    name: meta.name,
    model,
    cells: sorted,
    extra: { ...(meta.pageAttributes ?? {}) },
  };
}

/** Every diagram on a slide as one draw.io document, a page each. */
export function slideToDrawio(slide: Pick<Slide, 'elements' | 'diagrams'>, diagramIds = slideDiagramIds(slide)): DrawioDocument {
  const first = diagramIds[0] != null ? slide.diagrams?.[diagramIds[0]] : undefined;
  return {
    attributes: { ...(first?.fileAttributes ?? {}) },
    pages: diagramIds.map((id) => elementsToPage(slide, id)),
  };
}
