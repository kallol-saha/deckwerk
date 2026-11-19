import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Slide } from '../src/shared/deck.js';
import { cellContextChanged, cellMarkupOptions, diagramContextKey } from '../src/shared/diagram/cellContext.js';
import { elementsToPage, pageToElements } from '../src/shared/diagram/convert.js';
import { readDrawio, writeDrawio } from '../src/shared/diagram/drawioFile.js';
import { connectorMarkup, vertexMarkup } from '../src/shared/diagram/element.js';
import {
  drawioFromPng, figureCells, figureDrawioXml, figureSvg, figureUsesMath, isPng, katexCssFor, pngWithDiagram, readDiagramFile,
} from '../src/shared/diagram/figureExport.js';
import { inflateDiagramChunk } from '../src/shared/diagram/figureInflate.js';
import { KATEX_CSS } from '../src/shared/katexInline.js';
import { DRAWIO_FIXTURE_DIR } from './support/drawioReference.js';

async function slideFrom(xml: string): Promise<Slide> {
  const doc = await readDrawio(xml);
  let n = 0;
  const { elements, meta } = pageToElements(doc.pages[0], {
    diagramId: 'd', placement: { origin: { x: 0, y: 0 }, scale: 1 }, makeId: (p) => `${p}-${++n}`,
  });
  return { id: 's', name: 'Fig', elements, diagrams: { d: meta } } as unknown as Slide;
}

/** A 1×1 PNG. */
const TINY_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

const PLACEHOLDERS = `<mxfile><diagram name="Pg" id="p"><mxGraphModel><root>
  <object id="0" project="DISCO" label=""><mxCell /></object>
  <object id="1" label="" layerTag="L1"><mxCell parent="0" /></object>
  <object id="g" label="" team="Robots"><mxCell style="group" vertex="1" parent="1"><mxGeometry x="10" y="10" width="300" height="100" as="geometry" /></mxCell></object>
  <object id="a" label="%project% / %team% / %layerTag% / %own% / %page% / %missing%" placeholders="1" own="mine">
    <mxCell style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="g"><mxGeometry x="0" y="0" width="200" height="60" as="geometry" /></mxCell>
  </object>
</root></mxGraphModel></diagram></mxfile>`;

describe('placeholders from ancestors and the page', () => {
  it('fill from the cell, its group, its layer, then the root cell', async () => {
    const slide = await slideFrom(PLACEHOLDERS);
    const cell = slide.elements.find((e) => e.type === 'vertex' && e.cell === 'a')!;
    if (cell.type !== 'vertex') throw new Error('vertex');
    const svg = vertexMarkup(cell, cellMarkupOptions(slide, cell));
    expect(svg).toContain('DISCO / Robots / L1 / mine / Pg / %missing%');
    // Without the slide only the cell's own property fills in.
    expect(vertexMarkup(cell)).toContain('%project% / %team% / %layerTag% / mine');
  });
  it('the page properties survive a round trip through the slide', async () => {
    const slide = await slideFrom(PLACEHOLDERS);
    const page = elementsToPage(slide, 'd');
    const root = page.cells.find((c) => c.kind === 'root')!;
    expect(root.object?.attrs.project).toBe('DISCO');
    const again = await readDrawio(await writeDrawio({ attributes: {}, pages: [page] }));
    expect(again.pages[0].cells.find((c) => c.kind === 'root')?.object?.attrs.project).toBe('DISCO');
  });
  it('a changed ancestor property or math switch redraws the cell', async () => {
    const slide = await slideFrom(PLACEHOLDERS);
    const cell = slide.elements.find((e) => e.type === 'vertex' && e.cell === 'a')!;
    if (cell.type !== 'vertex') throw new Error('vertex');
    const next = structuredClone(slide);
    const group = next.elements.find((e) => e.type === 'vertex' && e.cell === 'g')!;
    if (group.type === 'vertex' && group.object) group.object.attrs.team = 'Arms';
    expect(cellContextChanged(next, slide, cell)).toBe(true);
    expect(diagramContextKey(next)).not.toBe(diagramContextKey(slide));
    const math = structuredClone(slide);
    math.diagrams!.d.model.math = '1';
    expect(cellContextChanged(math, slide, cell)).toBe(true);
  });
});

