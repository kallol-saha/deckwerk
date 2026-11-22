/**
 * Differential test of the shape port against draw.io's own code: loads
 * mxClient.js, Shapes.js, the ER and SysML markers and the shape-painting
 * parts of Graph.js from a draw.io clone into jsdom, paints the same styles
 * with both, and compares the painted SVG elements attribute by attribute.
 *
 * Runs only when the clone is present: DRAWIO_WEBAPP, or a sibling checkout
 * at ../drawio/src/main/webapp (jgraph/drawio 32.7.4).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { MARKER_NAMES, SHAPE_NAMES, edgeSvg, isKnownShape, shapeConstraints, vertexSvg } from '../src/shared/diagram/paint.js';
import { isNumeric, normalizeImageSource } from '../src/shared/diagram/shapes/util.js';
import { textWidth } from '../src/shared/diagram/label/metrics.js';
import { EDGE_SHAPES } from '../src/shared/diagram/shapes/index.js';
import { shippedStencilNames } from '../src/shared/diagram/stencil.js';
import { resolveStyle } from '../src/shared/diagram/style.js';
import type { Point, Rect } from '../src/shared/diagram/types.js';

const WEBAPP = process.env.DRAWIO_WEBAPP ?? resolve(__dirname, '../../drawio/src/main/webapp');
const HAVE_DRAWIO = existsSync(resolve(WEBAPP, 'mxgraph/mxClient.js')) && existsSync(resolve(WEBAPP, 'js/grapheditor/Shapes.js'));

function read(file: string): string {
  return readFileSync(resolve(WEBAPP, file), 'utf8');
}

/**
 * The source from the line containing `start` to the end of the function
 * whose first line contains `endFunction` (its closing `};` or `});` at the
 * same indentation).
 */
