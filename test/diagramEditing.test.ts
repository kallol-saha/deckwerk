import { describe, expect, it } from 'vitest';
import type { ConnectorEl, Slide, VertexEl } from '../src/shared/deck.js';
import { SlideSchema } from '../src/shared/deck.js';
import {
  HOVER, applyNewEdgeStyle, bendPreviewPoints, connectTarget, delayedSelectionCell,
  directionalDistance, gridLineDistance, gridTileSvg, pastedStyle, pickerEntries, snapDeltaToGrid, snapToGridLine, vertexHitAt,
  libraryPickerEntries, outlineConstraint, outlineDistance, shapeNameOf,
  detachedForMove, dropClonePlacement, dropTarget, edgeHandlerKind, edgeHandles, flippedElbow,
  hoverArrowRects, hoverStep, initialCell, labelAnchor, labelGeometryAt, nearestConnectionPoint,
  removableWaypoint, routeCorners, segmentCurrentPoints, segmentDragPoints, segmentHintPoints,
  snapToPoints, storedPoint, terminalLook, vertexConnectionPoints, visibleArrows, withConnectionConstraint,
  type HoverMemory,
} from '../src/shared/diagram/editing.js';
import { DEFAULT_EDGE_STYLE, addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { rerouted } from '../src/shared/diagram/element.js';
import { isValidDropTarget } from '../src/shared/diagram/structure.js';
import { getStyleValue, setStyleValue } from '../src/shared/diagram/style.js';
import { PALETTES } from '../src/shared/diagram/library/index.js';
import { CELL_STYLES } from '../src/shared/diagram/format.js';

let counter = 0;
const makeId = (prefix: string) => `${prefix}-${++counter}`;

/** A slide whose diagram is placed at `scale` (pinned: new diagrams' default scale may change). */
function emptySlide(scale = 1): Slide {
  return SlideSchema.parse({
    id: 'slide-1',
    name: 'Slide 1',
    diagrams: { 'diagram-1': { name: 'Page-1', model: {}, root: '0', layers: [{ cell: '1', label: '', dio: '' }], origin: { x: 0, y: 0 }, scale } },
  });
}

function vertex(slide: Slide, x: number, y: number, w = 120, h = 60, dio = 'rounded=0;whiteSpace=wrap;html=1;', parent?: string): VertexEl {
  const made = newVertex(slide, { dio, x, y, w, h, parent }, makeId);
  addCells(slide, [made]);
  return made.element;
}

function connect(slide: Slide, source: VertexEl | null, target: VertexEl | null, extra: Partial<Parameters<typeof newConnector>[1]> = {}): ConnectorEl {
  const made = newConnector(slide, { source: source?.id ?? null, target: target?.id ?? null, ...extra }, makeId);
  addCells(slide, [made]);
  return made.element;
}

const finder = (slide: Slide) => (id: string) => slide.elements.find((el): el is VertexEl => el.type === 'vertex' && el.id === id);

describe('hover arrows', () => {
  it('sit around the shape where draw.io puts them', () => {
    const rects = hoverArrowRects({ x: 100, y: 100, width: 120, height: 60 }, { x: 160, y: 130 }, 1);
    // bounds grown by the tolerance (4) and the spacing (2)
    expect(rects.north).toEqual({ x: 151, y: 66, width: 18, height: 28 });
    expect(rects.east).toEqual({ x: 226, y: 121, width: 26, height: 18 });
    expect(rects.south).toEqual({ x: 151, y: 166, width: 18, height: 26 });
    expect(rects.west).toEqual({ x: 66, y: 121, width: 28, height: 18 });
  });

  it('keep their screen size when zoomed', () => {
    const rects = hoverArrowRects({ x: 100, y: 100, width: 120, height: 60 }, { x: 160, y: 130 }, 2);
    expect(rects.east.width).toBe(13);
    expect(rects.east.height).toBe(9);
    // 6 screen px outside the shape, on the right
    expect(rects.east.x).toBe(223);
  });

  it('hide beside a neighbour unless it is much bigger or behind them all', () => {
    const none = { north: null, east: null, south: null, west: null };
    expect(visibleArrows({ w: 100, h: 50 }, none)).toEqual({ north: true, east: true, south: true, west: true });
    const small = { id: 'b', w: 100, h: 50, ignore: false };
    expect(visibleArrows({ w: 100, h: 50 }, { ...none, east: small }).east).toBe(false);
    const huge = { id: 'b', w: 400, h: 400, ignore: false };
    expect(visibleArrows({ w: 100, h: 50 }, { ...none, east: huge }).east).toBe(true);
    const behind = { id: 'b', w: 150, h: 100, ignore: false };
    expect(visibleArrows({ w: 100, h: 50 }, { north: behind, east: behind, south: behind, west: behind }).east).toBe(true);
  });

  it('follow draw.io timing: 140 ms on a shape to show, 500 ms to switch inside the box', () => {
    let memory: HoverMemory = { prev: null, startTime: null, current: null };
    let step = hoverStep(memory, 'a', 0, null);
    expect(step.show).toBeUndefined();
    expect(step.armTimer).toBe(true);
    memory = step.memory;
    step = hoverStep(memory, 'a', 100, null);
    expect(step.show).toBeUndefined();
    memory = step.memory;
    step = hoverStep(memory, 'a', HOVER.activationDelay + 10, null);
    expect(step.show).toBe('a');
    memory = step.memory;
    // onto another shape while inside the arrows' box: kept until 500 ms
    step = hoverStep(memory, 'b', 1000, true);
    expect(step.show).toBeUndefined();
    memory = step.memory;
    step = hoverStep(memory, 'b', 1000 + HOVER.updateDelay + 1, true);
    expect(step.show).toBe('b');
    memory = step.memory;
    // off any shape and out of the box: hidden at once
    step = hoverStep(memory, null, 3000, false);
    expect(step.show).toBeNull();
    expect(step.memory.current).toBeNull();
  });
});

describe('cloning in a direction (connectVertex)', () => {
  it('puts the clone the default edge length away, centred on the side', () => {
    const box = { x: 100, y: 100, width: 120, height: 60 };
    expect(connectTarget(box, 'east', 80)).toEqual({ probe: { x: 300, y: 130 }, clone: { x: 300, y: 100, width: 120, height: 60 } });
    expect(connectTarget(box, 'south', 80).clone).toEqual({ x: 100, y: 240, width: 120, height: 60 });
    expect(connectTarget(box, 'west', 80).clone).toEqual({ x: -100, y: 100, width: 120, height: 60 });
    expect(connectTarget(box, 'north', 80).clone).toEqual({ x: 100, y: -40, width: 120, height: 60 });
  });

  it('drops a clone centred on the pointer, aligned with the source when close', () => {
    const frame = { origin: { x: 0, y: 0 }, scale: 1 };
    const box = dropClonePlacement({ x: 100, y: 100, width: 120, height: 60 }, { x: 500, y: 132 }, frame);
    expect(box).toEqual({ x: 440, y: 100, width: 120, height: 60 });
  });

  it('applies the source newEdgeStyle', () => {
    const dio = applyNewEdgeStyle(DEFAULT_EDGE_STYLE, { dio: 'rounded=0;newEdgeStyle={"edgeStyle":"elbowEdgeStyle","endArrow":"none"};' }, 'south');
    expect(getStyleValue(dio, 'edgeStyle')).toBe('elbowEdgeStyle');
    expect(getStyleValue(dio, 'endArrow')).toBe('none');
    expect(getStyleValue(dio, 'elbow')).toBe('vertical');
  });
});

describe('connection points', () => {
  it('are a rectangle’s draw.io points, on its outline', () => {
    const slide = emptySlide();
    const v = vertex(slide, 100, 100, 120, 60);
    const points = vertexConnectionPoints(v);
    expect(points.length).toBe(16);
    expect(points.some((p) => p.at.x === 220 && p.at.y === 130)).toBe(true);
    expect(points.every((p) => p.at.x >= 100 && p.at.x <= 220 && p.at.y >= 100 && p.at.y <= 160)).toBe(true);
  });

  it('take the style’s points= list', () => {
    const slide = emptySlide();
    const v = vertex(slide, 0, 0, 100, 100, 'points=[[0,0.5],[1,0.5]];');
    expect(vertexConnectionPoints(v).map((p) => p.at)).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }]);
  });

  it('are picked within the tolerance, nearest first', () => {
    const points = [{ x: 10, y: 10 }, { x: 20, y: 10 }];
    expect(nearestConnectionPoint(points, { x: 12, y: 11 }, 1)).toBe(0);
    expect(nearestConnectionPoint(points, { x: 17, y: 10 }, 1)).toBe(1);
    expect(nearestConnectionPoint(points, { x: 40, y: 40 }, 1)).toBe(-1);
    // the tolerance is on screen: at 4x zoom a slide pixel is four screen pixels
    expect(nearestConnectionPoint(points, { x: 13, y: 10 }, 4)).toBe(-1);
  });

  it('are written as draw.io writes them, and removed for a floating end', () => {
    let dio = withConnectionConstraint(DEFAULT_EDGE_STYLE, true, { x: 1, y: 0.5, perimeter: true, dx: 0, dy: 0 });
    expect(dio.endsWith('exitX=1;exitY=0.5;exitDx=0;exitDy=0;')).toBe(true);
    dio = withConnectionConstraint(dio, false, { x: 0, y: 0, perimeter: false, dx: 0, dy: 0 });
    expect(getStyleValue(dio, 'entryPerimeter')).toBe('0');
    dio = withConnectionConstraint(dio, true, null);
    expect(getStyleValue(dio, 'exitX')).toBeNull();
    expect(getStyleValue(dio, 'exitDx')).toBeNull();
    expect(getStyleValue(dio, 'entryX')).toBe('0');
  });
});

