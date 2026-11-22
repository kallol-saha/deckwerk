/*
 * What a click or a drop of a library item does to a slide. Ported from
 * draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024, JGraph Ltd and
 * Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Sidebar.js (itemClicked, isConnectSelectedVertices,
 * createDropHandler, dropAndConnect, getDropAndConnectGeometry),
 * js/diagramly/sidebar/Sidebar.js (itemClicked: a shape clicked with a loose
 * edge selected ends the edge), js/grapheditor/Graph.js (getCenterInsertPoint,
 * getFreeInsertPoint, updateShapes, defaultEdgeLength) and mxGraph.snap.
 * Modified for DeckWerk: the edits are computed on a slide's elements (slide
 * pixels, draw.io units through the diagram's origin and scale) and handed
 * back for one store commit.
 */

import type { ConnectorEl, DiagramMeta, Slide, SlideElement, VertexEl } from '../../deck.js';
import { DEFAULT_EDGE_STYLE, newConnector, targetDiagram } from '../insert.js';
import { NAMED_STYLES, parseStyleString, resolveStyle, setStyleValue } from '../style.js';
import type { Point, Rect } from '../types.js';
import { isEdgeItem, placeItem, templateBounds, type PlacedCell } from './template.js';
import type { LibraryCell, LibraryItem } from './types.js';

export type Direction = 'north' | 'east' | 'south' | 'west';

/** Graph.prototype.defaultEdgeLength: the gap Alt+click leaves between a shape and the one it adds. */
export const DEFAULT_EDGE_LENGTH = 80;

export interface DiagramFrame {
  origin: Point;
  scale: number;
}

export interface Grid {
  enabled: boolean;
  size: number;
}

/** The diagram's grid, from its model attributes (draw.io: on, 10). */
export function diagramGrid(meta: Pick<DiagramMeta, 'model'> | null | undefined): Grid {
  const size = Number(meta?.model?.gridSize ?? 10);
  return { enabled: meta?.model?.grid !== '0', size: Number.isFinite(size) && size > 0 ? size : 10 };
}

/** mxGraph.snap. */
export function snap(value: number, grid: Grid): number {
  return grid.enabled ? Math.round(value / grid.size) * grid.size : value;
}

export function toUnits(p: Point, frame: DiagramFrame): Point {
  return { x: (p.x - frame.origin.x) / frame.scale, y: (p.y - frame.origin.y) / frame.scale };
}

export function toSlide(p: Point, frame: DiagramFrame): Point {
  return { x: frame.origin.x + p.x * frame.scale, y: frame.origin.y + p.y * frame.scale };
}

/** The frame (origin, scale) new cells on `slide` get: the diagram they will join. */
export function insertionFrame(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  selection: Iterable<string> = [],
): { frame: DiagramFrame; grid: Grid; diagramId: string } {
  const target = targetDiagram(slide, { selection });
  return { frame: { origin: { ...target.meta.origin }, scale: target.meta.scale }, grid: diagramGrid(target.meta), diagramId: target.id };
}

/**
 * Graph.getCenterInsertPoint: the translation that puts the item's bounds
 * (mxGraph.getBoundingBoxFromGeometry) in the middle of the view, snapped.
 * `centre` is the middle of the visible canvas, in draw.io units.
 */
export function centerInsertPoint(item: Pick<LibraryItem, 'cells' | 'width' | 'height'>, centre: Point, grid: Grid): Point {
  const bbox = templateBounds(item);
  return {
    x: snap(Math.round(centre.x - bbox.width / 2), grid),
    y: snap(Math.round(centre.y - bbox.height / 2), grid),
  };
}

/**
 * Graph.getFreeInsertPoint: at the left of the view (or the diagram) and two
 * grid steps below everything already on it. `viewTopLeft` is the visible
 * canvas' top-left corner, in draw.io units.
 */
export function freeInsertPoint(diagramBounds: Rect | null, viewTopLeft: Point, grid: Grid): Point {
  const pt = { x: snap(viewTopLeft.x + grid.size, grid), y: snap(viewTopLeft.y + grid.size, grid) };
  const bds = diagramBounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const empty = diagramBounds == null;
  return {
    x: snap(Math.round(Math.max(pt.x, bds.x + (bds.width === 0 ? 2 * grid.size : 0))), grid),
    y: snap(Math.round(Math.max(pt.y, empty ? pt.y : bds.y + bds.height + 2 * grid.size)), grid),
  };
}

