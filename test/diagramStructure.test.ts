import { describe, expect, it } from 'vitest';
import type { ConnectorEl, Deck, Slide, SlideElement, VertexEl } from '../src/shared/deck.js';
import { elementsToPage, pageToElements } from '../src/shared/diagram/convert.js';
import { readDrawio, writeDrawio } from '../src/shared/diagram/drawioFile.js';
import type { DiagramCell, DiagramPage } from '../src/shared/diagram/model.js';
import { withRoutedConnectors } from '../src/shared/diagram/reroute.js';
import {
  DiagramTree, addLayer, deleteLayer, foldingIconRect, groupCells, isCellSelectable, isFoldable,
  layerForCells, moveCellsToLayer, moveLayer, paintOrder, preferredSize, renameLayer, reparent,
  selectableLayerCells, setCollapsed, setLayerHidden, setLayerLocked, ungroupCells,
} from '../src/shared/diagram/structure.js';

/**
 * Groups, containers, swimlanes, folding and layers, against draw.io.
 *
 * The expected numbers come from draw.io 32.7.4 itself: the same models
 * were loaded into draw.io's Graph (js/app.min.js, in Electron) and put
 * through graph.groupCells, ungroupCells (with the `ungroup` action's
 * container flag), foldCells, resizeCell(…, recurse) and moveCells into a
 * container; the resulting geometry is written below as draw.io left it
 * (parent-relative, as in the file).
 */

let counter = 0;
const makeId = (prefix: string) => `${prefix}-t${++counter}`;