describe('edge handles', () => {
  it('give a straight connector its waypoints and virtual bends', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 400, 0, 100, 50);
    const c = connect(slide, a, b, { dio: 'html=1;endArrow=classic;', points: [{ x: 250, y: 150 }] });
    expect(edgeHandlerKind(c)).toBe('default');
    const handles = edgeHandles(c);
    expect(handles.filter((h) => h.kind === 'terminal')).toHaveLength(2);
    expect(handles.filter((h) => h.kind === 'bend').map((h) => h.at)).toEqual([{ x: 250, y: 150 }]);
    expect(handles.filter((h) => h.kind === 'virtual')).toHaveLength(2);
    expect(terminalLook(c, true)).toBe('terminal');
    expect(terminalLook({ ...c, source: null }, true)).toBe('loose');
    expect(terminalLook({ ...c, dio: withConnectionConstraint(c.dio, true, { x: 1, y: 0.5 }) }, true)).toBe('fixed');
  });

  it('give an orthogonal connector a handle per segment', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 300, 200, 100, 50);
    const c = connect(slide, a, b);
    expect(edgeHandlerKind(c)).toBe('segment');
    const segments = edgeHandles(c).filter((h) => h.kind === 'segment');
    expect(segments).toHaveLength(c.route.length - 1);
    // a straight orthogonal edge gets a middle handle between two faint ones
    const straight = connect(slide, a, vertex(slide, 300, 0, 100, 50));
    expect(segmentCurrentPoints(straight.route)).toHaveLength(4);
    const handles = edgeHandles(straight).filter((h) => h.kind === 'segment');
    expect(handles.map((h) => Boolean(h.faint))).toEqual([true, false, true]);
  });

  it('give an elbow connector one handle and flip it', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 300, 200, 100, 50);
    const c = connect(slide, a, b, { dio: 'edgeStyle=elbowEdgeStyle;html=1;' });
    expect(edgeHandlerKind(c)).toBe('elbow');
    expect(edgeHandles(c).filter((h) => h.kind === 'elbow')).toHaveLength(1);
    expect(getStyleValue(flippedElbow(c.dio), 'elbow')).toBe('vertical');
    expect(getStyleValue(flippedElbow('elbow=vertical;'), 'elbow')).toBe('horizontal');
  });
});

