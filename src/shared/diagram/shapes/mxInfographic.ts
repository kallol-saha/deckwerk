/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxInfographic.js — the infographic shapes (mxgraph.infographic.*:
 * numbered entry, bending arch, ribbons, banners, callouts, shaded
 * triangle/pyramid/cube, cylinder, dial, flag, …) and their connection points.
 * Modified for DeckWerk: handles and customProperties tables are left out;
 * the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Style } from '../types.js';
import { Actor, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getFloat, getValue } from './util.js';

/** `mxUtils.getValue(this.style, key, fallback)` passed to setFillColor (a number is painted as its string). */
function styleColor(style: Style, key: string, fallback: string): string {
  return String(getValue(style, key, fallback));
}

// --- Numbered entry (vertical) ------------------------------------------------------------

export class ShapeInfographicNumEntryVert extends Actor {
  dy = 0.5;

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

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(w, getFloat(this.style, 'dy', this.dy)));
    const inset = 5;
    const d = Math.min(dy, w - 2 * inset, h - inset);

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 0, false, 0, d * 0.5));
    constr.push(constraint(1, 0, false, 0, d * 0.5));
    constr.push(constraint(0, 0.5, false, 0, d * 0.25));
    constr.push(constraint(1, 0.5, false, 0, d * 0.25));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(1, 1, false));

    return constr;
  }
}

// --- Bending Arch -------------------------------------------------------------------------

export class ShapeInfographicBendingArch extends Actor {
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

// --- Parallelogram ------------------------------------------------------------------------

export class ShapeInfographicParallelogram extends Actor {
  dx = 10;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w * 0.5, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(0, h);
    c.lineTo(2 * dx, 0);
    c.lineTo(w, 0);
    c.lineTo(w - 2 * dx, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w * 0.5, getFloat(this.style, 'dx', this.dx)));

    // Relative points with the fixed slant as offsets, so edges follow a resize
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0, false, 2 * dx, 0));
    constr.push(constraint(0.5, 0, false, dx, 0));
    constr.push(constraint(0, 0.5, false, dx, 0));
    constr.push(constraint(1, 0, false));
    constr.push(constraint(1, 1, false, -2 * dx, 0));
    constr.push(constraint(1, 0.5, false, -dx, 0));
    constr.push(constraint(0.5, 1, false, -dx, 0));

    return constr;
  }
}

// --- Ribbon Rolled ------------------------------------------------------------------------

export class ShapeInfographicRibbonRolled extends Actor {
  dx = 185;
  dy = 15;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - dy);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.close();
    c.moveTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - dy);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, _w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));

    // Relative points with the fixed ribbon width as offsets, so edges follow
    // a resize
    constr.push(constraint(0, 0, false, 0, dy));
    constr.push(constraint(0.25, 0, false, 0, dy));
    constr.push(constraint(0.5, 0, false, 0, dy));
    constr.push(constraint(0.75, 0, false, 0, dy));
    constr.push(constraint(1, 0, false, 0, dy));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 1, false, 0, -dy));
    constr.push(constraint(0.75, 1, false, 0, -dy));
    constr.push(constraint(0.5, 1, false, 0, -dy));
    constr.push(constraint(0.25, 1, false, 0, -dy));
    constr.push(constraint(0, 1, false, 0, -dy));
    constr.push(constraint(0, 0.5, false));

    return constr;
  }
}

// --- Ribbon Double Folded -----------------------------------------------------------------

export class ShapeInfographicRibbonDoubleFolded extends Actor {
  dx = 25;
  dy = 15;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - dy);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, h - 2 * dy);
    c.lineTo(0, h - dy);
    c.close();
    c.moveTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w, h - dy);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - dy);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, _w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));

    // Relative points with the fixed ribbon width as offsets, so edges follow
    // a resize
    constr.push(constraint(0, 0, false, 0, dy));
    constr.push(constraint(0.25, 0, false, 0, dy));
    constr.push(constraint(0.5, 0, false, 0, dy));
    constr.push(constraint(0.75, 0, false, 0, dy));
    constr.push(constraint(1, 0, false, 0, dy));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 1, false, 0, -dy));
    constr.push(constraint(0.75, 1, false, 0, -dy));
    constr.push(constraint(0.5, 1, false, 0, -dy));
    constr.push(constraint(0.25, 1, false, 0, -dy));
    constr.push(constraint(0, 1, false, 0, -dy));
    constr.push(constraint(0, 0.5, false));

    return constr;
  }
}

// --- Ribbon Front Folded ------------------------------------------------------------------

export class ShapeInfographicRibbonFrontFolded extends Actor {
  dx = 0.5;
  dy = 0.5;
  notch = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    const notch = Math.max(0, Math.min(w - dx, getFloat(this.style, 'notch', this.notch)));

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) / 2 + dy);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, h - dy);
    c.lineTo(0, h);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) / 2 + dy);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    const notch = Math.max(0, Math.min(w - dx, getFloat(this.style, 'notch', this.notch)));

    // Relative points with the fixed ribbon width and notch as offsets, so
    // edges follow a resize
    constr.push(constraint(0, 0, false, 0, dy));
    constr.push(constraint(0.25, 0, false, 0, dy));
    constr.push(constraint(0.5, 0, false, 0, dy));
    constr.push(constraint(0.75, 0, false, 0, dy));
    constr.push(constraint(1, 0, false, 0, dy));
    constr.push(constraint(1, 0.5, false, -notch, dy * 0.5));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(0.75, 1, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.25, 1, false));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0.5, false, 0, dy * 0.5));

    return constr;
  }
}

