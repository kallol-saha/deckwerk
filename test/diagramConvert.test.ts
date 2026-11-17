import { describe, expect, it } from 'vitest';
import type { Slide, SlideElement } from '../src/shared/deck.js';
import { elementsToPage, pageToElements } from '../src/shared/diagram/convert.js';
import { readDrawio, writeDrawio } from '../src/shared/diagram/drawioFile.js';
import { connectorMarkup, vertexMarkup } from '../src/shared/diagram/element.js';
import { withRoutedConnectors } from '../src/shared/diagram/reroute.js';
import type { DiagramCell, DiagramPage } from '../src/shared/diagram/model.js';
import { listDrawioFixtures, loadDrawioFixture, referenceCells } from './support/drawioReference.js';

/**
 * draw.io pages as DeckWerk elements, checked against what draw.io itself
 * computed for the same files (test/fixtures/drawio/*.reference.json):
 * every vertex lands on draw.io's box and every connector on draw.io's
 * route, at an off-origin placement and a non-unit scale so the slide ⇄
 * draw.io unit conversion is exercised; and writing the elements back gives
 * the page that was read.
 */

// draw.io rounds some routing steps to a tenth of a unit in its own frame,
// so the strict comparison runs with draw.io's frame (origin 0, scale 1);
// an arbitrary placement may differ by those roundings, a fraction of a pixel.
const IDENTITY = { origin: { x: 0, y: 0 }, scale: 1 };
const PLACED = { origin: { x: 137, y: 61 }, scale: 1.5 };
let PLACEMENT = IDENTITY;
let counter = 0;
const makeId = (prefix: string) => `${prefix}-t${++counter}`;

function toPage(p: { x: number; y: number }) {
  return { x: (p.x - PLACEMENT.origin.x) / PLACEMENT.scale, y: (p.y - PLACEMENT.origin.y) / PLACEMENT.scale };
}

function slideOf(page: DiagramPage): { slide: Slide; elements: SlideElement[] } {
  const { elements, meta } = pageToElements(page, { diagramId: 'd', placement: PLACEMENT, makeId });
  const slide: Slide = {
    id: 's', name: '', background: { color: null, image: null }, notes: '',
    elements, timeline: [], diagrams: { d: meta },
  };
  return { slide, elements };
}

const fixtures = listDrawioFixtures();

describe('draw.io pages on a slide match draw.io', () => {
  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(10);
  });

  for (const [label, placement, tolerance] of [['draw.io frame', IDENTITY, 0.01], ['placed and scaled', PLACED, 0.1]] as const) for (const name of fixtures) {
    it(`${name}: vertex boxes and connector routes (${label})`, async () => {
      PLACEMENT = placement;
      const fixture = await loadDrawioFixture(name);
      const mismatches: string[] = [];
      fixture.document.pages.forEach((page, index) => {
        const ref = referenceCells(fixture.reference.pages[index]);
        const { elements } = slideOf(page);
        for (const el of elements) {
          if (el.type !== 'vertex' && el.type !== 'connector') continue;
          const cell = ref.get(el.cell);
          if (!cell?.state) continue;
          if (el.type === 'vertex') {
            const at = toPage({ x: el.x, y: el.y });
            const box = [at.x, at.y, el.w / PLACEMENT.scale, el.h / PLACEMENT.scale];
            const want = [cell.state.x, cell.state.y, cell.state.width, cell.state.height];
            if (box.some((v, i) => Math.abs(v - want[i]) > tolerance)) {
              mismatches.push(`${el.cell}: box ${box.map((v) => v.toFixed(2))} != ${want}`);
            }
          } else if (cell.state.edge) {
            const got = el.route.map(toPage);
            const want = cell.state.edge.points;
            const ok = got.length === want.length
              && got.every((p, i) => Math.abs(p.x - want[i].x) <= tolerance && Math.abs(p.y - want[i].y) <= tolerance);
            if (!ok) {
              mismatches.push(`${el.cell}: route ${JSON.stringify(got.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)]))}`
                + ` != ${JSON.stringify(want.map((p) => [p.x, p.y]))}`);
            }
          }
        }
      });
      expect(mismatches).toEqual([]);
    });
  }
});

