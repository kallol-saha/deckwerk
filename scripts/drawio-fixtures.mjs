// Generates the draw.io reference fixtures (test/fixtures/drawio/*.drawio).
// Usage: node scripts/drawio-fixtures.mjs test/fixtures/drawio
// then: npx vite-node --config vitest.config.ts scripts/drawio-reference.mts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: node gen.mjs <outDir>');
mkdirSync(outDir, { recursive: true });

// --- XML helpers ---------------------------------------------------------------

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;');
}

function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

const MODEL_ATTRS = {
  dx: '0', dy: '0', grid: '1', gridSize: '10', guides: '1', tooltips: '1', connect: '1', arrows: '1',
  fold: '1', page: '1', pageScale: '1', pageWidth: '850', pageHeight: '1100', math: '0', shadow: '0',
};

class Page {
  constructor(id, name, modelAttrs = {}) {
    this.id = id;
    this.name = name;
    this.modelAttrs = { ...MODEL_ATTRS, ...modelAttrs };
    this.cells = [];
    this.ids = new Set();
    this.raw('<mxCell id="0" />');
    this.raw('<mxCell id="1" parent="0" />');
    this.ids.add('0');
    this.ids.add('1');
  }

  raw(xml) {
    this.cells.push(xml);
  }

  claim(id) {
    if (this.ids.has(id)) throw new Error(`${this.id}: duplicate cell id ${id}`);
    this.ids.add(id);
  }

  /** A layer: a child of the root cell. */
  layer(id, value, opts = {}) {
    this.claim(id);
    const cell = `<mxCell${attrs({ id, value, style: opts.style, visible: opts.visible === false ? '0' : undefined, parent: '0' })} />`;
    if (opts.object) {
      this.raw(`<${opts.object.tag}${attrs({ ...opts.object.attrs, id })}>\n  <mxCell${attrs({ style: opts.style, parent: '0' })} />\n</${opts.object.tag}>`);
    } else {
      this.raw(cell);
    }
    return id;
  }

  /** A vertex. Geometry is relative to `parent` as in the file format. */
  v(id, value, style, x, y, w, h, opts = {}) {
    this.claim(id);
    const geo = { x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h) };
    if (geo.x === '0') delete geo.x;
    if (geo.y === '0') delete geo.y;
    if (geo.width === '0') delete geo.width;
    if (geo.height === '0') delete geo.height;
    const geoAttrs = { ...geo, relative: opts.relative ? '1' : undefined, as: 'geometry' };
    const children = [];
    if (opts.offset) children.push(`<mxPoint${attrs({ x: fmt(opts.offset[0]), y: fmt(opts.offset[1]), as: 'offset' })} />`);
    const geometry = children.length
      ? `<mxGeometry${attrs(geoAttrs)}>\n    ${children.join('\n    ')}\n  </mxGeometry>`
      : `<mxGeometry${attrs(geoAttrs)} />`;
    const cellAttrs = {
      id: opts.object ? undefined : id,
      value: opts.object ? undefined : value,
      style,
      vertex: '1',
      connectable: opts.connectable === false ? '0' : undefined,
      visible: opts.visible === false ? '0' : undefined,
      parent: opts.parent ?? '1',
    };
    const mxCell = `<mxCell${attrs(cellAttrs)}>\n  ${geometry}\n</mxCell>`;
    if (opts.object) {
      this.raw(`<${opts.object.tag}${attrs({ label: value, ...opts.object.attrs, id })}>\n${indent(mxCell, 1)}\n</${opts.object.tag}>`);
    } else {
      this.raw(mxCell);
    }
    return id;
  }

  /**
   * An edge. `opts.points` are waypoints, `opts.sourcePoint`/`targetPoint`
   * loose ends, `opts.label` = [x, y] the label position along the edge and
   * `opts.offset` its absolute offset.
   */
  e(id, value, style, source, target, opts = {}) {
    this.claim(id);
    const geoAttrs = {};
    if (opts.label) {
      if (opts.label[0] !== 0) geoAttrs.x = fmt(opts.label[0]);
      if (opts.label[1] !== 0) geoAttrs.y = fmt(opts.label[1]);
    }
    if (opts.width) geoAttrs.width = fmt(opts.width);
    geoAttrs.relative = '1';
    geoAttrs.as = 'geometry';
    const children = [];
    if (opts.sourcePoint) children.push(`<mxPoint${attrs({ x: fmt(opts.sourcePoint[0]), y: fmt(opts.sourcePoint[1]), as: 'sourcePoint' })} />`);
    if (opts.targetPoint) children.push(`<mxPoint${attrs({ x: fmt(opts.targetPoint[0]), y: fmt(opts.targetPoint[1]), as: 'targetPoint' })} />`);
    if (opts.points && opts.points.length) {
      children.push(`<Array as="points">\n${opts.points.map(([x, y]) => `      <mxPoint${attrs({ x: fmt(x), y: fmt(y) })} />`).join('\n')}\n    </Array>`);
    }
    if (opts.offset) children.push(`<mxPoint${attrs({ x: fmt(opts.offset[0]), y: fmt(opts.offset[1]), as: 'offset' })} />`);
    const geometry = children.length
      ? `<mxGeometry${attrs(geoAttrs)}>\n    ${children.join('\n    ')}\n  </mxGeometry>`
      : `<mxGeometry${attrs(geoAttrs)} />`;
    const cellAttrs = {
      id: opts.object ? undefined : id,
      value: opts.object ? undefined : value,
      style,
      edge: '1',
      visible: opts.visible === false ? '0' : undefined,
      parent: opts.parent ?? '1',
      source: source ?? undefined,
      target: target ?? undefined,
    };
    const mxCell = `<mxCell${attrs(cellAttrs)}>\n  ${geometry}\n</mxCell>`;
    if (opts.object) {
      this.raw(`<${opts.object.tag}${attrs({ label: value, ...opts.object.attrs, id })}>\n${indent(mxCell, 1)}\n</${opts.object.tag}>`);
    } else {
      this.raw(mxCell);
    }
    return id;
  }

  modelXml(pretty) {
    const body = this.cells.map((c) => (pretty ? indent(c, 2) : c.replace(/\n\s*/g, ''))).join(pretty ? '\n' : '');
    return pretty
      ? `<mxGraphModel${attrs(this.modelAttrs)}>\n  <root>\n${body}\n  </root>\n</mxGraphModel>`
      : `<mxGraphModel${attrs(this.modelAttrs)}><root>${body}</root></mxGraphModel>`;
  }
}

function indent(text, levels) {
  const pad = '  '.repeat(levels);
  return text.split('\n').map((line) => pad + line).join('\n');
}

function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}

/** draw.io's Graph.compress: encodeURIComponent → deflateRaw → base64. */
function compress(xml) {
  return deflateRawSync(Buffer.from(encodeURIComponent(xml), 'utf8')).toString('base64');
}

function writeFile(name, pages, options = {}) {
  const diagrams = pages.map((page) => {
    const head = `  <diagram${attrs({ id: page.id, name: page.name })}>`;
    if (options.compressed?.includes(page.id)) {
      return `${head}${compress(page.modelXml(false))}</diagram>`;
    }
    return `${head}\n${indent(page.modelXml(true), 2)}\n  </diagram>`;
  });
  const xml = `<mxfile host="deckwerk-fixtures" agent="drawio-reference fixtures" version="32.7.4"${pages.length > 1 ? ` pages="${pages.length}"` : ''}>\n${diagrams.join('\n')}\n</mxfile>\n`;
  writeFileSync(join(outDir, `${name}.drawio`), xml);
  const count = pages.map((p) => p.cells.length - 2);
  console.log(`${name}.drawio: ${count.join(' + ')} cells`);
}

/** Flow layout: left to right, wrapping at maxWidth. Mutates items (adds x, y). */
function flow(items, { x0 = 20, y0 = 20, maxWidth = 820, gapX = 30, gapY = 40 } = {}) {
  let x = x0;
  let y = y0;
  let rowH = 0;
  for (const it of items) {
    if (x > x0 && x + it.w > x0 + maxWidth) {
      x = x0;
      y += rowH + gapY;
      rowH = 0;
    }
    it.x = x;
    it.y = y;
    x += it.w + gapX;
    rowH = Math.max(rowH, it.h);
  }
  return y + rowH;
}

// A small self-contained raster-free icon for image shapes (draw.io's palette
// uses a PNG from its stencils folder, which our renderer would not have).
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#4a90d9"/><rect x="20" y="20" width="24" height="24" rx="4" fill="#ffffff"/></svg>';
function iconUri() {
  let svg = ICON_SVG;
  while (Buffer.byteLength(svg) % 3 !== 0) svg += ' ';
  return `data:image/svg+xml,${Buffer.from(svg).toString('base64')}`;
}
const ICON = iconUri();

// --- palettes ---------------------------------------------------------------

const GENERAL_FIELD = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;';
const ADVANCED_FIELD = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;';
const TEXT_STYLE = 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;';
const TEXTBOX_VALUE = '<h1 style="margin-top: 0px;">Heading</h1><p>Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>';

