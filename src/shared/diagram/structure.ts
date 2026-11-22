/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/view/mxGraph.js (groupCells, getCellsForGroup, ungroupCells,
 * getCellsForUngroup, removeCellsAfterUngroup, cellsFolded, swapBounds,
 * updateAlternateBounds, getPreferredSizeForCell, getStartSize,
 * isCellFoldable, getFoldingImage, isValidDropTarget, resizeChildCells,
 * scaleCell, isTransparentState, selectAll), mxgraph/src/model/
 * mxGraphModel.js (updateEdgeParents, updateEdgeParent,
 * getNearestCommonAncestor), mxgraph/src/view/mxGraphView.js
 * (getVisibleTerminal), mxgraph/src/view/mxCellRenderer.js
 * (getControlBounds) and draw.io's overrides in js/grapheditor/Graph.js
 * (getBoundsForGroup, createGroupCell, getCellsForGroup, getCellsForUngroup,
 * removeCellsAfterUngroup, isCellFoldable, isContainer, isSwimlane,
 * isRecursiveVertexResize, isCellLocked, isValidDropTarget,
 * getPreferredSizeForCell, getFoldingImage), js/grapheditor/Actions.js
 * (group, ungroup) and js/grapheditor/Dialogs.js (LayersWindow).
 * Modified: rewritten in TypeScript for DeckWerk's element model, where a
 * cell's geometry is its absolute box in slide pixels and paint order is `z`.
 */

/**
 * draw.io's structure on a slide: groups, containers, swimlanes, collapsed
 * containers and layers.
 *
 * draw.io keeps a tree — root, layers, then cells whose `parent` is a layer,
 * a group or a container — with each cell's geometry relative to its parent
 * and paint order the depth-first order of the tree. DeckWerk keeps each
 * cell's `parent` (a draw.io cell id) but its box in slide pixels and its
 * paint order in `z`, so the operations here do what draw.io's do to the
 * tree and then restack: a parent sits directly under its subtree, layers
 * bottom first, using the paint slots the diagram's cells already occupy (a
 * text box or picture between them stays where it is).
 *
 * Everything mutates a slide, as inside an editor store commit or an agent
 * transaction. DOM-free: the editor, the CLI and the server share it.
 */

import type { ConnectorEl, DiagramMeta, Slide, SlideElement, VertexEl } from '../deck.js';
import { displayLabel } from './element.js';
import { freshCellId, newDiagramMeta, newVertex, usedCellIds } from './insert.js';
import { textWidth } from './label/metrics.js';
import { containsMath, mathLabelSize } from './mathLabel.js';
import { getStyleValue, resolveStyle, setStyleValue, styleNumber } from './style.js';
import type { Point, Rect, Style } from './types.js';

export type DiagramCellEl = VertexEl | ConnectorEl;
type SlideLike = Pick<Slide, 'elements' | 'diagrams'>;
type Layer = DiagramMeta['layers'][number];

/** A box must have size: what a group of only lines or points gets. */
const MIN_SIZE = 0.01;
const EPSILON = 1e-6;

export function isCell(el: SlideElement): el is DiagramCellEl {
  return el.type === 'vertex' || el.type === 'connector';
}

const key = (diagram: string, cell: string) => `${diagram}\u0000${cell}`;

const DEFAULT_LAYERS: Layer[] = [{ cell: '1', label: '', dio: '' }];

// --- the tree ------------------------------------------------------------------------

/**
 * The draw.io tree of a slide's diagrams, read from its elements: parents,
 * children (in paint order), layers. Built once per question; build a new
 * one after changing parents.
 */
export class DiagramTree {
  /** Cells by element id. */
  readonly byId = new Map<string, DiagramCellEl>();
  private readonly byCell = new Map<string, DiagramCellEl>();
  private readonly kids = new Map<string, DiagramCellEl[]>();
  /** Paint position of every element on the slide (0 = bottom). */
  readonly position = new Map<string, number>();

  constructor(readonly slide: SlideLike) {
    paintOrder(slide.elements).forEach((el, index) => this.position.set(el.id, index));
    for (const el of slide.elements) {
      if (!isCell(el)) continue;
      this.byId.set(el.id, el);
      // The first cell with an id wins, as reroute's dedupe keeps it.
      if (!this.byCell.has(key(el.diagram, el.cell))) this.byCell.set(key(el.diagram, el.cell), el);
    }
    for (const el of paintOrder(slide.elements)) {
      if (!isCell(el)) continue;
      const parent = this.effectiveParent(el);
      const list = this.kids.get(key(el.diagram, parent)) ?? [];
      list.push(el);
      this.kids.set(key(el.diagram, parent), list);
    }
  }

  meta(diagramId: string): DiagramMeta | null {
    return this.slide.diagrams?.[diagramId] ?? null;
  }

  /** Layers of a diagram, bottom first. */
  layers(diagramId: string): Layer[] {
    const layers = this.meta(diagramId)?.layers;
    return layers && layers.length > 0 ? layers : DEFAULT_LAYERS;
  }

  rootId(diagramId: string): string {
    return this.meta(diagramId)?.root ?? '0';
  }

  layer(diagramId: string, cellId: string): Layer | null {
    return this.layers(diagramId).find((l) => l.cell === cellId) ?? null;
  }

  isLayer(diagramId: string, cellId: string | null | undefined): boolean {
    return cellId != null && this.layers(diagramId).some((l) => l.cell === cellId);
  }

  cell(diagramId: string, cellId: string | null | undefined): DiagramCellEl | undefined {
    return cellId == null ? undefined : this.byCell.get(key(diagramId, cellId));
  }

  /**
   * The parent cell id a cell is drawn under: its `parent` when that is a
   * layer or a cell of the diagram, else the first layer (as a page is
   * written, see convert.ts).
   */
  effectiveParent(el: DiagramCellEl): string {
    const parent = el.parent;
    if (parent != null && parent !== el.cell && (this.isLayer(el.diagram, parent) || this.byCell.has(key(el.diagram, parent)))) {
      return parent;
    }
    return this.layers(el.diagram)[0].cell;
  }

