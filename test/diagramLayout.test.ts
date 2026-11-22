import { describe, expect, it } from 'vitest';
import { parseDeck, type ConnectorEl, type Slide, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { circleLayout, elkOptions, flowEdge, layoutDiagram, simplifyOrthogonal } from '../src/shared/diagram/layout.js';
import { routeSlide } from '../src/shared/diagram/reroute.js';
import { getStyleValue } from '../src/shared/diagram/style.js';

let n = 0;
const makeId = (prefix: string) => `${prefix}-${++n}`;

function flowchart(): Slide {
  const slide = parseDeck({ version: 1, slides: [{ id: 's1', elements: [] }] }).slides[0];
  const ids = ['start', 'read', 'check', 'yes', 'no', 'end'];
  const v = new Map<string, VertexEl>();
  ids.forEach((cell, i) => {
    const made = newVertex(slide, { dio: 'rounded=1;whiteSpace=wrap;html=1;', label: cell, x: 100 + i * 30, y: 100 + i * 10, unitW: 120, unitH: 60, cell }, makeId);
    addCells(slide, [made]);
    v.set(cell, made.element);
  });
  const edge = (cell: string, a: string, b: string) => addCells(slide, [newConnector(slide, {
    cell, source: v.get(a)!.id, target: v.get(b)!.id, dio: 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;',
  }, makeId)]);
  edge('e1', 'start', 'read');
  edge('e2', 'read', 'check');
  edge('e3', 'check', 'yes');
  edge('e4', 'check', 'no');
  edge('e5', 'yes', 'end');
  edge('e6', 'no', 'end');
  edge('e7', 'start', 'end');
  return slide;
}

function applied(slide: Slide, elements: Array<VertexEl | ConnectorEl>): Slide {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return routeSlide({ ...slide, elements: slide.elements.map((el) => byId.get(el.id) ?? el) });
}

function vertices(slide: Slide): VertexEl[] {
  return slide.elements.filter((el): el is VertexEl => el.type === 'vertex');
}

function overlaps(a: VertexEl, b: VertexEl): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('diagram layout', { timeout: 60_000 }, () => {
  it('uses draw.io\'s ELK defaults with the direction and spacing asked for', () => {
    const o = elkOptions({ algorithm: 'layered', direction: 'right', spacing: 50, layerSpacing: 70 });
    expect(o['elk.algorithm']).toBe('layered');
    expect(o['elk.direction']).toBe('RIGHT');
    expect(o['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(o['elk.spacing.nodeNode']).toBe('50');
    expect(o['elk.layered.spacing.nodeNodeBetweenLayers']).toBe('70');
    expect(elkOptions({ algorithm: 'tree' })['elk.algorithm']).toBe('mrtree');
    expect(elkOptions({ algorithm: 'organic' })['elk.algorithm']).toBe('force');
    expect(elkOptions({ algorithm: 'radial' })['elk.edgeRouting']).toBe('POLYLINE');
  });

  it('lays a flowchart out in layers, without overlaps, keeping its top-left corner', async () => {
    const slide = flowchart();
    const before = vertices(slide);
    const left = Math.min(...before.map((v) => v.x));
    const top = Math.min(...before.map((v) => v.y));
    const result = await layoutDiagram(slide, { algorithm: 'layered', direction: 'down' });
    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(7);
    const next = applied(slide, result.elements);
    const vs = vertices(next);
    expect(Math.min(...vs.map((v) => v.x))).toBeCloseTo(left, 0);
    expect(Math.min(...vs.map((v) => v.y))).toBeCloseTo(top, 0);
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) expect(overlaps(vs[i], vs[j])).toBe(false);
    const by = (cell: string) => vs.find((v) => v.cell === cell)!;
    // Down: every edge goes from a higher layer to a lower one.
    expect(by('start').y).toBeLessThan(by('read').y);
    expect(by('read').y).toBeLessThan(by('check').y);
    expect(by('check').y).toBeLessThan(by('yes').y);
    expect(by('yes').y).toBeLessThan(by('end').y);
    expect(by('yes').y).toBeCloseTo(by('no').y, 0);
    // Flow connectors stay live orthogonal connectors, rounded as draw.io's flows are.
    for (const el of next.elements) {
      if (el.type !== 'connector') continue;
      expect(getStyleValue(el.dio, 'edgeStyle')).toBe('orthogonalEdgeStyle');
      expect(getStyleValue(el.dio, 'rounded')).toBe('1');
      // The route is orthogonal and goes through no other shape.
      for (let i = 1; i < el.route.length; i++) {
        const a = el.route[i - 1];
        const b = el.route[i];
        expect(Math.abs(a.x - b.x) < 0.6 || Math.abs(a.y - b.y) < 0.6).toBe(true);
        for (const v of vs) {
          if (v.id === el.source || v.id === el.target) continue;
          const crosses = Math.min(a.x, b.x) < v.x + v.w - 1 && Math.max(a.x, b.x) > v.x + 1
            && Math.min(a.y, b.y) < v.y + v.h - 1 && Math.max(a.y, b.y) > v.y + 1;
          expect(crosses, `${el.cell} crosses ${v.cell}`).toBe(false);
        }
      }
    }
  });

  it('reproduces ELK\'s route with a pinned orthogonal connector', () => {
    const route = [{ x: 60, y: 60 }, { x: 60, y: 90 }, { x: 200, y: 90 }, { x: 200, y: 120 }];
    const { dio, points } = flowEdge('edgeStyle=orthogonalEdgeStyle;', route, { x: 0, y: 0, width: 120, height: 60 }, { x: 140, y: 120, width: 120, height: 60 });
    expect(points).toEqual([{ x: 60, y: 90 }, { x: 200, y: 90 }]);
    expect(getStyleValue(dio, 'exitX')).toBe('0.5');
    expect(getStyleValue(dio, 'exitY')).toBe('1');
    expect(getStyleValue(dio, 'entryX')).toBe('0.5');
    expect(getStyleValue(dio, 'entryY')).toBe('0');
    expect(simplifyOrthogonal([{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 10 }, { x: 5, y: 10 }])).toHaveLength(3);
  });

  it('lays out horizontally, as trees, radially, organically and on a circle', async () => {
    for (const algorithm of ['layered', 'tree', 'radial', 'organic', 'circle'] as const) {
      const slide = flowchart();
      const result = await layoutDiagram(slide, { algorithm, direction: 'right' });
      const vs = vertices(applied(slide, result.elements));
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        expect(overlaps(vs[i], vs[j]), `${algorithm}: ${vs[i].cell} / ${vs[j].cell}`).toBe(false);
      }
      if (algorithm === 'layered' || algorithm === 'tree') {
        const by = (cell: string) => vs.find((v) => v.cell === cell)!;
        expect(by('start').x).toBeLessThan(by('read').x);
      }
      if (algorithm === 'radial' || algorithm === 'organic' || algorithm === 'circle') {
        for (const el of result.elements) if (el.type === 'connector') expect(getStyleValue(el.dio, 'noEdgeStyle')).toBe('1');
      }
    }
  });

  it('places circles as mxCircleLayout does', () => {
    const box = (id: string, x: number) => ({ el: { id } as VertexEl, box: { x, y: 0, width: 40, height: 40 } });
    const out = circleLayout([box('a', 0), box('b', 50), box('c', 100), box('d', 150)]);
    // r = max(4 * 40 / π, 100) = 100; first at the top.
    expect(out.get('a')).toEqual({ x: 100, y: 0 });
    expect(out.get('b')).toEqual({ x: 200, y: 100 });
    expect(out.get('c')).toEqual({ x: 100, y: 200 });
    expect(out.get('d')).toEqual({ x: 0, y: 100 });
  });

  it('lays out only the cells named, and moves a container\'s contents with it', async () => {
    const slide = flowchart();
    const vs = vertices(slide);
    const named = vs.slice(0, 3).map((v) => v.id);
    const result = await layoutDiagram(slide, { algorithm: 'layered', cells: named });
    expect(result.nodes).toEqual(named);
    expect(result.edges).toHaveLength(2);
    const changedVertices = result.elements.filter((el) => el.type === 'vertex').map((el) => el.id);
    for (const id of changedVertices) expect(named).toContain(id);

    // A group with a child: the child follows.
    const grouped = flowchart();
    const g = newVertex(grouped, { dio: 'group', x: 900, y: 600, unitW: 100, unitH: 100, cell: 'grp' }, makeId);
    addCells(grouped, [g]);
    const child = newVertex(grouped, { dio: 'ellipse;', x: 910, y: 610, unitW: 20, unitH: 20, cell: 'kid', parent: 'grp' }, makeId);
    addCells(grouped, [child]);
    const out = await layoutDiagram(grouped, { algorithm: 'circle' });
    const movedGroup = out.elements.find((el) => el.id === g.element.id)!;
    const movedChild = out.elements.find((el) => el.id === child.element.id)!;
    expect(movedChild.x - movedGroup.x).toBeCloseTo(10, 5);
    expect(out.nodes).not.toContain(child.element.id);
  });
});