function comparable(cell: DiagramCell) {
  const g = cell.geometry;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    id: cell.id,
    parent: cell.parent,
    kind: cell.kind,
    value: cell.object ? cell.object.attrs.label ?? '' : cell.value,
    style: cell.style,
    source: cell.source,
    target: cell.target,
    visible: cell.visible,
    object: cell.object ? { ...cell.object, attrs: { ...cell.object.attrs, label: undefined } } : null,
    geometry: g && cell.kind !== 'layer' ? {
      x: round(g.x), y: round(g.y), width: round(g.width), height: round(g.height),
      points: (g.points ?? []).map((p) => [round(p.x), round(p.y)]),
      sourcePoint: g.sourcePoint ? [round(g.sourcePoint.x), round(g.sourcePoint.y)] : null,
      targetPoint: g.targetPoint ? [round(g.targetPoint.x), round(g.targetPoint.y)] : null,
      offset: g.offset && (g.offset.x !== 0 || g.offset.y !== 0) ? [round(g.offset.x), round(g.offset.y)] : null,
    } : null,
  };
}

describe('a page written back from the slide is the page that was read', () => {
  for (const name of fixtures) {
    it(name, async () => {
      const fixture = await loadDrawioFixture(name);
      for (const page of fixture.document.pages) {
        const { slide } = slideOf(page);
        const back = elementsToPage(slide, 'd');
        const original = page.cells
          .filter((c) => !(c.kind === 'edge' && false))
          .map(comparable)
          .sort((a, b) => a.id.localeCompare(b.id));
        const written = back.cells.map(comparable).sort((a, b) => a.id.localeCompare(b.id));
        expect(written).toEqual(original);
        // …and survives the file format too.
        const again = await readDrawio(await writeDrawio({ attributes: {}, pages: [back] }));
        expect(again.pages[0].cells.map(comparable).sort((a, b) => a.id.localeCompare(b.id))).toEqual(original);
      }
    });
  }
});

describe('diagram elements draw and stay attached', () => {
  it('draws every cell of every fixture without throwing', async () => {
    for (const name of fixtures) {
      const fixture = await loadDrawioFixture(name);
      for (const page of fixture.document.pages) {
        for (const el of slideOf(page).elements) {
          const markup = el.type === 'vertex' ? vertexMarkup(el) : el.type === 'connector' ? connectorMarkup(el) : '';
          expect(markup.startsWith('<svg')).toBe(true);
        }
      }
    }
  });

  it('re-routes a connector when the shape it joins moves, and loosens it when the shape goes', async () => {
    const fixture = await loadDrawioFixture('edges-straight');
    const { slide } = slideOf(fixture.document.pages[0]);
    const connector = slide.elements.find((el) => el.type === 'connector' && el.source && el.target);
    if (!connector || connector.type !== 'connector') throw new Error('no attached connector');
    const deck = { version: 1 as const, title: '', canvas: { w: 1920, h: 1080 }, slides: [slide] } as unknown as Parameters<typeof withRoutedConnectors>[1];
    const moved = structuredClone(deck);
    const target = moved.slides[0].elements.find((el) => el.id === connector.target)!;
    target.x += 200;
    target.y += 120;
    const routed = withRoutedConnectors(deck, moved);
    const after = routed.slides[0].elements.find((el) => el.id === connector.id);
    if (after?.type !== 'connector') throw new Error('connector lost');
    expect(after.route).not.toEqual(connector.route);
    const end = after.route[after.route.length - 1];
    // The new end is on (or at the edge of) the moved shape's box.
    expect(end.x).toBeGreaterThanOrEqual(target.x - 1);
    expect(end.x).toBeLessThanOrEqual(target.x + target.w + 1);

    const deleted = structuredClone(routed);
    deleted.slides[0].elements = deleted.slides[0].elements.filter((el) => el.id !== connector.target);
    const loosened = withRoutedConnectors(routed, deleted).slides[0].elements.find((el) => el.id === connector.id);
    if (loosened?.type !== 'connector') throw new Error('connector lost');
    expect(loosened.target).toBeNull();
    expect(loosened.targetPoint).toEqual(end);
  });
});