describe('dragging waypoints', () => {
  const route = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
  const boxes = route.map((p) => ({ x: p.x - 9, y: p.y - 9, width: 18, height: 18 }));

  it('inserts a waypoint from a virtual bend', () => {
    const points = bendPreviewPoints({ points: [{ x: 100, y: 100 }], route, virtual: 1, pointer: { x: 150, y: 120 }, bendBoxes: boxes, tolerance: 4 });
    expect(points).toEqual([{ x: 100, y: 100 }, { x: 150, y: 120 }]);
  });

  it('adds the first waypoint to an edge without any', () => {
    const points = bendPreviewPoints({ points: [], route: [route[0], route[2]], virtual: 0, pointer: { x: 100, y: 60 }, bendBoxes: [boxes[0], boxes[2]], tolerance: 4 });
    expect(points).toEqual([{ x: 100, y: 60 }]);
  });

  it('moves a waypoint, and removes it on a neighbour or when the segment is straight', () => {
    const base = { points: [{ x: 100, y: 100 }], route, bend: 1, bendBoxes: boxes, tolerance: 4 };
    expect(bendPreviewPoints({ ...base, pointer: { x: 120, y: 80 } })).toEqual([{ x: 120, y: 80 }]);
    expect(bendPreviewPoints({ ...base, pointer: { x: 199, y: 2 } })).toEqual([]);
    expect(bendPreviewPoints({ ...base, pointer: { x: 100, y: 2 } })).toEqual([]);
    // Alt keeps a straightened point
    expect(bendPreviewPoints({ ...base, pointer: { x: 100, y: 2 }, alt: true })).toEqual([{ x: 100, y: 2 }]);
  });

  it('removes a waypoint on double-click only for inner route points', () => {
    expect(removableWaypoint(route, [{ x: 100, y: 100 }], 1)).toBe(0);
    expect(removableWaypoint(route, [{ x: 100, y: 100 }], 0)).toBe(-1);
    expect(removableWaypoint(route, [{ x: 100, y: 100 }], 2)).toBe(-1);
  });

  it('snaps to terminals and rounds as draw.io stores points', () => {
    expect(snapToPoints({ x: 101, y: 47 }, [{ x: 100, y: 0 }], 2).point).toEqual({ x: 100, y: 47 });
    expect(storedPoint({ x: 10.123456, y: 5.5551 }, { origin: { x: 0, y: 0 }, scale: 1 })).toEqual({ x: 10.12, y: 5.56 });
    expect(storedPoint({ x: 30, y: 20 }, { origin: { x: 10, y: 10 }, scale: 2 })).toEqual({ x: 30, y: 20 });
  });
});