// --- Ribbon Back Folded -------------------------------------------------------------------

export class ShapeInfographicRibbonBackFolded extends Actor {
  dx = 0.5;
  dy = 0.5;
  notch = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    const notch = Math.max(0, Math.min(w - dx, getFloat(this.style, 'notch', this.notch)));

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) / 2 + dy);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, 0);
    c.lineTo(dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) / 2 + dy);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    const notch = Math.max(0, Math.min(w - dx, getFloat(this.style, 'notch', this.notch)));

    // Relative points with the fixed ribbon width and notch as offsets, so
    // edges follow a resize
    constr.push(constraint(0, 0, false, 0, dy));
    constr.push(constraint(0.25, 0, false, 0, dy));
    constr.push(constraint(0.5, 0, false, 0, dy));
    constr.push(constraint(0.75, 0, false, 0, dy));
    constr.push(constraint(1, 0, false, 0, dy));
    constr.push(constraint(1, 0.5, false, -notch, dy * 0.5));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(0.75, 1, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.25, 1, false));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0.5, false, 0, dy * 0.5));

    return constr;
  }
}

// --- Banner -------------------------------------------------------------------------------

export class ShapeInfographicBanner extends Actor {
  dx = 0.5;
  dy = 0.5;
  notch = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w / 2, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    let notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    dx = Math.min(w / 2 - 2 * dy, dx);

    notch = Math.min(dx, notch);

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, dy);
    c.lineTo(dx, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w - dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) * 0.5 + dy);
    c.lineTo(w, h);
    c.lineTo(w - dx - 2 * dy, h);
    c.lineTo(w - dx - 2 * dy, h - dy);
    c.lineTo(dx + 2 * dy, h - dy);
    c.lineTo(dx + 2 * dy, h);
    c.lineTo(0, h);
    c.lineTo(notch, (h - dy) * 0.5 + dy);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(0, dy);
    c.lineTo(dx, dy);
    c.lineTo(dx, h - dy);
    c.lineTo(dx + 2 * dy, h);
    c.lineTo(0, h);
    c.lineTo(notch, (h - dy) * 0.5 + dy);
    c.close();
    c.moveTo(w, dy);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx, h - dy);
    c.lineTo(w - dx - 2 * dy, h);
    c.lineTo(w, h);
    c.lineTo(w - notch, (h - dy) * 0.5 + dy);
    c.close();
    c.fill();

    c.setFillAlpha(0.4);
    c.begin();
    c.moveTo(dx, h - dy);
    c.lineTo(dx + 2 * dy, h - dy);
    c.lineTo(dx + 2 * dy, h);
    c.close();
    c.moveTo(w - dx, h - dy);
    c.lineTo(w - dx - 2 * dy, h - dy);
    c.lineTo(w - dx - 2 * dy, h);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    let dx = Math.max(0, Math.min(w / 2, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    let notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    dx = Math.min(w / 2 - 2 * dy, dx);
    notch = Math.min(dx, notch);

    // Relative points with the fixed fold, ribbon width and notch as offsets,
    // so edges follow a resize
    constr.push(constraint(0, 0, false, dx, 0));
    constr.push(constraint(0.25, 0, false, dx * 0.5, 0));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0, false, -dx * 0.5, 0));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0.5, false, -dx, -dy * 0.5));
    constr.push(constraint(1, 1, false, -dx, -dy));
    constr.push(constraint(0.75, 1, false, -dx * 0.5, -dy));
    constr.push(constraint(0.5, 1, false, 0, -dy));
    constr.push(constraint(0.25, 1, false, dx * 0.5, -dy));
    constr.push(constraint(0, 1, false, dx, -dy));
    constr.push(constraint(0, 0.5, false, dx, -dy * 0.5));
    constr.push(constraint(0, 0.5, false, notch, dy * 0.5));
    constr.push(constraint(1, 0.5, false, -notch, dy * 0.5));

    return constr;
  }
}

// --- Circular Callout ---------------------------------------------------------------------

export class ShapeInfographicCircularCallout extends Actor {
  dy = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));

    const rx = Math.max(0, Math.min(w * 0.5, w * 0.5 - dy));
    const ry = Math.max(0, Math.min(h * 0.5, h * 0.5 - dy));

    c.begin();
    c.moveTo(w, h * 0.5);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, w * 0.5, h);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, 0, h * 0.5);
    c.arcTo(w * 0.5, h * 0.5, 0, 0, 1, w * 0.5, 0);
    c.lineTo(w, 0);
    c.close();
    c.moveTo(w * 0.5, dy);
    c.arcTo(rx, ry, 0, 0, 0, w * 0.5 - rx, h * 0.5);
    c.arcTo(rx, ry, 0, 0, 0, w * 0.5, h * 0.5 + ry);
    c.arcTo(rx, ry, 0, 0, 0, w * 0.5 + rx, h * 0.5);
    c.arcTo(rx, ry, 0, 0, 0, w * 0.5, h * 0.5 - ry);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(1, 0, false));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0.855, 0.855, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.145, 0.855, false));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(0.145, 0.145, false));

    return constr;
  }
}

