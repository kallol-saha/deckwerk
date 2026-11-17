import { describe, expect, it } from 'vitest';
import { resolveStyle } from '../src/shared/diagram/style.js';
import type { Point } from '../src/shared/diagram/types.js';
import {
  connectionPoint, edgeConstraint, edgeLabelPoint, edgeOwnLabelPoint, isOrthogonalEdge, perimeterPoint,
  relativePointOnRoute, routeEdge, terminalConstraints,
} from '../src/shared/diagram/route.js';
import type { EdgeView, TerminalView } from '../src/shared/diagram/route.js';

/**
 * Routes are ported from draw.io's mxGraphView/mxEdgeStyle/mxPerimeter. The
 * expected values below are traced by hand through those algorithms (the
 * comments give the steps that decide each case).
 */

const box = (id: string, x: number, y: number, width: number, height: number, style = ''): TerminalView =>
  ({ id, bounds: { x, y, width, height }, style: resolveStyle(style, 'vertex') });

const edge = (style: string, source: TerminalView | null, target: TerminalView | null, extra: Partial<EdgeView> = {}): EdgeView =>
  ({ id: 'e', style: resolveStyle(style, 'edge'), source, target, points: [], ...extra });

const route = (style: string, source: TerminalView | null, target: TerminalView | null, extra: Partial<EdgeView> = {}) =>
  routeEdge(edge(style, source, target, extra));

function expectPoints(actual: Point[], expected: [number, number][], digits = 6): void {
  expect(actual.length, JSON.stringify(actual)).toBe(expected.length);
  expected.forEach(([x, y], i) => {
    expect(actual[i].x, `x of point ${i}: ${JSON.stringify(actual)}`).toBeCloseTo(x, digits);
    expect(actual[i].y, `y of point ${i}: ${JSON.stringify(actual)}`).toBeCloseTo(y, digits);
  });
}

function expectOrthogonal(points: Point[]): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    expect(Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9, `segment ${i}: ${JSON.stringify(points)}`).toBe(true);
  }
}

function onBorder(p: Point, b: { x: number; y: number; width: number; height: number }): boolean {
  const eps = 1e-6;
  const inX = p.x >= b.x - eps && p.x <= b.x + b.width + eps;
  const inY = p.y >= b.y - eps && p.y <= b.y + b.height + eps;
  return inX && inY && (Math.abs(p.x - b.x) < eps || Math.abs(p.x - b.x - b.width) < eps ||
    Math.abs(p.y - b.y) < eps || Math.abs(p.y - b.y - b.height) < eps);
}

