/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxNetworks.js — the bus (mxgraph.networks.bus) and the comm link
 * edge (mxgraph.networks.comm_link_edge).
 * Modified for DeckWerk: the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point } from '../types.js';
import { Arrow } from './edges.js';
import { Shape, type ShapeClass } from './shape.js';

// --- Bus ----------------------------------------------------------------------------------

export class ShapeNetworksBus extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.foreground(c, x, y, w, h);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(8, h * 0.5 + 10);
    c.arcTo(12, 12, 0, 0, 1, 8, h * 0.5 - 10);
    c.lineTo(w - 8, h * 0.5 - 10);
    c.arcTo(12, 12, 0, 0, 1, w - 8, h * 0.5 + 10);
    c.close();
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.setFillColor('#ffffff');
    c.begin();
    c.moveTo(w - 8, h * 0.5 - 10);
    c.arcTo(12, 12, 0, 0, 1, w - 8, h * 0.5 + 10);
    c.arcTo(12, 12, 0, 0, 1, w - 8, h * 0.5 - 10);
    c.fillAndStroke();
  }
}

// --- Comm Link ----------------------------------------------------------------------------

export class ShapeNetworksCommLinkEdge extends Arrow {
  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    // Base vector (between end points)
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    let dx = pe.x - p0.x;
    let dy = pe.y - p0.y;

    p0.x = p0.x + dx * 0.05;
    p0.y = p0.y + dy * 0.05;
    pe.x = pe.x - dx * 0.05;
    pe.y = pe.y - dy * 0.05;
    dx = pe.x - p0.x;
    dy = pe.y - p0.y;

    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const midX = p0.x + dx * 0.5;
    const midY = p0.y + dy * 0.5;

    const p1x = midX + nx * dist / 3 * 0.1 - ny / 3 * dist * 0.1;
    const p1y = midY + ny * dist / 3 * 0.1 + nx / 3 * dist * 0.1;
    const p2x = midX + nx * dist * 0.1 + ny * dist * 0.1;
    const p2y = midY + ny * dist * 0.1 - nx * dist * 0.1;

    const p3x = midX - nx * dist / 3 * 0.1 + ny / 3 * dist * 0.1;
    const p3y = midY - ny * dist / 3 * 0.1 - nx / 3 * dist * 0.1;
    const p4x = midX - nx * dist * 0.1 - ny * dist * 0.1;
    const p4y = midY - ny * dist * 0.1 + nx * dist * 0.1;

    c.begin();
    c.moveTo(p0.x, p0.y);
    c.lineTo(p2x, p2y);
    c.lineTo(p1x, p1y);
    c.lineTo(pe.x, pe.y);
    c.lineTo(p4x, p4y);
    c.lineTo(p3x, p3y);
    c.close();
    c.fillAndStroke();
  }
}

/** mxNetworks.js's registrations, in order. */
export const NETWORKS_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.networks.bus', ShapeNetworksBus],
  ['mxgraph.networks.comm_link_edge', ShapeNetworksCommLinkEdge],
];
