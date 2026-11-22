/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxLeanMap.js — the lean mapping shapes (mxgraph.lean_mapping.*),
 * the electronic and manual info flow edges and their connection points.
 * Modified for DeckWerk: the handles of timeline2 are left out; the painting
 * code is unchanged (style values the JS adds to canvas coordinates or
 * compares with numbers are converted with Number()).
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point, Style } from '../types.js';
import { Arrow } from './edges.js';
import { Shape, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getFloat, getValue, toNumber } from './util.js';

/** `mxUtils.getValue(this.style, key, fallback)` passed to setFillColor (a number is painted as its string). */
function styleColor(style: Style, key: string, fallback: string): string {
  return String(getValue(style, key, fallback));
}

/** The 16 points along the sides that most lean shapes list, in their order. */
const LEAN_RECT_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, true), constraint(1, 0, true), constraint(0, 1, true), constraint(1, 1, true),
  constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0, 0.25, true),
  constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true),
  constraint(1, 0.75, true), constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true),
];

// --- Boat Shipment ------------------------------------------------------------------------

export class LeanBoatShipment extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.5, 0, false), constraint(0.5, 1, false), constraint(0, 0.8, false), constraint(1, 0.8, false),
    constraint(0.2, 1, false), constraint(0.8, 1, false), constraint(0.26, 0.5, false), constraint(0.74, 0.5, false),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    c.moveTo(w * 0.15, h * 0.77);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w * 0.85, h * 0.77);
    c.close();
    c.moveTo(w * 0.2, h);
    c.lineTo(0, h * 0.8);
    c.lineTo(w, h * 0.8);
    c.lineTo(w * 0.8, h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Safety Stock -------------------------------------------------------------------------

export class LeanSafetyStock extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    this.background(c, w, h);
    c.setShadow(false);
    this.foreground(c, w, h);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.rect(0, 0, w, h);
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, w: number, h: number): void {
    c.begin();
    c.moveTo(0, h * 0.34);
    c.lineTo(w, h * 0.34);
    c.moveTo(0, h * 0.66);
    c.lineTo(w, h * 0.66);
    c.fillAndStroke();
  }
}

// --- Data Box -----------------------------------------------------------------------------

export class LeanDataBox extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    this.background(c, w, h);
    c.setShadow(false);
    this.foreground(c, w, h);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.begin();
    c.moveTo(0, h);
    c.lineTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, w: number, h: number): void {
    c.begin();
    c.moveTo(0, h * 0.2);
    c.lineTo(w, h * 0.2);
    c.moveTo(0, h * 0.4);
    c.lineTo(w, h * 0.4);
    c.moveTo(0, h * 0.6);
    c.lineTo(w, h * 0.6);
    c.moveTo(0, h * 0.8);
    c.lineTo(w, h * 0.8);
    c.stroke();
  }
}

// --- Customer / Supplier ------------------------------------------------------------------

export class LeanCustomerSupplier extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(1, 0, true), constraint(0, 1, true), constraint(1, 1, true), constraint(0.33, 0, true),
    constraint(0.67, 0, true), constraint(0, 0.3, true), constraint(0, 0.5, true), constraint(0, 0.75, true),
    constraint(1, 0.25, true), constraint(1, 0.5, true), constraint(1, 0.75, true), constraint(0.25, 1, true),
    constraint(0.5, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    this.background(c, w, h);
    c.setShadow(false);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.begin();
    c.moveTo(0, h);
    c.lineTo(0, h * 0.3);
    c.lineTo(w * 0.33, h * 0.02);
    c.lineTo(w * 0.33, h * 0.3);
    c.lineTo(w * 0.67, h * 0.02);
    c.lineTo(w * 0.67, h * 0.3);
    c.lineTo(w, h * 0.02);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Dedicated Process --------------------------------------------------------------------

export class LeanDedicatedProcess extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const fontSize = getFloat(this.style, 'fontSize', '8');

    this.background(c, w, h);
    c.setShadow(false);
    this.foreground(c, w, h, fontSize);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.rect(0, 0, w, h);
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, w: number, h: number, fontSize: number): void {
    const lineH = Math.min(fontSize * 1.5, h);
    c.begin();
    c.moveTo(0, lineH);
    c.lineTo(w, lineH);
    c.stroke();
  }
}

// --- Shared Process -----------------------------------------------------------------------

export class LeanSharedProcess extends Shape {
  /** Maximum number of hatch lines. Default is 10000. */
  maxLines = 10000;
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const fontSize = getFloat(this.style, 'fontSize', '8');

