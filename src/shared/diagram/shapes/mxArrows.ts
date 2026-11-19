/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2016,
 * JGraph Holdings Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxArrows.js — the mxgraph.arrows2.* shapes of the Arrows palette
 * (arrow, twoWayArrow, stylisedArrow, sharpArrow, sharpArrow2, callout,
 * bend, quad, triad, tailed, striped, jump-in and U-turn arrows) and the
 * wedge arrow edges, with their connection points.
 * Modified for DeckWerk: label bounds, handles and custom property tables
 * are left out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point, Style } from '../types.js';
import { Arrow } from './edges.js';
import { Actor, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { ARROW_SIZE, getFloat, getValue, looseEq, truthy } from './util.js';

// --- Arrow --------------------------------------------------------------------------------

export class Arrows2Arrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const headCrossline = getValue(this.style, 'headCrossline', false);
    const tailCrossline = getValue(this.style, 'tailCrossline', false);

    c.begin();
    c.moveTo(0, dy);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - dy);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    if (truthy(headCrossline)) {
      c.begin();
      c.moveTo(w - dx, dy);
      c.lineTo(w - dx, h - dy);
      c.stroke();
    }

    if (truthy(tailCrossline)) {
      c.begin();
      c.moveTo(notch, dy);
      c.lineTo(notch, h - dy);
      c.stroke();
    }
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow width as a fraction of the height and the fixed arrow head size as offsets, so edges follow a resize
    let fdy = Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, fdy * 0.5, false));
    constr.push(constraint(0, 1 - fdy * 0.5, false));
    constr.push(constraint(1, fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 1 - fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 1, false, -dx, 0));
    constr.push(constraint(0.5, fdy * 0.5, false, -dx * 0.5, 0));
    constr.push(constraint(0.5, 1 - fdy * 0.5, false, -dx * 0.5, 0));

    return constr;
  }
}

// --- Two Way Arrow ------------------------------------------------------------------------

export class Arrows2TwoWayArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    c.begin();
    c.moveTo(dx, dy);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(dx, h - dy);
    c.lineTo(dx, h);
    c.lineTo(0, h * 0.5);
    c.lineTo(dx, 0);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow width as a fraction of the height and the fixed arrow head size as offsets, so edges follow a resize
    let fdy = Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0, false, dx, 0));
    constr.push(constraint(0, fdy * 0.5, false, dx, 0));
    constr.push(constraint(0, 1, false, dx, 0));
    constr.push(constraint(0, 1 - fdy * 0.5, false, dx, 0));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 1, false, -dx, 0));
    constr.push(constraint(1, 1 - fdy * 0.5, false, -dx, 0));
    constr.push(constraint(0.5, fdy * 0.5, false));
    constr.push(constraint(0.5, 1 - fdy * 0.5, false));

    return constr;
  }
}

// --- Stylised Arrow -----------------------------------------------------------------------

export class Arrows2StylisedArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  feather = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const feather = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'feather', this.feather)));

    c.begin();
    c.moveTo(0, feather);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx - 10, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx - 10, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(0, h - feather);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow width and feather as fractions of the height and the fixed arrow head size as offsets, so edges follow a resize
    let fdy = Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    let ffeather = Math.max(0, Math.min(1, getFloat(this.style, 'feather', this.feather)));
    ffeather = Number.isNaN(ffeather) ? this.feather : ffeather;

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, ffeather * 0.5, false));
    constr.push(constraint(0, 1 - ffeather * 0.5, false));
    constr.push(constraint(1, fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 0, false, -dx - 10, 0));
    constr.push(constraint(1, 1 - fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 1, false, -dx - 10, 0));
    constr.push(constraint(0.5, (fdy + ffeather) * 0.25, false, -dx * 0.5, 0));
    constr.push(constraint(0.5, 1 - (fdy + ffeather) * 0.25, false, -dx * 0.5, 0));

    return constr;
  }
}

// --- Sharp Arrow --------------------------------------------------------------------------

export class Arrows2SharpArrow extends Actor {
  dy1 = 0.5;
  dx1 = 0.5;
  dx2 = 0.5;
  notch = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy1 = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const dx1a = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy1a = h * 0.5 * Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    let x2 = 0;

    if (h !== 0) {
      x2 = dx1a + dx2 * dy1a * 2 / h;
    }

    c.begin();
    c.moveTo(0, dy1);
    c.lineTo(w - dx1, dy1);
    c.lineTo(w - x2, 0);
    c.lineTo(w - dx2, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx2, h);
    c.lineTo(w - x2, h);
    c.lineTo(w - dx1, h - dy1);
    c.lineTo(0, h - dy1);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow width as a fraction of the height and the fixed arrow head sizes as offsets, so edges follow a resize
    let fdy1 = Math.max(0, Math.min(1, getFloat(this.style, 'dy1', this.dy1)));
    fdy1 = Number.isNaN(fdy1) ? this.dy1 : fdy1;
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const dx1a = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy1a = h * 0.5 * Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    let x2 = 0;

    if (h !== 0) {
      x2 = dx1a + dx2 * dy1a * 2 / h;
    }

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, fdy1 * 0.5, false));
    constr.push(constraint(1, fdy1 * 0.5, false, -dx1, 0));
    constr.push(constraint(1, 0, false, -x2, 0));
    constr.push(constraint(1, 0, false, -dx2, 0));
    constr.push(constraint(0, 1 - fdy1 * 0.5, false));
    constr.push(constraint(1, 1 - fdy1 * 0.5, false, -dx1, 0));
    constr.push(constraint(1, 1, false, -x2, 0));
    constr.push(constraint(1, 1, false, -dx2, 0));
    constr.push(constraint(0.5, fdy1 * 0.5, false, -dx1 * 0.5, 0));
    constr.push(constraint(0.5, 1 - fdy1 * 0.5, false, -dx1 * 0.5, 0));

    return constr;
  }
}