describe('figure export', () => {
  it('keeps chosen cells with their children and loosens cut connector ends', async () => {
    const slide = await slideFrom(await readFile(`${DRAWIO_FIXTURE_DIR}/labels-math.drawio`, 'utf8'));
    const loss = slide.elements.find((e) => e.type === 'vertex' && e.cell === 'loss')!;
    const edge = slide.elements.find((e) => e.type === 'connector' && e.cell === 'edge')!;
    const cells = figureCells(slide, [loss.id, edge.id]);
    expect(cells.map((c) => c.cell).sort()).toEqual(['edge', 'loss']);
    const cut = cells.find((c) => c.type === 'connector');
    expect(cut?.type === 'connector' && cut.target).toBe(null);
    expect(cut?.type === 'connector' && cut.targetPoint).not.toBe(null);
  });

  it('writes an SVG that carries the diagram, KaTeX styles and text fallbacks', async () => {
    const slide = await slideFrom(await readFile(`${DRAWIO_FIXTURE_DIR}/labels-math.drawio`, 'utf8'));
    const cells = figureCells(slide);
    expect(figureUsesMath(slide, cells)).toBe(true);
    const drawio = await figureDrawioXml(slide, cells);
    const probe = figureSvg(slide, cells);
    const css = katexCssFor(probe, KATEX_CSS);
    // Fonts only for the families the formulas use (every rule is kept).
    const faces = [...css.matchAll(/@font-face\{[^}]*font-family:(KaTeX_\w+)/g)].map((m) => m[1]);
    expect(faces).toContain('KaTeX_Main');
    expect(faces).toContain('KaTeX_Caligraphic');
    expect(faces).not.toContain('KaTeX_Fraktur');
    const svg = figureSvg(slide, cells, { border: 10, css, drawio, background: '#ffffff' });
    expect(svg).toMatch(/<svg [^>]*content="&lt;mxfile/);
    expect(svg).toContain('<switch><foreignObject');
    expect(svg).toContain('requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility"');
    // The file reopens with the same cells.
    const back = await readDiagramFile(svg);
    expect(back.pages[0].cells.filter((c) => c.kind === 'vertex' || c.kind === 'edge').map((c) => c.id).sort())
      .toEqual(cells.map((c) => c.cell).sort());
    expect(back.pages[0].model.math).toBe('1');
  });

  it('puts the diagram in a PNG tEXt chunk and reads it back, zTXt too', async () => {
    const xml = '<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
    const png = pngWithDiagram(TINY_PNG, xml, 192);
    expect(isPng(png)).toBe(true);
    expect(drawioFromPng(png)).toBe(xml);
    expect((await readDiagramFile(png)).pages[0].name).toBe('P');
    // The chunk sits before IDAT, as draw.io writes it, with a valid pHYs.
    const text = Buffer.from(png).toString('latin1');
    expect(text.indexOf('tEXtmxfile')).toBeLessThan(text.indexOf('IDAT'));
    expect(text).toContain('pHYs');
    // Writing again replaces rather than duplicates.
    const twice = pngWithDiagram(png, xml, 96);
    expect(Buffer.from(twice).toString('latin1').split('tEXtmxfile').length).toBe(2);
    // zTXt (zlib), as the PNG spec and draw.io's CLI write it.
    const z = Buffer.concat([Buffer.from('mxfile\0\0', 'latin1'), deflateSync(Buffer.from(encodeURIComponent(xml)))]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(z.length);
    const idat = Buffer.from(TINY_PNG).indexOf('IDAT') - 4;
    const withZ = Buffer.concat([Buffer.from(TINY_PNG.subarray(0, idat)), len, Buffer.from('zTXt'), z, Buffer.alloc(4), Buffer.from(TINY_PNG.subarray(idat))]);
    expect(drawioFromPng(new Uint8Array(withZ), inflateDiagramChunk)).toBe(xml);
    await expect(readDiagramFile(TINY_PNG)).rejects.toThrow(/no draw.io diagram/);
  });

  it('connector markup typesets edge labels with math', async () => {
    const slide = await slideFrom(await readFile(`${DRAWIO_FIXTURE_DIR}/labels-math.drawio`, 'utf8'));
    const edge = slide.elements.find((e) => e.type === 'connector')!;
    if (edge.type !== 'connector') throw new Error('connector');
    expect(connectorMarkup(edge, cellMarkupOptions(slide, edge))).toContain('class="katex"');
  });
});