    this.background(c, w, h);
    c.setShadow(false);
    this.foreground(c, w, h, fontSize);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.rect(0, 0, w, h);
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, w: number, h: number, fontSize: number): void {
    const lineH = Math.min(fontSize * 1.5, h);
    c.begin();
    c.moveTo(0, lineH);
    c.lineTo(w, lineH);
    c.stroke();

    let start = 0;
    let n = 0;
    const s = 10;
    c.begin();
    const strokeWidth = getFloat(this.style, 'strokeWidth', '2');
    c.setStrokeWidth(strokeWidth * 0.5);

    while (start < h + w && n < this.maxLines) {
      start = start + s;
      n++;
      if (start > lineH) {
        const startX = Math.max(0, start - h);
        const startY = Math.min(start, h);

        const endX = Math.min(start - lineH, w);

        let endY = lineH;
        endY = Math.max(start - w, lineH);

        if (startX < w) {
          c.moveTo(startX, startY);
          c.lineTo(endX, endY);
        }
      }
    }

    c.stroke();
  }
}

// --- Workcell -----------------------------------------------------------------------------

export class LeanWorkcell extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 0, true), constraint(1, 0, true), constraint(0, 1, true), constraint(1, 1, true),
    constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0, 0.25, true),
    constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true),
    constraint(1, 0.75, true), constraint(0.25, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(w * 0.65, h);
    c.lineTo(w * 0.65, h * 0.4);
    c.lineTo(w * 0.35, h * 0.4);
    c.lineTo(w * 0.35, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Inventory Box ------------------------------------------------------------------------

export class LeanInventoryBox extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 1, true), constraint(1, 1, true), constraint(0.5, 0, true), constraint(0.375, 0.25, false),
    constraint(0.25, 0.5, false), constraint(0.125, 0.75, false), constraint(0.625, 0.25, false),
    constraint(0.75, 0.5, false), constraint(0.875, 0.75, false), constraint(0.25, 1, true), constraint(0.5, 1, true),
    constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w * 0.5, 0);
    c.lineTo(w, h);
    c.close();
    c.fillAndStroke();
    c.setShadow(false);
    c.begin();
    c.moveTo(w * 0.4, h * 0.45);
    c.lineTo(w * 0.6, h * 0.45);
    c.moveTo(w * 0.5, h * 0.45);
    c.lineTo(w * 0.5, h * 0.85);
    c.moveTo(w * 0.4, h * 0.85);
    c.lineTo(w * 0.6, h * 0.85);
    c.stroke();
  }
}

// --- Push Arrow ---------------------------------------------------------------------------

export class LeanPushArrow extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.25, 0.17, false), constraint(0.5, 0.17, false), constraint(0.75, 0, true), constraint(0, 0.17, true),
    constraint(0, 0.5, true), constraint(0, 0.83, true), constraint(1, 0.5, true), constraint(0.25, 0.83, false),
    constraint(0.5, 0.83, false), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    this.background(c, w, h);
    c.setShadow(false);
    this.foreground(c, w, h);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.begin();
    c.moveTo(0, h * 0.17);
    c.lineTo(w * 0.75, h * 0.17);
    c.lineTo(w * 0.75, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w * 0.75, h);
    c.lineTo(w * 0.75, h * 0.83);
    c.lineTo(0, h * 0.83);
    c.close();
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, w: number, h: number): void {
    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.rect(0, h * 0.17, w * 0.12, h * 0.66);
    c.fill();
    c.rect(w * 0.24, h * 0.17, w * 0.12, h * 0.66);
    c.fill();
    c.rect(w * 0.48, h * 0.17, w * 0.12, h * 0.66);
    c.fill();

    c.begin();
    c.moveTo(w * 0.72, h * 0.17);
    c.lineTo(w * 0.75, h * 0.17);
    c.lineTo(w * 0.75, 0);
    c.lineTo(w, h * 0.5);
    c.lineTo(w * 0.75, h);
    c.lineTo(w * 0.75, h * 0.83);
    c.lineTo(w * 0.72, h * 0.83);
    c.close();
    c.fill();
  }
}

// --- Supermarket --------------------------------------------------------------------------

export class LeanSupermarket extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.moveTo(0, h * 0.33);
    c.lineTo(w, h * 0.33);
    c.moveTo(0, h * 0.67);
    c.lineTo(w, h * 0.67);
    c.fillAndStroke();
  }
}

// --- Material Pull ------------------------------------------------------------------------