function extract(text: string, start: string, endFunction: string): string {
  const lines = text.split('\n');
  const from = lines.findIndex((line) => line.includes(start));
  const fn = lines.findIndex((line, i) => i >= from && line.includes(endFunction));
  if (from < 0 || fn < 0) throw new Error(`not found: ${start} / ${endFunction}`);
  const indent = /^\s*/.exec(lines[fn])?.[0] ?? '';
  const to = lines.findIndex((line, i) => i > fn && (line === `${indent}};` || line === `${indent}});`
    || line === `${indent}};\r` || line === `${indent}});\r`));
  return lines.slice(from, to + 1).join('\n');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type DrawioWindow = any;

function loadDrawio(): DrawioWindow {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const w = dom.window as DrawioWindow;
  w.eval('var mxLoadResources = false; var mxLoadStylesheets = false; var mxBasePath = "mxgraph";');
  w.eval(read('mxgraph/mxClient.js'));
  // What Shapes.js needs of Graph and Editor, and Graph.js's shadow constants
  w.eval('var urlParams = {}; function Graph() {} Graph.prototype.createEdgeHandler = function() {};'
    + 'Graph.prototype.isOrthogonal = function() {}; var Editor = { sketchDefaultJiggle: 1 };'
    + 'mxShape.prototype.getConstraints = function() { return null; };'
    // Graph sets cellRenderer.minSvgStrokeWidth = 0.1, which every shape takes
    + 'mxShape.prototype.minSvgStrokeWidth = 0.1;'
    + 'mxConstants.SHADOW_OPACITY = 0.25; mxConstants.SHADOWCOLOR = "#000000";');
  const graph = read('js/grapheditor/Graph.js');
  w.eval(extract(graph, 'Graph.defaultMultipleCount = ', 'Graph.getMultipleCopies = function'));
  w.eval(extract(graph, 'Graph.curvePointSteps = ', 'Graph.getCurveSegments = function'));
  w.eval(`(function() {${extract(graph, 'mxShape.prototype.getMultipleCopies = function', 'mxShape.prototype.paintShape = function')}})();`);
  w.eval(`(function() {${extract(graph, 'var mxConnectorPaintCurvedLine = ', 'mxConnector.prototype.paintCutCurve = function')}})();`);
  // The stencil registry of Graph.js (dynamic loading, the default-colour
  // override) with the stencil sets of js/stencils.min.js, which decodes
  // them with pako as draw.io does. jsdom has no canvas, so mxUtils.isValidColor
  // asks CSS.supports, given here for the colour forms stencils use.
  w.TextDecoder = TextDecoder;
  w.CSS = { supports: (_property: string, value: string) => cssColor(value) };
  w.eval('var STENCIL_PATH = "stencils"; var SHAPES_PATH = "shapes";');
  w.eval(`(function() {${extract(graph, 'var stencilParseColor = mxStencil.prototype.parseColor;', 'mxStencil.prototype.parseColor = function')}})();`);
  w.eval(extract(graph, 'mxStencilRegistry.libraries = {};', 'mxStencilRegistry.parseStencilSet = function'));
  w.eval('mxStencilRegistry.allowEval = false;');
  w.eval(read('js/diagramly/Editor.js').split('\n').filter((line) => /^\s*mxStencilRegistry\.libraries\[/.test(line)).join('\n'));
  w.eval(read('js/deflate/pako.min.js'));
  w.eval(read('js/stencils.min.js'));
  // What the shape libraries need of Graph (their handles are not used)
  w.eval('Graph.handleFactory = {}; Graph.createHandle = function() {};');
  // jsdom lays out no text, so mxUtils.getSizeForString measures 0; it measures with
  // the font widths the port uses (label/metrics.ts), as a browser would
  w.mxUtils.getSizeForString = (text: unknown, fontSize?: number) =>
    new w.mxRectangle(0, 0, Math.round(textWidth(String(text), Math.round(fontSize ?? 11), false)), 0);
  w.eval(read('js/grapheditor/Shapes.js'));
  w.eval(read('shapes/er/mxER.js'));
  w.eval(read('shapes/mxSysML.js'));
  for (const file of LIBRARY_FILES) w.eval(read(file));
  return w;
}

/** draw.io's shape libraries whose shapes are ported (loaded after Shapes.js, as getStencil loads them). */
const LIBRARY_FILES = ['shapes/mxBasic.js', 'shapes/mxArrows.js', 'shapes/mxFlowchart.js', 'shapes/mxInfographic.js',
  'shapes/mxUML25.js', 'shapes/mxElectrical.js', 'shapes/mxNetworks.js', 'shapes/mxLeanMap.js'];

const NAMED_COLORS = new Set(['black', 'white', 'red', 'green', 'blue', 'yellow', 'gray', 'grey', 'orange', 'purple',
  'transparent', 'none']);

/** A `<pattern>` and its tile as a comparable string (ids left out). */
function describePattern(pattern: Element): string {
  const num = (v: string | null) => (v != null && /^-?[\d.]+$/.test(v) ? String(parseFloat(parseFloat(v).toFixed(2))) : v);
  const parts = ['pattern', ...['width', 'height', 'x', 'y', 'patternUnits'].map((k) => `${k}=${num(pattern.getAttribute(k))}`),
    `patternTransform=${(pattern.getAttribute('patternTransform') ?? '').replace(/\s+/g, '')}`];
  for (const child of Array.from(pattern.children)) {
    parts.push(child.tagName.toLowerCase());
    for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'width', 'height', 'd', 'stroke', 'stroke-width', 'fill']) {
      const value = child.getAttribute(k);
      if (value != null) parts.push(`${k}=${k === 'd' ? value : num(value)}`);
    }
  }
  return parts.join(' ');
}

/** CSS.supports('color', value) for hex, functional and common named colours. */
function cssColor(value: string): boolean {
  const v = value.toLowerCase();
  if (v === 'none') return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) || /^(rgb|hsl)a?\([\w.,%/+-]*\)$/.test(v)
    || NAMED_COLORS.has(v);
}

const KEYS = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'fill-opacity', 'stroke-opacity', 'transform', 'opacity',
  'preserveAspectRatio', 'clip-path', 'href'];