describe('dragging segments', () => {
  it('moves the segment under the handle across, keeping the others', () => {
    const route = [{ x: 0, y: 25 }, { x: 150, y: 25 }, { x: 150, y: 225 }, { x: 300, y: 225 }];
    const hint = segmentHintPoints(route, 2, { x: 200, y: 120 });
    expect(hint).toEqual([{ x: 200, y: 25 }, { x: 200, y: 225 }]);
    expect(routeCorners([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }])).toEqual([{ x: 100, y: 0 }]);
  });

  it('stores the moved route’s corners as waypoints', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 300, 200, 100, 50);
    const c = connect(slide, a, b);
    expect(c.route.length).toBeGreaterThanOrEqual(3);
    // a vertical segment of the route, moved to x = 260
    const index = c.route.findIndex((p, i) => i > 0 && Math.abs(p.x - c.route[i - 1].x) < 1 && Math.abs(p.y - c.route[i - 1].y) > 1);
    expect(index).toBeGreaterThan(0);
    const points = segmentDragPoints(c, index, { x: 260, y: 120 }, finder(slide));
    expect(points.length).toBeGreaterThan(0);
    const moved = rerouted({ ...c, points }, finder(slide));
    const vertical = moved.route.findIndex((p, i) => i > 0 && p.x === 260 && moved.route[i - 1].x === 260);
    expect(vertical).toBeGreaterThan(0);
    // the waypoints are the moved route's corners
    expect(routeCorners(moved.route)).toEqual(points);
  });

  it('drops the waypoints when the edge routes the same without them', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 300, 200, 100, 50);
    const c = connect(slide, a, b);
    const index = c.route.findIndex((p, i) => i > 0 && Math.abs(p.x - c.route[i - 1].x) < 1 && Math.abs(p.y - c.route[i - 1].y) > 1);
    const x = c.route[index].x;
    expect(segmentDragPoints(c, index, { x, y: 120 }, finder(slide))).toEqual([]);
  });
});

