/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxBasic.js — the shapes of the Basic palette (cross2, rectangular
 * and rounded callouts, wave2, octagon2, isocube, triangles, drop, cone2,
 * pyramid, 4 point star, snipped and rounded rectangles, plaque, frames,
 * diag_stripe, donut, layered_rect, buttons, pie, arc, partConcEllipse,
 * numberedEntryVert, bendingArch, polygon, patternFillRect) and their
 * connection points.
 * Modified for DeckWerk: handles, custom property tables and label margins
 * are left out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import { createMarker as createMarkerPainter, type MarkerPainter } from '../markers.js';
import type { Point, Style } from '../types.js';
import { Actor, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import {
  DEFAULT_MARKERSIZE, NONE, getFloat, getNumber, getValue, looseEq, styleValue, toNumber, type JsValue,
} from './util.js';

/** A style value handed to a canvas setter that takes a string (JavaScript passes it unchanged). */
function str(value: JsValue): string | null {
  return value == null ? null : String(value);
}

// --- Cross ----------------------------------------------------------------------------

export class BasicCross extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(w * 0.5 + dx, 0);
    c.lineTo(w * 0.5 + dx, h * 0.5 - dx);
    c.lineTo(w, h * 0.5 - dx);
    c.lineTo(w, h * 0.5 + dx);
    c.lineTo(w * 0.5 + dx, h * 0.5 + dx);
    c.lineTo(w * 0.5 + dx, h);
    c.lineTo(w * 0.5 - dx, h);
    c.lineTo(w * 0.5 - dx, h * 0.5 + dx);
    c.lineTo(0, h * 0.5 + dx);
    c.lineTo(0, h * 0.5 - dx);
    c.lineTo(w * 0.5 - dx, h * 0.5 - dx);
    c.lineTo(w * 0.5 - dx, 0);
    c.close();
    c.fillAndStroke();
  }
}

// --- Rectangular Callout ------------------------------------------------------------------

export class BasicRectCallout extends Actor {
  dy = 0.5;
  dx = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    c.begin();
    c.moveTo(dx - dy * 0.5, h - dy);
    c.lineTo(0, h - dy);
    c.lineTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - dy);
    c.lineTo(dx + dy * 0.5, h - dy);
    c.lineTo(dx - dy, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    // Relative points with the fixed px offsets, so edges follow a resize
    return [
      constraint(0, 0, false), constraint(0.25, 0, false), constraint(0.5, 0, false), constraint(0.75, 0, false),
      constraint(1, 0, false), constraint(1, 0.5, false, 0, -dy * 0.5), constraint(1, 1, false, 0, -dy),
      constraint(0, 1, false, dx - dy, 0), constraint(0, 1, false, 0, -dy), constraint(0, 0.5, false, 0, -dy * 0.5),
    ];
  }
}

// --- Rounded Rectangular Callout ----------------------------------------------------------

export class BasicRoundRectCallout extends Actor {
  dy = 0.5;
  dx = 0.5;
  size = 10;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    let r = Math.max(0, Math.min(h, getFloat(this.style, 'size', this.size)));

    r = Math.min((h - dy) / 2, w / 2, r);
    dx = Math.max(r + dy * 0.5, dx);
    dx = Math.min(w - r - dy * 0.5, dx);

    c.begin();
    c.moveTo(dx - dy * 0.5, h - dy);
    c.lineTo(r, h - dy);
    c.arcTo(r, r, 0, 0, 1, 0, h - dy - r);
    c.lineTo(0, r);
    c.arcTo(r, r, 0, 0, 1, r, 0);
    c.lineTo(w - r, 0);
    c.arcTo(r, r, 0, 0, 1, w, r);
    c.lineTo(w, h - dy - r);
    c.arcTo(r, r, 0, 0, 1, w - r, h - dy);
    c.lineTo(dx + dy * 0.5, h - dy);
    c.arcTo(1.9 * dy, 1.4 * dy, 0, 0, 1, dx - dy, h);
    c.arcTo(0.9 * dy, 1.4 * dy, 0, 0, 0, dx - dy * 0.5, h - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    let r = Math.max(0, Math.min(h, getFloat(this.style, 'size', this.size)));

    r = Math.min((h - dy) / 2, w / 2, r);
    dx = Math.max(r + dy * 0.5, dx);
    dx = Math.min(w - r - dy * 0.5, dx);

    if (r < w * 0.25) {
      constr.push(constraint(0.25, 0, false));
      constr.push(constraint(0.75, 0, false));
    }

    // Relative points with the fixed px offsets, so edges follow a resize
    if (r < (h - dy) * 0.25) {
      constr.push(constraint(1, 0.25, false, 0, -dy * 0.25));
      constr.push(constraint(1, 0.75, false, 0, -dy * 0.75));
      constr.push(constraint(0, 0.25, false, 0, -dy * 0.25));
      constr.push(constraint(0, 0.75, false, 0, -dy * 0.75));
    }

    constr.push(constraint(0, 0, false, r * 0.293, r * 0.293));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(1, 0, false, -r * 0.293, r * 0.293));
    constr.push(constraint(1, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(0, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(1, 1, false, -r * 0.293, -dy - r * 0.293));
    constr.push(constraint(0, 1, false, r * 0.293, -dy - r * 0.293));
    constr.push(constraint(0, 1, false, dx - dy, 0));

    return constr;
  }
}

// --- Wave ------------------------------------------------------------------------------

export class BasicWave extends Actor {
  dy = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const fy = 1.4;

    c.begin();
    c.moveTo(0, dy / 2);
    c.quadTo(w / 6, dy * (1 - fy), w / 3, dy / 2);
    c.quadTo(w / 2, dy * fy, w * 2 / 3, dy / 2);
    c.quadTo(w * 5 / 6, dy * (1 - fy), w, dy / 2);
    c.lineTo(w, h - dy / 2);
    c.quadTo(w * 5 / 6, h - dy * fy, w * 2 / 3, h - dy / 2);
    c.quadTo(w / 2, h - dy * (1 - fy), w / 3, h - dy / 2);
    c.quadTo(w / 6, h - dy * fy, 0, h - dy / 2);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, _w: number, h: number): ConnectionConstraint[] {
    // Wave size as a fraction of the height in the relative points, so edges follow a resize
    let fdy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;

    return [
      constraint(0, fdy * 0.5, false), constraint(1 / 6, 0.015, false), constraint(1 / 3, fdy * 0.5, false),
      constraint(0.5, fdy * 0.95, false), constraint(0.67, fdy * 0.5, false), constraint(0.83, 0.015, false),
      constraint(1, fdy * 0.5, false), constraint(1, 0.5, false), constraint(1, 1 - fdy * 0.5, false),
      constraint(0.83, 1 - fdy * 0.95, false), constraint(0.67, 1 - fdy * 0.5, false),
      constraint(0.5, 1 - fdy * 0.04, false), constraint(1 / 3, 1 - fdy * 0.5, false),
      constraint(1 / 6, 1 - fdy * 0.95, false), constraint(0, 1 - fdy * 0.5, false), constraint(0, 0.5, false),
    ];
  }
}

// --- Octagon ---------------------------------------------------------------------------

export class BasicOctagon extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w, dx);
    c.lineTo(w, h - dx);
    c.lineTo(w - dx, h);
    c.lineTo(dx, h);
    c.lineTo(0, h - dx);
    c.lineTo(0, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx) * 0.5;

    return [
      constraint(0.5, 0, false), constraint(0.5, 1, false), constraint(0, 0.5, false), constraint(1, 0.5, false),
      // Relative points with the fixed px offsets, so edges follow a resize
      constraint(0, 0, false, dx, dx), constraint(1, 0, false, -dx, dx), constraint(1, 1, false, -dx, -dx),
      constraint(0, 1, false, dx, -dx),
    ];
  }
}

// --- Isometric Cube ------------------------------------------------------------------------

export class BasicIsoCube extends Actor {
  isoAngle = 15;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const isoAngle = Math.max(0.01, Math.min(94, getFloat(this.style, 'isoAngle', this.isoAngle))) * Math.PI / 200;
    const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);

    c.begin();
    c.moveTo(w * 0.5, 0);
    c.lineTo(w, isoH);
    c.lineTo(w, h - isoH);
    c.lineTo(w * 0.5, h);
    c.lineTo(0, h - isoH);
    c.lineTo(0, isoH);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.begin();
    c.moveTo(0, isoH);
    c.lineTo(w * 0.5, 2 * isoH);
    c.lineTo(w, isoH);
    c.moveTo(w * 0.5, 2 * isoH);
    c.lineTo(w * 0.5, h);
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const isoAngle = Math.max(0.01, Math.min(94, getFloat(this.style, 'isoAngle', this.isoAngle))) * Math.PI / 200;
    const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);
    // The iso height is drawn from the width: anchored to the nearest side with
    // the iso height as offset, so edges follow a resize that keeps the width
    // (eg. a taller cube)
    return [
      constraint(0.5, 0, false), constraint(1, 0, false, 0, isoH), constraint(1, 0.5, false),
      constraint(1, 1, false, 0, -isoH), constraint(0.5, 1, false), constraint(0, 1, false, 0, -isoH),
      constraint(0, 0.5, false), constraint(0, 0, false, 0, isoH),
    ];
  }
}

// --- Acute Triangle ------------------------------------------------------------------------