export class LeanMaterialPull extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.5, 0, true), constraint(0.5, 1, true), constraint(0, 0.5, true), constraint(0.98, 0.5, true),
    constraint(0.144, 0.144, false), constraint(0.144, 0.845, false), constraint(0.845, 0.845, false),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(w * 0.732, h * 0.0736);
    c.arcTo(w * 0.4827, h * 0.4959, 0, 1, 0, w * 0.9553, h * 0.6191);
    c.stroke();

    c.begin();
    c.moveTo(w * 0.9071, h * 0.6191);
    c.lineTo(w * 0.9794, h * 0.4951);
    c.lineTo(w, h * 0.6438);
    c.close();
    c.fillAndStroke();
  }
}

// --- FIFO Lane ----------------------------------------------------------------------------

export class LeanFifoLane extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 1, true), constraint(1, 1, true), constraint(0.5, 0, true), constraint(0, 0.25, true),
    constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true),
    constraint(1, 0.75, true), constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const fontSize = getFloat(this.style, 'fontSize', '8');

    this.background(c, w, h, fontSize);
    c.setShadow(false);
  }

  background(c: SvgCanvas, w: number, h: number, fontSize: number): void {
    const lineH = Math.min(fontSize * 1.5, h);
    c.begin();
    c.moveTo(0, lineH);
    c.lineTo(w, lineH);
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.stroke();

    c.rect(w * 0.02, lineH + 4, w * 0.26, h - lineH - 8);
    c.fillAndStroke();

    c.ellipse(w * 0.35, lineH + 4, w * 0.26, h - lineH - 8);
    c.fillAndStroke();

    c.begin();
    c.moveTo(w * 0.69, lineH + 4);
    c.lineTo(w * 0.98, lineH + 4);
    c.lineTo(w * 0.835, h - 4);
    c.close();
    c.fillAndStroke();
  }
}

// --- Truck Shipment -----------------------------------------------------------------------

export class LeanTruckShipment extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 0, true), constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0, 0.25, true),
    constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(0.6, 0.35, false), constraint(1, 0.5, true),
    constraint(1, 0.75, true), constraint(0.25, 1, true), constraint(0.5, 0.8, false), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    this.background(c, w, h);
    c.setShadow(false);
  }

  background(c: SvgCanvas, w: number, h: number): void {
    c.rect(0, 0, w * 0.6, h * 0.8);
    c.fillAndStroke();

    c.rect(w * 0.6, h * 0.35, w * 0.4, h * 0.45);
    c.fillAndStroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.ellipse(w * 0.15, h * 0.8, w * 0.2, h * 0.2);
    c.fillAndStroke();

    c.ellipse(w * 0.65, h * 0.8, w * 0.2, h * 0.2);
    c.fillAndStroke();
  }
}

// --- Production Control -------------------------------------------------------------------

export class LeanProductionControl extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.rect(0, 0, w, h);
    c.fillAndStroke();
  }
}

// --- FIFO Sequence ------------------------------------------------------------------------

export class LeanFifoSequence extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 0, true), constraint(1, 0, true), constraint(0, 1, true), constraint(1, 1, true),
    constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0, 0.5, true),
    constraint(1, 0.5, true), constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.moveTo(w * 0.05, h * 0.5);
    c.lineTo(w * 0.15, h * 0.5);
    c.moveTo(w * 0.75, h * 0.5);
    c.lineTo(w * 0.88, h * 0.5);
    c.stroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.begin();
    c.moveTo(w * 0.88, h * 0.39);
    c.lineTo(w * 0.98, h * 0.5);
    c.lineTo(w * 0.88, h * 0.61);
    c.fillAndStroke();
  }
}

// --- Production Kanban --------------------------------------------------------------------

export class LeanProductionKanban extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.setDashed(true);
    c.begin();
    c.moveTo(4, h - 10);
    c.lineTo(4, 25);
    c.lineTo(w, 25);
    c.stroke();

    c.setDashed(false);
    c.begin();
    c.moveTo(w - 75, 0);
    c.lineTo(w - 30, 0);
    c.lineTo(w - 15, 15);
    c.lineTo(w - 15, 50);
    c.lineTo(w - 75, 50);
    c.close();
    c.fillAndStroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.begin();
    c.moveTo(0, h - 10);
    c.lineTo(4, h);
    c.lineTo(8, h - 10);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0, 1, false, 4, 0));
    constr.push(constraint(1, 0, false, 0, 25));

    return constr;
  }
}

// --- Withdrawal Kanban --------------------------------------------------------------------

