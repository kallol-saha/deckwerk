/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and draw.io AG, Apache License 2.0: js/grapheditor/Graph.js
 * (TableLayout, Graph.isTable/isTableRow/isTableCell, visitTableCells,
 * getTableLines, setTableRowHeight, setTableColumnWidth, insertTableRow,
 * insertTableColumn, deleteTableRow, deleteTableColumn,
 * Graph.minTableColumnWidth/minTableRowHeight), js/grapheditor/Shapes.js
 * (TableShape.paintTableForeground, TableLineShape.paintTableLine),
 * mxgraph/src/view/mxGraph.js (getActualStartSize, getSwimlaneDirection)
 * and mxgraph/src/view/mxCellRenderer.js (resolveColor).
 * Modified for DeckWerk: works on a slide's vertex elements (slide pixels;
 * draw.io units are pixels over the cell's scale, geometry relative to the
 * parent as in the model). draw.io's layout manager runs the table layout
 * when anything in a table changes; here `withTableLayout` does that after
 * every commit, and turns a row or cell resized on its own into draw.io's
 * row-height and column-width handles.
 */

import type { Deck, Slide, SlideElement, VertexEl } from '../deck.js';
import type { SvgCanvas } from './canvas.js';
import { freshCellId, usedCellIds } from './insert.js';
import { DiagramTree, isCell, restackDiagram, type DiagramCellEl } from './structure.js';
import { resolveStyle, setStyleValue } from './style.js';
import type { Point, Style } from './types.js';

/** Graph.minTableColumnWidth. */
export const MIN_TABLE_COLUMN_WIDTH = 20;
/** Graph.minTableRowHeight. */
export const MIN_TABLE_ROW_HEIGHT = 20;

type SlideLike = Pick<Slide, 'elements' | 'diagrams'>;

/** Below this a difference in draw.io units is rounding noise. */
const EPS = 1e-6;

function styleOf(el: Pick<VertexEl, 'dio'>): Style {
  return resolveStyle(el.dio, 'vertex');
}