export class BasicTriangleAcute extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = w * Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(0, h);
    c.lineTo(dx, 0);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number): ConnectionConstraint[] {
    // Top position as a fraction of the width in the relative points, so edges follow a resize
    let fdx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    fdx = Number.isNaN(fdx) ? this.dx : fdx;

    return [
      constraint(1, 1, false), constraint(0.5, 1, false), constraint(0, 1, false), constraint(fdx, 0, false),
      constraint(fdx * 0.5, 0.5, false), constraint(1 - (1 - fdx) * 0.5, 0.5, false),
    ];
  }
}

// --- Obtuse Triangle -----------------------------------------------------------------------

export class BasicTriangleObtuse extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = w * Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(dx, h);
    c.lineTo(0, 0);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number): ConnectionConstraint[] {
    // Bottom position as a fraction of the width in the relative points, so edges follow a resize
    let fdx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    fdx = Number.isNaN(fdx) ? this.dx : fdx;

    return [
      constraint(0, 0, false), constraint(1, 1, false), constraint(0.5, 0.5, false),
      constraint((1 + fdx) * 0.5, 1, false), constraint(fdx, 1, false), constraint(fdx * 0.5, 0.5, false),
    ];
  }
}

// --- Drop ------------------------------------------------------------------------------

export class BasicDrop extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const r = Math.min(h, w) * 0.5;
    const d = h - r;
    const a = Math.sqrt(d * d - r * r);

    const angle = Math.atan(a / r);

    const x1 = r * Math.sin(angle);
    const y1 = r * Math.cos(angle);

    c.begin();
    c.moveTo(w * 0.5, 0);
    c.lineTo(w * 0.5 + x1, h - r - y1);
    c.arcTo(r, r, 0, 0, 1, w * 0.5 + r, h - r);
    c.arcTo(r, r, 0, 0, 1, w * 0.5, h);
    c.arcTo(r, r, 0, 0, 1, w * 0.5 - r, h - r);
    c.arcTo(r, r, 0, 0, 1, w * 0.5 - x1, h - r - y1);
    c.close();
    c.fillAndStroke();
  }
}

// --- Cone 2 ----------------------------------------------------------------------------

export class BasicCone2 extends Actor {
  dx = 0.5;
  dy = 0.9;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = w * Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = h * Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    const ry = h - dy;

    c.begin();
    c.moveTo(dx, 0);

    if (ry > 0) {
      c.lineTo(w, h - ry);
      c.arcTo(w * 0.5, ry, 0, 0, 1, w * 0.5, h);
      c.arcTo(w * 0.5, ry, 0, 0, 1, 0, h - ry);
    } else {
      c.lineTo(w, h);
      c.lineTo(0, h);
    }

    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    // Top and bottom as fractions of the size in the relative points, so edges follow a resize
    let fdx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    fdx = Number.isNaN(fdx) ? this.dx : fdx;
    let fdy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;

    return [constraint(fdx, 0, false), constraint(1, fdy, false), constraint(0.5, 1, false), constraint(0, fdy, false)];
  }
}

// --- Pyramid ---------------------------------------------------------------------------

export class BasicPyramid extends Actor {
  dx1 = 0.5;
  dx2 = 0.6;
  dy1 = 0.9;
  dy2 = 0.8;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx1 = w * Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = w * Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const dy1 = h * Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dy2 = h * Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));

    c.begin();
    c.moveTo(dx1, 0);
    c.lineTo(w, dy2);
    c.lineTo(dx2, h);
    c.lineTo(0, dy1);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.begin();
    c.moveTo(dx1, 0);
    c.lineTo(dx2, h);
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    // Corners as fractions of the size in the relative points, so edges follow a resize
    let fdx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    fdx1 = Number.isNaN(fdx1) ? this.dx1 : fdx1;
    let fdx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    fdx2 = Number.isNaN(fdx2) ? this.dx2 : fdx2;
    let fdy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    fdy1 = Number.isNaN(fdy1) ? this.dy1 : fdy1;
    let fdy2 = Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));
    fdy2 = Number.isNaN(fdy2) ? this.dy2 : fdy2;

    return [
      constraint(fdx1, 0, false), constraint((1 + fdx1) * 0.5, fdy2 * 0.5, false), constraint(1, fdy2, false),
      constraint((1 + fdx2) * 0.5, (1 + fdy2) * 0.5, false), constraint(fdx2, 1, false),
      constraint(fdx2 * 0.5, (1 + fdy1) * 0.5, false), constraint(0, fdy1, false),
      constraint(fdx1 * 0.5, fdy1 * 0.5, false),
    ];
  }
}

// --- 4 Point Star 2 --------------------------------------------------------------------------

export class Basic4PointStar2 extends Actor {
  dx = 0.8;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = 0.5 * Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(0, h * 0.5);
    c.lineTo(dx * w, dx * h);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w - dx * w, dx * h);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx * w, h - dx * h);
    c.lineTo(w * 0.5, h);
    c.lineTo(dx * w, h - dx * h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number): ConnectionConstraint[] {
    const dx = 0.5 * Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    return [
      constraint(0.5, 0, false), constraint(0.5, 1, false), constraint(0, 0.5, false), constraint(1, 0.5, false),
      constraint(dx, dx, false), constraint(1 - dx, dx, false), constraint(1 - dx, 1 - dx, false),
      constraint(dx, 1 - dx, false),
    ];
  }
}

// --- Diagonal Snip Rectangle -------------------------------------------------------------------

export class BasicDiagSnipRect extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - dx);
    c.lineTo(w - dx, h);
    c.lineTo(0, h);
    c.lineTo(0, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx) * 0.5;

    return [
      constraint(0, 0, false, dx, dx), constraint(0.5, 0, false), constraint(1, 0, false), constraint(1, 0.5, false),
      // Relative point with the fixed px offsets, so edges follow a resize
      constraint(1, 1, false, -dx, -dx), constraint(0.5, 1, false), constraint(0, 1, false), constraint(0, 0.5, false),
    ];
  }
}

// --- Diagonal Round Rectangle ------------------------------------------------------------------

export class BasicDiagRoundRect extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - dx);
    c.arcTo(dx, dx, 0, 0, 1, w - dx, h);
    c.lineTo(0, h);
    c.lineTo(0, dx);
    c.arcTo(dx, dx, 0, 0, 1, dx, 0);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    return [
      constraint(0.5, 0, false), constraint(1, 0, false), constraint(1, 0.5, false), constraint(0.5, 1, false),
      constraint(0, 1, false), constraint(0, 0.5, false),
    ];
  }
}

// --- Corner Round Rectangle --------------------------------------------------------------------

export class BasicCornerRoundRect extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.lineTo(0, dx);
    c.arcTo(dx, dx, 0, 0, 1, dx, 0);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    return [
      constraint(0.5, 0, false), constraint(1, 0, false), constraint(1, 0.5, false), constraint(1, 1, false),
      constraint(0.5, 1, false), constraint(0, 1, false), constraint(0, 0.5, false),
    ];
  }
}

// --- Plaque ----------------------------------------------------------------------------

export class BasicPlaque extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(w - dx, 0);
    c.arcTo(dx, dx, 0, 0, 0, w, dx);
    c.lineTo(w, h - dx);
    c.arcTo(dx, dx, 0, 0, 0, w - dx, h);
    c.lineTo(dx, h);
    c.arcTo(dx, dx, 0, 0, 0, 0, h - dx);
    c.lineTo(0, dx);
    c.arcTo(dx, dx, 0, 0, 0, dx, 0);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    return [constraint(0.5, 0, false), constraint(1, 0.5, false), constraint(0.5, 1, false), constraint(0, 0.5, false)];
  }
}

// --- Frame -----------------------------------------------------------------------------

export class BasicFrame extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.lineTo(0, 0);
    c.close();
    c.moveTo(dx, dx);
    c.lineTo(dx, h - dx);
    c.lineTo(w - dx, h - dx);
    c.lineTo(w - dx, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    dx = Math.min(w * 0.5, h * 0.5, dx);

    // Relative points with the fixed px offsets, so edges follow a resize
    return [
      constraint(0, 0, false), constraint(0.25, 0, false), constraint(0.5, 0, false), constraint(0.75, 0, false),
      constraint(1, 0, false), constraint(1, 0.25, false), constraint(1, 0.5, false), constraint(1, 0.75, false),
      constraint(1, 1, false), constraint(0.75, 1, false), constraint(0.5, 1, false), constraint(0.25, 1, false),
      constraint(0, 1, false), constraint(0, 0.75, false), constraint(0, 0.5, false), constraint(0, 0.25, false),
      constraint(0, 0, false, dx, dx), constraint(0.25, 0, false, dx * 0.5, dx), constraint(0.5, 0, false, 0, dx),
      constraint(0.75, 0, false, -dx * 0.5, dx), constraint(1, 0, false, -dx, dx),
      constraint(1, 0.25, false, -dx, dx * 0.5), constraint(1, 0.5, false, -dx, 0),
      constraint(1, 0.75, false, -dx, -dx * 0.5), constraint(1, 1, false, -dx, -dx),
      constraint(0.75, 1, false, -dx * 0.5, -dx), constraint(0.5, 1, false, 0, -dx),
      constraint(0.25, 1, false, dx * 0.5, -dx), constraint(0, 1, false, dx, -dx),
      constraint(0, 0.75, false, dx, -dx * 0.5), constraint(0, 0.5, false, dx, 0),
      constraint(0, 0.25, false, dx, dx * 0.5),
    ];
  }
}