describe('labels', () => {
  it('move to where they are dropped', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 400, 0, 100, 50);
    const c = { ...connect(slide, a, b, { dio: 'html=1;', label: 'yes' }) };
    const at = { x: 300, y: 60 };
    const geometry = labelGeometryAt(c, at);
    // 35 units off the line (draw.io's sign: negative below a left-to-right edge)
    expect(Math.abs(geometry.y)).toBe(35);
    const anchor = labelAnchor({ ...c, labelGeometry: { ...geometry } });
    expect(anchor!.x).toBeCloseTo(at.x, 0);
    expect(anchor!.y).toBeCloseTo(at.y, 0);
  });

  it('are placed in draw.io units at the diagram’s scale', () => {
    const slide = emptySlide(2);
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 400, 0, 100, 50);
    const c = connect(slide, a, b, { dio: 'html=1;', label: 'yes' });
    expect(c.scale).toBe(2);
    const geometry = labelGeometryAt(c, { x: 300, y: 65 });
    // 40 slide px off the line are 20 units
    expect(Math.abs(geometry.y)).toBe(20);
    const anchor = labelAnchor({ ...c, labelGeometry: { ...geometry } })!;
    expect(Math.abs(anchor.x - 300)).toBeLessThanOrEqual(1);
    expect(Math.abs(anchor.y - 65)).toBeLessThanOrEqual(1);
  });
});

describe('groups and containers', () => {
  function grouped() {
    const slide = emptySlide();
    const group = vertex(slide, 0, 0, 300, 100, 'group');
    const child = vertex(slide, 0, 0, 100, 100, 'rounded=0;', group.cell);
    const sibling = vertex(slide, 200, 0, 100, 100, 'rounded=0;', group.cell);
    return { slide, group, child, sibling };
  }

  it('select the group first, then the child', () => {
    const { slide, group, child, sibling } = grouped();
    expect(initialCell(slide.elements, child, new Set()).id).toBe(group.id);
    expect(delayedSelectionCell(slide.elements, child, new Set([group.id]))?.id).toBe(child.id);
    // a sibling already selected: the click stays on the child
    expect(initialCell(slide.elements, child, new Set([sibling.id])).id).toBe(child.id);
  });

  it('do not climb out of a swimlane', () => {
    const slide = emptySlide();
    const lane = vertex(slide, 0, 0, 300, 200, 'swimlane;');
    const child = vertex(slide, 20, 40, 100, 50, 'rounded=0;', lane.cell);
    expect(initialCell(slide.elements, child, new Set()).id).toBe(child.id);
  });

  it('take dropped shapes when they are containers (or a grouped shape’s group)', () => {
    const { slide, group, child } = grouped();
    const container = vertex(slide, 0, 0, 300, 200, 'rounded=0;container=1;');
    const plain = vertex(slide, 400, 0, 100, 100, 'rounded=0;');
    const moving = vertex(slide, 50, 50, 50, 50);
    const valid = (cells: VertexEl[]) => (cell: VertexEl) => isValidDropTarget(slide, cell, cells);
    expect(dropTarget(slide.elements, container, new Set([moving.id]), valid([moving]))?.id).toBe(container.id);
    expect(dropTarget(slide.elements, plain, new Set([moving.id]), valid([moving]))).toBeNull();
    // onto a grouped shape: into its group
    expect(dropTarget(slide.elements, child, new Set([moving.id]), valid([moving]))?.id).toBe(group.id);
    // never into itself
    expect(dropTarget(slide.elements, container, new Set([container.id]), valid([container]))).toBeNull();
  });
});

