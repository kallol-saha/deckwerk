/**
 * A draw.io diagram page as plain data: the cells of one mxGraphModel with
 * their geometry exactly as the file has it (parent-relative), plus the
 * helpers that turn that into slide-space boxes. drawioFile.ts reads and
 * writes it; the converter to DeckWerk elements (convert.ts) works on it.
 */

import type { Point, Rect } from './types.js';

export interface CellGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Edge labels: x along the edge (-1…1), y perpendicular px. Vertices
   * (ports): x and y are fractions of the parent's size.
   */
  relative: boolean;
  /** Edge waypoints, in the coordinates of the edge's parent. */
  points?: Point[];
  /** Loose edge ends, used when there is no source/target. */
  sourcePoint?: Point;
  targetPoint?: Point;
  /** Extra absolute offset (labels, relative vertices). */
  offset?: Point;
  /** Bounds of a collapsed container when expanded (and vice versa). */
  alternateBounds?: Rect;
}

export type CellKind = 'root' | 'layer' | 'vertex' | 'edge' | 'other';

export interface DiagramCell {
  id: string;
  parent: string | null;
  kind: CellKind;
  /** The label: HTML when the style has html=1, else plain text. */
  value: string;
  style: string;
  source: string | null;
  target: string | null;
  visible: boolean;
  collapsed: boolean;
  connectable: boolean;
  geometry: CellGeometry | null;
  /**
   * Custom properties when the cell is wrapped in `<object>`/`<UserObject>`
   * (`label`, `tooltip`, `link`, `placeholders`, `tags` and user keys);
   * null for a bare `<mxCell>`.
   */
  object: { tag: string; attrs: Record<string, string> } | null;
  /** mxCell attributes this model does not interpret, kept for writing back. */
  extra: Record<string, string>;
}

export interface DiagramPage {
  id: string;
  name: string;
  /** mxGraphModel attributes (dx, dy, grid, pageWidth, background, math, …). */
  model: Record<string, string>;
  /** Cells in document order (which is paint order). */
  cells: DiagramCell[];
  /** `<diagram>` attributes other than id and name. */
  extra: Record<string, string>;
}

export interface DrawioDocument {
  /** `<mxfile>` attributes (host, modified, agent, version, …). */
  attributes: Record<string, string>;
  pages: DiagramPage[];
}

export function cellIndex(page: DiagramPage): Map<string, DiagramCell> {
  return new Map(page.cells.map((c) => [c.id, c]));
}

/** Layer cells: children of the root, in order. */
export function layers(page: DiagramPage): DiagramCell[] {
  const root = page.cells.find((c) => c.parent == null);
  if (!root) return [];
  return page.cells.filter((c) => c.parent === root.id);
}

/**
 * The page-space box of every vertex, following parents as
 * mxGraphView.updateCellState does: a child's geometry is relative to its
 * parent vertex's origin; a relative vertex (a port) places its origin at a
 * fraction of the parent's size plus `offset`. Edges and layers have none.
 */
export function absoluteBounds(page: DiagramPage): Map<string, Rect> {
  const byId = cellIndex(page);
  const result = new Map<string, Rect>();
  const visiting = new Set<string>();
  const originOf = (id: string | null): Point => {
    if (id == null) return { x: 0, y: 0 };
    const cell = byId.get(id);
    if (!cell || cell.kind !== 'vertex') return { x: 0, y: 0 };
    const box = boundsOf(cell);
    return box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
  };
  const boundsOf = (cell: DiagramCell): Rect | null => {
    const known = result.get(cell.id);
    if (known) return known;
    if (cell.kind !== 'vertex' || !cell.geometry) return null;
    if (visiting.has(cell.id)) return null;
    visiting.add(cell.id);
    const g = cell.geometry;
    const parent = cell.parent != null ? byId.get(cell.parent) : undefined;
    let box: Rect;
    if (g.relative && parent && parent.kind === 'vertex') {
      const p = boundsOf(parent) ?? { x: 0, y: 0, width: 0, height: 0 };
      box = {
        x: p.x + g.x * p.width + (g.offset?.x ?? 0),
        y: p.y + g.y * p.height + (g.offset?.y ?? 0),
        width: g.width,
        height: g.height,
      };
    } else {
      const o = originOf(cell.parent);
      box = { x: o.x + g.x, y: o.y + g.y, width: g.width, height: g.height };
    }
    visiting.delete(cell.id);
    result.set(cell.id, box);
    return box;
  };
  for (const cell of page.cells) boundsOf(cell);
  return result;
}

/** The page-space origin that a cell's own geometry is relative to. */
export function parentOrigin(page: DiagramPage, cellId: string, bounds = absoluteBounds(page)): Point {
  const cell = cellIndex(page).get(cellId);
  if (!cell || cell.parent == null) return { x: 0, y: 0 };
  const parentBox = bounds.get(cell.parent);
  return parentBox ? { x: parentBox.x, y: parentBox.y } : { x: 0, y: 0 };
}

/** Whether a cell and every ancestor up to the root are visible. */
export function isShown(page: DiagramPage, cellId: string): boolean {
  const byId = cellIndex(page);
  let cell = byId.get(cellId);
  const seen = new Set<string>();
  while (cell && !seen.has(cell.id)) {
    seen.add(cell.id);
    if (!cell.visible) return false;
    if (cell.parent == null) return true;
    const parent = byId.get(cell.parent);
    if (parent && parent.kind === 'vertex' && parent.collapsed) return false;
    cell = parent;
  }
  return true;
}

/** The text a cell shows: the object's `label` when wrapped, else `value`. */
export function cellLabel(cell: DiagramCell): string {
  if (cell.object) return cell.object.attrs.label ?? '';
  return cell.value;
}