function v(id: string, parent: string, style: string, x: number, y: number, w: number, h: number, value = '', extra = ''): string {
  return `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"${extra}>`
    + `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}

function e(id: string, parent: string, source: string | null, target: string | null, points: Array<[number, number]> = [], extraGeo = ''): string {
  const pts = points.map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
  return `<mxCell id="${id}" style="endArrow=classic;html=1;" edge="1" parent="${parent}"`
    + `${source ? ` source="${source}"` : ''}${target ? ` target="${target}"` : ''}>`
    + `<mxGeometry relative="1" as="geometry">${pts ? `<Array as="points">${pts}</Array>` : ''}${extraGeo}</mxGeometry></mxCell>`;
}

async function slideOf(cells: string, placement = { origin: { x: 0, y: 0 }, scale: 1 }, layers = '<mxCell id="1" parent="0"/>'): Promise<Slide> {
  const xml = '<mxfile><diagram id="p" name="P"><mxGraphModel grid="1" gridSize="10" fold="1"><root><mxCell id="0"/>'
    + `${layers}${cells}</root></mxGraphModel></diagram></mxfile>`;
  const doc = await readDrawio(xml);
  const { elements, meta } = pageToElements(doc.pages[0], { diagramId: 'd', placement, makeId });
  return {
    id: 's', name: '', background: { color: null, image: null }, notes: '',
    elements, timeline: [], diagrams: { d: meta },
  } as Slide;
}

const deckOf = (slide: Slide) => ({ version: 1, title: '', canvas: { w: 1920, h: 1080 }, slides: [slide] }) as unknown as Deck;

/** An editor commit: the change, then the after-commit rules with the slide before it. */
function commit(slide: Slide, change: (draft: Slide) => void): Slide {
  const draft = structuredClone(slide);
  change(draft);
  return withRoutedConnectors(deckOf(slide), deckOf(draft)).slides[0];
}

const byCell = (slide: Slide, cell: string) => slide.elements.find((el) => (el.type === 'vertex' || el.type === 'connector') && el.cell === cell) as VertexEl | ConnectorEl;
const vertex = (slide: Slide, cell: string) => byCell(slide, cell) as VertexEl;
const connector = (slide: Slide, cell: string) => byCell(slide, cell) as ConnectorEl;
const page = (slide: Slide) => elementsToPage(slide, 'd');
const pageCell = (p: DiagramPage, id: string) => p.cells.find((c) => c.id === id) as DiagramCell;
const geo = (p: DiagramPage, id: string) => {
  const g = pageCell(p, id).geometry!;
  return [g.x, g.y, g.width, g.height];
};
const order = (slide: Slide) => paintOrder(slide.elements).map((el) => (el as VertexEl).cell);

const GROUP_MODEL = v('a', '1', 'rounded=0;whiteSpace=wrap;html=1;', 40, 40, 80, 40, 'A')
  + v('x', '1', 'rounded=0;whiteSpace=wrap;html=1;', 600, 300, 80, 40, 'X')
  + v('b', '1', 'ellipse;whiteSpace=wrap;html=1;', 200, 100, 80, 40, 'B')
  + v('c', '1', 'rounded=0;whiteSpace=wrap;html=1;', 400, 40, 80, 40, 'C')
  + e('ab', '1', 'a', 'b', [[160, 60]])
  + e('bc', '1', 'b', 'c')
  + e('loose', '1', null, null, [[100, 230]], '<mxPoint x="30" y="200" as="sourcePoint"/><mxPoint x="150" y="260" as="targetPoint"/>');

describe('Ctrl+G groups cells as draw.io does', () => {
  it('makes a group around them, moves the connectors between them in, and stacks it like draw.io', async () => {
    const slide = await slideOf(GROUP_MODEL);
    const group = groupCells(slide, ['a', 'b', 'loose'].map((c) => byCell(slide, c).id), makeId)!;
    expect(group).not.toBeNull();
    expect(group.dio).toBe('group');
    expect(group.connectable).toBe(false);
    const p = page(slide);
    // draw.io: group (30,40,250,220); a (10,0), b (170,60); loose and ab moved in; bc stays.
    expect(geo(p, group.cell)).toEqual([30, 40, 250, 220]);
    expect(pageCell(p, group.cell).parent).toBe('1');
    expect(pageCell(p, 'a').parent).toBe(group.cell);
    expect(geo(p, 'a')).toEqual([10, 0, 80, 40]);
    expect(geo(p, 'b')).toEqual([170, 60, 80, 40]);
    expect(pageCell(p, 'loose').parent).toBe(group.cell);
    expect(pageCell(p, 'loose').geometry!.points).toEqual([{ x: 70, y: 190 }]);
    expect(pageCell(p, 'loose').geometry!.sourcePoint).toEqual({ x: 0, y: 160 });
    expect(pageCell(p, 'ab').parent).toBe(group.cell);
    expect(pageCell(p, 'ab').geometry!.points).toEqual([{ x: 130, y: 20 }]);
    expect(pageCell(p, 'bc').parent).toBe('1');
    // draw.io's model order after grouping: x, c, bc, group, a, b, loose, ab.
    expect(order(slide)).toEqual(['x', 'c', 'bc', group.cell, 'a', 'b', 'loose', 'ab']);
    // Nothing moved on the slide.
    const fresh = await slideOf(GROUP_MODEL);
    for (const cell of ['a', 'b', 'c', 'x']) expect(vertex(slide, cell).x).toBe(vertex(fresh, cell).x);
  });

  it('round-trips through the .drawio file and back', async () => {
    const slide = await slideOf(GROUP_MODEL);
    const group = groupCells(slide, ['a', 'b'].map((c) => byCell(slide, c).id), makeId)!;
    const text = await writeDrawio({ attributes: {}, pages: [page(slide)] });
    const again = await readDrawio(text);
    const { elements } = pageToElements(again.pages[0], { diagramId: 'd', placement: { origin: { x: 0, y: 0 }, scale: 1 }, makeId });
    const read = (cell: string) => elements.find((el) => (el as VertexEl).cell === cell) as VertexEl;
    expect(read(group.cell).parent).toBe('1');
    expect(read('a').parent).toBe(group.cell);
    expect(read('ab').parent).toBe(group.cell);
    for (const cell of ['a', 'b', group.cell]) {
      const before = vertex(slide, cell);
      expect([read(cell).x, read(cell).y, read(cell).w, read(cell).h]).toEqual([before.x, before.y, before.w, before.h]);
    }
    // …and ungrouping gives back the page that was grouped.
    ungroupCells(slide, [group.id]);
    const original = await slideOf(GROUP_MODEL);
    const strip = (p: DiagramPage) => p.cells.map((c) => ({ id: c.id, parent: c.parent, geometry: c.geometry })).sort((a, b) => a.id.localeCompare(b.id));
    expect(strip(page(slide))).toEqual(strip(page(original)));
  });

  it('needs two cells with one parent', async () => {
    const slide = await slideOf(GROUP_MODEL);
    expect(groupCells(slide, [byCell(slide, 'a').id], makeId)).toBeNull();
  });

  it('works on a placed, scaled diagram', async () => {
    const placement = { origin: { x: 137, y: 61 }, scale: 1.5 };
    const slide = await slideOf(GROUP_MODEL, placement);
    const group = groupCells(slide, ['a', 'b', 'loose'].map((c) => byCell(slide, c).id), makeId)!;
    expect(geo(page(slide), group.cell).map((n) => Math.round(n * 1000) / 1000)).toEqual([30, 40, 250, 220]);
    expect(group.x).toBeCloseTo(137 + 30 * 1.5);
    expect(group.scale).toBe(1.5);
  });
});

const UNGROUP_MODEL = v('g', '1', 'group', 40, 40, 200, 100, '', ' connectable="0"')
  + v('g-a', 'g', 'rounded=0;whiteSpace=wrap;html=1;', 0, 0, 80, 40, 'GA')
  + v('g-b', 'g', 'rounded=0;whiteSpace=wrap;html=1;', 120, 60, 80, 40, 'GB')
  + e('g-e', 'g', 'g-a', 'g-b', [[100, 20]])
  + v('k', '1', 'rounded=0;whiteSpace=wrap;html=1;container=1;', 300, 40, 200, 160, 'K')
  + v('k-a', 'k', 'rounded=0;whiteSpace=wrap;html=1;', 20, 40, 80, 40, 'KA')
  + v('out', '1', 'rounded=0;whiteSpace=wrap;html=1;', 600, 40, 80, 40, 'Out')
  + e('g-out', '1', 'g', 'out');

describe('Ctrl+Shift+U ungroups as draw.io does', () => {
  it('removes an empty group with its connectors, keeps a container that draws something', async () => {
    const slide = await slideOf(UNGROUP_MODEL);
    const result = ungroupCells(slide, [vertex(slide, 'g').id, vertex(slide, 'k').id]);
    const ids = (cells: string[]) => cells.map((c) => byCell(slide, c).id);
    expect(result.ungrouped.sort()).toEqual(ids(['g-a', 'g-b', 'g-e', 'k-a']).sort());
    expect(byCell(slide, 'g')).toBeUndefined();
    expect(byCell(slide, 'g-out')).toBeUndefined();
    const p = page(slide);
    // draw.io: g-a (40,40), g-b (160,100), g-e on the layer with its point at (140,60), k-a at (320,80).
    expect(pageCell(p, 'g-a').parent).toBe('1');
    expect(geo(p, 'g-a')).toEqual([40, 40, 80, 40]);
    expect(geo(p, 'g-b')).toEqual([160, 100, 80, 40]);
    expect(pageCell(p, 'g-e').parent).toBe('1');
    expect(pageCell(p, 'g-e').geometry!.points).toEqual([{ x: 140, y: 60 }]);
    expect(pageCell(p, 'k-a').parent).toBe('1');
    expect(geo(p, 'k-a')).toEqual([320, 80, 80, 40]);
    expect(pageCell(p, 'k').style).toBe('rounded=0;whiteSpace=wrap;html=1;container=0;');
    expect(result.selection).toEqual(expect.arrayContaining([...ids(['g-a', 'g-b', 'g-e', 'k-a']), vertex(slide, 'k').id]));
  });
});

const RESIZE_MODEL = v('g', '1', 'group', 40, 40, 200, 100, '', ' connectable="0"')
  + v('g-a', 'g', 'rounded=0;whiteSpace=wrap;html=1;', 0, 0, 80, 40, 'GA')
  + v('g-b', 'g', 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;', 120, 60, 40, 40, 'GB')
  + e('g-e', 'g', 'g-a', 'g-b', [[100, 20]])
  + v('g-in', 'g', 'group', 100, 0, 100, 40, '', ' connectable="0"')
  + v('g-in-a', 'g-in', 'rounded=0;whiteSpace=wrap;html=1;', 50, 0, 50, 20, 'In')
  + v('k', '1', 'swimlane;whiteSpace=wrap;html=1;', 300, 40, 200, 160, 'K')
  + v('k-a', 'k', 'rounded=0;whiteSpace=wrap;html=1;', 20, 40, 80, 40, 'KA')
  + v('host', '1', 'group', 600, 40, 100, 60, '', ' connectable="0"')
  + '<mxCell id="port" value="" style="ellipse;html=1;" vertex="1" parent="host"><mxGeometry x="1" y="0.5" width="10" height="10" relative="1" as="geometry"><mxPoint x="-5" y="-5" as="offset"/></mxGeometry></mxCell>'
  + v('host-a', 'host', 'rounded=0;whiteSpace=wrap;html=1;', 10, 10, 40, 20, 'H');

const setBox = (el: SlideElement, x: number, y: number, w: number, h: number) => Object.assign(el, { x, y, w, h });

describe('resizing a group scales its contents; other containers keep theirs', () => {
  for (const placement of [{ origin: { x: 0, y: 0 }, scale: 1 }, { origin: { x: 137, y: 61 }, scale: 1.5 }]) {
    it(`matches draw.io's resizeCell with recurse (scale ${placement.scale})`, async () => {
      const slide = await slideOf(RESIZE_MODEL, placement);
      const at = (x: number, y: number, w: number, h: number) => [placement.origin.x + x * placement.scale, placement.origin.y + y * placement.scale, w * placement.scale, h * placement.scale] as const;
      const after = commit(slide, (draft) => {
        setBox(vertex(draft, 'g'), ...at(20, 30, 300, 150));
        setBox(vertex(draft, 'k'), ...at(280, 20, 260, 200));
        setBox(vertex(draft, 'host'), ...at(600, 40, 200, 90));
      });
      const p = page(after);
      const r = (box: number[]) => box.map((n) => Math.round(n * 1000) / 1000);
      // draw.io after graph.resizeCell(g, (20,30,300,150), true) and the others:
      expect(r(geo(p, 'g-a'))).toEqual([0, 0, 120, 60]);
      expect(r(geo(p, 'g-b'))).toEqual([180, 90, 60, 60]);
      expect(pageCell(p, 'g-e').geometry!.points!.map((q) => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000])).toEqual([[150, 30]]);
      expect(r(geo(p, 'g-in'))).toEqual([150, 0, 150, 60]);
      expect(r(geo(p, 'g-in-a'))).toEqual([75, 0, 75, 30]);
      // A swimlane is not resized recursively: its child keeps its place in it.
      expect(r(geo(p, 'k-a'))).toEqual([20, 40, 80, 40]);
      // A port stays at its fraction of its host; a child of the host scales.
      expect(r(geo(p, 'port'))).toEqual([1, 0.5, 10, 10]);
      expect(r(geo(p, 'host-a'))).toEqual([20, 15, 80, 30]);
      // The connector inside the group was routed again.
      expect(connector(after, 'g-e').route).not.toEqual(connector(slide, 'g-e').route);
    });
  }

  it('leaves a container with recursiveResize=0 alone on a right/bottom resize', async () => {
    const slide = await slideOf(v('k', '1', 'rounded=0;html=1;container=1;recursiveResize=0;', 40, 40, 200, 100, 'K')
      + v('k-a', 'k', 'rounded=0;html=1;', 20, 20, 40, 20, 'A'));
    const before = vertex(slide, 'k-a');
    const after = commit(slide, (draft) => setBox(vertex(draft, 'k'), 40, 40, 400, 300));
    expect(vertex(after, 'k-a')).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.h });
  });
});