describe('straight edges clip to the perimeter', () => {
  it('rectangles side by side', () => {
    // Target first: next is the source center, then the source aims at the target end
    expectPoints(route('', box('a', 0, 0, 100, 50), box('b', 200, 0, 100, 50)), [[100, 25], [200, 25]]);
  });

  it('rectangles on a diagonal', () => {
    // Target: left edge, y = 250 - 100 * (200/300) / 2; source: right edge toward that point
    expectPoints(route('', box('a', 0, 0, 100, 100), box('b', 300, 200, 100, 100)),
      [[100, 50 + 100 * (166.66666666666666 / 250) / 2], [300, 250 - 100 * (200 / 300) / 2]]);
  });

  it('ellipse', () => {
    const a = box('a', 0, 0, 100, 100, 'ellipse');
    expectPoints(route('', a, box('b', 200, 0, 100, 100)), [[100, 50], [200, 50]]);
    // Diagonal: the target corner (200, 200), then the ellipse at 45 degrees
    const r = 50 / Math.SQRT2;
    expectPoints(route('', a, box('b', 200, 200, 100, 100)), [[50 + r, 50 + r], [200, 200]]);
  });

  it('rhombus', () => {
    const a = box('a', 0, 0, 100, 100, 'rhombus');
    expectPoints(route('', a, box('b', 300, 0, 100, 100)), [[100, 50], [300, 50]]);
    // The line from (200, 200) to the center meets the lower right side at (75, 75)
    expectPoints(route('', a, box('b', 200, 200, 100, 100)), [[75, 75], [200, 200]]);
  });

  it('triangle', () => {
    expectPoints(route('', box('a', 0, 0, 100, 100, 'triangle'), box('b', 300, 0, 100, 100)), [[100, 50], [300, 50]]);
    // Leaving through the base on the left
    expectPoints(route('', box('a', 200, 0, 100, 100, 'triangle'), box('b', 0, 0, 100, 100)), [[200, 50], [100, 50]]);
  });

  it('triangle pointing north', () => {
    // Base at the bottom: an edge straight down leaves the base at its middle
    expectPoints(route('', box('a', 0, 0, 100, 100, 'triangle;direction=north'), null, { targetPoint: { x: 50, y: 300 } }),
      [[50, 100], [50, 300]]);
  });

  it('hexagon (hexagonPerimeter)', () => {
    const a = box('a', 0, 0, 100, 100, 'shape=hexagon;perimeter=hexagonPerimeter');
    expectPoints(route('', a, null, { targetPoint: { x: 300, y: 50 } }), [[100, 50], [300, 50]]);
    // The ray to (300, 150) crosses the lower right side (100,50)-(75,100) at u = 1/6
    expectPoints(route('', a, null, { targetPoint: { x: 300, y: 150 } }), [[50 + 250 / 6, 50 + 100 / 6], [300, 150]]);
  });

  it('hexagon (hexagonPerimeter2) and parallelogram', () => {
    const h = box('a', 0, 0, 100, 100, 'shape=hexagon;perimeter=hexagonPerimeter2');
    expectPoints(route('', h, null, { targetPoint: { x: 300, y: 50 } }), [[100, 50], [300, 50]]);
    expectPoints(route('', h, null, { targetPoint: { x: 300, y: 150 } }), [[50 + 250 / 6, 50 + 100 / 6], [300, 150]]);
    // Parallelogram size 0.2: the slanted right side runs from (100, 0) to (80, 50)
    const p = box('p', 0, 0, 100, 50, 'shape=parallelogram;perimeter=parallelogramPerimeter');
    expectPoints(route('', p, null, { targetPoint: { x: 300, y: 25 } }), [[90, 25], [300, 25]]);
  });

  it('callout perimeter uses the body without the pointer', () => {
    // getDirectedBounds takes the 30px pointer off the bottom: body (0, 0, 100, 50)
    const c = box('c', 0, 0, 100, 80, 'shape=callout;perimeter=calloutPerimeter');
    expectPoints(route('', c, null, { targetPoint: { x: 300, y: 25 } }), [[100, 25], [300, 25]]);
  });

  it('centerPerimeter fixes the end at the center', () => {
    expectPoints(route('', box('a', 0, 0, 100, 50, 'perimeter=centerPerimeter'), box('b', 200, 0, 100, 50)), [[50, 25], [200, 25]]);
  });

  it('a vertex without a perimeter ends at its center', () => {
    expectPoints(route('', box('a', 0, 0, 100, 50, 'perimeter=none'), box('b', 200, 0, 100, 50)), [[50, 25], [200, 25]]);
  });

  it('orthogonal=1 projects the ends', () => {
    expectPoints(route('orthogonal=1', box('a', 0, 0, 100, 50), box('b', 200, 100, 100, 50)), [[100, 50], [200, 100]]);
  });

  it('perimeter spacing of the edge and of the vertex', () => {
    const a = box('a', 0, 0, 100, 50);
    const b = box('b', 200, 0, 100, 50);
    expectPoints(route('perimeterSpacing=5', a, b), [[105, 25], [195, 25]]);
    expectPoints(route('sourcePerimeterSpacing=4;targetPerimeterSpacing=6', a, b), [[104, 25], [194, 25]]);
    expectPoints(route('', a, box('b', 200, 0, 100, 50, 'perimeterSpacing=10')), [[100, 25], [190, 25]]);
  });
});

describe('loose ends', () => {
  it('ends at the given terminal points', () => {
    expectPoints(route('', box('a', 0, 0, 100, 50), null, { targetPoint: { x: 300, y: 25 } }), [[100, 25], [300, 25]]);
    expectPoints(route('', null, null, { sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 100, y: 100 } }), [[0, 0], [100, 100]]);
  });

  it('returns nothing for an end with neither terminal nor point', () => {
    expect(route('', box('a', 0, 0, 100, 50), null)).toEqual([]);
  });
});