export class LeanWithdrawalKanban extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.setDashed(true);
    c.begin();
    c.moveTo(4, h - 10);
    c.lineTo(4, 25);
    c.lineTo(w, 25);
    c.stroke();

    c.setDashed(false);
    c.begin();
    c.moveTo(w - 75, 0);
    c.lineTo(w - 30, 0);
    c.lineTo(w - 15, 15);
    c.lineTo(w - 15, 50);
    c.lineTo(w - 75, 50);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(w - 75, 45);
    c.lineTo(w - 70, 50);
    c.moveTo(w - 75, 35);
    c.lineTo(w - 60, 50);
    c.moveTo(w - 75, 25);
    c.lineTo(w - 50, 50);
    c.moveTo(w - 75, 15);
    c.lineTo(w - 40, 50);
    c.moveTo(w - 75, 5);
    c.lineTo(w - 30, 50);
    c.moveTo(w - 70, 0);
    c.lineTo(w - 20, 50);
    c.moveTo(w - 60, 0);
    c.lineTo(w - 15, 45);
    c.moveTo(w - 50, 0);
    c.lineTo(w - 15, 35);
    c.moveTo(w - 40, 0);
    c.lineTo(w - 15, 25);
    c.stroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.begin();
    c.moveTo(0, h - 10);
    c.lineTo(4, h);
    c.lineTo(8, h - 10);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0, 1, false, 4, 0));
    constr.push(constraint(1, 0, false, 0, 25));

    return constr;
  }
}

// --- Signal Kanban ------------------------------------------------------------------------

export class LeanSignalKanban extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.setDashed(true);
    c.begin();
    c.moveTo(4, h - 10);
    c.lineTo(4, 15);
    c.lineTo(w, 15);
    c.stroke();

    c.setDashed(false);
    c.begin();
    c.moveTo(w - 65, 0);
    c.lineTo(w - 25, 0);
    c.lineTo(w - 45, 45);
    c.close();
    c.fillAndStroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.begin();
    c.moveTo(0, h - 10);
    c.lineTo(4, h);
    c.lineTo(8, h - 10);
    c.close();
    c.fillAndStroke();
  }

  override getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    constr.push(constraint(0, 1, false, 4, 0));
    constr.push(constraint(1, 0, false, 0, 15));

    return constr;
  }
}

// --- Sequenced Pull Ball ------------------------------------------------------------------

export class LeanSequencedPullBall extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.144, 0.144, false), constraint(0.856, 0.144, false), constraint(0.856, 0.856, false),
    constraint(0.144, 0.856, false), constraint(0, 0.5, true), constraint(1, 0.5, true), constraint(0.5, 0, true),
    constraint(0.5, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.ellipse(0, 0, w, h);
    c.fillAndStroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.setShadow(false);

    c.ellipse(w * 0.15, h * 0.15, w * 0.7, h * 0.7);
    c.fillAndStroke();
  }
}

// --- Rail Shipment ------------------------------------------------------------------------

export class LeanRailShipment extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 1, true), constraint(1, 1, true), constraint(0.25, 0, true), constraint(0.5, 0, true),
    constraint(0.75, 0, true), constraint(0.1, 0.25, false), constraint(0.1, 0.5, false), constraint(0.1, 0.75, false),
    constraint(0.9, 0.25, false), constraint(0.9, 0.5, false), constraint(0.9, 0.75, false), constraint(0.25, 1, true),
    constraint(0.5, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.rect(w * 0.1, 0, w * 0.35, h * 0.8);
    c.fillAndStroke();
    c.rect(w * 0.55, 0, w * 0.35, h * 0.8);
    c.fillAndStroke();

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.moveTo(w * 0.45, h * 0.7);
    c.lineTo(w * 0.55, h * 0.7);
    c.stroke();

    c.ellipse(w * 0.15, h * 0.8, w * 0.06, h * 0.2);
    c.fillAndStroke();
    c.ellipse(w * 0.34, h * 0.8, w * 0.06, h * 0.2);
    c.fillAndStroke();
    c.ellipse(w * 0.6, h * 0.8, w * 0.06, h * 0.2);
    c.fillAndStroke();
    c.ellipse(w * 0.79, h * 0.8, w * 0.06, h * 0.2);
    c.fillAndStroke();
  }
}

// --- Warehouse ----------------------------------------------------------------------------

export class LeanWarehouse extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.rect(0, 0, w, h);
    c.fillAndStroke();

    c.setShadow(false);

    c.begin();
    c.moveTo(0, h * 0.4);
    c.lineTo(w, h * 0.4);
    c.moveTo(w * 0.15, h);
    c.lineTo(w * 0.15, h * 0.55);
    c.lineTo(w * 0.3, h * 0.55);
    c.lineTo(w * 0.3, h);
    c.stroke();

    c.ellipse(w * 0.27, h * 0.75, w * 0.02, w * 0.02);
    c.stroke();
  }
}

