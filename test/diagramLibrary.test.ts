import { describe, expect, it } from 'vitest';
import type { ConnectorEl, Slide, SlideElement, VertexEl } from '../src/shared/deck.js';
import { SlideSchema } from '../src/shared/deck.js';
import {
  PALETTES, applyLibraryEdit, centerInsertPoint, clickItem, connectDirection, dropAndConnectGeometry,
  dropInsertPoint, dropItem, itemSvg, libraryItem, libraryItems, placeItem, replacedStyle, searchLibrary,
  soundex, templateBounds,
} from '../src/shared/diagram/library/index.js';
import type { LibraryItem } from '../src/shared/diagram/library/types.js';
import { getStyleValue } from '../src/shared/diagram/style.js';

let n = 0;
const makeId = (prefix: string) => `${prefix}-${++n}`;

function emptySlide(): Slide {
  return SlideSchema.parse({ id: 'slide-1', elements: [] });
}

/** A slide whose diagram is drawn at draw.io's own size (scale 1), page origin at the corner. */
function scaleOneSlide(): Slide {
  const slide = emptySlide();
  slide.diagrams = { 'diagram-1': { name: 'Page-1', model: {}, root: '0', layers: [{ cell: '1', label: '', dio: '' }], origin: { x: 0, y: 0 }, scale: 1 } };
  return slide;
}

function byTitle(paletteId: string, title: string, nth = 0): LibraryItem {
  const palette = PALETTES.find((p) => p.id === paletteId)!;
  const items = palette.items.filter((i) => i.title === title);
  if (!items[nth]) throw new Error(`No ${title} in ${paletteId}`);
  return items[nth];
}

const vertices = (els: readonly SlideElement[]) => els.filter((e): e is VertexEl => e.type === 'vertex');
const connectors = (els: readonly SlideElement[]) => els.filter((e): e is ConnectorEl => e.type === 'connector');

describe('draw.io palettes, extracted from draw.io', () => {
  it('has the default palettes in draw.io order, General open', () => {
    expect(PALETTES.map((p) => p.title)).toEqual([
      'General', 'Misc', 'Advanced', 'Basic', 'Arrows', 'Flowchart', 'Entity Relation', 'UML',
    ]);
    expect(PALETTES.map((p) => p.id)).toEqual(['general', 'misc', 'advanced', 'basic', 'arrows2', 'flowchart', 'er', 'uml']);
    expect(PALETTES.filter((p) => p.expanded).map((p) => p.id)).toEqual(['general']);
    for (const p of PALETTES) expect(p.items.length).toBeGreaterThan(25);
    expect(libraryItems().length).toBeGreaterThan(350);
    // Ids are unique.
    expect(new Set(libraryItems().map((i) => i.id)).size).toBe(libraryItems().length);
  });

  it('keeps each entry as Sidebar.createVertexTemplateEntry made it', () => {
    const rect = PALETTES[0].items[0];
    expect(rect).toMatchObject({ id: 'general.0', title: 'Rectangle', width: 120, height: 60, tags: 'rect rectangle box Rectangle' });
    expect(rect.cells).toEqual([{ id: '2', style: 'rounded=0;whiteSpace=wrap;html=1;', geometry: { x: 0, y: 0, width: 120, height: 60 } }]);
    const cylinder = byTitle('general', 'Cylinder');
    expect(cylinder.cells[0].style).toBe('shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;');
    expect([cylinder.width, cylinder.height]).toEqual([60, 80]);
    // Graph.addLabelPerimeters ran: a label below the shape gets labelPerimeter=1.
    const actor = byTitle('general', 'Actor');
    expect(actor.showLabel).toBe(false);
    expect(actor.cells[0].value).toBe('Actor');
    expect(getStyleValue(actor.cells[0].style, 'labelPerimeter')).toBe('1');
    // Stencil entries carry the tag index's extra tags.
    const star = byTitle('basic', 'Star');
    expect(star.cells[0].style).toContain('shape=mxgraph.basic.star');
    expect(star.tags.split(' ')).toContain('basic');
  });

  it('keeps multi-cell templates: lists, labelled edges, terminals, compressed tables', () => {
    const list = byTitle('general', 'List');
    expect(list.cells).toHaveLength(4);
    expect(list.cells.slice(1).map((c) => [c.parent, c.value])).toEqual([['2', 'Item 1'], ['2', 'Item 2'], ['2', 'Item 3']]);

    const curve = byTitle('general', 'Curve');
    expect(curve.cells[0]).toMatchObject({
      edge: true,
      geometry: { sourcePoint: { x: 0, y: 50 }, targetPoint: { x: 50, y: 0 }, points: [{ x: 50, y: 50 }, { x: 0, y: 0 }] },
    });

    const labels = byTitle('general', 'Connector with Labels');
    expect(labels.cells.filter((c) => c.parent === '2').map((c) => [c.value, c.geometry.x])).toEqual([['Label', 0], ['Source', -1], ['Target', 1]]);
    expect(labels.cells[1].connectable).toBe(false);

    // createEdgeTemplate: from the bottom-left corner to the top-right one.
    const line = byTitle('general', 'Line');
    expect(line.cells[0].geometry).toMatchObject({ relative: true, sourcePoint: { x: 0, y: 50 }, targetPoint: { x: 50, y: 0 } });

    const start = byTitle('uml', 'Start');
    expect(start.cells[1]).toMatchObject({ edge: true, source: '2', geometry: { targetPoint: { x: 15, y: 90 } } });

    const link = byTitle('misc', 'Link');
    expect(link.cells[0].object).toEqual({ tag: 'UserObject', attrs: { label: 'Link', link: 'https://www.draw.io' } });

    // addDataEntry: draw.io's compressed XML, inflated and read.
    const table = byTitle('er', 'Table 1');
    expect(table.cells[0].style).toContain('shape=table');
    expect(table.cells.filter((c) => c.style.includes('shape=tableRow')).length).toBeGreaterThan(2);
    expect(table.cells.some((c) => c.value === 'PK')).toBe(true);

    // The gear clip art is embedded the way draw.io writes short data URIs.
    expect(byTitle('misc', 'Icon').cells[0].style).toMatch(/image=data:image\/png,iVBOR/);
  });
});

