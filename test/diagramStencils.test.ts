/**
 * The XML stencil engine, line jumps, the sketch style, fill patterns and
 * the page shadow. Their painting is compared with draw.io's own code in
 * diagramShapesDrawio.test.ts and, for whole pages, by the visual
 * comparison (scripts/drawio-visual-compare.mts); these tests pin down the
 * parts around it.
 */

import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { SlideElement } from '../src/shared/deck.js';
import { pageToElements } from '../src/shared/diagram/convert.js';
import { connectorLineJumps, connectorMarkup, vertexMarkup } from '../src/shared/diagram/element.js';
import { computeLineJumps } from '../src/shared/diagram/lineJumps.js';
import { edgeSvg, isKnownShape, shapeConstraints, vertexSvg } from '../src/shared/diagram/paint.js';
import { sketchSeed } from '../src/shared/diagram/sketch.js';
import {
  decodeStencilSet, getBasenameForStencil, getStencil, shippedStencilFiles, shippedStencilNames,
} from '../src/shared/diagram/stencil.js';
import { resolveStyle } from '../src/shared/diagram/style.js';
import type { Style } from '../src/shared/diagram/types.js';
import { STENCIL_FILES } from '../src/shared/diagram/stencils/data.js';
import { loadDrawioFixture } from './support/drawioReference.js';

const vertex = (style: string, w = 120, h = 80) => vertexSvg(resolveStyle(style, 'vertex'), { x: 0, y: 0, width: w, height: h });