// --- Sharp Arrow2 -------------------------------------------------------------------------

export class Arrows2SharpArrow2 extends Actor {
  dy1 = 0.5;
  dx1 = 0.5;
  dx2 = 0.5;
  dy3 = 0.5;
  dx3 = 0.5;
  notch = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy1 = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const dy3 = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy3', this.dy3)));
    const dx3 = Math.max(0, Math.min(w, getFloat(this.style, 'dx3', this.dx3)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    // draw.io also computes dx1a and dy1a here, which it does not use

    c.begin();
    c.moveTo(0, dy1);
    c.lineTo(w - dx1, dy1);
    c.lineTo(w - dx3, dy3);
    c.lineTo(w - dx2, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx2, h);
    c.lineTo(w - dx3, h - dy3);
    c.lineTo(w - dx1, h - dy1);
    c.lineTo(0, h - dy1);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow widths as fractions of the height and the fixed arrow head sizes as offsets, so edges follow a resize
    let fdy1 = Math.max(0, Math.min(1, getFloat(this.style, 'dy1', this.dy1)));
    fdy1 = Number.isNaN(fdy1) ? this.dy1 : fdy1;
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    let fdy3 = Math.max(0, Math.min(1, getFloat(this.style, 'dy3', this.dy3)));
    fdy3 = Number.isNaN(fdy3) ? this.dy3 : fdy3;
    const dx3 = Math.max(0, Math.min(w, getFloat(this.style, 'dx3', this.dx3)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, fdy1 * 0.5, false));
    constr.push(constraint(1, fdy1 * 0.5, false, -dx1, 0));
    constr.push(constraint(1, fdy3 * 0.5, false, -dx3, 0));
    constr.push(constraint(1, 0, false, -dx2, 0));
    constr.push(constraint(0, 1 - fdy1 * 0.5, false));
    constr.push(constraint(1, 1 - fdy1 * 0.5, false, -dx1, 0));
    constr.push(constraint(1, 1 - fdy3 * 0.5, false, -dx3, 0));
    constr.push(constraint(1, 1, false, -dx2, 0));
    constr.push(constraint(0.5, fdy1 * 0.5, false, -dx1 * 0.5, 0));
    constr.push(constraint(0.5, 1 - fdy1 * 0.5, false, -dx1 * 0.5, 0));

    return constr;
  }
}

// --- Callout Arrow ------------------------------------------------------------------------

export class Arrows2CalloutArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(notch, 0);
    c.lineTo(notch, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h * 0.5 + dy + arrowHead);
    c.lineTo(w - dx, h * 0.5 + dy);
    c.lineTo(notch, h * 0.5 + dy);
    c.lineTo(notch, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    // Relative points with the fixed arrow and rectangle sizes as offsets, so edges follow a resize
    constr.push(constraint(0, 0, false));
    constr.push(constraint(0, 0, false, notch, 0));
    constr.push(constraint(0, 0.5, false, notch, -dy));
    constr.push(constraint(1, 0.5, false, -dx, -dy));
    constr.push(constraint(1, 0.5, false, -dx, -dy - arrowHead));
    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(1, 0.5, false, -dx, dy + arrowHead));
    constr.push(constraint(1, 0.5, false, -dx, dy));
    constr.push(constraint(0, 0.5, false, notch, dy));
    constr.push(constraint(0, 1, false, notch, 0));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0, false, notch * 0.5, 0));
    constr.push(constraint(0, 1, false, notch * 0.5, 0));
    constr.push(constraint(0.5, 0.5, false, (notch - dx) * 0.5, -dy));
    constr.push(constraint(0.5, 0.5, false, (notch - dx) * 0.5, dy));

    return constr;
  }
}

// --- Bend Arrow ---------------------------------------------------------------------------

export class Arrows2BendArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 40;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(h, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const rounded = getValue(this.style, 'rounded', '0');

    c.begin();
    c.moveTo(w - dx, 0);
    c.lineTo(w, arrowHead * 0.5);
    c.lineTo(w - dx, arrowHead);
    c.lineTo(w - dx, arrowHead / 2 + dy);

    if (looseEq(rounded, '1')) {
      c.lineTo(dy * 2.2, arrowHead / 2 + dy);
      c.arcTo(dy * 0.2, dy * 0.2, 0, 0, 0, dy * 2, arrowHead / 2 + dy * 1.2);
    } else {
      c.lineTo(dy * 2, arrowHead / 2 + dy);
    }

    c.lineTo(dy * 2, h);
    c.lineTo(dy, h - notch);
    c.lineTo(0, h);

    if (looseEq(rounded, '1')) {
      c.lineTo(0, arrowHead / 2 + dy);
      c.arcTo(dy * 2, dy * 2, 0, 0, 1, dy * 2, arrowHead / 2 - dy);
    } else {
      c.lineTo(0, arrowHead / 2 - dy);
    }

    c.lineTo(w - dx, arrowHead / 2 - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(h, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const rounded = getValue(this.style, 'rounded', '0');

    // Relative points with the fixed arrow sizes as offsets, so edges follow a resize
    constr.push(constraint(0.5, 0, false, dy - dx * 0.5, arrowHead / 2 - dy));
    constr.push(constraint(1, 0, false, -dx, arrowHead / 2 - dy));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0, false, 0, arrowHead * 0.5));
    constr.push(constraint(1, 0, false, -dx, arrowHead));
    constr.push(constraint(1, 0, false, -dx, arrowHead / 2 + dy));
    constr.push(constraint(0.5, 0, false, dy - dx * 0.5, arrowHead / 2 + dy));
    constr.push(constraint(0, 0.5, false, dy * 2, (arrowHead / 2 + dy) * 0.5));
    constr.push(constraint(0, 1, false, dy * 2, 0));
    constr.push(constraint(0, 1, false, dy, -notch));
    constr.push(constraint(0, 1, false));
    constr.push(constraint(0, 0.5, false, 0, (arrowHead / 2 + dy) * 0.5));

    if (looseEq(rounded, '1')) {
      constr.push(constraint(0, 0, false, dy * 0.586, arrowHead / 2 - dy * 0.414));
      constr.push(constraint(0, 0, false, 2 * dy + dy * 0.0586, arrowHead / 2 + dy + dy * 0.0586));
    } else {
      constr.push(constraint(0, 0, false, 0, arrowHead / 2 - dy));
      constr.push(constraint(0, 0, false, dy * 2, arrowHead / 2 + dy));
    }

    return constr;
  }
}