/** The painted elements as comparable strings (invisible and hit-detection elements dropped). */
function normalize(root: Element): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'g') {
        // Groups that hold nothing visible are not painted
        const inner = normalize(child);
        const opacity = child.getAttribute('opacity');
        if (opacity && inner.length > 0) out.push(`g opacity=${opacity}`);
        out.push(...inner);
        continue;
      }
      if (!['path', 'rect', 'ellipse', 'image'].includes(tag)) continue;
      if (child.getAttribute('visibility') === 'hidden') continue;
      const fill = child.getAttribute('fill');
      const stroke = child.getAttribute('stroke');
      if (tag !== 'image' && (fill == null || fill === 'none') && (stroke == null || stroke === 'none')) continue;
      const parts = [tag];
      for (const key of KEYS) {
        let value = key === 'href' ? (child.getAttribute('href') ?? child.getAttribute('xlink:href')) : child.getAttribute(key);
        if (value == null) continue;
        if (key === 'stroke-miterlimit' && value === '10') continue;
        if ((key === 'fill' || key === 'clip-path') && value.startsWith('url(')) value = 'url';
        if (key === 'transform') value = value.replace(/\s+/g, '');
        if (/^-?\d/.test(value) && !['d', 'transform', 'stroke-dasharray'].includes(key)) {
          value = String(parseFloat(parseFloat(value).toFixed(2)));
        }
        parts.push(`${key}=${value}`);
      }
      out.push(parts.join(' '));
    }
  };
  walk(root);
  return out;
}

interface CustomProperty {
  name: string;
  type?: string;
  min?: number;
  max?: number;
  defVal?: unknown;
  enumList?: Array<{ val: string }>;
}

/** One style suffix per value worth trying for each of a shape's customProperties (one property at a time). */
function propertyVariants(props: CustomProperty[]): string[] {
  const out: string[] = [];
  for (const p of props) {
    if (p == null || typeof p.name !== 'string') continue;
    if (p.type === 'float' || p.type === 'int') {
      const values = new Set<number>([0, 0.3, 25, 1000, -10]);
      for (const v of [p.defVal, p.min, p.max]) if (typeof v === 'number' && Number.isFinite(v)) values.add(v);
      if (typeof p.min === 'number' && typeof p.max === 'number') values.add((p.min + p.max) / 2);
      for (const v of values) out.push(`${p.name}=${v};`);
    } else if (p.type === 'bool') {
      out.push(`${p.name}=0;`, `${p.name}=1;`);
    } else if (p.type === 'enum' && Array.isArray(p.enumList)) {
      for (const e of p.enumList) out.push(`${p.name}=${e.val};`);
    } else if (p.type === 'color') {
      out.push(`${p.name}=#ff0000;`, `${p.name}=none;`);
    }
  }
  return out;
}

