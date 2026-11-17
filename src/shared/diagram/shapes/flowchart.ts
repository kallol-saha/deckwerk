/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Shapes.js — the flowchart, arrow, ellipse and rhombus
 * variants of the General, Misc and Advanced palettes (manualInput,
 * corner, tee, arrows, dataStorage, or/xor, loopLimit, offPageConnector,
 * delay, cross, display, tapeData, orEllipse, sumEllipse, lineEllipse,
 * sortShape, collate, dimension, partialRectangle, zigzag, message) and
 * their connection points.
 * Modified for DeckWerk: label bounds and margins, handles and sketch
 * styles are left out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Style } from '../types.js';
import { Ellipse, RECTANGLE_CONSTRAINTS, RectangleShape, Rhombus } from './basic.js';
import { addCurvedPath, isFixedSize } from './drawio.js';
import { Actor, Cylinder, constraint, pt, type ConnectionConstraint } from './shape.js';
import { NONE, getFloat, getString, getValue, looseEq } from './util.js';

// --- Flowchart and arrow shapes -------------------------------------------------------------

export class ManualInputShape extends Actor {
  size = 30;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = Math.min(h, getFloat(this.style, 'size', this.size));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, h), pt(0, s), pt(w, 0), pt(w, h)], this.isRounded, arcSize, true);
    c.end();
  }
}

export class CornerShape extends Actor {
  dx = 20;
  dy = 20;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, 0), pt(w, 0), pt(w, dy), pt(dx, dy), pt(dx, h), pt(0, h)], this.isRounded, arcSize, true);
    c.end();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    return [
      constraint(0, 0, false), constraint(0.5, 0, false),
      // Relative points with the fixed bar sizes as offsets, so edges follow a
      // resize
      constraint(1, 0, false), constraint(1, 0, false, 0, dy * 0.5), constraint(1, 0, false, 0, dy),
      constraint(0.5, 0, false, dx * 0.5, dy), constraint(0, 0, false, dx, dy), constraint(0, 0.5, false, dx, dy * 0.5),
      constraint(0, 1, false, dx, 0), constraint(0, 1, false, dx * 0.5, 0), constraint(0, 0.5, false),
      constraint(0, 1, false),
    ];
  }
}

export const CROSSBAR_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, false), constraint(0, 0.5, false), constraint(0, 1, false), constraint(0.25, 0.5, false),
  constraint(0.5, 0.5, false), constraint(0.75, 0.5, false), constraint(1, 0, false), constraint(1, 0.5, false),
  constraint(1, 1, false),
];

export class CrossbarShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = CROSSBAR_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.moveTo(0, 0);
    c.lineTo(0, h);
    c.end();
    c.moveTo(w, 0);
    c.lineTo(w, h);
    c.end();
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.end();
  }
}

export class TeeShape extends Actor {
  dx = 20;
  dy = 20;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, 0), pt(w, 0), pt(w, dy), pt((w + dx) / 2, dy), pt((w + dx) / 2, h),
      pt((w - dx) / 2, h), pt((w - dx) / 2, dy), pt(0, dy)], this.isRounded, arcSize, true);
    c.end();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'dy', this.dy)));
    // Relative points with the fixed bar sizes as offsets, so edges follow a
    // resize
    return [
      constraint(0, 0, false), constraint(0.5, 0, false), constraint(1, 0, false), constraint(1, 0, false, 0, dy * 0.5),
      constraint(1, 0, false, 0, dy), constraint(0.75, 0, false, dx * 0.25, dy), constraint(0.5, 0, false, dx * 0.5, dy),
      constraint(0.5, 0.5, false, dx * 0.5, dy * 0.5), constraint(0.5, 1, false, dx * 0.5, 0), constraint(0.5, 1, false),
      constraint(0.5, 1, false, -dx * 0.5, 0), constraint(0.5, 0.5, false, -dx * 0.5, dy * 0.5),
      constraint(0.5, 0, false, -dx * 0.5, dy), constraint(0.25, 0, false, -dx * 0.25, dy), constraint(0, 0, false, 0, dy),
      constraint(0, 0, false, 0, dy * 0.5),
    ];
  }
}

const SINGLE_ARROW_WIDTH = 0.3;
const SINGLE_ARROW_SIZE = 0.2;