describe('searching the library', () => {
  it('finds the cylinder by its title, a tag, a prefix and its sound', () => {
    const results = searchLibrary('cylinder');
    expect(results[0].title).toBe('Cylinder');
    expect(results[0].cells[0].style).toContain('shape=cylinder3');
    expect(searchLibrary('database').map((i) => i.title)).toEqual(expect.arrayContaining(['Cylinder', 'Data Store']));
    expect(searchLibrary('cylind').some((i) => i.title === 'Cylinder')).toBe(true);
    expect(soundex('cylinder')).toBe(soundex('cilinder'));
    expect(searchLibrary('cilinder').some((i) => i.title === 'Cylinder')).toBe(true);
  });

  it('needs every term, and ranks exact matches first', () => {
    // Ties keep palette order, as in draw.io: Basic's use case actor (uml actor) comes before UML's.
    const results = searchLibrary('uml actor');
    expect(results.slice(0, 5).map((i) => i.id)).toContain(byTitle('uml', 'Actor').id);
    // Both terms exact (2.0) before one exact and one partial.
    expect(results[0].tags.toLowerCase().split(' ')).toEqual(expect.arrayContaining(['uml', 'actor']));
    expect(searchLibrary('rectangle')[0].title).toMatch(/Rectangle/);
    // Titles match even where draw.io's own tags leave them out.
    expect(searchLibrary('composite state').some((i) => i.title === 'Composite State')).toBe(true);
    expect(searchLibrary('qqqzzz')).toEqual([]);
    expect(searchLibrary('')).toEqual([]);
  });
});

