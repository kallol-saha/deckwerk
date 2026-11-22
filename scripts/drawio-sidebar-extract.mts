/**
 * Extracts draw.io's default shape palettes (General, Misc, Advanced, Basic,
 * Arrows, Flowchart, Entity Relation, UML) into
 * src/shared/diagram/library/palettes.generated.ts, for the Shapes panel.
 *
 *   npx vite-node --config vitest.config.ts scripts/drawio-sidebar-extract.mts -- [--drawio <webapp>] [--check]
 *
 * --check writes nothing and fails when the checked-in file differs.
 *
 * The palettes are not transcribed: draw.io's own palette functions run here,
 * in a sandbox where mxCell, mxGeometry and the Sidebar template helpers are
 * small stand-ins that record what each entry would insert. Sources, from the
 * clone of jgraph/drawio (DRAWIO_WEBAPP, else C:/Users/kallo/tools/drawio/src/main/webapp):
 *
 *   js/grapheditor/Sidebar.js                 addGeneralPalette, addMiscPalette, addAdvancedPalette,
 *                                             createAdvancedShapes, addUmlPalette, the template helpers
 *   js/diagramly/sidebar/Sidebar-Basic.js     addBasicPalette
 *   js/diagramly/sidebar/Sidebar-Arrows2.js   addArrows2Palette
 *   js/diagramly/sidebar/Sidebar-Flowchart.js addFlowchartPalette
 *   js/diagramly/sidebar/Sidebar-ER.js        addErPalette
 *   js/diagramly/sidebar/Sidebar.js           tagIndex (extra search tags for stencils)
 *
 * Every entry keeps draw.io's title, search tags, template size and cells
 * (style strings verbatim, values, geometry, children, edge labels, edge
 * terminals). Entries made from compressed XML (addDataEntry) are inflated
 * and read with DeckWerk's own .drawio reader.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
import { readGraphModel } from '../src/shared/diagram/drawioFile.js';
import type { DiagramCell } from '../src/shared/diagram/model.js';
import { resolveStyle } from '../src/shared/diagram/style.js';
import { parseXml } from '../src/shared/diagram/xml.js';
import type { LibraryCell, LibraryData, LibraryItem, LibraryPalette } from '../src/shared/diagram/library/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const args = process.argv.slice(2).filter((a) => a !== '--');
let webapp = process.env.DRAWIO_WEBAPP || 'C:/Users/kallo/tools/drawio/src/main/webapp';
for (let i = 0; i < args.length; i++) if (args[i] === '--drawio') webapp = resolve(args[++i]);
const read = (rel: string): string => {
  const path = join(webapp, rel);
  if (!existsSync(path)) throw new Error(`${path} is missing: --drawio (or DRAWIO_WEBAPP) must name draw.io's src/main/webapp folder.`);
  return readFileSync(path, 'utf8');
};

// --- draw.io's resources and constants ---------------------------------------

const resources = new Map<string, string>();
for (const line of read('resources/dia.txt').split(/\r?\n/)) {
  const at = line.indexOf('=');
  if (at > 0 && !line.startsWith('#')) resources.set(line.slice(0, at), line.slice(at + 1));
}

const mxConstants: Record<string, unknown> = {};
for (const match of read('mxgraph/src/util/mxConstants.js').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*('([^']*)'|"([^"]*)"|-?\d+(?:\.\d+)?|true|false|null)\s*,?\s*$/gm)) {
  const raw = match[2];
  mxConstants[match[1]] = match[3] ?? match[4] ?? (raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : Number(raw));
}

/** Graph.decompress: base64 → inflateRaw → decodeURIComponent. */
function decompress(data: string): string {
  const text = inflateRawSync(Buffer.from(data, 'base64')).toString('latin1');
  // draw.io deflates the URI-encoded text, so the bytes are ASCII.
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Sidebar.prototype.tagIndex from diagramly, as Sidebar.addTagIndex reads it. */
function shapeTags(): Record<string, string> {
  const source = read('js/diagramly/sidebar/Sidebar.js');
  const match = /Sidebar\.prototype\.tagIndex\s*=\s*'([^']+)'/.exec(source);
  if (!match) throw new Error('No tagIndex in diagramly/sidebar/Sidebar.js');
  const tags: Record<string, string> = {};
  for (const line of decompress(match[1]).split('\n')) {
    const parts = line.split('\t');
    if (parts.length > 1) {
      const key = parts[0].toLowerCase().replace(/ /g, '_');
      const value = parts.slice(1).join(' ').toLowerCase().trim();
      if (value.length > 0) tags[key] = value;
    }
  }
  return tags;
}