export class SingleArrowShape extends Actor {
  arrowWidth = SINGLE_ARROW_WIDTH;
  arrowSize = SINGLE_ARROW_SIZE;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const aw = h * Math.max(0, Math.min(1, getFloat(this.style, 'arrowWidth', this.arrowWidth)));
    const as = w * Math.max(0, Math.min(1, getFloat(this.style, 'arrowSize', this.arrowSize)));
    const at = (h - aw) / 2;
    const ab = at + aw;
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, at), pt(w - as, at), pt(w - as, 0), pt(w, h / 2), pt(w - as, h), pt(w - as, ab), pt(0, ab)],
      this.isRounded, arcSize, true);
    c.end();
  }

  override getConstraints(): ConnectionConstraint[] {
    // Arrow width and size are fractions of the size: relative points, so
    // edges follow a resize
    let fw = Math.max(0, Math.min(1, getFloat(this.style, 'arrowWidth', this.arrowWidth)));
    let fs = Math.max(0, Math.min(1, getFloat(this.style, 'arrowSize', this.arrowSize)));
    fw = Number.isNaN(fw) ? this.arrowWidth : fw;
    fs = Number.isNaN(fs) ? this.arrowSize : fs;
    const at = (1 - fw) / 2;
    return [
      constraint(0, 0.5, false), constraint(0, at, false), constraint((1 - fs) * 0.5, at, false), constraint(1 - fs, 0, false),
      constraint(1, 0.5, false), constraint(1 - fs, 1, false), constraint((1 - fs) * 0.5, 1 - at, false),
      constraint(0, 1 - at, false),
    ];
  }
}

export class DoubleArrowShape extends Actor {
  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const aw = h * Math.max(0, Math.min(1, getFloat(this.style, 'arrowWidth', SINGLE_ARROW_WIDTH)));
    const as = w * Math.max(0, Math.min(1, getFloat(this.style, 'arrowSize', SINGLE_ARROW_SIZE)));
    const at = (h - aw) / 2;
    const ab = at + aw;
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, h / 2), pt(as, 0), pt(as, at), pt(w - as, at), pt(w - as, 0), pt(w, h / 2),
      pt(w - as, h), pt(w - as, ab), pt(as, ab), pt(as, h)], this.isRounded, arcSize, true);
    c.end();
  }

  override getConstraints(): ConnectionConstraint[] {
    // Arrow width and size are fractions of the size: relative points, so
    // edges follow a resize
    let fw = Math.max(0, Math.min(1, getFloat(this.style, 'arrowWidth', SINGLE_ARROW_WIDTH)));
    let fs = Math.max(0, Math.min(1, getFloat(this.style, 'arrowSize', SINGLE_ARROW_SIZE)));
    fw = Number.isNaN(fw) ? SINGLE_ARROW_WIDTH : fw;
    fs = Number.isNaN(fs) ? SINGLE_ARROW_SIZE : fs;
    const at = (1 - fw) / 2;
    return [
      constraint(0, 0.5, false), constraint(fs, 0, false), constraint(0.5, at, false), constraint(1 - fs, 0, false),
      constraint(1, 0.5, false), constraint(1 - fs, 1, false), constraint(0.5, 1 - at, false), constraint(fs, 1, false),
    ];
  }
}

export class DataStorageShape extends Actor {
  size = 0.1;
  fixedSize = 20;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = isFixedSize(this.style)
      ? Math.max(0, Math.min(w, getFloat(this.style, 'size', this.fixedSize)))
      : w * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    addCurvedPath(c, s, 0, [[w, 0], [w - s * 2, h / 2, w, h], [s, h], [s - s * 2, h / 2, s, 0]], this.isRounded, arcSize);
    c.end();
  }
}

export const OR_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0.25, false), constraint(0, 0.5, false), constraint(0, 0.75, false), constraint(1, 0.5, false),
  constraint(0.7, 0.1, false), constraint(0.7, 0.9, false),
];

export class OrShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = OR_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    addCurvedPath(c, 0, 0, [[w, 0, w, h / 2], [w, h, 0, h]], this.isRounded, this.lineArcSize());
    c.end();
  }
}

export const XOR_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.175, 0.25, false), constraint(0.25, 0.5, false), constraint(0.175, 0.75, false),
  constraint(1, 0.5, false), constraint(0.7, 0.1, false), constraint(0.7, 0.9, false),
];