// --- Shaded triangle ----------------------------------------------------------------------

export class ShapeInfographicShadedTriangle extends Actor {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.setFillColor('#ffffff');
    c.setFillAlpha(0.2);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5, h * 0.67);
    c.close();
    c.fill();

    c.setFillColor('#000000');

    c.begin();
    c.moveTo(w, h);
    c.lineTo(w * 0.5, h * 0.67);
    c.lineTo(w * 0.5, 0);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0.5, false));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0.25, 0.5, false));

    return constr;
  }
}

// --- Shaded pyramid -----------------------------------------------------------------------

export class ShapeInfographicShadedPyramid extends Actor {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const h1 = Math.max(h - w * 0.3, 0);
    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h1);
    c.lineTo(w * 0.5, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.setFillColor('#ffffff');
    c.setFillAlpha(0.2);

    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5, h);
    c.close();
    c.fill();

    c.setFillColor('#000000');

    c.begin();
    c.moveTo(w, h1);
    c.lineTo(w * 0.5, h);
    c.lineTo(w * 0.5, 0);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h1);
    c.lineTo(w * 0.5, h);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const h1 = Math.max(h - w * 0.3, 0);
    // The side corners are drawn above the bottom by a distance from the width:
    // anchored to the bottom with offsets, so edges follow a resize that keeps
    // the width (eg. a taller pyramid)
    const d1 = h1 - h;

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0.5, false, 0, d1 * 0.5));
    constr.push(constraint(1, 1, false, 0, d1));
    constr.push(constraint(0.75, 1, false, 0, d1 * 0.5));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.25, 1, false, 0, d1 * 0.5));
    constr.push(constraint(0, 1, false, 0, d1));
    constr.push(constraint(0.25, 0.5, false, 0, d1 * 0.5));

    return constr;
  }
}

// --- Pyramid step -------------------------------------------------------------------------

export class ShapeInfographicPyramidStep extends Actor {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const h1 = Math.max(w * 0.1, 0);
    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h1);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.setFillColor('#ffffff');
    c.setFillAlpha(0.2);

    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5, h);
    c.lineTo(0, h);
    c.close();
    c.fill();

    c.setFillColor('#000000');

    c.begin();
    c.moveTo(w, h1);
    c.lineTo(w, h);
    c.lineTo(w * 0.5, h);
    c.lineTo(w * 0.5, 0);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, h1);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h1);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const h1 = Math.max(w * 0.1, 0);
    // The roof height is drawn from the width: anchored to the nearest side
    // with offsets, so edges follow a resize that keeps the width (eg. a
    // taller step)

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0, false, 0, h1 * 0.5));
    constr.push(constraint(1, 0, false, 0, h1));
    constr.push(constraint(1, 0.25, false, 0, h1 * 0.75));
    constr.push(constraint(1, 0.5, false, 0, h1 * 0.5));
    constr.push(constraint(1, 0.75, false, 0, h1 * 0.25));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(0.75, 1, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.25, 1, false));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0.75, false, 0, h1 * 0.25));
    constr.push(constraint(0, 0.5, false, 0, h1 * 0.5));
    constr.push(constraint(0, 0.25, false, 0, h1 * 0.75));
    constr.push(constraint(0.25, 0, false, 0, h1 * 0.5));
    constr.push(constraint(0, 0, false, 0, h1));
    return constr;
  }
}

// --- Cylinder -----------------------------------------------------------------------------

export class ShapeInfographicCylinder extends Actor {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = 20;
    const rx = w * 0.5;
    const ry = dy * 0.5;

    c.begin();
    c.moveTo(0, dy * 0.5);
    c.arcTo(rx, ry, 0, 0, 1, w, ry);
    c.lineTo(w, h - ry);
    c.arcTo(rx, ry, 0, 0, 1, 0, h - ry);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setGradient('#000000', '#ffffff', 0, 0, w, h, 'east', 0.4, 0.4);

    c.begin();
    c.moveTo(0, dy * 0.5);
    c.arcTo(rx, ry, 0, 0, 0, w, ry);
    c.lineTo(w, h - ry);
    c.arcTo(rx, ry, 0, 0, 1, 0, h - ry);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(0, dy * 0.5);
    c.arcTo(rx, ry, 0, 0, 1, w, ry);
    c.lineTo(w, h - ry);
    c.arcTo(rx, ry, 0, 0, 1, 0, h - ry);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = 20;