describe('library items as cells on a slide', () => {
  it('places a shape: a vertex in a new diagram, draw.io size, the style verbatim', () => {
    const slide = emptySlide();
    const cylinder = byTitle('general', 'Cylinder');
    const placed = placeItem(slide, cylinder, { x: 100, y: 40 }, makeId);
    expect(placed).toHaveLength(1);
    // A new diagram is drawn at scale 2 (insert.ts NEW_DIAGRAM_SCALE): draw.io units × 2 on the slide.
    expect(placed[0].meta).toMatchObject({ scale: 2, origin: { x: 0, y: 0 } });
    const v = placed[0].element as VertexEl;
    expect(v).toMatchObject({ type: 'vertex', x: 200, y: 80, w: 120, h: 160, dio: cylinder.cells[0].style, parent: '1', scale: 2 });
    applyLibraryEdit(slide, { add: placed, update: new Map(), select: [], label: '' });
    expect(Object.keys(slide.diagrams ?? {})).toEqual(['diagram-1']);
    // A second shape joins the diagram with a fresh cell id.
    const again = placeItem(slide, cylinder, { x: 300, y: 40 }, makeId);
    expect(again[0].meta).toBeNull();
    expect(again[0].element.cell).not.toBe(v.cell);
    expect(again[0].element.z).toBeGreaterThan(v.z);
  });

  it('at scale 1, slide pixels are draw.io units', () => {
    const placed = placeItem(scaleOneSlide(), byTitle('general', 'Cylinder'), { x: 100, y: 40 }, makeId);
    expect(placed[0].meta).toBeNull();
    expect(placed[0].element).toMatchObject({ x: 100, y: 40, w: 60, h: 80, scale: 1 });
  });

  it('takes the diagram scale and origin', () => {
    const slide = emptySlide();
    slide.diagrams = { d: { name: 'P', model: {}, root: '0', layers: [{ cell: '1', label: '', dio: '' }], origin: { x: 10, y: 20 }, scale: 2 } };
    const placed = placeItem(slide, byTitle('general', 'Rectangle'), { x: 5, y: 5 }, makeId);
    expect(placed[0].element).toMatchObject({ x: 20, y: 30, w: 240, h: 120, scale: 2, diagram: 'd' });
  });

  it('places containers with their children, labelled and attached edges', () => {
    const slide = emptySlide();
    const list = placeItem(slide, byTitle('general', 'List'), { x: 0, y: 0 }, makeId);
    const vs = vertices(list.map((p) => p.element));
    expect(vs).toHaveLength(4);
    expect(vs.slice(1).every((c) => c.parent === vs[0].cell)).toBe(true);
    expect(vs[1].label).toBe('Item 1');

    const labelled = placeItem(slide, byTitle('general', 'Connector with Labels'), { x: 10, y: 10 }, makeId);
    const [edge] = connectors(labelled.map((p) => p.element));
    expect(edge.labels.map((l) => l.label)).toEqual(['Label', 'Source', 'Target']);
    // Loose ends in draw.io units (10, 10) and (170, 10), × 2 on the slide.
    expect(edge.sourcePoint).toEqual({ x: 20, y: 20 });
    expect(edge.targetPoint).toEqual({ x: 340, y: 20 });
    expect(edge.route.length).toBeGreaterThanOrEqual(2);

    const start = placeItem(slide, byTitle('uml', 'Start'), { x: 0, y: 0 }, makeId);
    const [sv] = vertices(start.map((p) => p.element));
    const [se] = connectors(start.map((p) => p.element));
    expect(se.source).toBe(sv.id);
    expect(se.targetPoint).toEqual({ x: 30, y: 180 });
  });

  it('draws thumbnails with the shared engine', () => {
    const svg = itemSvg(byTitle('general', 'Cylinder'), { width: 32, height: 30 });
    expect(svg).toMatch(/^<svg[^>]*width="32" height="30"/);
    expect(svg).toContain('<path');
    const edge = itemSvg(byTitle('general', 'Directional Connector'), { width: 32, height: 30 });
    expect(edge).toContain('<path');
  });
});