  /** The cell element a cell sits in (a group or container), or null on a layer. */
  parentOf(el: DiagramCellEl): DiagramCellEl | null {
    const parent = this.effectiveParent(el);
    if (this.isLayer(el.diagram, parent)) return null;
    const cell = this.cell(el.diagram, parent);
    return cell && cell !== el ? cell : null;
  }

  /** The containing cells, nearest first (layers not included). */
  ancestors(el: DiagramCellEl): DiagramCellEl[] {
    const out: DiagramCellEl[] = [];
    const seen = new Set<string>([el.id]);
    for (let p = this.parentOf(el); p && !seen.has(p.id); p = this.parentOf(p)) {
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }

  /** The layer a cell is on. */
  layerOf(el: DiagramCellEl): string {
    const chain = this.ancestors(el);
    const top = chain.length > 0 ? chain[chain.length - 1] : el;
    return this.effectiveParent(top);
  }

  /** draw.io cell ids from the cell up to its layer and the root. */
  chain(el: DiagramCellEl): string[] {
    return [el.cell, ...this.ancestors(el).map((a) => a.cell), this.layerOf(el), this.rootId(el.diagram)];
  }

  childrenOfCell(diagramId: string, cellId: string): DiagramCellEl[] {
    return this.kids.get(key(diagramId, cellId)) ?? [];
  }

  /** Direct children, in paint order. */
  children(el: DiagramCellEl): DiagramCellEl[] {
    return this.childrenOfCell(el.diagram, el.cell).filter((c) => c !== el);
  }

  /** Every cell below, depth first in paint order. */
  descendants(el: DiagramCellEl): DiagramCellEl[] {
    const out: DiagramCellEl[] = [];
    const seen = new Set<string>([el.id]);
    const walk = (cell: DiagramCellEl) => {
      for (const child of this.children(cell)) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        out.push(child);
        walk(child);
      }
    };
    walk(el);
    return out;
  }

  /** Every cell on a layer, depth first in paint order. */
  layerCells(diagramId: string, layerCell: string): DiagramCellEl[] {
    const out: DiagramCellEl[] = [];
    for (const cell of this.childrenOfCell(diagramId, layerCell)) out.push(cell, ...this.descendants(cell));
    return out;
  }

  isAncestor(ancestor: DiagramCellEl, el: DiagramCellEl): boolean {
    return ancestor.diagram === el.diagram && this.ancestors(el).includes(ancestor);
  }

  depth(el: DiagramCellEl): number {
    return this.ancestors(el).length;
  }

  vertex(id: string | null | undefined): VertexEl | undefined {
    const el = id ? this.byId.get(id) : undefined;
    return el?.type === 'vertex' ? el : undefined;
  }

  /** Diagram ids on the slide. */
  diagramIds(): string[] {
    const ids = new Set<string>();
    for (const el of this.byId.values()) ids.add(el.diagram);
    for (const id of Object.keys(this.slide.diagrams ?? {})) ids.add(id);
    return [...ids];
  }
}

// --- paint order ---------------------------------------------------------------------

/** A slide's objects bottom first: `z`, ties broken by array position (as drawn). */
export function paintOrder(elements: readonly SlideElement[]): SlideElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => a.element.z - b.element.z || a.index - b.index)
    .map(({ element }) => element);
}

/** Give `order` to the slide by renumbering every `z` 1…n, when it is not already the order. */
function applyOrder(slide: Slide, order: SlideElement[]): boolean {
  const current = paintOrder(slide.elements);
  if (current.length === order.length && current.every((el, i) => el === order[i])) return false;
  order.forEach((el, i) => {
    el.z = i + 1;
  });
  return true;
}

/**
 * Restack one diagram's cells into draw.io's model order — every parent
 * directly under its subtree, layers bottom first — in the paint slots the
 * cells occupy now, so objects that are not cells keep their places.
 * Siblings keep their present order unless `order` gives one a different
 * sort key (a paint position; fractions and large numbers place a cell
 * between or after the others). Returns whether anything moved.
 */
export function restackDiagram(slide: Slide, diagramId: string, order?: ReadonlyMap<string, number>): boolean {
  const tree = new DiagramTree(slide);
  const sortKey = (el: DiagramCellEl) => order?.get(el.id) ?? tree.position.get(el.id) ?? 0;
  const sorted: DiagramCellEl[] = [];
  const seen = new Set<string>();
  const visit = (list: readonly DiagramCellEl[]) => {
    for (const el of [...list].sort((a, b) => sortKey(a) - sortKey(b))) {
      if (seen.has(el.id)) continue;
      seen.add(el.id);
      sorted.push(el);
      visit(tree.children(el));
    }
  };
  for (const layer of tree.layers(diagramId)) visit(tree.childrenOfCell(diagramId, layer.cell));
  const current = paintOrder(slide.elements);
  // A parent cycle leaves cells unreached: they keep their order, on top.
  for (const el of current) if (isCell(el) && el.diagram === diagramId && !seen.has(el.id)) sorted.push(el);
  let next = 0;
  const order2 = current.map((el) => (isCell(el) && el.diagram === diagramId ? sorted[next++] : el));
  return applyOrder(slide, order2);
}

// --- styles --------------------------------------------------------------------------

function vertexStyleOf(el: Pick<VertexEl, 'dio'>): Style {
  return resolveStyle(el.dio, 'vertex');
}

/** Graph.isSwimlane: a swimlane, table or table row shape. */
export function isSwimlane(el: DiagramCellEl): boolean {
  if (el.type !== 'vertex') return false;
  const shape = vertexStyleOf(el).shape;
  return shape === 'swimlane' || shape === 'table' || shape === 'tableRow';
}

/** A table row, or a table cell (a child of a row): draw.io never groups these. */
function isTableRowOrCell(el: DiagramCellEl, tree: DiagramTree): boolean {
  if (el.type !== 'vertex') return false;
  if (vertexStyleOf(el).shape === 'tableRow') return true;
  const parent = tree.parentOf(el);
  return parent?.type === 'vertex' && vertexStyleOf(parent).shape === 'tableRow';
}