// --- Bend Double Arrow --------------------------------------------------------------------

export class Arrows2BendDoubleArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 40;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(w, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const rounded = getValue(this.style, 'rounded', '0');

    c.begin();
    c.moveTo(w - dx, 0);
    c.lineTo(w, arrowHead * 0.5);
    c.lineTo(w - dx, arrowHead);
    c.lineTo(w - dx, arrowHead / 2 + dy);

    if (looseEq(rounded, '1')) {
      c.lineTo(arrowHead / 2 + dy * 1.2, arrowHead / 2 + dy);
      c.arcTo(dy * 0.2, dy * 0.2, 0, 0, 0, arrowHead / 2 + dy, arrowHead / 2 + dy * 1.2);
    } else {
      c.lineTo(arrowHead / 2 + dy, arrowHead / 2 + dy);
    }

    c.lineTo(arrowHead / 2 + dy, h - dx);
    c.lineTo(arrowHead, h - dx);
    c.lineTo(arrowHead / 2, h);
    c.lineTo(0, h - dx);
    c.lineTo(arrowHead / 2 - dy, h - dx);

    if (looseEq(rounded, '1')) {
      c.lineTo(arrowHead / 2 - dy, arrowHead / 2 + dy);
      c.arcTo(dy * 2, dy * 2, 0, 0, 1, arrowHead / 2 + dy, arrowHead / 2 - dy);
    } else {
      c.lineTo(arrowHead / 2 - dy, arrowHead / 2 - dy);
    }

    c.lineTo(w - dx, arrowHead / 2 - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(w, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const rounded = getValue(this.style, 'rounded', '0');

    // Relative points with the fixed arrow sizes as offsets, so edges follow a resize
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0, false, 0, arrowHead * 0.5));
    constr.push(constraint(1, 0, false, -dx, arrowHead));
    constr.push(constraint(1, 0, false, -dx, arrowHead / 2 + dy));
    constr.push(constraint(0.5, 0, false, (arrowHead / 2 + dy - dx) * 0.5, arrowHead / 2 + dy));
    constr.push(constraint(0.5, 0, false, (arrowHead / 2 + dy - dx) * 0.5, arrowHead / 2 - dy));
    constr.push(constraint(0, 0.5, false, arrowHead / 2 + dy, (arrowHead / 2 + dy - dx) * 0.5));
    constr.push(constraint(0, 0.5, false, arrowHead / 2 - dy, (arrowHead / 2 + dy - dx) * 0.5));
    constr.push(constraint(0, 1, false, arrowHead / 2 + dy, -dx));
    constr.push(constraint(0, 1, false, arrowHead, -dx));
    constr.push(constraint(0, 1, false, arrowHead / 2, 0));
    constr.push(constraint(0, 1, false, 0, -dx));
    constr.push(constraint(0, 1, false, arrowHead / 2 - dy, -dx));

    if (looseEq(rounded, '1')) {
      constr.push(constraint(0, 0, false, arrowHead / 2 - dy * 0.414, arrowHead / 2 - dy * 0.414));
      constr.push(constraint(0, 0, false, arrowHead / 2 + dy + dy * 0.0586, arrowHead / 2 + dy + dy * 0.0586));
    } else {
      constr.push(constraint(0, 0, false, arrowHead / 2 - dy, arrowHead / 2 - dy));
      constr.push(constraint(0, 0, false, arrowHead / 2 + dy, arrowHead / 2 + dy));
    }

    return constr;
  }
}

// --- Callout Double Arrow -----------------------------------------------------------------

export class Arrows2CalloutDoubleArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(w / 2 - notch, 0);
    c.lineTo(w / 2 + notch, 0);
    c.lineTo(w / 2 + notch, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h * 0.5 + dy + arrowHead);
    c.lineTo(w - dx, h * 0.5 + dy);
    c.lineTo(w / 2 + notch, h * 0.5 + dy);
    c.lineTo(w / 2 + notch, h);
    c.lineTo(w / 2 - notch, h);
    c.lineTo(w / 2 - notch, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy + arrowHead);
    c.lineTo(0, h * 0.5);
    c.lineTo(dx, h * 0.5 - dy - arrowHead);
    c.lineTo(dx, h * 0.5 - dy);
    c.lineTo(w / 2 - notch, h * 0.5 - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(1, 0.5, false));
    // Relative points with the fixed arrow and rectangle sizes as offsets, so edges follow a resize
    constr.push(constraint(0.5, 0, false, -notch, 0));
    constr.push(constraint(0.5, 0, false, notch, 0));
    constr.push(constraint(0.5, 1, false, -notch, 0));
    constr.push(constraint(0.5, 1, false, notch, 0));
    constr.push(constraint(1, 0.5, false, -dx, -dy - arrowHead));
    constr.push(constraint(1, 0.5, false, -dx, dy + arrowHead));
    constr.push(constraint(0, 0.5, false, dx, -dy - arrowHead));
    constr.push(constraint(0, 0.5, false, dx, dy + arrowHead));
    constr.push(constraint(0.75, 0.5, false, (notch - dx) * 0.5, -dy));
    constr.push(constraint(0.75, 0.5, false, (notch - dx) * 0.5, dy));
    constr.push(constraint(0.25, 0.5, false, (dx - notch) * 0.5, -dy));
    constr.push(constraint(0.25, 0.5, false, (dx - notch) * 0.5, dy));

    return constr;
  }
}