// Sidebar.addGeneralPalette: [id, label, style, w, h]
const GENERAL = [
  ['rect', 'Rectangle', 'rounded=0;whiteSpace=wrap;html=1;', 120, 60],
  ['rounded-rect', 'Rounded', 'rounded=1;whiteSpace=wrap;html=1;roundedPerimeter=1;', 120, 60],
  ['text', 'Text', TEXT_STYLE, 60, 30],
  ['textbox', TEXTBOX_VALUE, 'text;html=1;whiteSpace=wrap;overflow=hidden;rounded=0;', 180, 120],
  ['ellipse', 'Ellipse', 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;', 120, 80],
  ['square', 'Square', 'whiteSpace=wrap;html=1;aspect=fixed;', 80, 80],
  ['circle', 'Circle', 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;aspect=fixed;', 80, 80],
  ['process', 'Process', 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;', 120, 60],
  ['diamond', 'Diamond', 'rhombus;whiteSpace=wrap;html=1;shapeInside=1;', 80, 80],
  ['parallelogram', 'Parallelogram', 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', 120, 60],
  ['hexagon', 'Hexagon', 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', 120, 80],
  ['triangle', 'Triangle', 'triangle;whiteSpace=wrap;html=1;shapeInside=1;', 60, 80],
  ['cylinder', 'Cylinder', 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;', 60, 80],
  ['cloud', 'Cloud', 'ellipse;shape=cloud;whiteSpace=wrap;html=1;perimeter=cloudPerimeter;', 120, 80],
  ['document', 'Document', 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', 120, 80],
  ['internal-storage', 'Storage', 'shape=internalStorage;whiteSpace=wrap;html=1;backgroundOutline=1;', 80, 80],
  ['cube', 'Cube', 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;', 120, 80],
  ['step', 'Step', 'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', 120, 80],
  ['trapezoid', 'Trapezoid', 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', 120, 60],
  ['tape', 'Tape', 'shape=tape;whiteSpace=wrap;html=1;', 120, 100],
  ['note', 'Note', 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;', 80, 100],
  ['card', 'Card', 'shape=card;whiteSpace=wrap;html=1;', 80, 100],
  ['callout', 'Callout', 'shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;', 120, 80],
  ['wedge-callout', 'Wedge', 'shape=wedgeCallout;whiteSpace=wrap;html=1;', 120, 80],
  ['actor', 'Actor', 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;', 30, 60],
  ['or', 'Or', 'shape=xor;whiteSpace=wrap;html=1;shapeInside=1;', 60, 80],
  ['and', 'And', 'shape=or;whiteSpace=wrap;html=1;shapeInside=1;', 60, 80],
  ['data-storage', 'Data', 'shape=dataStorage;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', 100, 80],
];

const GENERAL_CONTAINERS = [
  ['container', '', 'swimlane;startSize=0;', 200, 200],
  ['vertical-container', 'Vertical Container', 'swimlane;whiteSpace=wrap;html=1;', 200, 200],
  ['horizontal-container', 'Horizontal Container', 'swimlane;horizontal=0;whiteSpace=wrap;html=1;', 200, 200],
];

const GENERAL_LIST = 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;';
const ADVANCED_LIST = 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;fillColor=none;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;html=1;';

// Sidebar.addMiscPalette (vertices; its connectors are in the edge fixtures).
// Timestamp (%date%, changes with time), the tables, vertical list and
// process bar (compressed cell groups, not shapes of their own) are left out.
const MISC = [
  ['autosize-text', 'Text', 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;autosize=1;resizable=0;', 60, 30],
  ['autosize-title', 'Autosize Title', 'text;strokeColor=none;fillColor=none;html=1;fontSize=25;fontStyle=1;verticalAlign=middle;align=center;autosizeText=1;', 160, 40],
  ['link', 'Link', 'text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;align=center;verticalAlign=middle;fontColor=#0000EE;fontStyle=4;', 60, 40, { object: { tag: 'UserObject', attrs: { link: 'https://www.draw.io' } } }],
  ['curved-text', 'Curved Text', 'shape=curvedText;noLabel=1;align=center;verticalAlign=middle;strokeColor=none;fillColor=none;', 70, 50],
  ['slanted-left', '<div style="transform:skewY(30deg);">Text</div>', 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;', 100, 60],
  ['slanted-right', '<div style="transform:skewY(-30deg);">Text</div>', 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;', 100, 60],
  ['slanted-top', '<div style="transform:matrix(0.866,-0.5,0.866,0.5,0,0);">Text</div>', 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;', 100, 60],
  ['unordered-list', '<ul><li>Value 1</li><li>Value 2</li><li>Value 3</li></ul>', 'text;strokeColor=none;fillColor=none;html=1;whiteSpace=wrap;verticalAlign=middle;overflow=hidden;', 100, 80],
  ['ordered-list', '<ol><li>Value 1</li><li>Value 2</li><li>Value 3</li></ol>', 'text;strokeColor=none;fillColor=none;html=1;whiteSpace=wrap;verticalAlign=middle;overflow=hidden;', 100, 80],
  ['sticky-note', 'The size of the font in this note will change so that it fits within the note shape', 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;autosizeText=1;fontColor=#000000;darkOpacity=0.05;fillColor=#FFF9B2;strokeColor=none;fillStyle=solid;fontSize=20;direction=west;gradientDirection=north;gradientColor=#FFF2A1;shadow=1;size=20;pointerEvents=1;', 150, 150],
  ['html-table', '<table border="1" width="100%" height="100%" cellpadding="4" style="width:100%;height:100%;border-collapse:collapse;"><tr><th align="center"><b>Title</b></th></tr><tr><td align="center">Section 1.1\nSection 1.2\nSection 1.3</td></tr><tr><td align="center">Section 2.1\nSection 2.2\nSection 2.3</td></tr></table>', 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;overflow=fill;', 180, 180],
  ['iso-cube', '', 'html=1;whiteSpace=wrap;shape=isoCube2;backgroundOutline=1;isoAngle=15;', 90, 100],
  ['iso-square', '', 'html=1;whiteSpace=wrap;aspect=fixed;shape=isoRectangle;', 150, 90],
  ['curly-left', '', 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;labelPosition=left;verticalLabelPosition=middle;align=right;verticalAlign=middle;', 20, 120],
  ['curly-right', '', 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;flipH=1;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;', 20, 120],
  ['h-line', '', 'line;strokeWidth=2;html=1;', 160, 10],
  ['v-line', '', 'line;strokeWidth=2;direction=south;html=1;', 10, 160],
  ['h-backbone', '', 'line;strokeWidth=4;html=1;perimeter=backbonePerimeter;points=[];outlineConnect=0;', 160, 10],
  ['v-backbone', '', 'line;strokeWidth=4;direction=south;html=1;perimeter=backbonePerimeter;points=[];outlineConnect=0;', 10, 160],
  ['h-crossbar', '', 'shape=crossbar;whiteSpace=wrap;html=1;rounded=1;', 120, 20],
  ['v-crossbar', '', 'shape=crossbar;whiteSpace=wrap;html=1;rounded=1;direction=south;', 20, 120],
  ['image-fixed', '', `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;aspect=fixed;image=${ICON}`, 52, 61],
  ['image-variable', '', `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;image=${ICON}`, 50, 60],
  ['icon', 'Icon', `icon;html=1;image=${ICON}`, 60, 60],
  ['label-1', 'Label', `label;whiteSpace=wrap;html=1;image=${ICON}`, 140, 60],
  ['label-2', 'Label', `label;whiteSpace=wrap;html=1;align=center;verticalAlign=bottom;spacingLeft=0;spacingBottom=4;imageAlign=center;imageVerticalAlign=top;image=${ICON}`, 120, 80],
  ['shape-group', 'Label', 'html=1;whiteSpace=wrap;container=1;recursiveResize=0;collapsible=0;', 160, 70, { children: [['shape-group-symbol', '', 'triangle;html=1;whiteSpace=wrap;', 20, 20, 20, 30]] }],
  ['partial-rect-1', '', 'shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;', 120, 60],
  ['partial-rect-2', '', 'shape=partialRectangle;whiteSpace=wrap;html=1;bottom=0;top=0;fillColor=none;', 120, 60],
  ['partial-rect-3', '', 'shape=partialRectangle;whiteSpace=wrap;html=1;bottom=1;right=1;left=1;top=0;fillColor=none;routingCenterX=-0.5;', 120, 60],
  ['waypoint', '', 'shape=waypoint;sketch=0;fillStyle=solid;size=6;pointerEvents=1;points=[];fillColor=none;resizable=0;rotatable=0;perimeter=centerPerimeter;snapToPoint=1;', 20, 20],
  ['arc', '', 'shape=mxgraph.basic.arc;html=1;startAngle=0.3;endAngle=0.1;endArrow=classic;endFill=1;', 50, 50],
  ['zigzag', '', 'shape=zigzag;html=1;fillColor=none;', 160, 20],
];

const MISC_SKETCH = [
  ['rect-sketch', 'Sketch', 'rounded=1;whiteSpace=wrap;html=1;strokeWidth=2;fillWeight=4;hachureGap=8;hachureAngle=45;fillColor=#1ba1e2;sketch=1;', 120, 60],
  ['ellipse-sketch', 'Sketch', 'ellipse;whiteSpace=wrap;html=1;strokeWidth=2;fillWeight=2;hachureGap=8;fillColor=#990000;fillStyle=dots;sketch=1;', 120, 60],
  ['diamond-sketch', 'Sketch', 'rhombus;whiteSpace=wrap;html=1;strokeWidth=2;fillWeight=-1;hachureGap=8;fillStyle=cross-hatch;fillColor=#006600;sketch=1;', 120, 60],
  ['plain-sketch', 'Plain', 'rounded=0;whiteSpace=wrap;html=1;sketch=1;', 120, 60],
];

// Sidebar.createAdvancedShapes (Process Bar, a compressed cell group, is left out).
const ADVANCED = [
  ['double-rect', 'Double', 'shape=ext;double=1;rounded=0;whiteSpace=wrap;html=1;', 120, 80],
  ['double-rounded', 'Double', 'shape=ext;double=1;rounded=1;whiteSpace=wrap;html=1;', 120, 80],
  ['double-ellipse', 'Double', 'ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;', 100, 60],
  ['double-square', 'Square', 'shape=ext;double=1;whiteSpace=wrap;html=1;aspect=fixed;', 80, 80],
  ['double-circle', 'Circle', 'ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;aspect=fixed;', 80, 80],
  ['tape-data', 'Tape', 'shape=tapeData;whiteSpace=wrap;html=1;perimeter=ellipsePerimeter;', 80, 80],
  ['manual-input', 'Input', 'shape=manualInput;boundedLbl=1;whiteSpace=wrap;html=1;', 80, 80],
  ['loop-limit', 'Loop', 'shape=loopLimit;whiteSpace=wrap;html=1;', 100, 80],
  ['off-page', 'Off', 'shape=offPageConnector;whiteSpace=wrap;html=1;', 80, 80],
  ['delay', 'Delay', 'shape=delay;whiteSpace=wrap;html=1;', 80, 40],
  ['display', 'Display', 'shape=display;whiteSpace=wrap;html=1;', 80, 40],
  ['arrow-left', 'Left', 'shape=singleArrow;direction=west;whiteSpace=wrap;html=1;', 100, 60],
  ['arrow-right', 'Right', 'shape=singleArrow;whiteSpace=wrap;html=1;', 100, 60],
  ['arrow-up', 'Up', 'shape=singleArrow;direction=north;whiteSpace=wrap;html=1;', 60, 100],
  ['arrow-down', 'Down', 'shape=singleArrow;direction=south;whiteSpace=wrap;html=1;', 60, 100],
  ['double-arrow', 'Both', 'shape=doubleArrow;whiteSpace=wrap;html=1;', 100, 60],
  ['double-arrow-v', 'Both', 'shape=doubleArrow;direction=south;whiteSpace=wrap;html=1;', 60, 100],
  ['user', 'User', 'shape=actor;whiteSpace=wrap;html=1;', 40, 60],
  ['cross', 'Cross', 'shape=cross;whiteSpace=wrap;html=1;', 80, 80],
  ['corner', 'Corner', 'shape=corner;whiteSpace=wrap;html=1;', 80, 80],
  ['tee', 'Tee', 'shape=tee;whiteSpace=wrap;html=1;', 80, 80],
  ['data-store', 'Store', 'shape=datastore;whiteSpace=wrap;html=1;', 60, 60],
  ['or-ellipse', 'Or', 'shape=orEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', 80, 80],
  ['sum-ellipse', 'Sum', 'shape=sumEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', 80, 80],
  ['line-ellipse', 'H', 'shape=lineEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', 80, 80],
  ['line-ellipse-v', 'V', 'shape=lineEllipse;line=vertical;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', 80, 80],
  ['sort', 'Sort', 'shape=sortShape;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;', 80, 80],
  ['collate', 'Collate', 'shape=collate;whiteSpace=wrap;html=1;', 80, 80],
  ['switch', 'Switch', 'shape=switch;whiteSpace=wrap;html=1;', 60, 60],
];

/** Places palette entries with a flow layout; `resize` maps [w, h, i] to a new size. */
function placeShapes(page, entries, { labels = true, resize = null, layout = {} } = {}) {
  const items = entries.map(([id, label, style, w, h, opts], i) => {
    const [rw, rh] = resize ? resize(w, h, i) : [w, h];
    return { id, label, style, w: rw, h: rh, opts: opts ?? {} };
  });
  const bottom = flow(items, layout);
  for (const it of items) {
    const isText = /^text;/.test(it.style) || it.id === 'textbox';
    const label = labels || isText ? it.label : '';
    page.v(it.id, label, it.style, it.x, it.y, it.w, it.h, { object: it.opts.object });
    for (const child of it.opts.children ?? []) {
      const [cid, clabel, cstyle, cx, cy, cw, ch] = child;
      page.v(cid, clabel, cstyle, cx * (it.w / 160), cy * (it.h / 70), cw, ch, { parent: it.id });
    }
  }
  return bottom;
}

function addList(page, id, label, style, field, x, y, w, header, item, labels = ['Item 1', 'Item 2', 'Item 3']) {
  page.v(id, label, style, x, y, w, header + item * labels.length);
  labels.forEach((text, i) => page.v(`${id}-item-${i + 1}`, text, field, 0, header + i * item, w, item, { parent: id }));
}

/** Alternate size: even entries wide and flat, odd ones narrow and tall. */
function altSize(w, h, i) {
  return i % 2 === 0 ? [Math.round(w * 1.5), Math.round(h * 0.6)] : [Math.round(w * 0.6), Math.round(h * 1.4)];
}

// --- shapes ---------------------------------------------------------------------

{
  const page = new Page('shapes-general', 'General palette');
  const bottom = placeShapes(page, GENERAL);
  const containers = GENERAL_CONTAINERS.map(([id, label, style, w, h]) => ({ id, label, style, w, h }));
  const y = bottom + 40;
  flow(containers, { y0: y });
  for (const c of containers) page.v(c.id, c.label, c.style, c.x, c.y, c.w, c.h);
  addList(page, 'list', 'List', GENERAL_LIST, GENERAL_FIELD, 680, y, 140, 30, 30);
  page.v('list-item', 'List Item', GENERAL_FIELD, 680, y + 150, 80, 30);
  writeFile('shapes-general', [page]);
}

{
  const page = new Page('shapes-general-resized', 'General palette, other sizes');
  const bottom = placeShapes(page, GENERAL, { labels: false, resize: altSize });
  const containers = [
    { id: 'container', label: '', style: 'swimlane;startSize=0;', w: 160, h: 90 },
    { id: 'vertical-container', label: '', style: 'swimlane;whiteSpace=wrap;html=1;', w: 120, h: 150 },
    { id: 'horizontal-container', label: '', style: 'swimlane;horizontal=0;whiteSpace=wrap;html=1;', w: 220, h: 100 },
  ];
  const y = bottom + 40;
  flow(containers, { y0: y });
  for (const c of containers) page.v(c.id, c.label, c.style, c.x, c.y, c.w, c.h);
  addList(page, 'list', '', GENERAL_LIST, GENERAL_FIELD, 620, y, 200, 24, 20, ['', '', '', '']);
  writeFile('shapes-general-resized', [page]);
}

{
  const page = new Page('shapes-misc', 'Misc palette');
  placeShapes(page, MISC);
  writeFile('shapes-misc', [page]);
}

{
  const page = new Page('shapes-misc-resized', 'Misc palette, other sizes');
  const shapes = MISC.filter(([id]) => !/^(autosize|link|slanted|unordered|ordered|html-table)/.test(id));
  placeShapes(page, shapes, { labels: false, resize: altSize });
  writeFile('shapes-misc-resized', [page]);
}

{
  const page = new Page('shapes-misc-sketch', 'Sketch style');
  placeShapes(page, MISC_SKETCH);
  page.e('sketch-edge', '', 'endArrow=classic;html=1;rounded=0;sketch=1;', null, null, { sourcePoint: [20, 140], targetPoint: [260, 140] });
  page.e('sketch-edge-connected', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;sketch=1;', 'rect-sketch', 'plain-sketch', {});
  writeFile('shapes-misc-sketch', [page]);
}

{
  const page = new Page('shapes-advanced', 'Advanced palette');
  const bottom = placeShapes(page, ADVANCED);
  const y = bottom + 40;
  page.v('container', 'Container', 'swimlane;', 20, y, 200, 200);
  addList(page, 'list', 'List', ADVANCED_LIST, ADVANCED_FIELD, 260, y, 140, 26, 26);
  page.v('list-item', 'List Item', ADVANCED_FIELD, 440, y, 60, 26);
  writeFile('shapes-advanced', [page]);
}

{
  const page = new Page('shapes-advanced-resized', 'Advanced palette, other sizes');
  const bottom = placeShapes(page, ADVANCED, { labels: false, resize: altSize });
  const y = bottom + 40;
  page.v('container', '', 'swimlane;', 20, y, 140, 100);
  addList(page, 'list', '', ADVANCED_LIST, ADVANCED_FIELD, 200, y, 180, 20, 18, ['', '']);
  writeFile('shapes-advanced-resized', [page]);
}

{
  const page = new Page('shapes-transform', 'Direction, flip, rotation');
  const base = {
    triangle: ['triangle;whiteSpace=wrap;html=1;', 60, 80],
    step: ['shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;fixedSize=1;', 100, 60],
    document: ['shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', 100, 70],
    card: ['shape=card;whiteSpace=wrap;html=1;', 70, 90],
    callout: ['shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;', 110, 70],
    cylinder: ['shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;', 60, 80],
    trapezoid: ['shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;fixedSize=1;', 100, 60],
    rect: ['rounded=0;whiteSpace=wrap;html=1;', 100, 60],
    ellipse: ['ellipse;whiteSpace=wrap;html=1;', 100, 60],
  };
  const items = [];
  const add = (id, label, kind, extra) => {
    const [style, w, h] = base[kind];
    items.push({ id, label, style: style + extra, w, h });
  };
  for (const dir of ['north', 'east', 'south', 'west']) add(`triangle-${dir}`, dir[0].toUpperCase(), 'triangle', `direction=${dir};`);
  for (const dir of ['north', 'east', 'south', 'west']) add(`step-${dir}`, dir[0].toUpperCase(), 'step', `direction=${dir};`);
  for (const dir of ['north', 'east', 'south', 'west']) add(`document-${dir}`, dir, 'document', `direction=${dir};`);
  add('cylinder-north', 'N', 'cylinder', 'direction=north;');
  add('trapezoid-south', 'S', 'trapezoid', 'direction=south;');
  add('callout-west', 'W', 'callout', 'direction=west;');
  add('card-north', 'N', 'card', 'direction=north;');
  for (const kind of ['card', 'callout', 'document']) {
    add(`${kind}-flipH`, 'flipH', kind, 'flipH=1;');
    add(`${kind}-flipV`, 'flipV', kind, 'flipV=1;');
    add(`${kind}-flipHV`, 'both', kind, 'flipH=1;flipV=1;');
  }
  add('rect-rot30', 'rotation 30', 'rect', 'rotation=30;');
  add('ellipse-rot45', 'rotation 45', 'ellipse', 'rotation=45;');
  add('triangle-rot-60', 'R', 'triangle', 'rotation=-60;');
  add('document-rot90', 'rotated 90', 'document', 'rotation=90;');
  add('card-rot30-flipH', 'R+F', 'card', 'rotation=30;flipH=1;');
  add('step-rot20-south', 'R+D', 'step', 'rotation=20;direction=south;');
  add('callout-rot-15-flipV', 'R+F', 'callout', 'rotation=-15;flipV=1;');
  flow(items, { gapX: 40, gapY: 50 });
  for (const it of items) page.v(it.id, it.label, it.style, it.x, it.y, it.w, it.h);
  writeFile('shapes-transform', [page]);
}

// --- styles ---------------------------------------------------------------------

{
  const page = new Page('styles-fill-stroke', 'Rounding, dashes, stroke, fill, opacity');
  const R = 'whiteSpace=wrap;html=1;';
  const blue = 'fillColor=#dae8fc;strokeColor=#6c8ebf;';
  const items = [
    ['rounded-default', 'rounded=1;' + R],
    ['arc-5', 'rounded=1;arcSize=5;' + R],
    ['arc-25', 'rounded=1;arcSize=25;' + R],
    ['arc-50', 'rounded=1;arcSize=50;' + R],
    ['abs-arc-10', 'rounded=1;absoluteArcSize=1;arcSize=10;' + R],
    ['abs-arc-30', 'rounded=1;absoluteArcSize=1;arcSize=30;' + R],
    ['triangle-rounded', 'triangle;rounded=1;' + R],
    ['hexagon-rounded', 'shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;rounded=1;' + R],
    ['step-rounded', 'shape=step;perimeter=stepPerimeter;fixedSize=1;rounded=1;' + R],
    ['parallelogram-rounded', 'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;rounded=1;' + R],
    ['dashed', 'dashed=1;' + R],
    ['dash-8-4', 'dashed=1;dashPattern=8 4;' + R],
    ['dash-1-4', 'dashed=1;dashPattern=1 4;' + R],
    ['dash-12-4-2-4', 'dashed=1;dashPattern=12 4 2 4;' + R],
    ['dashed-w3', 'dashed=1;strokeWidth=3;' + R],
    ['dashed-w3-fixdash', 'dashed=1;strokeWidth=3;fixDash=1;' + R],
    ['dashed-ellipse', 'ellipse;dashed=1;dashPattern=6 3;' + R],
    ['dashed-rounded', 'rounded=1;dashed=1;' + R],
    ['stroke-0.5', 'strokeWidth=0.5;' + R],
    ['stroke-2', 'strokeWidth=2;' + R],
    ['stroke-4', 'strokeWidth=4;' + R],
    ['stroke-8', 'strokeWidth=8;' + R],
    ['ellipse-stroke-6', 'ellipse;strokeWidth=6;' + blue + R],
    ['fill-none', 'fillColor=none;' + R],
    ['stroke-none', 'strokeColor=none;fillColor=#f8cecc;' + R],
    ['fill-blue', blue + R],
    ['fill-red-w2', 'fillColor=#f8cecc;strokeColor=#b85450;strokeWidth=2;' + R],
    ['opacity-50', 'opacity=50;' + blue + 'strokeWidth=3;' + R],
    ['fill-opacity-30', 'fillOpacity=30;' + blue + 'strokeWidth=3;' + R],
    ['stroke-opacity-30', 'strokeOpacity=30;' + blue + 'strokeWidth=3;' + R],
    ['opacity-combo', 'opacity=70;fillOpacity=50;strokeOpacity=50;fillColor=#d5e8d4;strokeColor=#82b366;strokeWidth=4;' + R],
  ];
  const placed = items.map(([id, style]) => ({ id, style, w: 100, h: 60 }));
  flow(placed, { gapX: 30, gapY: 30 });
  for (const it of placed) page.v(it.id, '', it.style, it.x, it.y, it.w, it.h);
  writeFile('styles-fill-stroke', [page]);
}

{
  const page = new Page('styles-gradient-effects', 'Gradients, shadow, glass');
  const R = 'whiteSpace=wrap;html=1;';
  const g = 'fillColor=#dae8fc;gradientColor=#7ea6e0;strokeColor=#6c8ebf;';
  const items = [
    ['gradient-default', g + R],
    ['gradient-north', g + 'gradientDirection=north;' + R],
    ['gradient-south', g + 'gradientDirection=south;' + R],
    ['gradient-east', g + 'gradientDirection=east;' + R],
    ['gradient-west', g + 'gradientDirection=west;' + R],
    ['gradient-radial', g + 'gradientDirection=radial;' + R],
    ['gradient-ellipse', 'ellipse;' + 'fillColor=#ffcd28;gradientColor=#ffa500;strokeColor=#d79b00;' + R],
    ['gradient-rhombus-east', 'rhombus;fillColor=#d5e8d4;gradientColor=#97d077;strokeColor=#82b366;gradientDirection=east;' + R],
    ['gradient-rounded-radial', 'rounded=1;fillColor=#f8cecc;gradientColor=#ea6b66;strokeColor=#b85450;gradientDirection=radial;' + R],
    ['gradient-opacity', g + 'opacity=50;' + R],
    ['gradient-none', 'fillColor=#e1d5e7;gradientColor=none;strokeColor=#9673a6;' + R],
    ['shadow-rect', 'shadow=1;' + R],
    ['shadow-rounded', 'rounded=1;shadow=1;' + g + R],
    ['shadow-ellipse', 'ellipse;shadow=1;' + R],
    ['shadow-triangle', 'triangle;shadow=1;' + R],
    ['shadow-cloud', 'ellipse;shape=cloud;shadow=1;' + R],
    ['shadow-opacity', 'shadow=1;opacity=60;fillColor=#fff2cc;strokeColor=#d6b656;' + R],
    ['shadow-no-fill', 'shadow=1;fillColor=none;' + R],
    ['glass-rect', 'glass=1;' + g + R],
    ['glass-rounded', 'rounded=1;glass=1;fillColor=#f5f5f5;strokeColor=#666666;' + R],
    ['glass-shadow', 'rounded=1;glass=1;shadow=1;fillColor=#d5e8d4;strokeColor=#82b366;' + R],
    ['swimlane-fill', 'swimlane;whiteSpace=wrap;html=1;startSize=20;fillColor=#dae8fc;swimlaneFillColor=#f5f5f5;strokeColor=#6c8ebf;'],
    ['swimlane-gradient', 'swimlane;whiteSpace=wrap;html=1;startSize=20;' + g],
  ];
  const placed = items.map(([id, style]) => ({ id, style, w: 110, h: 70 }));
  const bottom = flow(placed, { gapX: 30, gapY: 30 });
  for (const it of placed) page.v(it.id, it.id.startsWith('swimlane') ? 'Lane' : '', it.style, it.x, it.y, it.w, it.h);
  page.e('shadow-edge', '', 'endArrow=classic;html=1;rounded=0;shadow=1;strokeWidth=2;', null, null, { sourcePoint: [20, bottom + 40], targetPoint: [260, bottom + 40] });
  page.e('shadow-edge-dashed', '', 'endArrow=block;html=1;rounded=0;shadow=1;dashed=1;', null, null, { sourcePoint: [300, bottom + 40], targetPoint: [540, bottom + 40] });
  writeFile('styles-gradient-effects', [page]);
}

// --- connectors -----------------------------------------------------------------

{
  const page = new Page('edges-straight', 'Straight edges, perimeters, loose ends');
  const S = 'endArrow=classic;html=1;rounded=0;';
  // A hub with targets of different shapes around it (floating ends on both).
  page.v('hub', 'Hub', 'rounded=0;whiteSpace=wrap;html=1;', 300, 230, 100, 60);
  const targets = [
    ['t-ellipse', 'ellipse;whiteSpace=wrap;html=1;', 300, 40, 100, 60],
    ['t-rhombus', 'rhombus;whiteSpace=wrap;html=1;', 520, 60, 80, 80],
    ['t-triangle', 'triangle;whiteSpace=wrap;html=1;', 560, 220, 60, 80],
    ['t-hexagon', 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;', 510, 380, 100, 70],
    ['t-cloud', 'ellipse;shape=cloud;whiteSpace=wrap;html=1;perimeter=cloudPerimeter;', 300, 420, 110, 70],
    ['t-rotated', 'rounded=0;whiteSpace=wrap;html=1;rotation=30;', 90, 390, 100, 50],
    ['t-parallelogram', 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;', 40, 230, 110, 60],
    ['t-circle-spaced', 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;perimeterSpacing=8;', 90, 60, 70, 70],
  ];
  for (const [id, style, x, y, w, h] of targets) page.v(id, '', style, x, y, w, h);
  for (const [id] of targets) page.e(`hub-${id.slice(2)}`, '', S, 'hub', id);
  // Ports, spacing, waypoints, curves and loose ends below.
  page.v('p1', 'P1', 'rounded=0;whiteSpace=wrap;html=1;', 40, 540, 100, 60);
  page.v('p2', 'P2', 'rounded=0;whiteSpace=wrap;html=1;', 260, 600, 100, 60);
  page.e('fixed-ports', '', S + 'exitX=1;exitY=0.25;exitDx=0;exitDy=0;entryX=0;entryY=0.75;entryDx=0;entryDy=0;', 'p1', 'p2');
  page.v('p3', 'P3', 'ellipse;whiteSpace=wrap;html=1;', 440, 540, 100, 60);
  page.e('center-exit', '', S + 'exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;', 'p3', 'p2');
  page.e('edge-spacing', '', S + 'sourcePerimeterSpacing=4;targetPerimeterSpacing=10;', 'p1', 'p3');
  page.v('p4', 'P4', 'rounded=0;whiteSpace=wrap;html=1;', 620, 540, 100, 60);
  page.e('waypoints', '', S, 'p3', 'p4', { points: [[560, 500], [700, 480]] });
  page.e('curved', '', S + 'curved=1;', 'p2', 'p4', { points: [[420, 700], [560, 640], [660, 700]] });
  page.e('rounded-waypoints', '', 'endArrow=classic;html=1;rounded=1;', 'p1', 'p2', { points: [[90, 680], [200, 700]] });
  page.e('loose-both', '', S, null, null, { sourcePoint: [40, 760], targetPoint: [220, 820] });
  page.e('loose-target', '', S, 'p2', null, { targetPoint: [330, 800] });
  page.e('loose-source', '', S, null, 'p4', { sourcePoint: [560, 820] });
  writeFile('edges-straight', [page]);
}

/** A source and target pair in a 260×200 slot; returns their ids. */
function pair(page, key, col, row, tdx, tdy, opts = {}) {
  const x0 = 30 + col * 280;
  const y0 = 30 + row * 210;
  const sx = x0 + (opts.sx ?? 20);
  const sy = y0 + (opts.sy ?? 20);
  const s = page.v(`${key}-s`, opts.sLabel ?? 'S', opts.sStyle ?? 'rounded=0;whiteSpace=wrap;html=1;', sx, sy, opts.sw ?? 80, opts.sh ?? 40);
  const t = page.v(`${key}-t`, opts.tLabel ?? 'T', opts.tStyle ?? 'rounded=0;whiteSpace=wrap;html=1;', sx + tdx, sy + tdy, opts.tw ?? 80, opts.th ?? 40);
  return [s, t];
}

{
  const page = new Page('edges-orthogonal', 'orthogonalEdgeStyle');
  const O = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;';
  const cases = [
    ['right', 0, 0, 150, 0, ''],
    ['diagonal', 1, 0, 140, 110, ''],
    ['below', 2, 0, 20, 120, ''],
    ['behind', 0, 1, -10, 120, '', { sx: 150 }],
    ['up-right', 1, 1, 150, -0, '', { sy: 120, tdy: -100 }],
    ['ports', 2, 1, 140, 110, 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;'],
    ['same-side', 0, 2, 40, 110, 'exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;'],
    ['port-offsets', 1, 2, 120, -0, 'exitX=0.5;exitY=0;exitDx=10;exitDy=0;entryX=0.5;entryY=1;entryDx=-10;entryDy=0;', { sy: 130, tdy: -110 }],
    ['center-exit', 2, 2, 140, 110, 'exitX=0.5;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;', { sStyle: 'ellipse;whiteSpace=wrap;html=1;' }],
    ['waypoint', 0, 3, 150, 120, '', { points: [[100, 30 + 3 * 210 + 120]] }],
    ['rounded', 1, 3, 140, 110, '', { style: O.replace('rounded=0;', 'rounded=1;') }],
    ['curved', 2, 3, 140, 110, '', { style: O.replace('rounded=0;', 'rounded=0;curved=1;') }],
    ['shapes', 0, 4, 150, 100, '', { sStyle: 'ellipse;whiteSpace=wrap;html=1;', tStyle: 'rhombus;whiteSpace=wrap;html=1;', tw: 70, th: 70 }],
    ['jetty-40', 1, 4, 30, 110, 'exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;', { style: O.replace('jettySize=auto;', 'jettySize=40;'), sx: 60 }],
  ];
  for (const [key, col, row, tdx, tdy0, ports, opts = {}] of cases) {
    const tdy = opts.tdy ?? tdy0;
    const [s, t] = pair(page, key, col, row, tdx, tdy, opts);
    page.e(key, '', (opts.style ?? O) + ports, s, t, { points: opts.points });
  }
  writeFile('edges-orthogonal', [page]);
}

{
  const page = new Page('edges-elbow', 'elbow, entity relation, side/top, isometric');
  const E = 'edgeStyle=elbowEdgeStyle;rounded=0;html=1;';
  const cases = [
    ['elbow-h', 0, 0, 150, 110, E + 'elbow=horizontal;'],
    ['elbow-v', 1, 0, 150, 110, E + 'elbow=vertical;'],
    ['elbow-h-point', 2, 0, 150, 110, E + 'elbow=horizontal;', { points: [[2 * 280 + 30 + 20 + 50, 140]] }],
    ['elbow-v-point', 0, 1, 150, 110, E + 'elbow=vertical;', { points: [[0, 30 + 210 + 20 + 90]] }],
    ['elbow-behind', 1, 1, -10, 120, E, { sx: 150 }],
    ['side-to-side', 2, 1, 150, 110, 'edgeStyle=sideToSideEdgeStyle;rounded=0;html=1;'],
    ['top-to-bottom', 0, 2, 150, 110, 'edgeStyle=topToBottomEdgeStyle;rounded=0;html=1;'],
    ['entity-relation', 1, 2, 150, 110, 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERmandOne;rounded=0;'],
    ['entity-relation-behind', 2, 2, -10, 120, 'edgeStyle=entityRelationEdgeStyle;html=1;rounded=0;segment=15;endArrow=ERmany;startArrow=ERone;', { sx: 150 }],
  ];
  for (const [key, col, row, tdx, tdy, style, opts = {}] of cases) {
    const [s, t] = pair(page, key, col, row, tdx, tdy, opts);
    page.e(key, '', style, s, t, { points: opts.points });
  }
  const y = 30 + 3 * 210;
  page.e('isometric-1', '', 'edgeStyle=isometricEdgeStyle;endArrow=none;html=1;', null, null, { sourcePoint: [50, y + 100], targetPoint: [100, y] });
  page.e('isometric-2', '', 'edgeStyle=isometricEdgeStyle;endArrow=none;html=1;elbow=vertical;', null, null, { sourcePoint: [180, y + 100], targetPoint: [230, y] });
  page.e('palette-elbow-h', '', 'edgeStyle=elbowEdgeStyle;elbow=horizontal;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', null, null, { sourcePoint: [320, y + 100], targetPoint: [420, y] });
  page.e('palette-elbow-v', '', 'edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', null, null, { sourcePoint: [480, y + 100], targetPoint: [580, y] });
  writeFile('edges-elbow', [page]);
}

{
  const page = new Page('edges-loops-segment', 'Loops and segmentEdgeStyle');
  page.v('loop-a', 'A', 'rounded=0;whiteSpace=wrap;html=1;', 60, 60, 100, 60);
  page.e('loop-default', '', 'endArrow=classic;html=1;rounded=0;', 'loop-a', 'loop-a');
  page.v('loop-b', 'B', 'rounded=0;whiteSpace=wrap;html=1;', 260, 60, 100, 60);
  page.e('loop-north', '', 'endArrow=classic;html=1;rounded=0;direction=north;segment=30;', 'loop-b', 'loop-b');
  page.v('loop-c', 'C', 'ellipse;whiteSpace=wrap;html=1;', 460, 60, 100, 60);
  page.e('loop-point', '', 'endArrow=classic;html=1;rounded=0;', 'loop-c', 'loop-c', { points: [[600, 40]] });
  page.v('loop-d', 'D', 'rounded=0;whiteSpace=wrap;html=1;', 660, 60, 100, 60);
  page.e('loop-orthogonal', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;', 'loop-d', 'loop-d');
  // segmentEdgeStyle (Misc palette "Manual Line" and connected variants)
  const SEG = 'edgeStyle=segmentEdgeStyle;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;';
  page.e('manual-line', '', SEG, null, null, { sourcePoint: [60, 300], targetPoint: [110, 250] });
  page.v('seg-s1', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 200, 230, 80, 40);
  page.v('seg-t1', 'T', 'rounded=0;whiteSpace=wrap;html=1;', 420, 330, 80, 40);
  page.e('segment-two-points', '', SEG, 'seg-s1', 'seg-t1', { points: [[340, 250], [340, 350]] });
  page.v('seg-s2', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 560, 230, 80, 40);
  page.v('seg-t2', 'T', 'rounded=0;whiteSpace=wrap;html=1;', 680, 340, 80, 40);
  page.e('segment-one-point', '', SEG, 'seg-s2', 'seg-t2', { points: [[600, 310]] });
  page.v('seg-s3', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 60, 420, 80, 40);
  page.v('seg-t3', 'T', 'ellipse;whiteSpace=wrap;html=1;', 300, 500, 80, 50);
  page.e('segment-rounded', '', SEG.replace('rounded=0;', 'rounded=1;'), 'seg-s3', 'seg-t3', { points: [[200, 440], [200, 525]] });
  page.v('seg-s4', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 460, 420, 80, 40);
  page.v('seg-t4', 'T', 'rounded=0;whiteSpace=wrap;html=1;', 640, 500, 80, 40);
  page.e('segment-ports', '', SEG + 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;', 'seg-s4', 'seg-t4', { points: [[500, 520]] });
  page.e('segment-no-points', '', SEG, 'seg-s3', 'seg-s4');
  writeFile('edges-loops-segment', [page]);
}

// Markers from Format.js (the arrowhead menu): [name, fill]
const MARKERS = [
  ['classic', 1], ['classicThin', 1], ['open', 0], ['openThin', 0], ['openAsync', 0], ['block', 1], ['blockThin', 1],
  ['async', 1], ['oval', 1], ['diamond', 1], ['diamondThin', 1], ['classic', 0], ['classicThin', 0], ['block', 0],
  ['blockThin', 0], ['async', 0], ['oval', 0], ['diamond', 0], ['diamondThin', 0], ['box', 0], ['halfCircle', 0],
  ['dash', 0], ['cross', 0], ['circlePlus', 0], ['circle', 0], ['baseDash', 0], ['ERone', 0], ['ERmandOne', 0],
  ['ERmany', 0], ['ERoneToMany', 0], ['ERzeroToOne', 0], ['ERzeroToMany', 0], ['doubleBlock', 0], ['doubleBlock', 1],
];

{
  const page = new Page('edges-arrows-end', 'endArrow, filled and outline');
  MARKERS.forEach(([name, fill], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 30 + col * 220;
    const y = 30 + row * 40;
    page.e(`end-${name}-${fill ? 'filled' : 'outline'}`, '', `endArrow=${name};endFill=${fill};html=1;rounded=0;`, null, null, { sourcePoint: [x, y], targetPoint: [x + 150, y] });
  });
  writeFile('edges-arrows-end', [page]);
}

{
  const page = new Page('edges-arrows-start', 'startArrow, sizes, stroke widths');
  const names = [...new Set(MARKERS.map(([n]) => n))];
  names.forEach((name, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 30 + col * 220;
    const y = 30 + row * 40;
    const fill = name === 'circle' ? 1 : (MARKERS.find(([n, f]) => n === name && f === 1) ? 1 : 0);
    page.e(`start-${name}`, '', `startArrow=${name};startFill=${fill};endArrow=none;html=1;rounded=0;`, null, null, { sourcePoint: [x, y], targetPoint: [x + 150, y] });
  });
  const y0 = 30 + Math.ceil(names.length / 3) * 40 + 20;
  const sized = [
    ['classic-size-4', 'endArrow=classic;endSize=4;'],
    ['classic-size-12', 'endArrow=classic;endSize=12;'],
    ['classic-size-20', 'endArrow=classic;endSize=20;'],
    ['oval-start-12-block-end-10', 'startArrow=oval;startFill=1;startSize=12;endArrow=block;endSize=10;endFill=0;'],
    ['diamond-both-16', 'startArrow=diamond;startFill=0;startSize=16;endArrow=diamondThin;endFill=1;endSize=16;'],
    ['ermany-size-20', 'startArrow=ERmany;startSize=20;endArrow=ERzeroToOne;endSize=20;startFill=0;endFill=0;'],
    ['stroke-3-classic', 'endArrow=classic;strokeWidth=3;'],
    ['stroke-4-diamond', 'startArrow=diamondThin;startFill=0;endArrow=open;strokeWidth=4;'],
    ['stroke-6-block', 'endArrow=block;endFill=1;strokeWidth=6;startArrow=oval;startFill=0;'],
    ['dashed-block', 'endArrow=block;endFill=0;dashed=1;startArrow=classic;'],
    ['dashed-w2-oval', 'endArrow=oval;endFill=1;dashed=1;dashPattern=8 8;strokeWidth=2;'],
    ['stroke-color', 'endArrow=classic;startArrow=dash;strokeColor=#b85450;strokeWidth=2;'],
  ];
  sized.forEach(([id, style], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 30 + col * 220;
    const y = y0 + row * 50;
    page.e(id, '', `${style}html=1;rounded=0;`, null, null, { sourcePoint: [x, y], targetPoint: [x + 150, y] });
  });
  writeFile('edges-arrows-start', [page]);
}

{
  const page = new Page('edges-shapes', 'Edge shapes: flexArrow, link, pipe, wire, filled, tapered, curves');
  const row = (i) => 30 + i * 110;
  // General palette connectors, loose like the palette inserts them.
  page.e('curve', '', 'curved=1;curveGeometry=1;endArrow=classic;html=1;', null, null, { sourcePoint: [30, row(0) + 50], targetPoint: [80, row(0)], points: [[80, row(0) + 50], [30, row(0)]] });
  page.e('flex-bidirectional', '', 'shape=flexArrow;endArrow=classic;startArrow=classic;html=1;', null, null, { sourcePoint: [130, row(0) + 100], targetPoint: [230, row(0)] });
  page.e('flex-arrow', '', 'shape=flexArrow;endArrow=classic;html=1;', null, null, { sourcePoint: [270, row(0) + 50], targetPoint: [320, row(0)] });
  page.e('dashed-line', '', 'endArrow=none;dashed=1;html=1;', null, null, { sourcePoint: [360, row(0) + 50], targetPoint: [410, row(0)] });
  page.e('dotted-line', '', 'endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;', null, null, { sourcePoint: [450, row(0) + 50], targetPoint: [500, row(0)] });
  page.e('line', '', 'endArrow=none;html=1;', null, null, { sourcePoint: [540, row(0) + 50], targetPoint: [590, row(0)] });
  page.e('bidirectional', '', 'endArrow=classic;startArrow=classic;html=1;', null, null, { sourcePoint: [630, row(0) + 50], targetPoint: [680, row(0)] });
  page.e('directional', '', 'endArrow=classic;html=1;', null, null, { sourcePoint: [720, row(0) + 50], targetPoint: [770, row(0)] });
  page.e('link', '', 'shape=link;html=1;', null, null, { sourcePoint: [30, row(1) + 20], targetPoint: [130, row(1) + 20] });
  page.e('link-wide-points', '', 'shape=link;html=1;width=8;rounded=0;', null, null, { sourcePoint: [170, row(1) + 60], targetPoint: [330, row(1) + 60], points: [[220, row(1)], [280, row(1)]] });
  page.e('filled-edge', '', 'shape=filledEdge;curved=0;rounded=0;fixDash=1;endArrow=none;strokeWidth=10;fillColor=#ffffff;edgeStyle=orthogonalEdgeStyle;html=1;', null, null, { sourcePoint: [380, row(1) + 60], targetPoint: [440, row(1) + 20] });
  page.e('tapered-arrow', '', 'shape=taperedArrow;startWidth=12;endWidth=2;endArrow=block;endFill=1;html=1;', null, null, { sourcePoint: [490, row(1) + 60], targetPoint: [610, row(1)] });
  page.e('pipe', '', 'shape=pipe;html=1;endArrow=none;rounded=0;', null, null, { sourcePoint: [650, row(1) + 60], targetPoint: [790, row(1) + 60], points: [[720, row(1)]] });
  page.e('pipe-filled', '', 'shape=pipe;html=1;width=8;fillColor=#dae8fc;strokeColor=#6c8ebf;endArrow=none;rounded=0;', null, null, { sourcePoint: [30, row(2) + 60], targetPoint: [230, row(2) + 60], points: [[80, row(2)], [180, row(2)]] });
  page.e('wire', '', 'shape=wire;html=1;dashed=1;dashPattern=4 4;fillColor=#ffcc00;strokeColor=#000000;strokeWidth=3;endArrow=none;rounded=0;', null, null, { sourcePoint: [270, row(2) + 60], targetPoint: [470, row(2)], points: [[370, row(2) + 60]] });
  page.e('wire-arrow', '', 'shape=wire;html=1;dashed=1;fillColor=#ff0000;strokeWidth=2;endArrow=classic;rounded=0;', null, null, { sourcePoint: [510, row(2) + 60], targetPoint: [700, row(2) + 20] });
  // Connected flexArrows.
  page.v('flex-s', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 30, row(3) + 20, 100, 60);
  page.v('flex-t', 'T', 'ellipse;whiteSpace=wrap;html=1;', 300, row(3) + 80, 100, 60);
  page.e('flex-connected', '', 'shape=flexArrow;endArrow=classic;html=1;width=20;endWidth=30;endSize=8;fillColor=#dae8fc;strokeColor=#6c8ebf;', 'flex-s', 'flex-t');
  page.v('flex-t2', 'T2', 'rounded=0;whiteSpace=wrap;html=1;', 520, row(3) + 20, 100, 60);
  page.e('flex-waypoints', '', 'shape=flexArrow;endArrow=block;startArrow=oval;html=1;rounded=1;startWidth=14;startSize=4;', 'flex-s', 'flex-t2', { points: [[80, row(3) + 180], [460, row(3) + 180]] });
  page.e('flex-orthogonal', '', 'shape=flexArrow;endArrow=classic;html=1;edgeStyle=orthogonalEdgeStyle;rounded=0;', 'flex-t', 'flex-t2');
  writeFile('edges-shapes', [page]);
}

// --- labels ---------------------------------------------------------------------

{
  const page = new Page('labels-vertex-align', 'Vertex label alignment and position');
  let i = 0;
  const place = (id, value, style, w = 120, h = 60) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    page.v(id, value, style, 40 + col * 170, 40 + row * 110, w, h);
    i++;
  };
  for (const html of [1, 0]) {
    for (const va of ['top', 'middle', 'bottom']) {
      for (const a of ['left', 'center', 'right']) {
        place(`${html ? 'html' : 'plain'}-${a}-${va}`, `${a} ${va}`, `rounded=0;whiteSpace=wrap;${html ? 'html=1;' : ''}align=${a};verticalAlign=${va};`);
      }
    }
    i += 1; // keep html and plain on separate rows
  }
  const outside = [
    ['left', 'top'], ['center', 'top'], ['right', 'top'],
    ['left', 'middle'], ['right', 'middle'],
    ['left', 'bottom'], ['center', 'bottom'], ['right', 'bottom'],
  ];
  const alignFor = { left: 'right', center: 'center', right: 'left' };
  const vAlignFor = { top: 'bottom', middle: 'middle', bottom: 'top' };
  for (const [lp, vlp] of outside) {
    place(`outside-${lp}-${vlp}`, `${lp} ${vlp}`, `rounded=0;whiteSpace=wrap;html=1;labelPosition=${lp};verticalLabelPosition=${vlp};align=${alignFor[lp]};verticalAlign=${vAlignFor[vlp]};`, 80, 40);
  }
  i += 2;
  place('spacing-10', 'spacing 10', 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;');
  place('spacing-top-20', 'top 20', 'rounded=0;whiteSpace=wrap;html=1;verticalAlign=top;spacingTop=20;');
  place('spacing-left-30', 'left 30', 'rounded=0;whiteSpace=wrap;html=1;align=left;spacingLeft=30;');
  place('spacing-right-30', 'right 30', 'rounded=0;whiteSpace=wrap;html=1;align=right;spacingRight=30;');
  place('spacing-bottom-20', 'bottom 20', 'rounded=0;whiteSpace=wrap;html=1;verticalAlign=bottom;spacingBottom=20;');
  place('spacing-plain-left-20', 'plain 20', 'rounded=0;whiteSpace=wrap;align=left;verticalAlign=top;spacingLeft=20;spacingTop=10;');
  writeFile('labels-vertex-align', [page]);
}

{
  const page = new Page('labels-vertex-text', 'Vertex label text: wrap, overflow, fonts, backgrounds');
  const LONG = 'The quick brown fox jumps over the lazy dog';
  const R = 'rounded=0;';
  const items = [
    ['wrap-html', LONG, R + 'whiteSpace=wrap;html=1;'],
    ['nowrap-html', LONG, R + 'html=1;'],
    ['wrap-plain', LONG, R + 'whiteSpace=wrap;'],
    ['overflow-hidden', LONG + ' again and again', R + 'whiteSpace=wrap;html=1;overflow=hidden;', 80, 40],
    ['overflow-fill', 'fill', R + 'whiteSpace=wrap;html=1;overflow=fill;labelBackgroundColor=#ffff88;'],
    ['overflow-width', LONG, R + 'whiteSpace=wrap;html=1;overflow=width;verticalAlign=top;'],
    ['overflow-block', LONG, R + 'whiteSpace=wrap;html=1;overflow=block;'],
    ['label-bg-html', 'background', R + 'whiteSpace=wrap;html=1;labelBackgroundColor=#ffff88;'],
    ['label-bg-plain', 'background', R + 'labelBackgroundColor=#ffff88;'],
    ['label-border-html', 'border', R + 'whiteSpace=wrap;html=1;labelBorderColor=#ff0000;'],
    ['label-border-plain', 'border', R + 'labelBorderColor=#ff0000;'],
    ['label-bg-border-spacing', 'both', R + 'whiteSpace=wrap;html=1;labelBackgroundColor=#dae8fc;labelBorderColor=#6c8ebf;spacing=8;'],
    ['vertical-html', 'vertical text', R + 'whiteSpace=wrap;html=1;horizontal=0;', 60, 120],
    ['vertical-plain', 'vertical text', R + 'horizontal=0;', 60, 120],
    ['vertical-left', 'vertical left', R + 'whiteSpace=wrap;html=1;horizontal=0;align=left;', 60, 120],
    ['font-bold', 'bold', R + 'html=1;fontStyle=1;'],
    ['font-italic', 'italic', R + 'html=1;fontStyle=2;'],
    ['font-underline', 'underline', R + 'html=1;fontStyle=4;'],
    ['font-strike', 'strike', R + 'html=1;fontStyle=8;'],
    ['font-bold-italic', 'bold italic', R + 'html=1;fontStyle=3;'],
    ['font-all', 'all styles', R + 'html=1;fontStyle=15;'],
    ['font-all-plain', 'all plain', R + 'fontStyle=15;'],
    ['size-8', 'size 8', R + 'html=1;fontSize=8;'],
    ['size-18', 'size 18', R + 'html=1;fontSize=18;'],
    ['size-28', 'size 28', R + 'html=1;fontSize=28;'],
    ['family-courier', 'Courier New', R + 'html=1;fontFamily=Courier New;'],
    ['family-times', 'Times New Roman', R + 'html=1;fontFamily=Times New Roman;'],
    ['family-verdana', 'Verdana', R + 'html=1;fontFamily=Verdana;'],
    ['color-opacity', 'red 50%', R + 'html=1;fontColor=#ff0000;textOpacity=50;'],
    ['multiline-plain', 'line 1\nline 2\nline 3', R + 'whiteSpace=wrap;'],
    ['rich-html', 'plain <b>bold</b><br><i>italic</i> <font color="#ff0000">red</font>', R + 'whiteSpace=wrap;html=1;'],
    ['rotated-label', 'rotated', R + 'whiteSpace=wrap;html=1;rotation=30;'],
    ['no-label', 'hidden', R + 'whiteSpace=wrap;html=1;noLabel=1;'],
  ];
  const placed = items.map(([id, value, style, w, h]) => ({ id, value, style, w: w ?? 120, h: h ?? 60 }));
  flow(placed, { gapX: 40, gapY: 40 });
  for (const it of placed) page.v(it.id, it.value, it.style, it.x, it.y, it.w, it.h);
  writeFile('labels-vertex-text', [page]);
}

{
  const page = new Page('labels-edge', 'Edge labels');
  const S = 'endArrow=classic;html=1;rounded=0;';
  const LABEL = 'edgeLabel;resizable=0;html=1;inheritText=1;';
  const rowY = (r) => 40 + r * 90;
  page.e('value-center', 'center', S, null, null, { sourcePoint: [40, rowY(0)], targetPoint: [240, rowY(0)] });
  page.e('value-x-neg', 'x=-0.6', S, null, null, { sourcePoint: [300, rowY(0)], targetPoint: [500, rowY(0)], label: [-0.6, 0] });
  page.e('value-x-pos-y', 'x=0.6 y=-15', S, null, null, { sourcePoint: [560, rowY(0)], targetPoint: [760, rowY(0)], label: [0.6, -15] });
  page.e('value-offset', 'offset', S, null, null, { sourcePoint: [40, rowY(1)], targetPoint: [240, rowY(1) + 40], label: [0, 20], offset: [10, -10] });
  page.e('value-no-background', 'no background', S + 'labelBackgroundColor=none;', null, null, { sourcePoint: [300, rowY(1)], targetPoint: [500, rowY(1)] });
  page.e('value-background-border', 'bg + border', S + 'labelBackgroundColor=#ffff88;labelBorderColor=#ff0000;', null, null, { sourcePoint: [560, rowY(1)], targetPoint: [760, rowY(1)] });
  page.e('value-waypoints', 'waypoints', S, null, null, { sourcePoint: [40, rowY(2)], targetPoint: [240, rowY(2) + 60], points: [[140, rowY(2)], [140, rowY(2) + 60]] });
  page.e('value-vertical', 'vertical', S, null, null, { sourcePoint: [320, rowY(2) - 10], targetPoint: [320, rowY(2) + 80] });
  page.e('value-font', 'bold 14', S + 'fontStyle=1;fontSize=14;fontColor=#0000ff;', null, null, { sourcePoint: [400, rowY(2) + 30], targetPoint: [600, rowY(2) + 30] });
  page.e('value-plain', 'plain text', 'endArrow=classic;rounded=0;', null, null, { sourcePoint: [640, rowY(2) + 30], targetPoint: [800, rowY(2) + 30] });
  // Connected orthogonal edge with a value label.
  page.v('ortho-s', 'S', 'rounded=0;whiteSpace=wrap;html=1;', 40, rowY(4), 80, 40);
  page.v('ortho-t', 'T', 'rounded=0;whiteSpace=wrap;html=1;', 240, rowY(4) + 100, 80, 40);
  page.e('ortho-label', 'orthogonal', 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', 'ortho-s', 'ortho-t');
  // Palette "Connector with Labels": child label cells at x=-1, 0, 1.
  const e1 = page.e('labels-edge', '', 'endArrow=classic;html=1;rounded=0;', null, null, { sourcePoint: [400, rowY(4)], targetPoint: [560, rowY(4)] });
  page.v('labels-edge-label', 'Label', LABEL + 'align=center;verticalAlign=middle;', 0, 0, 0, 0, { parent: e1, relative: true, connectable: false });
  page.v('labels-edge-source', 'Source', LABEL + 'align=left;verticalAlign=bottom;', -1, 0, 0, 0, { parent: e1, relative: true, connectable: false });
  page.v('labels-edge-target', 'Target', LABEL + 'align=right;verticalAlign=bottom;', 1, 0, 0, 0, { parent: e1, relative: true, connectable: false });
  // Palette "Connector with Label".
  const e2 = page.e('label-edge', '', 'endArrow=classic;html=1;rounded=0;', null, null, { sourcePoint: [620, rowY(4)], targetPoint: [720, rowY(4)] });
  page.v('label-edge-label', 'Label', LABEL + 'align=center;verticalAlign=middle;', 0, 0, 0, 0, { parent: e2, relative: true, connectable: false });
  // Palette "Connector with Symbol".
  const e3 = page.e('symbol-edge', '', 'endArrow=classic;html=1;rounded=0;', null, null, { sourcePoint: [400, rowY(5) + 20], targetPoint: [500, rowY(5) + 20] });
  page.v('symbol-edge-message', '', 'shape=message;html=1;outlineConnect=0;', 0, 0, 20, 14, { parent: e3, relative: true, offset: [-10, -7] });
  // Child labels with y offsets and offset points, on a bent edge.
  const e4 = page.e('child-offsets', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;', null, null, { sourcePoint: [560, rowY(5)], targetPoint: [780, rowY(5) + 80] });
  page.v('child-offsets-y', 'y=12', LABEL + 'align=center;verticalAlign=middle;', -0.5, 12, 0, 0, { parent: e4, relative: true, connectable: false });
  page.v('child-offsets-point', 'offset', LABEL + 'align=left;verticalAlign=top;', 0.5, 0, 0, 0, { parent: e4, relative: true, connectable: false, offset: [8, 6] });
  page.v('child-offsets-plain', 'plain', 'edgeLabel;resizable=0;align=center;verticalAlign=middle;labelBackgroundColor=#dae8fc;', 1, -10, 0, 0, { parent: e4, relative: true, connectable: false });
  writeFile('labels-edge', [page]);
}

// --- structure ------------------------------------------------------------------

{
  const page = new Page('structure-groups', 'Groups, containers, swimlanes, ports');
  const R = 'rounded=0;whiteSpace=wrap;html=1;';
  page.v('g1', '', 'group', 40, 40, 200, 100, { connectable: false });
  page.v('g1-a', 'G1a', R, 0, 0, 80, 40, { parent: 'g1' });
  page.v('g1-b', 'G1b', 'ellipse;whiteSpace=wrap;html=1;', 120, 60, 80, 40, { parent: 'g1' });
  page.e('g1-edge', '', 'endArrow=classic;html=1;rounded=0;', 'g1-a', 'g1-b', { parent: 'g1' });
  page.v('g2', '', 'group', 300, 40, 220, 140, { connectable: false });
  page.v('g2-a', 'G2a', R, 0, 0, 60, 40, { parent: 'g2' });
  page.v('g2-inner', '', 'group', 80, 60, 140, 80, { parent: 'g2', connectable: false });
  page.v('g2-inner-a', 'In a', R, 0, 0, 60, 40, { parent: 'g2-inner' });
  page.v('g2-inner-b', 'In b', R, 80, 40, 60, 40, { parent: 'g2-inner' });
  page.v('c1', 'Container', 'rounded=0;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;verticalAlign=top;', 40, 220, 240, 160);
  page.v('c1-a', 'C1a', R, 20, 40, 80, 40, { parent: 'c1' });
  page.v('c1-b', 'C1b', R, 140, 100, 80, 40, { parent: 'c1' });
  page.e('c1-edge', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;', 'c1-a', 'c1-b', { parent: 'c1', points: [[60, 120]] });
  page.v('s1', 'Lane', 'swimlane;whiteSpace=wrap;html=1;startSize=30;', 320, 220, 220, 180);
  page.v('s1-a', 'S1a', R, 20, 50, 80, 40, { parent: 's1' });
  page.v('s1-b', 'S1b', R, 120, 120, 80, 40, { parent: 's1' });
  page.v('s2', 'Horizontal', 'swimlane;horizontal=0;whiteSpace=wrap;html=1;startSize=30;', 40, 440, 300, 140);
  page.v('s2-a', 'S2a', R, 50, 20, 80, 40, { parent: 's2' });
  page.v('s2-b', 'S2b', R, 190, 80, 80, 40, { parent: 's2' });
  page.v('s3', 'Filled', 'swimlane;whiteSpace=wrap;html=1;startSize=24;fillColor=#dae8fc;swimlaneFillColor=#f5f5f5;strokeColor=#6c8ebf;', 400, 440, 180, 140);
  page.v('s3-a', 'S3a', R, 50, 60, 80, 40, { parent: 's3' });
  page.e('cross-c1-s1', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;', 'c1-b', 's1-a');
  page.e('cross-s2-s3', '', 'endArrow=classic;html=1;rounded=0;', 's2-b', 's3-a');
  page.v('port-host', 'Host', R, 620, 60, 100, 60);
  page.v('port', '', 'ellipse;html=1;fillColor=#ff0000;strokeColor=none;', 1, 0.5, 10, 10, { parent: 'port-host', relative: true, offset: [-5, -5] });
  page.e('port-edge', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;', 'port', 's1-b');
  writeFile('structure-groups', [page]);
}

{
  const page = new Page('structure-layers', 'Layers');
  const R = 'rounded=0;whiteSpace=wrap;html=1;';
  // The default layer "1" is created by Page; give it cells, then add layers.
  page.v('l1-a', 'Layer 1 a', R, 40, 40, 120, 60);
  page.v('l1-b', 'Layer 1 b', 'ellipse;whiteSpace=wrap;html=1;', 240, 40, 120, 60);
  page.layer('layer-2', 'Middle');
  page.v('l2-a', 'Layer 2', R + 'fillColor=#dae8fc;', 40, 160, 120, 60, { parent: 'layer-2' });
  page.v('l2-hidden-cell', 'Hidden cell', R, 240, 280, 120, 60, { parent: 'layer-2', visible: false });
  page.e('l2-edge-a', '', 'endArrow=classic;html=1;rounded=0;', 'l1-a', 'l2-a', { parent: 'layer-2' });
  page.e('l2-edge-b', '', 'endArrow=classic;html=1;rounded=0;', 'l1-b', 'l2-a', { parent: 'layer-2' });
  page.layer('layer-3', 'Hidden', { visible: false });
  page.v('l3-a', 'Hidden layer', R + 'fillColor=#f8cecc;', 240, 160, 120, 60, { parent: 'layer-3' });
  page.e('l3-edge', '', 'endArrow=classic;html=1;rounded=0;', 'l3-a', 'l1-b', { parent: 'layer-3' });
  page.layer('layer-4', 'Locked', { style: 'locked=1;' });
  page.v('l4-text', 'Locked layer text', 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;', 420, 60, 120, 30, { parent: 'layer-4' });
  writeFile('structure-layers', [page]);
}

{
  const page = new Page('structure-objects', 'object and UserObject cells');
  const R = 'rounded=0;whiteSpace=wrap;html=1;';
  page.v('obj-server', 'Server', R, 40, 40, 120, 60, { object: { tag: 'object', attrs: { tooltip: 'Main server', role: 'db', owner: 'kallol' } } });
  page.v('uo-api', '%name% (%role%)', R, 280, 40, 120, 60, { object: { tag: 'UserObject', attrs: { placeholders: '1', name: 'API', role: 'gateway' } } });
  page.v('uo-html', '<b>%name%</b><br>v%version%', R + 'fillColor=#d5e8d4;', 520, 40, 120, 60, { object: { tag: 'UserObject', attrs: { placeholders: '1', name: 'Service', version: '2.1' } } });
  page.v('uo-variable', '%name% Text', 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;overflow=hidden;', 40, 160, 80, 20, { object: { tag: 'UserObject', attrs: { placeholders: '1', name: 'Variable' } } });
  page.v('uo-link', 'Link', 'text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;align=center;verticalAlign=middle;fontColor=#0000EE;fontStyle=4;', 160, 150, 60, 40, { object: { tag: 'UserObject', attrs: { link: 'https://www.draw.io' } } });
  page.v('obj-tags', 'tagged', 'ellipse;whiteSpace=wrap;html=1;', 280, 150, 120, 60, { object: { tag: 'object', attrs: { tags: 'alpha beta' } } });
  page.e('obj-edge', 'calls', 'endArrow=classic;html=1;rounded=0;', 'obj-server', 'uo-api', { object: { tag: 'object', attrs: { protocol: 'https' } } });
  page.e('plain-edge', '', 'endArrow=classic;html=1;rounded=0;', 'uo-api', 'uo-html');
  page.layer('layer-annotations', 'Annotations', { object: { tag: 'object', attrs: { label: 'Annotations', note: 'layer with properties' } } });
  page.v('annotation', 'Note on a wrapped layer', 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=14;fillColor=#fff2cc;strokeColor=#d6b656;', 520, 150, 140, 70, { parent: 'layer-annotations' });
  writeFile('structure-objects', [page]);
}

{
  const plain = new Page('page-plain', 'Plain');
  plain.v('a', 'A', 'rounded=0;whiteSpace=wrap;html=1;', 40, 40, 120, 60);
  plain.v('b', 'B', 'ellipse;whiteSpace=wrap;html=1;', 240, 120, 120, 60);
  plain.e('ab', '', 'endArrow=classic;html=1;rounded=0;', 'a', 'b');
  const compressed = new Page('page-compressed', 'Compressed');
  compressed.v('c', 'Decide', 'rhombus;whiteSpace=wrap;html=1;', 40, 40, 100, 80);
  compressed.v('d', 'Act', 'rounded=1;whiteSpace=wrap;html=1;', 240, 160, 120, 60);
  compressed.e('cd', 'yes', 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', 'c', 'd');
  const background = new Page('page-background', 'Background and shadow', { background: '#FFF2CC', shadow: '1' });
  background.v('e', 'Shadowed', 'triangle;whiteSpace=wrap;html=1;', 40, 40, 80, 100);
  background.v('f', 'Page shadow', 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;', 200, 60, 120, 60);
  background.e('ef', '', 'endArrow=classic;html=1;rounded=0;', 'e', 'f');
  writeFile('structure-pages', [plain, compressed, background], { compressed: ['page-compressed'] });
}
