import { describe, expect, it } from 'vitest';
import { parseXml, serializeXml } from '../src/shared/diagram/xml.js';
import {
  getStyleValue, parseStyleString, resolveStyle, setStyleValue, styleFlag, styleNumber,
} from '../src/shared/diagram/style.js';
import { compressDiagram, decompressDiagram, readDrawio, writeDrawio } from '../src/shared/diagram/drawioFile.js';
import { absoluteBounds, cellLabel, isShown } from '../src/shared/diagram/model.js';

/**
 * The draw.io file format and style strings (src/shared/diagram): what
 * DeckWerk reads from a .drawio file is what draw.io wrote, and writing it
 * back keeps every cell, id, style, value and geometry.
 */

const FILE = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" agent="test" version="24.0.0">
  <diagram id="p1" name="Method">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169" math="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="hidden" value="Notes" parent="0" visible="0" />
        <mxCell id="a" value="Encoder" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="40" y="60" width="120" height="60" as="geometry" />
        </mxCell>
        <object label="Decoder &amp;lt;b&amp;gt;x&amp;lt;/b&amp;gt;" tooltip="tip" weight="3" id="b">
          <mxCell style="ellipse;html=1;" vertex="1" parent="1">
            <mxGeometry x="260" y="60" width="80" height="80" as="geometry" />
          </mxCell>
        </object>
        <mxCell id="e1" value="z" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="a" target="b">
          <mxGeometry x="-0.2" y="10" relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="200" y="90" />
              <mxPoint x="200" y="100" />
            </Array>
            <mxPoint as="offset" x="3" y="-4" />
          </mxGeometry>
        </mxCell>
        <mxCell id="lbl" value="label on edge" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1">
          <mxGeometry x="0.5" y="-1" relative="1" as="geometry">
            <mxPoint as="offset" />
          </mxGeometry>
        </mxCell>
        <mxCell id="g" value="" style="group" vertex="1" connectable="0" parent="1">
          <mxGeometry x="400" y="300" width="200" height="100" as="geometry" />
        </mxCell>
        <mxCell id="child" value="In group" style="rounded=0;" vertex="1" parent="g">
          <mxGeometry x="10" y="20" width="50" height="30" as="geometry" />
        </mxCell>
        <mxCell id="port" value="" style="ellipse;" vertex="1" parent="a">
          <mxGeometry x="1" y="0.5" width="10" height="10" relative="1" as="geometry">
            <mxPoint x="-5" y="-5" as="offset" />
          </mxGeometry>
        </mxCell>
        <mxCell id="loose" style="endArrow=classic;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="10" y="400" as="sourcePoint" />
            <mxPoint x="110" y="400" as="targetPoint" />
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

describe('XML', () => {
  it('reads elements, attributes, entities, comments and CDATA', () => {
    const root = parseXml('<?xml version="1.0"?><!-- hi --><a x="1 &amp; 2" y=\'&lt;q&gt;\'><b/>text &#x41;&#66;<![CDATA[<raw>]]></a>');
    expect(root.name).toBe('a');
    expect(root.attrs).toEqual({ x: '1 & 2', y: '<q>' });
    expect(root.children[0]).toEqual({ name: 'b', attrs: {}, children: [] });
    expect(root.children[1]).toBe('text AB<raw>');
  });

  it('refuses malformed input with a position', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(/Mismatched/);
    expect(() => parseXml('<a x=1/>')).toThrow(/quoted/);
  });

  it('writes what it reads', () => {
    const root = parseXml('<a k="&quot;v&quot;&#10;"><b n="1"/><c>t &amp; u</c></a>');
    expect(parseXml(serializeXml(root, '  '))).toEqual(root);
  });
});

describe('style strings', () => {
  it('keeps the order and spelling of what it does not change', () => {
    const style = 'ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;';
    expect(setStyleValue(style, 'fillColor', '#f8cecc')).toBe('ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;');
    expect(setStyleValue(style, 'dashed', 1)).toBe('ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;dashed=1;');
    expect(setStyleValue(style, 'html', null)).toBe('ellipse;whiteSpace=wrap;fillColor=#dae8fc;');
    expect(getStyleValue(style, 'fillColor')).toBe('#dae8fc');
    expect(parseStyleString(';a=1;;b')).toEqual([{ key: 'a', value: '1' }, { key: null, value: 'b' }]);
  });

  it('resolves defaults, named styles, none and default colours as draw.io does', () => {
    const vertex = resolveStyle('ellipse;fillColor=#ffcc00;', 'vertex');
    expect(vertex.shape).toBe('ellipse');
    expect(vertex.perimeter).toBe('ellipsePerimeter');
    expect(vertex.fillColor).toBe('#ffcc00');
    expect(vertex.strokeColor).toBe('#000000');
    expect(vertex.fontSize).toBe('12');

    const text = resolveStyle('text;html=1;', 'vertex');
    expect(text.fillColor).toBe('none');
    expect(text.align).toBe('left');

    const removed = resolveStyle('strokeColor=none;', 'vertex');
    expect(removed.strokeColor).toBeUndefined();

    const edge = resolveStyle('edgeStyle=orthogonalEdgeStyle;rounded=0;', 'edge');
    expect(edge.endArrow).toBe('classic');
    expect(edge.rounded).toBe('0');
    expect(edge.labelBackgroundColor).toBe('#ffffff');

    expect(resolveStyle(';shape=cloud;', 'vertex')).toEqual({ shape: 'cloud' });
    expect(styleNumber(vertex, 'fontSize', 0)).toBe(12);
    expect(styleFlag(resolveStyle('dashed=1;', 'vertex'), 'dashed')).toBe(true);
  });
});