// --- Plaque Frame ------------------------------------------------------------------------

export class BasicPlaqueFrame extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.25, h * 0.25, dx);

    c.begin();
    c.moveTo(w - dx, 0);
    c.arcTo(dx, dx, 0, 0, 0, w, dx);
    c.lineTo(w, h - dx);
    c.arcTo(dx, dx, 0, 0, 0, w - dx, h);
    c.lineTo(dx, h);
    c.arcTo(dx, dx, 0, 0, 0, 0, h - dx);
    c.lineTo(0, dx);
    c.arcTo(dx, dx, 0, 0, 0, dx, 0);
    c.close();

    c.moveTo(dx * 2, dx);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, dx, dx * 2);
    c.lineTo(dx, h - 2 * dx);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, dx * 2, h - dx);
    c.lineTo(w - 2 * dx, h - dx);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, w - dx, h - 2 * dx);
    c.lineTo(w - dx, dx * 2);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, w - 2 * dx, dx);
    c.close();

    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    dx = Math.min(w * 0.5, h * 0.5, dx);

    return [
      constraint(0.5, 0, false), constraint(1, 0.5, false), constraint(0.5, 1, false), constraint(0, 0.5, false),
      constraint(0.5, 0, false, 0, dx), constraint(1, 0.5, false, -dx, 0), constraint(0.5, 1, false, 0, -dx),
      constraint(0, 0.5, false, dx, 0),
    ];
  }
}

// --- Rounded Frame -----------------------------------------------------------------------

export class BasicRoundedFrame extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.25, h * 0.25, dx);

    c.begin();
    c.moveTo(w - 2 * dx, 0);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, w, 2 * dx);
    c.lineTo(w, h - 2 * dx);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, w - 2 * dx, h);
    c.lineTo(dx * 2, h);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, 0, h - 2 * dx);
    c.lineTo(0, 2 * dx);
    c.arcTo(dx * 2, dx * 2, 0, 0, 1, 2 * dx, 0);
    c.close();

    c.moveTo(dx * 2, dx);
    c.arcTo(dx, dx, 0, 0, 0, dx, dx * 2);
    c.lineTo(dx, h - 2 * dx);
    c.arcTo(dx, dx, 0, 0, 0, dx * 2, h - dx);
    c.lineTo(w - 2 * dx, h - dx);
    c.arcTo(dx, dx, 0, 0, 0, w - dx, h - 2 * dx);
    c.lineTo(w - dx, dx * 2);
    c.arcTo(dx, dx, 0, 0, 0, w - 2 * dx, dx);
    c.close();

    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    dx = Math.min(w * 0.5, h * 0.5, dx);

    return [
      constraint(0.5, 0, false), constraint(1, 0.5, false), constraint(0.5, 1, false), constraint(0, 0.5, false),
      constraint(0.5, 0, false, 0, dx), constraint(1, 0.5, false, -dx, 0), constraint(0.5, 1, false, 0, -dx),
      constraint(0, 0.5, false, dx, 0),
    ];
  }
}

// --- Frame Corner ------------------------------------------------------------------------

export class BasicFrameCorner extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w - dx, dx);
    c.lineTo(dx, dx);
    c.lineTo(dx, h - dx);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    return [
      constraint(0, 0, false), constraint(0.5, 0, false), constraint(1, 0, false), constraint(1, 0, false, -dx, dx),
      // Relative points with the fixed px offsets, so edges follow a resize
      constraint(0.5, 0, false, 0, dx), constraint(0, 0, false, dx, dx), constraint(0, 0.5, false, dx, 0),
      constraint(0, 1, false, dx, -dx), constraint(0, 1, false), constraint(0, 0.5, false),
    ];
  }
}

// --- Diagonal Stripe -----------------------------------------------------------------------

export class BasicDiagStripe extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w, h, dx);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, 0);
    c.lineTo(w, Math.min(dx * 100 / w, h));
    c.lineTo(Math.min(dx * 100 / h, w), h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    dx = Math.min(w, h, dx);
    // The end of the stripe on the right side is drawn from the width and the
    // end on the bottom from the height: anchored to their side with the end
    // as offset, so the edges at each end follow a resize of the other
    // dimension (every resize moves one of the ends)
    const x1 = Math.min(dx * 100 / h, w);
    const y1 = Math.min(dx * 100 / w, h);

    return [
      constraint(0, 1, false), constraint(0.5, 0.5, false), constraint(1, 0, false),
      constraint(1, 0, false, 0, y1 * 0.5), constraint(1, 0, false, 0, y1),
      constraint(0.5, 0.5, false, x1 * 0.5, y1 * 0.5), constraint(0, 1, false, x1, 0),
      constraint(0, 1, false, x1 * 0.5, 0),
    ];
  }
}

// --- Donut -----------------------------------------------------------------------------

export class BasicDonut extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(0, h * 0.5);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, w * 0.5, 0);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, w, h * 0.5);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, w * 0.5, h);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, 0, h * 0.5);
    c.close();
    c.moveTo(w * 0.5, dx);
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, 0, 0, dx, h * 0.5);
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, 0, 0, w * 0.5, h - dx);
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, 0, 0, w - dx, h * 0.5);
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, 0, 0, w * 0.5, dx);
    c.close();
    c.fillAndStroke();
  }
}

// --- Layered Rect ------------------------------------------------------------------------

export class BasicLayeredRect extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, dx);
    c.lineTo(w, dx);
    c.lineTo(w, h);
    c.lineTo(dx, h);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(dx * 0.5, dx * 0.5);
    c.lineTo(w - dx * 0.5, dx * 0.5);
    c.lineTo(w - dx * 0.5, h - dx * 0.5);
    c.lineTo(dx * 0.5, h - dx * 0.5);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w - dx, h - dx);
    c.lineTo(0, h - dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    dx = Math.min(w * 0.5, h * 0.5, dx);

    // Relative points with the fixed px offsets, so edges follow a resize
    return [
      constraint(0, 0, false), constraint(0.25, 0, false, -dx * 0.25, 0), constraint(0.5, 0, false, -dx * 0.5, 0),
      constraint(0.75, 0, false, -dx * 0.75, 0), constraint(1, 0, false, -dx, 0),
      constraint(1, 0, false, -dx * 0.5, dx * 0.5), constraint(1, 0, false, 0, dx),
      constraint(1, 0.25, false, 0, dx * 0.75), constraint(1, 0.5, false, 0, dx * 0.5),
      constraint(1, 0.75, false, 0, dx * 0.25), constraint(1, 1, false), constraint(0.75, 1, false, dx * 0.25, 0),
      constraint(0.5, 1, false, dx * 0.5, 0), constraint(0.25, 1, false, dx * 0.75, 0), constraint(0, 1, false, dx, 0),
      constraint(0, 1, false, dx * 0.5, -dx * 0.5), constraint(0, 1, false, 0, -dx),
      constraint(0, 0.75, false, 0, -dx * 0.75), constraint(0, 0.5, false, 0, -dx * 0.5),
      constraint(0, 0.25, false, 0, -dx * 0.25),
    ];
  }
}

// --- Button ----------------------------------------------------------------------------

export class BasicButton extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setLineJoin('round');

    c.begin();
    c.moveTo(0, h);
    c.lineTo(0, 0);
    c.lineTo(dx, dx);
    c.lineTo(dx, h - dx);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w - dx, dx);
    c.lineTo(dx, dx);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(w - dx, h - dx);
    c.lineTo(w - dx, dx);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, h);
    c.lineTo(dx, h - dx);
    c.lineTo(w - dx, h - dx);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, h);
    c.lineTo(0, 0);
    c.lineTo(dx, dx);
    c.lineTo(dx, h - dx);
    c.close();
    c.fillAndStroke();
  }
}

// --- Shaded Button -----------------------------------------------------------------------

export class BasicShadedButton extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.setShadow(false);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fill();

    c.setFillColor('#ffffff');
    c.setAlpha(0.25);
    c.begin();
    c.moveTo(0, h);
    c.lineTo(0, 0);
    c.lineTo(dx, dx);
    c.lineTo(dx, h - dx);
    c.close();
    c.fill();

    c.setAlpha(0.5);
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w - dx, dx);
    c.lineTo(dx, dx);
    c.close();
    c.fill();

    c.setFillColor('#000000');
    c.setAlpha(0.25);
    c.begin();
    c.moveTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(w - dx, h - dx);
    c.lineTo(w - dx, dx);
    c.close();
    c.fill();

    c.setAlpha(0.5);
    c.begin();
    c.moveTo(0, h);
    c.lineTo(dx, h - dx);
    c.lineTo(w - dx, h - dx);
    c.lineTo(w, h);
    c.close();
    c.fill();
  }
}

// --- Pie -------------------------------------------------------------------------------

export class BasicPie extends Actor {
  startAngle = 0.25;
  endAngle = 0.75;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const startAngleSource = Math.max(0, Math.min(1, getFloat(this.style, 'startAngle', this.startAngle)));
    const endAngleSource = Math.max(0, Math.min(1, getFloat(this.style, 'endAngle', this.endAngle)));
    const startAngle = 2 * Math.PI * startAngleSource;
    const endAngle = 2 * Math.PI * endAngleSource;
    const rx = w * 0.5;
    const ry = h * 0.5;