// --- Callout Quad Arrow -------------------------------------------------------------------

export class Arrows2CalloutQuadArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(w * 0.5 + dy, h * 0.5 - notch);
    c.lineTo(w * 0.5 + notch, h * 0.5 - notch);
    c.lineTo(w * 0.5 + notch, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h * 0.5 + dy + arrowHead);
    c.lineTo(w - dx, h * 0.5 + dy);
    c.lineTo(w * 0.5 + notch, h * 0.5 + dy);
    c.lineTo(w * 0.5 + notch, h * 0.5 + notch);
    c.lineTo(w * 0.5 + dy, h * 0.5 + notch);
    c.lineTo(w * 0.5 + dy, h - dx);
    c.lineTo(w * 0.5 + dy + arrowHead, h - dx);
    c.lineTo(w * 0.5, h);
    c.lineTo(w * 0.5 - dy - arrowHead, h - dx);
    c.lineTo(w * 0.5 - dy, h - dx);
    c.lineTo(w * 0.5 - dy, h * 0.5 + notch);
    c.lineTo(w * 0.5 - notch, h * 0.5 + notch);
    c.lineTo(w * 0.5 - notch, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy + arrowHead);
    c.lineTo(0, h * 0.5);
    c.lineTo(dx, h * 0.5 - dy - arrowHead);
    c.lineTo(dx, h * 0.5 - dy);
    c.lineTo(w * 0.5 - notch, h * 0.5 - dy);
    c.lineTo(w * 0.5 - notch, h * 0.5 - notch);
    c.lineTo(w * 0.5 - dy, h * 0.5 - notch);
    c.lineTo(w * 0.5 - dy, dx);
    c.lineTo(w * 0.5 - dy - arrowHead, dx);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5 + dy + arrowHead, dx);
    c.lineTo(w * 0.5 + dy, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(1, 0.5, false));
    // Relative points with the fixed arrow and rectangle sizes as offsets, so edges follow a resize
    constr.push(constraint(0.5, 0.5, false, dy, -notch));
    constr.push(constraint(0.5, 0.5, false, notch, -notch));
    constr.push(constraint(0.5, 0.5, false, notch, -dy));
    constr.push(constraint(0.5, 0.5, false, dy, notch));
    constr.push(constraint(0.5, 0.5, false, notch, notch));
    constr.push(constraint(0.5, 0.5, false, notch, dy));
    constr.push(constraint(0.5, 0.5, false, -dy, notch));
    constr.push(constraint(0.5, 0.5, false, -notch, notch));
    constr.push(constraint(0.5, 0.5, false, -notch, dy));
    constr.push(constraint(0.5, 0.5, false, -dy, -notch));
    constr.push(constraint(0.5, 0.5, false, -notch, -notch));
    constr.push(constraint(0.5, 0.5, false, -notch, -dy));
    constr.push(constraint(1, 0.5, false, -dx, -dy - arrowHead));
    constr.push(constraint(1, 0.5, false, -dx, dy + arrowHead));
    constr.push(constraint(0.5, 1, false, -dy - arrowHead, -dx));
    constr.push(constraint(0.5, 1, false, dy + arrowHead, -dx));
    constr.push(constraint(0, 0.5, false, dx, -dy - arrowHead));
    constr.push(constraint(0, 0.5, false, dx, dy + arrowHead));
    constr.push(constraint(0.5, 0, false, -dy - arrowHead, dx));
    constr.push(constraint(0.5, 0, false, dy + arrowHead, dx));
    constr.push(constraint(0.75, 0.5, false, (notch - dx) * 0.5, -dy));
    constr.push(constraint(0.75, 0.5, false, (notch - dx) * 0.5, dy));
    constr.push(constraint(0.5, 0.75, false, -dy, (notch - dx) * 0.5));
    constr.push(constraint(0.5, 0.75, false, dy, (notch - dx) * 0.5));
    constr.push(constraint(0.25, 0.5, false, (dx - notch) * 0.5, -dy));
    constr.push(constraint(0.25, 0.5, false, (dx - notch) * 0.5, dy));
    constr.push(constraint(0.5, 0.25, false, -dy, (dx - notch) * 0.5));
    constr.push(constraint(0.5, 0.25, false, dy, (dx - notch) * 0.5));

    return constr;
  }
}

// --- Callout Double 90 Arrow --------------------------------------------------------------

