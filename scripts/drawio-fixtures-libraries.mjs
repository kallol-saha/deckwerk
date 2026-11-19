// Generates the draw.io reference fixtures for the shape libraries, line
// jumps, the sketch style and fill patterns (test/fixtures/drawio/*.drawio):
//
//   node scripts/drawio-fixtures-libraries.mjs test/fixtures/drawio [--drawio <webapp>]
//   npx vite-node --config vitest.config.ts scripts/drawio-reference.mts -- shapes-basic shapes-arrows …
//
// The Basic, Arrows and Flowchart pages hold every entry of those draw.io
// palettes with the palette's own style and size, read from draw.io's
// sidebar code (js/diagramly/sidebar/Sidebar-*.js) so they stay in step
// with the draw.io release the references are made with.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2).filter((a) => a !== '--');
let outDir = null;
let webapp = process.env.DRAWIO_WEBAPP ?? 'C:/Users/kallo/tools/drawio/src/main/webapp';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--drawio') webapp = args[++i];
  else outDir = args[i];
}
if (!outDir) throw new Error('usage: node scripts/drawio-fixtures-libraries.mjs <outDir> [--drawio <webapp>]');
mkdirSync(outDir, { recursive: true });

// --- XML helpers -----------------------------------------------------------------

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;');
}

function attrs(obj) {
  return Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
}

function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}

const MODEL_ATTRS = {
  dx: '0', dy: '0', grid: '1', gridSize: '10', guides: '1', tooltips: '1', connect: '1', arrows: '1',
  fold: '1', page: '1', pageScale: '1', pageWidth: '850', pageHeight: '1100', math: '0', shadow: '0',
};

class Page {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.cells = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];
    this.ids = new Set(['0', '1']);
  }

  claim(id) {
    if (this.ids.has(id)) throw new Error(`${this.id}: duplicate cell id ${id}`);
    this.ids.add(id);
  }

  v(id, value, style, x, y, w, h) {
    this.claim(id);
    const geo = attrs({ x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h), as: 'geometry' });
    this.cells.push(`<mxCell${attrs({ id, value, style, vertex: '1', parent: '1' })}>\n  <mxGeometry${geo} />\n</mxCell>`);
  }

  e(id, value, style, source, target, opts = {}) {
    this.claim(id);
    const children = [];
    if (opts.sourcePoint) children.push(`<mxPoint${attrs({ x: fmt(opts.sourcePoint[0]), y: fmt(opts.sourcePoint[1]), as: 'sourcePoint' })} />`);
    if (opts.targetPoint) children.push(`<mxPoint${attrs({ x: fmt(opts.targetPoint[0]), y: fmt(opts.targetPoint[1]), as: 'targetPoint' })} />`);
    if (opts.points?.length) {
      children.push(`<Array as="points">\n${opts.points.map(([x, y]) => `      <mxPoint${attrs({ x: fmt(x), y: fmt(y) })} />`).join('\n')}\n    </Array>`);
    }
    const geo = attrs({ relative: '1', as: 'geometry' });
    const geometry = children.length ? `<mxGeometry${geo}>\n    ${children.join('\n    ')}\n  </mxGeometry>` : `<mxGeometry${geo} />`;
    this.cells.push(`<mxCell${attrs({ id, value, style, edge: '1', parent: '1', source, target })}>\n  ${geometry}\n</mxCell>`);
  }

  xml() {
    const body = this.cells.map((c) => c.split('\n').map((l) => `      ${l}`).join('\n')).join('\n');
    return `    <mxGraphModel${attrs(MODEL_ATTRS)}>\n      <root>\n${body}\n      </root>\n    </mxGraphModel>`;
  }
}