    const startX = rx + Math.sin(startAngle) * rx;
    const startY = ry - Math.cos(startAngle) * ry;
    const endX = rx + Math.sin(endAngle) * rx;
    const endY = ry - Math.cos(endAngle) * ry;

    let angDiff = endAngle - startAngle;

    if (angDiff < 0) {
      angDiff = angDiff + Math.PI * 2;
    }

    let bigArc = 0;

    if (angDiff >= Math.PI) {
      bigArc = 1;
    }

    c.begin();
    const startAngleDiff = startAngleSource % 1;
    const endAngleDiff = endAngleSource % 1;

    if (startAngleDiff === 0 && endAngleDiff === 0.5) {
      c.moveTo(rx, ry);
      c.lineTo(startX, startY);
      c.arcTo(rx, ry, 0, 0, 1, w, h * 0.5);
      c.arcTo(rx, ry, 0, 0, 1, w * 0.5, h);
    } else if (startAngleDiff === 0.5 && endAngleDiff === 0) {
      c.moveTo(rx, ry);
      c.lineTo(startX, startY);
      c.arcTo(rx, ry, 0, 0, 1, 0, h * 0.5);
      c.arcTo(rx, ry, 0, 0, 1, w * 0.5, 0);
    } else {
      c.moveTo(rx, ry);
      c.lineTo(startX, startY);
      c.arcTo(rx, ry, 0, bigArc, 1, endX, endY);
    }

    c.close();
    c.fillAndStroke();
  }
}

// --- Arc -------------------------------------------------------------------------------

export class BasicArc extends Actor {
  startAngle = 0.25;
  endAngle = 0.75;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const startAngleSource = Math.max(0, Math.min(1, getFloat(this.style, 'startAngle', this.startAngle)));
    const endAngleSource = Math.max(0, Math.min(1, getFloat(this.style, 'endAngle', this.endAngle)));
    const startAngle = 2 * Math.PI * startAngleSource;
    const endAngle = 2 * Math.PI * endAngleSource;

    // Arrow markers
    const startArrow = getValue(this.style, 'startArrow', NONE);
    const endArrow = getValue(this.style, 'endArrow', NONE);
    const startSize = getNumber(this.style, 'startSize', DEFAULT_MARKERSIZE);
    const endSize = getNumber(this.style, 'endSize', DEFAULT_MARKERSIZE);

    // Inset ellipse to keep markers within shape bounds
    let markerPadding = 0;

    if (startArrow != null && !looseEq(startArrow, NONE)) {
      markerPadding = Math.max(markerPadding, startSize);
    }

    if (endArrow != null && !looseEq(endArrow, NONE)) {
      markerPadding = Math.max(markerPadding, endSize);
    }

    if (markerPadding > 0) {
      markerPadding = (markerPadding + this.strokewidth) / 2;
    }

    const cx = w * 0.5;
    const cy = h * 0.5;
    const rx = Math.max(0, w * 0.5 - markerPadding);
    const ry = Math.max(0, h * 0.5 - markerPadding);

    let startX = cx + Math.sin(startAngle) * rx;
    let startY = cy - Math.cos(startAngle) * ry;
    let endX = cx + Math.sin(endAngle) * rx;
    let endY = cy - Math.cos(endAngle) * ry;

    let startMarker: MarkerPainter | null = null;
    let endMarker: MarkerPainter | null = null;

    if (startArrow != null && !looseEq(startArrow, NONE)) {
      const startFilled = !looseEq(styleValue(this.style, 'startFill'), 0);

      // Direction pointing into the start (opposite of clockwise tangent)
      const dx = -rx * Math.cos(startAngle);
      const dy = -ry * Math.sin(startAngle);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const pe: Point = { x: startX, y: startY };
        startMarker = createMarkerPainter(c, this, String(startArrow), pe,
          dx / dist, dy / dist, startSize, true, this.strokewidth, startFilled);
        startX = pe.x;
        startY = pe.y;
      }
    }

    if (endArrow != null && !looseEq(endArrow, NONE)) {
      const endFilled = !looseEq(styleValue(this.style, 'endFill'), 0);

      // Direction along the clockwise tangent at end
      const dx = rx * Math.cos(endAngle);
      const dy = ry * Math.sin(endAngle);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const pe: Point = { x: endX, y: endY };
        endMarker = createMarkerPainter(c, this, String(endArrow), pe,
          dx / dist, dy / dist, endSize, false, this.strokewidth, endFilled);
        endX = pe.x;
        endY = pe.y;
      }
    }

    // Draw arc
    let angDiff = endAngle - startAngle;

    if (angDiff < 0) {
      angDiff = angDiff + Math.PI * 2;
    }

    let bigArc = 0;

    if (angDiff > Math.PI) {
      bigArc = 1;
    }

    c.begin();

    const startAngleDiff = startAngleSource % 1;
    const endAngleDiff = endAngleSource % 1;

    if (startMarker == null && endMarker == null && startAngleDiff === 0 && endAngleDiff === 0.5) {
      c.moveTo(startX, startY);
      c.arcTo(rx, ry, 0, 0, 1, cx + rx, cy);
      c.arcTo(rx, ry, 0, 0, 1, cx, cy + ry);
    } else if (startMarker == null && endMarker == null && startAngleDiff === 0.5 && endAngleDiff === 0) {
      c.moveTo(startX, startY);
      c.arcTo(rx, ry, 0, 0, 1, cx - rx, cy);
      c.arcTo(rx, ry, 0, 0, 1, cx, cy - ry);
    } else {
      c.moveTo(startX, startY);
      c.arcTo(rx, ry, 0, bigArc, 1, endX, endY);
    }

    c.stroke();

    // Paint markers
    c.setShadow(false);
    c.setDashed(false);

    if (startMarker != null) {
      c.setFillColor(str(getValue(this.style, 'startFillColor', this.stroke)));
      startMarker();
    }

    if (endMarker != null) {
      c.setFillColor(str(getValue(this.style, 'endFillColor', this.stroke)));
      endMarker();
    }
  }
}

// --- Partial Concentric Ellipse --------------------------------------------------------------

export class BasicPartConcEllipse extends Actor {
  startAngle = 0.25;
  endAngle = 0.75;
  arcWidth = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const startAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'startAngle', this.startAngle)));
    let endAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'endAngle', this.endAngle)));
    const arcWidth = 1 - Math.max(0, Math.min(1, getFloat(this.style, 'arcWidth', this.arcWidth)));
    const rx = w * 0.5;
    const ry = h * 0.5;
    const rx2 = rx * arcWidth;
    const ry2 = ry * arcWidth;

    let angDiff = endAngle - startAngle;

    if (angDiff < 0) {
      angDiff = angDiff + Math.PI * 2;
    } else if (angDiff === Math.PI) {
      endAngle = endAngle + 0.00001;
    }

    const startX = rx + Math.sin(startAngle) * rx;
    const startY = ry - Math.cos(startAngle) * ry;
    const innerStartX = rx + Math.sin(startAngle) * rx2;
    const innerStartY = ry - Math.cos(startAngle) * ry2;
    const endX = rx + Math.sin(endAngle) * rx;
    const endY = ry - Math.cos(endAngle) * ry;
    const innerEndX = rx + Math.sin(endAngle) * rx2;
    const innerEndY = ry - Math.cos(endAngle) * ry2;

    let bigArc = 0;

    if (angDiff >= Math.PI) {
      bigArc = 1;
    }

    c.begin();
    c.moveTo(startX, startY);
    c.arcTo(rx, ry, 0, bigArc, 1, endX, endY);
    c.lineTo(innerEndX, innerEndY);
    c.arcTo(rx2, ry2, 0, bigArc, 0, innerStartX, innerStartY);
    c.close();
    c.fillAndStroke();
  }
}

// --- Numbered entry (vertical) -------------------------------------------------------------

export class BasicNumEntryVert extends Actor {
  dy = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(w, getFloat(this.style, 'dy', this.dy)));

    const inset = 5;

    const d = Math.min(dy, w - 2 * inset, h - inset);

    c.ellipse(w * 0.5 - d * 0.5, 0, d, d);
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, d * 0.5);
    c.lineTo(w * 0.5 - d * 0.5 - inset, d * 0.5);
    c.arcTo(d * 0.5 + inset, d * 0.5 + inset, 0, 0, 0, w * 0.5 + d * 0.5 + inset, d * 0.5);
    c.lineTo(w, d * 0.5);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Bending Arch ------------------------------------------------------------------------

export class BasicBendingArch extends Actor {
  startAngle = 0.25;
  endAngle = 0.75;
  arcWidth = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const startAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'startAngle', this.startAngle)));
    const endAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'endAngle', this.endAngle)));
    const arcWidth = 1 - Math.max(0, Math.min(1, getFloat(this.style, 'arcWidth', this.arcWidth)));
    const rx = w * 0.5;
    const ry = h * 0.5;
    const rx2 = rx * arcWidth;
    const ry2 = ry * arcWidth;

    const startX = rx + Math.sin(startAngle) * rx;
    const startY = ry - Math.cos(startAngle) * ry;
    const innerStartX = rx + Math.sin(startAngle) * rx2;
    const innerStartY = ry - Math.cos(startAngle) * ry2;
    const endX = rx + Math.sin(endAngle) * rx;
    const endY = ry - Math.cos(endAngle) * ry;
    const innerEndX = rx + Math.sin(endAngle) * rx2;
    const innerEndY = ry - Math.cos(endAngle) * ry2;

    let angDiff = endAngle - startAngle;

    if (angDiff < 0) {
      angDiff = angDiff + Math.PI * 2;
    }

    let bigArc = 0;

    if (angDiff > Math.PI) {
      bigArc = 1;
    }

    const rx3 = rx2 - 5;
    const ry3 = ry2 - 5;

    c.ellipse(w * 0.5 - rx3, h * 0.5 - ry3, 2 * rx3, 2 * ry3);
    c.fillAndStroke();

    c.begin();
    c.moveTo(startX, startY);
    c.arcTo(rx, ry, 0, bigArc, 1, endX, endY);
    c.lineTo(innerEndX, innerEndY);
    c.arcTo(rx2, ry2, 0, bigArc, 0, innerStartX, innerStartY);
    c.close();
    c.fillAndStroke();
  }
}