export class Arrows2CalloutDouble90Arrow extends Actor {
  dy1 = 0.5;
  dx1 = 0.5;
  dx2 = 0;
  dy2 = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const dy2 = Math.max(0, Math.min(w, getFloat(this.style, 'dy2', this.dy2)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(dx2, 0);
    c.lineTo(dx2, dy2 * 0.5 - dy1);
    c.lineTo(w - dx1, dy2 * 0.5 - dy1);
    c.lineTo(w - dx1, dy2 * 0.5 - dy1 - arrowHead);
    c.lineTo(w, dy2 * 0.5);
    c.lineTo(w - dx1, dy2 * 0.5 + dy1 + arrowHead);
    c.lineTo(w - dx1, dy2 * 0.5 + dy1);
    c.lineTo(dx2, dy2 * 0.5 + dy1);
    c.lineTo(dx2, dy2);
    c.lineTo(dx2 / 2 + dy1, dy2);
    c.lineTo(dx2 / 2 + dy1, h - dx1);
    c.lineTo(dx2 / 2 + dy1 + arrowHead, h - dx1);
    c.lineTo(dx2 / 2, h);
    c.lineTo(dx2 / 2 - dy1 - arrowHead, h - dx1);
    c.lineTo(dx2 / 2 - dy1, h - dx1);
    c.lineTo(dx2 / 2 - dy1, dy2);
    c.lineTo(0, dy2);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const dy2 = Math.max(0, Math.min(w, getFloat(this.style, 'dy2', this.dy2)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    constr.push(constraint(0, 0, false));
    constr.push(constraint(0, 0, false, dx2 * 0.5, 0));
    constr.push(constraint(0, 0, false, dx2, 0));
    // Relative points with the fixed arrow and callout sizes as offsets, so edges follow a resize
    constr.push(constraint(0.5, 0, false, (dx2 - dx1) * 0.5, dy2 * 0.5 - dy1));
    constr.push(constraint(1, 0, false, -dx1, dy2 * 0.5 - dy1 - arrowHead));
    constr.push(constraint(1, 0, false, 0, dy2 * 0.5));
    constr.push(constraint(1, 0, false, -dx1, dy2 * 0.5 + dy1 + arrowHead));
    constr.push(constraint(0.5, 0, false, (dx2 - dx1) * 0.5, dy2 * 0.5 + dy1));
    constr.push(constraint(0, 0, false, dx2, dy2));
    constr.push(constraint(0, 0.5, false, dx2 * 0.5 + dy1, (dy2 - dx1) * 0.5));
    constr.push(constraint(0, 0.5, false, dx2 * 0.5 - dy1, (dy2 - dx1) * 0.5));
    constr.push(constraint(0, 1, false, dx2 / 2 + dy1 + arrowHead, -dx1));
    constr.push(constraint(0, 1, false, dx2 / 2, 0));
    constr.push(constraint(0, 1, false, dx2 / 2 - dy1 - arrowHead, -dx1));
    constr.push(constraint(0, 0, false, 0, dy2));

    return constr;
  }
}

// --- Quad Arrow ---------------------------------------------------------------------------

export class Arrows2QuadArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(w * 0.5 + dy, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy);
    c.lineTo(w - dx, h * 0.5 - dy - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h * 0.5 + dy + arrowHead);
    c.lineTo(w - dx, h * 0.5 + dy);
    c.lineTo(w * 0.5 + dy, h * 0.5 + dy);
    c.lineTo(w * 0.5 + dy, h - dx);
    c.lineTo(w * 0.5 + dy + arrowHead, h - dx);
    c.lineTo(w * 0.5, h);
    c.lineTo(w * 0.5 - dy - arrowHead, h - dx);
    c.lineTo(w * 0.5 - dy, h - dx);
    c.lineTo(w * 0.5 - dy, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy);
    c.lineTo(dx, h * 0.5 + dy + arrowHead);
    c.lineTo(0, h * 0.5);
    c.lineTo(dx, h * 0.5 - dy - arrowHead);
    c.lineTo(dx, h * 0.5 - dy);
    c.lineTo(w * 0.5 - dy, h * 0.5 - dy);
    c.lineTo(w * 0.5 - dy, dx);
    c.lineTo(w * 0.5 - dy - arrowHead, dx);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5 + dy + arrowHead, dx);
    c.lineTo(w * 0.5 + dy, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5, 1, false));
    constr.push(constraint(0, 0.5, false));
    constr.push(constraint(1, 0.5, false));
    // Relative points with the fixed arrow sizes as offsets, so edges follow a resize
    constr.push(constraint(1, 0.5, false, -dx, -dy - arrowHead));
    constr.push(constraint(1, 0.5, false, -dx, dy + arrowHead));
    constr.push(constraint(0, 0.5, false, dx, -dy - arrowHead));
    constr.push(constraint(0, 0.5, false, dx, dy + arrowHead));
    constr.push(constraint(0.5, 0, false, -dy - arrowHead, dx));
    constr.push(constraint(0.5, 0, false, dy + arrowHead, dx));
    constr.push(constraint(0.5, 1, false, -dy - arrowHead, -dx));
    constr.push(constraint(0.5, 1, false, dy + arrowHead, -dx));
    constr.push(constraint(0.5, 0.25, false, -dy, (dx - dy) * 0.5));
    constr.push(constraint(0.5, 0.25, false, dy, (dx - dy) * 0.5));
    constr.push(constraint(0.5, 0.75, false, -dy, (dy - dx) * 0.5));
    constr.push(constraint(0.5, 0.75, false, dy, (dy - dx) * 0.5));
    constr.push(constraint(0.25, 0.5, false, (dx - dy) * 0.5, -dy));
    constr.push(constraint(0.25, 0.5, false, (dx - dy) * 0.5, dy));
    constr.push(constraint(0.75, 0.5, false, (dy - dx) * 0.5, -dy));
    constr.push(constraint(0.75, 0.5, false, (dy - dx) * 0.5, dy));

    return constr;
  }
}

// --- Triad Arrow --------------------------------------------------------------------------

