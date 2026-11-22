/*
 * Library items as cells on a slide. Ported in part from draw.io (jgraph/drawio
 * 32.7.4), Copyright (c) 2006-2024, JGraph Ltd and Copyright (c) 2006-2024,
 * draw.io AG, Apache License 2.0: mxGraph.getBoundingBoxFromGeometry
 * (mxgraph/src/view/mxGraph.js) and Sidebar.createThumb (js/grapheditor/
 * Sidebar.js). Modified for DeckWerk: cells become `vertex`/`connector`
 * elements through the .drawio converter (convert.ts), joining the slide's
 * diagram as insert.ts joins new cells.
 */

import type { ConnectorEl, DiagramMeta, Slide, SlideElement, VertexEl } from '../../deck.js';
import { pageToElements } from '../convert.js';
import { diagramContentBounds, diagramFigureSvg } from '../figure.js';
import { defaultLayer, freshCellId, targetDiagram, usedCellIds } from '../insert.js';
import type { DiagramCell, DiagramPage } from '../model.js';
import type { Point, Rect } from '../types.js';
import type { LibraryCell, LibraryItem } from './types.js';

/** A cell placed on a slide, in the shape `addCells` (insert.ts) takes. */
export interface PlacedCell {
  element: VertexEl | ConnectorEl;
  diagramId: string;
  meta: DiagramMeta | null;
}

/** Whether the item is a single loose edge (draw.io's edge entries: lines, arrows, connectors). */
export function isEdgeItem(item: Pick<LibraryItem, 'cells'>): boolean {
  const top = item.cells.filter((c) => c.parent == null);
  return top.length === 1 && top[0].edge === true;
}

function topLevel(item: Pick<LibraryItem, 'cells'>): LibraryCell[] {
  return item.cells.filter((c) => c.parent == null);
}

/**
 * mxGraph.getBoundingBoxFromGeometry(cells, true) for the item's top-level
 * cells, in draw.io units: vertex boxes, and the loose ends and waypoints of
 * edges. The placement of a clicked item centres this box.
 */