describe('.drawio files', () => {
  it('reads pages, cells, objects, geometry, labels on edges and layers', async () => {
    const doc = await readDrawio(FILE);
    expect(doc.attributes.host).toBe('app.diagrams.net');
    expect(doc.pages).toHaveLength(1);
    const page = doc.pages[0];
    expect(page.name).toBe('Method');
    expect(page.model.pageWidth).toBe('827');
    const byId = new Map(page.cells.map((c) => [c.id, c]));
    expect(byId.get('0')!.kind).toBe('root');
    expect(byId.get('1')!.kind).toBe('layer');
    expect(byId.get('hidden')!.kind).toBe('layer');
    expect(byId.get('hidden')!.visible).toBe(false);
    expect(byId.get('a')!.geometry).toMatchObject({ x: 40, y: 60, width: 120, height: 60, relative: false });
    const b = byId.get('b')!;
    expect(b.object).toEqual({ tag: 'object', attrs: { label: 'Decoder &lt;b&gt;x&lt;/b&gt;', tooltip: 'tip', weight: '3' } });
    expect(cellLabel(b)).toBe('Decoder &lt;b&gt;x&lt;/b&gt;');
    const edge = byId.get('e1')!;
    expect(edge.kind).toBe('edge');
    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
    expect(edge.geometry).toMatchObject({ x: -0.2, y: 10, relative: true, points: [{ x: 200, y: 90 }, { x: 200, y: 100 }], offset: { x: 3, y: -4 } });
    expect(byId.get('lbl')!.connectable).toBe(false);
    expect(byId.get('loose')!.geometry).toMatchObject({ sourcePoint: { x: 10, y: 400 }, targetPoint: { x: 110, y: 400 } });
  });

  it('places children in their group and ports on their parent', async () => {
    const page = (await readDrawio(FILE)).pages[0];
    const boxes = absoluteBounds(page);
    expect(boxes.get('child')).toEqual({ x: 410, y: 320, width: 50, height: 30 });
    // x=1, y=0.5 of a (40,60 120x60) plus offset (-5,-5).
    expect(boxes.get('port')).toEqual({ x: 155, y: 85, width: 10, height: 10 });
    expect(isShown(page, 'child')).toBe(true);
  });

  it('writes a file draw.io reads back to the same cells', async () => {
    const doc = await readDrawio(FILE);
    const written = await writeDrawio(doc);
    const again = await readDrawio(written);
    expect(again.pages[0].cells).toEqual(doc.pages[0].cells);
    expect(again.pages[0].model).toEqual(doc.pages[0].model);
    expect(written).toContain('<mxfile');
    expect(written).toContain('host="app.diagrams.net"');
  });

  it('reads and writes compressed pages', async () => {
    const doc = await readDrawio(FILE);
    const compressed = await writeDrawio(doc, { compressed: true });
    expect(compressed).not.toContain('<mxGraphModel');
    const again = await readDrawio(compressed);
    expect(again.pages[0].cells).toEqual(doc.pages[0].cells);
    const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>';
    expect(await decompressDiagram(await compressDiagram(xml))).toBe(xml);
  });

  it('reads a bare model and draw.io\'s editable SVG', async () => {
    const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="v" value="x" vertex="1" parent="1"><mxGeometry width="10" height="10" as="geometry"/></mxCell></root></mxGraphModel>';
    expect((await readDrawio(model)).pages[0].cells).toHaveLength(3);
    const content = `<mxfile><diagram name="P">${model}</diagram></mxfile>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"><g/></svg>`;
    const fromSvg = await readDrawio(svg);
    expect(fromSvg.pages[0].name).toBe('P');
    expect(fromSvg.pages[0].cells.map((c) => c.id)).toEqual(['0', '1', 'v']);
  });
});