describe('contents follow a moved container', () => {
  it('moves children, waypoints and loose ends with the container, once', async () => {
    const slide = await slideOf(UNGROUP_MODEL + e('k-loose', 'k', null, null, [[50, 120]], '<mxPoint x="10" y="100" as="sourcePoint"/><mxPoint x="190" y="150" as="targetPoint"/>'));
    const after = commit(slide, (draft) => {
      vertex(draft, 'g').x += 30;
      vertex(draft, 'g').y += 20;
      // g-b was selected and dragged along: it is not moved twice.
      vertex(draft, 'g-b').x += 30;
      vertex(draft, 'g-b').y += 20;
      vertex(draft, 'k').x -= 10;
    });
    expect(vertex(after, 'g-a').x).toBe(vertex(slide, 'g-a').x + 30);
    expect(vertex(after, 'g-a').y).toBe(vertex(slide, 'g-a').y + 20);
    expect(vertex(after, 'g-b').x).toBe(vertex(slide, 'g-b').x + 30);
    expect(connector(after, 'g-e').points).toEqual([{ x: 170, y: 80 }]);
    expect(vertex(after, 'k-a').x).toBe(vertex(slide, 'k-a').x - 10);
    const loose = connector(after, 'k-loose');
    expect(loose.points).toEqual([{ x: 340, y: 160 }]);
    expect(loose.sourcePoint).toEqual({ x: 300, y: 140 });
    expect(loose.targetPoint).toEqual({ x: 480, y: 190 });
    // The connector from the group re-routed to where the group is now.
    expect(connector(after, 'g-out').route[0].x).toBeGreaterThan(connector(slide, 'g-out').route[0].x);
    // In draw.io's frame the children did not move at all.
    expect(geo(page(after), 'g-a')).toEqual(geo(page(slide), 'g-a'));
    expect(geo(page(after), 'k-a')).toEqual(geo(page(slide), 'k-a'));
  });

  it('does not apply the rules to undo and agent paths (no deck before)', async () => {
    const slide = await slideOf(UNGROUP_MODEL);
    const draft = structuredClone(slide);
    vertex(draft, 'g').x += 30;
    const routed = withRoutedConnectors(null, deckOf(draft)).slides[0];
    expect(vertex(routed, 'g-a').x).toBe(vertex(slide, 'g-a').x);
  });
});

