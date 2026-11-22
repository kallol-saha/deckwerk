/**
 * draw.io reference generator
 * ===========================
 *
 * Renders the `.drawio` fixtures in `test/fixtures/drawio/` with the REAL
 * draw.io code and records what it computed, so DeckWerk's TypeScript port
 * (src/shared/diagram/) can be compared against it numerically and by pixels
 * without the draw.io clone being present at test time. The outputs are
 * committed beside each fixture:
 *
 *   <name>.reference.json   per page, per cell: resolved style, absolute state
 *                           bounds, edge absolutePoints, terminal points,
 *                           perimeter probes, label box / measured bounding
 *                           box / margin and the canvas text() call
 *                           (schema: DrawioReference in test/support/drawioReference.ts)
 *   <name>.<page>.svg       draw.io's SVG export of the page (Graph.getSvg)
 *   <name>.<page>.png       that SVG rasterised by Chromium at 2x over white
 *
 * Regenerate (after adding or editing a fixture, or moving to a new draw.io):
 *
 *   npx vite-node --config vitest.config.ts scripts/drawio-reference.mts -- [--drawio <webapp>] [fixture …]
 *
 *   --drawio <webapp>  draw.io's `src/main/webapp` folder (jgraph/drawio, the
 *                      release named in docs/diagrams-plan.md). Default: env
 *                      DRAWIO_WEBAPP, else C:/Users/kallo/tools/drawio/src/main/webapp.
 *   fixture …          names (`edges-orthogonal`), file names or paths of
 *                      fixtures in test/fixtures/drawio; default: all of them.
 *
 * Then run `npx vitest run test/drawioReference.test.ts` and review the diff
 * of the JSON. Text metrics come from the machine's fonts, so regenerate the
 * whole set on one machine; `generator` in the JSON records the platform and
 * browser.
 *
 * How it renders, and why: one hidden offscreen Electron window loads
 * draw.io's own headless export setup — what export3.html/js/export.js do in
 * draw.io desktop's CLI export — from the clone:
 *
 *   js/app.min.js            the editor build: mxGraph, Graph.js (style, label,
 *                            routing and export overrides), Shapes.js, the
 *                            diagramly Editor and the default-style2 theme,
 *                            i.e. the code that draws diagrams in the editor
 *   js/stencils.min.js       every stencil set, loaded up front with
 *   js/shapes-14-6-5.min.js  the shape libraries (mxgraph.* classes), as the
 *                            desktop export does with mxStencilRegistry.allowEval
 *                            = false, so nothing is lazily fetched
 *   mxgraph/css/common.css
 *
 * Each page is decoded into a fresh `new Graph(container)` (folding off,
 * disabled, view at scale 1 and translate 0) as js/export.js renderPage does,
 * then read cell by cell, then exported with
 * `graph.getSvg(background, 1, BORDER, false, null, true, null, imgExport,
 * null, null, null, 'light')` plus `addSvgShadow` for pages with shadow="1".
 * The theme is fixed to light (mxUtils.lightDarkColorSupported = false), as
 * the export does for a fixed theme, so OS dark mode cannot change a colour;
 * Math.random is seeded per page so ids (and sketch strokes) are stable.
 */

import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DRAWIO_FIXTURE_DIR,
  REFERENCE_PNG_BACKGROUND,
  REFERENCE_PNG_SCALE,
  listDrawioFixtures,
  rasterizeSvgFiles,
  referenceJsonPath,
  referencePngPath,
  referenceSvgPath,
  runElectronScript,
  type DrawioReference,
  type ReferencePage,
} from '../test/support/drawioReference.js';

const DEFAULT_WEBAPP = 'C:/Users/kallo/tools/drawio/src/main/webapp';
/** Pixels around the drawing in the SVG export. */
const BORDER = 10;
const BUNDLES = ['js/app.min.js', 'js/stencils.min.js', 'js/shapes-14-6-5.min.js'];
const STYLESHEETS = ['mxgraph/css/common.css'];

// --- the page draw.io runs in -----------------------------------------------------

