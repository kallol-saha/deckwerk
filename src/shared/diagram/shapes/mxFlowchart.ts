/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2018,
 * JGraph Holdings Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxFlowchart.js — mxgraph.flowchart.document2 and its connection
 * points.
 * Modified for DeckWerk: handles and the custom property table are left
 * out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import { Actor, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getFloat } from './util.js';

// --- Document 2 ---------------------------------------------------------------------------

export const FLOWCHART_DOCUMENT2_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0, false), constraint(0.5, 0, false), constraint(0.75, 0, false),
  constraint(0, 0.25, false), constraint(0, 0.5, false), constraint(0, 0.75, false),
  constraint(1, 0.25, false), constraint(1, 0.5, false), constraint(1, 0.75, false),
];

export class FlowchartDocument2 extends Actor {
  size = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = FLOWCHART_DOCUMENT2_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const fy = 1.4;
    const r = 5;

    c.begin();
    c.moveTo(w - r, 0);
    c.arcTo(r, r, 0, 0, 1, w, r);
    c.lineTo(w, h - dy / 2);
    c.quadTo(w * 3 / 4, h - dy * fy, w / 2, h - dy / 2);
    c.quadTo(w / 4, h - dy * (1 - fy), 0, h - dy / 2);
    c.lineTo(0, dy / 2);
    c.lineTo(0, r);
    c.arcTo(r, r, 0, 0, 1, r, 0);
    c.close();
    c.fillAndStroke();
  }
}

/** The shapes of mxFlowchart.js in the order it registers them. */
export const FLOWCHART_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.flowchart.document2', FlowchartDocument2],
];
