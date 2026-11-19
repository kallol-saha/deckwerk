import { describe, expect, it } from 'vitest';
import { SvgCanvas } from '../src/shared/diagram/canvas.js';
import {
  MARKER_NAMES, SHAPE_NAMES, edgePaintMargin, edgeSvg, isEdgeShape, isKnownShape, paintEdge, paintVertex,
  shapeConstraints, svgScreenOffset, vertexPaintMargin, vertexSvg,
} from '../src/shared/diagram/paint.js';
import { resolveStyle } from '../src/shared/diagram/style.js';
import type { Point } from '../src/shared/diagram/types.js';

const v = (style: string, w = 120, h = 60, x = 0, y = 0) =>
  vertexSvg(resolveStyle(style, 'vertex'), { x, y, width: w, height: h });
const e = (style: string, pts: Point[]) => edgeSvg(resolveStyle(style, 'edge'), pts);

const STRAIGHT: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const BENT: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 180, y: 80 }];

/** Shapes that need more than their name to paint something visible. */
const VERTEX_EXTRA: Record<string, string> = {
  image: 'image=data:image/png,AAAA;',
};
/** `transparent` only paints an invisible rectangle (for events), as in draw.io. */
const VERTEX_SHAPES = SHAPE_NAMES.filter((name) => !isEdgeShape(name) && name !== 'transparent');
const EDGE_SHAPE_NAMES = SHAPE_NAMES.filter((name) => isEdgeShape(name));