describe('fixed connection points', () => {
  const a = box('a', 0, 0, 100, 50);
  const b = box('b', 200, 100, 100, 50);

  it('exitX/exitY and entryX/entryY', () => {
    expectPoints(route('exitX=1;exitY=0.5;entryX=0;entryY=0.5', a, b), [[100, 25], [200, 125]]);
  });

  it('exitDx/exitDy without perimeter projection', () => {
    expectPoints(route('exitX=0.5;exitY=0;exitDx=10;exitDy=-5;exitPerimeter=0;entryX=0;entryY=0.5', a, b), [[60, -5], [200, 125]]);
  });

  it('projects a fixed point inside the shape onto the perimeter', () => {
    // (0.5, 0.25) is inside; projected from the center (50, 25) toward (50, 12.5): the top edge
    expectPoints(route('exitX=0.5;exitY=0.25;entryX=0;entryY=0.5', a, b), [[50, 0], [200, 125]]);
  });

  it('flips and directions', () => {
    // flipH mirrors a fixed point that is not projected
    expect(connectionPoint(box('a', 0, 0, 100, 50, 'flipH=1'), { x: 0, y: 0.5, perimeter: false })).toEqual({ x: 100, y: 25 });
    // direction=south: (1, 0.5) of the turned box, projected, is the bottom center
    const p = connectionPoint(box('a', 0, 0, 100, 50, 'direction=south'), { x: 1, y: 0.5 })!;
    expect(p.x).toBeCloseTo(50, 9);
    expect(p.y).toBeCloseTo(50, 9);
  });

  it('rotated terminal: fixed points rotate with the shape', () => {
    // (100, 25) rotated by 90 degrees about (50, 25)
    const p = connectionPoint(box('a', 0, 0, 100, 50, 'rotation=90'), { x: 1, y: 0.5 })!;
    expect(p.x).toBeCloseTo(50, 9);
    expect(p.y).toBeCloseTo(75, 9);
  });

  it('reads constraints from the edge style', () => {
    expect(edgeConstraint(resolveStyle('exitX=1;exitY=0.5;exitPerimeter=0;exitDx=3', 'edge'), true))
      .toEqual({ x: 1, y: 0.5, perimeter: false, dx: 3, dy: 0 });
    expect(edgeConstraint(resolveStyle('exitX=1', 'edge'), true)).toBeNull();
    expect(edgeConstraint(resolveStyle('entryX=0;entryY=1', 'edge'), false)).toEqual({ x: 0, y: 1, perimeter: true, dx: 0, dy: 0 });
  });

  it('fixedPointSpacing moves fixed ends along the route', () => {
    const style = 'exitX=1;exitY=0.5;sourcePerimeterSpacing=10;fixedPointSpacing=1';
    expectPoints(route(style, a, null, { targetPoint: { x: 300, y: 25 } }), [[110, 25], [300, 25]]);
    expectPoints(route('exitX=1;exitY=0.5;sourcePerimeterSpacing=10', a, null, { targetPoint: { x: 300, y: 25 } }), [[100, 25], [300, 25]]);
  });

  it('snapToPoint ends on the nearest connection point', () => {
    // The floating end is (200, 50); (200, 0) and (200, 100) tie and the first wins
    const t = box('b', 200, 0, 100, 100, 'points=[[0,0],[0.5,0],[0,1]];snapToPoint=1');
    expectPoints(route('', null, t, { sourcePoint: { x: 50, y: 50 } }), [[50, 50], [200, 0]]);
    expect(terminalConstraints(t)).toEqual([
      { x: 0, y: 0, perimeter: true, dx: 0, dy: 0 },
      { x: 0.5, y: 0, perimeter: true, dx: 0, dy: 0 },
      { x: 0, y: 1, perimeter: true, dx: 0, dy: 0 },
    ]);
  });
});

describe('waypoints without an edge style', () => {
  it('passes through the waypoints and clips toward them', () => {
    const r = route('', box('a', 0, 0, 100, 50), box('b', 300, 0, 100, 50), { points: [{ x: 150, y: 200 }] });
    // Bottom edges: x = cx ± h * tan(beta) / 2 toward the waypoint
    expectPoints(r, [[50 + 50 * (100 / 175) / 2, 50], [150, 200], [350 - 50 * (200 / 175) / 2, 50]]);
  });

  it('noEdgeStyle=1 ignores the edge style', () => {
    const r = route('edgeStyle=orthogonalEdgeStyle;noEdgeStyle=1', box('a', 0, 0, 100, 50), box('b', 200, 0, 100, 50));
    expectPoints(r, [[100, 25], [200, 25]]);
  });
});