function writeFixture(name, page) {
  const xml = `<mxfile host="deckwerk-fixtures" agent="drawio-reference fixtures" version="32.7.4">\n`
    + `  <diagram${attrs({ id: page.id, name: page.name })}>\n${page.xml()}\n  </diagram>\n</mxfile>\n`;
  writeFileSync(join(outDir, `${name}.drawio`), xml);
  console.log(`${name}.drawio: ${page.cells.length - 2} cells`);
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

// --- palettes, read from draw.io's sidebar code ------------------------------------

/** The template entries a Sidebar-*.js palette function creates, in order. */
function paletteEntries(file, fn) {
  const context = { console };
  vm.createContext(context);
  vm.runInContext('function mxRectangle() {} function mxPoint() {}', context);
  vm.runInContext(readFileSync(join(webapp, 'mxgraph/src/util/mxConstants.js'), 'utf8'), context);
  vm.runInContext('var mxResources = { get: function(k) { return k; } }; var mxUtils = { bind: function(s, f) { return f; } }; function Sidebar() {}', context);
  vm.runInContext(readFileSync(join(webapp, file), 'utf8'), context);
  const entries = [];
  vm.runInContext(`(function(entries) {
    var sb = Object.create(Sidebar.prototype);
    sb.createVertexTemplateEntry = function(style, w, h, value, title) { var e = {kind: 'vertex', style: style, w: w, h: h, value: value, title: title}; entries.push(e); return e; };
    sb.createEdgeTemplateEntry = function(style, w, h, value, title) { var e = {kind: 'edge', style: style, w: w, h: h, value: value, title: title}; entries.push(e); return e; };
    sb.addPaletteFunctions = function() {};
    sb.addPalette = function() {};
    sb.getTagsForStencil = function() { return []; };
    sb.setCurrentSearchEntryLibrary = function() {};
    sb.setPickerShapes = function() {};
    sb.${fn}();
  })`, context)(entries);
  return entries;
}

function palettePage(name, entries) {
  const page = new Page(`page-${name}`, name);
  const vertices = [];
  const edges = [];
  for (const e of entries) (e.kind === 'edge' ? edges : vertices).push({ ...e, w: Math.round(e.w), h: Math.round(e.h) });
  const bottom = flow(vertices);
  vertices.forEach((it, i) => page.v(`${name}-${i + 1}`, it.value ?? '', it.style, it.x, it.y, it.w, it.h));
  // Edge entries are drawn as loose connectors along the bottom
  edges.forEach((it, i) => {
    const x = 20 + i * (it.w + 40);
    const y = bottom + 40;
    page.e(`${name}-edge-${i + 1}`, it.value ?? '', it.style, null, null, { sourcePoint: [x, y + it.h], targetPoint: [x + it.w, y] });
  });
  return page;
}

writeFixture('shapes-basic', palettePage('basic', paletteEntries('js/diagramly/sidebar/Sidebar-Basic.js', 'addBasicPalette')));
writeFixture('shapes-arrows', palettePage('arrows', paletteEntries('js/diagramly/sidebar/Sidebar-Arrows2.js', 'addArrows2Palette')));
writeFixture('shapes-flowchart', palettePage('flowchart', paletteEntries('js/diagramly/sidebar/Sidebar-Flowchart.js', 'addFlowchartPalette')));

// --- line jumps -------------------------------------------------------------------

{
  const page = new Page('page-jumps', 'Line jumps');
  const R = 'rounded=0;whiteSpace=wrap;html=1;';
  // A grid of crossing connectors: horizontal ones first, vertical ones with jumps after them
  page.v('a1', '', R, 20, 40, 40, 40);
  page.v('a2', '', R, 20, 140, 40, 40);
  page.v('a3', '', R, 20, 240, 40, 40);
  page.v('b1', '', R, 560, 40, 40, 40);
  page.v('b2', '', R, 560, 140, 40, 40);
  page.v('b3', '', R, 560, 240, 40, 40);
  page.e('h1', '', 'endArrow=classic;html=1;', 'a1', 'b1');
  page.e('h2', '', 'endArrow=classic;html=1;strokeWidth=2;', 'a2', 'b2');
  page.e('h3', '', 'endArrow=classic;html=1;dashed=1;', 'a3', 'b3');
  const styles = ['arc', 'gap', 'sharp', 'line', 'arc;jumpSize=14', 'sharp;jumpSize=10;strokeWidth=3'];
  styles.forEach((s, i) => {
    const x = 100 + i * 70;
    page.e(`v${i + 1}`, '', `endArrow=classic;html=1;jumpStyle=${s};`, null, null, { sourcePoint: [x, 10], targetPoint: [x, 320] });
  });
  // Orthogonal connectors with waypoints, rounded, that jump the ones before them
  page.e('o1', '', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jumpStyle=arc;jumpSize=10;', null, null,
    { sourcePoint: [80, 400], targetPoint: [540, 360], points: [[300, 400], [300, 20]] });
  page.e('o2', '', 'edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;jumpStyle=arc;', null, null,
    { sourcePoint: [40, 300], targetPoint: [600, 380], points: [[40, 380]] });
  page.e('o3', '', 'html=1;jumpStyle=gap;endArrow=block;endFill=1;', null, null, { sourcePoint: [20, 20], targetPoint: [620, 420] });
  page.e('o4', '', 'html=1;jumpStyle=arc;noJump=1;', null, null, { sourcePoint: [620, 20], targetPoint: [20, 420] });
  page.e('o5', '', 'html=1;jumpStyle=sharp;', null, null, { sourcePoint: [640, 60], targetPoint: [640, 420], points: [[500, 200]] });
  writeFixture('edges-jumps', page);
}

// --- fill patterns ----------------------------------------------------------------

{
  const page = new Page('page-patterns', 'Fill patterns');
  // The first cells sit at the export border, so draw.io's exported patterns
  // are anchored at the page origin as on screen
  const types = ['hatch', 'dots', 'cross-hatch', 'dashed', 'zigzag-line'];
  const variants = ['', 'strokeWidth=3;', 'hachureGap=6;', 'fillWeight=3;', 'hachureAngle=30;', 'hachureGap=12;fillWeight=1;hachureAngle=-20;'];
  // (the stroke of the widest first-row cell starts at y = 9.5, so the export translate is 0)
  let y = 11;
  types.forEach((type, t) => {
    variants.forEach((variant, v) => {
      const shape = ['', 'ellipse;', 'rhombus;', 'rounded=1;', 'shape=hexagon;perimeter=hexagonPerimeter2;', 'shape=cylinder3;'][v];
      const color = ['#dae8fc', '#d5e8d4', '#ffe6cc', '#f8cecc', '#e1d5e7'][t];
      const stroke = ['#6c8ebf', '#82b366', '#d79b00', '#b85450', '#9673a6'][t];
      page.v(`p-${type}-${v + 1}`, '', `${shape}whiteSpace=wrap;html=1;fillStyle=${type};fillColor=${stroke};strokeColor=${stroke};${variant}`,
        10 + v * 130, y, 110, 70);
      void color;
    });
    y += 90;
  });
  writeFixture('styles-fill-patterns', page);
}

// --- sketch style -----------------------------------------------------------------

{
  const page = new Page('page-sketch', 'Sketch');
  const S = 'sketch=1;curveFitting=1;jiggle=2;html=1;whiteSpace=wrap;';
  const cells = [
    ['white', `rounded=1;${S}`, 120, 60],
    ['solid', `${S}fillColor=#dae8fc;strokeColor=#6c8ebf;fillStyle=solid;`, 120, 60],
    ['hachure', `ellipse;${S}fillColor=#d5e8d4;strokeColor=#82b366;`, 120, 60],
    ['zigzag', `rhombus;${S}fillColor=#ffe6cc;strokeColor=#d79b00;fillStyle=zigzag;`, 100, 80],
    ['crosshatch', `${S}fillColor=#f8cecc;fillStyle=cross-hatch;hachureGap=6;`, 120, 60],
    ['dashed', `${S}fillColor=#e1d5e7;fillStyle=dashed;strokeWidth=2;dashed=1;`, 120, 60],
    ['zigzagline', `${S}fillColor=#fff2cc;fillStyle=zigzag-line;`, 120, 60],
    ['gradient', `${S}fillColor=#dae8fc;gradientColor=#7ea6e0;`, 120, 60],
    ['decision', `shape=mxgraph.flowchart.decision;${S}fillColor=#d5e8d4;`, 100, 80],
    ['cylinder', `shape=cylinder3;boundedLbl=1;size=15;${S}fillColor=#f5f5f5;`, 80, 90],
    ['cloud', `ellipse;shape=cloud;${S}fillColor=#dae8fc;`, 120, 80],
    ['star', `shape=mxgraph.basic.star;${S}fillColor=#ffe6cc;`, 90, 90],
  ];
  const items = cells.map(([id, style, w, h]) => ({ id, style, w, h }));
  const bottom = flow(items, { x0: 20, y0: 20, maxWidth: 760 });
  for (const it of items) page.v(`sk-${it.id}`, '', it.style, it.x, it.y, it.w, it.h);
  page.e('sk-e1', '', `endArrow=classic;${S}`, 'sk-white', 'sk-solid');
  page.e('sk-e2', '', `edgeStyle=orthogonalEdgeStyle;rounded=1;endArrow=block;endFill=1;${S}`, 'sk-hachure', 'sk-decision');
  page.e('sk-e3', '', `curved=1;endArrow=open;${S}`, null, null, { sourcePoint: [40, bottom + 40], targetPoint: [400, bottom + 40], points: [[220, bottom + 100]] });
  page.e('sk-e4', '', `startArrow=diamond;endArrow=oval;strokeWidth=2;${S}`, null, null, { sourcePoint: [440, bottom + 60], targetPoint: [700, bottom + 30] });
  writeFixture('styles-sketch', page);
}