/** Every shape name the General, Misc, Advanced, Basic, Arrows, Flowchart, ER, UML and UML 2.5 palettes use. */
const PALETTE_SHAPES = [
  'actor', 'associativeEntity', 'callout', 'card', 'cloud', 'collate', 'component', 'corner', 'cross', 'crossbar',
  'cube', 'curlyBracket', 'curvedText', 'cylinder3', 'dataStorage', 'datastore', 'delay', 'display', 'document',
  'doubleArrow', 'doubleEllipse', 'ellipse', 'endState', 'ext', 'filledEdge', 'flexArrow', 'folder', 'gitTag',
  'hexagon', 'image', 'internalStorage', 'isoCube2', 'isoRectangle', 'line', 'lineEllipse', 'link', 'loopLimit',
  'manualInput', 'mermaidPerson', 'mermaidSankeyLink', 'mermaidUsecaseActor', 'message', 'mindmapBang', 'module',
  'mxgraph.arrows2.arrow', 'mxgraph.arrows2.bendArrow', 'mxgraph.arrows2.bendDoubleArrow',
  'mxgraph.arrows2.calloutArrow', 'mxgraph.arrows2.calloutDouble90Arrow', 'mxgraph.arrows2.calloutDoubleArrow',
  'mxgraph.arrows2.calloutQuadArrow', 'mxgraph.arrows2.jumpInArrow', 'mxgraph.arrows2.quadArrow',
  'mxgraph.arrows2.sharpArrow', 'mxgraph.arrows2.sharpArrow2', 'mxgraph.arrows2.stripedArrow',
  'mxgraph.arrows2.stylisedArrow', 'mxgraph.arrows2.tailedArrow', 'mxgraph.arrows2.tailedNotchedArrow',
  'mxgraph.arrows2.triadArrow', 'mxgraph.arrows2.twoWayArrow', 'mxgraph.arrows2.uTurnArrow',
  'mxgraph.arrows2.wedgeArrow', 'mxgraph.arrows2.wedgeArrowDashed2', 'mxgraph.basic.4_point_star_2',
  'mxgraph.basic.6_point_star', 'mxgraph.basic.8_point_star', 'mxgraph.basic.acute_triangle', 'mxgraph.basic.arc',
  'mxgraph.basic.banner', 'mxgraph.basic.button', 'mxgraph.basic.cloud_callout', 'mxgraph.basic.cloud_rect',
  'mxgraph.basic.cone', 'mxgraph.basic.cone2', 'mxgraph.basic.corner_round_rect', 'mxgraph.basic.diag_round_rect',
  'mxgraph.basic.diag_snip_rect', 'mxgraph.basic.diag_stripe', 'mxgraph.basic.document', 'mxgraph.basic.donut',
  'mxgraph.basic.drop', 'mxgraph.basic.flash', 'mxgraph.basic.frame', 'mxgraph.basic.frame_corner',
  'mxgraph.basic.half_circle', 'mxgraph.basic.heart', 'mxgraph.basic.isocube', 'mxgraph.basic.layered_rect',
  'mxgraph.basic.loud_callout', 'mxgraph.basic.moon', 'mxgraph.basic.no_symbol', 'mxgraph.basic.obtuse_triangle',
  'mxgraph.basic.octagon2', 'mxgraph.basic.orthogonal_triangle', 'mxgraph.basic.oval_callout',
  'mxgraph.basic.partConcEllipse', 'mxgraph.basic.patternFillRect', 'mxgraph.basic.pentagon', 'mxgraph.basic.pie',
  'mxgraph.basic.plaque', 'mxgraph.basic.plaque_frame', 'mxgraph.basic.pointed_oval', 'mxgraph.basic.polygon',
  'mxgraph.basic.pyramid', 'mxgraph.basic.rect', 'mxgraph.basic.rectCallout', 'mxgraph.basic.roundRectCallout',
  'mxgraph.basic.rounded_frame', 'mxgraph.basic.shaded_button', 'mxgraph.basic.smiley', 'mxgraph.basic.star',
  'mxgraph.basic.sun', 'mxgraph.basic.three_corner_round_rect', 'mxgraph.basic.tick', 'mxgraph.basic.wave2',
  'mxgraph.basic.x', 'mxgraph.er.anchor', 'mxgraph.flowchart.annotation_1', 'mxgraph.flowchart.annotation_2',
  'mxgraph.flowchart.collate', 'mxgraph.flowchart.database', 'mxgraph.flowchart.decision', 'mxgraph.flowchart.delay',
  'mxgraph.flowchart.direct_data', 'mxgraph.flowchart.display', 'mxgraph.flowchart.document2',
  'mxgraph.flowchart.extract_or_measurement', 'mxgraph.flowchart.loop_limit', 'mxgraph.flowchart.merge_or_storage',
  'mxgraph.flowchart.multi-document', 'mxgraph.flowchart.on-page_reference', 'mxgraph.flowchart.or_2',
  'mxgraph.flowchart.parallel_mode', 'mxgraph.flowchart.sequential_data', 'mxgraph.flowchart.sort',
  'mxgraph.flowchart.start_1', 'mxgraph.flowchart.start_2', 'mxgraph.flowchart.stored_data',
  'mxgraph.flowchart.summing_junction', 'mxgraph.flowchart.terminator', 'mxgraph.infographic.ribbonSimple',
  'mxgraph.lean_mapping.electronic_info_flow_edge', 'mxgraph.uml25.action', 'mxgraph.uml25.actionParams',
  'mxgraph.uml25.behaviorAction', 'mxgraph.uml25.inputPin', 'note', 'note2', 'offPageConnector', 'or', 'orEllipse',
  'parallelogram', 'partialRectangle', 'process', 'process2', 'providedRequiredInterface', 'requiredInterface',
  'rhombus', 'singleArrow', 'smileyFace', 'sortShape', 'startState', 'step', 'sumEllipse', 'switch', 'tape',
  'tapeData', 'taperedArrow', 'tee', 'trapezoid', 'triangle', 'umlActor', 'umlBoundary', 'umlControl', 'umlDestroy',
  'umlEntity', 'umlFrame', 'umlLifeline', 'umlState', 'waypoint', 'wedgeCallout', 'xor', 'zigzag',
];