describe('orthogonalEdgeStyle', () => {
  const style = 'edgeStyle=orthogonalEdgeStyle';
  const a = box('a', 0, 0, 100, 50);

  it('is orthogonal', () => {
    expect(isOrthogonalEdge(resolveStyle(style, 'edge'))).toBe(true);
    expect(isOrthogonalEdge(resolveStyle('', 'edge'))).toBe(false);
    expect(isOrthogonalEdge(resolveStyle('edgeStyle=isometricEdgeStyle', 'edge'))).toBe(false);
  });

  it('target to the right on the same row: straight', () => {
    // Route pattern [1][3]; the jetty points collapse and the last point is dropped
    expectPoints(route(style, a, box('b', 200, 0, 100, 50)), [[100, 25], [200, 25]]);
  });

  it('target below right: one bend', () => {
    // quad 2, source east, target north, pattern [0][3]: a single bend at (250, 25)
    expectPoints(route(style, a, box('b', 200, 150, 100, 50)), [[100, 25], [250, 25], [250, 150]]);
  });

  const placements: [string, TerminalView][] = [
    ['left', box('b', -300, 0, 100, 50)],
    ['above', box('b', 0, -200, 100, 50)],
    ['below', box('b', 0, 200, 100, 50)],
    ['above left', box('b', -250, -200, 100, 50)],
    ['below left, offset', box('b', -220, 130, 80, 60)],
    ['above right', box('b', 220, -170, 60, 40)],
  ];

  for (const [name, b] of placements) {
    it(`target ${name}: axis-aligned segments that end on both borders`, () => {
      const r = route(style, a, b);
      expect(r.length).toBeGreaterThanOrEqual(2);
      expectOrthogonal(r);
      expect(onBorder(r[0], a.bounds), JSON.stringify(r)).toBe(true);
      expect(onBorder(r[r.length - 1], b.bounds), JSON.stringify(r)).toBe(true);
    });
  }

  it('overlapping terminals still give a route', () => {
    const r = route(style, box('a', 0, 0, 100, 100), box('b', 50, 50, 100, 100));
    expect(r.length).toBeGreaterThanOrEqual(2);
    for (const p of r) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('a port constraint picks the side', () => {
    // North out of the source, pattern [3][2]: up the jetty, over, down to the target's middle
    const r = route(`${style};sourcePortConstraint=north`, a, box('b', 200, 150, 100, 50));
    expectPoints(r, [[50, 0], [50, -10], [150, -10], [150, 175], [200, 175]]);
  });

  it('with a waypoint it routes as segmentEdgeStyle', () => {
    const b = box('b', 300, 200, 100, 50);
    const points = [{ x: 200, y: 100 }];
    const expected: [number, number][] = [[50, 50], [50, 100], [200, 100], [200, 225], [300, 225]];
    expectPoints(route(style, a, b, { points }), expected);
    expectPoints(route('edgeStyle=segmentEdgeStyle', a, b, { points }), expected);
  });

  it('with fixed ports', () => {
    // exitX=1 (east) to entryX=0.5, entryY=0 (north): one bend above the target
    const r = route(`${style};exitX=1;exitY=0.5;entryX=0.5;entryY=0`, a, box('b', 200, 150, 100, 50));
    expectPoints(r, [[100, 25], [250, 25], [250, 150]]);
  });
});

describe('elbow edges', () => {
  const a = box('a', 0, 0, 100, 50);

  it('side to side (default)', () => {
    expectPoints(route('edgeStyle=elbowEdgeStyle', a, box('b', 200, 100, 100, 50)),
      [[100, 25], [150, 25], [150, 125], [200, 125]]);
  });

  it('top to bottom (elbow=vertical)', () => {
    expectPoints(route('edgeStyle=elbowEdgeStyle;elbow=vertical', a, box('b', 200, 150, 100, 50)),
      [[50, 50], [50, 100], [250, 100], [250, 150]]);
  });

  it('a waypoint level with the source moves the first segment', () => {
    expectPoints(route('edgeStyle=elbowEdgeStyle', a, box('b', 200, 100, 100, 50), { points: [{ x: 180, y: 30 }] }),
      [[100, 30], [180, 30], [180, 125], [200, 125]]);
  });

  it('sideToSideEdgeStyle and topToBottomEdgeStyle by name', () => {
    expectPoints(route('edgeStyle=sideToSideEdgeStyle', a, box('b', 200, 100, 100, 50)),
      [[100, 25], [150, 25], [150, 125], [200, 125]]);
    expectPoints(route('edgeStyle=topToBottomEdgeStyle', a, box('b', 200, 150, 100, 50)),
      [[50, 50], [50, 100], [250, 100], [250, 150]]);
  });
});

describe('entity relation', () => {
  const a = box('a', 0, 0, 100, 50);

  it('opposite sides', () => {
    expectPoints(route('edgeStyle=entityRelationEdgeStyle', a, box('b', 300, 100, 100, 50)),
      [[100, 25], [130, 25], [270, 125], [300, 125]]);
  });

  it('same side', () => {
    expectPoints(route('edgeStyle=entityRelationEdgeStyle', a, box('b', 50, 100, 100, 50)),
      [[100, 25], [180, 25], [180, 125], [150, 125]]);
  });

  it('segment length from the style', () => {
    expectPoints(route('edgeStyle=entityRelationEdgeStyle;segment=10', a, box('b', 300, 100, 100, 50)),
      [[100, 25], [110, 25], [290, 125], [300, 125]]);
  });
});

describe('loops', () => {
  it('a self reference loops out on the right', () => {
    const a = box('a', 100, 100, 100, 50);
    // Loop: (220, 115) and (220, 135); the ends clip toward them
    const dy = 100 * (10 / 70) / 2;
    expectPoints(route('', a, a), [[200, 125 - dy], [220, 115], [220, 135], [200, 125 + dy]]);
  });

  it('loopStyle and the segment come from the style', () => {
    const a = box('a', 100, 100, 100, 50);
    const r = route('segment=20;direction=north', a, a);
    // North: x = center 150, dx = 20, y = top - 2 * 20
    expect(r[1]).toEqual({ x: 130, y: 60 });
    expect(r[2]).toEqual({ x: 170, y: 60 });
  });
});

describe('rotated terminals', () => {
  it('quarter turns project in the unrotated frame', () => {
    // The 100x50 box turned by 90 degrees spans x 25..75: the edge leaves at (75, 25)
    const r = route('', box('a', 0, 0, 100, 50, 'rotation=90'), box('b', 300, 0, 100, 50));
    expectPoints(r, [[75, 25], [300, 25]]);
  });

  it('other angles rotate the perimeter point', () => {
    // A square turned by 45 degrees: the ray to the right hits the corner at 50 * sqrt(2)
    const r = route('', box('a', 0, 0, 100, 100, 'rotation=45'), null, { targetPoint: { x: 300, y: 50 } });
    expectPoints(r, [[50 + 50 * Math.SQRT2, 50], [300, 50]]);
  });
});

describe('perimeterPoint', () => {
  it('rectangle and orthogonal projection', () => {
    const a = box('a', 0, 0, 100, 50);
    const p = perimeterPoint(a, { x: 300, y: 125 }, false)!;
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.y).toBeCloseTo(25 + 100 * (100 / 250) / 2, 9);
    expect(perimeterPoint(a, { x: 300, y: 40 }, true)).toEqual({ x: 100, y: 40 });
  });

  it('keeps edges off an outside label (labelPerimeter=1)', () => {
    const a: TerminalView = {
      ...box('a', 0, 0, 100, 50, 'labelPerimeter=1;verticalLabelPosition=bottom;verticalAlign=top'),
      labelBox: { x: 20, y: 50, width: 60, height: 20 },
    };
    expectPoints(route('', null, a, { sourcePoint: { x: 50, y: 200 } }), [[50, 200], [50, 70]]);
  });

  it('flipped shapes mirror the perimeter', () => {
    // A triangle pointing east, flipped, points west: an edge to the left leaves its tip
    const p = perimeterPoint(box('a', 0, 0, 100, 100, 'triangle;flipH=1'), { x: -200, y: 50 }, false)!;
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(50, 9);
  });
});

describe('ports', () => {
  it('sourcePort routes from the named cell', () => {
    const port = box('p', 90, 20, 10, 10);
    const r = routeEdge({
      ...edge('sourcePort=p', box('a', 0, 0, 100, 50), box('b', 200, 20, 100, 10)),
      resolvePort: (id) => (id == 'p' ? port : null),
    });
    expectPoints(r, [[100, 25], [200, 25]]);
  });
});

describe('sequence messages', () => {
  it('a message between lifelines is horizontal at its waypoint', () => {
    const lifeline = 'shape=umlLifeline;perimeter=lifelinePerimeter';
    const r = route('edgeStyle=sequenceEdgeStyle', box('a', 0, 0, 100, 300, lifeline), box('b', 200, 0, 100, 300, lifeline),
      { points: [{ x: 150, y: 120 }] });
    // lifelinePerimeter: center x + strokeWidth / 2 - 1 on either side
    expectPoints(r, [[49.5, 120], [150, 120], [249.5, 120]]);
  });
});

describe('isometric edges', () => {
  it('bends at isometric angles', () => {
    const r = route('edgeStyle=isometricEdgeStyle', null, null, { sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 200, y: 0 } });
    expect(r.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < r.length; i++) {
      const angle = Math.atan2(r[i].y - r[i - 1].y, r[i].x - r[i - 1].x) * 180 / Math.PI;
      const folded = ((angle % 180) + 180) % 180;
      expect([30, 150].some((a) => Math.abs(folded - a) < 1e-6) || Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y) < 1e-6,
        `segment ${i} at ${angle}`).toBe(true);
    }
  });
});

