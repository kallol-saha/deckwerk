import { describe, expect, it } from 'vitest';
import { parseDeck, type ConnectorEl, type Slide, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { slideDiagramProblems } from '../src/shared/diagram/validate.js';

let n = 0;
const makeId = (prefix: string) => `${prefix}-${++n}`;
const canvas = { w: 1920, h: 1080 };

function slideWith(): { slide: Slide; a: VertexEl; b: VertexEl; e: ConnectorEl } {
  const slide = parseDeck({ version: 1, slides: [{ id: 's1', elements: [] }] }).slides[0];
  const a = newVertex(slide, { dio: 'rounded=1;', x: 100, y: 100, unitW: 60, unitH: 30, cell: 'a' }, makeId);
  addCells(slide, [a]);
  const b = newVertex(slide, { dio: 'ellipse;', x: 400, y: 100, unitW: 60, unitH: 30, cell: 'b' }, makeId);
  addCells(slide, [b]);
  const e = newConnector(slide, { source: a.element.id, target: b.element.id, cell: 'e' }, makeId);
  addCells(slide, [e]);
  return { slide, a: a.element, b: b.element, e: e.element };
}

const kinds = (slide: Slide) => slideDiagramProblems(slide, canvas).map((p) => `${p.kind}:${p.cell}`);

describe('diagram validation', () => {
  it('passes a clean diagram', () => {
    expect(kinds(slideWith().slide)).toEqual([]);
  });

  it('flags connectors whose ends are missing, not shapes, or in another diagram', () => {
    const { slide, e, b } = slideWith();
    e.target = 'nope';
    expect(kinds(slide)).toContain('dangling-connector:e');
    e.target = null;
    e.targetPoint = null;
    expect(kinds(slide)).toContain('dangling-connector:e');
    e.target = b.id;
    b.diagram = 'diagram-2';
    expect(kinds(slide)).toContain('dangling-connector:e');
  });

  it('flags duplicate cell ids, also against layers', () => {
    const { slide, b } = slideWith();
    b.cell = 'a';
    expect(kinds(slide)).toContain('duplicate-cell:a');
    b.cell = '1';
    expect(kinds(slide)).toContain('duplicate-cell:1');
  });

  it('flags parents that do not exist', () => {
    const { slide, a } = slideWith();
    a.parent = 'ghost';
    expect(kinds(slide)).toContain('missing-parent:a');
  });

  it('flags unknown shapes and arrowheads but knows stencils', () => {
    const { slide, a, b, e } = slideWith();
    a.dio = 'shape=notAShape;';
    b.dio = 'shape=mxgraph.flowchart.document;';
    e.dio = 'endArrow=notAnArrow;';
    expect(kinds(slide)).toEqual(['unknown-shape:a', 'unknown-arrow:e']);
  });

  it('flags rot disagreeing with rotation=', () => {
    const { slide, a } = slideWith();
    a.dio = 'rotation=45;';
    expect(kinds(slide)).toContain('rotation-mismatch:a');
    a.rot = 45;
    expect(kinds(slide)).not.toContain('rotation-mismatch:a');
  });

  it('flags cells outside the slide', () => {
    const { slide, a } = slideWith();
    a.x = 1900;
    expect(slideDiagramProblems(slide, canvas).find((p) => p.cell === 'a')?.message).toMatch(/right/);
  });
});