/** A table, its rows or its cells: draw.io never ungroups these. */
function isTableLike(el: DiagramCellEl, tree: DiagramTree): boolean {
  return (el.type === 'vertex' && vertexStyleOf(el).shape === 'table') || isTableRowOrCell(el, tree);
}

/** Graph.isContainer: swimlanes unless `container=0`, anything else with `container=1`. */
export function isContainer(el: DiagramCellEl): boolean {
  if (el.type !== 'vertex') return false;
  const container = vertexStyleOf(el).container;
  return isSwimlane(el) ? container !== '0' : container === '1';
}

/** A layer's `locked=1` (draw.io's Layers dialog writes it into the layer cell's style). */
export function isLayerLocked(layer: Pick<Layer, 'dio'>): boolean {
  return getStyleValue(layer.dio, 'locked') === '1';
}

/** Graph.isCellLocked: the cell, a containing cell or its layer has `locked=1`. */
export function isCellLocked(slide: SlideLike, el: DiagramCellEl, tree = new DiagramTree(slide)): boolean {
  for (const cell of [el, ...tree.ancestors(el)]) if (getStyleValue(cell.dio, 'locked') === '1') return true;
  const layer = tree.layer(el.diagram, tree.layerOf(el));
  return layer ? isLayerLocked(layer) : false;
}

/**
 * May the cell be picked on the canvas: drawn (not hidden, not under a
 * hidden layer or a collapsed container) and not on a locked layer, as
 * draw.io's Graph.isCellSelectable. A locked cell itself stays selectable;
 * it only may not move (isCellMovable).
 */
export function isCellSelectable(slide: SlideLike, el: DiagramCellEl, tree = new DiagramTree(slide)): boolean {
  if (el.hidden || el.concealed) return false;
  const layer = tree.layer(el.diagram, tree.layerOf(el));
  return !(layer && isLayerLocked(layer));
}

/** May the cell be moved: not locked, and no `movable=0`. */
export function isCellMovable(slide: SlideLike, el: DiagramCellEl, tree = new DiagramTree(slide)): boolean {
  return !isCellLocked(slide, el, tree) && getStyleValue(el.dio, 'movable') !== '0';
}

/** May the cell be resized: not locked, and no `resizable=0`. */
export function isCellResizable(slide: SlideLike, el: DiagramCellEl, tree = new DiagramTree(slide)): boolean {
  return !isCellLocked(slide, el, tree) && getStyleValue(el.dio, 'resizable') !== '0';
}

/**
 * Graph.isValidDropTarget: may `cells` be dropped into `target` (a drag into
 * a container reparents them)? Containers and swimlanes, and groups (cells
 * with children, not collapsed); never a locked, collapsed-swimlane-less or
 * `dropTarget=0` cell, a table row, or one of the dragged cells or their
 * descendants.
 */
export function isValidDropTarget(slide: SlideLike, target: DiagramCellEl, cells: readonly DiagramCellEl[] = []): boolean {
  if (target.type !== 'vertex') return false;
  const tree = new DiagramTree(slide);
  if (cells.some((c) => c === target || tree.isAncestor(c, target))) return false;
  if (isCellLocked(slide, target, tree)) return false;
  const style = vertexStyleOf(target);
  if (style.dropTarget === '0') return false;
  if (style.part === '1' && !isContainer(target)) return false;
  if (style.shape === 'tableRow') return false;
  const base = isSwimlane(target) || (tree.children(target).length > 0 && !target.collapsed);
  return base || isContainer(target);
}

// --- edges follow their terminals into the nearest common ancestor ---------------------

/** mxGraphModel.getNearestCommonAncestor over draw.io cell ids; never the root. */
function nearestCommonAncestor(tree: DiagramTree, a: DiagramCellEl, b: DiagramCellEl): string | null {
  const chainB = new Set(tree.chain(b));
  const root = tree.rootId(a.diagram);
  for (const id of tree.chain(a)) {
    if (chainB.has(id)) return id === root ? null : id;
  }
  return null;
}

/** The first non-relative cell at or above a terminal (ports belong to their host). */
function nonRelative(tree: DiagramTree, v: DiagramCellEl): DiagramCellEl {
  let cell = v;
  const seen = new Set<string>();
  while (cell.type === 'vertex' && cell.relative && !seen.has(cell.id)) {
    seen.add(cell.id);
    const parent = tree.parentOf(cell);
    if (!parent) break;
    cell = parent;
  }
  return cell;
}

/**
 * mxGraphModel.updateEdgeParent: a connector lives in the nearest common
 * ancestor of its two ends; it moves up into a layer only when it is on
 * that layer. Returns whether its parent changed.
 */
function updateEdgeParent(slide: Slide, edge: ConnectorEl): boolean {
  if (!edge.source || !edge.target) return false;
  const tree = new DiagramTree(slide);
  const source = tree.vertex(edge.source);
  const target = tree.vertex(edge.target);
  if (!source || !target || source.diagram !== edge.diagram || target.diagram !== edge.diagram) return false;
  const s = nonRelative(tree, source);
  const t = nonRelative(tree, target);
  const nca = s === t ? tree.effectiveParent(s) : nearestCommonAncestor(tree, s, t);
  if (nca == null) return false;
  const onLayer = tree.isLayer(edge.diagram, nca);
  if (onLayer && !tree.chain(edge).includes(nca)) return false;
  if (tree.effectiveParent(edge) === nca) return false;
  edge.parent = nca;
  return true;
}

/**
 * mxGraphModel.updateEdgeParents: every connector attached to `cell` or to
 * a cell inside it moves to the nearest common ancestor of its ends.
 * Connectors in `skip` stay (draw.io leaves the cells being added alone).
 * Returns the ids of the connectors that moved.
 */
export function updateEdgeParents(slide: Slide, cell: DiagramCellEl, skip: ReadonlySet<string> = new Set()): string[] {
  const tree = new DiagramTree(slide);
  const ends = new Set([cell, ...tree.descendants(cell)].map((c) => c.id));
  const moved: string[] = [];
  for (const el of slide.elements) {
    if (el.type !== 'connector' || skip.has(el.id) || el.diagram !== cell.diagram) continue;
    if (!(el.source && ends.has(el.source)) && !(el.target && ends.has(el.target))) continue;
    if (updateEdgeParent(slide, el)) moved.push(el.id);
  }
  return moved;
}