const FOLD_MODEL = v('lane', '1', 'swimlane;whiteSpace=wrap;html=1;startSize=30;', 320, 220, 220, 180, 'Lane')
  + v('lane-a', 'lane', 'rounded=0;whiteSpace=wrap;html=1;', 20, 50, 80, 40, 'LA')
  + v('box', '1', 'rounded=0;whiteSpace=wrap;html=1;container=1;verticalAlign=top;', 40, 220, 240, 160, 'Container')
  + v('box-a', 'box', 'rounded=0;whiteSpace=wrap;html=1;', 20, 40, 80, 40, 'BA')
  + v('empty', '1', 'rounded=0;whiteSpace=wrap;html=1;container=1;', 40, 440, 200, 120, '')
  + v('two', '1', 'swimlane;whiteSpace=wrap;html=1;', 300, 440, 200, 120, 'Two&lt;br&gt;lines here')
  + v('vert', '1', 'swimlane;horizontal=0;whiteSpace=wrap;html=1;', 560, 440, 200, 120, 'Vertical')
  + v('pool', '1', 'swimlane;whiteSpace=wrap;html=1;fontSize=16;', 600, 40, 300, 200, 'A much longer pool title')
  + v('plain', '1', 'rounded=0;whiteSpace=wrap;html=1;', 600, 300, 80, 40, 'P')
  + e('to-a', '1', 'plain', 'lane-a');