describe('the grid', () => {
  it('draws draw.io’s tile: four minor steps, doubled when too fine on screen', () => {
    expect(gridLineDistance(10, 1, 1)).toBe(10);
    expect(gridLineDistance(10, 1, 0.3)).toBe(6);
    const { tile, svg } = gridTileSvg(10, 2, 0.5);
    // 10 units at scale 2 is 20 slide px = 10 screen px: a tile of 4 x 20 slide px
    expect(tile).toBe(80);
    expect(svg).toContain('opacity="0.2"');
    expect(svg).toContain('stroke="#e6e6e6"');
  });

  it('snaps a move the way mxGraph.snapDelta does', () => {
    // a box on the grid moved by 37 px with a 20 px grid lands 40 px on
    expect(snapDeltaToGrid(37, 100, 0, 20)).toBe(40);
    // within half a step of not moving: it stays
    expect(snapDeltaToGrid(6, 100, 0, 20)).toBe(0);
    // a box off the grid is brought onto it
    expect(105 + snapDeltaToGrid(30, 105, 0, 20)).toBe(140);
    expect(snapToGridLine(33, 3, 10)).toBe(33);
    expect(snapToGridLine(37, 0, 10)).toBe(40);
  });
});

describe('the shape picker', () => {
  it('offers the source first, then draw.io’s basic shapes', () => {
    const slide = emptySlide(2);
    const v = vertex(slide, 0, 0, 240, 120, 'rounded=0;fillColor=#dae8fc;');
    const entries = pickerEntries(v, false);
    expect(entries).toHaveLength(16);
    expect(entries[0]).toMatchObject({ style: v.dio, width: 120, height: 60 });
    expect(entries[2].style.startsWith('ellipse;')).toBe(true);
    expect(pickerEntries(v, true)).toHaveLength(4);
    expect(pickerEntries(null, false)[0].value).toBe('Text');
  });

  it('carries the source’s look over', () => {
    const dio = pastedStyle('ellipse;whiteSpace=wrap;html=1;', { fillColor: '#dae8fc', strokeColor: '#6c8ebf', shape: 'rect' }, ['fillColor', 'strokeColor']);
    expect(getStyleValue(dio, 'fillColor')).toBe('#dae8fc');
    expect(getStyleValue(dio, 'shape')).toBeNull();
  });
});

describe('outline connect', () => {
  it('stores the dropped point as fractions of the bounds, not projected', () => {
    const slide = emptySlide(2);
    const v = vertex(slide, 100, 100, 240, 120);
    expect(outlineConstraint(v, { x: 340, y: 160 })).toEqual({ x: 1, y: 0.5, perimeter: false, dx: 0, dy: 0 });
    expect(outlineConstraint(v, { x: 160, y: 100 })).toMatchObject({ x: 0.25, y: 0 });
    // mirrored for a flipped shape
    const flipped = vertex(slide, 100, 100, 240, 120, 'rounded=0;flipH=1;');
    expect(outlineConstraint(flipped, { x: 160, y: 100 })).toMatchObject({ x: 0.75, y: 0 });
  });

  it('measures how far the pointer is from the outline', () => {
    const slide = emptySlide();
    const v = vertex(slide, 0, 0, 100, 100, 'ellipse;');
    expect(outlineDistance(v, { x: 100, y: 50 })).toBeCloseTo(0, 5);
    expect(outlineDistance(v, { x: 90, y: 50 })).toBeCloseTo(10, 5);
  });
});