// --- Timeline -----------------------------------------------------------------------------

export class LeanTimeline extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const shapeInfo = String(getValue(this.style, 'mainText', '20,Time 1,50,Time 2,30,Time 3,40,Time 4,30,Time 5,50,Time 6,20,Time 7')).split(',');
    // Only ever multiplied, so ToNumber as the JS arithmetic applies it
    const fontSize = toNumber(getValue(this.style, 'fontSize', '12'));
    const times: number[] = [];
    let totalTime = 0;

    for (let i = 0; i < shapeInfo.length; i = i + 2) {
      const currTime = parseFloat(shapeInfo[i]);
      times.push(currTime);
      totalTime = totalTime + currTime;
    }

    const scaleX = w / totalTime;
    const names: string[] = [];

    for (let i = 1; i < shapeInfo.length; i = i + 2) {
      names.push(shapeInfo[i]);
    }

    c.begin();
    let currX = 0;
    c.moveTo(0, h);

    for (let i = 0; i < names.length; i++) {
      const currTime = times[i] * scaleX;
      currX = currX + currTime;

      if (i % 2 === 0) {
        c.lineTo(currX, h);
        c.lineTo(currX, fontSize * 1.5);
        c.text(currX - currTime * 0.5, h - fontSize * 0.75, 0, 0, names[i], 'center', 'middle', false, '', null, false, 0);
      } else {
        c.lineTo(currX, fontSize * 1.5);
        c.lineTo(currX, h);
        c.text(currX - currTime * 0.5, fontSize * 0.75, 0, 0, names[i], 'center', 'middle', false, '', null, false, 0);
      }
    }

    c.stroke();
  }
}

// --- Cross Dock ---------------------------------------------------------------------------

export class LeanCrossDock extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEAN_RECT_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.rect(0, 0, w, h);
    c.fillAndStroke();

    c.setShadow(false);

    c.begin();
    c.moveTo(0, h * 0.25);
    c.lineTo(w, h * 0.25);

    c.moveTo(w * 0.1, h * 0.4);
    c.lineTo(w * 0.35, h * 0.4);
    c.arcTo(w * 0.15, h * 0.15, 0, 0, 1, w * 0.5, h * 0.5);
    c.arcTo(w * 0.15, h * 0.15, 0, 0, 0, w * 0.65, h * 0.6);
    c.lineTo(w * 0.9, h * 0.6);
    c.stroke();

    c.moveTo(w * 0.1, h * 0.4);
    c.lineTo(w * 0.35, h * 0.4);
    c.arcTo(w * 0.15, h * 0.25, 0, 0, 1, w * 0.5, h * 0.55);
    c.arcTo(w * 0.15, h * 0.25, 0, 0, 0, w * 0.65, h * 0.7);
    c.lineTo(w * 0.9, h * 0.7);
    c.stroke();

    c.moveTo(w * 0.1, h * 0.4);
    c.lineTo(w * 0.35, h * 0.4);
    c.arcTo(w * 0.15, h * 0.3, 0, 0, 1, w * 0.5, h * 0.6);
    c.arcTo(w * 0.15, h * 0.3, 0, 0, 0, w * 0.65, h * 0.8);
    c.lineTo(w * 0.9, h * 0.8);
    c.stroke();

    c.moveTo(w * 0.1, h * 0.8);
    c.lineTo(w * 0.35, h * 0.8);
    c.arcTo(w * 0.15, h * 0.3, 0, 0, 0, w * 0.5, h * 0.6);
    c.arcTo(w * 0.15, h * 0.3, 0, 0, 1, w * 0.65, h * 0.4);
    c.lineTo(w * 0.9, h * 0.4);
    c.stroke();

    c.moveTo(w * 0.1, h * 0.8);
    c.lineTo(w * 0.35, h * 0.8);
    c.arcTo(w * 0.15, h * 0.1, 0, 0, 0, w * 0.5, h * 0.75);
    c.arcTo(w * 0.15, h * 0.1, 0, 0, 1, w * 0.65, h * 0.7);
    c.lineTo(w * 0.9, h * 0.7);
    c.stroke();
  }
}

// --- Orders -------------------------------------------------------------------------------