export function templateBounds(item: Pick<LibraryItem, 'cells' | 'width' | 'height'>): Rect {
  let box: Rect | null = null;
  const add = (r: Rect) => {
    if (!box) {
      box = { ...r };
      return;
    }
    const x0 = Math.min(box.x, r.x);
    const y0 = Math.min(box.y, r.y);
    const x1 = Math.max(box.x + box.width, r.x + r.width);
    const y1 = Math.max(box.y + box.height, r.y + r.height);
    box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  for (const cell of topLevel(item)) {
    const g = cell.geometry;
    if (cell.edge) {
      let edgeBox: Rect | null = null;
      const addPoint = (p: Point | undefined) => {
        if (!p) return;
        if (!edgeBox) edgeBox = { x: p.x, y: p.y, width: 0, height: 0 };
        else {
          const x0 = Math.min(edgeBox.x, p.x);
          const y0 = Math.min(edgeBox.y, p.y);
          const x1 = Math.max(edgeBox.x + edgeBox.width, p.x);
          const y1 = Math.max(edgeBox.y + edgeBox.height, p.y);
          edgeBox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        }
      };
      if (!cell.source) addPoint(g.sourcePoint);
      if (!cell.target) addPoint(g.targetPoint);
      for (const p of g.points ?? []) addPoint(p);
      if (edgeBox) add(edgeBox);
    } else {
      add({ x: g.x, y: g.y, width: g.width, height: g.height });
    }
  }
  return box ?? { x: 0, y: 0, width: item.width, height: item.height };
}

/** The item's cells as a draw.io model's cells (parents before children), under `layer`. */
export function templateCells(
  item: Pick<LibraryItem, 'cells'>,
  options: { layer?: string; translate?: Point; ids?: (id: string) => string } = {},
): DiagramCell[] {
  const layer = options.layer ?? '1';
  const dx = options.translate?.x ?? 0;
  const dy = options.translate?.y ?? 0;
  const id = options.ids ?? ((x: string) => x);
  const move = (p: Point | undefined, top: boolean) => (p ? { x: p.x + (top ? dx : 0), y: p.y + (top ? dy : 0) } : undefined);
  return item.cells.map((c) => {
    const top = c.parent == null;
    const g = c.geometry;
    // mxGraph.cellsMoved moves the top-level cells only: children are relative to their parent.
    const shiftBox = top && !c.edge && !g.relative;
    return {
      id: id(c.id),
      parent: top ? layer : id(c.parent!),
      kind: c.edge ? 'edge' : 'vertex',
      value: c.object ? '' : (c.value ?? ''),
      style: c.style,
      source: c.source ? id(c.source) : null,
      target: c.target ? id(c.target) : null,
      visible: c.visible !== false,
      collapsed: c.collapsed === true,
      connectable: c.connectable !== false,
      geometry: {
        x: g.x + (shiftBox ? dx : 0),
        y: g.y + (shiftBox ? dy : 0),
        width: g.width,
        height: g.height,
        relative: g.relative === true,
        ...(g.points ? { points: g.points.map((p) => move(p, top && c.edge === true)!) } : {}),
        ...(g.sourcePoint ? { sourcePoint: move(g.sourcePoint, top && c.edge === true) } : {}),
        ...(g.targetPoint ? { targetPoint: move(g.targetPoint, top && c.edge === true) } : {}),
        ...(g.offset ? { offset: { ...g.offset } } : {}),
      },
      object: c.object ? { tag: c.object.tag, attrs: { ...c.object.attrs } } : null,
      extra: {},
    } satisfies DiagramCell;
  });
}

function topZ(elements: readonly SlideElement[]): number {
  return elements.reduce((max, el) => Math.max(max, el.z), -1) + 1;
}

export interface PlaceOptions {
  /** The diagram to join (insert.ts targetDiagram's `preferred`). */
  diagramId?: string | null;
  /** The selection, whose diagram new cells join when given. */
  selection?: Iterable<string>;
  /** The draw.io parent of the top-level cells (a container's cell id); default: the diagram's layer. */
  parent?: string | null;
}

/**
 * The elements for a library item on `slide`, its cells moved by
 * `translate` (draw.io units, mxGraph.importCells' dx/dy): fresh cell ids,
 * the diagram's scale and origin, the diagram's layer as parent of the
 * top-level cells, connectors routed. The first entry carries the diagram
 * record when the slide had none (`meta`), as insert.ts does.
 */
export function placeItem(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells'>,
  translate: Point,
  makeId: (prefix: string) => string,
  options: PlaceOptions = {},
): PlacedCell[] {
  const target = targetDiagram(slide, { preferred: options.diagramId ?? null, selection: options.selection });
  const { meta } = target;
  const used = usedCellIds(slide, target.id);
  const ids = new Map<string, string>();
  for (const c of item.cells) ids.set(c.id, freshCellId(used));
  const layer = defaultLayer(meta);
  const root = meta.root ?? '0';
  // A container parent is not in this page: its cells' boxes stay absolute, as slide boxes are.
  const parent = options.parent ?? layer;
  const page: DiagramPage = {
    id: 'library',
    name: meta.name,
    model: {},
    extra: {},
    cells: [
      { id: root, parent: null, kind: 'root', value: '', style: '', source: null, target: null, visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {} },
      { id: layer, parent: root, kind: 'layer', value: '', style: '', source: null, target: null, visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {} },
      ...templateCells(item, { layer: parent, translate, ids: (id) => ids.get(id) ?? id }),
    ],
  };
  const { elements } = pageToElements(page, {
    diagramId: target.id,
    placement: { origin: { ...meta.origin }, scale: meta.scale },
    makeId,
    z: topZ(slide.elements),
  });
  return elements
    .filter((el): el is VertexEl | ConnectorEl => el.type === 'vertex' || el.type === 'connector')
    .map((element, index) => ({ element, diagramId: target.id, meta: index === 0 && target.created ? meta : null }));
}

// --- thumbnails -----------------------------------------------------------------

let previewIds = 0;
const previewId = (prefix: string) => `${prefix}-lib${++previewIds}`;

/** The item's cells at `scale`, its draw.io origin at `origin` (preview space, not a slide). */
export function previewElements(item: Pick<LibraryItem, 'cells'>, origin: Point, scale: number, showLabel = true): SlideElement[] {
  const page: DiagramPage = {
    id: 'preview',
    name: 'preview',
    model: {},
    extra: {},
    cells: [
      { id: '0', parent: null, kind: 'root', value: '', style: '', source: null, target: null, visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {} },
      { id: '1', parent: '0', kind: 'layer', value: '', style: '', source: null, target: null, visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {} },
      ...templateCells(item, { layer: '1', ids: (id) => `t${id}` }),
    ],
  };
  const { elements } = pageToElements(page, { diagramId: 'preview', placement: { origin, scale }, makeId: previewId });
  if (showLabel) return elements;
  return elements.map((el) => {
    if (el.type === 'vertex') return { ...el, label: '' };
    if (el.type === 'connector') return { ...el, label: '', labels: el.labels.map((l) => ({ ...l, label: '' })) };
    return el;
  });
}

/** What the item paints, in draw.io units at scale 1 (shapes, arrowheads; not labels outside the shapes). */
export function paintedBounds(item: Pick<LibraryItem, 'cells' | 'width' | 'height'>): Rect {
  return diagramContentBounds(previewElements(item, { x: 0, y: 0 }, 1, false))
    ?? { x: 0, y: 0, width: Math.max(1, item.width), height: Math.max(1, item.height) };
}

export interface ItemSvgOptions {
  /** Output size in CSS pixels. */
  width: number;
  height: number;
  /** Padding inside the box, as draw.io's thumbBorder. */
  border?: number;
  /**
   * draw.io units per output pixel (a drag preview at the canvas zoom); when
   * absent the item is fitted into the box (Sidebar.createThumb).
   */
  scale?: number;
  showLabel?: boolean;
}

/**
 * The item drawn as one SVG document. Without `scale`, fitted and centred in
 * the box exactly as Sidebar.createThumb scales a palette thumbnail:
 * floor(min((w − 2·border) / bounds.w, (h − 2·border) / bounds.h) · 100) / 100.
 */
export function itemSvg(item: Pick<LibraryItem, 'cells' | 'width' | 'height' | 'showLabel'>, options: ItemSvgOptions): string {
  const showLabel = options.showLabel ?? item.showLabel !== false;
  const border = options.border ?? 1;
  const bounds = paintedBounds(item);
  const bw = Math.max(bounds.width, 1);
  const bh = Math.max(bounds.height, 1);
  let s: number;
  let ox: number;
  let oy: number;
  if (options.scale != null) {
    s = options.scale;
    ox = -bounds.x * s;
    oy = -bounds.y * s;
  } else {
    s = Math.floor(Math.min((options.width - 2 * border) / bw, (options.height - 2 * border) / bh) * 100) / 100;
    if (!(s > 0)) s = Math.min((options.width - 2 * border) / bw, (options.height - 2 * border) / bh);
    ox = (options.width - bw * s) / 2 - bounds.x * s;
    oy = (options.height - bh * s) / 2 - bounds.y * s;
  }
  const elements = previewElements(item, { x: ox, y: oy }, s, showLabel);
  return diagramFigureSvg(elements, {
    viewBox: { x: 0, y: 0, width: options.width, height: options.height },
    width: options.width,
    height: options.height,
  }).replace(/^<\?xml[^>]*>\s*/, '');
}