export class XorShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = XOR_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    addCurvedPath(c, 0, 0, [[w, 0, w, h / 2], [w, h, 0, h], [w / 2, h / 2, 0, 0]], this.isRounded, this.lineArcSize());
    c.end();
  }
}

export class LoopLimitShape extends Actor {
  size = 20;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = Math.min(w / 2, Math.min(h, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(s, 0), pt(w - s, 0), pt(w, s * 0.8), pt(w, h), pt(0, h), pt(0, s * 0.8)],
      this.isRounded, arcSize, true);
    c.end();
  }
}

export class OffPageConnectorShape extends Actor {
  size = 3 / 8;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = h * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, 0), pt(w, 0), pt(w, h - s), pt(w / 2, h), pt(0, h - s)], this.isRounded, arcSize, true);
    c.end();
  }
}

export class DelayShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = Math.min(w, h / 2);
    c.moveTo(0, 0);
    c.lineTo(w - dx, 0);
    c.quadTo(w, 0, w, h / 2);
    c.quadTo(w, h, w - dx, h);
    c.lineTo(0, h);
    c.close();
    c.end();
  }
}

export class CrossShape extends Actor {
  size = 0.2;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const m = Math.min(h, w);
    const size = Math.max(0, Math.min(m, m * getFloat(this.style, 'size', this.size)));
    const t = (h - size) / 2;
    const b = t + size;
    const l = (w - size) / 2;
    const r = l + size;
    c.moveTo(0, t);
    c.lineTo(l, t);
    c.lineTo(l, 0);
    c.lineTo(r, 0);
    c.lineTo(r, t);
    c.lineTo(w, t);
    c.lineTo(w, b);
    c.lineTo(r, b);
    c.lineTo(r, h);
    c.lineTo(l, h);
    c.lineTo(l, b);
    c.lineTo(0, b);
    c.close();
    c.end();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const m = Math.min(h, w);
    const size = Math.max(0, Math.min(m, m * getFloat(this.style, 'size', this.size)));
    // The arms are centred and as thick as a fraction of the smaller side:
    // anchored to the middle lines with offsets from the thickness, so edges
    // follow a resize that keeps the smaller side (eg. longer arms)
    const s = size * 0.5;
    return [
      constraint(0.5, 0.25, false, -s, -s * 0.5), constraint(0.5, 0, false, -s, 0), constraint(0.5, 0, false),
      constraint(0.5, 0, false, s, 0), constraint(0.5, 0.25, false, s, -s * 0.5), constraint(0.5, 0.5, false, s, -s),
      constraint(0.5, 0.75, false, -s, s * 0.5), constraint(0.5, 1, false, -s, 0), constraint(0.5, 1, false),
      constraint(0.5, 1, false, s, 0), constraint(0.5, 0.75, false, s, s * 0.5), constraint(0.5, 0.5, false, s, s),
      constraint(0.75, 0.5, false, s * 0.5, -s), constraint(1, 0.5, false, 0, -s), constraint(1, 0.5, false),
      constraint(1, 0.5, false, 0, s), constraint(0.75, 0.5, false, s * 0.5, s), constraint(0.5, 0.5, false, -s, s),
      constraint(0.25, 0.5, false, -s * 0.5, -s), constraint(0, 0.5, false, 0, -s), constraint(0, 0.5, false),
      constraint(0, 0.5, false, 0, s), constraint(0.25, 0.5, false, -s * 0.5, s), constraint(0.5, 0.5, false, -s, -s),
    ];
  }
}

export class DisplayShape extends Actor {
  size = 0.25;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = Math.min(w, h / 2);
    const s = Math.min(w - dx, Math.max(0, getFloat(this.style, 'size', this.size)) * w);
    c.moveTo(0, h / 2);
    c.lineTo(s, 0);
    c.lineTo(w - dx, 0);
    c.quadTo(w, 0, w, h / 2);
    c.quadTo(w, h, w - dx, h);
    c.lineTo(s, h);
    c.close();
    c.end();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const dx = Math.min(w, h / 2);
    const size = getFloat(this.style, 'size', this.size);
    const s = Math.min(w - dx, Math.max(0, Number.isNaN(size) ? this.size : size) * w);
    // The left end is a fraction of the width, the curved right end follows
    // the height: anchored to the right side, so edges follow a resize that
    // keeps the height (eg. a longer label). Ends that are cut off stay
    // where they are cut off while they are: a curve as wide as the shape
    // starts at the left side and a left end at the start of the curve.
    const cx = dx < w ? 1 : 0;
    const cdx = dx < w ? -dx : 0;
    const sx = s < w - dx ? s / w : cx;
    const ox = s < w - dx ? 0 : cdx;
    return [
      constraint(0, 0.5, false), constraint(sx, 0, false, ox, 0), constraint((sx + cx) * 0.5, 0, false, (ox + cdx) * 0.5, 0),
      constraint(cx, 0, false, cdx, 0), constraint(1, 0.5, false), constraint(cx, 1, false, cdx, 0),
      constraint((sx + cx) * 0.5, 1, false, (ox + cdx) * 0.5, 0), constraint(sx, 1, false, ox, 0),
    ];
  }
}