// --- groups --------------------------------------------------------------------------

function selectedCells(slide: SlideLike, ids: Iterable<string>): DiagramCellEl[] {
  const wanted = new Set(ids);
  return paintOrder(slide.elements).filter((el): el is DiagramCellEl => isCell(el) && wanted.has(el.id));
}

/**
 * Graph.getCellsForGroup: the cells (in paint order) that share the first
 * one's parent, without table rows and cells.
 */
export function cellsForGroup(slide: SlideLike, elementIds: Iterable<string>): DiagramCellEl[] {
  const cells = selectedCells(slide, elementIds);
  if (cells.length === 0) return [];
  const tree = new DiagramTree(slide);
  const first = cells[0];
  const parent = tree.effectiveParent(first);
  return cells.filter((c) => c.diagram === first.diagram && tree.effectiveParent(c) === parent && !isTableRowOrCell(c, tree));
}

/** A connector's waypoints and loose ends: what draw.io counts in its bounds (getBoundingBoxFromGeometry). */
function connectorGeometryPoints(el: ConnectorEl): Point[] {
  const points = [...el.points];
  if (!el.source && el.sourcePoint) points.push(el.sourcePoint);
  if (!el.target && el.targetPoint) points.push(el.targetPoint);
  return points;
}

/**
 * Graph.getBoundsForGroup, in slide pixels: the union of the vertices'
 * boxes (relative ones left out) and the connectors' waypoints and loose
 * ends, grown by a swimlane group's header and by `border` (draw.io units).
 */