/**
 * Where a dragged item lands (mxDragSource.dragOver without a preview
 * offset): the preview's corner is at the pointer, snapped to the grid
 * half a step up and left, as draw.io snaps it. `pointer` is in draw.io units.
 */
export function dropInsertPoint(pointer: Point, grid: Grid): Point {
  const off = grid.enabled ? grid.size / 2 : 0;
  return { x: Math.round(snap(pointer.x - off, grid)), y: Math.round(snap(pointer.y - off, grid)) };
}

/** An edit for one store commit: cells to add, elements to replace, what to select. */
export interface LibraryEdit {
  add: PlacedCell[];
  /** Replacements for existing elements, by id. */
  update: Map<string, SlideElement>;
  select: string[];
  /** Short undo label. */
  label: string;
}

function emptyEdit(label: string): LibraryEdit {
  return { add: [], update: new Map(), select: [], label };
}

/** Puts the edit on the slide (inside a store commit). */
export function applyLibraryEdit(slide: Slide, edit: LibraryEdit): void {
  if (edit.update.size > 0) slide.elements = slide.elements.map((el) => edit.update.get(el.id) ?? el);
  for (const { element, diagramId, meta } of edit.add) {
    if (meta && !slide.diagrams?.[diagramId]) slide.diagrams = { ...(slide.diagrams ?? {}), [diagramId]: meta };
    slide.elements.push(element);
  }
}

function insertLabel(item: Pick<LibraryItem, 'title'>): string {
  return item.title ? `Insert ${item.title}` : 'Insert shape';
}

/** The item's cells moved by `translate` (draw.io units) and selected: createDropHandler's plain drop. */
export function insertItem(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title'>,
  translate: Point,
  makeId: (prefix: string) => string,
  options: { selection?: Iterable<string>; diagramId?: string | null } = {},
): LibraryEdit {
  const add = placeItem(slide, item, { x: Math.round(translate.x), y: Math.round(translate.y) }, makeId, options);
  return { add, update: new Map(), select: add.map((c) => c.element.id), label: insertLabel(item) };
}

function vertexOf(slide: Pick<Slide, 'elements'>, id: string | undefined): VertexEl | undefined {
  return slide.elements.find((el): el is VertexEl => el.id === id && el.type === 'vertex');
}

function connectorOf(slide: Pick<Slide, 'elements'>, id: string | undefined): ConnectorEl | undefined {
  return slide.elements.find((el): el is ConnectorEl => el.id === id && el.type === 'connector');
}

function frameOf(el: VertexEl | ConnectorEl): DiagramFrame {
  return { origin: el.origin ?? { x: 0, y: 0 }, scale: el.scale };
}

/** A vertex's box in draw.io units. */
function unitsBox(el: VertexEl): Rect {
  const f = frameOf(el);
  const p = toUnits({ x: el.x, y: el.y }, f);
  return { x: p.x, y: p.y, width: el.w / f.scale, height: el.h / f.scale };
}

/** The first top-level vertex and the first top-level edge without a source, as Sidebar.createDragSource finds them. */
function firstCells(item: Pick<LibraryItem, 'cells'>): { firstVertex: LibraryCell | null; freeSourceEdge: LibraryCell | null } {
  let firstVertex: LibraryCell | null = null;
  let freeSourceEdge: LibraryCell | null = null;
  for (const cell of item.cells) {
    if (cell.parent != null) continue;
    if (firstVertex == null && !cell.edge) firstVertex = cell;
    else if (freeSourceEdge == null && cell.edge && !cell.source) freeSourceEdge = cell;
    if (firstVertex && freeSourceEdge) break;
  }
  return { firstVertex, freeSourceEdge };
}