    // Relative points with the fixed size of the caps as offsets, so edges
    // follow a resize
    constr.push(constraint(0, 0, false, 0, dy * 0.5));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(1, 0, false, 0, dy * 0.5));
    constr.push(constraint(1, 0.25, false, 0, dy * 0.25));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 0.75, false, 0, -dy * 0.25));
    constr.push(constraint(1, 1, false, 0, -dy * 0.5));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 1, false, 0, -dy * 0.5));
    constr.push(constraint(0, 0.75, false, 0, -dy * 0.25));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(0, 0.25, false, 0, dy * 0.25));

    return constr;
  }
}

// --- Circular Callout 2 -------------------------------------------------------------------

export class ShapeInfographicCircularCallout2 extends Actor {
  dy = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const fillColor = styleColor(this.style, 'fillColor', 'none');
    const strokeColor = styleColor(this.style, 'strokeColor', 'none');
    c.setFillColor(strokeColor);

    const rx = Math.max(0, Math.min(w * 0.5, h * 0.4, h * 0.5 - 7));

    c.begin();
    c.moveTo(w * 0.5 - 2, 2.15 * rx);
    c.arcTo(rx * 0.23, rx * 0.23, 0, 0, 0, w * 0.5 - rx * 0.2, rx * 1.97);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5 - rx, rx);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5, 0);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5 + rx, rx);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5 + rx * 0.2, rx * 1.97);
    c.arcTo(rx * 0.23, rx * 0.23, 0, 0, 0, w * 0.5 + 2, 2.15 * rx);

    const rxMin = Math.max(rx * 0.1, 6);

    if (rx * 0.04 > 4) {
      c.lineTo(w * 0.5 + 2, h - rx * 0.22);
      c.arcTo(rx * 0.05, rx * 0.05, 0, 0, 0, w * 0.5 + rx * 0.04, h - rx * 0.19);
    } else {
      c.lineTo(w * 0.5 + 2, h - 2 * rxMin);
    }

    c.arcTo(rxMin, rxMin, 0, 0, 1, w * 0.5 + rxMin, h - rxMin);
    c.arcTo(rxMin, rxMin, 0, 0, 1, w * 0.5, h);
    c.arcTo(rxMin, rxMin, 0, 0, 1, w * 0.5 - rxMin, h - rxMin);

    if (rx * 0.04 > 4) {
      c.arcTo(rxMin, rxMin, 0, 0, 1, w * 0.5 - rx * 0.04, h - rx * 0.19);
      c.arcTo(rxMin * 0.5, rxMin * 0.5, 0, 0, 0, w * 0.5 - 2, h - rx * 0.22);
    } else {
      c.arcTo(rxMin, rxMin, 0, 0, 1, w * 0.5 - 2, h - 2 * rxMin);
    }

    c.close();
    c.moveTo(w * 0.5, rx * 0.2);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5 - rx * 0.8, rx * 0.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5, rx * 1.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5 + rx * 0.8, rx * 0.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5, rx * 0.2);
    c.close();
    c.moveTo(w * 0.5, h - rxMin * 1.75);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5 - rxMin * 0.75, h - rxMin);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5, h - rxMin * 0.25);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5 + rxMin * 0.75, h - rxMin);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5, h - rxMin * 1.75);
    c.close();
    c.fill();

    c.setFillColor(fillColor);
    c.setShadow(false);

    c.begin();
    c.moveTo(w * 0.5, rx * 0.2);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5 - rx * 0.8, rx * 0.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5, rx * 1.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5 + rx * 0.8, rx * 0.8);
    c.arcTo(rx * 0.8, rx * 0.8, 0, 0, 0, w * 0.5, rx * 0.2);
    c.close();
    c.moveTo(w * 0.5, h - rxMin * 1.75);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5 - rxMin * 0.75, h - rxMin);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5, h - rxMin * 0.25);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5 + rxMin * 0.75, h - rxMin);
    c.arcTo(rxMin * 0.75, rxMin * 0.75, 0, 0, 0, w * 0.5, h - rxMin * 1.75);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const rx = Math.max(0, Math.min(w * 0.5, h * 0.4, h * 0.5 - 7));
    // The circle is drawn from the smaller side: anchored to the top with the
    // radius as offset, so edges follow a resize that keeps the smaller side
    // (eg. a taller callout). The x of a circle as wide as the shape is
    // relative to the width, else the radius is an offset from the middle.
    const fx = (rx === w * 0.5) ? 0.5 : 0;
    const ox = (rx === w * 0.5) ? 0 : rx;

    constr.push(constraint(0.5 - fx, 0, false, -ox, rx));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5 + fx, 0, false, ox, rx));
    constr.push(constraint(0.5, 1, false));

    return constr;
  }
}

// --- Banner Single Fold -------------------------------------------------------------------

export class ShapeInfographicBannerSingleFold extends Actor {
  dx = 0.5;
  dy = 0.5;
  dx2 = 0.5;
  notch = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    let notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    dx = Math.min(w - 2 * dy, dx);

    const dx2 = Math.max(0, Math.min(w - dx - 2 * dy, getFloat(this.style, 'dx2', this.dx2)));

    notch = Math.min(dx, notch);