export function boundsForGroup(cells: readonly DiagramCellEl[], options: { style?: string; border?: number } = {}): Rect | null {
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
  for (const el of cells) {
    if (el.type === 'vertex') {
      if (el.relative) continue;
      add(el.x, el.y);
      add(el.x + el.w, el.y + el.h);
    } else {
      for (const p of connectorGeometryPoints(el)) add(p.x, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const scale = cells[0]?.scale ?? 1;
  const result: Rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  if (options.style) {
    const style = resolveStyle(options.style, 'vertex');
    if (style.shape === 'swimlane' || style.shape === 'table' || style.shape === 'tableRow') {
      const start = startSize(style) * scale;
      const horizontal = style.horizontal !== '0' && style.horizontal !== 'false';
      if (horizontal) {
        result.y -= start;
        result.height += start;
      } else {
        result.x -= start;
        result.width += start;
      }
    }
  }
  const border = (options.border ?? 0) * scale;
  if (border) {
    result.x -= border;
    result.y -= border;
    result.width += 2 * border;
    result.height += 2 * border;
  }
  return result;
}

/** mxGraph.getStartSize's size: a swimlane's header (draw.io units, default 40). */
function startSize(style: Style): number {
  return parseInt(style.startSize ?? '40', 10) || 0;
}

export interface GroupOptions {
  /** The new group's style; draw.io's Ctrl+G makes `group`. */
  style?: string;
  /** Space around the children, in draw.io units; Ctrl+G uses 0. */
  border?: number;
}

/**
 * draw.io's Ctrl+G (mxGraph.groupCells via Graph's `group` action): a new
 * `group` vertex around the cells that share the first cell's parent; the
 * cells move into it, and so do connectors between them
 * (mxGraphModel.updateEdgeParent). draw.io appends the group to its parent's
 * children; here it takes the place of its topmost member, so cells that
 * were between the members end below the group, as in draw.io, and nothing
 * above the selection is overtaken. Returns the group, or null when fewer
 * than two cells can be grouped.
 */
export function groupCells(
  slide: Slide,
  elementIds: Iterable<string>,
  makeId: (prefix: string) => string,
  options: GroupOptions = {},
): VertexEl | null {
  const cells = cellsForGroup(slide, elementIds);
  if (cells.length < 2) return null;
  const style = options.style ?? 'group';
  const bounds = boundsForGroup(cells, { style, border: options.border ?? 0 });
  if (!bounds) return null;
  const first = cells[0];
  const tree = new DiagramTree(slide);
  const parent = tree.effectiveParent(first);
  const positions = cells.map((c) => tree.position.get(c.id) ?? 0);
  const lowest = cells[positions.indexOf(Math.min(...positions))];
  const { element: group } = newVertex(slide, {
    dio: style,
    label: '',
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.width, MIN_SIZE),
    h: Math.max(bounds.height, MIN_SIZE),
    parent,
    diagramId: first.diagram,
    z: lowest.z,
  }, makeId);
  // mxGraph.createGroupCell: not connectable. Drawn in its members' frame.
  group.connectable = false;
  group.scale = first.scale;
  group.origin = { ...first.origin };
  slide.elements.push(group);
  const members = new Set(cells.map((c) => c.id));
  for (const cell of cells) cell.parent = group.cell;
  const pulledIn = cells.flatMap((cell) => updateEdgeParents(slide, cell, members));
  const after = new DiagramTree(slide);
  const top = Math.max(...after.descendants(group).map((c) => after.position.get(c.id) ?? 0));
  // The group takes its topmost member's place; connectors pulled in go
  // after the grouped cells (mxGraphModel.add at the end of the group).
  const end = slide.elements.length + 1;
  const order = new Map<string, number>([[group.id, top + 0.5]]);
  for (const id of pulledIn) order.set(id, end + (after.position.get(id) ?? 0));
  restackDiagram(slide, first.diagram, order);
  return group;
}

/** mxGraph.isTransparentState: no stroke, no fill, no image. */
function isTransparent(el: VertexEl): boolean {
  const style = vertexStyleOf(el);
  const stroke = style.strokeColor ?? 'none';
  const fill = style.fillColor ?? 'none';
  return stroke === 'none' && fill === 'none' && style.image == null;
}

/** Graph.getCellsForUngroup: selected vertices that have children, tables excepted. */
export function cellsForUngroup(slide: SlideLike, elementIds: Iterable<string>): VertexEl[] {
  const tree = new DiagramTree(slide);
  return selectedCells(slide, elementIds)
    .filter((c): c is VertexEl => c.type === 'vertex' && tree.children(c).length > 0 && !isTableLike(c, tree));
}

export interface UngroupResult {
  /** The cells moved out of their groups and containers. */
  ungrouped: string[];
  /** Groups removed, and connectors that were attached to them. */
  removed: string[];
  /** What draw.io selects afterwards: the ungrouped cells and the selected cells still there. */
  selection: string[];
}

/**
 * draw.io's Ctrl+Shift+U (mxGraph.ungroupCells and Graph's `ungroup`
 * action): the children of each selected group or container move to its
 * parent, where they stay in the same paint order; a group that is now
 * empty and draws nothing (no fill, stroke or image) is removed with any
 * connector attached to it, while a container that draws something stays,
 * no longer a container (`container=0`).
 */
export function ungroupCells(slide: Slide, elementIds: Iterable<string>): UngroupResult {
  const ids = [...elementIds];
  const groups = cellsForUngroup(slide, ids);
  const ungrouped: string[] = [];
  const diagrams = new Set<string>();
  for (const group of groups) {
    const tree = new DiagramTree(slide);
    const parent = tree.effectiveParent(group);
    const children = tree.children(group);
    for (const child of children) {
      child.parent = parent;
      // Ports become ordinary cells where they are drawn.
      if (child.type === 'vertex' && child.relative) {
        if (child.relative.offset) child.offset = { ...child.relative.offset };
        delete child.relative;
      }
      ungrouped.push(child.id);
    }
    const moving = new Set(children.map((c) => c.id));
    for (const child of children) updateEdgeParents(slide, child, moving);
    diagrams.add(group.diagram);
  }
  // Graph.removeCellsAfterUngroup: only the groups that draw nothing go, with their edges.
  const doomed = new Set(groups.filter((g) => isTransparent(g) && getStyleValue(g.dio, 'deletable') !== '0').map((g) => g.id));
  for (const el of slide.elements) {
    if (el.type === 'connector' && ((el.source && doomed.has(el.source)) || (el.target && doomed.has(el.target)))) doomed.add(el.id);
  }
  removeElements(slide, doomed);
  // The `ungroup` action: what stays and has no children is no container any more.
  const tree = new DiagramTree(slide);
  for (const id of ids) {
    const el = tree.byId.get(id);
    if (el?.type === 'vertex' && tree.children(el).length === 0 && isContainer(el)) el.dio = setStyleValue(el.dio, 'container', '0');
  }
  for (const diagram of diagrams) restackDiagram(slide, diagram);
  const present = new Set(slide.elements.map((el) => el.id));
  const selection = [...new Set([...ungrouped, ...ids])].filter((id) => present.has(id));
  return { ungrouped, removed: [...doomed], selection };
}

/** Remove elements and the builds that animate them, as Delete does. */
function removeElements(slide: Slide, ids: ReadonlySet<string>): void {
  if (ids.size === 0) return;
  slide.elements = slide.elements.filter((el) => !ids.has(el.id));
  slide.timeline = slide.timeline.filter(
    (t) => !ids.has(t.action.target) && !(t.trigger.ref && ids.has(t.trigger.ref)),
  );
}

/**
 * Move a cell (with everything inside it) into another group, container
 * or layer, where it keeps its place on the slide — draw.io's drop into a
 * container (mxGraph.moveCells with a target, cellsAdded). It goes on top
 * of its new parent's other children; connectors whose ends now share a
 * nearer container follow it. Returns false when `newParentCell` is not a
 * layer or vertex of the same diagram, is the cell or inside it, or is
 * already its parent.
 */
export function reparent(slide: Slide, elementId: string, newParentCell: string): boolean {
  const tree = new DiagramTree(slide);
  const el = tree.byId.get(elementId);
  if (!el) return false;
  const target = tree.cell(el.diagram, newParentCell);
  const toLayer = tree.isLayer(el.diagram, newParentCell);
  if (!toLayer && (!target || target.type !== 'vertex' || target === el || tree.isAncestor(el, target))) return false;
  if (tree.effectiveParent(el) === newParentCell && el.parent === newParentCell) return false;
  el.parent = newParentCell;
  if (el.type === 'vertex' && el.relative) {
    if (el.relative.offset) el.offset = { ...el.relative.offset };
    delete el.relative;
  }
  const moved = [el.id, ...updateEdgeParents(slide, el, new Set([el.id]))];
  // mxGraph.cellsAdded appends at the end of the new parent's children.
  const end = slide.elements.length + 1;
  const order = new Map(moved.map((id) => [id, end + (tree.position.get(id) ?? 0)]));
  restackDiagram(slide, el.diagram, order);
  return true;
}

// --- collapse and expand ---------------------------------------------------------------

function foldingEnabled(slide: SlideLike | undefined, el: DiagramCellEl): boolean {
  // Editor.setGraphXml: the page's `fold` attribute, on unless "0".
  return slide?.diagrams?.[el.diagram]?.model?.fold !== '0';
}

/**
 * Graph.isCellFoldable: containers (swimlanes included) unless
 * `collapsible=0`, other cells only with `collapsible=1`; never with
 * `resizable=0`, `transparentBounds=1`, folding off for the page, or locked.
 */
export function isFoldable(el: DiagramCellEl, slide?: SlideLike): boolean {
  if (el.type !== 'vertex' || el.relative) return false;
  if (!foldingEnabled(slide, el)) return false;
  const style = vertexStyleOf(el);
  if (style.transparentBounds === '1' || style.resizable === '0') return false;
  const container = isContainer(el);
  const collapsible = container ? style.collapsible !== '0' : style.collapsible === '1';
  if (!collapsible) return false;
  return slide ? !isCellLocked(slide, el) : getStyleValue(el.dio, 'locked') !== '1';
}

/** HTML or plain label text as lines, the way a browser lays it out without wrapping. */
function labelLines(label: string, html: boolean): string[] {
  if (!html) return label.split('\n');
  const text = label
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const lines = text.split('\n');
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Graph.getPreferredSizeForCell (draw.io units): the label's size plus
 * spacing and the folding icon, grown by draw.io's buffer and snapped to
 * the page grid. Text is measured with Helvetica's widths (label/metrics.ts)
 * and draw.io's 1.2 line height, as the browser measures it in draw.io.
 */
export function preferredSize(el: VertexEl, slide?: SlideLike): { width: number; height: number } {
  const style = vertexStyleOf(el);
  const model = slide?.diagrams?.[el.diagram]?.model ?? {};
  const gridEnabled = (style.autosizeGrid ?? (model.grid !== '0' ? '1' : '0')) === '1';
  const gridSize = Number(model.gridSize ?? 10) || 10;
  const snap = (v: number) => (gridEnabled ? Math.round(v / gridSize) * gridSize : v);
  const fontSize = styleNumber(style, 'fontSize', 11);
  let dx = 0;
  let dy = 0;
  if (style.image != null && style.shape === 'label') {
    if (style.verticalAlign === 'middle') dx += styleNumber(style, 'imageWidth', 42);
    if (style.align !== 'center') dy += styleNumber(style, 'imageHeight', 42);
  }
  dx += 2 * styleNumber(style, 'spacing', 2) + styleNumber(style, 'spacingLeft', 2) + styleNumber(style, 'spacingRight', 2);
  dy += 2 * styleNumber(style, 'spacing', 2) + styleNumber(style, 'spacingTop', 2) + styleNumber(style, 'spacingBottom', 2);
  // Room for the folding icon (9 px, plus 8).
  if (isFoldable(el, slide)) dx += foldingIconSize(style) + 8;
  const value = displayLabel(el);
  let width: number;
  let height: number;
  if (value.length > 0) {
    const html = /(?:^|;)html=1(?:;|$)/.test(el.dio);
    const lines = labelLines(value, html);
    const bold = (styleNumber(style, 'fontStyle', 0) & 1) === 1;
    const size = Math.round(fontSize);
    // With math="1" the typeset formulas are measured, not their TeX (mathLabel.ts).
    const math = model.math === '1' && containsMath(value) ? mathLabelSize(lines.join('\n'), size, bold) : null;
    const textW = Math.round(math ? math.width : Math.max(0, ...lines.map((line) => textWidth(line, size, bold))));
    const textH = Math.round(math ? math.height : lines.length * size * 1.2);
    width = textW + dx;
    height = textH + dy;
    if (style.horizontal === '0' || style.horizontal === 'false') [width, height] = [height, width];
    if (gridEnabled) {
      width = snap(width + gridSize / 2);
      height = snap(height + gridSize / 2);
    }
  } else {
    width = 4 * gridSize;
    height = 4 * gridSize;
  }
  // Graph's buffer.
  width = snap(width + 10);
  height = snap(height + 4);
  return { width, height };
}

/** Graph.getFoldingImage: draw.io's 9 px icon, or `foldingIconSize`. */
function foldingIconSize(style: Style): number {
  const size = parseInt(style.foldingIconSize ?? '0', 10);
  return size > 0 ? size : 9;
}

/** The parent-relative origin of a cell's geometry, in slide pixels. */
function parentOriginOf(tree: DiagramTree, el: DiagramCellEl): Point {
  const parent = tree.parentOf(el);
  if (parent && parent.type === 'vertex') return { x: parent.x, y: parent.y };
  return { ...el.origin };
}

/**
 * Collapse or expand a container as draw.io does (mxGraph.cellsFolded and
 * swapBounds): its box and `alternateBounds` change places — a container
 * collapsed for the first time gets its preferred size (the label and the
 * folding icon) as the other bounds — keeping its top-left corner; what is
 * inside is concealed or shown again, and connectors to concealed cells are
 * drawn to the collapsed container instead (rerouted after the change; see
 * visibleTerminal). Returns whether anything changed.
 */
export function setCollapsed(slide: Slide, elementId: string, collapsed: boolean): boolean {
  const tree = new DiagramTree(slide);
  const el = tree.byId.get(elementId);
  if (el?.type !== 'vertex' || Boolean(el.collapsed) === collapsed) return false;
  const s = el.scale;
  const o = parentOriginOf(tree, el);
  const geo = { x: (el.x - o.x) / s, y: (el.y - o.y) / s, w: el.w / s, h: el.h / s };
  // updateAlternateBounds (with the cell as it is before folding).
  let alt = el.alternateBounds ? { ...el.alternateBounds } : null;
  if (!alt) {
    const preferred = preferredSize(el, slide);
    const style = vertexStyleOf(el);
    const start = style.startSize != null ? Number(style.startSize) : 0;
    alt = { x: 0, y: 0, w: preferred.width, h: start > 0 ? Math.max(preferred.height, start) : preferred.height };
  }
  alt.x = geo.x;
  alt.y = geo.y;
  const alpha = ((Number(el.rot) || 0) * Math.PI) / 180;
  if (alpha !== 0) {
    const dx = (alt.x + alt.w / 2) - (geo.x + geo.w / 2);
    const dy = (alt.y + alt.h / 2) - (geo.y + geo.h / 2);
    const cos = Math.cos(alpha);
    const sin = Math.sin(alpha);
    alt.x += cos * dx - sin * dy - dx;
    alt.y += sin * dx + cos * dy - dy;
  }
  // mxGeometry.swap.
  const nextX = o.x + alt.x * s;
  const nextY = o.y + alt.y * s;
  const shift = { x: nextX - el.x, y: nextY - el.y };
  el.x = nextX;
  el.y = nextY;
  el.w = Math.max(alt.w * s, MIN_SIZE);
  el.h = Math.max(alt.h * s, MIN_SIZE);
  el.alternateBounds = { x: geo.x, y: geo.y, w: geo.w, h: geo.h };
  if (collapsed) el.collapsed = true;
  else delete el.collapsed;
  // Children are placed relative to the container's corner.
  if (Math.abs(shift.x) > EPSILON || Math.abs(shift.y) > EPSILON) {
    for (const d of tree.descendants(el)) translateCell(d, shift.x, shift.y);
  }
  updateConcealment(slide);
  return true;
}

/** Move a cell's geometry by (dx, dy) in slide pixels: box, waypoints, loose ends and route. */
export function translateCell(el: DiagramCellEl, dx: number, dy: number): void {
  el.x += dx;
  el.y += dy;
  if (el.type === 'connector') {
    const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
    el.points = el.points.map(shift);
    if (el.sourcePoint) el.sourcePoint = shift(el.sourcePoint);
    if (el.targetPoint) el.targetPoint = shift(el.targetPoint);
    el.route = el.route.map(shift);
  }
}

/**
 * Where draw.io draws the +/− folding icon of a collapsible container, in
 * slide pixels (mxCellRenderer.getControlBounds with Graph's 9 px icon):
 * near the top-left corner, turned with the shape, scaled with the
 * diagram. Null when the cell cannot fold. With the slide, locks and the
 * page's folding switch count too.
 */
export function foldingIconRect(el: DiagramCellEl, slide?: SlideLike): Rect | null {
  if (el.type !== 'vertex' || !isFoldable(el, slide)) return null;
  const style = vertexStyleOf(el);
  const size = foldingIconSize(style);
  const s = el.scale;
  let cx = el.x + Math.max(size / 2, 9) * s;
  let cy = el.y + Math.max(size / 2, 9) * s;
  // mxShape.getShapeRotation and isPaintBoundsInverted (north/south direction).
  let rotation = Number(el.rot) || 0;
  const direction = style.direction;
  if (direction === 'north' || direction === 'south') {
    const t = (el.w - el.h) / 2;
    cx += t;
    cy -= t;
  }
  if (direction === 'north') rotation += 270;
  else if (direction === 'west') rotation += 180;
  else if (direction === 'south') rotation += 90;
  if (rotation % 360 !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const mx = el.x + el.w / 2;
    const my = el.y + el.h / 2;
    const px = cx - mx;
    const py = cy - my;
    cx = mx + px * cos - py * sin;
    cy = my + px * sin + py * cos;
  }
  return {
    x: Math.round(cx - (size / 2) * s),
    y: Math.round(cy - (size / 2) * s),
    width: Math.round(size * s),
    height: Math.round(size * s),
  };
}

// --- what is drawn: hidden layers, hidden and collapsed containers ------------------------

function concealedByAncestors(tree: DiagramTree, el: DiagramCellEl): boolean {
  for (const ancestor of tree.ancestors(el)) {
    if (ancestor.hidden || (ancestor.type === 'vertex' && ancestor.collapsed)) return true;
  }
  return Boolean(tree.layer(el.diagram, tree.layerOf(el))?.hidden);
}

/**
 * mxGraphView.getVisibleTerminal: the cell a connector end is drawn to —
 * the end itself, or the outermost collapsed container around it — or null
 * when nothing drawn stands for it (it is hidden itself).
 */
export function visibleTerminal(tree: DiagramTree, vertex: VertexEl): VertexEl | null {
  let best: DiagramCellEl = vertex;
  let result: DiagramCellEl | null = vertex;
  const seen = new Set<string>();
  while (result && !seen.has(result.id)) {
    seen.add(result.id);
    if (best.hidden || (result.type === 'vertex' && result.collapsed)) best = result;
    result = tree.parentOf(result);
  }
  return best.hidden || best.type !== 'vertex' ? null : best;
}

/**
 * The `concealed` flag each cell should have, for the cells whose flag is
 * wrong: a cell under a hidden layer, a hidden cell or a collapsed
 * container is not drawn, and neither is a connector whose end nothing
 * drawn stands for (draw.io clears such an edge's view).
 */
export function concealmentChanges(slide: SlideLike, tree = new DiagramTree(slide)): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const el of tree.byId.values()) {
    let concealed = concealedByAncestors(tree, el);
    if (!concealed && el.type === 'connector') {
      for (const end of [el.source, el.target]) {
        const v = tree.vertex(end);
        if (!v || v.diagram !== el.diagram) continue;
        const shown = visibleTerminal(tree, v);
        if (!shown || concealedByAncestors(tree, shown)) {
          concealed = true;
          break;
        }
      }
    }
    if (concealed !== Boolean(el.concealed)) out.set(el.id, concealed);
  }
  return out;
}

/** Bring every cell's `concealed` up to date (mutating). Returns the ids that changed. */
export function updateConcealment(slide: Slide): string[] {
  const changes = concealmentChanges(slide);
  for (const el of slide.elements) {
    if (!isCell(el) || !changes.has(el.id)) continue;
    if (changes.get(el.id)) el.concealed = true;
    else delete el.concealed;
  }
  return [...changes.keys()];
}

// --- layers --------------------------------------------------------------------------

/** The record of a diagram, made when the slide has cells but no record for them. */
export function ensureDiagramMeta(slide: Slide, diagramId: string): DiagramMeta {
  const existing = slide.diagrams?.[diagramId];
  if (existing) {
    if (existing.layers.length === 0) existing.layers = DEFAULT_LAYERS.map((l) => ({ ...l }));
    return existing;
  }
  const cell = slide.elements.find((el): el is DiagramCellEl => isCell(el) && el.diagram === diagramId);
  const meta: DiagramMeta = { ...newDiagramMeta(), ...(cell ? { origin: { ...cell.origin }, scale: cell.scale } : {}) };
  slide.diagrams = { ...(slide.diagrams ?? {}), [diagramId]: meta };
  return meta;
}

/** draw.io's name for a layer without one. */
export function layerName(layer: Pick<Layer, 'label'>): string {
  return layer.label || 'Background';
}

/**
 * A new layer on top (the Layers dialog's +), named "Untitled Layer" as in
 * draw.io unless named here, or at `index` (0 = bottom). Returns its cell id.
 */
export function addLayer(slide: Slide, diagramId: string, options: { label?: string; index?: number } = {}): string {
  const meta = ensureDiagramMeta(slide, diagramId);
  const cell = freshCellId(usedCellIds(slide, diagramId), 'layer-');
  const layer: Layer = { cell, label: options.label ?? 'Untitled Layer', dio: '' };
  const at = options.index == null ? meta.layers.length : Math.max(0, Math.min(meta.layers.length, options.index));
  meta.layers.splice(at, 0, layer);
  return cell;
}

export function renameLayer(slide: Slide, diagramId: string, layerCell: string, label: string): boolean {
  const layer = slide.diagrams?.[diagramId]?.layers.find((l) => l.cell === layerCell);
  if (!layer) return false;
  // An emptied name is draw.io's "Untitled Layer".
  const next = label.trim() ? label : 'Untitled Layer';
  if (layer.label === next) return false;
  layer.label = next;
  return true;
}

/**
 * Delete a layer and every cell on it (draw.io's Layers dialog: removeCells
 * without the connectors of other layers, which become loose ends). The
 * last layer leaves a fresh empty one behind. Returns the removed element
 * ids and the layer that becomes current (the one below, else the new
 * bottom).
 */
export function deleteLayer(slide: Slide, diagramId: string, layerCell: string): { removed: string[]; current: string } | null {
  const meta = slide.diagrams?.[diagramId];
  const index = meta?.layers.findIndex((l) => l.cell === layerCell) ?? -1;
  if (!meta || index < 0) return null;
  const tree = new DiagramTree(slide);
  const doomed = new Set(tree.layerCells(diagramId, layerCell).map((c) => c.id));
  // Orphans drawn on the first layer go with it.
  removeElements(slide, doomed);
  meta.layers.splice(index, 1);
  if (meta.layers.length === 0) meta.layers.push({ cell: freshCellId(usedCellIds(slide, diagramId), 'layer-'), label: '', dio: '' });
  const current = meta.layers[Math.max(0, Math.min(index - 1, meta.layers.length - 1))].cell;
  updateConcealment(slide);
  return { removed: [...doomed], current };
}

/** Move a layer to `index` in the stack (0 = bottom), restacking its cells. */
export function moveLayer(slide: Slide, diagramId: string, layerCell: string, index: number): boolean {
  const meta = slide.diagrams?.[diagramId];
  const from = meta?.layers.findIndex((l) => l.cell === layerCell) ?? -1;
  if (!meta || from < 0) return false;
  const to = Math.max(0, Math.min(meta.layers.length - 1, index));
  if (to === from) return false;
  const [layer] = meta.layers.splice(from, 1);
  meta.layers.splice(to, 0, layer);
  restackDiagram(slide, diagramId);
  return true;
}

/** Show or hide a layer: its cells are concealed while it is hidden. */
export function setLayerHidden(slide: Slide, diagramId: string, layerCell: string, hidden: boolean): boolean {
  const layer = slide.diagrams?.[diagramId]?.layers.find((l) => l.cell === layerCell);
  if (!layer || Boolean(layer.hidden) === hidden) return false;
  if (hidden) layer.hidden = true;
  else delete layer.hidden;
  updateConcealment(slide);
  return true;
}

/** Lock or unlock a layer (`locked=1`/`locked=0` in the layer cell's style, as draw.io writes it). */
export function setLayerLocked(slide: Slide, diagramId: string, layerCell: string, locked: boolean): boolean {
  const layer = slide.diagrams?.[diagramId]?.layers.find((l) => l.cell === layerCell);
  if (!layer || isLayerLocked(layer) === locked) return false;
  layer.dio = setStyleValue(layer.dio, 'locked', locked ? '1' : '0');
  return true;
}

/**
 * draw.io's "Move selection to" a layer (moveCells with the layer as
 * target): the topmost selected cells go, with what is inside them, to the
 * top of that layer. Returns the ids of the cells moved.
 */
export function moveCellsToLayer(slide: Slide, elementIds: Iterable<string>, layerCell: string): string[] {
  const tree = new DiagramTree(slide);
  const cells = selectedCells(slide, elementIds);
  if (cells.length === 0) return [];
  const diagramId = cells[0].diagram;
  if (!tree.isLayer(diagramId, layerCell)) return [];
  const chosen = new Set(cells.map((c) => c.id));
  const topmost = cells.filter((c) => c.diagram === diagramId && !tree.ancestors(c).some((a) => chosen.has(a.id)));
  const moved: string[] = [];
  for (const cell of topmost) {
    if (tree.effectiveParent(cell) === layerCell && cell.parent === layerCell) continue;
    cell.parent = layerCell;
    if (cell.type === 'vertex' && cell.relative) {
      if (cell.relative.offset) cell.offset = { ...cell.relative.offset };
      delete cell.relative;
    }
    moved.push(cell.id);
  }
  const movedSet = new Set(moved);
  for (const id of [...moved]) {
    const cell = tree.byId.get(id);
    if (cell) for (const edge of updateEdgeParents(slide, cell, movedSet)) moved.push(edge);
  }
  if (moved.length === 0) return [];
  const end = slide.elements.length + 1;
  restackDiagram(slide, diagramId, new Map(moved.map((id) => [id, end + (tree.position.get(id) ?? 0)])));
  updateConcealment(slide);
  return moved;
}

/**
 * The cells draw.io's "Select objects in layer" picks (Graph.selectAll on the
 * layer): its direct children, none when it is locked or hidden.
 */
export function selectableLayerCells(slide: SlideLike, diagramId: string, layerCell: string): DiagramCellEl[] {
  const tree = new DiagramTree(slide);
  const layer = tree.layer(diagramId, layerCell);
  if (!layer || isLayerLocked(layer) || layer.hidden) return [];
  return tree.childrenOfCell(diagramId, layerCell).filter((c) => !c.hidden && !c.concealed);
}

/** Graph.getLayerForCells: the layer all the cells are on, or null when they differ. */
export function layerForCells(slide: SlideLike, elementIds: Iterable<string>): { diagram: string; layer: string } | null {
  const tree = new DiagramTree(slide);
  let found: { diagram: string; layer: string } | null = null;
  for (const id of elementIds) {
    const el = tree.byId.get(id);
    if (!el) continue;
    const layer = tree.layerOf(el);
    if (found && (found.diagram !== el.diagram || found.layer !== layer)) return null;
    found = { diagram: el.diagram, layer };
  }
  return found;
}