// --- Ellipse and rhombus variants -------------------------------------------------------------

export class TapeDataShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    c.begin();
    c.moveTo(x + w / 2, y + h);
    c.lineTo(x + w, y + h);
    c.end();
    c.stroke();
  }
}

export class OrEllipseShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    c.setShadow(false);
    c.begin();
    c.moveTo(x, y + h / 2);
    c.lineTo(x + w, y + h / 2);
    c.end();
    c.stroke();

    c.begin();
    c.moveTo(x + w / 2, y);
    c.lineTo(x + w / 2, y + h);
    c.end();
    c.stroke();
  }
}

export class SumEllipseShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    const s2 = 0.145;
    c.setShadow(false);
    c.begin();
    c.moveTo(x + w * s2, y + h * s2);
    c.lineTo(x + w * (1 - s2), y + h * (1 - s2));
    c.end();
    c.stroke();

    c.begin();
    c.moveTo(x + w * (1 - s2), y + h * s2);
    c.lineTo(x + w * s2, y + h * (1 - s2));
    c.end();
    c.stroke();
  }
}

export class LineEllipseShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    c.setShadow(false);
    c.begin();
    if (getValue(this.style, 'line', null) === 'vertical') {
      c.moveTo(x + w / 2, y);
      c.lineTo(x + w / 2, y + h);
    } else {
      c.moveTo(x, y + h / 2);
      c.lineTo(x + w, y + h / 2);
    }
    c.end();
    c.stroke();
  }
}

export class SortShape extends Rhombus {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    c.setShadow(false);
    c.begin();
    c.moveTo(x, y + h / 2);
    c.lineTo(x + w, y + h / 2);
    c.end();
    c.stroke();
  }
}

export class CollateShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w / 2, y + h / 2);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(x, y + h);
    c.lineTo(x + w, y + h);
    c.lineTo(x + w / 2, y + h / 2);
    c.close();
    c.fillAndStroke();
  }

  override isGlassable(): boolean { return false; }
}

export class DimensionShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const sw = c.state.strokeWidth / 2;
    // Arrow size
    const al = 10 + 2 * sw;
    const cy = y + h - al / 2;

    c.begin();
    c.moveTo(x, y);
    c.lineTo(x, y + h);
    c.moveTo(x + sw, cy);
    c.lineTo(x + sw + al, cy - al / 2);
    c.moveTo(x + sw, cy);
    c.lineTo(x + sw + al, cy + al / 2);
    c.moveTo(x + sw, cy);
    c.lineTo(x + w - sw, cy);

    // Opposite side
    c.moveTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.moveTo(x + w - sw, cy);
    c.lineTo(x + w - al - sw, cy - al / 2);
    c.moveTo(x + w - sw, cy);
    c.lineTo(x + w - al - sw, cy + al / 2);
    c.end();
    c.stroke();
  }

  override isGlassable(): boolean { return false; }
}

export class PartialRectangleShape extends Ellipse {
  drawHidden = true;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isGlassable(): boolean { return false; }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (!this.outline) c.setStrokeColor(null);

