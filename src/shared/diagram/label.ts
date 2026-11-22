/*
 * Labels of draw.io cells: where they go and how they are drawn. Ported
 * from draw.io (jgraph/drawio 32.7.4): mxgraph/src/view/mxCellRenderer.js,
 * mxgraph/src/view/mxGraphView.js, mxgraph/src/shape/mxText.js,
 * mxgraph/src/shape/mxShape.js, mxgraph/src/util/mxSvgCanvas2D.js,
 * js/grapheditor/Graph.js and js/grapheditor/Shapes.js; the files under
 * ./label/ name the functions each part ports.
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: a DOM-free API over a style and a box; SVG is
 * returned as a string.
 */

import type { Point, Rect, Style } from './types.js';
import {
  edgeLabelGeometry, labelBox, vertexLabelGeometry, type EdgeLabelOptions, type LabelGeometry,
  type VertexLabelOptions,
} from './label/bounds.js';
import { htmlToText } from './label/html.js';
import { paintLabel } from './label/svg.js';
import { labelEnabled, textProps } from './label/text.js';

export type { EdgeLabelOptions, LabelGeometry, VertexLabelOptions } from './label/bounds.js';
export { edgeLabelGeometry, vertexLabelGeometry } from './label/bounds.js';
export { sanitizeLabelHtml } from './label/html.js';

export interface LabelLayout {
  /** text box in the same coordinates as the input (before rotation) */
  box: Rect;
  /** rotation in degrees about `center` applied to the label */
  rotation: number;
  center: Point;
}

function layout(g: LabelGeometry): LabelLayout {
  return { box: labelBox(g), rotation: g.rotation, center: g.center };
}

/**
 * Where a vertex's label is laid out. bounds = the vertex box (unrotated),
 * in drawing coordinates; scale = draw.io view scale (all style lengths in
 * draw.io units are multiplied by it, like fontSize, spacing).
 *
 * `box` is draw.io's label area (mxText.bounds placed by its alignment):
 * the text is aligned inside it per align/verticalAlign, wraps at its
 * width (whiteSpace=wrap) and is clipped to it (overflow=hidden). Turning
 * `box` by `rotation` about `center` (the vertex centre) gives the drawn
 * label; `rotation` is the style's rotation, -90 more for horizontal=0.
 */
export function vertexLabelLayout(style: Style, bounds: Rect, scale: number, options?: VertexLabelOptions): LabelLayout {
  return layout(vertexLabelGeometry(style, bounds, scale, options));
}

/**
 * Where an edge label is laid out around its anchor (from route.ts). The
 * box has the edge geometry's size, which is 0 for nearly every edge: the
 * text is then aligned around the anchor (moved by the spacing).
 */
export function edgeLabelLayout(style: Style, anchor: Point, scale: number, options?: EdgeLabelOptions): LabelLayout {
  return layout(edgeLabelGeometry(style, anchor, scale, options));
}

function hasValue(value: string | null | undefined): value is string {
  return value != null && value.length > 0;
}

/**
 * SVG markup for the label (a <g> with foreignObject or text), ready to
 * append inside the same <svg> as the shape. `value` is the raw cell
 * value. Returns '' for empty labels.
 */
export function vertexLabelSvg(style: Style, value: string, bounds: Rect, scale: number, options?: VertexLabelOptions): string {
  if (!hasValue(value) || !labelEnabled(style)) return '';
  return paintLabel(vertexLabelGeometry(style, bounds, scale, options), style, value,
    { width: bounds.width / scale, height: bounds.height / scale },
    { math: options?.math, textFallback: options?.textFallback });
}

export function edgeLabelSvg(style: Style, value: string, anchor: Point, scale: number, options?: EdgeLabelOptions): string {
  if (!hasValue(value) || !labelEnabled(style)) return '';
  return paintLabel(edgeLabelGeometry(style, anchor, scale, options), style, value, undefined,
    { math: options?.math, textFallback: options?.textFallback });
}

/**
 * Plain text of a label (for accessibility, search, element names): the
 * text an html=1 value shows (tags removed, <br> and block edges as line
 * breaks, entities decoded); other values are text already.
 */
export function labelText(style: Style, value: string): string {
  if (!hasValue(value)) return '';
  const t = textProps(style, 'vertex');
  if (t.markup) return htmlToText(value.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>'));
  return value.replace(/\r\n?/g, '\n');
}