// --- Three Corner Round Rectangle ------------------------------------------------------------

export class BasicThreeCornerRoundRect extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx))) * 2;

    dx = Math.min(w * 0.5, h * 0.5, dx);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(w - dx, 0);
    c.arcTo(dx, dx, 0, 0, 1, w, dx);
    c.lineTo(w, h - dx);
    c.arcTo(dx, dx, 0, 0, 1, w - dx, h);
    c.lineTo(0, h);
    c.lineTo(0, dx);
    c.arcTo(dx, dx, 0, 0, 1, dx, 0);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    return [
      constraint(0.5, 0, false), constraint(1, 0.5, false), constraint(0.5, 1, false), constraint(0, 1, false),
      constraint(0, 0.5, false),
    ];
  }
}

// --- Polygon ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON keeps JavaScript's coercions */

export class BasicPolygon extends Actor {
  dx = 0.5;
  dy = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    try {
      c.translate(x, y);
      // this.state.style in draw.io, the same object as this.style
      const coords: any = JSON.parse(String(getValue(this.style, 'polyCoords', '[]')));
      const curves: any = JSON.parse(String(getValue(this.style, 'polyCurves', '[]')));
      const polyline = getValue(this.style, 'polyline', false);

      if (coords.length > 0) {
        c.begin();
        c.moveTo(coords[0][0] * w, coords[0][1] * h);

        for (let i = 1; i < coords.length; i++) {
          const ci = (curves.length > i - 1) ? curves[i - 1] : null;

          if (ci != null && ci.length >= 3 && ci[0] === 'Q') {
            c.quadTo(ci[1] * w, ci[2] * h, coords[i][0] * w, coords[i][1] * h);
          } else {
            c.lineTo(coords[i][0] * w, coords[i][1] * h);
          }
        }

        if (looseEq(polyline, false)) {
          const closeCurve = (curves.length >= coords.length) ? curves[coords.length - 1] : null;

          if (closeCurve != null && closeCurve.length >= 3 && closeCurve[0] === 'Q') {
            c.quadTo(closeCurve[1] * w, closeCurve[2] * h, coords[0][0] * w, coords[0][1] * h);
          }

          c.close();
        }

        c.end();
        c.fillAndStroke();
      }
    } catch {
      // ignore
    }
  }

  // The vertices and the middle of each side (of the curve on a curved side); a
  // polyline has no closing side. Lists that are not arrays of number pairs or
  // are longer than 100 vertices get no points.
  override getConstraints(style: Style): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    try {
      const coords: any = JSON.parse(String(getValue(style, 'polyCoords', '[]')));
      let curves: any = JSON.parse(String(getValue(style, 'polyCurves', '[]')));
      const polyline = getValue(style, 'polyline', false);

      const isPoint = (p: any): boolean => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number'
        && isFinite(p[0]) && isFinite(p[1]);

      if (Array.isArray(coords) && coords.length <= 100 && coords.every(isPoint)) {
        const n = coords.length;
        const sides = looseEq(polyline, false) ? n : n - 1;
        curves = Array.isArray(curves) ? curves : [];

        for (let i = 0; i < n; i++) {
          constr.push(constraint(coords[i][0], coords[i][1], false));
        }

        for (let i = 0; i < sides && n > 1; i++) {
          const p0 = coords[i];
          const p1 = coords[(i + 1) % n];
          const ci = (curves.length > i) ? curves[i] : null;
          let mx = (p0[0] + p1[0]) / 2;
          let my = (p0[1] + p1[1]) / 2;

          if (Array.isArray(ci) && ci.length >= 3 && ci[0] === 'Q' && isPoint([ci[1], ci[2]])) {
            mx = (p0[0] + p1[0]) / 4 + ci[1] / 2;
            my = (p0[1] + p1[1]) / 4 + ci[2] / 2;
          }

          constr.push(constraint(mx, my, false));
        }
      }
    } catch {
      // ignore
    }

    return constr;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Rectangle with pattern fill -------------------------------------------------------------

export class BasicPatternFillRect extends Actor {
  dx = 0.5;
  /** Maximum number of lines per direction of the fill. */
  maxLines = 10000;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const strokeColor = getValue(this.style, 'strokeColor', '#000000');
    const strokeWidth = getValue(this.style, 'strokeWidth', '1');

    c.rect(0, 0, w, h);
    c.fill();

    const fillStrokeColor = getValue(this.style, 'fillStrokeColor', '#cccccc');
    const fillStrokeWidth = getFloat(this.style, 'fillStrokeWidth', 1);

    c.setStrokeColor(str(fillStrokeColor));
    c.setStrokeWidth(fillStrokeWidth);

    let step = getFloat(this.style, 'step', 5);
    const fillStyle = getValue(this.style, 'fillStyle', 'none');

    if (looseEq(fillStyle, 'diag') || looseEq(fillStyle, 'diagGrid')) {
      step = step * 1.41;
      let i = 0;
      let n = 0;

      c.begin();

      while (i < (h + w) && n < this.maxLines) {
        if (i <= h) {
          c.moveTo(0, i);

          if (i <= w) {
            c.lineTo(i, 0);
          } else {
            c.lineTo(w, i - w);
          }
        } else {
          c.moveTo(i - h, h);

          if (i <= w) {
            c.lineTo(i, 0);
          } else {
            c.lineTo(w, i - w);
          }
        }

        i = i + step;
        n++;
      }

      c.stroke();
    } else if (looseEq(fillStyle, 'vert') || looseEq(fillStyle, 'grid')) {
      c.begin();
      let i = 0;
      let n = 0;

      while (i <= w && n < this.maxLines) {
        c.moveTo(i, 0);
        c.lineTo(i, h);

        i = i + step;
        n++;
      }

      c.stroke();
    }

    if (looseEq(fillStyle, 'diagRev') || looseEq(fillStyle, 'diagGrid')) {
      if (looseEq(fillStyle, 'diagRev')) {
        step = step * 1.41;
      }

      let i = 0;
      let n = 0;

      c.begin();

      while (i < (h + w) && n < this.maxLines) {
        if (i <= h) {
          c.moveTo(w, i);

          if (i <= w) {
            c.lineTo(w - i, 0);
          } else {
            c.lineTo(w - w, i - w);
          }
        } else {
          c.moveTo(w - i + h, h);

          if (i <= w) {
            c.lineTo(w - i, 0);
          } else {
            c.lineTo(0, i - w);
          }
        }

        i = i + step;
        n++;
      }

      c.stroke();
    } else if (looseEq(fillStyle, 'hor') || looseEq(fillStyle, 'grid')) {
      c.begin();
      let i = 0;
      let n = 0;

      while (i <= h && n < this.maxLines) {
        c.moveTo(0, i);
        c.lineTo(w, i);

        i = i + step;
        n++;
      }

      c.stroke();
    }

    c.setStrokeColor(str(strokeColor));
    c.setStrokeWidth(toNumber(strokeWidth));

    c.begin();
    c.moveTo(0, 0);

    if (looseEq(getValue(this.style, 'top', '1'), '1')) {
      c.lineTo(w, 0);
    } else {
      c.moveTo(w, 0);
    }

    if (looseEq(getValue(this.style, 'right', '1'), '1')) {
      c.lineTo(w, h);
    } else {
      c.moveTo(w, h);
    }

    if (looseEq(getValue(this.style, 'bottom', '1'), '1')) {
      c.lineTo(0, h);
    } else {
      c.moveTo(0, h);
    }

    if (looseEq(getValue(this.style, 'left', '1'), '1')) {
      c.lineTo(0, 0);
    }

    c.end();
    c.stroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    return [
      constraint(0, 0, false), constraint(0.25, 0, false), constraint(0.5, 0, false), constraint(0.75, 0, false),
      constraint(1, 0, false), constraint(1, 0.25, false), constraint(1, 0.5, false), constraint(1, 0.75, false),
      constraint(1, 1, false), constraint(0.75, 1, false), constraint(0.75, 1, false), constraint(0.5, 1, false),
      constraint(0.25, 1, false), constraint(0, 1, false), constraint(0, 0.75, false), constraint(0, 0.5, false),
      constraint(0, 0.25, false),
    ];
  }
}

// --- mxShapeBasicRect2 (mxgraph.basic.rect) ------------------------------------------------
//
// Ported from js/grapheditor/Shapes.js of draw.io 32.7.4 (mxShapeBasicRect2,
// the "Partial Rectangle" of the Basic palette), same copyright and licence
// as above; DeckWerk keeps it with the other basic shapes. The BPMN shapes
// call strictDrawShape with overrides, so the `os` parameter is kept.