describe('clicking and dropping items, as draw.io does', () => {
  const view = { centre: { x: 960, y: 540 }, topLeft: { x: 0, y: 0 } };

  it('a click puts the item in the middle of the view, snapped, and selects it', () => {
    const slide = emptySlide();
    const rect = byTitle('general', 'Rectangle');
    expect(templateBounds(rect)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
    expect(centerInsertPoint(rect, { x: 960, y: 540 }, { enabled: true, size: 10 })).toEqual({ x: 900, y: 510 });
    const edit = clickItem(slide, rect, [], {}, view, makeId)!;
    expect(edit.add).toHaveLength(1);
    // The view's middle is (480, 270) in draw.io units at scale 2: corner (420, 240), on the
    // 10-unit grid, which is 20 slide pixels.
    expect(edit.add[0].element).toMatchObject({ x: 840, y: 480, w: 240, h: 120 });
    expect(edit.select).toEqual([edit.add[0].element.id]);
    const one = clickItem(scaleOneSlide(), rect, [], {}, view, makeId)!;
    expect(one.add[0].element).toMatchObject({ x: 900, y: 510, w: 120, h: 60 });
  });

  it('a drop puts the corner at the pointer, snapped half a grid step back', () => {
    expect(dropInsertPoint({ x: 333, y: 217 }, { enabled: true, size: 10 })).toEqual({ x: 330, y: 210 });
    // Slide (333, 217) is (166.5, 108.5) in draw.io units at scale 2: corner (160, 100).
    const edit = dropItem(emptySlide(), byTitle('general', 'Ellipse'), { x: 333, y: 217 }, makeId);
    expect(edit.add[0].element).toMatchObject({ x: 320, y: 200, w: 240, h: 160 });
    const one = dropItem(scaleOneSlide(), byTitle('general', 'Ellipse'), { x: 333, y: 217 }, makeId);
    expect(one.add[0].element).toMatchObject({ x: 330, y: 210, w: 120, h: 80 });
  });

  it('Alt+click with a shape selected inserts beside it and connects', () => {
    const slide = emptySlide();
    applyLibraryEdit(slide, { add: placeItem(slide, byTitle('general', 'Rectangle'), { x: 100, y: 100 }, makeId), update: new Map(), select: [], label: '' });
    const source = vertices(slide.elements)[0];
    expect(connectDirection({ altKey: true })).toBe('south');
    expect(connectDirection({ altKey: true, shiftKey: true })).toBe('east');
    expect(connectDirection({ altKey: true, ctrlKey: true })).toBe('north');
    expect(connectDirection({ altKey: true, metaKey: true, shiftKey: true })).toBe('west');
    const edit = clickItem(slide, byTitle('general', 'Ellipse'), [source.id], { altKey: true }, view, makeId)!;
    const [v] = vertices(edit.add.map((p) => p.element));
    const [c] = connectors(edit.add.map((p) => p.element));
    // Sidebar.getDropAndConnectGeometry, in draw.io units: centred under it, 80 units further
    // down, its height matched to the source's (both are over 45 units): 120×80 becomes 90×60,
    // at (115, 240). At scale 2 on the slide: the source is 240×120 at (200, 200).
    expect(source).toMatchObject({ x: 200, y: 200, w: 240, h: 120 });
    expect(v).toMatchObject({ x: 230, y: 200 + 120 + 160, w: 180, h: 120 });
    expect(c).toMatchObject({ source: source.id, target: v.id, dio: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' });
    expect(edit.select).toEqual([v.id]);
    // East, with matched height (both sides over 45).
    const geo = dropAndConnectGeometry({ x: 0, y: 0, width: 120, height: 60 }, byTitle('general', 'Ellipse').cells[0], 'east', false);
    expect(geo.box).toEqual({ x: 120 + 80, y: 0, width: 90, height: 60 });
  });

  it('a loose edge clicked with two shapes selected joins them', () => {
    const slide = emptySlide();
    applyLibraryEdit(slide, { add: placeItem(slide, byTitle('general', 'Rectangle'), { x: 0, y: 0 }, makeId), update: new Map(), select: [], label: '' });
    applyLibraryEdit(slide, { add: placeItem(slide, byTitle('general', 'Rectangle'), { x: 400, y: 0 }, makeId), update: new Map(), select: [], label: '' });
    const [a, b] = vertices(slide.elements);
    const edit = clickItem(slide, byTitle('general', 'Directional Connector'), [a.id, b.id], {}, view, makeId)!;
    const [c] = connectors(edit.add.map((p) => p.element));
    expect(c).toMatchObject({ source: a.id, target: b.id, sourcePoint: null, targetPoint: null, dio: 'endArrow=classic;html=1;' });
    expect(edit.select).toEqual([c.id]);
  });

  it('Shift+click gives the selected shapes the item style', () => {
    expect(replacedStyle('rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;', 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;', 'vertex'))
      .toBe('rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;shape=ellipse;perimeter=ellipsePerimeter;shapeInside=1;');
    const slide = emptySlide();
    applyLibraryEdit(slide, { add: placeItem(slide, byTitle('general', 'Rectangle'), { x: 0, y: 0 }, makeId), update: new Map(), select: [], label: '' });
    const [a] = vertices(slide.elements);
    const edit = clickItem(slide, byTitle('general', 'Cylinder'), [a.id], { shiftKey: true }, view, makeId)!;
    expect(edit.add).toHaveLength(0);
    expect((edit.update.get(a.id) as VertexEl).dio).toContain('shape=cylinder3');
  });

  it('a shape clicked with a loose connector selected ends the connector', () => {
    const slide = emptySlide();
    applyLibraryEdit(slide, { add: placeItem(slide, byTitle('general', 'Directional Connector'), { x: 100, y: 100 }, makeId), update: new Map(), select: [], label: '' });
    const [edge] = connectors(slide.elements);
    const end = edge.route[edge.route.length - 1];
    const edit = clickItem(slide, byTitle('general', 'Rectangle'), [edge.id], {}, view, makeId)!;
    const [v] = vertices(edit.add.map((p) => p.element));
    expect(v.x + v.w / 2).toBeCloseTo(end.x, 0);
    expect(v.y + v.h / 2).toBeCloseTo(end.y, 0);
    expect((edit.update.get(edge.id) as ConnectorEl).target).toBe(v.id);
    expect(edit.select).toEqual([v.id]);
  });

  it('every entry places and draws', () => {
    for (const item of libraryItems()) {
      const slide = emptySlide();
      const placed = placeItem(slide, item, { x: 0, y: 0 }, makeId);
      expect(placed.length, item.id).toBeGreaterThan(0);
      expect(libraryItem(item.id)).toBe(item);
      expect(itemSvg(item, { width: 32, height: 30 }), item.id).toMatch(/^<svg/);
    }
  });
});