describe('palette shapes', () => {
  it('has a painter for every shape of the main palettes', () => {
    const missing = PALETTE_SHAPES.filter((name) => !isKnownShape(name));
    expect(missing).toEqual([]);
  });
});

describe.skipIf(!HAVE_DRAWIO)('shapes compared with draw.io', () => {
  let w: DrawioWindow;
  let doc: Document;
  /** The fill patterns draw.io made in the last theirs() call. */
  let lastPatterns: string[] = [];

  beforeAll(() => {
    w = loadDrawio();
    doc = w.document as Document;
  });

  /** Our markup, with the shadow group as a `filter` entry like draw.io's node filter. */
  function ours(markup: string): string[] {
    const host = doc.createElement('div');
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><g>${markup}</g></svg>`;
    const g = host.querySelector('g')!;
    const items: string[] = [];
    const first = Array.from(g.children).find((el) => el.tagName.toLowerCase() !== 'defs');
    const style = first?.getAttribute('style') ?? '';
    if (first?.tagName.toLowerCase() === 'g' && style.includes('drop-shadow')) {
      items.push(`filter ${style.replace(/^filter:/, '').replace(/\s+/g, '')}`);
    }
    return items.concat(normalize(g));
  }

  /** Paints a cell with draw.io's shape classes as mxCellRenderer would (in model units). */
  function theirs(styleText: string, kind: 'vertex' | 'edge', bounds: Rect | null, pts: Point[] | null): string[] {
    const resolved = resolveStyle(styleText, kind);
    const style: Record<string, any> = {};
    // mxStylesheet.getCellStyle stores numeric values as numbers
    for (const [key, value] of Object.entries(resolved)) style[key] = isNumeric(value) ? parseFloat(value) : value;
    if (style.image != null) style.image = normalizeImageSource(String(style.image));
    const defaults = w.mxCellRenderer.defaultShapes;
    // mxCellRenderer.createShape: a stencil for names without a shape class
    const stencil = defaults[style.shape] == null ? w.mxStencilRegistry.getStencil(style.shape) : null;
    const Ctor = defaults[style.shape] ?? (kind === 'edge' ? w.mxConnector : w.mxRectangleShape);
    const shape = stencil != null ? new w.mxShape(stencil) : new Ctor();
    const graph = {
      getLabel: () => '', cellRenderer: { getShape: (name: string) => defaults[name] },
      shapeBackgroundColor: '#ffffff', shapeForegroundColor: '#000000', getCellStyle: () => style,
      // A cell without children: tables have no lines, curved text no label
      isCellCollapsed: () => false, convertValueToString: () => '', getTableLines: () => [],
    };
    shape.apply({ style, cell: {}, view: { graph, scale: 1, translate: new w.mxPoint() } });
    shape.image = style.image ?? null;
    shape.indicatorColor = style.indicatorColor;
    shape.indicatorStrokeColor = style.indicatorStrokeColor;
    shape.indicatorGradientColor = style.indicatorGradientColor;
    shape.indicatorDirection = style.indicatorDirection;
    shape.indicatorImage = style.indicatorImage;
    shape.indicatorShape = style.indicatorShape != null ? defaults[style.indicatorShape] : null;
    for (const field of ['fill', 'stroke', 'gradient']) {
      if (shape[field] === 'fillColor' && field !== 'fill') shape[field] = style.fillColor;
      if (shape[field] === 'strokeColor' && field !== 'stroke') shape[field] = style.strokeColor;
    }
    if (bounds) shape.bounds = new w.mxRectangle(bounds.x, bounds.y, bounds.width, bounds.height);
    if (pts) {
      shape.points = pts.map((p) => new w.mxPoint(p.x, p.y));
      shape.updateBoundsFromPoints();
    }
    // draw.io's views paint in model units (mxGraphView.modelCoordinates)
    shape.inModelUnits = true;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);
    doc.body.appendChild(svg);
    shape.node = g;
    if (shape.indicatorShape != null) {
      shape.indicator = new shape.indicatorShape();
      shape.indicator.fill = shape.indicatorColor;
      shape.indicator.stroke = shape.indicatorStrokeColor;
      shape.indicator.gradient = shape.indicatorGradientColor;
      shape.indicator.direction = shape.indicatorDirection;
      shape.indicator.node = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    }
    shape.redrawShape();
    const items = normalize(g);
    const filter = (g as unknown as SVGGElement).style.filter;
    // A shadow on a shape that paints nothing visible is not painted
    if (filter && items.length > 0) items.unshift(`filter ${filter.replace(/\s+/g, '')}`);
    lastPatterns = Array.from(svg.querySelectorAll('pattern')).map(describePattern);
    svg.remove();
    return items;
  }

  it('paints every vertex shape and variant as draw.io does', () => {
    const bounds = { x: 10, y: 20, width: 120, height: 80 };
    const variants = ['', 'rounded=1;', 'rounded=1;arcSize=40;absoluteArcSize=1;', 'direction=south;flipH=1;',
      'direction=west;flipV=1;', 'direction=north;', 'glass=1;fillColor=#dae8fc;', 'dashed=1;strokeWidth=2;',
      'dashed=1;dashPattern=1 4;fixDash=1;', 'gradientColor=#7ea6e0;gradientDirection=east;', 'size=0.4;fixedSize=1;',
      'size=12;', 'opacity=40;rotation=25;', 'fillOpacity=30;strokeOpacity=60;opacityGroup=1;opacity=50;', 'double=1;margin=4;',
      'darkOpacity=0.1;darkOpacity2=-0.2;', 'tabPosition=left;rounded=1;', 'swimlaneFillColor=#eeeeee;horizontal=0;rounded=1;',
      'footerSize=10;rounded=1;footerColor=#ff0000;', 'centerRadius=5;centerStroke=1;', 'lid=0;', 'tipX=1.2;tipY=0.3;rounded=1;',
      'line=vertical;', 'top=0;left=0;', 'multiple=1;multipleCount=3;', 'participant=umlActor;lifelineMirror=1;',
      'symbol0=ellipse;symbol0Width=10;symbol0Height=10;symbol0Align=right;', 'shadow=1;shadowOffsetX=5;shadowBlur=4;',
      'glass=1;rounded=1;', 'strokeColor=none;fillColor=#ff0000;', 'fillColor=none;', 'jettyWidth=10;jettyHeight=30;',
      'arrowWidth=0.6;arrowSize=0.1;rounded=1;', 'dx=50;dy=10;', 'isoAngle=40;', 'position=0.1;position2=0.9;base=40;',
      'umlStateConnection=connPointRefExit;umlStateSymbol=collapseState;', 'folderSymbol=triangle;', 'smileyType=sad;'];
    const failures: string[] = [];
    for (const name of SHAPE_NAMES) {
      for (const variant of variants) {
        const style = `shape=${name};${variant}`;
        const a = ours(vertexSvg(resolveStyle(style, 'vertex'), bounds));
        const b = theirs(style, 'vertex', bounds, null);
        if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${style}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
      }
    }
    for (const style of ['label;image=https://example.com/a.png;', 'label;indicatorShape=ellipse;indicatorColor=#ff0000;indicatorDirection=south;',
      'label;indicatorShape=triangle;indicatorColor=#ff0000;imageAlign=right;imageVerticalAlign=top;',
      'shape=image;image=https://example.com/a.png;rounded=1;imageBackground=#eeeeee;imageBorder=#ff0000;', 'shape=image;image=https://example.com/a.png;imageAspect=0;flipH=1;',
      'shape=image;image=https://example.com/a.png;clipPath=inset(10% 20% 10% 5%);', 'rhombus;double=1;glass=1;rounded=1;', 'ellipse;glass=1;shadow=1;',
      'swimlane;startSize=30;glass=1;horizontal=0;', 'swimlane;rounded=1;separatorColor=#ff0000;footerSize=12;',
      'swimlane;swimlaneHead=0;swimlaneBody=0;swimlaneLine=0;swimlaneFillColor=#eeeeee;', 'mxgraph.unknown.shape;',
      'shape=mxgraph.basic.star;', 'text;', 'fillColor=#ff0000;strokeColor=fillColor;']) {
      const a = ours(vertexSvg(resolveStyle(style, 'vertex'), bounds));
      const b = theirs(style, 'vertex', bounds, null);
      if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${style}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
    }
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('paints every shipped XML stencil as draw.io does', () => {
    const bounds = { x: 10, y: 20, width: 120, height: 80 };
    const variants = ['', 'direction=south;flipH=1;', 'direction=west;', 'direction=north;flipV=1;', 'rotation=30;strokeWidth=3;',
      'dashed=1;fillColor=#dae8fc;strokeColor=#6c8ebf;', 'fillColor=none;', 'strokeColor=none;', 'gradientColor=#7ea6e0;',
      'shadow=1;', 'opacity=50;', 'stencilFlipH=1;', 'pointerEvents=1;', 'accentColor=#00ff00;', 'strokeWidth=0.5;'];
    // Names with a shape class in draw.io paint that class, not the stencil
    const names = shippedStencilNames().filter((name) => w.mxCellRenderer.defaultShapes[name] == null);
    const failures: string[] = [];
    for (const name of names) {
      for (const variant of variants) {
        const style = `shape=${name};${variant}`;
        const a = ours(vertexSvg(resolveStyle(style, 'vertex'), bounds));
        const b = theirs(style, 'vertex', bounds, null);
        if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${style}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
      }
      // Graph.getAllConnectionConstraints: the stencil's connections
      const raw = w.mxStencilRegistry.getStencil(name)?.constraints ?? null;
      const expected = raw == null ? null : raw.map((c: any) => {
        const out: Record<string, unknown> = { x: c.point.x, y: c.point.y, perimeter: c.perimeter, dx: c.dx, dy: c.dy };
        if (c.name != null) out.name = c.name;
        return out;
      });
      const actual = shapeConstraints(resolveStyle(`shape=${name};`, 'vertex'));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name} constraints: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
    }
    expect(names.length).toBeGreaterThan(700);
    // Both sides really paint the stencil (a decision is one closed path, not a rectangle)
    const decision = theirs('shape=mxgraph.flowchart.decision;', 'vertex', bounds, null);
    expect(decision.length).toBe(1);
    expect(decision[0]).toMatch(/^path d=M 70 20 L 130 60 L 70 100 L 10 60 Z/);
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('paints every library shape with its custom properties as draw.io does', () => {
    const bounds = { x: 10, y: 20, width: 120, height: 80 };
    const failures: string[] = [];
    let count = 0;
    for (const name of SHAPE_NAMES) {
      const props = w.mxCellRenderer.defaultShapes[name]?.prototype?.customProperties;
      if (!Array.isArray(props)) continue;
      for (const variant of propertyVariants(props)) {
        for (const extra of ['', 'direction=south;flipH=1;rounded=1;']) {
          const style = `shape=${name};${variant}${extra}`;
          const a = ours(vertexSvg(resolveStyle(style, 'vertex'), bounds));
          const b = theirs(style, 'vertex', bounds, null);
          count++;
          if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${style}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('paints every shape at small and extreme sizes as draw.io does', () => {
    const failures: string[] = [];
    for (const name of SHAPE_NAMES) {
      if (EDGE_SHAPES.includes(name)) continue;
      for (const [width, height] of [[40, 80], [10, 10], [300, 7], [7, 200]]) {
        for (const variant of ['', 'direction=south;flipV=1;', 'rounded=1;strokeWidth=3;']) {
          const bounds = { x: 5, y: 15, width, height };
          const style = `shape=${name};${variant}`;
          const a = ours(vertexSvg(resolveStyle(style, 'vertex'), bounds));
          const b = theirs(style, 'vertex', bounds, null);
          // draw.io's lean_mapping.timeline2 adds its offsets as strings ('0' + dx)
          // and paints NaN when the canvas offset is negative; the port paints numbers
          if (b.some((item) => item.includes('NaN'))) continue;
          if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${style} ${width}x${height}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
        }
      }
    }
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('fills with the patterns of draw.io (fillStyle)', () => {
    const bounds = { x: 10, y: 20, width: 120, height: 80 };
    const failures: string[] = [];
    let count = 0;
    for (const type of ['hatch', 'dots', 'cross-hatch', 'dashed', 'zigzag-line', 'zigzag', 'hachure', 'solid', 'auto']) {
      for (const extra of ['', 'strokeWidth=3;', 'strokeWidth=0.5;', 'hachureGap=6;', 'hachureGap=-1;', 'hachureGap=auto;',
        'fillWeight=3;', 'fillWeight=0;', 'hachureAngle=30;', 'hachureGap=0.5;fillWeight=1;hachureAngle=-20;', 'fillColor=#FF0000;opacity=50;']) {
        for (const shape of ['', 'ellipse;', 'shape=cylinder3;', 'shape=mxgraph.flowchart.decision;']) {
          const style = `${shape}fillColor=#dae8fc;fillStyle=${type};${extra}`;
          const markup = vertexSvg(resolveStyle(style, 'vertex'), bounds);
          const a = ours(markup);
          const b = theirs(style, 'vertex', bounds, null);
          const host = doc.createElement('div');
          host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
          const pa = Array.from(host.querySelectorAll('pattern')).map(describePattern);
          count++;
          if (JSON.stringify(a) !== JSON.stringify(b) || JSON.stringify(pa) !== JSON.stringify(lastPatterns)) {
            failures.push(`${style}\n ours:   ${a.concat(pa).join('\n         ')}\n drawio: ${b.concat(lastPatterns).join('\n         ')}`);
          }
        }
      }
    }
    expect(count).toBeGreaterThan(300);
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('paints every edge shape and marker as draw.io does', () => {
    const routes: Point[][] = [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 90 }, { x: 200, y: 140 }],
      [{ x: 0, y: 0 }, { x: 60, y: 80 }, { x: 160, y: 20 }],
      [{ x: 0, y: 0 }, { x: 0.5, y: 0.2 }, { x: 50, y: 50 }, { x: 50, y: 120 }],
    ];
    const variants = ['', 'startArrow=classic;', 'endArrow=none;rounded=0;', 'curved=1;', 'curved=1;trimCurve=1;startArrow=diamond;',
      'bezier=1;', 'bezier=1;trimCurve=1;', 'dashed=1;strokeWidth=3;fillColor=#ff0000;', 'startArrow=oval;startFill=0;endArrow=block;endSize=10;',
      'width=20;endWidth=40;startWidth=10;startArrow=block;', 'shadow=1;', 'arcSize=60;', 'opacity=50;',
      'endFillColor=#00ff00;endStrokeColor=#0000ff;startStrokeColor=#ff00ff;startArrow=block;'];
    for (const marker of MARKER_NAMES) variants.push(`endArrow=${marker};startArrow=${marker};startFill=0;`, `endArrow=${marker};strokeWidth=2;endSize=9;`);
    const failures: string[] = [];
    for (const name of EDGE_SHAPES) {
      for (const variant of variants) {
        for (const route of routes) {
          const style = `shape=${name};${variant}`;
          const a = ours(edgeSvg(resolveStyle(style, 'edge'), route));
          const b = theirs(style, 'edge', null, route);
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            failures.push(`${style} ${JSON.stringify(route)}\n ours:   ${a.join('\n         ')}\n drawio: ${b.join('\n         ')}`);
          }
        }
      }
    }
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });

  it('has the connection points of draw.io', () => {
    const failures: string[] = [];
    for (const name of SHAPE_NAMES) {
      for (const extra of ['', 'size=10;', 'dx=30;dy=5;', 'direction=south;', 'tabPosition=left;tabWidth=30;',
        'arrowWidth=0.5;arrowSize=0.4;', 'jettyWidth=10;jettyHeight=30;', 'isoAngle=30;', 'position2=0.2;size=20;']) {
        for (const [cw, ch] of [[120, 80], [40, 200]]) {
          const styleText = `shape=${name};${extra}`;
          const resolved = resolveStyle(styleText, 'vertex');
          const a = shapeConstraints(resolved, { width: cw, height: ch });
          const style: Record<string, any> = {};
          for (const [key, value] of Object.entries(resolved)) style[key] = isNumeric(value) ? parseFloat(value) : value;
          const shape = new (w.mxCellRenderer.defaultShapes[name] ?? w.mxRectangleShape)();
          shape.apply({ style });
          const swap = shape.direction === 'north' || shape.direction === 'south';
          // Graph.getAllConnectionConstraints
          const raw = shape.getConstraints(style, swap ? ch : cw, swap ? cw : ch) ?? shape.constraints;
          const b = raw == null ? null : raw.map((c: any) => ({ x: c.point.x, y: c.point.y, perimeter: c.perimeter, dx: c.dx, dy: c.dy }));
          if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`${styleText} ${cw}x${ch}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
        }
      }
    }
    expect(failures.slice(0, 5).join('\n'), `${failures.length} differences`).toBe('');
  });
});