/** The styles strictDrawShape takes from `os` instead of the shape's style (if truthy). */
export interface BasicRect2Overrides {
  rectStyle?: JsValue;
  absoluteCornerSize?: JsValue;
  size?: number;
  rectOutline?: JsValue;
  indent?: number;
  dashed?: JsValue;
  dashPattern?: JsValue;
  relIndent?: number;
  top?: JsValue;
  right?: JsValue;
  bottom?: JsValue;
  left?: JsValue;
  topLeftStyle?: JsValue;
  topRightStyle?: JsValue;
  bottomRightStyle?: JsValue;
  bottomLeftStyle?: JsValue;
  fillColor?: JsValue;
  strokeColor?: JsValue;
  strokeWidth?: JsValue;
  fillColor2?: JsValue;
  gradientColor2?: JsValue;
  gradientDirection2?: JsValue;
  opacity?: JsValue;
}

/** `cornerStyle == name || (cornerStyle == 'default' && rectStyle == name)`, the test of every corner. */
function isCorner(cornerStyle: JsValue, rectStyle: JsValue, name: string): boolean {
  return looseEq(cornerStyle, name) || (looseEq(cornerStyle, 'default') && looseEq(rectStyle, name));
}

export class BasicRect2 extends Actor {
  rectStyle = 'square';
  size = 10;
  absoluteCornerSize = true;
  indent = 2;
  rectOutline = 'single';
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    this.strictDrawShape(c, 0, 0, w, h);
  }

  strictDrawShape(c: SvgCanvas, x: number, y: number, w: number, h: number, os?: BasicRect2Overrides | null): void {
    // read styles or optionally override them externally via "os" variable
    const rectStyle = (os && os.rectStyle) ? os.rectStyle : getValue(this.style, 'rectStyle', this.rectStyle);
    const absoluteCornerSize = (os && os.absoluteCornerSize) ? os.absoluteCornerSize
      : getValue(this.style, 'absoluteCornerSize', this.absoluteCornerSize);
    let size = (os && os.size) ? os.size : Math.max(0, Math.min(w, getFloat(this.style, 'size', this.size)));
    const rectOutline = (os && os.rectOutline) ? os.rectOutline : getValue(this.style, 'rectOutline', this.rectOutline);
    let indent = (os && os.indent) ? os.indent : Math.max(0, Math.min(w, getFloat(this.style, 'indent', this.indent)));
    const dashed = (os && os.dashed) ? os.dashed : getValue(this.style, 'dashed', false);
    const dashPattern = (os && os.dashPattern) ? os.dashPattern : getValue(this.style, 'dashPattern', null);
    const relIndent = (os && os.relIndent) ? os.relIndent : Math.max(0, Math.min(50, indent));
    const top = (os && os.top) ? os.top : getValue(this.style, 'top', true);
    const right = (os && os.right) ? os.right : getValue(this.style, 'right', true);
    const bottom = (os && os.bottom) ? os.bottom : getValue(this.style, 'bottom', true);
    const left = (os && os.left) ? os.left : getValue(this.style, 'left', true);
    const topLeftStyle = (os && os.topLeftStyle) ? os.topLeftStyle : getValue(this.style, 'topLeftStyle', 'default');
    const topRightStyle = (os && os.topRightStyle) ? os.topRightStyle : getValue(this.style, 'topRightStyle', 'default');
    const bottomRightStyle = (os && os.bottomRightStyle) ? os.bottomRightStyle
      : getValue(this.style, 'bottomRightStyle', 'default');
    const bottomLeftStyle = (os && os.bottomLeftStyle) ? os.bottomLeftStyle
      : getValue(this.style, 'bottomLeftStyle', 'default');
    const fillColor = (os && os.fillColor) ? os.fillColor : getValue(this.style, 'fillColor', '#ffffff');
    // strokeColor is read by draw.io but not used here
    const strokeWidth = (os && os.strokeWidth) ? os.strokeWidth : getValue(this.style, 'strokeWidth', '1');
    const fillColor2 = (os && os.fillColor2) ? os.fillColor2 : getValue(this.style, 'fillColor2', 'none');
    const gradientColor2 = (os && os.gradientColor2) ? os.gradientColor2 : getValue(this.style, 'gradientColor2', 'none');
    const gdir2 = (os && os.gradientDirection2) ? os.gradientDirection2
      : getValue(this.style, 'gradientDirection2', 'south');
    const opacity = (os && os.opacity) ? os.opacity : getValue(this.style, 'opacity', '100');

    const relSize = Math.max(0, Math.min(50, size));
    const sc = BasicRect2.prototype;

    c.setDashed(Boolean(dashed));

    if (dashPattern && !looseEq(dashPattern, '')) {
      // A number (eg. dashPattern=5) is ignored by mxSvgCanvas2D.createDashPattern
      c.setDashPattern(typeof dashPattern === 'string' ? dashPattern : '');
    }

    c.setStrokeWidth(toNumber(strokeWidth));

    size = Math.min(h * 0.5, w * 0.5, size);

    if (!absoluteCornerSize) {
      size = relSize * Math.min(w, h) / 100;
    }

    size = Math.min(size, Math.min(w, h) * 0.5);

    if (!absoluteCornerSize) {
      indent = Math.min(relIndent * Math.min(w, h) / 100);
    }

    indent = Math.min(indent, Math.min(w, h) * 0.5 - size);

    if ((top || right || bottom || left) && !looseEq(rectOutline, 'frame')) {
      //outline fill
      c.begin();
      if (!top) {
        c.moveTo(0, 0);
      } else {
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
      }

      if (top) {
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
      }

      sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);

      if (right) {
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
      }

      sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);

      if (bottom) {
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
      }

      sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);

      if (left) {
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
      }

      sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
      c.close();
      c.fill();

      c.setShadow(false);

      //inner fill
      c.setFillColor(str(fillColor2));
      let op1 = opacity;
      let op2 = opacity;

      if (looseEq(fillColor2, 'none')) {
        op1 = 0;
      }

      if (looseEq(gradientColor2, 'none')) {
        op2 = 0;
      }

      c.setGradient(str(fillColor2), str(gradientColor2), 0, 0, w, h, str(gdir2), toNumber(op1), toNumber(op2));

      c.begin();

      if (!top) {
        c.moveTo(indent, 0);
      } else {
        sc.moveNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
      }

      sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);

      if (left && bottom) {
        sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
      }

      sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);

      if (bottom && right) {
        sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
      }

      sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);

      if (right && top) {
        sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
      }

      sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);

      if (top && left) {
        sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
      }

      c.fill();

      if (looseEq(fillColor, 'none')) {
        c.begin();
        sc.paintFolds(c, x, y, w, h, rectStyle, topLeftStyle, topRightStyle, bottomRightStyle, bottomLeftStyle, size, top, right, bottom, left);
        c.stroke();
      }
    }

    //draw all the combinations
    if (!top && !right && !bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, topLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, topLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.lineNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && !right && bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.lineSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && !right && bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
          sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.lineNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && right && !bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.lineSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && right && !bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, topLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        }

        c.stroke();

        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, topLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.lineNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        c.close();
        c.fillAndStroke();

        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.lineSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && right && bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
          sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.lineSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        c.close();
        c.fillAndStroke();
      }
    } else if (!top && right && bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
          sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
          sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.lineNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, top, left);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && !right && !bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.lineNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && !right && !bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
          sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.lineNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && !right && bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        }

        c.stroke();

        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.lineNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        c.close();
        c.fillAndStroke();

        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.lineSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && !right && bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);

        if (looseEq(rectOutline, 'double')) {
          sc.moveNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
          sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
          sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.lineNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, right);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && right && !bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
          sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.lineSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && right && !bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
          sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
          sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.lineSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, bottom);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && right && bottom && !left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);

        if (looseEq(rectOutline, 'double')) {
          sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
          sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
          sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.lineSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        c.close();
        c.fillAndStroke();
      }
    } else if (top && right && bottom && left) {
      if (!looseEq(rectOutline, 'frame')) {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        c.close();

        if (looseEq(rectOutline, 'double')) {
          sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
          sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
          sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
          sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
          sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
          sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
          sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
          sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
          sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
          c.close();
        }

        c.stroke();
      } else {
        c.begin();
        sc.moveNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintNW(c, x, y, w, h, rectStyle, topLeftStyle, size, left);
        sc.paintTop(c, x, y, w, h, rectStyle, topRightStyle, size, right);
        sc.paintNE(c, x, y, w, h, rectStyle, topRightStyle, size, top);
        sc.paintRight(c, x, y, w, h, rectStyle, bottomRightStyle, size, bottom);
        sc.paintSE(c, x, y, w, h, rectStyle, bottomRightStyle, size, right);
        sc.paintBottom(c, x, y, w, h, rectStyle, bottomLeftStyle, size, left);
        sc.paintSW(c, x, y, w, h, rectStyle, bottomLeftStyle, size, bottom);
        sc.paintLeft(c, x, y, w, h, rectStyle, topLeftStyle, size, top);
        c.close();
        sc.moveSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, left);
        sc.paintSWInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom);
        sc.paintBottomInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent, right, bottom);
        sc.paintSEInner(c, x, y, w, h, rectStyle, bottomRightStyle, size, indent);
        sc.paintRightInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent, top, right);
        sc.paintNEInner(c, x, y, w, h, rectStyle, topRightStyle, size, indent);
        sc.paintTopInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent, left, top);
        sc.paintNWInner(c, x, y, w, h, rectStyle, topLeftStyle, size, indent);
        sc.paintLeftInner(c, x, y, w, h, rectStyle, bottomLeftStyle, size, indent, bottom, left);
        c.close();
        c.fillAndStroke();
      }
    }

    c.begin();
    sc.paintFolds(c, x, y, w, h, rectStyle, topLeftStyle, topRightStyle, bottomRightStyle, bottomLeftStyle, size, top, right, bottom, left);
    c.stroke();
  }

  moveNW(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, left: JsValue): void {
    if (isCorner(topLeftStyle, rectStyle, 'square') || !left) {
      c.moveTo(0, 0);
    } else {
      c.moveTo(0, size);
    }
  }

  moveNE(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, top: JsValue): void {
    if (isCorner(topRightStyle, rectStyle, 'square') || !top) {
      c.moveTo(w, 0);
    } else {
      c.moveTo(w - size, 0);
    }
  }

  moveSE(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, right: JsValue): void {
    if (isCorner(bottomRightStyle, rectStyle, 'square') || !right) {
      c.moveTo(w, h);
    } else {
      c.moveTo(w, h - size);
    }
  }

  moveSW(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, bottom: JsValue): void {
    if (isCorner(bottomLeftStyle, rectStyle, 'square') || !bottom) {
      c.moveTo(0, h);
    } else {
      c.moveTo(size, h);
    }
  }

  paintNW(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, left: JsValue): void {
    if (!left) {
      c.lineTo(0, 0);
    } else if (isCorner(topLeftStyle, rectStyle, 'rounded') || isCorner(topLeftStyle, rectStyle, 'invRound')) {
      let inv = 0;

      if (isCorner(topLeftStyle, rectStyle, 'rounded')) {
        inv = 1;
      }

      c.arcTo(size, size, 0, 0, inv, size, 0);
    } else if (isCorner(topLeftStyle, rectStyle, 'snip') || isCorner(topLeftStyle, rectStyle, 'fold')) {
      c.lineTo(size, 0);
    }
  }

  paintTop(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, right: JsValue): void {
    if (isCorner(topRightStyle, rectStyle, 'square') || !right) {
      c.lineTo(w, 0);
    } else {
      c.lineTo(w - size, 0);
    }
  }

  paintNE(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, top: JsValue): void {
    if (!top) {
      c.lineTo(w, 0);
    } else if (isCorner(topRightStyle, rectStyle, 'rounded') || isCorner(topRightStyle, rectStyle, 'invRound')) {
      let inv = 0;

      if (isCorner(topRightStyle, rectStyle, 'rounded')) {
        inv = 1;
      }

      c.arcTo(size, size, 0, 0, inv, w, size);
    } else if (isCorner(topRightStyle, rectStyle, 'snip') || isCorner(topRightStyle, rectStyle, 'fold')) {
      c.lineTo(w, size);
    }
  }

  paintRight(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, bottom: JsValue): void {
    if (isCorner(bottomRightStyle, rectStyle, 'square') || !bottom) {
      c.lineTo(w, h);
    } else {
      c.lineTo(w, h - size);
    }
  }

  paintLeft(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, top: JsValue): void {
    if (isCorner(topLeftStyle, rectStyle, 'square') || !top) {
      c.lineTo(0, 0);
    } else {
      c.lineTo(0, size);
    }
  }

  paintSE(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, right: JsValue): void {
    if (!right) {
      c.lineTo(w, h);
    } else if (isCorner(bottomRightStyle, rectStyle, 'rounded') || isCorner(bottomRightStyle, rectStyle, 'invRound')) {
      let inv = 0;

      if (isCorner(bottomRightStyle, rectStyle, 'rounded')) {
        inv = 1;
      }

      c.arcTo(size, size, 0, 0, inv, w - size, h);
    } else if (isCorner(bottomRightStyle, rectStyle, 'snip') || isCorner(bottomRightStyle, rectStyle, 'fold')) {
      c.lineTo(w - size, h);
    }
  }

  paintBottom(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, left: JsValue): void {
    if (isCorner(bottomLeftStyle, rectStyle, 'square') || !left) {
      c.lineTo(0, h);
    } else {
      c.lineTo(size, h);
    }
  }

  paintSW(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, bottom: JsValue): void {
    if (!bottom) {
      c.lineTo(0, h);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'rounded') || isCorner(bottomLeftStyle, rectStyle, 'invRound')) {
      let inv = 0;

      if (isCorner(bottomLeftStyle, rectStyle, 'rounded')) {
        inv = 1;
      }

      c.arcTo(size, size, 0, 0, inv, 0, h - size);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'snip') || isCorner(bottomLeftStyle, rectStyle, 'fold')) {
      c.lineTo(0, h - size);
    }
  }

  paintNWInner(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, indent: number): void {
    if (isCorner(topLeftStyle, rectStyle, 'rounded')) {
      c.arcTo(size - indent * 0.5, size - indent * 0.5, 0, 0, 0, indent, indent * 0.5 + size);
    } else if (isCorner(topLeftStyle, rectStyle, 'invRound')) {
      c.arcTo(size + indent, size + indent, 0, 0, 1, indent, indent + size);
    } else if (isCorner(topLeftStyle, rectStyle, 'snip')) {
      c.lineTo(indent, indent * 0.5 + size);
    } else if (isCorner(topLeftStyle, rectStyle, 'fold')) {
      c.lineTo(indent + size, indent + size);
      c.lineTo(indent, indent + size);
    }
  }

  paintTopInner(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, indent: number, left: JsValue, top: JsValue): void {
    if (!left && !top) {
      c.lineTo(0, 0);
    } else if (!left && top) {
      c.lineTo(0, indent);
    } else if (left && !top) {
      c.lineTo(indent, 0);
    } else if (!left) {
      c.lineTo(0, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'square')) {
      c.lineTo(indent, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'rounded') || isCorner(topLeftStyle, rectStyle, 'snip')) {
      c.lineTo(size + indent * 0.5, indent);
    } else {
      c.lineTo(size + indent, indent);
    }
  }

  paintNEInner(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, indent: number): void {
    if (isCorner(topRightStyle, rectStyle, 'rounded')) {
      c.arcTo(size - indent * 0.5, size - indent * 0.5, 0, 0, 0, w - size - indent * 0.5, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'invRound')) {
      c.arcTo(size + indent, size + indent, 0, 0, 1, w - size - indent, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - size - indent * 0.5, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'fold')) {
      c.lineTo(w - size - indent, size + indent);
      c.lineTo(w - size - indent, indent);
    }
  }

  paintRightInner(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, indent: number, top: JsValue, right: JsValue): void {
    if (!top && !right) {
      c.lineTo(w, 0);
    } else if (!top && right) {
      c.lineTo(w - indent, 0);
    } else if (top && !right) {
      c.lineTo(w, indent);
    } else if (!top) {
      c.lineTo(w - indent, 0);
    } else if (isCorner(topRightStyle, rectStyle, 'square')) {
      c.lineTo(w - indent, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'rounded') || isCorner(topRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - indent, size + indent * 0.5);
    } else {
      c.lineTo(w - indent, size + indent);
    }
  }

  paintLeftInner(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, indent: number, bottom: JsValue, left: JsValue): void {
    if (!bottom && !left) {
      c.lineTo(0, h);
    } else if (!bottom && left) {
      c.lineTo(indent, h);
    } else if (bottom && !left) {
      c.lineTo(0, h - indent);
    } else if (!bottom) {
      c.lineTo(indent, h);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'square')) {
      c.lineTo(indent, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'rounded') || isCorner(bottomLeftStyle, rectStyle, 'snip')) {
      c.lineTo(indent, h - size - indent * 0.5);
    } else {
      c.lineTo(indent, h - size - indent);
    }
  }

  paintSEInner(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, indent: number): void {
    if (isCorner(bottomRightStyle, rectStyle, 'rounded')) {
      c.arcTo(size - indent * 0.5, size - indent * 0.5, 0, 0, 0, w - indent, h - size - indent * 0.5);
    } else if (isCorner(bottomRightStyle, rectStyle, 'invRound')) {
      c.arcTo(size + indent, size + indent, 0, 0, 1, w - indent, h - size - indent);
    } else if (isCorner(bottomRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - indent, h - size - indent * 0.5);
    } else if (isCorner(bottomRightStyle, rectStyle, 'fold')) {
      c.lineTo(w - size - indent, h - size - indent);
      c.lineTo(w - indent, h - size - indent);
    }
  }

  paintBottomInner(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, indent: number, right: JsValue, bottom: JsValue): void {
    if (!right && !bottom) {
      c.lineTo(w, h);
    } else if (!right && bottom) {
      c.lineTo(w, h - indent);
    } else if (right && !bottom) {
      c.lineTo(w - indent, h);
    } else if (isCorner(bottomRightStyle, rectStyle, 'square') || !right) {
      c.lineTo(w - indent, h - indent);
    } else if (isCorner(bottomRightStyle, rectStyle, 'rounded') || isCorner(bottomRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - size - indent * 0.5, h - indent);
    } else {
      c.lineTo(w - size - indent, h - indent);
    }
  }

  paintSWInner(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, indent: number, bottom: JsValue): void {
    if (!bottom) {
      c.lineTo(indent, h);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'square')) {
      c.lineTo(indent, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'rounded')) {
      c.arcTo(size - indent * 0.5, size - indent * 0.5, 0, 0, 0, size + indent * 0.5, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'invRound')) {
      c.arcTo(size + indent, size + indent, 0, 0, 1, size + indent, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'snip')) {
      c.lineTo(size + indent * 0.5, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'fold')) {
      c.lineTo(indent + size, h - size - indent);
      c.lineTo(indent + size, h - indent);
    }
  }

  moveSWInner(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, indent: number, left: JsValue): void {
    if (!left) {
      c.moveTo(0, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'square')) {
      c.moveTo(indent, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'rounded') || isCorner(bottomLeftStyle, rectStyle, 'snip')) {
      c.moveTo(indent, h - size - indent * 0.5);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'invRound') || isCorner(bottomLeftStyle, rectStyle, 'fold')) {
      c.moveTo(indent, h - size - indent);
    }
  }

  lineSWInner(c: SvgCanvas, _x: number, _y: number, _w: number, h: number, rectStyle: JsValue, bottomLeftStyle: JsValue, size: number, indent: number, left: JsValue): void {
    if (!left) {
      c.lineTo(0, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'square')) {
      c.lineTo(indent, h - indent);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'rounded') || isCorner(bottomLeftStyle, rectStyle, 'snip')) {
      c.lineTo(indent, h - size - indent * 0.5);
    } else if (isCorner(bottomLeftStyle, rectStyle, 'invRound') || isCorner(bottomLeftStyle, rectStyle, 'fold')) {
      c.lineTo(indent, h - size - indent);
    }
  }

  moveSEInner(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, indent: number, bottom: JsValue): void {
    if (!bottom) {
      c.moveTo(w - indent, h);
    } else if (isCorner(bottomRightStyle, rectStyle, 'square')) {
      c.moveTo(w - indent, h - indent);
    } else if (isCorner(bottomRightStyle, rectStyle, 'rounded') || isCorner(bottomRightStyle, rectStyle, 'snip')) {
      c.moveTo(w - indent, h - size - indent * 0.5);
    } else if (isCorner(bottomRightStyle, rectStyle, 'invRound') || isCorner(bottomRightStyle, rectStyle, 'fold')) {
      c.moveTo(w - indent, h - size - indent);
    }
  }

  lineSEInner(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, bottomRightStyle: JsValue, size: number, indent: number, bottom: JsValue): void {
    if (!bottom) {
      c.lineTo(w - indent, h);
    } else if (isCorner(bottomRightStyle, rectStyle, 'square')) {
      c.lineTo(w - indent, h - indent);
    } else if (isCorner(bottomRightStyle, rectStyle, 'rounded') || isCorner(bottomRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - indent, h - size - indent * 0.5);
    } else if (isCorner(bottomRightStyle, rectStyle, 'invRound') || isCorner(bottomRightStyle, rectStyle, 'fold')) {
      c.lineTo(w - indent, h - size - indent);
    }
  }

  moveNEInner(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, indent: number, right: JsValue): void {
    if (!right) {
      c.moveTo(w, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'square') || right) {
      c.moveTo(w - indent, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'rounded') || isCorner(topRightStyle, rectStyle, 'snip')) {
      c.moveTo(w - indent, size + indent * 0.5);
    } else if (isCorner(topRightStyle, rectStyle, 'invRound') || isCorner(topRightStyle, rectStyle, 'fold')) {
      c.moveTo(w - indent, size + indent);
    }
  }

  lineNEInner(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, rectStyle: JsValue, topRightStyle: JsValue, size: number, indent: number, right: JsValue): void {
    if (!right) {
      c.lineTo(w, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'square') || right) {
      c.lineTo(w - indent, indent);
    } else if (isCorner(topRightStyle, rectStyle, 'rounded') || isCorner(topRightStyle, rectStyle, 'snip')) {
      c.lineTo(w - indent, size + indent * 0.5);
    } else if (isCorner(topRightStyle, rectStyle, 'invRound') || isCorner(topRightStyle, rectStyle, 'fold')) {
      c.lineTo(w - indent, size + indent);
    }
  }

  moveNWInner(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, indent: number, top: JsValue, left: JsValue): void {
    if (!top && !left) {
      c.moveTo(0, 0);
    } else if (!top && left) {
      c.moveTo(indent, 0);
    } else if (top && !left) {
      c.moveTo(0, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'square')) {
      c.moveTo(indent, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'rounded') || isCorner(topLeftStyle, rectStyle, 'snip')) {
      c.moveTo(indent, size + indent * 0.5);
    } else if (isCorner(topLeftStyle, rectStyle, 'invRound') || isCorner(topLeftStyle, rectStyle, 'fold')) {
      c.moveTo(indent, size + indent);
    }
  }

  lineNWInner(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, rectStyle: JsValue, topLeftStyle: JsValue, size: number, indent: number, top: JsValue, left: JsValue): void {
    if (!top && !left) {
      c.lineTo(0, 0);
    } else if (!top && left) {
      c.lineTo(indent, 0);
    } else if (top && !left) {
      c.lineTo(0, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'square')) {
      c.lineTo(indent, indent);
    } else if (isCorner(topLeftStyle, rectStyle, 'rounded') || isCorner(topLeftStyle, rectStyle, 'snip')) {
      c.lineTo(indent, size + indent * 0.5);
    } else if (isCorner(topLeftStyle, rectStyle, 'invRound') || isCorner(topLeftStyle, rectStyle, 'fold')) {
      c.lineTo(indent, size + indent);
    }
  }

  paintFolds(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rectStyle: JsValue, topLeftStyle: JsValue,
    topRightStyle: JsValue, bottomRightStyle: JsValue, bottomLeftStyle: JsValue, size: number,
    top: JsValue, right: JsValue, bottom: JsValue, left: JsValue): void {
    if (looseEq(rectStyle, 'fold') || looseEq(topLeftStyle, 'fold') || looseEq(topRightStyle, 'fold')
      || looseEq(bottomRightStyle, 'fold') || looseEq(bottomLeftStyle, 'fold')) {
      if (isCorner(topLeftStyle, rectStyle, 'fold') && (top && left)) {
        c.moveTo(0, size);
        c.lineTo(size, size);
        c.lineTo(size, 0);
      }

      if (isCorner(topRightStyle, rectStyle, 'fold') && (top && right)) {
        c.moveTo(w - size, 0);
        c.lineTo(w - size, size);
        c.lineTo(w, size);
      }

      if (isCorner(bottomRightStyle, rectStyle, 'fold') && (bottom && right)) {
        c.moveTo(w - size, h);
        c.lineTo(w - size, h - size);
        c.lineTo(w, h - size);
      }

      if (isCorner(bottomLeftStyle, rectStyle, 'fold') && (bottom && left)) {
        c.moveTo(0, h - size);
        c.lineTo(size, h - size);
        c.lineTo(size, h);
      }
    }
  }
}