/** The item's first top-level cell and its descendants, alone (graph.cloneCell(cells[0])). */
function firstCellOnly(item: Pick<LibraryItem, 'cells' | 'title' | 'width' | 'height'>): Pick<LibraryItem, 'cells' | 'title' | 'width' | 'height'> {
  const first = item.cells.find((c) => c.parent == null);
  if (!first) return item;
  const keep = new Set([first.id]);
  for (const c of item.cells) if (c.parent != null && keep.has(c.parent)) keep.add(c.id);
  return {
    ...item,
    cells: item.cells.filter((c) => keep.has(c.id)).map((c) => ({
      ...c,
      ...(c.source && !keep.has(c.source) ? { source: undefined } : {}),
      ...(c.target && !keep.has(c.target) ? { target: undefined } : {}),
    })),
  };
}

/**
 * Sidebar.getDropAndConnectGeometry for a vertex source: where the item's
 * first vertex (or its loose edge) goes beside `source`, in draw.io units.
 */
export function dropAndConnectGeometry(
  source: Rect,
  target: LibraryCell,
  direction: Direction,
  keepSize: boolean,
  length = DEFAULT_EDGE_LENGTH,
): { box: Rect; targetPoint: Point | null } {
  const g = target.geometry;
  const geo2 = { x: g.x, y: g.y, width: g.width, height: g.height };
  if (target.edge && g.sourcePoint && g.targetPoint) {
    // Keeps the edge's length.
    const dx = g.targetPoint.x - g.sourcePoint.x;
    const dy = g.targetPoint.y - g.sourcePoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const cx = source.x + source.width / 2;
    const cy = source.y + source.height / 2;
    switch (direction) {
      case 'north': return { box: { x: cx, y: source.y - len, width: 1, height: len }, targetPoint: { x: cx, y: source.y - len } };
      case 'east': return { box: { x: source.x + source.width, y: cy, width: len, height: 1 }, targetPoint: { x: source.x + source.width + len, y: cy } };
      case 'south': return { box: { x: cx, y: source.y + source.height, width: 1, height: len }, targetPoint: { x: cx, y: source.y + source.height + len } };
      case 'west': return { box: { x: source.x - len, y: cy, width: len, height: 1 }, targetPoint: { x: source.x - len, y: cy } };
    }
  }
  // Matches the height unless either side is under 45 units (special enough to keep).
  if (!keepSize && geo2.width > 45 && geo2.height > 45 && source.width > 45 && source.height > 45) {
    geo2.width = geo2.width * (source.height / geo2.height);
    geo2.height = source.height;
  }
  geo2.x = source.x + source.width / 2 - geo2.width / 2;
  geo2.y = source.y + source.height / 2 - geo2.height / 2;
  if (direction === 'north') geo2.y = geo2.y - source.height / 2 - geo2.height / 2 - length;
  else if (direction === 'east') geo2.x = geo2.x + source.width / 2 + geo2.width / 2 + length;
  else if (direction === 'south') geo2.y = geo2.y + source.height / 2 + geo2.height / 2 + length;
  else geo2.x = geo2.x - source.width / 2 - geo2.width / 2 - length;
  return { box: geo2, targetPoint: null };
}

/**
 * Alt+click with one shape selected (Sidebar.dropAndConnect): the item goes
 * beside the shape in `direction`, a default connector joining them (or the
 * item's own loose edge leaving the shape). With a connector selected, the
 * item's shape ends it instead, at its start for north and its end otherwise.
 */