export class Arrows2TriadArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(w * 0.5 + arrowHead * 0.5 - dy, h - arrowHead + dy);
    c.lineTo(w - dx, h - arrowHead + dy);
    c.lineTo(w - dx, h - arrowHead);
    c.lineTo(w, h - arrowHead * 0.5);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(dx, h - dy);
    c.lineTo(dx, h);
    c.lineTo(0, h - arrowHead * 0.5);
    c.lineTo(dx, h - arrowHead);
    c.lineTo(dx, h - arrowHead + dy);
    c.lineTo(w * 0.5 - arrowHead * 0.5 + dy, h - arrowHead + dy);
    c.lineTo(w * 0.5 - arrowHead * 0.5 + dy, dx);
    c.lineTo(w * 0.5 - arrowHead * 0.5, dx);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.5 + arrowHead * 0.5, dx);
    c.lineTo(w * 0.5 + arrowHead * 0.5 - dy, dx);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    // Relative points with the fixed arrow sizes as offsets, so edges follow a resize
    constr.push(constraint(0.5, 0, false, -arrowHead * 0.5, dx));
    constr.push(constraint(0.5, 0, false));
    constr.push(constraint(0.5, 1, false, 0, -dy));
    constr.push(constraint(0.5, 0, false, arrowHead * 0.5, dx));
    constr.push(constraint(1, 1, false, -dx, -arrowHead));
    constr.push(constraint(1, 1, false, 0, -arrowHead * 0.5));
    constr.push(constraint(1, 1, false, -dx, 0));
    constr.push(constraint(0, 1, false, dx, -arrowHead));
    constr.push(constraint(0, 1, false, 0, -arrowHead * 0.5));
    constr.push(constraint(0, 1, false, dx, 0));
    constr.push(constraint(0.75, 1, false, (arrowHead * 0.5 - dx - dy) * 0.5, dy - arrowHead));
    constr.push(constraint(0.75, 1, false, (arrowHead * 0.5 - dx - dy) * 0.5, -dy));
    constr.push(constraint(0.25, 1, false, (dx - arrowHead * 0.5 + dy) * 0.5, dy - arrowHead));
    constr.push(constraint(0.25, 1, false, (dx - arrowHead * 0.5 + dy) * 0.5, -dy));
    constr.push(constraint(0.5, 0.5, false, dy - arrowHead * 0.5, (dx - arrowHead + dy) * 0.5));
    constr.push(constraint(0.5, 0.5, false, arrowHead * 0.5 - dy, (dx - arrowHead + dy) * 0.5));

    return constr;
  }
}

// --- Tailed Arrow -------------------------------------------------------------------------

export class Arrows2TailedArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  dx1 = 20;
  dy1 = 10;
  dx2 = 25;
  dy2 = 30;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy2 = Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    let x2 = 0;

    if (dy2 !== 0) {
      x2 = dx2 + dy2 * (dy2 - dy1) / dy2;
    }

    c.begin();
    c.moveTo(0, h * 0.5 - dy2);
    c.lineTo(dx2, h * 0.5 - dy2);
    c.lineTo(x2, h * 0.5 - dy1);
    c.lineTo(w - dx1, h * 0.5 - dy1);
    c.lineTo(w - dx1, h * 0.5 - dy1 - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx1, h * 0.5 + dy1 + arrowHead);
    c.lineTo(w - dx1, h * 0.5 + dy1);
    c.lineTo(x2, h * 0.5 + dy1);
    c.lineTo(dx2, h * 0.5 + dy2);
    c.lineTo(0, h * 0.5 + dy2);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy2 = Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    let x2 = 0;

    if (dy2 !== 0) {
      x2 = dx2 + dy2 * (dy2 - dy1) / dy2;
    }

    // Relative points with the fixed arrow and tail sizes as offsets, so edges follow a resize
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, 0.5, false, 0, -dy2));
    constr.push(constraint(0, 0.5, false, dx2, -dy2));
    constr.push(constraint(0.5, 0.5, false, (x2 - dx1) * 0.5, -dy1));
    constr.push(constraint(1, 0.5, false, -dx1, -dy1 - arrowHead));
    constr.push(constraint(0, 0.5, false, 0, dy2));
    constr.push(constraint(0, 0.5, false, dx2, dy2));
    constr.push(constraint(0.5, 0.5, false, (x2 - dx1) * 0.5, dy1));
    constr.push(constraint(1, 0.5, false, -dx1, dy1 + arrowHead));
    constr.push(constraint(1, 0.5, false));

    return constr;
  }
}

// --- Tailed Arrow with Notch --------------------------------------------------------------

export class Arrows2TailedNotchedArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  dx1 = 20;
  dy1 = 10;
  dx2 = 25;
  dy2 = 30;
  notch = 0;
  arrowHead = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy2 = Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    let x2 = 0;

    if (dy2 !== 0) {
      x2 = dx2 + notch * (dy2 - dy1) / dy2;
    }

    c.begin();
    c.moveTo(0, h * 0.5 - dy2);
    c.lineTo(dx2, h * 0.5 - dy2);
    c.lineTo(x2, h * 0.5 - dy1);
    c.lineTo(w - dx1, h * 0.5 - dy1);
    c.lineTo(w - dx1, h * 0.5 - dy1 - arrowHead);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx1, h * 0.5 + dy1 + arrowHead);
    c.lineTo(w - dx1, h * 0.5 + dy1);
    c.lineTo(x2, h * 0.5 + dy1);
    c.lineTo(dx2, h * 0.5 + dy2);
    c.lineTo(0, h * 0.5 + dy2);
    c.lineTo(notch, h * 0.5);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy1 = Math.max(0, Math.min(h, getFloat(this.style, 'dy1', this.dy1)));
    const dx1 = Math.max(0, Math.min(w, getFloat(this.style, 'dx1', this.dx1)));
    const dy2 = Math.max(0, Math.min(h, getFloat(this.style, 'dy2', this.dy2)));
    const dx2 = Math.max(0, Math.min(w, getFloat(this.style, 'dx2', this.dx2)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    let x2 = 0;

    if (dy2 !== 0) {
      x2 = dx2 + notch * (dy2 - dy1) / dy2;
    }

    // Relative points with the fixed arrow and tail sizes as offsets, so edges follow a resize
    constr.push(constraint(0, 0.5, false, notch, 0));
    constr.push(constraint(0, 0.5, false, 0, -dy2));
    constr.push(constraint(0, 0.5, false, dx2, -dy2));
    constr.push(constraint(0.5, 0.5, false, (x2 - dx1) * 0.5, -dy1));
    constr.push(constraint(1, 0.5, false, -dx1, -dy1 - arrowHead));
    constr.push(constraint(0, 0.5, false, 0, dy2));
    constr.push(constraint(0, 0.5, false, dx2, dy2));
    constr.push(constraint(0.5, 0.5, false, (x2 - dx1) * 0.5, dy1));
    constr.push(constraint(1, 0.5, false, -dx1, dy1 + arrowHead));
    constr.push(constraint(1, 0.5, false));

    return constr;
  }
}

