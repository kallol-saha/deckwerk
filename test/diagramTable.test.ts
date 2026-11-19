import { describe, expect, it } from 'vitest';
import type { Deck, Slide, VertexEl } from '../src/shared/deck.js';
import { pageToElements } from '../src/shared/diagram/convert.js';
import { DiagramTree } from '../src/shared/diagram/structure.js';
import {
  deleteTableColumn, deleteTableRow, insertTableColumn, insertTableRow, isTableCellEl, isTableRowEl, layoutTable,
  setTableColumnWidth, setTableRowHeight, tablePaint, withTableLayout,
} from '../src/shared/diagram/table.js';
import { loadDrawioFixture } from './support/drawioReference.js';

/**
 * draw.io tables (test/fixtures/drawio/tables.drawio): the table layout,
 * draw.io's row and column handles, inserting and deleting rows and
 * columns, and what painting needs from the table. Expected numbers follow
 * Graph.js TableLayout, setTableRowHeight and setTableColumnWidth.
 */

let n = 0;
const makeId = (prefix: string) => `${prefix}-t${++n}`;

async function slideFor(page: number, scale = 1, origin = { x: 0, y: 0 }): Promise<Slide> {
  const fixture = await loadDrawioFixture('tables');
  const { elements, meta } = pageToElements(fixture.document.pages[page], { diagramId: 'd', placement: { origin, scale }, makeId });
  return { id: 's', name: '', background: { color: null, image: null }, notes: '', elements, timeline: [], diagrams: { d: meta } } as unknown as Slide;
}

const byCell = (slide: Slide, cell: string) => slide.elements.find((e) => e.type === 'vertex' && e.cell === cell) as VertexEl;
/** A cell's box relative to its parent, in draw.io units. */
function geo(slide: Slide, cell: string): [number, number, number, number] {
  const el = byCell(slide, cell);
  const tree = new DiagramTree(slide);
  const parent = tree.parentOf(el);
  const s = el.scale;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r((el.x - (parent?.x ?? el.origin.x)) / s), r((el.y - (parent?.y ?? el.origin.y)) / s), r(el.w / s), r(el.h / s)];
}