const FOLDED = ['lane', 'box', 'empty', 'two', 'vert', 'pool'];

describe('collapse and expand as draw.io does', () => {
  it('knows what folds (Graph.isCellFoldable)', async () => {
    const slide = await slideOf(FOLD_MODEL);
    for (const cell of FOLDED) expect(isFoldable(vertex(slide, cell), slide)).toBe(true);
    for (const cell of ['plain', 'lane-a']) expect(isFoldable(vertex(slide, cell), slide)).toBe(false);
    const off = structuredClone(slide);
    off.diagrams!.d.model.fold = '0';
    expect(isFoldable(vertex(off, 'lane'), off)).toBe(false);
  });

  it("collapses to draw.io's preferred size and expands back", async () => {
    const slide = await slideOf(FOLD_MODEL);
    // graph.getPreferredSizeForCell in draw.io.
    const preferred: Record<string, [number, number]> = {
      lane: [70, 30], box: [90, 30], empty: [50, 40], two: [100, 40], vert: [40, 70], pool: [220, 30],
    };
    for (const cell of FOLDED) {
      const size = preferredSize(vertex(slide, cell), slide);
      expect([cell, size.width, size.height]).toEqual([cell, ...preferred[cell]]);
    }
    const collapsed = commit(slide, (draft) => {
      for (const cell of FOLDED) expect(setCollapsed(draft, vertex(draft, cell).id, true)).toBe(true);
    });
    const p = page(collapsed);
    // draw.io after foldCells(true): the top-left corner stays, the old box is the alternate.
    const expected: Record<string, number[]> = {
      lane: [320, 220, 70, 30], box: [40, 220, 90, 30], empty: [40, 440, 50, 40],
      two: [300, 440, 100, 40], vert: [560, 440, 40, 70], pool: [600, 40, 220, 30],
    };
    const original: Record<string, number[]> = {
      lane: [320, 220, 220, 180], box: [40, 220, 240, 160], empty: [40, 440, 200, 120],
      two: [300, 440, 200, 120], vert: [560, 440, 200, 120], pool: [600, 40, 300, 200],
    };
    for (const cell of FOLDED) {
      expect([cell, ...geo(p, cell)]).toEqual([cell, ...expected[cell]]);
      expect(pageCell(p, cell).collapsed).toBe(true);
      const alt = pageCell(p, cell).geometry!.alternateBounds!;
      expect([cell, alt.x, alt.y, alt.width, alt.height]).toEqual([cell, ...original[cell]]);
    }
    // What is inside is not drawn; the children keep their place in draw.io's frame.
    expect(vertex(collapsed, 'lane-a').concealed).toBe(true);
    expect(vertex(collapsed, 'box-a').concealed).toBe(true);
    expect(geo(p, 'lane-a')).toEqual([20, 50, 80, 40]);
    // The connector to a cell inside goes to the collapsed lane (draw.io: (600,308.07) to (390,245.44)).
    const route = connector(collapsed, 'to-a').route;
    expect(route.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100])).toEqual([[600, 308.07], [390, 245.44]]);
    expect(connector(collapsed, 'to-a').concealed).toBeFalsy();

    const expanded = commit(collapsed, (draft) => {
      for (const cell of FOLDED) setCollapsed(draft, vertex(draft, cell).id, false);
    });
    const q = page(expanded);
    for (const cell of FOLDED) {
      expect([cell, ...geo(q, cell)]).toEqual([cell, ...original[cell]]);
      const alt = pageCell(q, cell).geometry!.alternateBounds!;
      expect([cell, alt.width, alt.height]).toEqual([cell, ...expected[cell].slice(2)]);
      expect(pageCell(q, cell).collapsed).toBe(false);
    }
    expect(vertex(expanded, 'lane-a').concealed).toBeFalsy();
    expect(vertex(expanded, 'lane-a').x).toBe(vertex(slide, 'lane-a').x);
    expect(connector(expanded, 'to-a').route).toEqual(connector(slide, 'to-a').route);
  });

  it('moves the contents with a collapsed container, and keeps them there when it opens', async () => {
    const slide = await slideOf(FOLD_MODEL);
    const collapsed = commit(slide, (draft) => setCollapsed(draft, vertex(draft, 'lane').id, true));
    const moved = commit(collapsed, (draft) => {
      vertex(draft, 'lane').x += 100;
    });
    expect(vertex(moved, 'lane-a').x).toBe(vertex(slide, 'lane-a').x + 100);
    const open = commit(moved, (draft) => setCollapsed(draft, vertex(draft, 'lane').id, false));
    expect(vertex(open, 'lane').w).toBe(220);
    expect(vertex(open, 'lane-a').x).toBe(vertex(slide, 'lane-a').x + 100);
    expect(vertex(open, 'lane-a').w).toBe(80);
  });

  it("puts the folding icon where draw.io draws it (mxCellRenderer.getControlBounds)", async () => {
    // draw.io at view scale 1 and 1.5.
    const one: Record<string, number[]> = {
      lane: [325, 225, 9, 9], box: [45, 225, 9, 9], empty: [45, 445, 9, 9],
      two: [305, 445, 9, 9], vert: [565, 445, 9, 9], pool: [605, 45, 9, 9],
    };
    const oneAndHalf: Record<string, number[]> = {
      lane: [487, 337, 14, 14], box: [67, 337, 14, 14], empty: [67, 667, 14, 14],
      two: [457, 667, 14, 14], vert: [847, 667, 14, 14], pool: [907, 67, 14, 14],
    };
    for (const [scale, want] of [[1, one], [1.5, oneAndHalf]] as const) {
      const slide = await slideOf(FOLD_MODEL, { origin: { x: 0, y: 0 }, scale });
      for (const cell of FOLDED) {
        const r = foldingIconRect(vertex(slide, cell), slide)!;
        expect([cell, r.x, r.y, r.width, r.height]).toEqual([cell, ...want[cell]]);
      }
      expect(foldingIconRect(vertex(slide, 'plain'), slide)).toBeNull();
    }
  });
});