    if (this.hasStyle) {
      const pointerEvents = c.pointerEvents;
      const filled = this.fill != null && this.fill !== NONE;
      const events = looseEq(getValue(this.style, 'pointerEvents', '1'), '1');
      if (!events && !filled) c.pointerEvents = false;

      const top = looseEq(getValue(this.style, 'top', '1'), '1');
      const left = looseEq(getValue(this.style, 'left', '1'), '1');
      const right = looseEq(getValue(this.style, 'right', '1'), '1');
      const bottom = looseEq(getValue(this.style, 'bottom', '1'), '1');

      if (this.drawHidden || filled || this.outline || top || right || bottom || left) {
        c.rect(x, y, w, h);
        c.fill();

        c.pointerEvents = pointerEvents;
        c.setStrokeColor(this.stroke);
        c.setLineCap('square');
        c.begin();
        c.moveTo(x, y);

        if (this.outline || top) c.lineTo(x + w, y);
        else c.moveTo(x + w, y);

        if (this.outline || right) c.lineTo(x + w, y + h);
        else c.moveTo(x + w, y + h);

        if (this.outline || bottom) c.lineTo(x, y + h);
        else c.moveTo(x, y + h);

        if (this.outline || left) c.lineTo(x, y);

        c.end();
        c.stroke();
        c.setLineCap('flat');
      } else {
        c.setStrokeColor(this.stroke);
      }
    }
  }
}

// --- Zigzag -------------------------------------------------------------------------------------

/**
 * Zigzag/Wave vertex shape: size = half-wavelength in absolute graph units
 * (controls tooth spacing). Height of shape sets amplitude. Rounded toggle
 * switches zigzag/wave. Width adds/removes teeth without changing tooth size.
 */
export class ZigzagShape extends RectangleShape {
  size = 10;
  // Maximum number of full segments
  maxSegments = 10000;

  override isRoundable(): boolean { return true; }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // Background fill
    const fillClr = getString(this.style, 'fillColor', null);
    if (fillClr != null && fillClr !== NONE) {
      c.setStrokeColor('none');
      c.begin();
      c.rect(0, 0, w, h);
      c.fillAndStroke();
      c.setStrokeColor(this.stroke);
    }

    const size = Math.max(5, getFloat(this.style, 'size', this.size));
    const centerY = h / 2;

    // Inset peaks so stroke stays within bounds
    // Zigzag needs more margin due to miter joins at sharp peaks
    const sw = this.strokewidth;
    const inset = this.isRounded ? sw / 2 : sw;
    const topY = inset;
    const bottomY = h - inset;

    // Number of full peak-to-peak segments, adjusted to fit width and limited for huge widths
    const numFull = Math.min(Math.max(1, Math.round(w / size) - 1), this.maxSegments);
    const halfWave = w / (numFull + 1);
    // End segments are half-width so angle matches middle segments
    const halfEnd = halfWave / 2;

    c.begin();
    c.moveTo(0, centerY);

    if (this.isRounded) {
      const k = 0.4;
      // Start half-segment: (0, centerY) to (halfEnd, topY)
      c.curveTo(k * halfEnd, centerY - (centerY - topY) * k, (1 - k) * halfEnd, topY, halfEnd, topY);

      // Full peak-to-peak segments
      for (let j = 0; j < numFull; j++) {
        const sx = halfEnd + j * halfWave;
        const ex = sx + halfWave;
        const sy = j % 2 === 0 ? topY : bottomY;
        const ey = j % 2 === 0 ? bottomY : topY;
        c.curveTo(sx + k * halfWave, sy, ex - k * halfWave, ey, ex, ey);
      }

      // End half-segment: last peak to (w, centerY)
      const lastX = halfEnd + numFull * halfWave;
      const lastY = numFull % 2 === 0 ? topY : bottomY;
      const dirSign = lastY === topY ? 1 : -1;
      c.curveTo(lastX + k * halfEnd, lastY, w - k * halfEnd, centerY - dirSign * (centerY - topY) * k, w, centerY);
    } else {
      // Start half-segment
      c.lineTo(halfEnd, topY);
      // Full peak-to-peak segments
      for (let j = 0; j < numFull; j++) {
        const ex = halfEnd + (j + 1) * halfWave;
        const ey = j % 2 === 0 ? bottomY : topY;
        c.lineTo(ex, ey);
      }
      // End half-segment
      c.lineTo(w, centerY);
    }

    c.stroke();

    if (this.glass && !this.outline && this.fill != null && this.fill !== NONE) {
      c.setShadow(false);
      this.paintGlassEffect(c, 0, 0, w, h, 0);
    }
  }
}

/** Message (envelope) shape. */
export class MessageShape extends Cylinder {
  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number, isForeground: boolean): void {
    if (isForeground) {
      c.moveTo(0, 0);
      c.lineTo(w / 2, h / 2);
      c.lineTo(w, 0);
      c.end();
    } else {
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
    }
  }
}