    c.begin();
    c.moveTo(dx2, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w - dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) * 0.5 + dy);
    c.lineTo(w, h);
    c.lineTo(w - dx - 2 * dy, h);
    c.lineTo(w - dx - 2 * dy, h - dy);
    c.lineTo(dx2, h - dy);
    c.lineTo(0, (h - dy) * 0.5);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.05);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(w, dy);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx, h - dy);
    c.lineTo(w - dx - 2 * dy, h);
    c.lineTo(w, h);
    c.lineTo(w - notch, (h - dy) * 0.5 + dy);
    c.close();
    c.fill();

    c.setFillAlpha(0.4);
    c.begin();
    c.moveTo(w - dx, h - dy);
    c.lineTo(w - dx - 2 * dy, h - dy);
    c.lineTo(w - dx - 2 * dy, h);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(dx2, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w - dx, dy);
    c.lineTo(w, dy);
    c.lineTo(w - notch, (h - dy) * 0.5 + dy);
    c.lineTo(w, h);
    c.lineTo(w - dx - 2 * dy, h);
    c.lineTo(w - dx - 2 * dy, h - dy);
    c.lineTo(dx2, h - dy);
    c.lineTo(0, (h - dy) * 0.5);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'dy', this.dy)));
    let notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    dx = Math.min(w - 2 * dy, dx);
    const dx2 = Math.max(0, Math.min(w - dx - 2 * dy, getFloat(this.style, 'dx2', this.dx2)));
    notch = Math.min(dx, notch);

    // Relative points with the fixed fold, spike, banner width and notch as
    // offsets, so edges follow a resize
    constr.push(constraint(0, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(0, 0, false, dx2, 0));
    constr.push(constraint(0.25, 0, false, dx2 * 0.75 - dx * 0.25, 0));
    constr.push(constraint(0.5, 0, false, (dx2 - dx) * 0.5, 0));
    constr.push(constraint(0.75, 0, false, dx2 * 0.25 - dx * 0.75, 0));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0, false, -dx * 0.25, dy));
    constr.push(constraint(1, 0, false, -dx * 0.5, dy));
    constr.push(constraint(1, 0, false, -dx * 0.75, dy));
    constr.push(constraint(1, 0, false, 0, dy));
    constr.push(constraint(1, 0.5, false, -notch, dy * 0.5));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(1, 1, false, -dx - 2 * dy, 0));
    constr.push(constraint(1, 1, false, -(dx + 2 * dy) * 0.75, 0));
    constr.push(constraint(1, 1, false, -(dx + 2 * dy) * 0.5, 0));
    constr.push(constraint(1, 1, false, -(dx + 2 * dy) * 0.25, 0));
    constr.push(constraint(0, 1, false, dx2, -dy));
    constr.push(constraint(0.25, 1, false, dx2 * 0.75 - dx * 0.25, -dy));
    constr.push(constraint(0.5, 1, false, (dx2 - dx) * 0.5, -dy));
    constr.push(constraint(0.75, 1, false, dx2 * 0.25 - dx * 0.75, -dy));
    constr.push(constraint(1, 1, false, -dx, -dy));

    return constr;
  }
}

// --- Shaded Cube --------------------------------------------------------------------------

export class ShapeInfographicShadedCube extends Actor {
  isoAngle = 15;

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
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');

    c.begin();
    c.moveTo(w * 0.5, 2 * isoH);
    c.lineTo(w, isoH);
    c.lineTo(w, h - isoH);
    c.lineTo(w * 0.5, h);
    c.close();
    c.fill();

    c.setFillColor('#ffffff');
    c.begin();
    c.moveTo(w * 0.5, 2 * isoH);
    c.lineTo(0, isoH);
    c.lineTo(0, h - isoH);
    c.lineTo(w * 0.5, h);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const isoAngle = Math.max(0.01, Math.min(94, getFloat(this.style, 'isoAngle', this.isoAngle))) * Math.PI / 200;
    const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);
    // The iso height is drawn from the width: anchored to the nearest side with
    // the iso height as offset, so edges follow a resize that keeps the width
    // (eg. a taller cube)

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0, false, 0, isoH * 0.5));
    constr.push(constraint(1, 0, false, 0, isoH));
    constr.push(constraint(1, 0.25, false, 0, isoH * 0.5));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 0.75, false, 0, -isoH * 0.5));
    constr.push(constraint(1, 1, false, 0, -isoH));
    constr.push(constraint(0.75, 1, false, 0, -isoH * 0.5));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.25, 1, false, 0, -isoH * 0.5));
    constr.push(constraint(0, 1, false, 0, -isoH));
    constr.push(constraint(0, 1, false, 0, -isoH));
    constr.push(constraint(0, 0.75, false, 0, -isoH * 0.5));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(0, 0.25, false, 0, isoH * 0.5));
    constr.push(constraint(0, 0, false, 0, isoH));
    constr.push(constraint(0.25, 0, false, 0, isoH * 0.5));

    return constr;
  }
}

// --- Partial Concentric Ellipse -----------------------------------------------------------