describe('the library shape picker', () => {
  const firstVertexItem = (paletteId: string) => PALETTES.find((p) => p.id === paletteId)!.items
    .find((item) => item.cells.length === 1 && !item.cells[0].edge)!;

  it('offers the shapes of a non-basic library after the source', () => {
    const item = firstVertexItem('flowchart');
    const entries = libraryPickerEntries({ dio: item.cells[0].style }, PALETTES, [], CELL_STYLES)!;
    expect(entries).not.toBeNull();
    expect(entries.length).toBeGreaterThan(3);
    expect(entries.length).toBeLessThanOrEqual(15);
    expect(entries.some((e) => e.style === item.cells[0].style)).toBe(false);
    const flowStyles = new Set(PALETTES.find((p) => p.id === 'flowchart')!.items.map((i) => i.cells[0]?.style));
    expect(entries.every((e) => flowStyles.has(e.style))).toBe(true);
  });

  it('keeps the source’s changed look', () => {
    const item = firstVertexItem('flowchart');
    const dio = setStyleValue(item.cells[0].style, 'fillColor', '#ff0000');
    const entries = libraryPickerEntries({ dio }, PALETTES, [], CELL_STYLES)!;
    expect(entries.every((e) => getStyleValue(e.style, 'fillColor') === '#ff0000')).toBe(true);
  });

  it('falls back to the basic shapes for basic or unknown shapes', () => {
    expect(libraryPickerEntries({ dio: 'rounded=0;whiteSpace=wrap;html=1;' }, PALETTES, [], CELL_STYLES)).toBeNull();
    expect(libraryPickerEntries({ dio: 'shape=mxgraph.nowhere.thing;' }, PALETTES, [], CELL_STYLES)).toBeNull();
    expect(shapeNameOf('ellipse;shape=cloud;')).toBe('cloud');
  });
});

describe('keys and clicks', () => {
  it('measure the nearest cell in a direction as draw.io does', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 50 };
    const near = { left: 150, top: 0, right: 250, bottom: 50 };
    const far = { left: 400, top: 0, right: 500, bottom: 50 };
    const behind = { left: -200, top: 0, right: -100, bottom: 50 };
    expect(directionalDistance(a, near, 1, 0)!).toBeLessThan(directionalDistance(a, far, 1, 0)!);
    expect(directionalDistance(a, behind, 1, 0)).toBeNull();
  });

  it('do not pick a group in the gaps between its children', () => {
    const slide = emptySlide();
    const group = vertex(slide, 0, 0, 300, 100, 'group');
    const box = vertex(slide, 0, 0, 100, 100, 'rounded=0;');
    expect(vertexHitAt(group, { x: 150, y: 50 }, 4)).toBe(false);
    expect(vertexHitAt(box, { x: 50, y: 50 }, 4)).toBe(true);
    const outline = vertex(slide, 0, 0, 100, 100, 'fillColor=none;pointerEvents=0;');
    expect(vertexHitAt(outline, { x: 50, y: 50 }, 4)).toBe(false);
    expect(vertexHitAt(outline, { x: 1, y: 50 }, 4)).toBe(true);
  });
});

describe('moving a connector', () => {
  it('detaches it from shapes that stay behind', () => {
    const slide = emptySlide();
    const a = vertex(slide, 0, 0, 100, 50);
    const b = vertex(slide, 400, 0, 100, 50);
    const c = connect(slide, a, b);
    const alone = detachedForMove(c, new Set([c.id]), slide.elements)!;
    expect(alone.source).toBeNull();
    expect(alone.target).toBeNull();
    expect(alone.sourcePoint).toEqual(c.route[0]);
    expect(alone.targetPoint).toEqual(c.route[c.route.length - 1]);
    // moved with one of its shapes: only the other end comes loose
    const half = detachedForMove(c, new Set([c.id, a.id]), slide.elements)!;
    expect(half.source).toBe(a.id);
    expect(half.target).toBeNull();
    expect(detachedForMove(c, new Set([c.id, a.id, b.id]), slide.elements)).toBeNull();
  });
});