export class LeanOrders extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.05, 0, true), constraint(0.95, 0, true), constraint(0, 1, true), constraint(1, 1, true),
    constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0.05, 0.25, false),
    constraint(0.05, 0.5, false), constraint(0, 0.75, true), constraint(0.95, 0.25, false),
    constraint(0.95, 0.5, false), constraint(1, 0.75, true), constraint(0.25, 1, true), constraint(0.5, 1, true),
    constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.rect(0, h * 0.56, w, h * 0.44);
    c.fillAndStroke();

    const strokeWidth = getFloat(this.style, 'strokeWidth', '2');
    c.setStrokeWidth(strokeWidth * 0.5);

    c.begin();
    c.moveTo(w * 0.04, h * 0.5418);
    c.lineTo(w * 0.94, h * 0.5418);
    c.moveTo(w * 0.0522, h * 0.5088);
    c.lineTo(w * 0.9522, h * 0.5088);
    c.moveTo(w * 0.05, h * 0.4738);
    c.lineTo(w * 0.95, h * 0.4738);
    c.moveTo(w * 0.0456, h * 0.4427);
    c.lineTo(w * 0.9456, h * 0.4427);
    c.moveTo(w * 0.0422, h * 0.4135);
    c.lineTo(w * 0.9422, h * 0.4135);
    c.moveTo(w * 0.0533, h * 0.3804);
    c.lineTo(w * 0.9533, h * 0.3804);
    c.moveTo(w * 0.0556, h * 0.3454);
    c.lineTo(w * 0.9556, h * 0.3454);
    c.moveTo(w * 0.05, h * 0.3143);
    c.lineTo(w * 0.95, h * 0.3143);
    c.moveTo(w * 0.0489, h * 0.2832);
    c.lineTo(w * 0.0489, h * 0.2832);
    c.moveTo(w * 0.0544, h * 0.254);
    c.lineTo(w * 0.9544, h * 0.254);
    c.moveTo(w * 0.0489, h * 0.221);
    c.lineTo(w * 0.9489, h * 0.221);
    c.moveTo(w * 0.0556, h * 0.1918);
    c.lineTo(w * 0.9556, h * 0.1918);
    c.moveTo(w * 0.0522, h * 0.1587);
    c.lineTo(w * 0.9522, h * 0.1587);
    c.moveTo(w * 0.0544, h * 0.1276);
    c.lineTo(w * 0.9544, h * 0.1276);
    c.moveTo(w * 0.0544, h * 0.0965);
    c.lineTo(w * 0.9544, h * 0.0965);
    c.moveTo(w * 0.0556, h * 0.0654);
    c.lineTo(w * 0.9556, h * 0.0654);
    c.moveTo(w * 0.0533, h * 0.0304);
    c.lineTo(w * 0.9533, h * 0.0304);
    c.moveTo(w * 0.0556, 0);
    c.lineTo(w * 0.9556, 0);
    c.stroke();
  }
}

// --- Batched Kanban -----------------------------------------------------------------------

export class LeanBatchedKanban extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [constraint(0, 0.5, true), constraint(1, 0.5, true)];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    w = Math.max(110, w);

    c.translate(x, y);

    c.begin();
    c.moveTo(4, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.stroke();

    c.begin();
    c.moveTo(w * 0.5 - 20, h * 0.5 - 35);
    c.lineTo(w * 0.5 + 25, h * 0.5 - 35);
    c.lineTo(w * 0.5 + 40, h * 0.5 - 20);
    c.lineTo(w * 0.5 + 40, h * 0.5 + 15);
    c.lineTo(w * 0.5 - 20, h * 0.5 + 15);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(w * 0.5 - 30, h * 0.5 - 25);
    c.lineTo(w * 0.5 + 15, h * 0.5 - 25);
    c.lineTo(w * 0.5 + 30, h * 0.5 - 10);
    c.lineTo(w * 0.5 + 30, h * 0.5 + 25);
    c.lineTo(w * 0.5 - 30, h * 0.5 + 25);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(w * 0.5 - 40, h * 0.5 - 15);
    c.lineTo(w * 0.5 + 5, h * 0.5 - 15);
    c.lineTo(w * 0.5 + 20, h * 0.5);
    c.lineTo(w * 0.5 + 20, h * 0.5 + 35);
    c.lineTo(w * 0.5 - 40, h * 0.5 + 35);
    c.close();
    c.fillAndStroke();

    const strokeColor = styleColor(this.style, 'strokeColor', '#000000');
    c.setFillColor(strokeColor);
    c.begin();
    c.moveTo(w - 10, h * 0.5 - 4);
    c.lineTo(w, h * 0.5);
    c.lineTo(w - 10, h * 0.5 + 4);
    c.close();
    c.fillAndStroke();
  }
}

// --- Control Center -----------------------------------------------------------------------