function isNumeric(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

/** A style value as draw.io's parsed style holds it: numbers for numeric strings. */
function parsed(style: Style, key: string): string | number | undefined {
  const value = style[key];
  if (value == null) return undefined;
  return isNumeric(value) ? Number(value) : value;
}

/** `mxUtils.getValue(style, key, fallback) == '1'` (draw.io compares loosely). */
function isOne(style: Style, key: string, fallback: 0 | 1 = 0): boolean {
  const value = parsed(style, key);
  return (value ?? fallback) == 1; // eslint-disable-line eqeqeq
}

/** `mxUtils.getValue(style, key, true)` as a condition (horizontal). */
function truthyValue(style: Style, key: string, fallback: boolean): boolean {
  const value = parsed(style, key);
  return value === undefined ? fallback : Boolean(value);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// --- what is a table ----------------------------------------------------------------

/** Graph.isTable: a vertex whose children are laid out by the table layout. */
export function isTableEl(el: SlideElement | null | undefined): el is VertexEl {
  return el?.type === 'vertex' && /tableLayout/.test(el.dio) && styleOf(el).childLayout === 'tableLayout';
}

/** Graph.isTableRow: a vertex whose parent is a table. */
export function isTableRowEl(tree: DiagramTree, el: SlideElement | null | undefined): el is VertexEl {
  return el?.type === 'vertex' && isTableEl(tree.parentOf(el));
}

/** Graph.isTableCell: a vertex whose parent is a table row. */
export function isTableCellEl(tree: DiagramTree, el: SlideElement | null | undefined): el is VertexEl {
  if (el?.type !== 'vertex') return false;
  const parent = tree.parentOf(el);
  return parent?.type === 'vertex' && isTableRowEl(tree, parent);
}

/** The table a table, row or cell belongs to. */
export function tableOf(tree: DiagramTree, el: SlideElement | null | undefined): VertexEl | null {
  if (el?.type !== 'vertex') return null;
  if (isTableCellEl(tree, el)) return tree.parentOf(tree.parentOf(el)!) as VertexEl;
  if (isTableRowEl(tree, el)) return tree.parentOf(el) as VertexEl;
  return isTableEl(el) ? el : null;
}

/** Does a slide hold a table at all (cheap: no tree)? */
function mayHoldTable(slide: SlideLike): boolean {
  return slide.elements.some((el) => el.type === 'vertex' && el.dio.includes('tableLayout'));
}

// --- start sizes (mxGraph.getActualStartSize) ---------------------------------------

interface Insets {
  /** left, top, right, bottom as draw.io's rectangle: x, y, width, height. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** mxGraph.getSwimlaneDirection. */
function swimlaneDirection(style: Style): 'north' | 'east' | 'south' | 'west' {
  const dir = style.direction ?? 'east';
  const flipH = isOne(style, 'flipH');
  const flipV = isOne(style, 'flipV');
  const h = truthyValue(style, 'horizontal', true);
  let n = h ? 0 : 3;
  if (dir === 'north') n--;
  else if (dir === 'west') n += 2;
  else if (dir === 'south') n += 1;
  const mod = ((n % 2) + 2) % 2;
  if (flipH && mod === 1) n += 2;
  if (flipV && mod === 0) n += 2;
  return (['north', 'east', 'south', 'west'] as const)[((n % 4) + 4) % 4];
}

/** mxGraph.getActualStartSize with Graph.isSwimlane (swimlane, table, tableRow). */
export function actualStartSize(el: Pick<VertexEl, 'dio'>): Insets {
  const result = { x: 0, y: 0, width: 0, height: 0 };
  const style = styleOf(el);
  if (style.shape !== 'swimlane' && style.shape !== 'table' && style.shape !== 'tableRow') return result;
  const size = parseInt(style.startSize ?? '40', 10);
  if (!Number.isFinite(size)) return result;
  const dir = swimlaneDirection(style);
  if (dir === 'north') result.y = size;
  else if (dir === 'west') result.x = size;
  else if (dir === 'south') result.height = size;
  else result.width = size;
  return result;
}

// --- a table in draw.io units ---------------------------------------------------------

interface Geo {
  x: number;
  y: number;
  width: number;
  height: number;
  /** alternateBounds' size; for a merged cell, the size of its own column and row. */
  alt: { width: number; height: number } | null;
}

/** One entry of Graph.visitTableCells. */
interface VisitedCell {
  cell: VertexEl;
  rowspan: number;
  colspan: number;
  row: number;
  col: number;
  geo: Geo;
  point: Point;
  actual: VisitedCell;
}

/**
 * A table's rows and cells as draw.io's model sees them: geometry relative
 * to the parent, in the table's draw.io units, and visibility. Changes are
 * made here and written back to the elements by `writeBack`.
 */
class TableWork {
  readonly s: number;
  private readonly geos = new Map<string, Geo>();
  private readonly hiddenFlags = new Map<string, boolean>();

  constructor(readonly tree: DiagramTree, readonly table: VertexEl) {
    this.s = table.scale || 1;
    this.geos.set(table.id, { x: 0, y: 0, width: round6(table.w / this.s), height: round6(table.h / this.s), alt: null });
    for (const row of this.rows()) {
      this.geos.set(row.id, this.relative(row, table));
      for (const cell of this.cells(row)) this.geos.set(cell.id, this.relative(cell, row));
    }
  }

  private relative(el: VertexEl, parent: VertexEl): Geo {
    const s = this.s;
    const alt = el.alternateBounds ? { width: el.alternateBounds.w, height: el.alternateBounds.h } : null;
    return {
      x: round6((el.x - parent.x) / s),
      y: round6((el.y - parent.y) / s),
      width: round6(el.w / s),
      height: round6(el.h / s),
      alt,
    };
  }

  /** model.getChildCells(table, true): the rows, in model order. */
  rows(): VertexEl[] {
    return this.tree.children(this.table).filter((c): c is VertexEl => c.type === 'vertex');
  }

  /** model.getChildCells(row, true). */
  cells(row: VertexEl): VertexEl[] {
    return this.tree.children(row).filter((c): c is VertexEl => c.type === 'vertex');
  }

  geo(el: VertexEl): Geo {
    let geo = this.geos.get(el.id);
    if (!geo) {
      // A row or cell added since the work began (inserted rows and columns)
      const parent = this.tree.parentOf(el);
      geo = parent?.type === 'vertex' ? this.relative(el, parent) : { x: 0, y: 0, width: el.w / this.s, height: el.h / this.s, alt: null };
      this.geos.set(el.id, geo);
    }
    return geo;
  }

  setGeo(el: VertexEl, geo: Geo): void {
    this.geos.set(el.id, geo);
  }

  visible(el: VertexEl): boolean {
    return !(this.hiddenFlags.get(el.id) ?? Boolean(el.hidden));
  }

  setVisible(el: VertexEl, visible: boolean): void {
    this.hiddenFlags.set(el.id, !visible);
  }

  /** TableLayout.getSize: the total width or height of the visible cells. */
  private size(cells: VertexEl[], horizontal: boolean): number {
    let total = 0;
    for (const cell of cells) {
      if (!this.visible(cell)) continue;
      const geo = this.geo(cell);
      total += horizontal ? geo.width : geo.height;
    }
    return total;
  }

  /** TableLayout.getRowLayout: the column positions for a row of the given width. */
  private rowLayout(row: VertexEl, width: number): number[] {
    const cells = this.cells(row);
    const off = actualStartSize(row);
    const sw = this.size(cells, true);
    const rw = Math.max(0, width - off.x - off.width);
    const result: number[] = [];
    let x = off.x;
    for (const cell of cells) {
      const geo = this.geo(cell);
      // Distributes evenly if stored widths are unusable
      x += sw > 0 ? (geo.alt != null ? geo.alt.width : geo.width) * rw / sw : rw / cells.length;
      result.push(Math.round(x));
    }
    return result;
  }

  /** TableLayout.layoutRow: places the cells at the given positions in the row. */
  private layoutRow(row: VertexEl, positionsIn: number[] | null, height: number, tw: number): number {
    const cells = this.cells(row);
    const off = actualStartSize(row);
    let x = off.x;
    let sw = 0;
    const positions = positionsIn != null ? [off.x, ...positionsIn] : null;
    for (let i = 0; i < cells.length; i++) {
      const geo = { ...this.geo(cells[i]) };
      geo.y = off.y;
      geo.height = Math.max(0, height - off.y - off.height);
      if (positions != null) {
        geo.x = positions[i] ?? geo.x;
        // A row with more cells than the first row: draw.io computes NaN, here 0
        geo.width = positions[i + 1] != null ? Math.max(0, positions[i + 1] - geo.x) : 0;
        // Fills with last geo if not enough cells
        if (i === cells.length - 1 && i < positions.length - 2) {
          geo.width = Math.max(0, tw - geo.x - off.x - off.width);
        }
      } else {
        geo.x = x;
        x += geo.width;
        if (i === cells.length - 1) geo.width = Math.max(0, tw - off.x - off.width - sw);
        else sw += geo.width;
      }
      geo.alt = { width: geo.width, height: geo.height };
      this.setGeo(cells[i], geo);
    }
    return sw;
  }

  /** TableLayout.execute. */
  execute(): void {
    const parent = this.table;
    let table = this.geo(parent);
    const offset = actualStartSize(parent);
    const style = styleOf(parent);
    const resizeLastRow = isOne(style, 'resizeLastRow');
    const resizeLast = isOne(style, 'resizeLast');
    const fixedRows = isOne(style, 'fixedRows');
    let sw = 0;
    const rows = this.rows();
    // Updates row visibilities
    for (const row of rows) this.setVisible(row, true);
    if (rows.length > 0 && !parent.collapsed) {
      // Grows the table if the start sizes leave no room for content
      let start = 0;
      for (const row of rows) {
        const rs = actualStartSize(row);
        start = Math.max(start, rs.x + rs.width);
      }
      let minWidth = offset.x + offset.width + start;
      let minHeight = offset.y + offset.height;
      minWidth += minWidth > 0 ? MIN_TABLE_COLUMN_WIDTH : 0;
      minHeight += minHeight > 0 ? MIN_TABLE_ROW_HEIGHT : 0;
      if (table.width < minWidth || table.height < minHeight) {
        table = { ...table, width: Math.max(table.width, minWidth), height: Math.max(table.height, minHeight) };
        this.setGeo(parent, table);
      }
    }
    const th = table.height - offset.y - offset.height;
    const tw = table.width - offset.x - offset.width;
    const sh = this.size(rows, false);
    if (th > 0 && tw > 0 && rows.length > 0 && sh > 0) {
      if (resizeLastRow) {
        const last = rows[rows.length - 1];
        const row = { ...this.geo(last) };
        row.height = th - sh + row.height;
        this.setGeo(last, row);
      }
      const pos = resizeLast ? null : this.rowLayout(rows[0], tw);
      let y = offset.y;
      // Updates row geometries
      for (const el of rows) {
        const row = { ...this.geo(el) };
        row.x = offset.x;
        row.width = tw;
        row.y = Math.round(y);
        if (resizeLastRow || fixedRows) y += row.height;
        else y += (row.height / sh) * th;
        row.height = Math.round(y) - row.y;
        this.setGeo(el, row);
        // Updates cell geometries
        sw = Math.max(sw, this.layoutRow(el, pos, row.height, tw));
      }
      if (fixedRows && th < sh) {
        table = { ...table, height: y + offset.height };
        this.setGeo(parent, table);
      }
      if (resizeLast && tw < sw + MIN_TABLE_COLUMN_WIDTH) {
        table = { ...table, width: sw + offset.width + offset.x + MIN_TABLE_COLUMN_WIDTH };
        this.setGeo(parent, table);
      }
      // Merged cells: the covered cells are hidden and their sizes added to the merged one
      this.visitCells((iter) => {
        this.setVisible(iter.cell, iter.actual.cell === iter.cell);
        if (iter.actual.cell !== iter.cell) {
          if (iter.actual.row === iter.row) {
            const g = iter.geo.alt ?? iter.geo;
            iter.actual.geo.width += g.width;
          }
          if (iter.actual.col === iter.col) {
            const g = iter.geo.alt ?? iter.geo;
            iter.actual.geo.height += g.height;
          }
        }
      });
    } else {
      for (const row of rows) this.setVisible(row, false);
    }
  }

  /**
   * Graph.visitTableCells. The geometry handed to the visitor is the stored
   * one (changes to it are kept), as in draw.io after the layout cloned it.
   */
  visitCells(visitor: (iter: VisitedCell, colCount: number, rowCount: number, x0: number, y0: number) => void): void {
    let lastRow: Array<VisitedCell | null> | null = null;
    const rows = this.rows();
    const start = actualStartSize(this.table);
    for (let i = 0; i < rows.length; i++) {
      const rowStart = actualStartSize(rows[i]);
      const cols = this.cells(rows[i]);
      const rowStyle = styleOf(rows[i]);
      let lastCol: VisitedCell | null = null;
      const row: Array<VisitedCell | null> = [];
      for (let j = 0; j < cols.length; j++) {
        const stored = this.geo(cols[j]);
        const g = stored.alt ?? stored;
        const col: VisitedCell = {
          cell: cols[j], rowspan: 1, colspan: 1, row: i, col: j, geo: stored,
          point: {
            x: g.width + (lastCol != null ? lastCol.point.x : start.x + rowStart.x),
            y: g.height + (lastRow != null && lastRow[0] != null ? lastRow[0].point.y : start.y + rowStart.y),
          },
          actual: null as unknown as VisitedCell,
        };
        col.actual = col;
        const above = lastRow?.[j] ?? null;
        if (above != null && above.rowspan > 1) {
          col.rowspan = above.rowspan - 1;
          col.colspan = above.colspan;
          col.actual = above.actual;
        } else if (lastCol != null && lastCol.colspan > 1) {
          col.rowspan = lastCol.rowspan;
          col.colspan = lastCol.colspan - 1;
          col.actual = lastCol.actual;
        } else {
          const style = styleOf(cols[j]);
          col.rowspan = parseInt(style.rowspan || '1', 10) || 1;
          col.colspan = parseInt(style.colspan || '1', 10) || 1;
        }
        const head = isOne(rowStyle, 'swimlaneHead', 1) && (rowStyle.strokeColor ?? 'none') !== 'none';
        visitor(col, cols.length, rows.length, start.x + (head ? rowStart.x : 0), start.y + (head ? rowStart.y : 0));
        row.push(col);
        lastCol = col;
      }
      lastRow = row;
    }
  }

  /** Graph.getTableLines: the row and column lines, in the table's draw.io units. */
  lines(horizontal: boolean, vertical: boolean): Array<Array<Point | null>> {
    const hl: Array<Array<Point | null>> = [];
    const vl: Array<Array<Point | null>> = [];
    if (horizontal || vertical) {
      this.visitCells((iter, colCount, rowCount, x0, y0) => {
        // Constructs horizontal lines
        if (horizontal && iter.row < rowCount - 1) {
          if (hl[iter.row] == null) hl[iter.row] = [{ x: x0, y: iter.point.y }];
          if (iter.rowspan > 1) hl[iter.row].push(null);
          hl[iter.row].push(iter.point);
        }
        // Constructs vertical lines
        if (vertical && iter.col < colCount - 1) {
          if (vl[iter.col] == null) vl[iter.col] = [{ x: iter.point.x, y: y0 }];
          if (iter.colspan > 1) vl[iter.col].push(null);
          vl[iter.col].push(iter.point);
        }
      });
    }
    // Sparse arrays (a row without lines) are skipped by concat's holes in draw.io's painter
    return [...hl, ...vl].filter((line) => line != null);
  }

  /** Graph.setTableRowHeight. */
  setRowHeight(row: VertexEl, dy: number, extendIn = true): void {
    let extend = extendIn;
    const rgeo = { ...this.geo(row) };
    rgeo.height += dy;
    this.setGeo(row, rgeo);
    const rows = this.rows();
    // Shifts and resizes neighbor row
    if (!extend) {
      const index = rows.indexOf(row);
      if (index < rows.length - 1) {
        const next = rows[index + 1];
        const geo = { ...this.geo(next) };
        geo.y += dy;
        geo.height -= dy;
        this.setGeo(next, geo);
      }
    }
    // Always extends for last row
    if (!extend) extend = row === rows[rows.length - 1];
    if (extend) {
      const tgeo = { ...this.geo(this.table) };
      tgeo.height += dy;
      this.setGeo(this.table, tgeo);
    }
    // draw.io's layout manager runs the table layout after the change
    this.execute();
  }

  /** Graph.setTableColumnWidth. */
  setColumnWidth(col: VertexEl, dx: number, extend = false): void {
    const row = this.tree.parentOf(col) as VertexEl;
    const index = this.cells(row).indexOf(col);
    const lastColumn = index === this.cells(row).length - 1;
    for (const r of this.rows()) {
      const cells = this.cells(r);
      const cell = cells[index];
      if (cell != null) {
        const geo = { ...this.geo(cell) };
        geo.width += dx;
        if (geo.alt != null) geo.alt = { ...geo.alt, width: geo.alt.width + dx };
        this.setGeo(cell, geo);
      }
      // Shifts and resizes neighbor column
      if (index < cells.length - 1) {
        const next = cells[index + 1];
        const geo = { ...this.geo(next) };
        geo.x += dx;
        if (!extend) {
          geo.width -= dx;
          if (geo.alt != null) geo.alt = { ...geo.alt, width: geo.alt.width - dx };
        }
        this.setGeo(next, geo);
      }
    }
    if (lastColumn || extend) {
      const tgeo = { ...this.geo(this.table) };
      tgeo.width += dx;
      this.setGeo(this.table, tgeo);
    }
    this.execute();
  }

  /**
   * Writes the geometry and visibility back to the elements of `slide` (the
   * same objects the tree was built from), moving what is inside a moved
   * cell along. Returns the ids of the elements that changed.
   */
  writeBack(): Set<string> {
    const changed = new Set<string>();
    const s = this.s;
    const close = (a: number, b: number) => Math.abs(a - b) < EPS;
    const place = (el: VertexEl, x: number, y: number, geo: Geo, alt: boolean) => {
      const w = Math.max(geo.width * s, 0.01);
      const h = Math.max(geo.height * s, 0.01);
      const dx = x - el.x;
      const dy = y - el.y;
      let dirty = false;
      if (!close(el.x, x) || !close(el.y, y) || !close(el.w, w) || !close(el.h, h)) {
        el.x = x;
        el.y = y;
        el.w = w;
        el.h = h;
        dirty = true;
      }
      if (alt && geo.alt != null) {
        const ab = el.alternateBounds;
        if (!ab || ab.x !== 0 || ab.y !== 0 || !close(ab.w, geo.alt.width) || !close(ab.h, geo.alt.height)) {
          el.alternateBounds = { x: 0, y: 0, w: round6(geo.alt.width), h: round6(geo.alt.height) };
          dirty = true;
        }
      }
      const hidden = this.hiddenFlags.get(el.id);
      if (hidden != null && Boolean(el.hidden) !== hidden) {
        if (hidden) el.hidden = true;
        else delete el.hidden;
        dirty = true;
      }
      if (dirty) changed.add(el.id);
      return { dx, dy };
    };
    const table = this.geo(this.table);
    place(this.table, this.table.x, this.table.y, table, false);
    for (const row of this.rows()) {
      const rg = this.geo(row);
      place(row, this.table.x + rg.x * s, this.table.y + rg.y * s, rg, false);
      for (const cell of this.cells(row)) {
        const cg = this.geo(cell);
        const { dx, dy } = place(cell, row.x + cg.x * s, row.y + cg.y * s, cg, true);
        if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
          for (const inside of this.tree.descendants(cell)) {
            translate(inside, dx, dy);
            changed.add(inside.id);
          }
        }
      }
    }
    return changed;
  }
}

function translate(el: DiagramCellEl, dx: number, dy: number): void {
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

function elementById(slide: SlideLike, id: string): SlideElement | undefined {
  return slide.elements.find((e) => e.id === id);
}

// --- layout and handles on a slide ------------------------------------------------------

/**
 * Runs draw.io's table layout (TableLayout.execute) on the table `tableId`
 * of `slide`, changing its rows and cells in place. Returns the ids of the
 * elements that changed.
 */
export function layoutTable(slide: SlideLike, tableId: string): Set<string> {
  const tree = new DiagramTree(slide);
  const table = tree.vertex(tableId);
  if (!table || !isTableEl(table)) return new Set();
  const work = new TableWork(tree, table);
  work.execute();
  return work.writeBack();
}

/**
 * Graph.setTableRowHeight for the row of `cellId` (a row or a cell): the row
 * grows by `dy` draw.io units, and the table with it (`extend`, the
 * default) or the next row gives the room. Then the table layout runs.
 */
export function setTableRowHeight(slide: SlideLike, cellId: string, dy: number, extend = true): Set<string> {
  const tree = new DiagramTree(slide);
  const el = tree.vertex(cellId);
  const row = el && isTableCellEl(tree, el) ? tree.parentOf(el) as VertexEl : el;
  if (!row || !isTableRowEl(tree, row)) return new Set();
  const work = new TableWork(tree, tableOf(tree, row)!);
  work.setRowHeight(row, dy, extend);
  return work.writeBack();
}

/**
 * Graph.setTableColumnWidth for the column of the cell `cellId`: the column
 * grows by `dx` draw.io units, the next column gives the room (or the
 * table grows, with `extend` or for the last column). Then the layout runs.
 */
export function setTableColumnWidth(slide: SlideLike, cellId: string, dx: number, extend = false): Set<string> {
  const tree = new DiagramTree(slide);
  const cell = tree.vertex(cellId);
  if (!cell || !isTableCellEl(tree, cell)) return new Set();
  const work = new TableWork(tree, tableOf(tree, cell)!);
  work.setColumnWidth(cell, dx, extend);
  return work.writeBack();
}

// --- inserting and deleting rows and columns ---------------------------------------------

/** What a table command did to the slide. */
export interface TableEdit {
  inserted: string[];
  removed: string[];
  changed: string[];
}

/** model.cloneCell(cell, false) with the value removed (draw.io's new row or column cell). */
function cloneEmpty(el: VertexEl, id: string, cell: string): VertexEl {
  const copy = structuredClone(el);
  copy.id = id;
  copy.cell = cell;
  copy.label = '';
  copy.object = null;
  delete copy.comments;
  delete copy.morphId;
  delete copy.lineageId;
  delete copy.hidden;
  return copy;
}

/** Removes `rowspan`/`colspan`, and the alternate bounds become the size (insertTableRow/Column). */
function unmerged(el: VertexEl): void {
  el.dio = setStyleValue(setStyleValue(el.dio, 'rowspan', null), 'colspan', null);
  if (el.alternateBounds) {
    el.w = el.alternateBounds.w * el.scale;
    el.h = el.alternateBounds.h * el.scale;
    el.alternateBounds = null;
  }
}

/** Puts new cells into the slide's paint order right after (or before) `anchor`'s subtree. */
function placeAfter(slide: Slide, _tree: DiagramTree, anchor: VertexEl, added: VertexEl[], before: boolean, diagramId: string): void {
  for (const el of added) {
    el.z = anchor.z;
    slide.elements.push(el);
  }
  // Paint positions with the new cells in, which restackDiagram sorts siblings by
  const position = new DiagramTree(slide).position.get(anchor.id) ?? 0;
  const order = new Map<string, number>();
  added.forEach((el, i) => order.set(el.id, position + (before ? -0.5 : 0.5) + i * 1e-4));
  restackDiagram(slide, diagramId, order);
}

/**
 * Graph.insertTableRow: a copy of the row of `cellId` (a cell, a row, or
 * the table: then the first or last row), empty, above (`before`) or
 * below it; the table grows by its height. Then the layout runs.
 */
export function insertTableRow(slide: Slide, cellId: string, before: boolean, makeId: (prefix: string) => string): TableEdit {
  let tree = new DiagramTree(slide);
  const el = tree.vertex(cellId);
  const table = tableOf(tree, el);
  if (!el || !table) return { inserted: [], removed: [], changed: [] };
  let row: VertexEl | null = el;
  if (isTableCellEl(tree, el)) row = tree.parentOf(el) as VertexEl;
  else if (!isTableRowEl(tree, el)) {
    const rows = tree.children(table).filter((c): c is VertexEl => c.type === 'vertex');
    row = rows[before ? 0 : rows.length - 1] ?? null;
  }
  const used = usedCellIds(slide, table.diagram);
  const inserted: VertexEl[] = [];
  const s = table.scale || 1;
  if (row != null) {
    const newRow = cloneEmpty(row, makeId('vertex'), freshCellId(used));
    inserted.push(newRow);
    for (const cell of tree.children(row).filter((c): c is VertexEl => c.type === 'vertex')) {
      const copy = cloneEmpty(cell, makeId('vertex'), freshCellId(used));
      copy.parent = newRow.cell;
      unmerged(copy);
      copy.h = newRow.h;
      inserted.push(copy);
    }
    // Where the layout will put it; it moves the rows below
    const dy = before ? 0 : row.h;
    for (const added of inserted) added.y += dy;
    placeAfter(slide, tree, row, inserted, before, table.diagram);
    tree = new DiagramTree(slide);
    const liveTable = tree.vertex(table.id)!;
    liveTable.h += newRow.h;
  } else {
    // Empty table: insert initial row with a single column
    const sides = styleOf(table).tableRender === 'collapsed' ? '' : 'top=0;left=0;bottom=0;right=0;';
    const rowStyle = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;'
      + `${sides}collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fixedHeader=1;`;
    const cellStyle = 'shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;'
      + `overflow=hidden;fillColor=none;${sides}pointerEvents=1;`;
    const start = actualStartSize(table);
    const base = { ...table, label: '', object: null, alternateBounds: null, collapsed: undefined };
    delete base.comments;
    const newRow: VertexEl = {
      ...structuredClone(base), id: makeId('vertex'), cell: freshCellId(used), parent: table.cell, dio: rowStyle,
      x: table.x + start.x * s, y: table.y + table.h, w: table.w, h: 40 * s,
    };
    const newCell: VertexEl = { ...structuredClone(newRow), id: makeId('vertex'), cell: freshCellId(used), parent: newRow.cell, dio: cellStyle };
    inserted.push(newRow, newCell);
    placeAfter(slide, tree, table, inserted, false, table.diagram);
    tree = new DiagramTree(slide);
    tree.vertex(table.id)!.h += 40 * s;
  }
  const changed = layoutTable(slide, table.id);
  return { inserted: inserted.map((e) => e.id), removed: [], changed: [...changed] };
}

/**
 * Graph.insertTableColumn: a copy of the column of the cell `cellId` (or,
 * for a row or the table, the first or last column), empty, left
 * (`before`) or right of it in every row; the table grows by its width.
 */
export function insertTableColumn(slide: Slide, cellId: string, before: boolean, makeId: (prefix: string) => string): TableEdit {
  let tree = new DiagramTree(slide);
  const el = tree.vertex(cellId);
  const table = tableOf(tree, el);
  if (!el || !table) return { inserted: [], removed: [], changed: [] };
  const rowsOf = (t: DiagramTree) => t.children(table).filter((c): c is VertexEl => c.type === 'vertex');
  const cellsOf = (t: DiagramTree, r: VertexEl) => t.children(r).filter((c): c is VertexEl => c.type === 'vertex');
  let index = 0;
  if (isTableCellEl(tree, el)) {
    index = cellsOf(tree, tree.parentOf(el) as VertexEl).indexOf(el);
  } else {
    const row = isTableRowEl(tree, el) ? el : rowsOf(tree)[0];
    if (!before && row) index = cellsOf(tree, row).length - 1;
  }
  const rows = rowsOf(tree);
  const used = usedCellIds(slide, table.diagram);
  const s = table.scale || 1;
  let dw = MIN_TABLE_COLUMN_WIDTH * s;
  const inserted: VertexEl[] = [];
  const anchors: Array<{ anchor: VertexEl; added: VertexEl; before: boolean }> = [];
  for (const row of rows) {
    const cells = cellsOf(tree, row);
    const child = cells[index];
    let copy: VertexEl;
    if (child) {
      copy = cloneEmpty(child, makeId('vertex'), freshCellId(used));
      unmerged(copy);
      dw = copy.w;
      copy.h = row.h;
      copy.x = before ? child.x : child.x + child.w;
      anchors.push({ anchor: child, added: copy, before });
    } else {
      // Handles possible missing child in row (createVertex(): an empty default vertex)
      const last = cells[cells.length - 1];
      copy = {
        ...structuredClone({ ...row, label: '', object: null, alternateBounds: null }),
        id: makeId('vertex'), cell: freshCellId(used), parent: row.cell, dio: '',
        x: last ? last.x + last.w : row.x, y: row.y, w: dw, h: row.h,
      };
      delete copy.comments;
      anchors.push({ anchor: last ?? row, added: copy, before: false });
    }
    inserted.push(copy);
  }
  for (const { anchor, added, before: b } of anchors) placeAfter(slide, tree, anchor, [added], b, table.diagram);
  tree = new DiagramTree(slide);
  tree.vertex(table.id)!.w += dw;
  const changed = layoutTable(slide, table.id);
  return { inserted: inserted.map((e) => e.id), removed: [], changed: [...changed] };
}

/** Removes elements and everything inside them. */
function removeWithDescendants(slide: Slide, tree: DiagramTree, els: VertexEl[]): string[] {
  const doomed = new Set<string>();
  for (const el of els) {
    doomed.add(el.id);
    for (const d of tree.descendants(el)) doomed.add(d.id);
  }
  slide.elements = slide.elements.filter((e) => !doomed.has(e.id));
  return [...doomed];
}

/**
 * Graph.deleteTableRow: removes the row of `cellId` (a cell or a row; for
 * the table, its last row) and shrinks the table by its height. The last
 * row takes the table with it.
 */
export function deleteTableRow(slide: Slide, cellId: string): TableEdit {
  const tree = new DiagramTree(slide);
  const el = tree.vertex(cellId);
  const table = tableOf(tree, el);
  if (!el || !table) return { inserted: [], removed: [], changed: [] };
  const rows = tree.children(table).filter((c): c is VertexEl => c.type === 'vertex');
  if (rows.length <= 1) return { inserted: [], removed: removeWithDescendants(slide, tree, [table]), changed: [] };
  let row: VertexEl = el;
  if (isTableCellEl(tree, el)) row = tree.parentOf(el) as VertexEl;
  if (!isTableRowEl(tree, row)) row = rows[rows.length - 1];
  const height = row.h;
  const removed = removeWithDescendants(slide, tree, [row]);
  const live = elementById(slide, table.id) as VertexEl;
  live.h = Math.max(live.h - height, 0.01);
  const changed = layoutTable(slide, table.id);
  return { inserted: [], removed, changed: [...changed] };
}

/**
 * Graph.deleteTableColumn: removes the column of the cell `cellId` (for a
 * row or the table, the last column) from every row and shrinks the table
 * by its widest cell. The last column takes the table with it.
 */
export function deleteTableColumn(slide: Slide, cellId: string): TableEdit {
  const tree = new DiagramTree(slide);
  const el = tree.vertex(cellId);
  const table = tableOf(tree, el);
  if (!el || !table) return { inserted: [], removed: [], changed: [] };
  const rows = tree.children(table).filter((c): c is VertexEl => c.type === 'vertex');
  if (rows.length === 0) return { inserted: [], removed: removeWithDescendants(slide, tree, [table]), changed: [] };
  const row = isTableCellEl(tree, el) ? tree.parentOf(el) as VertexEl : isTableRowEl(tree, el) ? el : rows[0];
  const cells = tree.children(row).filter((c): c is VertexEl => c.type === 'vertex');
  if (cells.length <= 1) return { inserted: [], removed: removeWithDescendants(slide, tree, [table]), changed: [] };
  const index = isTableCellEl(tree, el) ? cells.indexOf(el) : cells.length - 1;
  let width = 0;
  const doomed: VertexEl[] = [];
  for (const r of rows) {
    const child = tree.children(r).filter((c): c is VertexEl => c.type === 'vertex')[index];
    if (!child) continue;
    doomed.push(child);
    width = Math.max(width, child.w);
  }
  const removed = removeWithDescendants(slide, tree, doomed);
  const live = elementById(slide, table.id) as VertexEl;
  live.w = Math.max(live.w - width, 0.01);
  const changed = layoutTable(slide, table.id);
  return { inserted: [], removed, changed: [...changed] };
}

// --- the layout manager: after every change -----------------------------------------------

interface Snapshot {
  x: number;
  y: number;
  w: number;
  h: number;
  dio: string;
  parent: string | null;
  hidden: boolean;
}

function snapshot(el: VertexEl, parent: VertexEl | null): Snapshot {
  // Rows and cells are compared relative to their parent, so moving a table moves nothing
  return {
    x: parent ? el.x - parent.x : 0,
    y: parent ? el.y - parent.y : 0,
    w: el.w,
    h: el.h,
    dio: el.dio,
    parent: el.parent,
    hidden: Boolean(el.hidden),
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return close(a.x, b.x) && close(a.y, b.y) && close(a.w, b.w) && close(a.h, b.h)
    && a.dio === b.dio && a.parent === b.parent && a.hidden === b.hidden;
}

/** The table subtree of every table on a slide, as snapshots by element id. */
function tableSnapshots(slide: SlideLike, tree: DiagramTree): Map<string, { table: string; role: 'table' | 'row' | 'cell'; snap: Snapshot }> {
  const out = new Map<string, { table: string; role: 'table' | 'row' | 'cell'; snap: Snapshot }>();
  for (const el of slide.elements) {
    if (!isTableEl(el)) continue;
    out.set(el.id, { table: el.id, role: 'table', snap: snapshot(el, null) });
    for (const row of tree.children(el)) {
      if (row.type !== 'vertex') continue;
      out.set(row.id, { table: el.id, role: 'row', snap: snapshot(row, el) });
      for (const cell of tree.children(row)) {
        if (cell.type !== 'vertex') continue;
        out.set(cell.id, { table: el.id, role: 'cell', snap: snapshot(cell, row) });
      }
    }
  }
  return out;
}

/**
 * Lays out the tables of `slide` that changed since `before` (or every
 * table, without `before`), in place on `slide`'s elements. A table that
 * was resized is laid out; otherwise a row or cell resized on its own
 * acts as draw.io's handles do: a taller row makes the table taller
 * (Graph.setTableRowHeight), a wider cell widens its column and narrows the
 * next one (Graph.setTableColumnWidth; the last column widens the table).
 * Returns the ids of the elements that changed.
 */
export function layoutChangedTables(slide: SlideLike, before: SlideLike | null): Set<string> {
  const changed = new Set<string>();
  if (!mayHoldTable(slide)) return changed;
  const tree = new DiagramTree(slide);
  const now = tableSnapshots(slide, tree);
  const then = before && mayHoldTable(before) ? tableSnapshots(before, new DiagramTree(before)) : new Map();
  // Which tables changed, and how
  const dirty = new Map<string, Array<{ id: string; role: 'table' | 'row' | 'cell'; prev: Snapshot | null; next: Snapshot }>>();
  for (const [id, entry] of now) {
    const prev = then.get(id);
    if (before && prev && prev.table === entry.table && sameSnapshot(prev.snap, entry.snap)) continue;
    const list = dirty.get(entry.table) ?? [];
    list.push({ id, role: entry.role, prev: before && prev && prev.table === entry.table ? prev.snap : null, next: entry.snap });
    dirty.set(entry.table, list);
  }
  // A row or cell that left a table changes that table too
  for (const [id, entry] of then) {
    if (!now.has(id) || now.get(id)!.table !== entry.table) {
      if (now.has(entry.table) && !dirty.has(entry.table)) dirty.set(entry.table, []);
    }
  }
  for (const [tableId, changes] of dirty) {
    const t = new DiagramTree(slide);
    const table = t.vertex(tableId);
    if (!table) continue;
    const work = new TableWork(t, table);
    const s = table.scale || 1;
    const tableChange = changes.find((c) => c.role === 'table');
    // A new or resized table is laid out as it is
    const tableResized = tableChange != null && (tableChange.prev == null
      || Math.abs(tableChange.prev.w - tableChange.next.w) > 1e-6 || Math.abs(tableChange.prev.h - tableChange.next.h) > 1e-6);
    const handled = new Set<string>();
    if (!tableResized) {
      // A row taller or shorter on its own: the row handle (extends the table)
      for (const c of changes) {
        if (c.role !== 'row' || !c.prev) continue;
        const dh = (c.next.h - c.prev.h) / s;
        if (Math.abs(dh) < 1e-6) continue;
        const row = t.vertex(c.id)!;
        const geo = work.geo(row);
        work.setGeo(row, { ...geo, y: geo.y - (c.next.y - c.prev.y) / s, height: c.prev.h / s });
        work.setRowHeight(row, dh, true);
        handled.add(row.id);
      }
      // A cell resized on its own: the column handle (the next column gives the room)
      // and, for its height, the row handle
      const columns = new Set<number>();
      const rows = new Set<string>();
      if (handled.size === 0) {
        for (const c of changes) {
          if (c.role !== 'cell' || !c.prev) continue;
          const cell = t.vertex(c.id)!;
          const row = t.parentOf(cell) as VertexEl;
          const cells = work.cells(row);
          const index = cells.indexOf(cell);
          const dw = (c.next.w - c.prev.w) / s;
          const dxLeft = (c.next.x - c.prev.x) / s;
          const dh = (c.next.h - c.prev.h) / s;
          if (Math.abs(dw) > 1e-6 && !columns.has(index)) {
            columns.add(index);
            const geo = work.geo(cell);
            work.setGeo(cell, { ...geo, x: geo.x - dxLeft, width: c.prev.w / s });
            if (Math.abs(dxLeft) > 1e-6 && index > 0) work.setColumnWidth(cells[index - 1], dxLeft, false);
            else work.setColumnWidth(cell, dw, false);
          }
          if (Math.abs(dh) > 1e-6 && !rows.has(row.id)) {
            rows.add(row.id);
            work.setRowHeight(row, dh, true);
          }
        }
      }
    }
    work.execute();
    for (const id of work.writeBack()) changed.add(id);
  }
  return changed;
}

/**
 * `next` with the tables laid out that changed since `previous` (draw.io's
 * layout manager): slides that are the same object in `previous` are
 * skipped and changed objects are copies, so `next` and `previous` are not
 * touched. Returns `next` itself when no table changed.
 */
export function withTableLayout(previous: Deck | null, next: Deck): Deck {
  const before = new Map((previous?.slides ?? []).map((s) => [s.id, s]));
  let any = false;
  const slides = next.slides.map((slide) => {
    const old = before.get(slide.id);
    if (old === slide || !mayHoldTable(slide)) return slide;
    // Copies of the table elements (any of them may change), the rest shared
    const tree = new DiagramTree(slide);
    const inTables = new Set<string>();
    for (const el of slide.elements) {
      if (!isTableEl(el)) continue;
      inTables.add(el.id);
      for (const d of tree.descendants(el)) inTables.add(d.id);
    }
    const draft = { ...slide, elements: slide.elements.map((el) => (inTables.has(el.id) ? structuredClone(el) : el)) };
    const changed = layoutChangedTables(draft, old ?? null);
    if (changed.size === 0) return slide;
    any = true;
    return { ...slide, elements: draft.elements.map((el, i) => (changed.has(el.id) ? el : slide.elements[i])) };
  });
  return any ? { ...next, slides } : next;
}

// --- painting: what the table shape needs from its rows and cells ---------------------------

/**
 * What TableShape.paintForeground paints over a `shape=table`: the row and
 * column lines (Graph.getTableLines, honouring rowLines and columnLines),
 * in the table's draw.io units relative to its top-left corner. Null for a
 * cell that is not such a table, or a table without lines.
 */
export function tableForeground(slide: SlideLike, el: SlideElement, tree = new DiagramTree(slide)): Array<Array<Point | null>> | null {
  if (!isTableEl(el)) return null;
  const style = styleOf(el);
  if (style.shape !== 'table' || el.collapsed) return null;
  const work = new TableWork(tree, el);
  const lines = work.lines(isOne(style, 'rowLines', 1), isOne(style, 'columnLines', 1));
  return lines.length > 0 ? lines : null;
}

/** Graph.isCollapsedTable: a `shape=table` with tableRender=collapsed. */
function isCollapsedTable(el: SlideElement | null | undefined): el is VertexEl {
  if (!isTableEl(el)) return false;
  const style = styleOf(el);
  return style.tableRender === 'collapsed' && style.shape === 'table';
}

/**
 * Graph.isCollapsedTableChildShape: the rectangular rows and cells of a
 * collapsed table, whose fills and borders the table paints.
 */
function isCollapsedChildShape(style: Style): boolean {
  const shape = style.shape;
  return shape === 'tableRow' || shape === 'partialRectangle'
    || ((shape == null || shape === 'rectangle' || shape === 'swimlane') && !isOne(style, 'rounded'));
}

/** What a table, row or cell needs from the rest of its table to be painted as draw.io paints it. */
export interface TablePaint {
  /** The parent's colours, for `strokeColor=inherit` and the like: paintVertex's `parentStyle`. */
  parentStyle: Style | null;
  /**
   * A row or cell of a collapsed table (tableRender=collapsed): the table
   * paints its border, so its shape paints its fill only (see tableShapeStyle).
   */
  noStroke?: boolean;
  /** A table: its grid lines, painted over its shape (paintTableExtras). */
  lines?: Array<Array<Point | null>>;
  /** The table: its line style, for the lines. */
  lineStyle?: Style;
  /**
   * A filled cell: the grid lines along its sides, painted again over its
   * fill (Graph.paintTableCellLines), in the cell's draw.io units.
   */
  sides?: { top: boolean; bottom: boolean; left: boolean; right: boolean; stroke: string; strokeWidth: number; width: number; height: number };
}

/**
 * The table context of a cell, for drawing it: null for a cell that is no
 * table, row or cell and has no parent colours to inherit. draw.io paints
 * a collapsed table's borders over all its fills (TableShape.
 * paintCollapsedTable); here the table paints its grid under its rows and
 * cells, which do not stroke themselves, and a filled cell paints the
 * lines along its sides again — the same picture for tables whose cells
 * share the table's line, and draw.io's own way for separate tables.
 */
export function tablePaint(slide: SlideLike, el: SlideElement, tree = new DiagramTree(slide)): TablePaint | null {
  if (el.type !== 'vertex') return null;
  const parentStyle = cellParentStyle(slide, el, tree);
  const style = styleOf(el);
  const result: TablePaint = { parentStyle };
  let table = false;
  if (isTableEl(el)) {
    const lines = tableForeground(slide, el, tree);
    if (lines) {
      result.lines = lines;
      result.lineStyle = style;
      table = true;
    }
  }
  const row = isTableRowEl(tree, el) ? el : isTableCellEl(tree, el) ? tree.parentOf(el) as VertexEl : null;
  const owner = row ? tree.parentOf(row) as VertexEl : null;
  if (row && owner) {
    table = true;
    const collapsed = isCollapsedTable(owner);
    if (collapsed && isCollapsedChildShape(style)) result.noStroke = true;
    // Graph.paintTableCellLines for a filled cell (rows fill only their title, which tables rarely have)
    const resolve = (key: string): string | null => {
      const value = style[key];
      if (value === 'inherit') return parentStyle?.[key] ?? null;
      if (value === 'parentStrokeColor') return parentStyle?.strokeColor ?? null;
      if (value === 'parentFillColor') return parentStyle?.fillColor ?? null;
      return value ?? null;
    };
    const fill = resolve('fillColor');
    const stroke = resolve('strokeColor');
    const cellShape = style.shape === 'partialRectangle' || style.shape === 'swimlane' || style.shape === 'table' || style.shape === 'tableRow';
    if (el !== row && fill && fill !== 'none' && stroke && stroke !== 'none' && (cellShape || result.noStroke)) {
      const ownerStyle = styleOf(owner);
      const rowLines = isOne(ownerStyle, 'rowLines', 1);
      const columnLines = isOne(ownerStyle, 'columnLines', 1);
      const rows = tree.children(owner).filter((c) => c.type === 'vertex');
      const cols = tree.children(row).filter((c) => c.type === 'vertex');
      const rowIndex = rows.indexOf(row);
      const colIndex = cols.indexOf(el);
      // A collapsed table paints its outline over the fills as well
      const edge = result.noStroke === true;
      const sides = {
        top: rowIndex > 0 ? rowLines : edge,
        bottom: rowIndex < rows.length - 1 ? rowLines : edge,
        left: colIndex > 0 ? columnLines : edge,
        right: colIndex < cols.length - 1 ? columnLines : edge,
      };
      if (sides.top || sides.bottom || sides.left || sides.right) {
        result.sides = {
          ...sides, stroke, strokeWidth: Number(style.strokeWidth ?? 1) || 1, width: el.w / el.scale, height: el.h / el.scale,
        };
      }
    }
  }
  return table || parentStyle != null ? result : null;
}

/** The style a table cell's shape paints with: without its line when the table paints it. */
export function tableShapeStyle(style: Style, paint: TablePaint | null | undefined): Style {
  return paint?.noStroke ? { ...style, strokeColor: 'none' } : style;
}

/**
 * What a table cell paints after its shape (vertexMarkup, after
 * paintVertex): a table's grid lines, a filled cell's lines again.
 */
export function paintTableExtras(c: SvgCanvas, paint: TablePaint | null | undefined): void {
  if (!paint) return;
  if (paint.lines && paint.lineStyle) paintTableForeground(c, paint.lineStyle, paint.lines);
  const sides = paint.sides;
  if (sides) {
    // Graph.paintTableCellLines
    c.save();
    c.setStrokeColor(sides.stroke);
    c.setStrokeWidth(sides.strokeWidth);
    c.setDashed(false);
    c.setShadow(false);
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      c.begin();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    const { width: w, height: h } = sides;
    if (sides.top) line(0, 0, w, 0);
    if (sides.bottom) line(0, h, w, h);
    if (sides.left) line(0, 0, 0, h);
    if (sides.right) line(w, 0, w, h);
    c.restore();
  }
}

/**
 * TableShape.paintTableForeground: strokes the lines with the table's line
 * (colour, width, dashes, opacity), in a canvas set up as for painting the
 * table's shape at (x, y) in draw.io units (vertexMarkup: x = y = 0).
 */
export function paintTableForeground(c: SvgCanvas, style: Style, lines: ReadonlyArray<ReadonlyArray<Point | null>>, x = 0, y = 0): void {
  const stroke = style.strokeColor;
  if (stroke == null || stroke === 'none') return;
  c.save();
  c.setAlpha(Number(style.opacity ?? 100) / 100);
  c.setStrokeAlpha(Number(style.strokeOpacity ?? 100) / 100);
  c.setStrokeColor(stroke);
  c.setStrokeWidth(Number(style.strokeWidth ?? 1) || 1);
  const dashed = isOne(style, 'dashed');
  c.setDashed(dashed, isOne(style, 'fixDash'));
  if (dashed && style.dashPattern != null && !isNumeric(style.dashPattern)) c.setDashPattern(style.dashPattern);
  for (const line of lines) {
    // TableLineShape.paintTableLine
    let last: Point | null = null;
    c.begin();
    for (const curr of line) {
      if (curr != null) {
        if (last == null) c.moveTo(curr.x + x, curr.y + y);
        else c.lineTo(curr.x + x, curr.y + y);
      }
      last = curr;
    }
    c.end();
    c.stroke();
  }
  c.restore();
}

/**
 * The parent's style as mxCellRenderer.resolveColor reads it for a cell
 * whose colours name their parent (`inherit`, `parentStrokeColor`,
 * `parentFillColor`; table rows and cells use `strokeColor=inherit`): the
 * parent's own style with its colours resolved the same way up the tree.
 * Pass it to paintVertex as `parentStyle`. Null for a cell on a layer.
 */
export function cellParentStyle(slide: SlideLike, el: SlideElement, tree = new DiagramTree(slide)): Style | null {
  if (!isCell(el)) return null;
  const parent = tree.parentOf(el);
  if (!parent || parent.type !== 'vertex') return null;
  return resolvedColors(tree, parent, 0);
}

function resolvedColors(tree: DiagramTree, el: VertexEl, depth: number): Style {
  const style = styleOf(el);
  const needs = (v: string | undefined) => v === 'inherit' || v === 'parentStrokeColor' || v === 'parentFillColor';
  if (!needs(style.strokeColor) && !needs(style.fillColor) && !needs(style.fontColor)) return style;
  const parent = depth < 50 ? tree.parentOf(el) : null;
  const up = parent?.type === 'vertex' ? resolvedColors(tree, parent, depth + 1) : null;
  for (const key of ['strokeColor', 'fillColor', 'fontColor']) {
    const value = style[key];
    if (!needs(value)) continue;
    const from = value === 'inherit' ? key : value === 'parentStrokeColor' ? 'strokeColor' : 'fillColor';
    const resolved = up?.[from];
    if (resolved == null || resolved === 'none') delete style[key];
    else style[key] = resolved;
  }
  return style;
}