// --- Striped Arrow ------------------------------------------------------------------------

export class Arrows2StripedArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  notch = 0;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = h * 0.5 * Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    c.begin();
    c.moveTo(notch, dy);
    c.lineTo(w - dx, dy);
    c.lineTo(w - dx, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - dx, h);
    c.lineTo(w - dx, h - dy);
    c.lineTo(notch, h - dy);
    c.close();
    c.moveTo(0, h - dy);
    c.lineTo(notch * 0.16, h - dy);
    c.lineTo(notch * 0.16, dy);
    c.lineTo(0, dy);
    c.close();
    c.moveTo(notch * 0.32, h - dy);
    c.lineTo(notch * 0.8, h - dy);
    c.lineTo(notch * 0.8, dy);
    c.lineTo(notch * 0.32, dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // Arrow width as a fraction of the height and the fixed arrow head size as offsets, so edges follow a resize
    let fdy = Math.max(0, Math.min(1, getFloat(this.style, 'dy', this.dy)));
    fdy = Number.isNaN(fdy) ? this.dy : fdy;
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    // draw.io also computes the notch here, which it does not use

    constr.push(constraint(1, 0.5, false));
    constr.push(constraint(0, 0.5, false, 0, 0));
    constr.push(constraint(0, fdy * 0.5, false));
    constr.push(constraint(0, 1 - fdy * 0.5, false));
    constr.push(constraint(1, fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 1 - fdy * 0.5, false, -dx, 0));
    constr.push(constraint(1, 1, false, -dx, 0));
    constr.push(constraint(0.5, fdy * 0.5, false, -dx * 0.5, 0));
    constr.push(constraint(0.5, 1 - fdy * 0.5, false, -dx * 0.5, 0));

    return constr;
  }
}

// --- Jump-In Arrow ------------------------------------------------------------------------

export class Arrows2JumpInArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  arrowHead = 40;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    c.begin();
    c.moveTo(w - dx, 0);
    c.lineTo(w, arrowHead * 0.5);
    c.lineTo(w - dx, arrowHead);
    c.lineTo(w - dx, arrowHead / 2 + dy);
    c.arcTo(w - dx, h - arrowHead / 2 - dy, 0, 0, 0, 0, h);
    c.arcTo(w - dx, h - arrowHead / 2 + dy, 0, 0, 1, w - dx, arrowHead / 2 - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    // draw.io also computes dy here, which it does not use
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));

    constr.push(constraint(0, 1, false));
    // Relative points with the fixed arrow head size as offsets, so edges follow a resize
    constr.push(constraint(1, 0, false, -dx, 0));
    constr.push(constraint(1, 0, false, 0, arrowHead * 0.5));
    constr.push(constraint(1, 0, false, -dx, arrowHead));

    return constr;
  }
}

// --- U Turn Arrow -------------------------------------------------------------------------

export class Arrows2UTurnArrow extends Actor {
  dy = 0.5;
  dx = 0.5;
  dx2 = 25;
  arrowHead = 40;
  override constraints: readonly ConnectionConstraint[] | null = null;

  /**
   * Longest arrowhead (dx2) that is painted and that the handle sets, so that the
   * scaled points stay finite at any zoom.
   */
  maxArrowheadLength = 1e7;

  /**
   * Returns the arrowhead length (dx2) of the given style for the painter, the
   * connection points and the handle: any length of 0 or more as stored (also
   * one longer than the shape is wide) up to maxArrowheadLength, and the
   * default for infinite and non-numeric lengths.
   */
  getArrowheadLength(style: Style): number {
    const dx2 = Math.max(0, getFloat(style, 'dx2', this.dx2));

    return Number.isFinite(dx2) ? Math.min(dx2, this.maxArrowheadLength) : this.dx2;
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const dx = (h - arrowHead / 2 + dy) / 2;
    const dx2 = this.getArrowheadLength(this.style);

    c.begin();
    c.moveTo(dx, 0);
    c.lineTo(dx + dx2, arrowHead * 0.5);
    c.lineTo(dx, arrowHead);
    c.lineTo(dx, arrowHead / 2 + dy);
    c.arcTo(dx - 2 * dy, dx - 2 * dy, 0, 0, 0, dx, h - 2 * dy);
    c.lineTo(Math.max(w, dx), h - 2 * dy);
    c.lineTo(Math.max(w, dx), h);
    c.lineTo(dx, h);
    c.arcTo(dx, dx, 0, 0, 1, dx, arrowHead / 2 - dy);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const arrowHead = Math.max(0, Math.min(h, getFloat(this.style, 'arrowHead', this.arrowHead)));
    const dx = (h - arrowHead / 2 + dy) / 2;
    // The arrowhead length as in the painter, which does not depend on the
    // width, so the end is a fixed offset from the left side
    const dx2 = this.getArrowheadLength(this.style);
    // The bend is drawn from the height: the points at the bend keep their
    // offset from the left side and the end is anchored to the right side,
    // so edges follow a resize that keeps the height (eg. a longer arrow)
    const dr = Math.max(w, dx) - w;

    constr.push(constraint(0, 0, false, dx, 0));
    constr.push(constraint(0, 0, false, dx + dx2, arrowHead * 0.5));
    constr.push(constraint(0, 0, false, dx, arrowHead));
    constr.push(constraint(0.5, 1, false, dx * 0.5, -2 * dy));
    constr.push(constraint(1, 1, false, dr, -2 * dy));
    constr.push(constraint(1, 1, false, dr, -dy));
    constr.push(constraint(1, 1, false, dr, 0));
    constr.push(constraint(0.5, 1, false, dx * 0.5, 0));
    constr.push(constraint(0, 1, false, dx, 0));
    constr.push(constraint(0, 0.5, false, 0, (arrowHead * 0.5 - dy) * 0.5));
    constr.push(constraint(0, 0.5, false, arrowHead - 2 * dy, (arrowHead * 0.5 - dy) * 0.5));

    return constr;
  }
}