export function dropAndConnect(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title' | 'width' | 'height'>,
  selectedId: string,
  direction: Direction,
  makeId: (prefix: string) => string,
): LibraryEdit | null {
  const { firstVertex, freeSourceEdge } = firstCells(item);
  const edge = connectorOf(slide, selectedId);
  if (edge) {
    if (!firstVertex) return null;
    // The new cell is centred on the end of the edge it joins.
    const end = direction === 'north' ? edge.route[0] : edge.route[edge.route.length - 1];
    if (!end) return null;
    const f = frameOf(edge);
    const at = toUnits(end, f);
    const g = firstVertex.geometry;
    const add = placeItem(slide, item, {
      x: Math.round(at.x - g.width / 2) - g.x,
      y: Math.round(at.y - g.height / 2) - g.y,
    }, makeId, { diagramId: edge.diagram });
    const vertex = add.find((c) => c.element.type === 'vertex')?.element as VertexEl | undefined;
    if (!vertex) return null;
    const update = new Map<string, SlideElement>();
    update.set(edge.id, direction === 'north'
      ? { ...edge, source: vertex.id, sourcePoint: null }
      : { ...edge, target: vertex.id, targetPoint: null });
    return { add, update, select: add.map((c) => c.element.id), label: insertLabel(item) };
  }

  const source = vertexOf(slide, selectedId);
  if (!source) return null;
  const f = frameOf(source);
  const sourceBox = unitsBox(source);
  const topCount = item.cells.filter((c) => c.parent == null).length;
  const parent = source.parent;

  if (!firstVertex) {
    // A loose edge: it leaves the shape and keeps its length.
    if (!freeSourceEdge) return null;
    const { targetPoint } = dropAndConnectGeometry(sourceBox, freeSourceEdge, direction, topCount > 1);
    const add = placeItem(slide, item, { x: 0, y: 0 }, makeId, { diagramId: source.diagram, parent });
    const placed = add.find((c) => c.element.type === 'connector');
    if (!placed || !targetPoint) return null;
    const connector = placed.element as ConnectorEl;
    placed.element = {
      ...connector,
      source: source.id,
      sourcePoint: null,
      points: [],
      targetPoint: toSlide(targetPoint, f),
    };
    return { add, update: new Map(), select: add.map((c) => c.element.id), label: insertLabel(item) };
  }

  const { box } = dropAndConnectGeometry(sourceBox, firstVertex, direction, topCount > 1);
  const g = firstVertex.geometry;
  const translate = { x: Math.round(box.x) - g.x, y: Math.round(box.y) - g.y };
  const add = placeItem(slide, item, translate, makeId, { diagramId: source.diagram, parent });
  const vertexIndex = add.findIndex((c) => c.element.type === 'vertex');
  if (vertexIndex < 0) return null;
  // The dropped shape takes the size the geometry gave it (height matched to the source).
  const first = add[vertexIndex].element as VertexEl;
  add[vertexIndex].element = { ...first, w: box.width * f.scale, h: box.height * f.scale };
  const select = add.map((c) => c.element.id);
  const freeEdge = freeSourceEdge
    ? add.find((c) => c.element.type === 'connector' && c.element.source == null)
    : undefined;
  if (freeEdge) {
    const connector = freeEdge.element as ConnectorEl;
    freeEdge.element = { ...connector, source: source.id, sourcePoint: null };
  } else {
    const placed = add.map((c) => c.element);
    const { element } = newConnector(slide, {
      dio: DEFAULT_EDGE_STYLE,
      source: source.id,
      target: add[vertexIndex].element.id,
      diagramId: source.diagram,
    }, makeId, { extra: placed });
    add.push({ element, diagramId: source.diagram, meta: null });
  }
  return { add, update: new Map(), select, label: insertLabel(item) };
}

/** Sidebar.isConnectSelectedVertices: a loose edge item clicked with two shapes selected. */
export function connectsSelectedVertices(slide: Pick<Slide, 'elements'>, item: Pick<LibraryItem, 'cells'>, selection: readonly string[]): boolean {
  if (!isEdgeItem(item)) return false;
  const edge = item.cells.find((c) => c.parent == null)!;
  if (edge.source || edge.target || selection.length !== 2 || selection[0] === selection[1]) return false;
  const a = vertexOf(slide, selection[0]);
  const b = vertexOf(slide, selection[1]);
  return Boolean(a && b && a.connectable !== false && b.connectable !== false);
}

/** The edge item joins the two selected shapes, in selection order (its loose ends and waypoints dropped). */
export function connectSelectedVertices(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title'>,
  selection: readonly string[],
  makeId: (prefix: string) => string,
): LibraryEdit | null {
  const a = vertexOf(slide, selection[0]);
  const b = vertexOf(slide, selection[1]);
  if (!a || !b) return null;
  const add = placeItem(slide, item, { x: 0, y: 0 }, makeId, { diagramId: a.diagram });
  const placed = add.find((c) => c.element.type === 'connector');
  if (!placed) return null;
  const connector = placed.element as ConnectorEl;
  placed.element = { ...connector, source: a.id, target: b.id, sourcePoint: null, targetPoint: null, points: [] };
  return { add, update: new Map(), select: [placed.element.id], label: insertLabel(item) };
}

