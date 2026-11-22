import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  edgeLabelGeometry, edgeLabelLayout, edgeLabelSvg, labelText, sanitizeLabelHtml, vertexLabelGeometry,
  vertexLabelLayout, vertexLabelSvg,
} from '../src/shared/diagram/label.js';
import {
  computeShapeInsideFontSize, computeShapeInsideSpacer, createShapeInsideBackground, createShapeInsideValue,
  isShapeInsideEnabled, measureShapeInsideFlow, shapeInsideBands, shapeInsideBox, shapeInsideFloats, shapeInsideGrow,
  shapeInsideOutline, shapeInsidePadding, shapeInsideTriangleDirection, type ShapeInsideOutline,
} from '../src/shared/diagram/label/shapeInside.js';
import { polygonExcludedInterval } from '../src/shared/diagram/label/shapeInsideFlow.js';
import { createCss } from '../src/shared/diagram/label/svg.js';
import { resolveStyle } from '../src/shared/diagram/style.js';
import type { Point, Rect } from '../src/shared/diagram/types.js';
import { parseXml } from '../src/shared/diagram/xml.js';
import { listDrawioFixtures, referenceJsonPath, type DrawioReference } from './support/drawioReference.js';

/**
 * Labels of draw.io cells (src/shared/diagram/label.ts): the label box
 * draw.io lays text out in, and the SVG it paints.
 *
 * The numbers come from draw.io itself in two ways: the label matrix in
 * test/fixtures/drawio-labels (scripts/drawio-label-reference.mts: every
 * position × alignment combination, spacing, rotation, overflow, shapes with
 * label margins and edge labels at view scales 1, 2 and 1.5, plus the painted
 * markup of a subset) and the label boxes of the whole-diagram fixtures in
 * test/fixtures/drawio (scripts/drawio-reference.mts). The rest are derived
 * by hand from mxCellRenderer.getLabelBounds/rotateLabelBounds, mxText and
 * mxSvgCanvas2D, which the comments name.
 */

const vertex = (style: string) => resolveStyle(style, 'vertex');
const edge = (style: string) => resolveStyle(style, 'edge');
const BOX: Rect = { x: 0, y: 0, width: 120, height: 60 };
const H = 'html=1;whiteSpace=wrap;';

/** A label's paint input: mxText.bounds as draw.io stores it (anchor + area). */
function bounds(g: ReturnType<typeof vertexLabelGeometry>): Rect {
  return { x: g.paintAnchor.x, y: g.paintAnchor.y, width: g.width, height: g.height };
}

/** The label markup parses as XML (it goes into an SVG string). */
function wellFormed(svg: string): void {
  expect(() => parseXml(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`)).not.toThrow();
}

// --- draw.io references ---------------------------------------------------------------

interface MatrixCase {
  kind: 'vertex' | 'edge';
  style: string;
  value?: string;
  w?: number;
  h?: number;
  scale: number;
  markup?: boolean;
  anchor?: Point;
  bounds: Rect | null;
  rotation: number | null;
  margin: Point | null;
  svg?: string;
}

const MATRIX = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/drawio-labels/label-bounds.reference.json'), 'utf8')) as {
  cases: MatrixCase[];
};

function matrixGeometry(c: MatrixCase) {
  const s = c.scale;
  if (c.kind === 'edge') return edgeLabelGeometry(edge(c.style), c.anchor as Point, s);
  const state = { x: 100 * s, y: 100 * s, width: (c.w ?? 120) * s, height: (c.h ?? 60) * s };
  return vertexLabelGeometry(vertex(c.style), state, s);
}

function matrixSvg(c: MatrixCase): string {
  const s = c.scale;
  const value = c.value ?? 'Label';
  if (c.kind === 'edge') return edgeLabelSvg(edge(c.style), value, c.anchor as Point, s);
  return vertexLabelSvg(vertex(c.style), value, { x: 100 * s, y: 100 * s, width: (c.w ?? 120) * s, height: (c.h ?? 60) * s }, s);
}

/** draw.io's DOM serialisation and ours, brought to one spelling. */
function normalizeReference(svg: string): string {
  return svg
    .replace(/ style=""/g, '')
    .replace(/pointer-events: all/g, 'pointer-events: none')
    .replace(/ style="(fill|stroke)[^"]*"/g, '')
    .replace(/url\([^)#]*#/g, 'url(#')
    .replace(/(mx-clip-[-0-9]+)-\d+/g, '$1')
    .replace(/<br>/g, '<br/>')
    .replace(/><\/rect>/g, '/>')
    .replace(/ transform="translate\(0\.5, 0\.5\)"/g, '');
}

function normalizeOurs(svg: string): string {
  return svg
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
    .replace(/ pointer-events="none"(?= (text-anchor|direction))/g, '')
    .replace(/(mx-clip-[-0-9]+)-\d+/g, '$1')
    .replace(/>([^<]*)</g, (_m, text: string) => `>${text.replace(/&quot;/g, '"')}<`);
}

const RECT = /<rect fill="[^"]*" stroke="[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/;

describe('draw.io label matrix (scripts/drawio-label-reference.mts)', () => {
  it('covers every position × alignment combination at three scales', () => {
    const combos = new Set(MATRIX.cases.filter((c) => c.style.startsWith(`${H}labelPosition=`))
      .map((c) => `${c.style}@${c.scale}`));
    expect(combos.size).toBe(81 * 3);
    expect(new Set(MATRIX.cases.map((c) => c.scale))).toEqual(new Set([1, 2, 1.5]));
    expect(MATRIX.cases.length).toBeGreaterThan(1000);
  });

  it('puts every label where draw.io does (mxText.bounds, rotation, margin)', () => {
    const misses: string[] = [];
    for (const c of MATRIX.cases) {
      expect(c.bounds, c.style).not.toBeNull();
      const g = matrixGeometry(c);
      const got = bounds(g);
      const want = c.bounds as Rect;
      const off = Math.max(Math.abs(got.x - want.x), Math.abs(got.y - want.y),
        Math.abs(got.width - want.width), Math.abs(got.height - want.height));
      if (off > 0.0011 || g.rotation !== c.rotation || g.margin.x !== c.margin?.x || g.margin.y !== c.margin?.y) {
        misses.push(`${c.kind} ${c.style} @${c.scale}: ${JSON.stringify(got)} r${g.rotation} vs ${JSON.stringify(want)} r${c.rotation}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('paints the markup draw.io paints', () => {
    const cases = MATRIX.cases.filter((c) => c.svg != null);
    expect(cases.length).toBeGreaterThan(100);
    const misses: string[] = [];
    for (const c of cases) {
      const ours = matrixSvg(c);
      wellFormed(ours);
      let want = normalizeReference(c.svg as string);
      let got = normalizeOurs(ours);
      // textShadow: the same drop-shadow, spelled by the browser.
      if (c.style.includes('textShadow')) continue;
      // Plain-label backgrounds are sized from font metrics, not measured.
      const a = RECT.exec(want);
      const b = RECT.exec(got);
      if (a && b) {
        for (let i = 1; i <= 4; i++) expect(Math.abs(Number(a[i]) - Number(b[i])), `${c.style} ${c.value}`).toBeLessThanOrEqual(3);
        want = want.replace(RECT, '<rect');
        got = got.replace(RECT, '<rect');
      }
      if (want !== got) misses.push(`${c.style} ${JSON.stringify(c.value)}\n  draw.io ${want}\n  ours    ${got}`);
    }
    expect(misses).toEqual([]);
  });

  it('paints HTML labels at any scale as at scale 1, scaled (draw.io paints in model units)', () => {
    const cases = MATRIX.cases.filter((m) => m.svg != null && m.style.includes('html=1') && !m.style.includes('textShadow'));
    expect(cases.length).toBeGreaterThan(50);
    for (const c of cases) {
      const one = matrixSvg(c);
      const two = matrixSvg({ ...c, scale: 2, anchor: c.anchor && { x: c.anchor.x * 2, y: c.anchor.y * 2 } });
      const [, transform1 = '', rest1] = /^<g><g(?: transform="([^"]*)")?(.*)$/.exec(one) ?? [];
      const [, transform2 = '', rest2] = /^<g><g(?: transform="([^"]*)")?(.*)$/.exec(two) ?? [];
      expect(transform2, c.style).toBe(`scale(2)${transform1}`);
      expect(rest2, c.style).toBe(rest1);
    }
  });
});