// --- Wedge Arrow (edge) -------------------------------------------------------------------

export class ArrowsWedgeArrow extends Arrow {
  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    const sw = Math.max(0, getFloat(this.style, 'startWidth', 20));

    // Base vector (between end points)
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    const dx = pe.x - p0.x;
    const dy = pe.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx * sw / dist;
    const ny = dy * sw / dist;

    c.begin();
    c.moveTo(p0.x + ny, p0.y - nx);
    c.lineTo(p0.x - ny, p0.y + nx);
    c.lineTo(pe.x, pe.y);
    c.close();
    c.fillAndStroke();
  }
}

// --- Wedge Arrow Dashed (edge) ------------------------------------------------------------

/** Extends mxArrow but is constructed with mxArrowConnector's constructor, as in draw.io. */
export class ArrowsWedgeArrowDashed extends Arrow {
  constructor() {
    super();
    this.startSize = ARROW_SIZE / 5;
    this.endSize = ARROW_SIZE / 5;
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    const startWidth = Math.max(0, getFloat(this.style, 'startWidth', 20));
    const steps = 8;
    // Base vector (between end points)
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    const dx = pe.x - p0.x;
    const dy = pe.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx * startWidth / dist;
    const ny = dy * startWidth / dist;
    let cnx = nx; // current nx
    let cny = ny; // current ny
    let pcx = p0.x; // current x on edge
    let pcy = p0.y; // current y on edge

    c.begin();

    for (let i = 0; i <= steps; i++) {
      cnx = nx * (steps - i) / steps;
      cny = ny * (steps - i) / steps;

      if (i === steps) {
        cnx = nx * (steps - i * 0.98) / steps;
        cny = ny * (steps - i * 0.98) / steps;
      }

      const px1 = pcx + cny;
      const py1 = pcy - cnx;
      const px2 = pcx - cny;
      const py2 = pcy + cnx;

      c.moveTo(px1, py1);
      c.lineTo(px2, py2);

      pcx = pcx + dx / steps;
      pcy = pcy + dy / steps;
    }

    c.stroke();
  }
}

// --- Wedge Arrow Dashed v2 (edge) ---------------------------------------------------------

/** Extends mxArrow but is constructed with mxArrowConnector's constructor, as in draw.io. */
export class ArrowsWedgeArrowDashed2 extends Arrow {
  /** Maximum number of steps. Default is 10000. */
  maxSteps = 10000;

  constructor() {
    super();
    this.startSize = ARROW_SIZE / 5;
    this.endSize = ARROW_SIZE / 5;
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    const startWidth = Math.max(0, getFloat(this.style, 'startWidth', 20));
    const stepSize = Math.max(0, getFloat(this.style, 'stepSize', 10));

    // Base vector (between end points)
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    const dx = pe.x - p0.x;
    const dy = pe.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx * startWidth / dist;
    const ny = dy * startWidth / dist;
    let cnx = nx; // current nx
    let cny = ny; // current ny
    let pcx = p0.x; // current x on edge
    let pcy = p0.y; // current y on edge
    const steps = (stepSize > 0) ? Math.min(Math.floor(dist / stepSize), this.maxSteps) : 0;

    c.begin();

    for (let i = 0; i <= steps; i++) {
      cnx = nx * (steps - i) / steps;
      cny = ny * (steps - i) / steps;

      if (i === steps) {
        cnx = nx * (steps - i * 0.98) / steps;
        cny = ny * (steps - i * 0.98) / steps;
      }

      const px1 = pcx + cny;
      const py1 = pcy - cnx;
      const px2 = pcx - cny;
      const py2 = pcy + cnx;

      c.moveTo(px1, py1);
      c.lineTo(px2, py2);

      pcx = pcx + dx / steps;
      pcy = pcy + dy / steps;
    }

    c.stroke();
  }
}

/** The shapes of mxArrows.js in the order it registers them. */
export const ARROWS_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.arrows2.arrow', Arrows2Arrow],
  ['mxgraph.arrows2.twoWayArrow', Arrows2TwoWayArrow],
  ['mxgraph.arrows2.stylisedArrow', Arrows2StylisedArrow],
  ['mxgraph.arrows2.sharpArrow', Arrows2SharpArrow],
  ['mxgraph.arrows2.sharpArrow2', Arrows2SharpArrow2],
  ['mxgraph.arrows2.calloutArrow', Arrows2CalloutArrow],
  ['mxgraph.arrows2.bendArrow', Arrows2BendArrow],
  ['mxgraph.arrows2.bendDoubleArrow', Arrows2BendDoubleArrow],
  ['mxgraph.arrows2.calloutDoubleArrow', Arrows2CalloutDoubleArrow],
  ['mxgraph.arrows2.calloutQuadArrow', Arrows2CalloutQuadArrow],
  ['mxgraph.arrows2.calloutDouble90Arrow', Arrows2CalloutDouble90Arrow],
  ['mxgraph.arrows2.quadArrow', Arrows2QuadArrow],
  ['mxgraph.arrows2.triadArrow', Arrows2TriadArrow],
  ['mxgraph.arrows2.tailedArrow', Arrows2TailedArrow],
  ['mxgraph.arrows2.tailedNotchedArrow', Arrows2TailedNotchedArrow],
  ['mxgraph.arrows2.stripedArrow', Arrows2StripedArrow],
  ['mxgraph.arrows2.jumpInArrow', Arrows2JumpInArrow],
  ['mxgraph.arrows2.uTurnArrow', Arrows2UTurnArrow],
  ['mxgraph.arrows2.wedgeArrow', ArrowsWedgeArrow],
  ['mxgraph.arrows2.wedgeArrowDashed', ArrowsWedgeArrowDashed],
  ['mxgraph.arrows2.wedgeArrowDashed2', ArrowsWedgeArrowDashed2],
];