export class LeanControlCenter extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.15, 0, true), constraint(0.85, 0, true), constraint(0, 1, true), constraint(1, 1, true),
    constraint(0.5, 0, true), constraint(0.15, 0.25, false), constraint(0.15, 0.5, false), constraint(0, 0.75, true),
    constraint(0.85, 0.25, false), constraint(0.85, 0.5, false), constraint(1, 0.75, true), constraint(0.25, 1, true),
    constraint(0.5, 1, true), constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.rect(w * 0.15, 0, w * 0.7, h * 0.8);
    c.fillAndStroke();
    c.rect(0, h * 0.8, w, h * 0.2);
    c.fillAndStroke();
  }
}

// --- Electronic Info ----------------------------------------------------------------------

export class LeanElectronicInfoShape extends Arrow {
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

    let dist = Math.sqrt(dx * dx + dy * dy);
    let nx = dx / dist;
    let ny = dy / dist;
    const midX = p0.x + dx * 0.5;
    const midY = p0.y + dy * 0.5;

    const p1x = midX - nx * dist * 0.1 - ny / 3 * dist * 0.1;
    const p1y = midY - ny * dist * 0.1 + nx / 3 * dist * 0.1;
    const p4x = midX + nx * dist * 0.1 + ny / 3 * dist * 0.1;
    const p4y = midY + ny * dist * 0.1 - nx / 3 * dist * 0.1;

    c.begin();
    c.moveTo(p0.x, p0.y);
    c.lineTo(p4x, p4y);
    c.lineTo(p1x, p1y);
    c.lineTo(pe.x, pe.y);
    c.stroke();

    dx = pe.x - p1x;
    dy = pe.y - p1y;
    dist = Math.sqrt(dx * dx + dy * dy);
    nx = dx / dist;
    ny = dy / dist;

    c.setFillColor(styleColor(this.style, 'strokeColor', '#000000'));
    c.begin();
    c.moveTo(pe.x - nx * 10 - ny * 5, pe.y - ny * 10 + nx * 5);
    c.lineTo(pe.x, pe.y);
    c.lineTo(pe.x - nx * 10 + ny * 5, pe.y - ny * 10 - nx * 5);
    c.fillAndStroke();
  }
}

// --- Manual Info --------------------------------------------------------------------------

export class LeanManualInfoShape extends Arrow {
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

    c.begin();
    c.moveTo(p0.x, p0.y);
    c.lineTo(pe.x, pe.y);
    c.stroke();

    c.setFillColor(styleColor(this.style, 'strokeColor', '#000000'));
    c.begin();
    c.moveTo(pe.x - nx * 10 - ny * 5, pe.y - ny * 10 + nx * 5);
    c.lineTo(pe.x, pe.y);
    c.lineTo(pe.x - nx * 10 + ny * 5, pe.y - ny * 10 - nx * 5);
    c.fillAndStroke();
  }
}

// --- Timeline (timeline2) -----------------------------------------------------------------