/**
 * diagramly's Sidebar.itemClicked: a shape clicked while one connector with
 * a loose end is selected goes at that end and the connector joins it.
 */
export function endLooseConnector(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title' | 'width' | 'height'>,
  edgeId: string,
  makeId: (prefix: string) => string,
): LibraryEdit | null {
  const edge = connectorOf(slide, edgeId);
  if (!edge || edge.target != null) return null;
  const first = item.cells.find((c) => c.parent == null);
  if (!first || first.edge) return null;
  const end = edge.route[edge.route.length - 1] ?? edge.targetPoint;
  if (!end) return null;
  const single = firstCellOnly(item);
  const at = toUnits(end, frameOf(edge));
  const g = first.geometry;
  const add = placeItem(slide, single, { x: at.x - g.width / 2 - g.x, y: at.y - g.height / 2 - g.y }, makeId, { diagramId: edge.diagram });
  const vertex = add.find((c) => c.element.type === 'vertex')?.element;
  if (!vertex) return null;
  const update = new Map<string, SlideElement>([[edge.id, { ...edge, target: vertex.id, targetPoint: null }]]);
  return { add, update, select: [vertex.id], label: insertLabel(item) };
}

/** mxStylesheet.getCellStyle(style, {}, false): named styles expanded, no defaults, `none` kept. */
function ownStyle(dio: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of parseStyleString(dio)) {
    if (entry.key == null) {
      const named = Object.prototype.hasOwnProperty.call(NAMED_STYLES, entry.value) ? NAMED_STYLES[entry.value] : null;
      if (named) Object.assign(out, named);
    } else {
      out[entry.key] = entry.value;
    }
  }
  return out;
}

/**
 * Graph.updateShapes(source, [target], true): the target keeps its own keys
 * but drops its named style, perimeter and connection points, and takes
 * every key of the source's style (its shape included).
 */
export function replacedStyle(targetDio: string, sourceDio: string, kind: 'vertex' | 'edge'): string {
  let tokens = targetDio.split(';');
  if (tokens.length > 0 && tokens[0].indexOf('=') < 0) tokens = tokens.slice(1);
  let style = tokens.join(';');
  style = setStyleValue(style, 'perimeter', null);
  style = setStyleValue(style, 'points', null);
  const source = ownStyle(sourceDio);
  if (source.shape == null) source.shape = kind === 'vertex' ? 'rectangle' : 'connector';
  const current = resolveStyle(style, kind);
  for (const [key, value] of Object.entries(source)) {
    if (current[key] !== value) style = setStyleValue(style, key, value);
  }
  return style;
}

/**
 * Shift+click with shapes selected (Graph.updateShapes): the selected shapes
 * of the item's kind take its style, shapes from a shape, connectors from a
 * connector. Children of a container item are not copied.
 */
export function replaceShapes(
  slide: Pick<Slide, 'elements'>,
  item: Pick<LibraryItem, 'cells' | 'title'>,
  selection: readonly string[],
): LibraryEdit | null {
  const source = item.cells.find((c) => c.parent == null);
  if (!source) return null;
  const kind = source.edge ? 'connector' : 'vertex';
  const update = new Map<string, SlideElement>();
  const selected = new Set(selection);
  for (const el of slide.elements) {
    if (!selected.has(el.id) || el.type !== kind) continue;
    const dio = replacedStyle(el.dio, source.style, kind === 'vertex' ? 'vertex' : 'edge');
    if (dio === el.dio) continue;
    const rotation = Number(/(?:^|;)rotation=([^;]*)/.exec(dio)?.[1] ?? NaN);
    update.set(el.id, { ...el, dio, ...(el.type === 'vertex' && Number.isFinite(rotation) ? { rot: rotation } : {}) } as SlideElement);
  }
  if (update.size === 0) return null;
  return { ...emptyEdit(item.title ? `Change shape to ${item.title}` : 'Change shape'), update, select: [...selected] };
}