function pageHtml(webapp: string, harnessPath: string): string {
  const base = pathToFileURL(webapp.endsWith('/') || webapp.endsWith('\\') ? webapp : `${webapp}/`).href;
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<base href="${base}">`,
    ...STYLESHEETS.map((href) => `<link rel="stylesheet" href="${href}">`),
    // js/export-init.js: no local storage, no stylesheet loading.
    '<script>var isLocalStorage = false; var mxLoadStylesheets = false; var urlParams = {};</script>',
    `<script src="${BUNDLES[0]}"></script>`,
    // js/export.js (desktop): every shape is preloaded, so no eval-based lazy loading.
    '<script>mxStencilRegistry.allowEval = false;</script>',
    ...BUNDLES.slice(1).map((src) => `<script src="${src}"></script>`),
    // Math typesetting (App.js calls this at startup): MathJax from math4/es5,
    // loaded before the first page with math="1" (see the runner).
    '<script>Editor.initMath();</script>',
    `<script src="${pathToFileURL(harnessPath).href}"></script>`,
    '</head><body style="margin:0"></body></html>',
  ].join('\n');
}

/**
 * Runs in the page, after draw.io's bundles. Plain ES5 like draw.io itself;
 * `drawioReference.run(text, border)` returns { ok, value | error }.
 */
const HARNESS = String.raw`
(function () {
  'use strict';

  // A fixed light theme (js/export.js for theme=light): light-dark() colours
  // resolve to their light side whatever the OS colour scheme is.
  mxUtils.lightDarkColorSupported = false;
  mxUtils.preferDarkColor = false;

  // Seeded Math.random (mulberry32): Editor.guid names SVG ids and the
  // sketch style draws random strokes; both must not change between runs.
  var seed = 1;
  Math.random = function () {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function point(p) {
    return (p == null) ? null : { x: p.x, y: p.y };
  }

  function rect(r) {
    return (r == null) ? null : { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  function functionName(fn) {
    if (fn == null) return null;
    var name = mxStyleRegistry.getName(fn);
    return (name != null) ? name : (fn.name || 'function');
  }

  function styleValue(value) {
    if (typeof value === 'function') return functionName(value);
    if (value == null) return null;
    if (typeof value === 'object') return String(value);
    return value;
  }

  function styleObject(style) {
    var out = {};
    if (style != null) {
      for (var key in style) {
        if (Object.prototype.hasOwnProperty.call(style, key)) out[key] = styleValue(style[key]);
      }
    }
    return out;
  }

  function geometry(g) {
    if (g == null) return null;
    return {
      x: g.x, y: g.y, width: g.width, height: g.height, relative: !!g.relative,
      offset: point(g.offset),
      points: (g.points != null) ? g.points.map(point) : null,
      sourcePoint: point(g.sourcePoint),
      targetPoint: point(g.targetPoint)
    };
  }

  // Same precedence as DeckWerk's reader (drawioFile.ts readCell).
  function kindOf(model, cell) {
    if (model.isVertex(cell)) return 'vertex';
    if (model.isEdge(cell)) return 'edge';
    if (model.getParent(cell) == null) return 'root';
    if (model.getParent(cell) == model.getRoot()) return 'layer';
    return 'other';
  }

  function registeredShapeName(ctor) {
    var shapes = mxCellRenderer.defaultShapes;
    for (var key in shapes) {
      if (shapes[key] === ctor) return key;
    }
    return null;
  }

  function shapeInfo(state) {
    var shape = state.shape;
    if (shape == null) return null;
    var stencil = shape.stencil != null;
    return {
      name: (state.style.shape != null) ? String(state.style.shape) : null,
      implementation: stencil ? 'stencil' : (registeredShapeName(shape.constructor) || shape.constructor.name || null),
      stencil: stencil,
      bounds: rect(shape.bounds),
      boundingBox: rect(shape.boundingBox),
      rotation: shape.rotation || 0,
      direction: shape.direction || null,
      flipH: !!shape.flipH,
      flipV: !!shape.flipV,
      strokeWidth: (shape.strokewidth != null) ? Number(shape.strokewidth) : null
    };
  }

  function textInfo(state, draws) {
    var t = state.text;
    if (t == null) return null;
    return {
      html: t.dialect == mxConstants.DIALECT_STRICTHTML || mxUtils.isNode(t.value),
      bounds: rect(t.bounds),
      boundingBox: rect(t.boundingBox),
      unrotatedBoundingBox: rect(t.unrotatedBoundingBox),
      margin: point(t.margin),
      spacing: { base: Number(t.spacing), top: Number(t.spacingTop), right: Number(t.spacingRight),
        bottom: Number(t.spacingBottom), left: Number(t.spacingLeft) },
      align: t.align || null,
      valign: t.valign || null,
      horizontal: !(t.horizontal === false || t.horizontal == 0),
      rotation: t.getTextRotation(),
      wrap: !!t.wrap,
      clipped: !!t.clipped,
      overflow: t.overflow || null,
      font: { size: Number(t.size), family: String(t.family), style: Number(t.fontStyle) || 0, color: t.color || null },
      background: t.background || null,
      border: t.border || null,
      opacity: Number(t.opacity),
      textOpacity: Number(t.textOpacity),
      textDirection: t.textDirection || null,
      draws: draws || []
    };
  }

  var PROBES = 16;

  function perimeterInfo(graph, state) {
    var view = graph.view;
    var cx = state.getCenterX();
    var cy = state.getCenterY();
    var r = Math.max(state.width, state.height) * 4 + 100;
    var probes = [];
    for (var k = 0; k < PROBES; k++) {
      var angle = k * 360 / PROBES;
      var a = mxUtils.toRadians(angle);
      var toward = new mxPoint(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      var p = null;
      try { p = view.getPerimeterPoint(state, toward, false, 0); } catch (e) { p = null; }
      probes.push({ angle: angle, toward: point(toward), point: point(p) });
    }
    return { name: functionName(view.getPerimeterFunction(state)), probes: probes };
  }

  function edgeInfo(graph, state) {
    var view = graph.view;
    var pts = state.absolutePoints || [];
    var source = state.getVisibleTerminalState(true);
    var target = state.getVisibleTerminalState(false);
    var styleFn = null;
    try {
      var geo = graph.model.getGeometry(state.cell);
      styleFn = view.getEdgeStyle(state, (geo != null) ? geo.points : null, source, target);
    } catch (e) { styleFn = null; }
    return {
      points: pts.map(point),
      source: (source != null) ? source.cell.id : null,
      target: (target != null) ? target.cell.id : null,
      sourcePoint: point(pts[0]),
      targetPoint: point(pts[pts.length - 1]),
      edgeStyle: functionName(styleFn),
      length: state.length,
      terminalDistance: state.terminalDistance,
      segments: (state.segments != null) ? state.segments.slice() : null
    };
  }

  function isEdgeLabel(model, cell) {
    var parent = model.getParent(cell);
    var geo = model.getGeometry(cell);
    return parent != null && model.isEdge(parent) && geo != null && geo.relative;
  }

  function collectCells(model) {
    var cells = [];
    (function visit(cell) {
      cells.push(cell);
      var n = model.getChildCount(cell);
      for (var i = 0; i < n; i++) visit(model.getChildAt(cell, i));
    })(model.getRoot());
    return cells;
  }

  // Graph.getSvg with the canvas text() calls recorded per cell.
  function exportSvg(graph, background, border, draws) {
    var current = null;
    var imgExport = graph.createSvgImageExport();
    var drawText = imgExport.drawText;
    imgExport.drawText = function (state) {
      var previous = current;
      current = state;
      try { return drawText.apply(this, arguments); } finally { current = previous; }
    };
    var canvas = null;
    var createSvgCanvas = graph.createSvgCanvas;
    graph.createSvgCanvas = function () {
      canvas = createSvgCanvas.apply(this, arguments);
      var text = canvas.text;
      canvas.text = function (x, y, w, h, str, align, valign, wrap, format, overflow, clip, rotation, dir) {
        if (current != null) {
          var s = this.state;
          var list = draws[current.cell.id] || (draws[current.cell.id] = []);
          list.push({
            x: x, y: y, width: w, height: h,
            value: (typeof str === 'string') ? str : (str != null && str.outerHTML != null ? str.outerHTML : String(str)),
            align: align || null, valign: valign || null, wrap: !!wrap, format: format || '',
            overflow: overflow || null, clip: !!clip, rotation: rotation || 0, dir: dir || null,
            canvas: {
              dx: s.dx, dy: s.dy, scale: s.scale, rotation: s.rotation, rotationCx: s.rotationCx, rotationCy: s.rotationCy,
              alpha: s.alpha, fontSize: s.fontSize, fontFamily: s.fontFamily, fontStyle: s.fontStyle,
              fontColor: s.fontColor, fontBackgroundColor: s.fontBackgroundColor, fontBorderColor: s.fontBorderColor
            }
          });
        }
        return text.apply(this, arguments);
      };
      return canvas;
    };
    var graphBackground = graph.background;
    graph.background = background;
    try {
      var root = graph.getSvg(background, 1, border, false, null, true, null, imgExport,
        null, null, null, 'light');
      return { root: root, translate: { x: canvas.state.dx, y: canvas.state.dy } };
    } finally {
      graph.createSvgCanvas = createSvgCanvas;
      graph.background = graphBackground;
    }
  }

  function renderPage(modelNode, info, border) {
    seed = 1;
    var container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1200px;overflow:hidden;';
    document.body.appendChild(container);
    var graph = new Graph(container);
    try {
      // js/export.js renderPage
      if (typeof graph.setMeasureScale === 'function') {
        graph.setMeasureScale(modelNode.getAttribute('measureScale'));
      }
      if (typeof graph.setBackgroundGradient === 'function') {
        graph.setBackgroundGradient(modelNode.getAttribute('backgroundGradient'),
          modelNode.getAttribute('backgroundGradientDirection'));
      }
      var gs = modelNode.getAttribute('gridSize');
      graph.gridSize = (gs != null) ? parseFloat(gs) : mxGraph.prototype.gridSize;
      graph.foldingEnabled = false;
      graph.setEnabled(false);
      graph.setBackgroundImage(null);
      // Editor.setGraphXml: math="1" typesets labels (getSvg runs MathJax).
      graph.mathEnabled = modelNode.getAttribute('math') == '1';
      new mxCodec(modelNode.ownerDocument).decode(modelNode, graph.getModel());
      graph.view.scaleAndTranslate(1, 0, 0);

      var bg = modelNode.getAttribute('background');
      if (bg == 'none' || bg == '') bg = null;
      var draws = {};
      var svg = exportSvg(graph, bg, border, draws);
      if (modelNode.getAttribute('shadow') == '1') graph.addSvgShadow(svg.root);
      var svgText = Graph.xmlDeclaration + '\n' + Graph.svgDoctype + '\n' + mxUtils.getXml(svg.root) + '\n';

      var model = graph.getModel();
      var cells = collectCells(model);
      var records = cells.map(function (cell, order) {
        var kind = kindOf(model, cell);
        var state = graph.view.getState(cell);
        var parent = model.getParent(cell);
        var label = null;
        try { label = graph.getLabel(cell); } catch (e) { label = null; }
        var record = {
          id: cell.id,
          kind: kind,
          parent: (parent != null) ? parent.id : null,
          order: order,
          style: cell.style || '',
          label: (label == null) ? null : (mxUtils.isNode(label) ? mxUtils.getXml(label) : String(label)),
          visible: model.isVisible(cell),
          geometry: geometry(model.getGeometry(cell)),
          resolvedStyle: styleObject((state != null) ? state.style : graph.getCellStyle(cell)),
          state: null
        };
        if (state != null && (kind == 'vertex' || kind == 'edge')) {
          var s = {
            x: state.x, y: state.y, width: state.width, height: state.height,
            origin: point(state.origin),
            absoluteOffset: point(state.absoluteOffset),
            shape: shapeInfo(state),
            text: textInfo(state, draws[cell.id])
          };
          if (kind == 'edge') s.edge = edgeInfo(graph, state);
          else if (!isEdgeLabel(model, cell)) s.perimeter = perimeterInfo(graph, state);
          record.state = s;
        }
        return record;
      });

      var attributes = {};
      for (var i = 0; i < modelNode.attributes.length; i++) {
        attributes[modelNode.attributes[i].name] = modelNode.attributes[i].value;
      }
      return {
        index: info.index,
        id: info.id,
        name: info.name,
        model: attributes,
        graphBounds: rect(graph.getGraphBounds()),
        svg: {
          text: svgText,
          // Read after addSvgShadow, which grows the SVG by the shadow size.
          width: parseFloat(svg.root.getAttribute('width')),
          height: parseFloat(svg.root.getAttribute('height')),
          scale: 1,
          border: border,
          translate: svg.translate,
          background: bg
        },
        cells: records
      };
    } finally {
      graph.destroy();
      container.parentNode.removeChild(container);
    }
  }

  function renderFile(text, border) {
    var root = mxUtils.parseXml(text).documentElement;
    if (root == null || root.nodeName != 'mxfile') throw new Error('Expected an <mxfile> document.');
    var pages = [];
    var index = 0;
    for (var node = root.firstChild; node != null; node = node.nextSibling) {
      if (node.nodeType != mxConstants.NODETYPE_ELEMENT || node.nodeName != 'diagram') continue;
      var modelNode = Editor.parseDiagramNode(node);
      if (modelNode == null) throw new Error('Page ' + index + ' has no diagram.');
      pages.push(renderPage(modelNode, { index: index, id: node.getAttribute('id') || '', name: node.getAttribute('name') || '' }, border));
      index++;
    }
    return { pages: pages };
  }

  window.drawioReference = {
    version: function () { return EditorUi.VERSION; },
    run: function (text, border) {
      try {
        return { ok: true, value: renderFile(text, border) };
      } catch (e) {
        return { ok: false, error: String((e && e.stack) || e) };
      }
    }
  };
})();
`;

/** Electron main: loads the page, renders each fixture, writes one raw result file per fixture. */
const MAIN = String.raw`
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');

const problems = [];
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600, height: 1200, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_event, level, message, line, source) => {
    if (level >= 2 && !/Electron Security Warning/.test(message)) {
      problems.push(message + ' (' + source + ':' + line + ')');
    }
  });
  await win.loadURL(pathToFileURL(job.pagePath).href);
  const ready = await win.webContents.executeJavaScript('typeof window.drawioReference === "object" && typeof Graph === "function"');
  if (!ready) throw new Error('draw.io did not load: ' + problems.join('; '));
  const version = await win.webContents.executeJavaScript('drawioReference.version()');
  for (const fixture of job.fixtures) {
    const text = readFileSync(fixture.path, 'utf8');
    // MathJax is loaded once, before the first fixture that typesets.
    if (/\bmath="1"/.test(text)) {
      await win.webContents.executeJavaScript('new Promise(function (r) { Editor.loadMath(r); })');
    }
    const result = await win.webContents.executeJavaScript('drawioReference.run(' + JSON.stringify(text) + ', ' + job.border + ')');
    if (!result.ok) throw new Error(fixture.name + ': ' + result.error);
    writeFileSync(fixture.resultPath, JSON.stringify(result.value));
    process.stderr.write('rendered ' + fixture.name + '\n');
  }
  process.stdout.write(JSON.stringify({
    drawio: version,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: process.platform + '-' + process.arch,
    problems,
  }));
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String((error && error.stack) || error) + '\n' + problems.join('\n'));
  app.exit(1);
});
`;

// --- output --------------------------------------------------------------------------

/** Rounds to 3 decimals (no -0, no non-finite) and sorts object keys, recursively. */
function normalize(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) out[key] = normalize(entry);
    }
    return out;
  }
  return value;
}

function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${inlineJson(entry)}`).join(', ')}}`;
  }
  return JSON.stringify(value);
}

/**
 * JSON with one entry per line, except that anything fitting in 100
 * columns (a point, a rect, a probe, a short route) stays on its line: the
 * diff of a regenerated reference then shows which values moved.
 */
function formatJson(value: unknown, indent = ''): string {
  const inline = inlineJson(value);
  if (value === null || typeof value !== 'object' || indent.length + inline.length <= 100) return inline;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `[\n${value.map((entry) => inner + formatJson(entry, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([key, entry]) => `${inner}${JSON.stringify(key)}: ${formatJson(entry, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

interface RawPage extends Omit<ReferencePage, 'svg' | 'png'> {
  svg: ReferencePage['svg'] & { text: string };
}

interface RawRun {
  drawio: string;
  electron: string;
  chromium: string;
  platform: string;
  problems: string[];
}

function parseArgs(argv: string[]): { webapp: string; fixtures: string[] } {
  let webapp = process.env.DRAWIO_WEBAPP || DEFAULT_WEBAPP;
  const fixtures: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--drawio') {
      const value = argv[++i];
      if (!value) throw new Error('--drawio needs the path of draw.io\'s src/main/webapp folder.');
      webapp = value;
    } else if (arg.startsWith('--drawio=')) {
      webapp = arg.slice('--drawio='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log('usage: drawio-reference.mts [--drawio <webapp>] [fixture …]');
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      fixtures.push(arg);
    }
  }
  return { webapp: resolve(webapp), fixtures };
}

function fixtureName(arg: string): string {
  const name = basename(arg).replace(/\.drawio$/, '');
  if (!existsSync(join(DRAWIO_FIXTURE_DIR, `${name}.drawio`))) {
    throw new Error(`No fixture ${name}.drawio in ${DRAWIO_FIXTURE_DIR}.`);
  }
  return name;
}

/** Page outputs of a fixture that no longer has that page. */
async function removeStalePages(name: string, pageCount: number): Promise<void> {
  const escaped = name.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\.(\\d+)\\.(svg|png)$`);
  for (const file of readdirSync(DRAWIO_FIXTURE_DIR)) {
    const match = pattern.exec(file);
    if (match && Number(match[1]) >= pageCount) await unlink(join(DRAWIO_FIXTURE_DIR, file));
  }
}

async function main(): Promise<void> {
  const { webapp, fixtures: requested } = parseArgs(process.argv.slice(2));
  for (const file of [...BUNDLES, ...STYLESHEETS]) {
    if (!existsSync(join(webapp, file))) {
      throw new Error(`${join(webapp, file)} is missing: --drawio (or DRAWIO_WEBAPP) must name draw.io's src/main/webapp folder.`);
    }
  }
  const names = requested.length > 0 ? requested.map(fixtureName) : listDrawioFixtures();
  if (names.length === 0) throw new Error(`No fixtures in ${DRAWIO_FIXTURE_DIR}.`);

  const work = await mkdtemp(join(tmpdir(), 'drawio-reference-'));
  try {
    const harnessPath = join(work, 'harness.js');
    const pagePath = join(work, 'page.html');
    await writeFile(harnessPath, HARNESS, 'utf8');
    await writeFile(pagePath, pageHtml(webapp, harnessPath), 'utf8');
    const jobs = names.map((name) => ({ name, path: join(DRAWIO_FIXTURE_DIR, `${name}.drawio`), resultPath: join(work, `${name}.json`) }));

    console.log(`draw.io: ${webapp}`);
    const run = JSON.parse(await runElectronScript(MAIN, { pagePath, border: BORDER, fixtures: jobs }, {
      timeoutMs: 60_000 + jobs.length * 15_000,
      onLine: (line) => console.log(`  ${line}`),
    })) as RawRun;
    for (const problem of run.problems) console.warn(`  console: ${problem}`);

    const rendered: Array<{ name: string; pages: RawPage[] }> = [];
    const rasterJobs: Array<{ svgPath: string; pngPath: string }> = [];
    for (const job of jobs) {
      const raw = JSON.parse(await readFile(job.resultPath, 'utf8')) as { pages: RawPage[] };
      for (const page of raw.pages) {
        const svgPath = referenceSvgPath(job.name, page.index);
        await writeFile(svgPath, page.svg.text, 'utf8');
        rasterJobs.push({ svgPath, pngPath: referencePngPath(job.name, page.index) });
      }
      rendered.push({ name: job.name, pages: raw.pages });
    }

    console.log(`rasterising ${rasterJobs.length} SVG(s) at ${REFERENCE_PNG_SCALE}x`);
    const sizes = new Map((await rasterizeSvgFiles(rasterJobs)).map((r) => [resolve(r.pngPath), r]));

    for (const { name, pages } of rendered) {
      const reference: DrawioReference = {
        fixture: `${name}.drawio`,
        generator: {
          drawio: run.drawio,
          bundles: BUNDLES,
          electron: run.electron,
          chromium: run.chromium,
          platform: run.platform,
        },
        pages: pages.map((page) => {
          const pngPath = referencePngPath(name, page.index);
          const size = sizes.get(resolve(pngPath));
          if (!size) throw new Error(`${pngPath} was not rasterised.`);
          const { width, height, scale, border, translate, background } = page.svg;
          return {
            ...page,
            svg: { file: basename(referenceSvgPath(name, page.index)), width, height, scale, border, translate, background },
            png: {
              file: basename(pngPath),
              width: size.width,
              height: size.height,
              scale: REFERENCE_PNG_SCALE,
              background: REFERENCE_PNG_BACKGROUND,
            },
          };
        }),
      };
      await writeFile(referenceJsonPath(name), `${formatJson(normalize(reference))}\n`, 'utf8');
      await removeStalePages(name, pages.length);
      const cellCount = pages.reduce((n, page) => n + page.cells.length, 0);
      console.log(`  ${name}: ${pages.length} page(s), ${cellCount} cells`);
    }
    console.log(`wrote references for ${rendered.length} fixture(s) to ${DRAWIO_FIXTURE_DIR}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
