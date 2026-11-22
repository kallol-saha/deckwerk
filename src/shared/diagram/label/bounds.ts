/*
 * Ported from draw.io (jgraph/drawio 32.7.4):
 * mxgraph/src/view/mxGraphView.js (updateCellState's absolute offset,
 * updateVertexLabelOffset) and mxgraph/src/view/mxCellRenderer.js
 * (getLabelBounds, getShapeLabelBounds, rotateLabelBounds).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: works on a box and a style instead of a cell
 * state; returns the label box with its rotation instead of setting
 * mxText.bounds.
 */

import type { Point, Rect, Style } from '../types.js';
import { shapeLabelBounds } from './shapes.js';
import {
  alignmentPoint, looseEq, jsValue, numberValue, rotatePoint, textProps, textRotation, textSpacing,
  unscale, type TextProps,
} from './text.js';

/**
 * Where draw.io lays a label out: `anchor` is mxText.bounds.x/y (the point
 * the text is aligned to, already turned about the cell centre), `width`
 * and `height` are mxText.bounds.width/height (the area the text wraps
 * and clips in), `margin` the alignment as a fraction of that area.
 */
export interface LabelGeometry {
  text: TextProps;
  /** Anchor before the rotation about `center`. */
  anchor: Point;
  /** Anchor as draw.io paints it (anchor turned by `rotation` about `center`). */
  paintAnchor: Point;
  width: number;
  height: number;
  margin: Point;
  rotation: number;
  center: Point;
  scale: number;
}

export interface VertexLabelOptions {
  /** mxGeometry.offset of the vertex, in draw.io units. */
  offset?: Point | null;
  /**
   * Leaves the style's `rotation` out (the caller turns the whole vertex,
   * label included, about the vertex centre). horizontal=0 still turns the text.
   */
  ignoreRotation?: boolean;
  /**
   * For a label cell on an edge: the angle in degrees of the edge at the
   * cell (Graph.getEdgeLabelAngle), used when the style has labelAutoRotate=1.
   */
  edgeAngle?: number | null;
  /** The page has math="1": TeX in an HTML label is typeset (mathLabel.ts). */
  math?: boolean;
  /** An HTML label carries draw.io's SVG <text> fallback (standalone SVG export). */
  textFallback?: boolean;
}

export interface EdgeLabelOptions {
  /** mxGeometry width/height of the edge, in draw.io units (0 for nearly every edge). */
  width?: number;
  height?: number;
  /**
   * Angle in degrees of the edge at the label (Graph.getEdgeLabelAngle),
   * used when the style has labelAutoRotate=1.
   */
  edgeAngle?: number | null;
  /** The page has math="1": TeX in an HTML label is typeset (mathLabel.ts). */
  math?: boolean;
  /** An HTML label carries draw.io's SVG <text> fallback (standalone SVG export). */
  textFallback?: boolean;
}

/**
 * mxGraphView.updateVertexLabelOffset, mxCellRenderer.getLabelBounds and
 * rotateLabelBounds for a vertex whose box (state.x/y/width/height) is
 * `bounds`, at view scale `scale`.
 *
 * draw.io's editor and viewer paint in model coordinates
 * (mxGraphView.modelCoordinates, Editor.fastRendering), so the minimum
 * label size is one model unit and the shape's label bounds are computed
 * in model units and scaled back (getShapeLabelBounds); this does the same,
 * which keeps the result linear in the scale.
 */