describe('moving a cell into a container', () => {
  it("brings the connector between it and the container's child along (mxGraphModel.updateEdgeParent)", async () => {
    const slide = await slideOf(v('k', '1', 'rounded=0;whiteSpace=wrap;html=1;container=1;', 40, 40, 300, 200, 'K')
      + v('k-a', 'k', 'rounded=0;whiteSpace=wrap;html=1;', 20, 40, 80, 40, 'KA')
      + v('y', '1', 'rounded=0;whiteSpace=wrap;html=1;', 400, 40, 80, 40, 'Y')
      + v('z', '1', 'rounded=0;whiteSpace=wrap;html=1;', 500, 300, 80, 40, 'Z')
      + e('y-ka', '1', 'y', 'k-a', [[300, 20]])
      + e('y-z', '1', 'y', 'z'));
    const y = vertex(slide, 'y');
    y.x -= 200;
    y.y += 60;
    expect(reparent(slide, y.id, 'k')).toBe(true);
    const p = page(slide);
    // draw.io after moveCells([y], -200, 60, false, k).
    expect(pageCell(p, 'y').parent).toBe('k');
    expect(geo(p, 'y')).toEqual([160, 60, 80, 40]);
    expect(pageCell(p, 'y-ka').parent).toBe('k');
    expect(pageCell(p, 'y-ka').geometry!.points).toEqual([{ x: 260, y: -20 }]);
    expect(pageCell(p, 'y-z').parent).toBe('1');
    expect(order(slide)).toEqual(['k', 'k-a', 'y', 'y-ka', 'z', 'y-z']);
    // Not into itself or its own descendants.
    expect(reparent(slide, vertex(slide, 'k').id, 'k-a')).toBe(false);
  });
});