export class ShapeInfographicPartConcEllipse extends Actor {
  startAngle = 0.25;
  endAngle = 0.75;
  arcWidth = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const startAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'startAngle', this.startAngle)));
    let endAngle = 2 * Math.PI * Math.max(0, Math.min(1, getFloat(this.style, 'endAngle', this.endAngle)));
    const arcWidth = 1 - Math.max(0, Math.min(1, getFloat(this.style, 'arcWidth', this.arcWidth)));
    let rx = w * 0.5;
    let ry = h * 0.5;
    let rx2 = rx * arcWidth;
    let ry2 = ry * arcWidth;

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

    if (angDiff <= Math.PI) {
      bigArc = 1;
    }

    c.begin();
    c.moveTo(rx, 0);
    c.arcTo(rx, ry, 0, 0, 1, w, ry);
    c.arcTo(rx, ry, 0, 0, 1, rx, h);
    c.arcTo(rx, ry, 0, 0, 1, 0, ry);
    c.arcTo(rx, ry, 0, 0, 1, rx, 0);
    c.close();
    c.moveTo(rx, h * 0.5 - ry2);
    c.arcTo(rx2, ry2, 0, 0, 0, w * 0.5 - rx2, ry);
    c.arcTo(rx2, ry2, 0, 0, 0, rx, h * 0.5 + ry2);
    c.arcTo(rx2, ry2, 0, 0, 0, w * 0.5 + rx2, ry);
    c.arcTo(rx2, ry2, 0, 0, 0, rx, h * 0.5 - ry2);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#ffffff');

    c.begin();
    c.moveTo(startX, startY);
    c.arcTo(rx, ry, 0, bigArc, 0, endX, endY);
    c.lineTo(innerEndX, innerEndY);
    c.arcTo(rx2, ry2, 0, bigArc, 1, innerStartX, innerStartY);
    c.close();
    c.fill();

    rx = w * 0.5;
    ry = h * 0.5;
    rx2 = rx * arcWidth;
    ry2 = ry * arcWidth;

    const rx3 = rx2 + (rx - rx2) * 0.25;
    const ry3 = ry2 + (ry - ry2) * 0.25;

    c.setFillColor('#000000');

    c.begin();
    c.moveTo(rx, h * 0.5 - ry2);
    c.arcTo(rx2, ry2, 0, 0, 1, w * 0.5 + rx2, ry);
    c.arcTo(rx2, ry2, 0, 0, 1, rx, h * 0.5 + ry2);
    c.arcTo(rx2, ry2, 0, 0, 1, w * 0.5 - rx2, ry);
    c.arcTo(rx2, ry2, 0, 0, 1, rx, h * 0.5 - ry2);
    c.close();
    c.moveTo(rx, h * 0.5 - ry3);
    c.arcTo(rx3, ry3, 0, 0, 0, w * 0.5 - rx3, ry);
    c.arcTo(rx3, ry3, 0, 0, 0, rx, h * 0.5 + ry3);
    c.arcTo(rx3, ry3, 0, 0, 0, w * 0.5 + rx3, ry);
    c.arcTo(rx3, ry3, 0, 0, 0, rx, h * 0.5 - ry3);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0.145, 0.145, false));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.855, 0.145, false));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0.855, 0.855, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0.145, 0.855, false));
    constr.push(constraint(0, 0.5, false));

    return constr;
  }
}

// --- Banner Half Fold ---------------------------------------------------------------------

export class ShapeInfographicBannerHalfFold extends Actor {
  dx = 0.5;
  dx2 = 0.5;
  notch = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dx2 = Math.max(0, Math.min(w - dx, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(h - dx, getFloat(this.style, 'notch', this.notch)));

    c.begin();
    c.moveTo(dx2, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w, dx);
    c.lineTo(w, h);
    c.lineTo(w - dx * 0.5, h - notch);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, dx);
    c.lineTo(dx2, dx);
    c.lineTo(0, dx * 0.5);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');
    c.begin();
    c.moveTo(w - dx, dx);
    c.lineTo(w, dx);
    c.lineTo(w, h);
    c.lineTo(w - dx * 0.5, h - notch);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, dx);
    c.lineTo(0, dx);
    c.close();
    c.fill();

    c.begin();
    c.moveTo(dx2, 0);
    c.lineTo(w - dx, 0);
    c.lineTo(w, dx);
    c.lineTo(w, h);
    c.lineTo(w - dx * 0.5, h - notch);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, dx);
    c.lineTo(dx2, dx);
    c.lineTo(0, dx * 0.5);
    c.close();
    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dx2 = Math.max(0, Math.min(w - dx, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(h - dx, getFloat(this.style, 'notch', this.notch)));

    // Relative points with the fixed banner width, spike and notch as offsets,
    // so edges follow a resize
    constr.push(constraint(0, 0, false, 0, dx * 0.5));
    constr.push(constraint(0, 0, false, dx2, 0));
    constr.push(constraint(0.25, 0, false, dx2 * 0.75 - dx * 0.25, 0));
    constr.push(constraint(0.5, 0, false, (dx2 - dx) * 0.5, 0));
    constr.push(constraint(0.75, 0, false, dx2 * 0.25 - dx * 0.75, 0));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0, false, -dx * 0.5, dx * 0.5));
    constr.push(constraint(1, 0, false, 0, dx));
    constr.push(constraint(1, 0.25, false, 0, dx * 0.75));
    constr.push(constraint(1, 0.5, false, 0, dx * 0.5));
    constr.push(constraint(1, 0.75, false, 0, dx * 0.25));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(1, 1, false, -dx * 0.5, -notch));
    constr.push(constraint(1, 1, false, -dx, 0));
    constr.push(constraint(1, 1, false));
    constr.push(constraint(1, 0.75, false, -dx, dx * 0.25));
    constr.push(constraint(1, 0.5, false, -dx, dx * 0.5));
    constr.push(constraint(1, 0.25, false, -dx, dx * 0.75));
    constr.push(constraint(1, 0, false, -dx, dx));
    constr.push(constraint(0.25, 0, false, dx2 * 0.75 - dx * 0.25, dx));
    constr.push(constraint(0.5, 0, false, (dx2 - dx) * 0.5, dx));
    constr.push(constraint(0.75, 0, false, dx2 * 0.25 - dx * 0.75, dx));
    constr.push(constraint(0, 0, false, dx2, dx));

    return constr;
  }
}

