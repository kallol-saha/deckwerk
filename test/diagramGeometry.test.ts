import { describe, expect, it } from 'vitest';
import {
  DIRECTION_MASK_ALL, DIRECTION_MASK_EAST, DIRECTION_MASK_NORTH, DIRECTION_MASK_SOUTH, DIRECTION_MASK_WEST,
  findNearestSegment, getBoundingBox, getDirectedBounds, getPerimeterPoint, getPortConstraints, getRotatedPoint, getValue,
  intersection, ptSegDistSq, relativeCcw, reversePortConstraints, styleValue, unscale,
} from '../src/shared/diagram/geometry.js';
import { PERIMETERS, getPerimeterFunction, roundedRectanglePerimeter } from '../src/shared/diagram/perimeter.js';
import { EDGE_STYLES, getJettySize, roundScaled } from '../src/shared/diagram/edgeStyle.js';
import { resolveStyle } from '../src/shared/diagram/style.js';

/** The mxUtils helpers the routing code is built on (ported from draw.io). */

describe('style values as draw.io types them', () => {
  it('numeric strings become numbers, the rest stay strings', () => {
    const style = { a: '1', b: '0.5', c: 'north', d: '0x10', e: '' };
    expect(styleValue(style, 'a')).toBe(1);
    expect(styleValue(style, 'b')).toBe(0.5);
    expect(styleValue(style, 'c')).toBe('north');
    expect(styleValue(style, 'd')).toBe('0x10');
    expect(styleValue(style, 'e')).toBe('');
    expect(getValue(style, 'missing', 7)).toBe(7);
  });
});

describe('mxUtils geometry', () => {
  it('intersection of segments', () => {
    expect(intersection(0, 0, 10, 10, 0, 10, 10, 0)).toEqual({ x: 5, y: 5 });
    expect(intersection(0, 0, 1, 1, 5, 0, 6, 0)).toBeNull();
  });

  it('distances and sides', () => {
    expect(ptSegDistSq(0, 0, 10, 0, 5, 3)).toBe(9);
    expect(ptSegDistSq(0, 0, 10, 0, 13, 4)).toBe(25);
    expect(relativeCcw(0, 0, 10, 0, 5, 3)).toBe(-1);
    expect(relativeCcw(0, 0, 10, 0, 5, -3)).toBe(1);
    expect(relativeCcw(0, 0, 10, 0, 5, 0)).toBe(0);
    expect(findNearestSegment([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 12, 6)).toBe(1);
  });

  it('rotation and bounding boxes', () => {
    const p = getRotatedPoint({ x: 10, y: 0 }, 0, 1, { x: 0, y: 0 });
    expect(p).toEqual({ x: 0, y: 10 });
    const b = getBoundingBox({ x: 0, y: 0, width: 100, height: 50 }, 90)!;
    expect(b.x).toBeCloseTo(25, 9);
    expect(b.y).toBeCloseTo(-25, 9);
    expect(b.width).toBeCloseTo(50, 9);
    expect(b.height).toBeCloseTo(100, 9);
    expect(getBoundingBox({ x: 0, y: 0, width: 1, height: 1 }, 0)).toBeNull();
  });

  it('unscale rounds to a millionth', () => {
    expect(unscale(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundScaled(149.5, 1, 0)).toBe(150);
  });

  it('port constraints, rotated with portConstraintRotation', () => {
    const edge = { style: {} };
    expect(getPortConstraints({ style: {} }, edge, true, DIRECTION_MASK_ALL)).toBe(DIRECTION_MASK_ALL);
    expect(getPortConstraints({ style: { portConstraint: 'north' } }, edge, true, 0)).toBe(DIRECTION_MASK_NORTH);
    expect(getPortConstraints({ style: { portConstraint: 'north', portConstraintRotation: '1', rotation: '90' } }, edge, true, 0))
      .toBe(DIRECTION_MASK_EAST);
    expect(getPortConstraints({ style: {} }, { style: { targetPortConstraint: 'west' } }, false, 0)).toBe(DIRECTION_MASK_WEST);
    expect(reversePortConstraints(DIRECTION_MASK_NORTH | DIRECTION_MASK_EAST)).toBe(DIRECTION_MASK_SOUTH | DIRECTION_MASK_WEST);
  });

  it('directed bounds turn the margins with the direction', () => {
    expect(getDirectedBounds({ x: 0, y: 0, width: 100, height: 80 }, { x: 0, y: 0, width: 0, height: 30 }, {}))
      .toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(getDirectedBounds({ x: 0, y: 0, width: 100, height: 80 }, { x: 0, y: 0, width: 0, height: 30 }, { direction: 'south' }))
      .toEqual({ x: 30, y: 0, width: 70, height: 80 });
  });

  it('polygon perimeter points', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    expect(getPerimeterPoint(square, { x: 5, y: 5 }, { x: 20, y: 5 })).toEqual({ x: 10, y: 5 });
  });
});

describe('registries', () => {
  it('names every perimeter and edge style draw.io registers', () => {
    expect(Object.keys(PERIMETERS).sort()).toEqual([
      'backbonePerimeter', 'calloutPerimeter', 'centerPerimeter', 'cloudPerimeter', 'ellipsePerimeter', 'hexagonPerimeter',
      'hexagonPerimeter2', 'lifelinePerimeter', 'mermaidPersonPerimeter', 'orthogonalPerimeter', 'outlinePerimeter',
      'parallelogramPerimeter', 'rectanglePerimeter', 'rhombusPerimeter', 'stepPerimeter', 'trapezoidPerimeter', 'trianglePerimeter',
    ]);
    expect(Object.keys(EDGE_STYLES).sort()).toEqual([
      'elbowEdgeStyle', 'entityRelationEdgeStyle', 'isometricEdgeStyle', 'loopEdgeStyle', 'orthogonalEdgeStyle',
      'segmentEdgeStyle', 'sequenceEdgeStyle', 'sideToSideEdgeStyle', 'topToBottomEdgeStyle',
    ]);
    expect(PERIMETERS['constructor']).toBeUndefined();
  });

  it('rounded rectangles with roundedPerimeter=1 use the rounded perimeter', () => {
    const vertex = { x: 0, y: 0, width: 100, height: 60, style: resolveStyle('rounded=1;roundedPerimeter=1', 'vertex') };
    expect(getPerimeterFunction(vertex)).toBe(roundedRectanglePerimeter);
    expect(getPerimeterFunction({ ...vertex, style: resolveStyle('rounded=1', 'vertex') })).toBe(PERIMETERS.rectanglePerimeter);
  });

  it('jetty sizes', () => {
    expect(getJettySize({ style: {} }, true)).toBe(10);
    expect(getJettySize({ style: { jettySize: '25' } }, true)).toBe(25);
    expect(getJettySize({ style: { jettySize: '15', sourceJettySize: '5' } }, true)).toBe(5);
    // auto: the arrow size rounded up to tens plus a buffer, at least 20
    expect(getJettySize({ style: resolveStyle('jettySize=auto', 'edge') }, false)).toBe(20);
    expect(getJettySize({ style: resolveStyle('jettySize=auto;endSize=17', 'edge') }, false)).toBe(30);
    expect(getJettySize({ style: resolveStyle('jettySize=auto', 'edge') }, true)).toBe(20);
  });
});