describe('a duplicated group keeps its children', () => {
  it('re-parents copied children to the copied group', async () => {
    const slide = await slideOf(UNGROUP_MODEL);
    const after = commit(slide, (draft) => {
      for (const cell of ['g', 'g-a', 'g-b']) {
        const copy = structuredClone(byCell(draft, cell));
        copy.id = `${copy.id}-copy`;
        draft.elements.push(copy);
      }
    });
    const copyOf = (cell: string) => after.elements.find((el) => el.id === `${byCell(slide, cell).id}-copy`) as VertexEl;
    expect(copyOf('g').cell).toBe('g-2');
    expect(copyOf('g-a').parent).toBe('g-2');
    expect(copyOf('g-b').parent).toBe('g-2');
  });
});

describe('layers', () => {
  const layered = () => slideOf(
    v('l1-a', '1', 'rounded=0;html=1;', 40, 40, 120, 60, 'A')
    + v('l2-a', 'layer-2', 'rounded=0;html=1;', 40, 160, 120, 60, 'B')
    + e('l2-edge', 'layer-2', 'l1-a', 'l2-a')
    + v('l3-a', 'layer-3', 'rounded=0;html=1;', 240, 160, 120, 60, 'C')
    + e('l1-to-l3', '1', 'l1-a', 'l3-a'),
    undefined,
    '<mxCell id="1" parent="0"/><mxCell id="layer-2" value="Middle" parent="0"/><mxCell id="layer-3" value="Top" parent="0"/>',
  );

  it('hides a layer: its cells and the connectors to them are concealed', async () => {
    const slide = await layered();
    const hidden = commit(slide, (draft) => expect(setLayerHidden(draft, 'd', 'layer-2', true)).toBe(true));
    expect(hidden.diagrams!.d.layers[1].hidden).toBe(true);
    expect(vertex(hidden, 'l2-a').concealed).toBe(true);
    expect(connector(hidden, 'l2-edge').concealed).toBe(true);
    expect(vertex(hidden, 'l1-a').concealed).toBeFalsy();
    expect(pageCell(page(hidden), 'layer-2').visible).toBe(false);
    const hiddenTop = commit(hidden, (draft) => setLayerHidden(draft, 'd', 'layer-3', true));
    // A connector on a shown layer to a cell on a hidden one is not drawn either (draw.io).
    expect(connector(hiddenTop, 'l1-to-l3').concealed).toBe(true);
    const shown = commit(hiddenTop, (draft) => {
      setLayerHidden(draft, 'd', 'layer-2', false);
      setLayerHidden(draft, 'd', 'layer-3', false);
    });
    for (const cell of ['l2-a', 'l2-edge', 'l3-a', 'l1-to-l3']) expect(byCell(shown, cell).concealed).toBeFalsy();
  });

  it('locks a layer the way draw.io writes it', async () => {
    const slide = await layered();
    expect(setLayerLocked(slide, 'd', 'layer-2', true)).toBe(true);
    expect(slide.diagrams!.d.layers[1].dio).toBe('locked=1;');
    expect(isCellSelectable(slide, vertex(slide, 'l2-a'))).toBe(false);
    expect(isCellSelectable(slide, vertex(slide, 'l1-a'))).toBe(true);
    expect(selectableLayerCells(slide, 'd', 'layer-2')).toEqual([]);
    setLayerLocked(slide, 'd', 'layer-2', false);
    expect(slide.diagrams!.d.layers[1].dio).toBe('locked=0;');
    expect(selectableLayerCells(slide, 'd', 'layer-2').map((c) => c.cell)).toEqual(['l2-a', 'l2-edge']);
  });

  it('adds, renames, reorders and deletes layers, restacking their cells', async () => {
    const slide = await layered();
    const added = addLayer(slide, 'd');
    expect(slide.diagrams!.d.layers.map((l) => l.label)).toEqual(['', 'Middle', 'Top', 'Untitled Layer']);
    expect(renameLayer(slide, 'd', added, 'Notes')).toBe(true);
    expect(order(slide)).toEqual(['l1-a', 'l1-to-l3', 'l2-a', 'l2-edge', 'l3-a']);
    expect(moveLayer(slide, 'd', '1', 2)).toBe(true);
    expect(slide.diagrams!.d.layers.map((l) => l.cell)).toEqual(['layer-2', 'layer-3', '1', added]);
    expect(order(slide)).toEqual(['l2-a', 'l2-edge', 'l3-a', 'l1-a', 'l1-to-l3']);
    const doomed = vertex(slide, 'l3-a').id;
    const deleted = deleteLayer(slide, 'd', 'layer-3')!;
    expect(deleted.removed).toEqual([doomed]);
    expect(byCell(slide, 'l3-a')).toBeUndefined();
    expect(slide.diagrams!.d.layers.map((l) => l.cell)).toEqual(['layer-2', '1', added]);
    expect(deleted.current).toBe('layer-2');
    // The connector to the deleted cell is left loose by the next routing pass.
    const deck = withRoutedConnectors(null, deckOf(slide));
    const loose = connector(deck.slides[0], 'l1-to-l3');
    expect(loose.target).toBeNull();
    expect(loose.targetPoint).not.toBeNull();
  });

  it('moves selected cells to a layer, on top of it', async () => {
    const slide = await layered();
    const moved = moveCellsToLayer(slide, [vertex(slide, 'l1-a').id], 'layer-3');
    expect(moved).toContain(vertex(slide, 'l1-a').id);
    expect(vertex(slide, 'l1-a').parent).toBe('layer-3');
    expect(order(slide)).toEqual(['l1-to-l3', 'l2-a', 'l2-edge', 'l3-a', 'l1-a']);
    expect(layerForCells(slide, [vertex(slide, 'l1-a').id, vertex(slide, 'l3-a').id])).toEqual({ diagram: 'd', layer: 'layer-3' });
    expect(layerForCells(slide, [vertex(slide, 'l1-a').id, vertex(slide, 'l2-a').id])).toBeNull();
    const tree = new DiagramTree(slide);
    expect(tree.layerCells('d', 'layer-3').map((c) => c.cell)).toEqual(['l3-a', 'l1-a']);
  });
});