/** The `d` attributes of all paths, in order. */
function paths(svg: string): string[] {
  return [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
}

/** The last point of a path's `d`. */
function lastPoint(d: string): Point {
  const nums = d.split(/[A-Z ]+/).filter((s) => s !== '').map(Number);
  return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
}

function firstPoint(d: string): Point {
  const nums = d.split(/[A-Z ]+/).filter((s) => s !== '').map(Number);
  return { x: nums[0], y: nums[1] };
}

describe('shape registry', () => {
  it('knows the General, Misc and Advanced shapes', () => {
    for (const name of [
      'rectangle', 'ellipse', 'rhombus', 'cylinder', 'actor', 'triangle', 'hexagon', 'cloud', 'line', 'doubleEllipse',
      'swimlane', 'image', 'label', 'process', 'process2', 'document', 'card', 'note', 'note2', 'step', 'parallelogram',
      'trapezoid', 'callout', 'wedgeCallout', 'cube', 'isoCube2', 'isoRectangle', 'cylinder3', 'tape', 'internalStorage',
      'dataStorage', 'datastore', 'manualInput', 'loopLimit', 'offPageConnector', 'delay', 'display', 'curlyBracket',
      'singleArrow', 'doubleArrow', 'cross', 'plus', 'corner', 'tee', 'or', 'xor', 'orEllipse', 'sumEllipse',
      'lineEllipse', 'collate', 'sortShape', 'switch', 'umlActor', 'umlBoundary', 'umlEntity', 'umlControl', 'folder',
      'component', 'module', 'partialRectangle', 'waypoint', 'dimension', 'link', 'flexArrow', 'arrow', 'filledEdge',
      'pipe', 'wire', 'taperedArrow', 'crossbar', 'zigzag', 'message', 'ext', 'tapeData', 'umlLifeline', 'umlFrame',
      'connector',
    ]) {
      expect(isKnownShape(name), name).toBe(true);
    }
  });

  it('paints XML stencils, and unknown names as rectangles', () => {
    expect(isKnownShape('mxgraph.basic.star')).toBe(true);
    expect(isKnownShape('mxgraph.flowchart.decision')).toBe(true);
    expect(isKnownShape('constructor')).toBe(false);
    expect(isKnownShape('mxgraph.unknown.shape')).toBe(false);
    expect(v('shape=mxgraph.flowchart.decision;')).toBe('<path d="M 60 0 L 120 30 L 60 60 L 0 30 Z" fill="#ffffff" stroke="#000000"/>');
    expect(v('shape=mxgraph.unknown.shape;')).toBe('<rect x="0" y="0" width="120" height="60" fill="#ffffff" stroke="#000000"/>');
  });

  it('paints every vertex shape at several sizes and with every variant', () => {
    const variants = [
      '', 'rounded=1;', 'dashed=1;', 'shadow=1;', 'gradientColor=#7ea6e0;', 'glass=1;', 'direction=north;',
      'direction=south;', 'direction=west;', 'flipH=1;', 'flipV=1;', 'flipH=1;flipV=1;direction=south;',
      'rotation=30;', 'opacity=50;', 'strokeWidth=3;', 'size=0;', 'fixedSize=1;', 'arcSize=50;absoluteArcSize=1;rounded=1;',
    ];
    const sizes: Array<[number, number]> = [[120, 60], [40, 80], [10, 10], [300, 7]];
    for (const name of VERTEX_SHAPES) {
      for (const variant of variants) {
        for (const [w, h] of sizes) {
          const svg = v(`shape=${name};${VERTEX_EXTRA[name] ?? ''}${variant}`, w, h);
          // Library shapes (mxgraph.*) and the tables may paint nothing at
          // some sizes, as in draw.io (eg. a battery stack narrower than one
          // cell); diagramShapesDrawio.test.ts compares them with draw.io
          if (!name.startsWith('mxgraph.') && !['table', 'tableRow', 'tableLine'].includes(name)) {
            expect(svg, `${name} ${variant} ${w}x${h}`).toMatch(/<(path|rect|ellipse|image) /);
          }
          expect(svg, `${name} ${variant} ${w}x${h}`).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });

  it('paints every edge shape for straight and bent routes with every variant', () => {
    const variants = [
      '', 'startArrow=classic;', 'endArrow=none;', 'rounded=0;', 'curved=1;', 'dashed=1;', 'shadow=1;',
      'strokeWidth=3;', 'startArrow=oval;startFill=0;endArrow=block;', 'fillColor=#dae8fc;', 'bezier=1;',
    ];
    for (const name of EDGE_SHAPE_NAMES) {
      for (const variant of variants) {
        for (const route of [STRAIGHT, BENT]) {
          const svg = e(`shape=${name};${variant}`, route);
          expect(svg, `${name} ${variant}`).toMatch(/<path /);
          expect(svg, `${name} ${variant}`).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });

  it('paints nothing for empty bounds or short routes', () => {
    expect(v('rounded=0;', 0, 60)).toBe('');
    expect(e('endArrow=classic;', [{ x: 0, y: 0 }])).toBe('');
  });
});

describe('mxShape pipeline', () => {
  it('rounds a rectangle with arcSize as a percentage of the shorter side', () => {
    // mxRectangleShape: r = min(w * f, h * f) with f = arcSize / 100
    expect(v('rounded=1;arcSize=20;whiteSpace=wrap;html=1;'))
      .toBe('<rect x="0" y="0" width="120" height="60" rx="12" ry="12" fill="#ffffff" stroke="#000000"/>');
    // Default arcSize is RECTANGLE_ROUNDING_FACTOR (15%)
    expect(v('rounded=1;')).toContain('rx="9" ry="9"');
    // absoluteArcSize: r = min(w / 2, h / 2, arcSize / 2)
    expect(v('rounded=1;absoluteArcSize=1;arcSize=20;')).toContain('rx="10" ry="10"');
    expect(v('rounded=1;absoluteArcSize=1;arcSize=200;')).toContain('rx="30" ry="30"');
  });

  it('paints an ellipse', () => {
    expect(v('ellipse;', 100, 50, 10, 20)).toBe('<ellipse cx="60" cy="45" rx="50" ry="25" fill="#ffffff" stroke="#000000"/>');
  });

  it('paints a rhombus and its double border', () => {
    expect(v('rhombus;', 80, 80)).toBe('<path d="M 40 0 L 80 40 L 40 80 L 0 40 Z" fill="#ffffff" stroke="#000000"/>');
    // margin = max(2, strokewidth + 1) * 2
    expect(paths(v('rhombus;double=1;', 80, 80))[1]).toBe('M 40 4 L 76 40 L 40 76 L 4 40 Z');
  });

  it('rotates, turns and flips as mxShape.updateTransform', () => {
    expect(v('rotation=30;')).toContain('transform="rotate(30,60,30)"');
    expect(vertexSvg(resolveStyle('rotation=30;', 'vertex'), { x: 0, y: 0, width: 120, height: 60 }, { ignoreRotation: true }))
      .not.toContain('transform');
    // direction=north swaps the paint bounds about the centre and turns by 270
    expect(v('direction=north;'))
      .toBe('<rect x="30" y="-30" width="60" height="120" fill="#ffffff" stroke="#000000" transform="rotate(270,60,30)"/>');
    expect(v('triangle;flipH=1;')).toContain('transform="translate(60,0)scale(-1,1)translate(-60,0)"');
    // Both flips are a half turn
    expect(v('triangle;flipH=1;flipV=1;')).toContain('transform="rotate(180,60,30)"');
  });

  it('applies dash patterns as mxSvgCanvas2D', () => {
    expect(v('dashed=1;')).toContain('stroke-dasharray="3 3"');
    expect(v('dashed=1;dashPattern=8 4;strokeWidth=2;')).toContain('stroke-dasharray="16 8"');
    expect(v('dashed=1;dashPattern=8 4;strokeWidth=2;fixDash=1;')).toContain('stroke-dasharray="8 4"');
    // A single number is parsed as a number, which createDashPattern ignores
    expect(v('dashed=1;dashPattern=5;')).not.toContain('stroke-dasharray');
  });

  it('adds the drop shadow as a CSS filter on a group around the shape', () => {
    expect(v('shadow=1;')).toBe('<g style="filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.25))">'
      + '<rect x="0" y="0" width="120" height="60" fill="#ffffff" stroke="#000000"/></g>');
    expect(v('shadow=1;shadowColor=#ff0000;shadowOpacity=50;shadowOffsetX=-4;shadowOffsetY=6;shadowBlur=0;'))
      .toContain('drop-shadow(-4px 6px 0px rgba(255,0,0,0.5))');
  });

  it('fills with gradients in the direction of the style', () => {
    const svg = v('fillColor=#dae8fc;gradientColor=#7ea6e0;gradientDirection=east;');
    expect(svg).toContain('<linearGradient id="dg-g1" x1="0%" y1="0%" x2="100%" y2="0%">');
    expect(svg).toContain('stop-color="#dae8fc"');
    expect(svg).toContain('fill="url(#dg-g1)"');
    expect(vertexSvg(resolveStyle('gradientColor=#000000;', 'vertex'), { x: 0, y: 0, width: 10, height: 10 }, { idPrefix: 'n7' }))
      .toContain('fill="url(#n7-g1)"');
  });

  it('paints opacity per element, or on a group with opacityGroup=1', () => {
    const svg = v('opacity=50;');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(v('opacity=50;opacityGroup=1;')).toBe('<g opacity="0.5"><rect x="0" y="0" width="120" height="60" fill="#ffffff" stroke="#000000"/></g>');
    expect(v('fillOpacity=20;strokeOpacity=70;')).toContain('fill-opacity="0.2" fill="#ffffff" stroke="#000000" stroke-opacity="0.7"');
  });

  it('paints the glass highlight over rectangles', () => {
    const svg = v('glass=1;');
    expect(svg).toContain('stop-opacity="0.9"');
    expect(paths(svg)[0]).toBe('M -1 -1 L -1 24 Q 60 42 121 24 L 121 -1 Z');
  });

  it('paints the copies of multiple=1 behind the shape', () => {
    const svg = v('multiple=1;');
    expect(svg.match(/<rect /g)?.length).toBe(3);
    expect(svg.indexOf('x="16" y="-16"')).toBeLessThan(svg.indexOf('x="8" y="-8"'));
  });

  it('resolves self-referencing and placeholder colours', () => {
    expect(v('fillColor=#ff0000;strokeColor=fillColor;')).toContain('fill="#ff0000" stroke="#ff0000"');
    expect(v('fillColor=inherit;')).toContain('fill="none"');
    expect(vertexSvg(resolveStyle('fillColor=inherit;strokeColor=parentFillColor;', 'vertex'),
      { x: 0, y: 0, width: 10, height: 10 }, { parentStyle: { fillColor: '#123456', strokeColor: '#654321' } }))
      .toContain('fill="#123456" stroke="#123456"');
    expect(v('fillColor=swimlane;')).toContain('fill="#ffffff"');
  });

  it('shifts odd strokes by half a pixel on request (mxShape.getSvgScreenOffset)', () => {
    expect(svgScreenOffset(resolveStyle('', 'vertex'))).toBe(0.5);
    expect(svgScreenOffset(resolveStyle('strokeWidth=2;', 'vertex'))).toBe(0);
    expect(svgScreenOffset(resolveStyle('shape=image;', 'vertex'))).toBe(0);
    expect(vertexSvg(resolveStyle('', 'vertex'), { x: 0, y: 0, width: 10, height: 10 }, { screenOffset: true }))
      .toMatch(/^<g transform="translate\(0.5,0.5\)">/);
  });

  it('keeps the caller translate and isolates the canvas state', () => {
    const c = new SvgCanvas();
    c.translate(100, 50);
    c.setStrokeColor('#00ff00');
    paintVertex(c, resolveStyle('ellipse;fillColor=#ff0000;', 'vertex'), { x: 0, y: 0, width: 20, height: 10 });
    paintVertex(c, resolveStyle('rotation=90;', 'vertex'), { x: 0, y: 0, width: 20, height: 10 });
    paintEdge(c, resolveStyle('endArrow=none;', 'edge'), STRAIGHT);
    const svg = c.markup();
    expect(svg).toContain('<ellipse cx="110" cy="55"');
    expect(svg).toContain('rotate(90,110,55)');
    expect(svg).toContain('<path d="M 100 50 L 200 50" fill="none" stroke="#000000"/>');
    expect(c.state.strokeColor).toBe('#00ff00');
    expect(c.state.dx).toBe(100);
  });
});

describe('draw.io shapes', () => {
  it('paints the process with its inset lines', () => {
    expect(paths(v('shape=process;'))[0]).toBe('M 12 0 L 12 60 M 108 0 L 108 60');
    expect(paths(v('shape=process;fixedSize=1;size=20;'))[0]).toBe('M 20 0 L 20 60 M 100 0 L 100 60');
  });

  it('paints parallelograms, trapezoids, steps and hexagons with relative or fixed sizes', () => {
    expect(paths(v('shape=parallelogram;'))[0]).toBe('M 0 60 L 24 0 L 120 0 L 96 60 Z');
    expect(paths(v('shape=parallelogram;fixedSize=1;'))[0]).toBe('M 0 60 L 20 0 L 120 0 L 100 60 Z');
    expect(paths(v('shape=trapezoid;'))[0]).toBe('M 0 60 L 24 0 L 96 0 L 120 60 Z');
    expect(paths(v('shape=step;'))[0]).toBe('M 0 0 L 96 0 L 120 30 L 96 60 L 0 60 L 24 30 Z');
    expect(paths(v('shape=hexagon;', 120, 80))[0]).toBe('M 30 0 L 90 0 L 120 40 L 90 80 L 30 80 L 0 40 Z');
  });

  it('rounds polygon corners with addPoints (arcSize / 2, starting mid-way on the closing edge)', () => {
    // Virtual first point between (24, 30) and (0, 0); corners cut at min(10, half the side)
    expect(paths(v('shape=step;rounded=1;'))[0].startsWith('M 12 15 L 6 7.5 Q 0 0 10 0 L 86 0 Q 96 0')).toBe(true);
    // A rounded triangle: first point is the middle of the closing edge
    const d = paths(v('triangle;rounded=1;', 60, 80))[0];
    expect(firstPoint(d)).toEqual({ x: 0, y: 40 });
    expect(d).toContain('Q 0 0');
    expect(d.endsWith('Z')).toBe(true);
  });

  it('paints the note fold and the cube faces', () => {
    const note = paths(v('shape=note;', 80, 100));
    expect(note[0]).toBe('M 0 0 L 50 0 L 80 30 L 80 100 L 0 100 L 0 0 Z');
    expect(note[1]).toBe('M 50 0 L 50 30 L 80 30');
    const cube = v('shape=cube;darkOpacity=0.05;darkOpacity2=0.1;', 120, 80);
    expect(cube).toContain('fill-opacity="0.05" fill="#000000" stroke="none"');
    expect(cube).toContain('fill-opacity="0.1" fill="#000000" stroke="none"');
  });

  it('paints the cylinder with its lid', () => {
    const svg = paths(v('shape=cylinder3;size=15;', 60, 80));
    expect(svg).toHaveLength(2);
    expect(svg[1].startsWith('M 60 15 C')).toBe(true);
    expect(paths(v('shape=cylinder3;size=15;lid=0;', 60, 80))).toHaveLength(1);
  });

  it('paints the tail of a wedge callout towards its tip', () => {
    const d = paths(v('shape=wedgeCallout;', 120, 80))[0];
    // Default tip at (-0.25, 1) of the size from the centre: (30, 120)
    expect(d).toContain('L 30 120');
    expect(vertexPaintMargin(resolveStyle('shape=wedgeCallout;', 'vertex'), { width: 120, height: 80 })).toBeGreaterThanOrEqual(40);
  });

  it('paints swimlanes with header, body, divider and separator', () => {
    const lane = paths(v('swimlane;whiteSpace=wrap;html=1;', 200, 200));
    expect(lane).toEqual(['M 0 23 L 0 0 L 200 0 L 200 23', 'M 0 23 L 0 200 L 200 200 L 200 23', 'M 0 23 L 200 23']);
    expect(paths(v('swimlane;horizontal=0;', 200, 100))[0]).toBe('M 23 0 L 0 0 L 0 100 L 23 100');
    expect(v('swimlane;swimlaneFillColor=#eeeeee;', 200, 100)).toContain('fill="#eeeeee"');
    expect(v('swimlane;separatorColor=#ff0000;', 200, 100)).toContain('stroke="#ff0000" stroke-dasharray="3 3"');
    expect(v('swimlane;startSize=0;fixedHeader=0;', 200, 100)).toBe('');
  });

  it('paints images with aspect, background, border and rounded clip', () => {
    const plain = v('shape=image;imageAspect=0;image=data:image/png,AAAA;', 50, 60);
    expect(plain).toBe('<image x="0" y="0" width="50" height="60" href="data:image/png;base64,AAAA" preserveAspectRatio="none"/>');
    const framed = v('shape=image;image=https://example.com/a.png;imageBackground=#eeeeee;imageBorder=#ff0000;', 50, 60);
    expect(framed).toContain('<rect x="0" y="0" width="50" height="60" fill="#eeeeee" stroke="#ff0000"/>');
    expect(framed).toContain('<image x="0" y="0" width="50" height="60" href="https://example.com/a.png"/>');
    const rounded = v('shape=image;rounded=1;image=a.png;', 50, 60);
    expect(rounded).toContain('<clipPath id="dg-clip1" clipPathUnits="objectBoundingBox"><rect x="0" y="0" width="1" height="1" rx="0.15" ry="0.15"/></clipPath>');
    expect(v('shape=image;image=javascript:alert(1);', 50, 60)).toContain('href=""');
  });

  it('paints the label image and indicator', () => {
    const svg = v('label;image=a.png;', 140, 60);
    // Image at spacing (2) + 5 from the left, 42 px (label style), centred vertically
    expect(svg).toContain('<image x="7" y="9" width="42" height="42" href="a.png" preserveAspectRatio="none"/>');
    const indicator = v('label;indicatorShape=ellipse;indicatorColor=#ff0000;', 140, 60);
    expect(indicator).toContain('<ellipse cx="12" cy="30" rx="5" ry="5" fill="#ff0000"');
  });

  it('paints the ext shape with double border', () => {
    expect(v('shape=ext;double=1;').match(/<rect /g)?.length).toBe(2);
    // margin = max(2, strokewidth + 1) + margin
    expect(v('shape=ext;double=1;')).toContain('<rect x="2" y="2" width="116" height="56"');
    expect(v('shape=ext;double=1;margin=3;')).toContain('<rect x="5" y="5" width="110" height="50"');
  });

  it('paints partial rectangles with only the given sides', () => {
    expect(paths(v('shape=partialRectangle;left=0;right=0;fillColor=none;'))[0]).toBe('M 0 0 L 120 0 M 120 60 L 0 60');
  });

  it('keeps foreground strokes in the stroke colour', () => {
    expect(v('shape=orEllipse;strokeColor=#ff0000;', 40, 40).match(/stroke="#ff0000"/g)?.length).toBe(3);
    expect(v('shape=umlActor;', 30, 60)).toContain('<ellipse cx="15" cy="7.5" rx="7.5" ry="7.5"');
  });
});

describe('markers and connectors', () => {
  it('paints a classic end arrow, shortening the line by 3/4 of the marker', () => {
    expect(e('endArrow=classic;html=1;', STRAIGHT)).toBe(
      '<path d="M 0 0 L 93.63 0" fill="none" stroke="#000000"/>'
      + '<path d="M 98.88 0 L 91.88 3.5 L 93.63 0 L 91.88 -3.5 Z" fill="#000000" stroke="#000000"/>');
  });

  it('shortens the line where each marker begins', () => {
    const end = (style: string) => lastPoint(paths(e(style, STRAIGHT))[0]).x;
    // createArrow: tip pulled back by sw * 1.118; classic f = 3/4, block f = 1
    expect(end('endArrow=classic;')).toBe(93.63);
    expect(end('endArrow=block;')).toBe(91.88);
    expect(end('endArrow=classic;strokeWidth=2;')).toBe(91.76);
    expect(end('endArrow=classic;endSize=10;')).toBe(90.63);
    // open arrows only pull back by the stroke
    expect(end('endArrow=open;')).toBe(97.76);
    // oval: half the size; diamond: size + sw plus sw * 0.7071
    expect(end('endArrow=oval;')).toBe(97);
    expect(end('endArrow=diamond;')).toBe(92.29);
    expect(end('endArrow=diamondThin;')).toBe(92.01);
    // circle: 2 * (size + sw) + sw
    expect(end('endArrow=circle;')).toBe(85);
    // box: size + sw + 1
    expect(end('endArrow=box;')).toBe(92);
    // ER: zeroToMany moves the end unless filled
    expect(end('endArrow=ERzeroToMany;endFill=0;')).toBe(84.5);
    expect(end('endArrow=ERzeroToMany;')).toBe(100);
    // Markers that do not shorten the line
    for (const type of ['none', 'dash', 'cross', 'ERone', 'ERmany', 'openAsync', 'baseDash']) {
      expect(end(`endArrow=${type};`), type).toBe(100);
    }
  });

  it('shortens the start of the line for start markers', () => {
    const start = firstPoint(paths(e('startArrow=block;endArrow=none;', STRAIGHT))[0]);
    expect(start.x).toBe(8.12);
  });

  it('paints every marker at both ends, filled and unfilled', () => {
    for (const marker of MARKER_NAMES) {
      for (const fill of ['1', '0']) {
        const svg = e(`startArrow=${marker};endArrow=${marker};startFill=${fill};endFill=${fill};`, BENT);
        expect(svg.match(/<(path|ellipse) /g)?.length ?? 0, marker).toBeGreaterThanOrEqual(3);
        expect(svg, marker).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('fills markers with the stroke colour unless end/startFillColor is set', () => {
    expect(e('endArrow=block;strokeColor=#ff0000;', STRAIGHT)).toContain('fill="#ff0000" stroke="#ff0000"');
    expect(e('endArrow=block;endFillColor=#00ff00;endStrokeColor=#0000ff;', STRAIGHT)).toContain('fill="#00ff00" stroke="#0000ff"');
    expect(e('endArrow=block;endFill=0;', STRAIGHT)).toContain('Z" fill="none" stroke="#000000"');
  });

  it('does not dash markers of dashed edges', () => {
    const svg = e('endArrow=block;dashed=1;', STRAIGHT);
    expect(svg.match(/stroke-dasharray/g)?.length).toBe(1);
  });

  it('rounds the corners of rounded connectors and keeps sharp corners otherwise', () => {
    // Edges are rounded by default (defaultEdge); corner cut at arcSize / 2 = 10
    expect(paths(e('endArrow=none;', BENT))[0]).toBe('M 0 0 L 90 0 Q 100 0 100 10 L 100 70 Q 100 80 110 80 L 180 80');
    expect(paths(e('endArrow=none;rounded=0;', BENT))[0]).toBe('M 0 0 L 100 0 L 100 80 L 180 80');
    expect(paths(e('endArrow=none;arcSize=40;', BENT))[0]).toBe('M 0 0 L 80 0 Q 100 0 100 20 L 100 60 Q 100 80 120 80 L 180 80');
  });

  it('paints curved connectors through the midpoints', () => {
    expect(paths(e('endArrow=none;curved=1;', BENT))[0]).toBe('M 0 0 Q 100 0 100 40 Q 100 80 180 80');
    expect(paths(e('endArrow=none;bezier=1;', BENT))[0]).toBe('M 0 0 C 100 0 100 80 180 80');
  });

  it('cuts trimmed curves where the markers begin instead of moving their ends', () => {
    const trimmed = paths(e('endArrow=classic;curved=1;trimCurve=1;', BENT))[0];
    const moved = paths(e('endArrow=classic;curved=1;', BENT))[0];
    expect(trimmed).not.toBe(moved);
    expect(trimmed.startsWith('M 0 0 Q')).toBe(true);
  });

  it('paints flexArrow as a closed outline with arrow heads', () => {
    const svg = e('shape=flexArrow;endArrow=classic;html=1;fillColor=#dae8fc;', STRAIGHT);
    // width 10, endWidth 20 + width, endSize 6 * 3 + strokewidth, spacing sw / 2
    expect(paths(svg)[0]).toBe('M 0.5 5 L 0.5 -5 L 80.5 -5 L 80.5 -15.5 L 99.5 0 L 80.5 15.5 L 80.5 5 Z');
    expect(svg).toContain('fill="#dae8fc"');
  });

  it('paints link as two open lines', () => {
    expect(paths(e('shape=link;html=1;', STRAIGHT))[0]).toBe('M 0 -2 L 100 -2 M 100 2 L 0 2 M 100 2');
  });

  it('paints the mxArrow block arrow', () => {
    expect(paths(e('shape=arrow;', STRAIGHT))[0]).toBe('M 0 5 L 0 -5 L 70 -5 L 70 -15 L 100 0 L 70 15 L 70 5 Z');
  });

  it('paints pipe, filledEdge and wire as two strokes', () => {
    const pipe = e('shape=pipe;fillColor=#ffffff;endArrow=none;', STRAIGHT);
    expect(pipe).toContain('stroke-width="6"');
    expect(pipe).toContain('stroke="#ffffff" stroke-width="4"');
    const filled = e('shape=filledEdge;strokeWidth=10;fillColor=#ffffff;endArrow=none;', STRAIGHT);
    expect(filled).toContain('stroke-width="10"');
    expect(filled).toContain('stroke="#ffffff" stroke-width="8"');
    const wire = e('shape=wire;dashed=1;fillColor=#ff0000;endArrow=none;', STRAIGHT);
    expect(paths(wire)).toHaveLength(2);
    expect(wire).toContain('stroke="#ff0000" stroke-dasharray="3 3"');
  });

  it('paints the tapered arrow band with its head in the outline', () => {
    const svg = e('shape=taperedArrow;startWidth=12;endWidth=2;endArrow=block;endFill=1;fillColor=#ff0000;', STRAIGHT);
    expect(paths(svg)).toHaveLength(1);
    expect(firstPoint(paths(svg)[0])).toEqual({ x: 0, y: 6 });
    expect(svg).toContain('fill="#ff0000"');
  });
});

describe('connection constraints', () => {
  it('returns the static points of the shape classes', () => {
    expect(shapeConstraints(resolveStyle('', 'vertex'))).toHaveLength(16);
    expect(shapeConstraints(resolveStyle('ellipse;', 'vertex'))).toHaveLength(8);
    expect(shapeConstraints(resolveStyle('shape=cylinder3;', 'vertex'))).toHaveLength(16);
    expect(shapeConstraints(resolveStyle('triangle;', 'vertex'))?.[3]).toEqual({ x: 0.5, y: 0, perimeter: true, dx: 0, dy: 0 });
    // A stencil's own connection points (basic.xml's star has 6); an unknown name is a rectangle
    expect(shapeConstraints(resolveStyle('shape=mxgraph.basic.star;', 'vertex'))).toHaveLength(6);
    expect(shapeConstraints(resolveStyle('shape=mxgraph.unknown.shape;', 'vertex'))).toHaveLength(16);
    expect(shapeConstraints(resolveStyle('shape=isoRectangle;', 'vertex'))).toEqual([]);
    expect(shapeConstraints(resolveStyle('shape=umlLifeline;', 'vertex'))).toBeNull();
    expect(shapeConstraints(resolveStyle('shape=umlBoundary;', 'vertex'))).toBeNull();
  });

  it('computes the points that depend on the size', () => {
    const note = shapeConstraints(resolveStyle('shape=note;size=20;', 'vertex'), { width: 80, height: 100 });
    expect(note?.[2]).toEqual({ x: 1, y: 0, perimeter: false, dx: -20, dy: 0 });
    expect(note).toHaveLength(11);
    // Too narrow for the extra point
    expect(shapeConstraints(resolveStyle('shape=note;size=50;', 'vertex'), { width: 80, height: 100 })).toHaveLength(10);
    // north/south swap the width and height
    const tee = shapeConstraints(resolveStyle('shape=tee;direction=south;dy=10;', 'vertex'), { width: 100, height: 5 });
    expect(tee?.[4]).toEqual({ x: 1, y: 0, perimeter: false, dx: 0, dy: 10 });
  });

  it('reads the points style', () => {
    expect(shapeConstraints(resolveStyle('points=[[0,0,1,-10,10],[0,1,0],[1,1]];', 'vertex'))).toEqual([
      { x: 0, y: 0, perimeter: true, dx: -10, dy: 10 },
      { x: 0, y: 1, perimeter: false, dx: 0, dy: 0 },
      { x: 1, y: 1, perimeter: true, dx: 0, dy: 0 },
    ]);
    expect(shapeConstraints(resolveStyle('points=[];', 'vertex'))).toEqual([]);
    expect(shapeConstraints(resolveStyle('points=oops;', 'vertex'))).toEqual([]);
  });
});

describe('paint margins', () => {
  it('covers stroke, shadow and copies', () => {
    const plain = vertexPaintMargin(resolveStyle('', 'vertex'));
    expect(plain).toBeGreaterThanOrEqual(0.5);
    expect(vertexPaintMargin(resolveStyle('shadow=1;', 'vertex'))).toBeGreaterThanOrEqual(plain + 7);
    expect(vertexPaintMargin(resolveStyle('multiple=1;', 'vertex'))).toBeGreaterThanOrEqual(plain + 16);
    expect(vertexPaintMargin(resolveStyle('strokeColor=none;', 'vertex'))).toBe(0);
  });

  it('covers markers and arrow bands of edges', () => {
    expect(edgePaintMargin(resolveStyle('endArrow=classic;', 'edge'))).toBeGreaterThanOrEqual(7);
    expect(edgePaintMargin(resolveStyle('shape=flexArrow;endArrow=classic;', 'edge'))).toBeGreaterThanOrEqual(15);
  });
});