describe('draw.io tables', () => {
  it('recognises tables, rows and cells', async () => {
    const slide = await slideFor(0);
    const tree = new DiagramTree(slide);
    expect(isTableRowEl(tree, byCell(slide, 't1-r0'))).toBe(true);
    expect(isTableCellEl(tree, byCell(slide, 't1-r0c1'))).toBe(true);
    expect(isTableCellEl(tree, byCell(slide, 't1-r0'))).toBe(false);
  });

  it('a laid-out table stays as it is (only alternate bounds are added)', async () => {
    const slide = await slideFor(1, 1.5, { x: 37, y: 11 });
    const before = ['s1', 's1-r1', 's1-r2c2', 's2', 's2-r1c1', 's3-r1c0'].map((c) => geo(slide, c));
    layoutTable(slide, byCell(slide, 's1').id);
    layoutTable(slide, byCell(slide, 's2').id);
    layoutTable(slide, byCell(slide, 's3').id);
    expect(['s1', 's1-r1', 's1-r2c2', 's2', 's2-r1c1', 's3-r1c0'].map((c) => geo(slide, c))).toEqual(before);
    // The merged cell keeps its width over two columns, the covered cell stays hidden
    expect(geo(slide, 's3-r1c0')[2]).toBe(120);
    expect(byCell(slide, 's3-r1c1').hidden).toBe(true);
    expect(byCell(slide, 's1-r0c0').alternateBounds).toEqual({ x: 0, y: 0, w: 60, h: 40 });
  });

  it('resizing the table scales rows and columns (TableLayout.execute)', async () => {
    const slide = await slideFor(1);
    const table = byCell(slide, 's2');
    table.w = 360; // columns 50/130/80 of 260
    table.h = 260; // rows 30/60/40 of 130
    layoutTable(slide, table.id);
    // Column positions: round(50*360/260)=69, round(180*360/260)=249, 360
    expect(geo(slide, 's2-r0c0')).toEqual([0, 0, 69, 60]);
    expect(geo(slide, 's2-r0c1')).toEqual([69, 0, 180, 60]);
    expect(geo(slide, 's2-r2c2')).toEqual([249, 0, 111, 80]);
    expect(geo(slide, 's2-r1')).toEqual([0, 60, 360, 120]);
    expect(geo(slide, 's2-r2')).toEqual([0, 180, 360, 80]);
  });

  it('grows a table that is too small for its title (minimum row and column)', async () => {
    const slide = await slideFor(0);
    const table = byCell(slide, 't3');
    table.h = 10;
    layoutTable(slide, table.id);
    expect(geo(slide, 't3')[3]).toBe(50); // startSize 30 + Graph.minTableRowHeight
  });

  it('Graph.setTableRowHeight: the row grows and the table with it', async () => {
    const slide = await slideFor(1);
    setTableRowHeight(slide, byCell(slide, 's1-r0c1').id, 20);
    expect(geo(slide, 's1')).toEqual([20, 20, 180, 140]);
    expect(geo(slide, 's1-r0')).toEqual([0, 0, 180, 60]);
    expect(geo(slide, 's1-r1')).toEqual([0, 60, 180, 40]);
    expect(geo(slide, 's1-r0c2')).toEqual([120, 0, 60, 60]);
  });

  it('Graph.setTableColumnWidth: the column grows, the next one gives the room', async () => {
    const slide = await slideFor(1);
    setTableColumnWidth(slide, byCell(slide, 's1-r2c0').id, 30);
    expect(geo(slide, 's1')[2]).toBe(180);
    expect(geo(slide, 's1-r0c0')).toEqual([0, 0, 90, 40]);
    expect(geo(slide, 's1-r1c1')).toEqual([90, 0, 30, 40]);
    expect(geo(slide, 's1-r2c2')).toEqual([120, 0, 60, 40]);
    // The last column widens the table
    setTableColumnWidth(slide, byCell(slide, 's1-r0c2').id, 40);
    expect(geo(slide, 's1')[2]).toBe(220);
    expect(geo(slide, 's1-r1c2')).toEqual([120, 0, 100, 40]);
  });

  it('inserts and deletes rows and columns (Graph.insertTableRow/Column, deleteTableRow/Column)', async () => {
    const slide = await slideFor(1, 2);
    const cell = byCell(slide, 's1-r1c1');
    const row = insertTableRow(slide, cell.id, false, makeId);
    expect(row.inserted).toHaveLength(4);
    let tree = new DiagramTree(slide);
    const table = byCell(slide, 's1');
    let rows = tree.children(table);
    expect(rows.map((r) => r.cell).slice(0, 2)).toEqual(['s1-r0', 's1-r1']);
    expect(rows).toHaveLength(4);
    expect(geo(slide, 's1')[3]).toBe(160);
    expect(geo(slide, rows[2].cell)).toEqual([0, 80, 180, 40]);
    expect(geo(slide, 's1-r2')).toEqual([0, 120, 180, 40]);
    const newCells = tree.children(rows[2] as VertexEl);
    expect(newCells.map((c) => (c as VertexEl).label)).toEqual(['', '', '']);

    const col = insertTableColumn(slide, cell.id, true, makeId);
    expect(col.inserted).toHaveLength(4);
    tree = new DiagramTree(slide);
    expect(geo(slide, 's1')[2]).toBe(240);
    const r1 = tree.children(byCell(slide, 's1-r1')).map((c) => c.cell);
    expect(r1[0]).toBe('s1-r1c0');
    expect(r1[2]).toBe('s1-r1c1');
    expect(geo(slide, 's1-r1c1')).toEqual([120, 0, 60, 40]);

    deleteTableColumn(slide, byCell(slide, 's1-r1c1').id);
    expect(geo(slide, 's1')[2]).toBe(180);
    expect(slide.elements.some((e) => e.type === 'vertex' && e.cell === 's1-r1c1')).toBe(false);
    deleteTableRow(slide, byCell(slide, 's1-r0c0').id);
    tree = new DiagramTree(slide);
    rows = tree.children(byCell(slide, 's1'));
    expect(rows).toHaveLength(3);
    expect(geo(slide, 's1')[3]).toBe(120);
    expect(geo(slide, 's1-r1')).toEqual([0, 0, 180, 40]);
  });

  it('deleting the last row deletes the table', async () => {
    const slide = await slideFor(1);
    for (const r of ['s1-r0c0', 's1-r1c0']) deleteTableRow(slide, byCell(slide, r).id);
    const edit = deleteTableRow(slide, byCell(slide, 's1-r2c0').id);
    expect(edit.removed).toContain(byCell({ ...slide, elements: [] } as Slide, 's1')?.id ?? edit.removed[0]);
    expect(slide.elements.some((e) => e.type === 'vertex' && e.cell.startsWith('s1'))).toBe(false);
  });

  it('withTableLayout: a row or cell resized on its own acts as draw.io\'s handles', async () => {
    const slide = await slideFor(1);
    const deck = { slides: [slide] } as unknown as Deck;
    // A cell made 20 wider (right edge dragged): its column widens, the next narrows
    const wider = structuredClone(slide);
    byCell(wider, 's1-r1c0').w += 20;
    const laid = withTableLayout(deck, { slides: [wider] } as unknown as Deck).slides[0];
    expect(geo(laid, 's1-r0c0')).toEqual([0, 0, 80, 40]);
    expect(geo(laid, 's1-r2c1')).toEqual([80, 0, 40, 40]);
    expect(geo(laid, 's1')[2]).toBe(180);
    // The input is not changed
    expect(geo(wider, 's1-r0c0')).toEqual([0, 0, 60, 40]);
    // A row made 30 taller: the table grows
    const taller = structuredClone(slide);
    byCell(taller, 's1-r1').h += 30;
    const grown = withTableLayout(deck, { slides: [taller] } as unknown as Deck).slides[0];
    expect(geo(grown, 's1')[3]).toBe(150);
    expect(geo(grown, 's1-r2')).toEqual([0, 110, 180, 40]);
    expect(geo(grown, 's1-r1c2')).toEqual([120, 0, 60, 70]);
    // Moving the table changes nothing else
    const moved = structuredClone(slide);
    const tree = new DiagramTree(moved);
    const t = byCell(moved, 's1');
    for (const el of [t, ...tree.descendants(t)]) { el.x += 15; el.y += 5; }
    const next = { slides: [moved] } as unknown as Deck;
    expect(withTableLayout(deck, next)).toBe(next);
  });

  it('paints the grid like draw.io: lines from the table, inherited strokes, collapsed children', async () => {
    const separate = await slideFor(1);
    const tree = new DiagramTree(separate);
    const lines = tablePaint(separate, byCell(separate, 's3'), tree)!.lines!;
    // Two horizontal lines (the second broken by nothing), two vertical; the merged cell breaks the first vertical line
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContainEqual(null);
    expect(tablePaint(separate, byCell(separate, 's1-r0c0'), tree)!.parentStyle!.strokeColor).toBe('#000000');
    const collapsed = await slideFor(0);
    const t2 = new DiagramTree(collapsed);
    expect(tablePaint(collapsed, byCell(collapsed, 't1-r0c0'), t2)!.noStroke).toBe(true);
    expect(tablePaint(collapsed, byCell(collapsed, 't2'), t2)?.lines).toBeUndefined();
    const filled = await slideFor(2);
    const sides = tablePaint(filled, byCell(filled, 'f2-r0c1'), new DiagramTree(filled))!.sides!;
    expect([sides.top, sides.bottom, sides.left, sides.right]).toEqual([true, true, true, true]);
  });
});