// --- Circular Dial ------------------------------------------------------------------------

export class ShapeInfographicCircularDial extends Actor {
  dy = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h * 0.5 - 10, w * 0.5, getFloat(this.style, 'dy', this.dy)));

    const rx = Math.max(0, Math.min(w * 0.5, h * 0.5 - 10));
    const rx2 = rx - dy;

    c.begin();
    c.moveTo(w * 0.5 - rx, h);
    c.lineTo(w * 0.5 - rx, rx);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5, 0);
    c.arcTo(rx, rx, 0, 0, 1, w * 0.5 + rx, rx);
    c.lineTo(w * 0.5 + rx, h);
    c.close();
    c.moveTo(w * 0.5, dy);
    c.arcTo(rx2, rx2, 0, 0, 0, w * 0.5 - rx2, rx);
    c.arcTo(rx2, rx2, 0, 0, 0, w * 0.5, rx + rx2);
    c.arcTo(rx2, rx2, 0, 0, 0, w * 0.5 + rx2, rx);
    c.arcTo(rx2, rx2, 0, 0, 0, w * 0.5, dy);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#000000');

    c.begin();
    c.moveTo(w * 0.5 - rx, 2 * rx);
    c.lineTo(w * 0.5 + rx, 2 * rx);
    c.lineTo(w * 0.5 + rx, h);
    c.lineTo(w * 0.5 - rx, h);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const rx = Math.max(0, Math.min(w * 0.5, h * 0.5 - 10));
    // The dial is drawn from the smaller side: anchored to the nearest side
    // with the radius as offset, so edges follow a resize that keeps the
    // smaller side (eg. a taller dial). The x of a dial as wide as the shape
    // is relative to the width, else the radius is an offset from the middle.
    const fx = (rx === w * 0.5) ? 0.5 : 0;
    const ox = (rx === w * 0.5) ? 0 : rx;

    constr.push(constraint(0.5 - fx, 1, false, -ox, 0));
    constr.push(constraint(0.5 - fx, 0.5, false, -ox, rx * 0.5));
    constr.push(constraint(0.5 - fx, 0, false, -ox, rx));
    constr.push(constraint(0.5 - fx * 0.71, 0, false, -ox * 0.71, rx * 0.29));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5 + fx * 0.71, 0, false, ox * 0.71, rx * 0.29));
    constr.push(constraint(0.5 + fx, 0, false, ox, rx));
    constr.push(constraint(0.5 + fx, 0.5, false, ox, rx * 0.5));
    constr.push(constraint(0.5 + fx, 1, false, ox, 0));
    constr.push(constraint(0.5 + fx * 0.5, 1, false, ox * 0.5, 0));
    constr.push(constraint(0.5 - fx * 0.5, 1, false, -ox * 0.5, 0));

    return constr;
  }
}

// --- Simple ribbon ------------------------------------------------------------------------

export class ShapeInfographicRibbonSimple extends Actor {
  notch1 = 0.5;
  notch2 = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // notch1 defaults to this.notch2 in draw.io too
    const notch1 = Math.max(0, Math.min(w, getFloat(this.style, 'notch1', this.notch2)));
    const notch2 = Math.max(0, Math.min(w, getFloat(this.style, 'notch2', this.notch2)));

    c.begin();
    c.moveTo(0, h);
    c.lineTo(notch1, h * 0.5);
    c.lineTo(0, 0);
    c.lineTo(w - notch2, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - notch2, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const notch1 = Math.max(0, Math.min(w, getFloat(this.style, 'notch1', this.notch2)));
    const notch2 = Math.max(0, Math.min(w, getFloat(this.style, 'notch2', this.notch2)));

    // Relative points with the fixed notch and spike as offsets, so edges
    // follow a resize
    constr.push(constraint(0, 0, false));
    constr.push(constraint(0.25, 0, false, -notch2 * 0.25, 0));
    constr.push(constraint(0.5, 0, false, -notch2 * 0.5, 0));
    constr.push(constraint(0.75, 0, false, -notch2 * 0.75, 0));
    constr.push(constraint(1, 0, false, -notch2, 0));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 1, false, -notch2, 0));
    constr.push(constraint(0.75, 1, false, -notch2 * 0.75, 0));
    constr.push(constraint(0.5, 1, false, -notch2 * 0.5, 0));
    constr.push(constraint(0.25, 1, false, -notch2 * 0.25, 0));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0.5, false, notch1, 0));

    return constr;
  }
}