/** The gear clip art draw.io's image entries point at, as a draw.io-style data URI (no `;base64`). */
function gearImage(): string {
  const png = readFileSync(join(webapp, 'img/clipart/Gear_128x128.png'));
  return `data:image/png,${png.toString('base64')}`;
}

/** `Sidebar.prototype.<name> = function …` assignments of a source file, by name (last wins). */
function prototypeFunctions(source: string, file: string): Map<string, string> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const found = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && ts.isPropertyAccessExpression(node.left.expression)
      && node.left.expression.expression.getText(sf) === 'Sidebar'
      && node.left.expression.name.text === 'prototype'
      && (ts.isFunctionExpression(node.right))) {
      found.set(node.left.name.text, node.right.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- the sandbox ----------------------------------------------------------------

const SANDBOX = String.raw`
function mxPoint(x, y) { this.x = (x != null) ? x : 0; this.y = (y != null) ? y : 0; }
mxPoint.prototype.clone = function() { return new mxPoint(this.x, this.y); };

function mxRectangle(x, y, width, height) {
  mxPoint.call(this, x, y);
  this.width = (width != null) ? width : 0;
  this.height = (height != null) ? height : 0;
}

function mxGeometry(x, y, width, height) {
  mxRectangle.call(this, x, y, width, height);
  this.relative = false;
  this.points = null;
  this.sourcePoint = null;
  this.targetPoint = null;
  this.offset = null;
}
mxGeometry.prototype.setTerminalPoint = function(point, isSource) {
  if (isSource) this.sourcePoint = point; else this.targetPoint = point;
  return point;
};
mxGeometry.prototype.getTerminalPoint = function(isSource) { return isSource ? this.sourcePoint : this.targetPoint; };
mxGeometry.prototype.clone = function() {
  var g = new mxGeometry(this.x, this.y, this.width, this.height);
  g.relative = this.relative;
  g.points = this.points ? this.points.map(function(p) { return p.clone(); }) : null;
  g.sourcePoint = this.sourcePoint ? this.sourcePoint.clone() : null;
  g.targetPoint = this.targetPoint ? this.targetPoint.clone() : null;
  g.offset = this.offset ? this.offset.clone() : null;
  return g;
};

function cloneValue(value) {
  return (value != null && typeof value === 'object')
    ? { tag: value.tag, attrs: Object.assign({}, value.attrs) } : value;
}

function mxCell(value, geometry, style) {
  this.value = value;
  this.geometry = geometry;
  this.style = style;
  this.vertex = false;
  this.edge = false;
  this.connectable = true;
  this.visible = true;
  this.collapsed = false;
  this.parent = null;
  this.source = null;
  this.target = null;
  this.children = [];
}
mxCell.prototype.insert = function(child, index) {
  child.parent = this;
  if (index == null) this.children.push(child); else this.children.splice(index, 0, child);
  return child;
};
mxCell.prototype.insertEdge = function(edge, isOutgoing) {
  if (isOutgoing) edge.source = this; else edge.target = this;
  return edge;
};
mxCell.prototype.setConnectable = function(c) { this.connectable = c; };
mxCell.prototype.setVertex = function(v) { this.vertex = v; };
mxCell.prototype.setEdge = function(e) { this.edge = e; };
mxCell.prototype.setStyle = function(s) { this.style = s; };
mxCell.prototype.getChildAt = function(i) { return this.children[i]; };
mxCell.prototype.getChildCount = function() { return this.children.length; };
mxCell.prototype.getTerminal = function(isSource) { return isSource ? this.source : this.target; };
// mxCell.clone: everything but id, value (cloned apart), parent, terminals, children and edges.
mxCell.prototype.clone = function() {
  var c = new mxCell(cloneValue(this.value), this.geometry ? this.geometry.clone() : null, this.style);
  c.vertex = this.vertex;
  c.edge = this.edge;
  c.connectable = this.connectable;
  c.visible = this.visible;
  c.collapsed = this.collapsed;
  return c;
};

var mxUtils = {
  bind: function(scope, fn) { return function() { return fn.apply(scope, arguments); }; },
  trim: function(s) { return (s == null) ? s : String(s).trim(); },
  indexOf: function(arr, obj) { return (arr != null) ? arr.indexOf(obj) : -1; },
  // mxUtils.setStyle
  setStyle: function(style, key, value) {
    var isValue = value != null && (typeof(value.length) == 'undefined' || value.length > 0);
    if (style != null && typeof style !== 'string') style = '' + style;
    if (style == null || style.length == 0) {
      if (isValue) style = key + '=' + value + ';';
    } else {
      if (style.substring(0, key.length + 1) == key + '=') {
        var next = style.indexOf(';');
        if (isValue) {
          style = key + '=' + value + ((next < 0) ? ';' : style.substring(next));
        } else {
          while (next >= 0 && style.charAt(next + 1) == ';') next++;
          style = (next < 0 || next == style.length - 1) ? '' : style.substring(next + 1);
        }
      } else {
        var index = style.indexOf(';' + key + '=');
        if (index < 0) {
          if (isValue) {
            var sep = (style.charAt(style.length - 1) == ';') ? '' : ';';
            style = style + sep + key + '=' + value + ';';
          }
        } else {
          var next2 = style.indexOf(';', index + 1);
          if (isValue) style = style.substring(0, index + 1) + key + '=' + value + ((next2 < 0) ? ';' : style.substring(next2));
          else style = style.substring(0, index) + ((next2 < 0) ? ';' : style.substring(next2));
        }
      }
    }
    return style;
  }
};

var mxResources = { get: function(key) { return __resources(key); } };

function Graph() {}
Graph.inheritLabelStyleKey = 'inheritText';
Graph.createInheritedLabelStyle = function() { return Graph.inheritLabelStyleKey + '=1;'; };
Graph.decompress = function(data) { return __decompress(data); };

var Editor = {
  // diagramly/Editor.js
  defaultTextStyle: 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;'
};

var graph = {
  vertexFontSize: null,
  // Graph.appendFontSize
  appendFontSize: function(style, fontSize) {
    style = (style != null) ? style : '';
    if (fontSize != null) {
      if (style.length > 0 && style.charAt(style.length - 1) != ';') style += ';';
      style += 'fontSize=' + fontSize + ';';
    }
    return style;
  },
  // Graph.setAttributeForCell, with the value as {tag, attrs} (a UserObject)
  setAttributeForCell: function(cell, name, value) {
    var obj = (cell.value != null && typeof cell.value === 'object')
      ? cloneValue(cell.value) : { tag: 'UserObject', attrs: { label: cell.value || '' } };
    if (value != null) obj.attrs[name] = value; else delete obj.attrs[name];
    cell.value = obj;
  },
  setLinkForCell: function(cell, link) { this.setAttributeForCell(cell, 'link', link); },
  // Graph.addLabelPerimeters: edges end at the labels of shapes labelled on one side
  addLabelPerimeters: function(cells) {
    for (var i = 0; cells != null && i < cells.length; i++) {
      var cell = cells[i];
      if (cell != null && cell.vertex) {
        if (__labelOutsideOnSide(cell.style)) cell.style = mxUtils.setStyle(cell.style, 'labelPerimeter', '1');
        this.addLabelPerimeters(cell.children);
      }
    }
  },
  cloneCells: function(cells) { return cells.map(__deepClone); }
};

function __deepClone(cell) {
  var map = new Map();
  var copy = function(c) {
    var d = c.clone();
    map.set(c, d);
    for (var i = 0; i < c.children.length; i++) d.insert(copy(c.children[i]));
    return d;
  };
  var result = copy(cell);
  map.forEach(function(d, c) {
    if (c.source) d.source = map.get(c.source) || c.source;
    if (c.target) d.target = map.get(c.target) || c.target;
  });
  return result;
}

function Sidebar() {
  this.editorUi = { editor: { graph: graph } };
  this.graph = graph;
  this.initialDefaultVertexStyle = {};
  this.initialDefaultEdgeStyle = {};
  this.gearImage = __gearImage;
  this.shapetags = __shapetags;
  this.palettes = [];
}
Sidebar.prototype.setCurrentSearchEntryLibrary = function(id, lib) { this.currentSearchEntryLibrary = (id != null) ? { id: id, lib: lib } : null; };
Sidebar.prototype.setPickerShapes = function() {};
// Sidebar.addEntry: the tags go with the entry; the search index is built in DeckWerk
Sidebar.prototype.addEntry = function(tags, fn) {
  return function() {
    var item = fn.apply(this, arguments);
    if (item != null && item.__item) item.__tags = tags;
    return item;
  };
};
// Sidebar.createItem: records what the entry inserts instead of drawing it
Sidebar.prototype.createItem = function(cells, title, showLabel, showTitle, width, height) {
  return { __item: true, cells: cells, title: title, showLabel: showLabel, showTitle: showTitle, width: width, height: height };
};
Sidebar.prototype.addPalette = function(id, title, expanded, onInit) {
  var palette = { id: id, title: title, expanded: !!expanded, entries: [] };
  this.palettes.push(palette);
  onInit({ appendChild: function(entry) { if (entry != null) palette.entries.push(entry); } });
  return palette;
};
Sidebar.prototype.addPaletteFunctions = function(id, title, expanded, fns) {
  var palette = { id: id, title: title, expanded: !!expanded, entries: [] };
  this.palettes.push(palette);
  for (var i = 0; i < fns.length; i++) {
    var entry = fns[i]();
    if (entry != null) palette.entries.push(entry);
  }
  return palette;
};
// diagramly's getTagsForStencil override: adds tags from the tag index
Sidebar.prototype.getTagsForStencil = function(pkg, stc, moreTags) {
  var tags = pkg.split('.');
  for (var i = 1; i < tags.length; i++) tags[i] = tags[i].replace(/_/g, ' ');
  tags.push(stc.replace(/_/g, ' '));
  if (moreTags != null) tags.push(moreTags);
  tags = tags.slice(1, tags.length);
  if (this.shapetags != null) {
    pkg = pkg.toLowerCase();
    stc = stc.toLowerCase();
    if (this.shapetags[pkg] != null) tags.push(this.shapetags[pkg]);
    stc = pkg + '.' + stc;
    if (this.shapetags[stc] != null) tags.push(this.shapetags[stc]);
  }
  return tags;
};
// Sidebar.createVertexTemplateFromData, with the model read by DeckWerk's reader
Sidebar.prototype.createVertexTemplateFromData = function(data, width, height, title, showLabel, showTitle) {
  var cells = __modelCells(Graph.decompress(data));
  return this.createVertexTemplateFromCells(cells, width, height, title, showLabel, showTitle);
};
`;

/** The cells of a layer of an mxGraphModel XML string as sandbox mxCells (children of the first layer). */
function modelCellsFactory(context: vm.Context) {
  return (xml: string) => {
    const root = parseXml(xml);
    const modelEl = root.name === 'mxGraphModel' ? root : null;
    if (!modelEl) throw new Error('Template data is not an mxGraphModel');
    const { cells } = readGraphModel(modelEl);
    const rootCell = cells.find((c) => c.parent == null);
    const layer = cells.find((c) => c.parent === rootCell?.id);
    const make = new vm.Script(`(function(c) {
      var cell = new mxCell(c.value, c.geometry, c.style);
      cell.vertex = c.kind === 'vertex';
      cell.edge = c.kind === 'edge';
      cell.connectable = c.connectable;
      cell.visible = c.visible;
      cell.collapsed = c.collapsed;
      return cell;
    })`).runInContext(context) as (c: unknown) => any;
    const geometry = new vm.Script(`(function(g) {
      if (g == null) return null;
      var geo = new mxGeometry(g.x, g.y, g.width, g.height);
      geo.relative = g.relative;
      var pt = function(p) { return p ? new mxPoint(p.x, p.y) : null; };
      geo.points = g.points ? g.points.map(pt) : null;
      geo.sourcePoint = pt(g.sourcePoint);
      geo.targetPoint = pt(g.targetPoint);
      geo.offset = pt(g.offset);
      return geo;
    })`).runInContext(context) as (g: unknown) => any;
    const byId = new Map<string, any>();
    for (const c of cells) {
      if (c.kind !== 'vertex' && c.kind !== 'edge') continue;
      byId.set(c.id, make({
        kind: c.kind,
        value: c.object ? { tag: c.object.tag, attrs: { ...c.object.attrs } } : c.value,
        style: c.style,
        geometry: geometry(c.geometry),
        connectable: c.connectable,
        visible: c.visible,
        collapsed: c.collapsed,
      }));
    }
    const top: any[] = [];
    for (const c of cells) {
      const cell = byId.get(c.id);
      if (!cell) continue;
      const parent = c.parent != null ? byId.get(c.parent) : undefined;
      if (parent) parent.insert(cell);
      else if (c.parent === layer?.id) top.push(cell);
      if (c.source && byId.has(c.source)) cell.source = byId.get(c.source);
      if (c.target && byId.has(c.target)) cell.target = byId.get(c.target);
    }
    return top;
  };
}

/** Graph.isLabelOutsideOnSide on the cell's resolved style. */
function labelOutsideOnSide(style: string): boolean {
  const s = resolveStyle(style, 'vertex');
  const lp = s.labelPosition ?? 'center';
  const vlp = s.verticalLabelPosition ?? 'middle';
  return (lp === 'center' && (vlp === 'top' || vlp === 'bottom')) || (vlp === 'middle' && (lp === 'left' || lp === 'right'));
}

const context = vm.createContext({
  console,
  mxConstants,
  __resources: (key: string) => resources.get(key) ?? key,
  __decompress: decompress,
  __gearImage: gearImage(),
  __shapetags: shapeTags(),
  __labelOutsideOnSide: labelOutsideOnSide,
});
vm.runInContext(SANDBOX, context, { filename: 'sidebar-sandbox.js' });
context.__modelCells = modelCellsFactory(context);

// draw.io's own palette and template functions, in the order draw.io loads them.
const grapheditor = prototypeFunctions(read('js/grapheditor/Sidebar.js'), 'Sidebar.js');
const FROM_GRAPHEDITOR = [
  'createVertexTemplateEntry', 'createVertexTemplate', 'createVertexTemplateFromCells',
  'createEdgeTemplateEntry', 'createEdgeTemplate', 'createEdgeTemplateFromCells',
  'addDataEntry', 'cloneCell',
  'addGeneralPalette', 'addMiscPalette', 'addAdvancedPalette', 'createAdvancedShapes', 'addUmlPalette',
];
for (const name of FROM_GRAPHEDITOR) {
  const fn = grapheditor.get(name);
  if (!fn) throw new Error(`Sidebar.prototype.${name} not found in js/grapheditor/Sidebar.js`);
  vm.runInContext(`Sidebar.prototype.${name} = ${fn};`, context, { filename: `Sidebar.${name}` });
}
for (const file of ['Sidebar-Basic.js', 'Sidebar-Arrows2.js', 'Sidebar-Flowchart.js', 'Sidebar-ER.js']) {
  vm.runInContext(read(`js/diagramly/sidebar/${file}`), context, { filename: file });
}

// Sidebar.initPalettes (diagramly): the default palettes in draw.io's order.
vm.runInContext(`
  var sb = new Sidebar();
  sb.addGeneralPalette(true);
  sb.addMiscPalette(false);
  sb.addAdvancedPalette(false);
  sb.addBasicPalette();
  sb.addArrows2Palette();
  sb.addFlowchartPalette();
  sb.addErPalette();
  sb.addUmlPalette(false);
  var __palettes = sb.palettes;
`, context, { filename: 'initPalettes' });

// --- recorded cells → LibraryCell lists -------------------------------------------

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function serializeItem(entry: any): Omit<LibraryItem, 'id'> {
  const cells: LibraryCell[] = [];
  const ids = new Map<any, string>();
  let next = 2;
  const assign = (cell: any) => {
    ids.set(cell, String(next++));
    for (const child of cell.children) assign(child);
  };
  for (const cell of entry.cells) assign(cell);
  const point = (p: any) => (p ? { x: round(p.x), y: round(p.y) } : undefined);
  const emit = (cell: any, parent: string | null) => {
    const g = cell.geometry;
    const out: LibraryCell = {
      id: ids.get(cell)!,
      ...(parent != null ? { parent } : {}),
      ...(cell.edge ? { edge: true } : {}),
      style: cell.style ?? '',
      ...(typeof cell.value === 'string' && cell.value !== '' ? { value: cell.value } : {}),
      ...(cell.value != null && typeof cell.value === 'object' ? { object: { tag: cell.value.tag, attrs: { ...cell.value.attrs } } } : {}),
      ...(cell.source && ids.has(cell.source) ? { source: ids.get(cell.source) } : {}),
      ...(cell.target && ids.has(cell.target) ? { target: ids.get(cell.target) } : {}),
      ...(cell.connectable === false ? { connectable: false } : {}),
      ...(cell.visible === false ? { visible: false } : {}),
      ...(cell.collapsed ? { collapsed: true } : {}),
      geometry: {
        x: round(g?.x ?? 0), y: round(g?.y ?? 0), width: round(g?.width ?? 0), height: round(g?.height ?? 0),
        ...(g?.relative ? { relative: true } : {}),
        ...(g?.points && g.points.length > 0 ? { points: g.points.map(point) } : {}),
        ...(g?.sourcePoint ? { sourcePoint: point(g.sourcePoint) } : {}),
        ...(g?.targetPoint ? { targetPoint: point(g.targetPoint) } : {}),
        ...(g?.offset ? { offset: point(g.offset) } : {}),
      },
    };
    cells.push(out);
    for (const child of cell.children) emit(child, ids.get(cell)!);
  };
  for (const cell of entry.cells) emit(cell, null);
  return {
    title: entry.title ?? '',
    tags: typeof entry.__tags === 'string' ? entry.__tags : '',
    width: entry.width,
    height: entry.height,
    ...(entry.showLabel === false ? { showLabel: false } : {}),
    cells,
  };
}

const palettes: LibraryPalette[] = (context.__palettes as any[]).map((p) => ({
  id: p.id,
  title: p.title,
  expanded: p.expanded,
  items: p.entries.map((entry: any, index: number) => ({ id: `${p.id}.${index}`, ...serializeItem(entry) })),
}));

const data: LibraryData = { source: 'jgraph/drawio 32.7.4', palettes };

// One JSON string the module parses at load: cheap for tsc, one item per line for diffs.
const lines: string[] = [];
lines.push('{"source":' + JSON.stringify(data.source) + ',"palettes":[');
palettes.forEach((p, pi) => {
  lines.push(`{"id":${JSON.stringify(p.id)},"title":${JSON.stringify(p.title)},"expanded":${p.expanded},"items":[`);
  p.items.forEach((item, ii) => lines.push(JSON.stringify(item) + (ii < p.items.length - 1 ? ',' : '')));
  lines.push(']}' + (pi < palettes.length - 1 ? ',' : ''));
});
lines.push(']}');
// String.raw keeps backslashes for JSON.parse; backticks and `${` are written as JSON escapes.
const json = lines.join('\n').replace(/`/g, '\\u0060').replace(/\$\{/g, '$\\u007b');

const out = `/*
 * Generated by scripts/drawio-sidebar-extract.mts from draw.io (jgraph/drawio
 * 32.7.4), Copyright (c) 2006-2024, JGraph Ltd and Copyright (c) 2006-2024,
 * draw.io AG, Apache License 2.0: the default palettes of
 * js/grapheditor/Sidebar.js and js/diagramly/sidebar/Sidebar-{Basic,Arrows2,
 * Flowchart,ER}.js, recorded by running draw.io's own palette functions.
 * Do not edit; run the script again.
 */

import type { LibraryData } from './types.js';

export const LIBRARY_DATA: LibraryData = JSON.parse(String.raw\`
${json}
\`);
`;
const target = join(repo, 'src/shared/diagram/library/palettes.generated.ts');
if (args.includes('--check')) {
  // Fails when the checked-in data no longer matches what draw.io's code produces.
  const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== out) {
    console.error(`${target} is out of date: run scripts/drawio-sidebar-extract.mts`);
    process.exit(1);
  }
  console.log(`${target} is up to date`);
  process.exit(0);
}
writeFileSync(target, out, 'utf8');
const count = palettes.reduce((n, p) => n + p.items.length, 0);
console.log(`Wrote ${count} entries in ${palettes.length} palettes to ${target}`);
for (const p of palettes) console.log(`  ${p.title}: ${p.items.length}`);