export interface ClickModifiers {
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface ClickView {
  /** The middle of the visible canvas, slide pixels. */
  centre: Point;
  /** The visible canvas' top-left corner, slide pixels. */
  topLeft: Point;
}

/** The Alt+click direction: Alt south, Alt+Shift east, Alt+Ctrl/Cmd north, Alt+Ctrl/Cmd+Shift west. */
export function connectDirection(m: ClickModifiers): Direction {
  return (m.metaKey || m.ctrlKey) ? (m.shiftKey ? 'west' : 'north') : (m.shiftKey ? 'east' : 'south');
}

/** The diagram's drawn bounds in draw.io units (getGraphBounds for getFreeInsertPoint). */
function diagramBoundsUnits(slide: Pick<Slide, 'elements'>, diagramId: string, frame: DiagramFrame): Rect | null {
  let box: Rect | null = null;
  for (const el of slide.elements) {
    if ((el.type !== 'vertex' && el.type !== 'connector') || el.diagram !== diagramId) continue;
    const p = toUnits({ x: el.x, y: el.y }, frame);
    const r = { x: p.x, y: p.y, width: el.w / frame.scale, height: el.h / frame.scale };
    if (!box) box = r;
    else {
      const x0 = Math.min(box.x, r.x);
      const y0 = Math.min(box.y, r.y);
      box = { x: x0, y: y0, width: Math.max(box.x + box.width, r.x + r.width) - x0, height: Math.max(box.y + box.height, r.y + r.height) - y0 };
    }
  }
  return box;
}

/**
 * Sidebar.itemClicked: what clicking a library item does, given the
 * selection (in selection order) and the modifier keys:
 *
 * - one connector with a loose end selected, a shape clicked: the shape ends it;
 * - Alt with one shape (or connector) selected: insert beside it and connect
 *   (see `connectDirection`);
 * - a loose edge clicked with two shapes selected: it joins them;
 * - Shift with a selection: the selected shapes take the item's style;
 * - otherwise: the item goes in the middle of the visible canvas (Alt: below
 *   the diagram), selected.
 */
export function clickItem(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title' | 'width' | 'height'>,
  selection: readonly string[],
  modifiers: ClickModifiers,
  view: ClickView,
  makeId: (prefix: string) => string,
): LibraryEdit | null {
  const first = item.cells.find((c) => c.parent == null);
  if (!first) return null;
  if (selection.length === 1 && !first.edge) {
    const edge = connectorOf(slide, selection[0]);
    if (edge && edge.target == null) {
      const edit = endLooseConnector(slide, item, edge.id, makeId);
      if (edit) return edit;
    }
  }
  if (modifiers.altKey && selection.length === 1) {
    const edit = dropAndConnect(slide, item, selection[0], connectDirection(modifiers), makeId);
    if (edit) return edit;
  } else if (!modifiers.altKey && !modifiers.shiftKey && connectsSelectedVertices(slide, item, selection)) {
    return connectSelectedVertices(slide, item, selection, makeId);
  } else if (modifiers.shiftKey && selection.length > 0) {
    return replaceShapes(slide, item, selection);
  }
  const { frame, grid, diagramId } = insertionFrame(slide, selection);
  const pt = modifiers.altKey
    ? freeInsertPoint(diagramBoundsUnits(slide, diagramId, frame), toUnits(view.topLeft, frame), grid)
    : centerInsertPoint(item, toUnits(view.centre, frame), grid);
  return insertItem(slide, item, pt, makeId, { selection });
}

/** A drop at `pointer` (slide pixels): the item's corner at the pointer, snapped to the diagram's grid. */
export function dropItem(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  item: Pick<LibraryItem, 'cells' | 'title'>,
  pointer: Point,
  makeId: (prefix: string) => string,
  options: { selection?: Iterable<string>; gridEnabled?: boolean } = {},
): LibraryEdit {
  const { frame, grid } = insertionFrame(slide, options.selection);
  const pt = dropInsertPoint(toUnits(pointer, frame), { ...grid, enabled: grid.enabled && options.gridEnabled !== false });
  return insertItem(slide, item, pt, makeId, { selection: options.selection });
}