export function vertexLabelGeometry(style: Style, bounds: Rect, scale: number, options: VertexLabelOptions = {}): LabelGeometry {
  const t = textProps(style, 'vertex');
  const s = scale;
  const state = bounds;

  // mxGraphView.updateCellState + updateVertexLabelOffset
  const offset = { x: s * (options.offset?.x ?? 0), y: s * (options.offset?.y ?? 0) };
  const hpos = style.labelPosition ?? 'center';
  const vpos = style.verticalLabelPosition ?? 'middle';
  const lwValue = style.labelWidth != null ? parseFloat(style.labelWidth) : null;
  const lw = lwValue != null && Number.isFinite(lwValue) ? lwValue : null;
  if (hpos === 'left') {
    offset.x -= lw != null ? lw * s : state.width;
  } else if (hpos === 'right') {
    offset.x += state.width;
  } else if (hpos === 'center' && lw != null) {
    const align = style.align ?? 'center';
    const dx = align === 'center' ? 0.5 : align === 'right' ? 1 : 0;
    if (dx !== 0) offset.x -= (lw * s - state.width) * dx;
  }
  if (vpos === 'top') offset.y -= state.height;
  else if (vpos === 'bottom') offset.y += state.height;

  // mxCellRenderer.getLabelBounds
  let b: Rect = t.inverted ? { x: offset.y, y: offset.x, width: 0, height: 0 } : { x: offset.x, y: offset.y, width: 0, height: 0 };
  b.x += state.x;
  b.y += state.y;
  const min = s;
  b.width = Math.max(min, state.width);
  b.height = Math.max(min, state.height);
  if (t.inverted) {
    const d = (state.width - state.height) / 2;
    b.x += d;
    b.y -= d;
    [b.width, b.height] = [b.height, b.width];
  }
  if (hpos === 'center' && vpos === 'middle') {
    // mxCellRenderer.getShapeLabelBounds in model units
    const model = shapeLabelBounds(style, {
      x: unscale(b.x, s), y: unscale(b.y, s), width: unscale(b.width, s), height: unscale(b.height, s),
    }, { scale: 1, inverted: t.inverted });
    b = { x: model.x * s, y: model.y * s, width: model.width * s, height: model.height * s };
  }
  if (lw != null) b.width = lw * s;

  // mxCellRenderer.rotateLabelBounds
  const m = alignmentPoint(t.align, t.valign);
  b.y -= m.y * b.height;
  b.x -= m.x * b.width;
  const overflow = style.overflow;
  const blockSpacing = looseEq(jsValue(style, 'blockSpacing'), '1');
  if (overflow !== 'fill' && overflow !== 'width' && (overflow !== 'block' || blockSpacing)) {
    const spacing = textSpacing(t, blockSpacing, m);
    b.x += spacing.x * s;
    b.y += spacing.y * s;
    b.width = Math.max(0, b.width - (hpos === 'center' && lw == null ? t.spacingLeft * s + t.spacingRight * s : 0));
    b.height = Math.max(0, b.height - (vpos === 'middle' ? t.spacingTop * s + t.spacingBottom * s : 0));
  }
  const rotation = textRotation(style, 'vertex', { ignoreRotation: options.ignoreRotation, edgeAngle: options.edgeAngle });
  const center = { x: state.x + state.width / 2, y: state.y + state.height / 2 };
  const anchor = { x: b.x, y: b.y };
  const paintAnchor = rotation !== 0 && (anchor.x !== center.x || anchor.y !== center.y)
    ? rotatePoint(anchor, rotation, center) : anchor;
  return { text: t, anchor, paintAnchor, width: b.width, height: b.height, margin: m, rotation, center, scale: s };
}

/**
 * mxCellRenderer.getLabelBounds for an edge: the label is aligned to the
 * point mxGraphView.updateEdgeLabelOffset computed (`anchor`), moved by the
 * spacing; it has the edge geometry's size (normally 0, so the text is
 * aligned around the point) and is not shrunk by the spacing.
 */
export function edgeLabelGeometry(style: Style, anchor: Point, scale: number, options: EdgeLabelOptions = {}): LabelGeometry {
  const t = textProps(style, 'edge');
  const s = scale;
  const spacing = textSpacing(t, false, null);
  const x = anchor.x + spacing.x * s;
  const y = anchor.y + spacing.y * s;
  let width = Math.max(0, (options.width ?? 0) * s);
  const height = Math.max(0, (options.height ?? 0) * s);
  if (style.labelWidth != null) width = numberValue(style, 'labelWidth', 0) * s;
  const rotation = textRotation(style, 'edge', { edgeAngle: options.edgeAngle });
  const point = { x, y };
  return {
    text: t, anchor: point, paintAnchor: point, width, height,
    margin: alignmentPoint(t.align, t.valign), rotation, center: point, scale: s,
  };
}

/** The label area (mxText.bounds moved by its alignment), before the rotation. */
export function labelBox(g: LabelGeometry): Rect {
  return {
    x: g.anchor.x + g.margin.x * g.width,
    y: g.anchor.y + g.margin.y * g.height,
    width: g.width,
    height: g.height,
  };
}