export class ShapeLeanTimeline extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // The JS compares the raw values with 0.5 and adds them to the canvas
    // offsets ('0' is the default): Number() of the value
    const dy1 = toNumber(getValue(this.style, 'dy1', '0'));
    const dx2 = toNumber(getValue(this.style, 'dx2', '0'));
    const dy2 = toNumber(getValue(this.style, 'dy2', '0'));
    const dx3 = toNumber(getValue(this.style, 'dx3', '0'));
    const dy3 = toNumber(getValue(this.style, 'dy3', '0'));
    const dx4 = toNumber(getValue(this.style, 'dx4', '0'));
    const dy4 = toNumber(getValue(this.style, 'dy4', '0'));
    const dx5 = toNumber(getValue(this.style, 'dx5', '0'));
    const dy5 = toNumber(getValue(this.style, 'dy5', '0'));
    const dy6 = toNumber(getValue(this.style, 'dy6', '0'));

    let lastUp = true;

    c.begin();

    if (dy1 <= 0.5) {
      c.moveTo(0, 0);
      lastUp = true;
    } else {
      c.moveTo(0, h);
      lastUp = false;
    }

    // 2
    if (dy2 <= 0.5 && lastUp) {
      c.lineTo(dx2, 0);
      lastUp = true;
    } else if (dy2 > 0.5 && !lastUp) {
      c.lineTo(dx2, h);
      lastUp = false;
    } else if (dy2 <= 0.5 && !lastUp) {
      c.lineTo(dx2, h);
      c.lineTo(dx2, 0);
      lastUp = true;
    } else {
      c.lineTo(dx2, 0);
      c.lineTo(dx2, h);
      lastUp = false;
    }

    // 3
    if (dy3 <= 0.5 && lastUp) {
      c.lineTo(dx3, 0);
      lastUp = true;
    } else if (dy3 > 0.5 && !lastUp) {
      c.lineTo(dx3, h);
      lastUp = false;
    } else if (dy3 <= 0.5 && !lastUp) {
      c.lineTo(dx3, h);
      c.lineTo(dx3, 0);
      lastUp = true;
    } else {
      c.lineTo(dx3, 0);
      c.lineTo(dx3, h);
      lastUp = false;
    }

    // 4
    if (dy4 <= 0.5 && lastUp) {
      c.lineTo(dx4, 0);
      lastUp = true;
    } else if (dy4 > 0.5 && !lastUp) {
      c.lineTo(dx4, h);
      lastUp = false;
    } else if (dy4 <= 0.5 && !lastUp) {
      c.lineTo(dx4, h);
      c.lineTo(dx4, 0);
      lastUp = true;
    } else {
      c.lineTo(dx4, 0);
      c.lineTo(dx4, h);
      lastUp = false;
    }

    // 5
    if (dy5 <= 0.5 && lastUp) {
      c.lineTo(dx5, 0);
      lastUp = true;
    } else if (dy5 > 0.5 && !lastUp) {
      c.lineTo(dx5, h);
      lastUp = false;
    } else if (dy5 <= 0.5 && !lastUp) {
      c.lineTo(dx5, h);
      c.lineTo(dx5, 0);
      lastUp = true;
    } else {
      c.lineTo(dx5, 0);
      c.lineTo(dx5, h);
      lastUp = false;
    }

    // 6
    if (dy6 <= 0.5 && lastUp) {
      c.lineTo(w, 0);
      lastUp = true;
    } else if (dy6 > 0.5 && !lastUp) {
      c.lineTo(w, h);
      lastUp = false;
    } else if (dy6 <= 0.5 && !lastUp) {
      c.lineTo(w, h);
      c.lineTo(w, 0);
      lastUp = true;
    } else {
      c.lineTo(w, 0);
      c.lineTo(w, h);
      lastUp = false;
    }

    // end
    c.stroke();
  }
}

/** mxLeanMap.js's registrations, in order. */
export const LEAN_MAP_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.lean_mapping.boat_shipment', LeanBoatShipment],
  ['mxgraph.lean_mapping.buffer_or_safety_stock', LeanSafetyStock],
  ['mxgraph.lean_mapping.data_box', LeanDataBox],
  ['mxgraph.lean_mapping.outside_sources', LeanCustomerSupplier],
  ['mxgraph.lean_mapping.manufacturing_process', LeanDedicatedProcess],
  ['mxgraph.lean_mapping.manufacturing_process_shared', LeanSharedProcess],
  ['mxgraph.lean_mapping.work_cell', LeanWorkcell],
  ['mxgraph.lean_mapping.inventory_box', LeanInventoryBox],
  ['mxgraph.lean_mapping.push_arrow', LeanPushArrow],
  ['mxgraph.lean_mapping.supermarket', LeanSupermarket],
  ['mxgraph.lean_mapping.physical_pull', LeanMaterialPull],
  ['mxgraph.lean_mapping.fifo_lane', LeanFifoLane],
  ['mxgraph.lean_mapping.truck_shipment', LeanTruckShipment],
  ['mxgraph.lean_mapping.schedule', LeanProductionControl],
  ['mxgraph.lean_mapping.fifo_sequence_flow', LeanFifoSequence],
  ['mxgraph.lean_mapping.production_kanban', LeanProductionKanban],
  ['mxgraph.lean_mapping.withdrawal_kanban', LeanWithdrawalKanban],
  ['mxgraph.lean_mapping.signal_kanban', LeanSignalKanban],
  ['mxgraph.lean_mapping.sequenced_pull_ball', LeanSequencedPullBall],
  ['mxgraph.lean_mapping.rail_shipment', LeanRailShipment],
  ['mxgraph.lean_mapping.warehouse', LeanWarehouse],
  ['mxgraph.lean_mapping.timeline', LeanTimeline],
  ['mxgraph.lean_mapping.crossDock', LeanCrossDock],
  ['mxgraph.lean_mapping.orders', LeanOrders],
  ['mxgraph.lean_mapping.batched_kanban', LeanBatchedKanban],
  ['mxgraph.lean_mapping.control_center', LeanControlCenter],
  ['mxgraph.lean_mapping.electronic_info_flow_edge', LeanElectronicInfoShape],
  ['mxgraph.lean_mapping.manual_info_flow_edge', LeanManualInfoShape],
  ['mxgraph.lean_mapping.timeline2', ShapeLeanTimeline],
];