/**
 * The shapes of mxBasic.js in the order it registers them, after
 * mxgraph.basic.rect, which Shapes.js registers before the library loads.
 */
export const BASIC_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.basic.rect', BasicRect2],
  ['mxgraph.basic.cross2', BasicCross],
  ['mxgraph.basic.rectCallout', BasicRectCallout],
  ['mxgraph.basic.roundRectCallout', BasicRoundRectCallout],
  ['mxgraph.basic.wave2', BasicWave],
  ['mxgraph.basic.octagon2', BasicOctagon],
  ['mxgraph.basic.isocube', BasicIsoCube],
  ['mxgraph.basic.acute_triangle', BasicTriangleAcute],
  ['mxgraph.basic.obtuse_triangle', BasicTriangleObtuse],
  ['mxgraph.basic.drop', BasicDrop],
  ['mxgraph.basic.cone2', BasicCone2],
  ['mxgraph.basic.pyramid', BasicPyramid],
  ['mxgraph.basic.4_point_star_2', Basic4PointStar2],
  ['mxgraph.basic.diag_snip_rect', BasicDiagSnipRect],
  ['mxgraph.basic.diag_round_rect', BasicDiagRoundRect],
  ['mxgraph.basic.corner_round_rect', BasicCornerRoundRect],
  ['mxgraph.basic.plaque', BasicPlaque],
  ['mxgraph.basic.frame', BasicFrame],
  ['mxgraph.basic.plaque_frame', BasicPlaqueFrame],
  ['mxgraph.basic.rounded_frame', BasicRoundedFrame],
  ['mxgraph.basic.frame_corner', BasicFrameCorner],
  ['mxgraph.basic.diag_stripe', BasicDiagStripe],
  ['mxgraph.basic.donut', BasicDonut],
  ['mxgraph.basic.layered_rect', BasicLayeredRect],
  ['mxgraph.basic.button', BasicButton],
  ['mxgraph.basic.shaded_button', BasicShadedButton],
  ['mxgraph.basic.pie', BasicPie],
  ['mxgraph.basic.arc', BasicArc],
  ['mxgraph.basic.partConcEllipse', BasicPartConcEllipse],
  ['mxgraph.basic.numberedEntryVert', BasicNumEntryVert],
  ['mxgraph.basic.bendingArch', BasicBendingArch],
  ['mxgraph.basic.three_corner_round_rect', BasicThreeCornerRoundRect],
  ['mxgraph.basic.polygon', BasicPolygon],
  ['mxgraph.basic.patternFillRect', BasicPatternFillRect],
];