describe('draw.io diagram fixtures (scripts/drawio-reference.mts)', () => {
  const names = listDrawioFixtures();

  it('places every label of the reference diagrams as draw.io does', () => {
    let count = 0;
    const misses: string[] = [];
    for (const name of names) {
      const reference = JSON.parse(readFileSync(referenceJsonPath(name), 'utf8')) as DrawioReference;
      for (const page of reference.pages) {
        for (const cell of page.cells) {
          const t = cell.state?.text;
          if (!t?.bounds || (cell.kind !== 'vertex' && cell.kind !== 'edge') || !cell.state) continue;
          count += 1;
          const st = cell.state;
          const g = cell.kind === 'vertex'
            ? vertexLabelGeometry(vertex(cell.style), { x: st.x, y: st.y, width: st.width, height: st.height }, 1,
              { offset: cell.geometry && !cell.geometry.relative ? cell.geometry.offset : null })
            : edgeLabelGeometry(edge(cell.style), st.absoluteOffset, 1,
              { width: cell.geometry?.width, height: cell.geometry?.height });
          const got = bounds(g);
          const want = t.bounds;
          const off = Math.max(Math.abs(got.x - want.x), Math.abs(got.y - want.y),
            Math.abs(got.width - want.width), Math.abs(got.height - want.height));
          if (off > 0.0011 || Math.abs(g.rotation - t.rotation) > 1e-9 || g.margin.x !== t.margin?.x || g.margin.y !== t.margin?.y) {
            misses.push(`${name} ${cell.id} ${cell.style}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
          }
        }
      }
    }
    expect(misses).toEqual([]);
    if (names.length > 0) expect(count).toBeGreaterThan(100);
  });
});

// --- label boxes, derived by hand -----------------------------------------------------------

describe('vertexLabelLayout', () => {
  it('insets a centred label by the spacing (2 on each side by default)', () => {
    // rotateLabelBounds: anchor at the centre, width - (2 + 2), height - (2 + 2).
    expect(vertexLabelLayout(vertex(H), BOX, 1)).toEqual({
      box: { x: 2, y: 2, width: 116, height: 56 }, rotation: 0, center: { x: 60, y: 30 },
    });
  });

  it('scales lengths with the view scale', () => {
    // The same vertex at scale 2 (240 × 120 drawing units).
    const layout = vertexLabelLayout(vertex(H), { x: 10, y: 20, width: 240, height: 120 }, 2);
    expect(layout.box).toEqual({ x: 14, y: 24, width: 232, height: 112 });
    expect(layout.center).toEqual({ x: 130, y: 80 });
  });

  it('adds draw.io\'s base spacing at the top (5) and bottom (1)', () => {
    // mxText.getSpacing: top = spacingTop + baseSpacingTop; bottom = -spacingBottom - baseSpacingBottom.
    expect(vertexLabelLayout(vertex(`${H}verticalAlign=top;`), BOX, 1).box).toEqual({ x: 2, y: 7, width: 116, height: 56 });
    expect(vertexLabelLayout(vertex(`${H}verticalAlign=bottom;`), BOX, 1).box).toEqual({ x: 2, y: 1, width: 116, height: 56 });
    expect(vertexLabelLayout(vertex(`${H}align=left;`), BOX, 1).box).toEqual({ x: 2, y: 2, width: 116, height: 56 });
    expect(vertexLabelLayout(vertex(`${H}align=right;`), BOX, 1).box).toEqual({ x: 2, y: 2, width: 116, height: 56 });
  });

  it('reads spacing as integers, each side adding to `spacing`', () => {
    // parseInt: spacing=2.7 is 2, spacingTop=1.9 is 1.
    const g = vertexLabelGeometry(vertex(`${H}spacing=2.7;spacingTop=1.9;verticalAlign=top;`), BOX, 1);
    expect(g.text.spacingTop).toBe(3);
    expect(g.text.spacingLeft).toBe(2);
    expect(bounds(g)).toEqual({ x: 60, y: 8, width: 116, height: 55 });
    const sides = vertexLabelLayout(vertex(`${H}spacing=0;spacingLeft=10;spacingRight=4;spacingTop=6;`), BOX, 1);
    // centre: dx = (10 - 4) / 2, dy = (6 - 0) / 2; width 120 - 14, height 60 - 6
    expect(sides.box).toEqual({ x: 10, y: 6, width: 106, height: 54 });
  });

  it('puts labels outside the shape for labelPosition and verticalLabelPosition', () => {
    // updateVertexLabelOffset: right moves by the width, bottom by the height; no
    // spacing is taken off sides that are not centred.
    expect(vertexLabelLayout(vertex(`${H}labelPosition=right;verticalLabelPosition=bottom;align=left;verticalAlign=top;`), BOX, 1).box)
      .toEqual({ x: 122, y: 67, width: 120, height: 60 });
    expect(vertexLabelLayout(vertex(`${H}labelPosition=left;align=right;`), BOX, 1).box)
      .toEqual({ x: -122, y: 2, width: 120, height: 56 });
    expect(vertexLabelLayout(vertex(`${H}verticalLabelPosition=top;verticalAlign=bottom;`), BOX, 1).box)
      .toEqual({ x: 2, y: -63, width: 116, height: 60 });
  });

  it('gives the label labelWidth, aligned like the text', () => {
    // updateVertexLabelOffset (centre, align=center): x -= (80 - 120) / 2; no side spacing then.
    expect(vertexLabelLayout(vertex(`${H}labelWidth=80;`), BOX, 1).box).toEqual({ x: 20, y: 2, width: 80, height: 56 });
    expect(vertexLabelLayout(vertex(`${H}labelWidth=80;labelPosition=left;align=right;`), BOX, 2).box)
      .toEqual({ x: -164, y: 4, width: 160, height: 52 });
  });

  it('turns the label with the shape and for horizontal=0', () => {
    expect(vertexLabelLayout(vertex(`${H}rotation=30;`), BOX, 1).rotation).toBe(30);
    // horizontal=0 swaps the box about the centre: 60 wide, 120 high, turned -90°.
    const vertical = vertexLabelLayout(vertex(`${H}horizontal=0;`), BOX, 1);
    expect(vertical).toEqual({ box: { x: 32, y: -28, width: 56, height: 116 }, rotation: -90, center: { x: 60, y: 30 } });
    expect(vertexLabelLayout(vertex(`${H}horizontal=0;rotation=30;`), BOX, 1).rotation).toBe(-60);
    // direction turns the shape, not the text.
    expect(vertexLabelLayout(vertex(`${H}direction=south;`), BOX, 1).rotation).toBe(0);
  });

  it('rotates the anchor about the vertex centre as draw.io paints it', () => {
    const g = vertexLabelGeometry(vertex(`${H}rotation=90;align=left;verticalAlign=top;`), BOX, 1);
    // anchor (2, 7) turned 90° about (60, 30) is (83, -28)
    expect(g.anchor).toEqual({ x: 2, y: 7 });
    expect(g.paintAnchor.x).toBeCloseTo(83, 9);
    expect(g.paintAnchor.y).toBeCloseTo(-28, 9);
  });

  it('can leave the rotation to the caller and takes a geometry offset', () => {
    expect(vertexLabelLayout(vertex(`${H}rotation=30;`), BOX, 1, { ignoreRotation: true }).rotation).toBe(0);
    expect(vertexLabelLayout(vertex(`${H}rotation=30;horizontal=0;`), BOX, 1, { ignoreRotation: true }).rotation).toBe(-90);
    // BOX at scale 2 is 60 × 30 units: spacing 4 per side, offset (10, -6)
    expect(vertexLabelLayout(vertex(H), BOX, 2, { offset: { x: 5, y: -3 } }).box).toEqual({ x: 14, y: -2, width: 112, height: 52 });
  });

  it('turns a label cell on an edge with labelAutoRotate', () => {
    // draw.io lays a label cell out as a vertex with an empty box at its point.
    const cell = vertex(`edgeLabel;${H}labelAutoRotate=1;`);
    const layout = vertexLabelLayout(cell, { x: 50, y: 40, width: 0, height: 0 }, 1, { edgeAngle: 135 });
    expect(layout.rotation).toBe(-45);
    expect(layout.center).toEqual({ x: 50, y: 40 });
    expect(vertexLabelLayout(cell, { x: 50, y: 40, width: 0, height: 0 }, 1).rotation).toBe(0);
  });

  it('keeps one model unit as the smallest label area (mxCellRenderer.getLabelBounds)', () => {
    expect(vertexLabelLayout(vertex(H), { x: 10, y: 10, width: 0, height: 0 }, 2).box).toEqual({ x: 11, y: 11, width: 0, height: 0 });
  });

  it('does not take spacing off fill/width overflow (legacySpacing)', () => {
    expect(vertexLabelLayout(vertex(`${H}overflow=fill;`), BOX, 1).box).toEqual(BOX);
    expect(vertexLabelLayout(vertex(`${H}overflow=width;`), BOX, 1).box).toEqual(BOX);
    expect(vertexLabelLayout(vertex(`${H}overflow=block;`), BOX, 1).box).toEqual(BOX);
    expect(vertexLabelLayout(vertex(`${H}overflow=block;blockSpacing=1;verticalAlign=top;`), BOX, 1).box)
      .toEqual({ x: 2, y: 2, width: 116, height: 56 });
  });
});

describe('shape label bounds', () => {
  const box = (style: string, rect: Rect = BOX, scale = 1) => vertexLabelLayout(vertex(style), rect, scale).box;

  it('lays a swimlane title out in its header', () => {
    // mxSwimlane.getLabelBounds: the startSize (23 for the swimlane style) strip.
    expect(box(`swimlane;${H}`, { x: 0, y: 0, width: 200, height: 100 })).toEqual({ x: 2, y: 2, width: 196, height: 19 });
    expect(box(`swimlane;startSize=40;${H}`, { x: 0, y: 0, width: 400, height: 200 }, 2)).toEqual({ x: 4, y: 4, width: 392, height: 72 });
    // flipV moves the header to the bottom.
    expect(box(`swimlane;flipV=1;${H}`, { x: 0, y: 0, width: 200, height: 100 })).toEqual({ x: 2, y: 79, width: 196, height: 19 });
    // horizontal=0: the header is the left strip, the text turned -90°.
    const vertical = vertexLabelLayout(vertex(`swimlane;horizontal=0;${H}`), { x: 0, y: 0, width: 200, height: 100 }, 1);
    expect(vertical).toEqual({ box: { x: 52, y: -48, width: 96, height: 19 }, rotation: -90, center: { x: 100, y: 50 } });
  });

  it('keeps the label off the sides of a process', () => {
    // ProcessShape.getLabelBounds: inset = round(0.1 * 120) on each side.
    expect(box(`shape=process;${H}`)).toEqual({ x: 14, y: 2, width: 92, height: 56 });
    expect(box(`shape=process;fixedSize=1;size=20;${H}`)).toEqual({ x: 22, y: 2, width: 76, height: 56 });
    // rounded: at least the corner radius (arcSize 15% of the short side).
    expect(box(`shape=process;rounded=1;${H}`)).toEqual({ x: 14, y: 2, width: 92, height: 56 });
  });

  it('applies boundedLbl margins (cube, document, cylinder, manualInput)', () => {
    expect(box(`shape=cube;${H}`)).toEqual({ x: 2, y: 2, width: 116, height: 56 });
    // CubeShape.getLabelMargins: (size, size, 0, 0) with size 20.
    expect(box(`shape=cube;boundedLbl=1;${H}`)).toEqual({ x: 22, y: 22, width: 96, height: 36 });
    // direction=south turns the margins (mxUtils.getDirectedBounds).
    expect(box(`shape=cube;boundedLbl=1;direction=south;${H}`)).toEqual({ x: 2, y: 22, width: 96, height: 36 });
    // DocumentShape: bottom margin 0.3 × height.
    expect(box(`shape=document;boundedLbl=1;${H}`)).toEqual({ x: 2, y: 2, width: 116, height: 38 });
    // mxCylinder: top margin min(40, 0.3 × height).
    expect(box(`shape=cylinder;boundedLbl=1;${H}`)).toEqual({ x: 2, y: 20, width: 116, height: 38 });
    expect(box(`shape=manualInput;boundedLbl=1;${H}`)).toEqual({ x: 2, y: 32, width: 116, height: 26 });
  });

  it('applies the margins every callout has', () => {
    // CalloutShape.getLabelMargins: bottom margin `size` (30).
    expect(box(`shape=callout;${H}`)).toEqual({ x: 2, y: 2, width: 116, height: 26 });
  });

  it('only shrinks the label when it is inside the shape', () => {
    expect(box(`shape=cube;boundedLbl=1;${H}labelPosition=right;align=left;`)).toEqual({ x: 122, y: 2, width: 120, height: 56 });
  });

  it('excludes a rectangle\'s footer', () => {
    expect(box(`rounded=0;footerSize=20;${H}`)).toEqual({ x: 2, y: 2, width: 116, height: 36 });
  });

  it('insets double shapes and double ellipses', () => {
    // ExtendedShape: max(2, 1 + 1) + margin; mxDoubleEllipse: min(3 + 1, 120 / 5, 60 / 5).
    expect(box(`shape=ext;double=1;${H}`)).toEqual({ x: 4, y: 4, width: 112, height: 52 });
    expect(box(`shape=doubleEllipse;${H}`)).toEqual({ x: 6, y: 6, width: 108, height: 48 });
    expect(box(`rhombus;double=1;${H}`)).toEqual({ x: 6, y: 6, width: 108, height: 48 });
  });
});

describe('edgeLabelLayout', () => {
  it('centres the label on the anchor', () => {
    expect(edgeLabelLayout(edge(''), { x: 50, y: 40 }, 1)).toEqual({
      box: { x: 50, y: 40, width: 0, height: 0 }, rotation: 0, center: { x: 50, y: 40 },
    });
  });

  it('moves the anchor by the spacing, with the base spacing at top and bottom', () => {
    expect(edgeLabelLayout(edge('verticalAlign=top;'), { x: 50, y: 40 }, 1).center).toEqual({ x: 50, y: 47 });
    expect(edgeLabelLayout(edge('verticalAlign=bottom;'), { x: 50, y: 40 }, 2).center).toEqual({ x: 50, y: 34 });
    expect(edgeLabelLayout(edge('align=left;spacingLeft=4;'), { x: 50, y: 40 }, 1).center).toEqual({ x: 56, y: 40 });
    expect(edgeLabelLayout(edge('align=right;'), { x: 50, y: 40 }, 1).center).toEqual({ x: 48, y: 40 });
  });

  it('gives the box the label width and turns it for horizontal=0 and labelAutoRotate', () => {
    expect(edgeLabelLayout(edge('labelWidth=60;'), { x: 50, y: 40 }, 2).box).toEqual({ x: -10, y: 40, width: 120, height: 0 });
    expect(edgeLabelLayout(edge('horizontal=0;'), { x: 50, y: 40 }, 1).rotation).toBe(-90);
    expect(edgeLabelLayout(edge('labelAutoRotate=1;'), { x: 0, y: 0 }, 1, { edgeAngle: 30 }).rotation).toBe(30);
    // kept upright: 200° reads as 20°
    expect(edgeLabelLayout(edge('labelAutoRotate=1;'), { x: 0, y: 0 }, 1, { edgeAngle: 200 }).rotation).toBe(20);
    expect(edgeLabelLayout(edge(''), { x: 0, y: 0 }, 1, { edgeAngle: 30 }).rotation).toBe(0);
  });
});

// --- painting -------------------------------------------------------------------------------

describe('HTML labels (foreignObject)', () => {
  it('writes draw.io\'s three nested boxes around the value', () => {
    const svg = vertexLabelSvg(vertex(H), 'Hello', BOX, 1);
    // updateTextNodes: x = round(60 - 59), y = round(30); the flex box spans the label width + 2.
    expect(svg).toBe('<g><g><foreignObject style="overflow: visible; text-align: left;" pointer-events="none" '
      + 'x="-9999" y="-9970" width="20116" height="20056">'
      + '<div xmlns="http://www.w3.org/1999/xhtml" style="display: flex; align-items: unsafe center; '
      + 'justify-content: unsafe center; width: 118px; height: 1px; padding-top: 10000px; margin-left: 10000px;">'
      + '<div style="box-sizing: border-box; font-size: 0; text-align: center; color: #000000; ">'
      + '<div style="display: inline-block; font-size: 12px; font-family: Helvetica; color: #000000; line-height: 1.2; '
      + 'pointer-events: none; white-space: normal; word-wrap: normal; ">Hello</div></div></div></foreignObject></g></g>');
    wellFormed(svg);
  });

  it('scales the group, not the CSS', () => {
    const svg = vertexLabelSvg(vertex(H), 'Hello', { x: 0, y: 0, width: 240, height: 120 }, 2);
    expect(svg).toContain('<g transform="scale(2)"><foreignObject');
    expect(svg).toContain('font-size: 12px');
    expect(svg).toContain('width: 118px');
  });

  it('wraps only with whiteSpace=wrap', () => {
    expect(vertexLabelSvg(vertex(H), 'x', BOX, 1)).toContain('white-space: normal; word-wrap: normal; ');
    const nowrap = vertexLabelSvg(vertex('html=1;'), 'x', BOX, 1);
    expect(nowrap).toContain('white-space: nowrap; ');
    expect(nowrap).toContain('width: 1px; height: 1px;');
  });

  it('writes the CSS of every overflow mode (mxSvgCanvas2D.createCss)', () => {
    const css = (overflow: string, clip = false) => createCss(118, 56, 'center', 'middle', true, overflow, clip, null,
      null, null, null, 'F;', 'B;', null);
    expect(css('visible')).toEqual({ dx: -59, dy: 0, flex: 'F;width: 118px; height: 1px; ', item: 'box-sizing: border-box; font-size: 0; text-align: center; ', block: 'B;white-space: normal; word-wrap: normal; ' });
    expect(css('fill')).toEqual({ dx: -59, dy: -28, flex: 'F;width: 118px; height: 56px; ', item: 'box-sizing: border-box; font-size: 0; text-align: center; width: 116px; height: 56px; overflow: hidden; ', block: 'B;width: 100%; height: 100%; white-space: normal; word-wrap: normal; ' });
    expect(css('width')).toEqual({ dx: -59, dy: 0, flex: 'F;width: 118px; height: 1px; ', item: 'box-sizing: border-box; font-size: 0; text-align: center; width: 116px; max-height: 56px; overflow: hidden; ', block: 'B;width: 100%; white-space: normal; word-wrap: normal; ' });
    expect(css('block')).toEqual({ dx: -59, dy: 0, flex: 'F;width: 118px; height: 1px; ', item: 'box-sizing: border-box; font-size: 0; text-align: center; width: 116px; max-height: 56px; ', block: 'B;width: 100%; white-space: normal; word-wrap: normal; ' });
    expect(css('visible', true)).toEqual({ dx: -59, dy: 0, flex: 'F;width: 118px; height: 1px; ', item: 'box-sizing: border-box; font-size: 0; text-align: center; max-height: 56px; overflow: hidden; ', block: 'B;white-space: normal; word-wrap: normal; ' });
  });

  it('paints the label background, border and padding around the text', () => {
    const svg = vertexLabelSvg(vertex(`${H}labelBackgroundColor=#FFF2CC;labelBorderColor=#D6B656;labelBorderWidth=3;labelPadding=2 6;`), 'x', BOX, 1);
    expect(svg).toContain('background-color: #FFF2CC; border-width: 3px; border-style: solid; border-color: inherit; '
      + 'border: 3px solid #D6B656; padding: 2px 6px 2px 6px; margin: -4px -8px -4px -8px; white-space: normal;');
    expect(svg).toContain('color: #000000; background-color: #FFF2CC; border-color: #D6B656; ');
    // clipped labels carry the background on the clipping box
    const clipped = vertexLabelSvg(vertex(`${H}overflow=width;labelBackgroundColor=#eeeeee;`), 'x', BOX, 1);
    expect(clipped).toContain('max-height: 60px; background-color: #eeeeee; overflow: hidden;');
  });

  it('writes fontStyle bits, colour, family, size and opacity', () => {
    const svg = vertexLabelSvg(vertex(`${H}fontStyle=31;fontColor=#FF0000;fontFamily=Courier New,monospace;fontSize=16;textOpacity=50;`), 'x', BOX, 1);
    expect(svg).toContain("font-size: 16px; font-family: 'Courier New', monospace; color: #FF0000; line-height: 1.2; pointer-events: none; "
      + 'font-weight: bold; font-style: italic; text-decoration: underline line-through dotted; ');
    expect(svg).toContain('<g opacity="0.5">');
    expect(vertexLabelSvg(vertex(`${H}fontStyle=4;`), 'x', BOX, 1)).toContain('text-decoration: underline; ');
    expect(vertexLabelSvg(vertex(`${H}fontStyle=8;`), 'x', BOX, 1)).toContain('text-decoration: line-through; ');
    // fontColor=none removes the key: mxText's default colour
    expect(vertexLabelSvg(vertex(`${H}fontColor=none;`), 'x', BOX, 1)).toContain('color: black;');
  });

  it('turns the text, writes the direction and writing mode, and casts textShadow', () => {
    expect(vertexLabelSvg(vertex(`${H}rotation=30;`), 'x', BOX, 1)).toContain('<g transform="rotate(30 60 30)">');
    expect(vertexLabelSvg(vertex(`${H}horizontal=0;`), 'x', { x: 0, y: 0, width: 240, height: 120 }, 2))
      .toContain('<g transform="scale(2)rotate(-90 60 30)">');
    expect(vertexLabelSvg(vertex(`${H}textDirection=rtl;`), 'x', BOX, 1)).toContain(' dir="rtl" ');
    expect(vertexLabelSvg(vertex(`${H}textDirection=auto;`), 'abc', BOX, 1)).toContain(' dir="ltr" ');
    expect(vertexLabelSvg(vertex(`${H}textDirection=vertical-rl;`), 'x', BOX, 1))
      .toContain('align-items: unsafe center; justify-content: unsafe center; writing-mode: vertical-rl;width: 1px; height: 56px;');
    expect(vertexLabelSvg(vertex(`${H}textShadow=1;`), 'x', BOX, 2)).toMatch(/^<g style="filter: drop-shadow\(4px 6px 4px rgba\(0,0,0,0\.25\)\);">/);
  });

  it('writes trailing newlines as empty lines and newlines as <br/>', () => {
    expect(vertexLabelSvg(vertex('html=1;'), 'a\nb\n\n', BOX, 1)).toContain('>a<br/>b<div><br/></div><div><br/></div></div>');
  });

  it('escapes the value of HTML labels that are not html=1', () => {
    // whiteSpace=wrap alone makes an HTML label of text (cellRenderer.getLabelValue)
    const svg = vertexLabelSvg(vertex('whiteSpace=wrap;'), 'a < b & "c"\n<b>d</b>', BOX, 1);
    expect(svg).toContain('>a &lt; b &amp; &quot;c&quot;<br/>&lt;b&gt;d&lt;/b&gt;</div>');
    wellFormed(svg);
  });

  it('sanitises html=1 values', () => {
    const svg = vertexLabelSvg(vertex('html=1;'),
      '<b onclick="x()">B</b><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">a</a>', BOX, 1);
    expect(svg).toContain('<b>B</b><img/><a>a</a>');
    expect(svg).not.toMatch(/script|onclick|onerror|javascript|alert/);
    wellFormed(svg);
  });
});

describe('plain labels (<text>)', () => {
  it('writes one <text> per line below the anchor (mxSvgCanvas2D.plainText)', () => {
    // valign middle: baseline y = 30 + 12 - 1 - (12 + 14) / 2; lines lh = round(12 × 1.2) apart
    expect(vertexLabelSvg(vertex(''), 'one\ntwo', BOX, 1)).toBe('<g><g fill="#000000" font-family="Helvetica" pointer-events="none" '
      + 'text-anchor="middle" font-size="12px"><text x="60" y="28">one</text><text x="60" y="42">two</text></g></g>');
    // scale 2: font and coordinates scaled
    expect(vertexLabelSvg(vertex(''), 'one', { x: 0, y: 0, width: 240, height: 120 }, 2))
      .toBe('<g><g fill="#000000" font-family="Helvetica" pointer-events="none" text-anchor="middle" font-size="24px">'
        + '<text x="120" y="70">one</text></g></g>');
  });

  it('anchors the text per align and places it per verticalAlign', () => {
    const svg = (style: string) => vertexLabelSvg(vertex(style), 'x', BOX, 1);
    expect(svg('align=left;verticalAlign=top;')).toContain('text-anchor="start" font-size="12px"><text x="2" y="18">');
    // bottom: anchor 60 - 2 - 1, baseline 57 + 12 - 1 - (12 + 1)
    expect(svg('align=right;verticalAlign=bottom;')).toContain('text-anchor="end" font-size="12px"><text x="118" y="55">');
  });

  it('skips blank lines but keeps their space', () => {
    expect(vertexLabelSvg(vertex('verticalAlign=top;'), 'a\n \nb', BOX, 1)).toContain('<text x="60" y="18">a</text><text x="60" y="46">b</text>');
  });

  it('escapes the text', () => {
    const svg = vertexLabelSvg(vertex(''), '<b>&"x"</b>', BOX, 1);
    expect(svg).toContain('>&lt;b&gt;&amp;"x"&lt;/b&gt;</text>');
    wellFormed(svg);
  });

  it('writes fontStyle bits, opacity, rotation and direction as attributes', () => {
    const svg = vertexLabelSvg(vertex('fontStyle=31;textOpacity=40;rotation=20;textDirection=rtl;'), 'x', BOX, 1);
    expect(svg).toContain('<g fill="#000000" font-family="Helvetica" font-weight="bold" font-style="italic" '
      + 'text-decoration="underline line-through" style="text-decoration-style: dotted;" pointer-events="none" '
      + 'direction="rtl" text-anchor="middle" transform="rotate(20,60,30)" opacity="0.4" font-size="12px">');
  });

  it('clips overflow=hidden labels to the label box', () => {
    const svg = vertexLabelSvg(vertex('align=left;verticalAlign=top;overflow=hidden;'), 'x', BOX, 1);
    // mxSvgCanvas2D.createClip(cx - 2, cy - 2, w + 4, h + 4)
    expect(svg).toContain(' clip-path="url(#mx-clip-0-5-120-60-0)">');
    expect(svg).toContain('<clipPath id="mx-clip-0-5-120-60-0"><rect x="0" y="5" width="120" height="60"/></clipPath>');
    wellFormed(svg);
  });

  it('puts a background and border behind the text', () => {
    // overflow=fill: the label box itself (addTextBackground)
    expect(vertexLabelSvg(vertex('overflow=fill;labelBackgroundColor=#eeeeee;'), 'x', BOX, 1))
      .toContain('<rect fill="#eeeeee" stroke="none" x="0" y="-1" width="120" height="62" stroke-width="0"/>');
    // otherwise around the text (font metrics stand in for getBBox)
    const svg = vertexLabelSvg(vertex('labelBackgroundColor=#eeeeee;labelBorderColor=#000000;labelPadding=3;'), 'Hello World', BOX, 1);
    const rect = RECT.exec(svg);
    expect(rect).not.toBeNull();
    // draw.io (Chromium, Arial): x 25, y 21, width 71, height 20
    expect(Math.abs(Number(rect?.[1]) - 25)).toBeLessThanOrEqual(1);
    expect(Number(rect?.[2])).toBe(21);
    expect(Math.abs(Number(rect?.[3]) - 71)).toBeLessThanOrEqual(1);
    expect(Number(rect?.[4])).toBe(20);
    expect(svg).toContain('stroke-width="1"/>');
  });

  it('gives edge labels the default white background', () => {
    expect(edgeLabelSvg(edge(''), 'yes', { x: 50, y: 50 }, 1)).toContain('<rect fill="#ffffff" stroke="none"');
    expect(edgeLabelSvg(edge('labelBackgroundColor=none;'), 'yes', { x: 50, y: 50 }, 1)).not.toContain('<rect');
  });
});

describe('what is not painted', () => {
  it('returns nothing for empty labels, noLabel and fontSize 0', () => {
    expect(vertexLabelSvg(vertex(H), '', BOX, 1)).toBe('');
    expect(edgeLabelSvg(edge(''), '', { x: 0, y: 0 }, 1)).toBe('');
    expect(vertexLabelSvg(vertex(`${H}noLabel=1;`), 'x', BOX, 1)).toBe('');
    expect(vertexLabelSvg(vertex(`${H}fontSize=0;`), 'x', BOX, 1)).toBe('');
  });

  it('drops colours and fonts that could leave their CSS declaration', () => {
    const svg = vertexLabelSvg(vertex(`${H}labelBackgroundColor=url(https://x.test/a.png);fontColor=red"onload="x;fontFamily=a\\'b"c{d}`), 'x', BOX, 1);
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('onload');
    expect(svg).toContain('color: transparent;');
    wellFormed(svg);
  });
});

describe('sanitizeLabelHtml', () => {
  it('keeps draw.io\'s formatting markup', () => {
    const html = '<b>b</b><i>i</i><u>u</u><s>s</s><sub>1</sub><sup>2</sup><font color="#ff0000" face="Arial" size="3">f</font>'
      + '<span style="font-size: 14px; color: rgb(0, 0, 255);">s</span><div style="text-align: left;">d</div><br>'
      + '<ul><li>a</li></ul><ol start="2"><li>b</li></ol><h1>h</h1><p>p</p><hr>'
      + '<table border="1" cellpadding="4"><tbody><tr><td colspan="2">c</td></tr></tbody></table><a href="https://x.test/" target="_blank">l</a>';
    expect(sanitizeLabelHtml(html)).toBe('<b>b</b><i>i</i><u>u</u><s>s</s><sub>1</sub><sup>2</sup><font color="#ff0000" face="Arial" size="3">f</font>'
      + '<span style="font-size: 14px; color: rgb(0, 0, 255)">s</span><div style="text-align: left">d</div><br/>'
      + '<ul><li>a</li></ul><ol start="2"><li>b</li></ol><h1>h</h1><p>p</p><hr/>'
      + '<table border="1" cellpadding="4"><tbody><tr><td colspan="2">c</td></tr></tbody></table>'
      + '<a href="https://x.test/" target="_blank" rel="noopener noreferrer">l</a>');
  });

  it('removes scripts, styles, embedded documents and event handlers', () => {
    expect(sanitizeLabelHtml('a<script>alert("<b>x</b>")</script>b')).toBe('ab');
    expect(sanitizeLabelHtml('a<script/>alert(1)</script>b')).toBe('ab');
    expect(sanitizeLabelHtml('<style>body{display:none}</style>x')).toBe('x');
    expect(sanitizeLabelHtml('<iframe src="https://x.test"></iframe><object data="x"></object><embed src="x">y')).toBe('y');
    expect(sanitizeLabelHtml('<svg onload="alert(1)"><circle r="2"/></svg>z')).toBe('z');
    expect(sanitizeLabelHtml('<div onmouseover="x()" ONCLICK="y()" style="color:red">t</div>')).toBe('<div style="color: red">t</div>');
    expect(sanitizeLabelHtml('<form><input value="x"><button>b</button>t</form>')).toBe('t');
    expect(sanitizeLabelHtml('<!-- c --><!doctype html>t<?pi x?>')).toBe('t');
  });

  it('removes URLs that run code or fetch', () => {
    expect(sanitizeLabelHtml('<a href="javascript:alert(1)">a</a>')).toBe('<a>a</a>');
    expect(sanitizeLabelHtml('<a href="java&#x09;script:alert(1)">a</a>')).toBe('<a>a</a>');
    expect(sanitizeLabelHtml('<a href=" JAVASCRIPT:x">a</a>')).toBe('<a>a</a>');
    expect(sanitizeLabelHtml('<a href="data:text/html,x">a</a>')).toBe('<a>a</a>');
    expect(sanitizeLabelHtml('<a href="#p">a</a>')).toBe('<a href="#p">a</a>');
    expect(sanitizeLabelHtml('<img src="https://x.test/a.png" alt="a">')).toBe('<img alt="a"/>');
    expect(sanitizeLabelHtml('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA"/>');
    expect(sanitizeLabelHtml('<span style="background: url(https://x.test/a.png); color: red">s</span>')).toBe('<span style="color: red">s</span>');
    expect(sanitizeLabelHtml('<span style="width: expression(alert(1))">s</span>')).toBe('<span>s</span>');
  });

  it('unwraps unknown elements and writes well-formed XHTML', () => {
    expect(sanitizeLabelHtml('<custom-tag>t</custom-tag><center>c</center>')).toBe('t<center>c</center>');
    expect(sanitizeLabelHtml('<b><i>x</b>y')).toBe('<b><i>x</i></b>y');
    expect(sanitizeLabelHtml('<div>open')).toBe('<div>open</div>');
    expect(sanitizeLabelHtml('</div>stray</span>')).toBe('stray');
    expect(sanitizeLabelHtml('<ul><li>a<li>b</ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(sanitizeLabelHtml('<p>a<div>b</div>')).toBe('<p>a</p><div>b</div>');
    expect(sanitizeLabelHtml('<table><tr><td>a<td>b<tr><td>c</table>')).toBe('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>');
    expect(sanitizeLabelHtml('a<br>b</br>c<br/>')).toBe('a<br/>b<br/>c<br/>');
    expect(sanitizeLabelHtml('x < y && z > 1')).toBe('x &lt; y &amp;&amp; z &gt; 1');
    expect(sanitizeLabelHtml('<span title="a&quot;b">q</span>')).toBe('<span title="a&quot;b">q</span>');
  });

  it('decodes character references (XML only knows five)', () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(sanitizeLabelHtml('a&nbsp;b&amp;c&#60;&#x3e;&copy;&bogus;')).toBe(`a${nbsp}b&amp;c&lt;&gt;${String.fromCharCode(0xa9)}&amp;bogus;`);
    for (const html of ['a&nbsp;b', '<b>x', '<p>a<div>b', '<td>x</td>', '<font color=red>r', '<a href=x title=\'t "q"\'>l</a>']) {
      expect(() => parseXml(`<x>${sanitizeLabelHtml(html)}</x>`), html).not.toThrow();
    }
  });
});

describe('labelText', () => {
  it('reads the text of html=1 labels', () => {
    expect(labelText(vertex('html=1;'), '<div>a&amp;b</div><div>c<br>d</div>')).toBe('a&b\nc\nd');
    expect(labelText(vertex('html=1;'), '<b>Hello</b>&nbsp;<i>World</i><script>x</script>')).toBe('Hello World');
    expect(labelText(vertex('html=1;'), 'line\nbreak')).toBe('line\nbreak');
    expect(labelText(vertex('html=1;'), '<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a\tb');
  });

  it('returns other values as they are', () => {
    expect(labelText(vertex(''), 'a <b>\r\nc')).toBe('a <b>\nc');
    expect(labelText(vertex('whiteSpace=wrap;'), '<b>x</b>')).toBe('<b>x</b>');
    expect(labelText(vertex('html=1;'), '')).toBe('');
  });
});

// --- shapeInside=1: text flow inside the shape (label/shapeInside.ts) ---------------------------

describe('shapeInside geometry (Graph.shapeInsideOutlines, getShapeInsideBox, …)', () => {
  it('is enabled only for wrapped labels in their default place without overflow handling', () => {
    const on = 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;';
    expect(isShapeInsideEnabled(vertex(on))).toBe(true);
    expect(isShapeInsideEnabled(vertex('ellipse;whiteSpace=wrap;shapeInside=1;'))).toBe(true);
    expect(isShapeInsideEnabled(vertex('ellipse;html=1;shapeInside=1;'))).toBe(false);
    expect(isShapeInsideEnabled(vertex('ellipse;whiteSpace=wrap;html=1;shapeInside=0;'))).toBe(false);
    for (const extra of ['horizontal=0;', 'overflow=hidden;', 'overflow=fill;', 'labelWidth=40;', 'labelPosition=left;', 'verticalLabelPosition=top;']) {
      expect(isShapeInsideEnabled(vertex(on + extra)), extra).toBe(false);
    }
    expect(isShapeInsideEnabled(vertex(`${on}horizontal=1;overflow=visible;`))).toBe(true);
  });

  it('reads shapeInsidePadding as a safe, non-negative number (2 by default)', () => {
    expect(shapeInsidePadding(vertex(''))).toBe(2);
    expect(shapeInsidePadding(vertex('shapeInsidePadding=5.5;'))).toBe(5.5);
    expect(shapeInsidePadding(vertex('shapeInsidePadding=0;'))).toBe(0);
    expect(shapeInsidePadding(vertex('shapeInsidePadding=-3;'))).toBe(2);
    expect(shapeInsidePadding(vertex('shapeInsidePadding=x;'))).toBe(2);
  });

  it('lays the content out in the label box grown by the foreignObject padding', () => {
    expect(shapeInsideBox(vertex(''), 120, 80)).toEqual({ x: 1, y: 2, width: 118, height: 76 });
    expect(shapeInsideBox(vertex('spacing=4;spacingLeft=6;spacingBottom=1;'), 120, 80)).toEqual({ x: 9, y: 4, width: 108, height: 71 });
    // top alignment moves the box down by the base spacing (5)
    expect(shapeInsideBox(vertex('verticalAlign=top;'), 120, 80)).toEqual({ x: 1, y: 7, width: 118, height: 71 });
    expect(shapeInsideBox(vertex(''), 2, 2)).toEqual({ x: 1, y: 2, width: 1, height: 1 });
  });

  it('describes each half of the label by the region outside the shape', () => {
    expect(shapeInsideOutline(vertex('rhombus;'), 80, 80)).toEqual({
      left: [[0, 0], [0.5, 0], [0, 0.5], [0.5, 1], [0, 1]],
      right: [[1, 0], [0.5, 0], [1, 0.5], [0.5, 1], [1, 1]],
    });
    const ellipse = shapeInsideOutline(vertex('ellipse;'), 120, 80);
    expect(ellipse?.left).toHaveLength(23);
    expect(ellipse?.left?.[11]).toEqual([0, 0.5]);
    expect(ellipse?.right?.[11]).toEqual([1, 0.5]);
    // fixedSize: 20px of 120 on each slanted side
    expect(shapeInsideOutline(vertex('shape=hexagon;fixedSize=1;'), 120, 80)?.left).toEqual([[0, 0], [1 / 6, 0], [0, 0.5], [1 / 6, 1], [0, 1]]);
    expect(shapeInsideOutline(vertex('shape=hexagon;'), 120, 80)?.left?.[1]).toEqual([0.25, 0]);
    expect(shapeInsideOutline(vertex('shape=hexagon;direction=north;size=0.2;'), 120, 100)?.left?.[2]).toEqual([0, 0.2]);
    expect(shapeInsideOutline(vertex('shape=parallelogram;'), 100, 60)).toEqual({ left: [[0, 0], [0.2, 0], [0, 1]], right: [[1, 0], [1, 1], [0.8, 1]] });
    expect(shapeInsideOutline(vertex('shape=parallelogram;flipH=1;'), 100, 60)).toEqual({ left: [[0, 0], [0, 1], [0.2, 1]], right: [[1, 0], [0.8, 0], [1, 1]] });
    expect(shapeInsideOutline(vertex('shape=trapezoid;flipV=1;'), 100, 60)?.left).toEqual([[0, 1], [0.2, 1], [0, 0]]);
    expect(shapeInsideOutline(vertex('shape=or;'), 60, 80)?.left).toBeNull();
    expect(shapeInsideOutline(vertex('shape=or;flipH=1;'), 60, 80)?.right).toBeNull();
    expect(shapeInsideOutline(vertex('shape=xor;'), 60, 80)?.left).toHaveLength(25);
    expect(shapeInsideOutline(vertex('shape=dataStorage;'), 100, 80)?.left?.[1]).toEqual([0.1, 0]);
    expect(shapeInsideOutline(vertex('shape=step;flipH=1;'), 100, 80)?.right).toEqual([[1, 0], [0.8, 0.5], [1, 1]]);
  });

  it('turns the triangle\'s flow with its direction and flips', () => {
    expect(shapeInsideTriangleDirection(vertex('triangle;'))).toBe('east');
    expect(shapeInsideTriangleDirection(vertex('triangle;flipH=1;'))).toBe('west');
    expect(shapeInsideTriangleDirection(vertex('triangle;direction=north;'))).toBe('north');
    // north/south swap the flip axes
    expect(shapeInsideTriangleDirection(vertex('triangle;direction=north;flipH=1;'))).toBe('south');
    expect(shapeInsideTriangleDirection(vertex('triangle;direction=north;flipV=1;'))).toBe('north');
    expect(shapeInsideOutline(vertex('triangle;direction=south;'), 80, 60)).toEqual({
      left: [[0, 1], [0.5, 1], [0, 0]], right: [[1, 1], [0.5, 1], [1, 0]],
    });
  });

  it('supports only the shapes and parameters draw.io supports', () => {
    expect(shapeInsideOutline(vertex(''), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=cloud;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=constructor;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=__proto__;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('ellipse;'), 0, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=parallelogram;direction=south;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=trapezoid;direction=west;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=step;size=0.6;'), 120, 80)).toBeNull();
    expect(shapeInsideOutline(vertex('shape=hexagon;fixedSize=1;size=70;'), 120, 80)).not.toBeNull();
    // shapeInsideShape picks another shape's flow
    expect(shapeInsideOutline(vertex('shape=cloud;shapeInsideShape=rhombus;'), 80, 80)?.left).toHaveLength(5);
    expect(shapeInsideFloats(vertex('rhombus;whiteSpace=wrap;shapeInside=1;'), 80, 80)).not.toBeNull();
    expect(shapeInsideFloats(vertex('rhombus;whiteSpace=wrap;'), 80, 80)).toBeNull();
  });

  it('gives the interior of the shape at each height for the SVG label conversion', () => {
    expect(shapeInsideBands(vertex('rhombus;'), 80, 80)?.(0.25)).toEqual([0.25, 0.75]);
    expect(shapeInsideBands(vertex('ellipse;'), 80, 80)?.(0.5)).toEqual([0, 1]);
    expect(shapeInsideBands(vertex('triangle;'), 80, 80)?.(0.25)).toEqual([0, 0.5]);
    expect(shapeInsideBands(vertex('triangle;direction=north;'), 80, 80)?.(0)).toEqual([0.5, 0.5]);
    expect(shapeInsideBands(vertex('shape=parallelogram;'), 100, 80)?.(1)).toEqual([0, 0.8]);
    expect(shapeInsideBands(vertex('shape=or;flipH=1;'), 60, 80)?.(0.5)).toEqual([0, 1]);
    expect(shapeInsideBands(vertex('shape=step;'), 100, 80)?.(0.5)).toEqual([0.2, 1]);
    expect(shapeInsideBands(vertex('shape=cloud;'), 100, 80)).toBeNull();
  });
});

/** draw.io's shapeInside labels in test/fixtures/drawio/shapes-general.0.svg: the flow wrapper and its cell. */
function shapeInsideReferences(): Array<{ value: string; wrapper: string; style: string; w: number; h: number }> {
  const svg = readFileSync(resolve(__dirname, 'fixtures/drawio/shapes-general.0.svg'), 'utf8');
  const reference = JSON.parse(readFileSync(referenceJsonPath('shapes-general'), 'utf8')) as DrawioReference;
  const cells = reference.pages[0].cells;
  const out: Array<{ value: string; wrapper: string; style: string; w: number; h: number }> = [];
  for (const m of svg.matchAll(/(<div style="float:left;text-decoration:inherit;.*?<\/div>)<\/div><\/div><\/div><\/foreignObject>/gs)) {
    const wrapper = m[1];
    const value = /([^<>]*)<\/div>$/.exec(wrapper)?.[1] ?? '';
    const cell = cells.find((c) => c.label === value && c.style.includes('shapeInside=1'));
    if (!cell?.state) throw new Error(`no cell for ${value}`);
    out.push({ value, wrapper, style: cell.style, w: cell.state.width, h: cell.state.height });
  }
  return out;
}

describe('shapeInside markup (Graph.createShapeInsideValue)', () => {
  const refs = shapeInsideReferences();

  it('finds draw.io\'s eleven flowed labels', () => {
    expect(refs.map((r) => r.value)).toEqual(['Ellipse', 'Circle', 'Diamond', 'Parallelogram', 'Hexagon', 'Triangle',
      'Step', 'Trapezoid', 'Or', 'And', 'Data']);
  });

  it('writes the floats, polygons and spacer draw.io writes', () => {
    for (const r of refs) {
      const style = vertex(r.style);
      const outline = shapeInsideFloats(style, r.w, r.h);
      expect(outline, r.value).not.toBeNull();
      const box = shapeInsideBox(style, r.w, r.h);
      // The spacer and clip draw.io measured for this label.
      const spacer = Number(/style="height:(\d+)px;pointer-events:none;"/.exec(r.wrapper)?.[1] ?? 0);
      const floatHeight = Number(/float:(?:left|right);width:\d+px;height:(\d+)px/.exec(r.wrapper)?.[1]);
      const clip = floatHeight < box.height ? floatHeight : null;
      const ours = createShapeInsideValue(outline as ShapeInsideOutline, box, spacer, r.w, r.h, r.value,
        shapeInsidePadding(style), 'middle', clip, null);
      expect(ours, r.value).toBe(r.wrapper);
    }
  });

  it('aligns the flow where draw.io\'s measurement did (computeShapeInsideSpacer)', () => {
    const misses: string[] = [];
    for (const r of refs) {
      const style = vertex(r.style);
      const outline = shapeInsideFloats(style, r.w, r.h) as ShapeInsideOutline;
      const box = shapeInsideBox(style, r.w, r.h);
      const align = computeShapeInsideSpacer(r.value, style, outline, box, r.w, r.h);
      const ours = createShapeInsideValue(outline, box, align.spacer, r.w, r.h, r.value, shapeInsidePadding(style),
        'middle', align.clip, null);
      if (ours !== r.wrapper) misses.push(`${r.value}: ${JSON.stringify(align)}\n  draw.io ${r.wrapper}\n  ours    ${ours}`);
    }
    expect(misses).toEqual([]);
  });

  it('grows the wrapper for overflow and offsets the floats by it', () => {
    const outline = shapeInsideOutline(vertex('rhombus;'), 80, 80) as ShapeInsideOutline;
    const box = shapeInsideBox(vertex(''), 80, 80);
    const value = createShapeInsideValue(outline, box, -10, 80, 80, 'x', 2, 'middle', null, null);
    expect(value).toMatch(/^<div style="float:left;text-decoration:inherit;width:78px;height:96px;">/);
    expect(value).toContain('height:86px;shape-outside:polygon(');
    expect(value).not.toContain('style="height:');
    expect(shapeInsideGrow(-10, 'bottom')).toBe(10);
    expect(shapeInsideGrow(5, 'middle')).toBe(0);
  });

  it('paints the label background behind the flowed text', () => {
    const flow = { top: 30, bottom: 44, left: 20.4, right: 60.6, lines: [[30, 44]] as Array<[number, number]> };
    expect(createShapeInsideBackground(flow, { top: 1, right: 2, bottom: 3, left: 4 }, '#ffff00', null)).toBe(
      '<div data-shape-inside="1" data-shape-inside-background="1" contenteditable="false" style="position:absolute;'
      + 'z-index:-1;box-sizing:border-box;pointer-events:none;left:16px;top:29px;width:46px;height:18px;background-color: #ffff00;"></div>');
    expect(createShapeInsideBackground(flow, null, null, 'red')).toContain('border-style:solid;border-width:1px;left:20px;top:30px;width:40px;height:14px;border-color: red;');
    expect(createShapeInsideBackground(null, null, 'red', null)).toBeNull();
  });
});

describe('shapeInside flow without a DOM (label/shapeInsideFlow.ts)', () => {
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

  /**
   * draw.io's computeShapeInsideSpacer and measureShapeInsideFlow, taken
   * from Graph.js and run in Electron 32.3.3 (Chromium 128, the browser of
   * the reference generator) on win32, gave these spacers and clips.
   */
  const MEASURED: Array<[string, string, number, number, { spacer: number; clip: number | null }]> = [
    ['ellipse;', LOREM, 120, 80, { spacer: 9, clip: null }],
    ['ellipse;', 'The quick brown fox jumps over the lazy dog and keeps running far away', 160, 100, { spacer: 27, clip: null }],
    ['rhombus;', LOREM, 120, 80, { spacer: -19, clip: null }],
    ['rhombus;', `${LOREM} sed do eiusmod tempor incididunt`, 80, 80, { spacer: -59, clip: null }],
    ['triangle;direction=north;', 'A triangle with some text in it', 120, 100, { spacer: 16, clip: null }],
    ['shape=parallelogram;fixedSize=1;', LOREM, 120, 60, { spacer: -1, clip: null }],
    ['shape=xor;', 'Exclusive or gate', 60, 80, { spacer: -21, clip: null }],
    ['shape=or;', 'And gate with text', 60, 80, { spacer: 24, clip: null }],
    ['ellipse;verticalAlign=top;', LOREM, 120, 80, { spacer: 0, clip: null }],
    ['ellipse;verticalAlign=bottom;', LOREM, 120, 80, { spacer: 10, clip: null }],
    ['rhombus;verticalAlign=bottom;', 'Is it done yet?', 120, 80, { spacer: 39, clip: null }],
    ['ellipse;fontSize=14;fontStyle=1;', LOREM, 140, 90, { spacer: 6, clip: null }],
    ['ellipse;', 'Hello <b>bold world</b><br>second line here', 120, 80, { spacer: 24, clip: null }],
    ['ellipse;', 'Supercalifragilisticexpialidocious', 80, 80, { spacer: 31, clip: 0 }],
    ['ellipse;shapeInsidePadding=6;', LOREM, 120, 80, { spacer: 0, clip: null }],
  ];

  it('aligns multi-line flows where draw.io measured them in Chromium', () => {
    const misses: string[] = [];
    for (const [extra, raw, w, h, want] of MEASURED) {
      const style = vertex(`${extra}whiteSpace=wrap;html=1;shapeInside=1;`);
      const outline = shapeInsideFloats(style, w, h) as ShapeInsideOutline;
      const got = computeShapeInsideSpacer(sanitizeLabelHtml(raw), style, outline, shapeInsideBox(style, w, h), w, h);
      if (got.spacer !== want.spacer || got.clip !== want.clip) misses.push(`${extra} ${raw}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    }
    expect(misses).toEqual([]);
  });

  it('lays lines out as Chromium does next to the shape-outside floats', () => {
    const style = vertex('ellipse;whiteSpace=wrap;html=1;shapeInside=1;');
    const outline = shapeInsideFloats(style, 120, 80) as ShapeInsideOutline;
    const flow = measureShapeInsideFlow(LOREM, style, outline, shapeInsideBox(style, 120, 80), 0, 120, 80);
    // Chromium: top 2 (the first line moved down 2px to fit), lines 14px of text every 14.390625px
    expect(flow?.top).toBe(2);
    expect(flow?.lines.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]))
      .toEqual([[2, 16], [16.39, 30.39], [30.78, 44.78], [45.17, 59.17]]);
    expect(flow?.left).toBeCloseTo(11.3, 0);
    expect(flow?.right).toBeCloseTo(106.69, 0);
    // A word that fits next to the shapes nowhere goes below the floats
    const word = vertex('ellipse;whiteSpace=wrap;html=1;shapeInside=1;');
    const below = measureShapeInsideFlow('Supercalifragilisticexpialidocious', word, shapeInsideFloats(word, 80, 80) as ShapeInsideOutline,
      shapeInsideBox(word, 80, 80), 0, 80, 80);
    expect(below?.lines).toEqual([[76, 90]]);
    expect(measureShapeInsideFlow('', style, outline, shapeInsideBox(style, 120, 80), 0, 120, 80)).toBeNull();
  });

  it('excludes a polygon grown by the shape margin (offset edges and vertex circles)', () => {
    const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(polygonExcludedInterval(square, 0, 2, 4)).toEqual([0, 10]);
    expect(polygonExcludedInterval(square, 2, 2, 4)).toEqual([-2, 12]);
    const corner = polygonExcludedInterval(square, 2, 11, 12) as [number, number];
    expect(corner[0]).toBeCloseTo(-Math.sqrt(3), 6);
    expect(corner[1]).toBeCloseTo(10 + Math.sqrt(3), 6);
    expect(polygonExcludedInterval(square, 2, 20, 21)).toBeNull();
    expect(polygonExcludedInterval([[0, 0], [10, 10], [0, 10]], 0, 0, 5)).toEqual([0, 5]);
  });

  it('fits the font size to the flow for autosizeText (computeShapeInsideFontSize)', () => {
    const style = vertex('ellipse;whiteSpace=wrap;html=1;shapeInside=1;');
    const outline = shapeInsideFloats(style, 120, 80) as ShapeInsideOutline;
    const size = computeShapeInsideFontSize('Short', style, outline, 120, 80) as number;
    expect(size).toBeGreaterThan(14);
    expect(computeShapeInsideFontSize(LOREM, style, outline, 120, 80)).toBeLessThan(size);
    expect(computeShapeInsideFontSize('', style, outline, 120, 80)).toBeNull();
  });
});

describe('shapeInside labels (the mxText.paint override)', () => {
  const ELLIPSE = 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;';
  const CELL: Rect = { x: 0, y: 0, width: 120, height: 80 };

  it('paints the value in its flow inside the label box', () => {
    const svg = vertexLabelSvg(vertex(ELLIPSE), 'Ellipse', CELL, 1);
    wellFormed(svg);
    expect(svg).toContain('<div style="float:left;text-decoration:inherit;width:118px;height:76px;"><div data-shape-inside="1"');
    expect(svg).toContain('style="height:31px;pointer-events:none;"></div>Ellipse</div></div></div></div></foreignObject>');
    // draw.io lays the flow out in model units at any view scale
    const two = vertexLabelSvg(vertex(ELLIPSE), 'Ellipse', { x: 0, y: 0, width: 240, height: 160 }, 2);
    expect(two.replace(/^<g><g transform="scale\(2\)"/, '<g><g')).toBe(svg);
  });

  it('paints labels without the flow when it does not apply', () => {
    expect(vertexLabelSvg(vertex('ellipse;html=1;shapeInside=1;'), 'x', CELL, 1)).not.toContain('data-shape-inside');
    expect(vertexLabelSvg(vertex(`${ELLIPSE}labelPosition=left;`), 'x', CELL, 1)).not.toContain('data-shape-inside');
    expect(vertexLabelSvg(vertex('shape=cloud;whiteSpace=wrap;html=1;shapeInside=1;'), 'x', CELL, 1)).not.toContain('data-shape-inside');
    expect(edgeLabelSvg(edge('whiteSpace=wrap;html=1;shapeInside=1;shape=ellipse;'), 'x', { x: 0, y: 0 }, 1)).not.toContain('data-shape-inside');
    expect(vertexLabelSvg(vertex('ellipse;whiteSpace=wrap;shapeInside=1;'), 'a & b', CELL, 1)).toContain('a &amp; b</div>');
  });

  it('paints the label background around the flowed text, not over the shape', () => {
    const svg = vertexLabelSvg(vertex(`${ELLIPSE}labelBackgroundColor=#ffff00;labelBorderColor=#ff0000;`), 'Ellipse', CELL, 1);
    wellFormed(svg);
    expect(svg).toContain('position:relative;z-index:0;width:118px;height:76px;"><div data-shape-inside="1" data-shape-inside-background="1"');
    expect(svg.match(/background-color: #ffff00;/g)).toHaveLength(1);
    expect(svg).toContain('border-style:solid;border-width:1px;');
    expect(svg).not.toContain('border: 1px solid');
  });

  it('keeps trailing newlines as empty lines inside the flow', () => {
    const svg = vertexLabelSvg(vertex(ELLIPSE), 'a\nb\n', CELL, 1);
    wellFormed(svg);
    expect(svg).toContain('a<br/>b<div><br/></div></div>');
  });
});