// --- Bar with callout ---------------------------------------------------------------------

export class ShapeInfographicBarCallout extends Actor {
  dx = 0.5;
  dy = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    const x1 = Math.max(dx - dy * 0.35, 0);
    const x2 = Math.min(dx + dy * 0.35, w);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - dy);
    c.lineTo(x2, h - dy);
    c.lineTo(dx, h);
    c.lineTo(x1, h - dy);
    c.lineTo(0, h - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    // Relative points with the fixed callout position and size as offsets, so
    // edges follow a resize
    constr.push(constraint(0, 0, false));
    constr.push(constraint(0.25, 0, false));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0, false));
    constr.push(constraint(1, 0, false));
    constr.push(constraint(1, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(1, 1, false, 0, -dy));
    constr.push(constraint(0.75, 1, false, 0, -dy));
    constr.push(constraint(0.25, 1, false, 0, -dy));
    constr.push(constraint(0, 1, false, dx, 0));
    constr.push(constraint(0, 1, false, 0, -dy));

    return constr;
  }
}

// --- Flag ---------------------------------------------------------------------------------

export class ShapeInfographicFlag extends Actor {
  dx = 0.5;
  dy = 0.5;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - dy);
    c.lineTo(dx, h - dy);
    c.lineTo(dx * 0.5, h);
    c.lineTo(0, h - dy);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);
    c.setFillAlpha(0.2);
    c.setFillColor('#ffffff');
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(dx, 0);
    c.lineTo(dx, h - dy);
    c.lineTo(dx * 0.5, h);
    c.lineTo(0, h - dy);
    c.close();
    c.fill();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    // Relative points with the fixed pole width and spike as offsets, so edges
    // follow a resize
    constr.push(constraint(0, 0, false));
    constr.push(constraint(0.25, 0, false));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.75, 0, false));
    constr.push(constraint(1, 0, false));
    constr.push(constraint(1, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(1, 1, false, 0, -dy));
    constr.push(constraint(0, 1, false, 0, -dy));
    constr.push(constraint(0, 0.5, false, 0, -dy * 0.5));
    constr.push(constraint(0.75, 1, false, 0, -dy));
    constr.push(constraint(0.5, 1, false, 0, -dy));
    constr.push(constraint(0.25, 1, false, 0, -dy));
    constr.push(constraint(0, 1, false, dx * 0.5, 0));
    constr.push(constraint(0, 0, false, dx * 0.5, 0));

    return constr;
  }
}

/** mxInfographic.js's registrations, in order. */
export const INFOGRAPHIC_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.infographic.numberedEntryVert', ShapeInfographicNumEntryVert],
  ['mxgraph.infographic.bendingArch', ShapeInfographicBendingArch],
  ['mxgraph.infographic.parallelogram', ShapeInfographicParallelogram],
  ['mxgraph.infographic.ribbonRolled', ShapeInfographicRibbonRolled],
  ['mxgraph.infographic.ribbonDoubleFolded', ShapeInfographicRibbonDoubleFolded],
  ['mxgraph.infographic.ribbonFrontFolded', ShapeInfographicRibbonFrontFolded],
  ['mxgraph.infographic.ribbonBackFolded', ShapeInfographicRibbonBackFolded],
  ['mxgraph.infographic.banner', ShapeInfographicBanner],
  ['mxgraph.infographic.circularCallout', ShapeInfographicCircularCallout],
  ['mxgraph.infographic.shadedTriangle', ShapeInfographicShadedTriangle],
  ['mxgraph.infographic.shadedPyramid', ShapeInfographicShadedPyramid],
  ['mxgraph.infographic.pyramidStep', ShapeInfographicPyramidStep],
  ['mxgraph.infographic.cylinder', ShapeInfographicCylinder],
  ['mxgraph.infographic.circularCallout2', ShapeInfographicCircularCallout2],
  ['mxgraph.infographic.bannerSingleFold', ShapeInfographicBannerSingleFold],
  ['mxgraph.infographic.shadedCube', ShapeInfographicShadedCube],
  ['mxgraph.infographic.partConcEllipse', ShapeInfographicPartConcEllipse],
  ['mxgraph.infographic.bannerHalfFold', ShapeInfographicBannerHalfFold],
  ['mxgraph.infographic.circularDial', ShapeInfographicCircularDial],
  ['mxgraph.infographic.ribbonSimple', ShapeInfographicRibbonSimple],
  ['mxgraph.infographic.barCallout', ShapeInfographicBarCallout],
  ['mxgraph.infographic.flag', ShapeInfographicFlag],
];