/**
 * Recorded by running draw.io 32.7.4's own mxGraphView/mxEdgeStyle/mxPerimeter
 * code with Graph.js and Shapes.js overrides (scale 1, model coordinates) on
 * the same input.
 */
describe('recorded from draw.io', () => {
  const plainEdge = '';

  it('roundedPerimeter=1 ends on the rounded corner', () => {
    const a = box('a', 0, 0, 100, 60, 'rounded=1;roundedPerimeter=1');
    expectPoints(route(plainEdge, a, null, { targetPoint: { x: 300, y: 180 } }),
      [[96.66103384933308, 57.99662030959985], [300, 180]], 9);
    // Without roundedPerimeter the corner itself
    expectPoints(route(plainEdge, box('a', 0, 0, 100, 60, 'rounded=1'), null, { targetPoint: { x: 300, y: 180 } }),
      [[100, 60], [300, 180]], 9);
  });

  it('rounded perimeter with an orthogonal route', () => {
    const a = box('a', 0, 0, 100, 60, 'rounded=1;roundedPerimeter=1;absoluteArcSize=1;arcSize=40');
    expectPoints(route('edgeStyle=orthogonalEdgeStyle', a, box('b', 200, 200, 80, 40)), [[100, 30], [240, 30], [240, 200]], 9);
  });

  it('a stencil with a fixed aspect routes to the box it fills', () => {
    const a: TerminalView = { ...box('a', 0, 0, 100, 60), stencil: true, stencilAspect: { width: 30, height: 20 } };
    expectPoints(route(plainEdge, a, null, { targetPoint: { x: 300, y: 180 } }), [[95, 57], [300, 180]], 9);
  });

  it('multiple=1 ends on the copies behind the shape', () => {
    expectPoints(route(plainEdge, box('a', 0, 0, 100, 60, 'multiple=1'), null, { targetPoint: { x: 300, y: -100 } }),
      [[116.00011891240148, -4.320061834448769], [300, -100]], 9);
  });

  it('a sequence self-call on one lifeline', () => {
    const a: TerminalView = { ...box('a', 0, 0, 10, 100), lifeline: 'L' };
    const b: TerminalView = { ...box('b', 0, 150, 10, 50), lifeline: 'L' };
    expectPoints(route('edgeStyle=sequenceEdgeStyle', a, b), [[10, 50], [40, 50], [40, 80], [10, 161.42857142857142]], 9);
  });

  it('entity relation from a relative port on the left', () => {
    const a: TerminalView = { ...box('a', 0, 0, 100, 20), relativeX: 0 };
    expectPoints(route('edgeStyle=entityRelationEdgeStyle', a, box('b', 300, 100, 100, 20)),
      [[0, 10], [-30, 10], [-30, 110], [300, 110]], 9);
  });

  it('orthogonal routes around rotated terminals and with jettySize=auto', () => {
    expectPoints(route('edgeStyle=orthogonalEdgeStyle', box('a', 0, 0, 100, 40, 'rotation=90'), box('b', 200, 150, 100, 40)),
      [[70, 20], [250, 20], [250, 150]], 9);
    expectPoints(route('edgeStyle=orthogonalEdgeStyle;jettySize=auto;exitX=1;exitY=0.5;entryX=0;entryY=0.5',
      box('a', 0, 0, 100, 40), box('b', 120, 150, 100, 40)),
    [[100, 20], [120, 20], [120, 95], [100, 95], [100, 170], [120, 170]], 9);
  });

  it('an orthogonal loop with ports', () => {
    const a = box('a', 100, 100, 100, 40);
    expectPoints(route('edgeStyle=orthogonalEdgeStyle;orthogonalLoop=1;exitX=1;exitY=0.5;entryX=0.5;entryY=0', a, a),
      [[200, 120], [210, 120], [210, 150], [150, 150], [150, 100]], 9);
  });
});