/** Graph.compress: encodeURIComponent → deflateRaw → base64. */
function compress(xml: string): string {
  const bytes = deflateSync(strToU8(encodeURIComponent(xml)), { level: 9 });
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe('stencil sets', () => {
  it('decodes every shipped set of stencils.min.js', () => {
    for (const file of shippedStencilFiles()) {
      const root = decodeStencilSet(STENCIL_FILES[file]);
      expect(root.name, file).toBe('shapes');
      // Package names are lower-cased on registration (flowchart.xml says mxGraph.flowchart)
      expect(root.attrs.name, file).toMatch(/^mxgraph\./i);
      expect(root.children.length, file).toBeGreaterThan(0);
    }
    const basic = decodeStencilSet(STENCIL_FILES['basic.xml']);
    const star = basic.children.find((c) => typeof c !== 'string' && c.attrs.name === 'Star');
    expect(star).toBeDefined();
    // Coordinates are delta coded in thousandths
    expect(JSON.stringify(star)).toMatch(/"x":"\d+(\.\d+)?"/);
  });

  it('registers the stencils as draw.io names them', () => {
    const names = shippedStencilNames();
    expect(names.length).toBeGreaterThan(700);
    for (const name of ['mxgraph.basic.star', 'mxgraph.flowchart.decision', 'mxgraph.flowchart.on-page_reference',
      'mxgraph.arrows.arrow_right', 'mxgraph.networks.server', 'mxgraph.electrical.logic_gates.and',
      'mxgraph.bpmn.gateway', 'mxgraph.lean_mapping.kaizen_lightening_burst']) {
      expect(names, name).toContain(name);
    }
    expect(getBasenameForStencil('mxgraph.electrical.logic_gates.and')).toBe('electrical/logic_gates');
    expect(getBasenameForStencil('mxgraph.basic.star')).toBe('basic');
    expect(getBasenameForStencil('rectangle')).toBeNull();
    // Names are lower case and spaces are underscores
    expect(getStencil('mxgraph.basic.4_point_star')).not.toBeNull();
    expect(getStencil('mxgraph.basic.4 Point Star')).toBeNull();
  });

  it('prefers a shape class to a stencil of the same name, as mxCellRenderer.createShape does', () => {
    // flowchart.xml has a "Document" stencil, and mxgraph.flowchart.document2 is a class
    expect(getStencil('mxgraph.flowchart.document')).not.toBeNull();
    expect(getStencil('mxgraph.flowchart.document2')).toBeNull();
    expect(isKnownShape('mxgraph.flowchart.document2')).toBe(true);
  });

  it('has the stencil connection points', () => {
    const decision = shapeConstraints(resolveStyle('shape=mxgraph.flowchart.decision;', 'vertex'));
    expect(decision).not.toBeNull();
    expect(decision?.every((c) => c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1)).toBe(true);
  });

  it('paints shape=stencil(...) custom shapes', () => {
    const xml = '<shape name="tri" w="10" h="10" aspect="variable" strokewidth="inherit"><background><path>'
      + '<move x="0" y="10"/><line x="5" y="0"/><line x="10" y="10"/><close/></path></background>'
      + '<foreground><fillstroke/><strokecolor color="#ff0000"/><ellipse x="4" y="6" w="2" h="2"/><stroke/>'
      + '<fontcolor color="#0000ff"/><fontsize size="5"/><text str="A" x="5" y="9" align="center" valign="bottom"/></foreground></shape>';
    const svg = vertex(`shape=stencil(${compress(xml)});fillColor=#00ff00;`, 100, 50);
    expect(svg).toContain('<path d="M 0 50 L 50 0 L 100 50 Z" fill="#00ff00" stroke="#000000"/>');
    expect(svg).toContain('<ellipse cx="50" cy="35" rx="10" ry="5" fill="none" stroke="#ff0000"/>');
    expect(svg).toMatch(/<text x="50" y="[\d.]+">A<\/text>/);
    expect(isKnownShape(`stencil(${compress(xml)})`)).toBe(true);
    // A broken stencil paints the rectangle of an unknown shape
    expect(vertex('shape=stencil(AAAA);')).toBe('<rect x="0" y="0" width="120" height="80" fill="#ffffff" stroke="#000000"/>');
  });

  it('takes the stencil fill colours from the style or their defaults', () => {
    const own = vertex('shape=mxgraph.flowchart.parallel_mode;accentColor=#00ff00;');
    const fallback = vertex('shape=mxgraph.flowchart.parallel_mode;');
    expect(own).toContain('#00ff00');
    expect(fallback).toContain('#ffff00');
  });
});

describe('line jumps', () => {
  const edge = (id: string, points: Array<[number, number]>, extra = ''): { id: string; style: Style; points: Array<{ x: number; y: number }> } => ({
    id, style: resolveStyle(`endArrow=none;${extra}`, 'edge'), points: points.map(([x, y]) => ({ x, y })),
  });

  it('jumps the connectors drawn before, in order along the route', () => {
    const jumps = computeLineJumps([
      edge('a', [[0, 50], [200, 50]]),
      edge('b', [[0, 100], [200, 100]]),
      edge('c', [[50, 0], [50, 200]], 'jumpStyle=arc;'),
      edge('d', [[100, 200], [100, 0]], 'jumpStyle=gap;'),
    ]);
    expect(jumps.has('a')).toBe(false);
    expect(jumps.has('b')).toBe(false);
    expect(jumps.get('c')).toEqual([
      { x: 50, y: 0, type: 0 }, { x: 50, y: 50, type: 1 }, { x: 50, y: 100, type: 1 }, { x: 50, y: 200, type: 0 },
    ]);
    // Later connectors jump only the ones before them, ordered from their start
    expect(jumps.get('d')).toEqual([
      { x: 100, y: 200, type: 0 }, { x: 100, y: 100, type: 1 }, { x: 100, y: 50, type: 1 }, { x: 100, y: 0, type: 0 },
    ]);
  });

  it('skips noJump connectors, touching ends and other layers with jumpLayers=0', () => {
    const jumps = computeLineJumps([
      edge('a', [[0, 50], [200, 50]], 'noJump=1;'),
      { ...edge('b', [[0, 100], [200, 100]]), layer: 'other' },
      edge('c', [[50, 100], [50, 300]]),
      { ...edge('d', [[60, 0], [60, 200]], 'jumpStyle=arc;jumpLayers=0;'), layer: 'mine' },
      edge('e', [[150, 0], [150, 200]], 'jumpStyle=arc;'),
    ]);
    expect(jumps.get('d')).toEqual([{ x: 60, y: 0, type: 0 }, { x: 60, y: 200, type: 0 }]);
    expect(jumps.get('e')?.filter((p) => p.type === 1)).toEqual([{ x: 150, y: 100, type: 1 }]);
  });

  it('paints arcs, gaps, sharp corners and lines at the jumps', () => {
    const route = [{ x: 50, y: 0 }, { x: 50, y: 200 }];
    const routed = computeLineJumps([edge('h', [[0, 100], [200, 100]]), edge('v', [[50, 0], [50, 200]])]);
    expect(routed.size).toBe(0);
    for (const [style, pattern] of [
      // The jump reaches (jumpSize 6 - 2) / 2 + strokeWidth 1 = 3 to each side
      ['arc', /L 50 97 C [\d.]+ 97 [\d.]+ 103 50 103/], ['gap', /L 50 97 M 50 103/],
      ['sharp', /L 50 97 L [\d.]+ 97 L [\d.]+ 103 L 50 103/], ['line', /L 50 97 M [\d.]+ 97 L [\d.]+ 97 M [\d.]+ 103 L [\d.]+ 103 M 50 103/],
    ] as const) {
      const [, jumps] = [...computeLineJumps([edge('h', [[0, 100], [200, 100]]), edge('v', [[50, 0], [50, 200]], `jumpStyle=${style};`)])][0];
      const svg = edgeSvg(resolveStyle(`endArrow=none;jumpStyle=${style};`, 'edge'), route, { routedPoints: jumps });
      expect(svg, style).toMatch(pattern);
    }
    // No routed points, no jumps
    expect(edgeSvg(resolveStyle('endArrow=none;jumpStyle=arc;', 'edge'), route)).toContain('d="M 50 0 L 50 200"');
  });

  it('finds the jumps of a slide in draw.io units and draws them in each box', async () => {
    const fixture = await loadDrawioFixture('edges-jumps');
    let n = 0;
    const { elements } = pageToElements(fixture.document.pages[0], {
      diagramId: 'd', placement: { origin: { x: 137, y: 61 }, scale: 1.5 }, makeId: (p) => `${p}-${++n}`,
    });
    const jumps = connectorLineJumps(elements as SlideElement[]);
    const byCell = new Map<string, string>();
    for (const el of elements) if (el.type === 'connector') byCell.set(el.cell, el.id);
    // Each vertical connector jumps the three horizontal ones before it
    for (const cell of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
      const points = jumps.get(byCell.get(cell)!) ?? [];
      expect(points.filter((p) => p.type === 1).map((p) => p.y), cell).toEqual([60, 160, 260]);
    }
    expect(jumps.has(byCell.get('h1')!)).toBe(false);
    const v1 = elements.find((el) => el.type === 'connector' && el.cell === 'v1');
    if (v1?.type !== 'connector') throw new Error('no v1');
    const markup = connectorMarkup(v1, { routedPoints: jumps.get(v1.id) });
    expect(markup).not.toBe(connectorMarkup(v1));
    expect(markup).toMatch(/ C /);
  });
});

describe('sketch style', () => {
  it('seeds the strokes with the cell id, as draw.io does', () => {
    expect(sketchSeed(null)).toBe(1);
    expect(sketchSeed('a')).toBe(((1 << 5) - 1 + 97) << 0);
    const style = resolveStyle('sketch=1;fillColor=#dae8fc;', 'vertex');
    const bounds = { x: 10, y: 10, width: 120, height: 60 };
    const a = vertexSvg(style, bounds, { cellId: 'shape-1' });
    expect(vertexSvg(style, bounds, { cellId: 'shape-1' })).toBe(a);
    expect(vertexSvg(style, bounds, { cellId: 'shape-2' })).not.toBe(a);
    // Hachure fill strokes in the fill colour, then the rough outline
    expect(a).toMatch(/stroke="#dae8fc" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/);
    expect(a).not.toMatch(/<rect /);
  });

  it('fills white and gradient shapes solid', () => {
    const svg = vertexSvg(resolveStyle('sketch=1;', 'vertex'), { x: 0, y: 0, width: 100, height: 50 }, { cellId: 'x' });
    expect(svg).toMatch(/fill="#ffffff" stroke="none"/);
  });

  it('draws a cell the same wherever its box is on the slide', () => {
    const cell = (x: number) => ({
      id: 'v', type: 'vertex', x, y: 40, w: 120, h: 60, rot: 0, z: 0, cell: 'c1', dio: 'sketch=1;fillColor=#dae8fc;',
      label: '', diagram: 'd', parent: '1', scale: 1, origin: { x, y: 40 },
    }) as unknown as Parameters<typeof vertexMarkup>[0];
    expect(vertexMarkup(cell(0))).toBe(vertexMarkup(cell(300)));
  });
});

describe('fill patterns and the page shadow', () => {
  it('fills with a pattern tiled from the page origin', () => {
    const svg = vertexSvg(resolveStyle('fillStyle=hatch;fillColor=#ff0000;', 'vertex'), { x: 0, y: 0, width: 100, height: 50 },
      { patternOrigin: { x: -30, y: -20 } });
    expect(svg).toMatch(/<pattern id="[^"]+" patternUnits="userSpaceOnUse" width="11.5" height="11.5" x="0" y="0" patternTransform="translate\(-30,-20\) rotate\(45\) scale\(1\)">/);
    expect(svg).toMatch(/fill="url\(#[^)]+\)"/);
    // fillStyle=solid and auto (and rough.js styles) fill solid
    expect(vertex('fillStyle=solid;fillColor=#ff0000;')).toContain('fill="#ff0000"');
    expect(vertex('fillStyle=hachure;fillColor=#ff0000;')).toContain('fill="#ff0000"');
  });

  it('draws the cells of a page with shadow="1" with the page shadow', () => {
    const cell = {
      id: 'v', type: 'vertex', x: 0, y: 0, w: 120, h: 60, rot: 0, z: 0, cell: 'c1', dio: 'rounded=1;',
      label: 'A', diagram: 'd', parent: '1', scale: 2, origin: { x: 0, y: 0 },
    } as unknown as Parameters<typeof vertexMarkup>[0];
    expect(vertexMarkup(cell)).not.toContain('drop-shadow');
    expect(vertexMarkup(cell, { pageShadow: true })).toContain('filter:drop-shadow(6px 6px 3.4px rgba(61, 69, 116, 0.4))');
  });
});
