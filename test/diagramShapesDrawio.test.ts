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
import { MARKER_NAMES, SHAPE_NAMES, edgeSvg, shapeConstraints, vertexSvg } from '../src/shared/diagram/paint.js';
import { isNumeric, normalizeImageSource } from '../src/shared/diagram/shapes/util.js';
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
    + 'mxConstants.SHADOW_OPACITY = 0.25; mxConstants.SHADOWCOLOR = "#000000";');
  const graph = read('js/grapheditor/Graph.js');
  w.eval(extract(graph, 'Graph.defaultMultipleCount = ', 'Graph.getMultipleCopies = function'));
  w.eval(extract(graph, 'Graph.curvePointSteps = ', 'Graph.getCurveSegments = function'));
  w.eval(`(function() {${extract(graph, 'mxShape.prototype.getMultipleCopies = function', 'mxShape.prototype.paintShape = function')}})();`);
  w.eval(`(function() {${extract(graph, 'var mxConnectorPaintCurvedLine = ', 'mxConnector.prototype.paintCutCurve = function')}})();`);
  w.eval(read('js/grapheditor/Shapes.js'));
  w.eval(read('shapes/er/mxER.js'));
  w.eval(read('shapes/mxSysML.js'));
  return w;
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

describe.skipIf(!HAVE_DRAWIO)('shapes compared with draw.io', () => {
  let w: DrawioWindow;
  let doc: Document;

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
    const Ctor = defaults[style.shape] ?? (kind === 'edge' ? w.mxConnector : w.mxRectangleShape);
    const shape = new Ctor();
    const graph = { getLabel: () => '', cellRenderer: { getShape: (name: string) => defaults[name] } };
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
    for (const name of ['connector', 'arrow', 'arrowConnector', 'link', 'flexArrow', 'wire', 'filledEdge', 'pipe', 'taperedArrow']) {
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