describe('edge labels', () => {
  const line: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it('x = -1, 0, 1 along the route', () => {
    expect(edgeLabelPoint(line, { x: -1, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(edgeLabelPoint(line, { x: 0, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(edgeLabelPoint(line, { x: 1, y: 0 })).toEqual({ x: 100, y: 0 });
  });

  it('y offsets are perpendicular and the offset is added', () => {
    // Left to right: y = 10 is above the line (draw.io subtracts the normal)
    expect(edgeLabelPoint(line, { x: 0, y: 10 })).toEqual({ x: 50, y: -10 });
    expect(edgeLabelPoint(line, { x: 0, y: 10, offset: { x: 5, y: 5 } })).toEqual({ x: 55, y: -5 });
  });

  it('distances along the route are rounded to whole units', () => {
    // (0.5 - 0.1665) * 100 = 33.35 rounds to 33
    expect(edgeLabelPoint(line, { x: -0.333, y: 0 })).toEqual({ x: 33, y: 0 });
  });

  it('multi-segment routes', () => {
    const bent: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(edgeLabelPoint(bent, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(edgeLabelPoint(bent, { x: 0, y: 10 })).toEqual({ x: 110, y: 0 });
    expect(edgeLabelPoint(bent, { x: 0.5, y: 0 })).toEqual({ x: 100, y: 50 });
    expect(edgeLabelPoint(bent, { x: -0.5, y: -10 })).toEqual({ x: 50, y: 10 });
  });

  it('the edge label of the edge itself', () => {
    expect(edgeOwnLabelPoint(line, { x: 0, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(edgeOwnLabelPoint(line, { x: 0.5, y: -20, offset: { x: 0, y: 3 } })).toEqual({ x: 75, y: 23 });
    // Absolute geometry: the middle between the ends plus the offset
    expect(edgeOwnLabelPoint([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      { x: 0, y: 0, offset: { x: 1, y: 2 }, relative: false })).toEqual({ x: 51, y: 2 });
  });

  it('relativePointOnRoute inverts edgeLabelPoint', () => {
    expect(relativePointOnRoute(line, { x: 75, y: -10 })).toEqual({ x: 0.5, y: 10 });
    const bent: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const rel = relativePointOnRoute(bent, { x: 110, y: 50 });
    expect(rel.x).toBeCloseTo(0.5, 9);
    expect(rel.y).toBeCloseTo(10, 9);
    expect(edgeLabelPoint(bent, rel)).toEqual({ x: 110, y: 50 });
  });

  it('curveGeometry=1 follows the painted curve', () => {
    const style = resolveStyle('curved=1;curveGeometry=1', 'edge');
    const p = edgeLabelPoint([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], { x: 0, y: 0 }, style);
    // The quadratic through (50, 50) peaks at (50, 25)
    expect(p.x).toBeCloseTo(50, 0);
    expect(p.y).toBeCloseTo(25, 0);
  });
});
