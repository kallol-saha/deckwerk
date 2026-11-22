/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Shapes.js — the vertex shapes of the General, Misc and
 * Advanced palettes (cube, note, card, tape, document, process, callout,
 * step, hexagon, arrows, flowchart shapes, …) and their connection points.
 * Modified for DeckWerk: label bounds and margins, handles and sketch
 * styles are left out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point, Style } from '../types.js';
import { MxHexagon, RECTANGLE_CONSTRAINTS, RectangleShape } from './basic.js';
import { Actor, Cylinder, Shape, constraint, getShapeClass, pt, type ConnectionConstraint } from './shape.js';
import { NONE, RECTANGLE_ROUNDING_FACTOR, getFloat, getValue, looseEq, styleValue, toNumber, truthy } from './util.js';

const tan30 = Math.tan(30 * Math.PI / 180);
const tan30Dx = (0.5 - tan30) / 2;

/** `mxUtils.getValue(style, 'fixedSize', '0') != '0'`. */
export function isFixedSize(style: Style): boolean {
  return !looseEq(getValue(style, 'fixedSize', '0'), '0');
}

// --- addCurvedPath (Shapes.js) --------------------------------------------------

interface QuadSegment { p0: Point; p1: Point; c: Point; line: boolean; corner: boolean; t0: number; t1: number }

function getQuadPolar(q: QuadSegment, u: number, v: number): Point {
  const a = (1 - u) * (1 - v);
  const b = u * (1 - v) + v * (1 - u);
  return pt(a * q.p0.x + b * q.c.x + u * v * q.p1.x, a * q.p0.y + b * q.c.y + u * v * q.p1.y);
}

/**
 * Adds a closed path from (x0, y0) through the segments ([x, y] for lines,
 * [cx, cy, x, y] for quadratic curves). If rounded, the corners between
 * segments are cut at arcSize and replaced with curves along the tangents.
 */
export function addCurvedPath(c: SvgCanvas, x0: number, y0: number, segs: number[][], rounded: boolean, arcSize: number): void {
  if (!rounded || !(arcSize > 0)) {
    c.moveTo(x0, y0);
    for (const s of segs) {
      if (s.length === 2) c.lineTo(s[0], s[1]);
      else c.quadTo(s[0], s[1], s[2], s[3]);
    }
    c.close();
    return;
  }

  const last = segs[segs.length - 1];
  if (last[last.length - 2] !== x0 || last[last.length - 1] !== y0) segs = segs.concat([[x0, y0]]);

  // Quadratic curves where lines have the control point in the middle
  const curves: QuadSegment[] = [];
  let p = pt(x0, y0);
  for (const s of segs) {
    const pe = pt(s[s.length - 2], s[s.length - 1]);
    const line = s.length === 2;
    curves.push({
      p0: p, p1: pe, line, corner: false, t0: 0, t1: 0,
      c: line ? pt((p.x + pe.x) / 2, (p.y + pe.y) / 2) : pt(s[0], s[1]),
    });
    p = pe;
  }

  // Finds the corners and the parameters where they are cut off
  for (let i = 0; i < curves.length; i++) {
    const q0 = curves[i];
    const q1 = curves[(i + 1) % curves.length];
    const dx0 = q0.p1.x - q0.c.x;
    const dy0 = q0.p1.y - q0.c.y;
    const dx1 = q1.c.x - q1.p0.x;
    const dy1 = q1.c.y - q1.p0.y;
    const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (Math.abs(dx0 * dy1 - dy0 * dx1) > 1e-6 * d0 * d1) {
      q0.corner = true;
      q0.t1 = Math.min(0.5, arcSize / Math.max(1, 2 * d0));
      q1.t0 = Math.min(0.5, arcSize / Math.max(1, 2 * d1));
    }
  }

  p = getQuadPolar(curves[0], curves[0].t0, curves[0].t0);
  c.moveTo(p.x, p.y);

  for (let i = 0; i < curves.length; i++) {
    const q0 = curves[i];
    const t = 1 - q0.t1;
    const pe = getQuadPolar(q0, t, t);
    if (q0.line) {
      c.lineTo(pe.x, pe.y);
    } else {
      const pc = getQuadPolar(q0, q0.t0, t);
      c.quadTo(pc.x, pc.y, pe.x, pe.y);
    }

    // Replaces the parts that were cut off with a cubic curve
    // along the tangents of the remaining parts, which is the
    // quadratic curve to the corner point for two lines
    if (q0.corner) {
      const q1 = curves[(i + 1) % curves.length];
      const pn = getQuadPolar(q1, q1.t0, q1.t0);
      const c0 = getQuadPolar(q0, t, 1);
      const c1 = getQuadPolar(q1, 0, q1.t0);
      c.curveTo(pe.x + (c0.x - pe.x) * 4 / 3, pe.y + (c0.y - pe.y) * 4 / 3,
        pn.x + (c1.x - pn.x) * 4 / 3, pn.y + (c1.y - pn.y) * 4 / 3, pn.x, pn.y);
    }
  }
  c.close();
}

// --- Cube, iso shapes, cylinders ------------------------------------------------

export class CubeShape extends Cylinder {
  size = 20;
  darkOpacity = 0;
  darkOpacity2 = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    const op = Math.max(-1, Math.min(1, getFloat(this.style, 'darkOpacity', this.darkOpacity)));
    const op2 = Math.max(-1, Math.min(1, getFloat(this.style, 'darkOpacity2', this.darkOpacity2)));
    c.translate(x, y);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w - s, 0);
    c.lineTo(w, s);
    c.lineTo(w, h);
    c.lineTo(s, h);
    c.lineTo(0, h - s);
    c.lineTo(0, 0);
    c.close();
    c.end();
    c.fillAndStroke();

    if (!this.outline) {
      c.setShadow(false);

      if (op !== 0) {
        c.setFillAlpha(Math.abs(op));
        c.setFillColor(op < 0 ? '#FFFFFF' : '#000000');
        c.begin();
        c.moveTo(0, 0);
        c.lineTo(w - s, 0);
        c.lineTo(w, s);
        c.lineTo(s, s);
        c.close();
        c.fill();
      }

      if (op2 !== 0) {
        c.setFillAlpha(Math.abs(op2));
        c.setFillColor(op2 < 0 ? '#FFFFFF' : '#000000');
        c.begin();
        c.moveTo(0, 0);
        c.lineTo(s, s);
        c.lineTo(s, h);
        c.lineTo(0, h - s);
        c.close();
        c.fill();
      }

      c.begin();
      c.moveTo(s, h);
      c.lineTo(s, s);
      c.lineTo(0, 0);
      c.moveTo(s, s);
      c.lineTo(w, s);
      c.end();
      c.stroke();
    }
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    // Relative points with the fixed depth as offset, so edges follow a resize
    return [
      constraint(0, 0, false), constraint(0.5, 0, false, -s * 0.5, 0), constraint(1, 0, false, -s, 0),
      constraint(1, 0, false, -s * 0.5, s * 0.5), constraint(1, 0, false, 0, s), constraint(1, 0.5, false, 0, s * 0.5),
      constraint(1, 1, false), constraint(0.5, 1, false, s * 0.5, 0), constraint(0, 1, false, s, 0),
      constraint(0, 1, false, s * 0.5, -s * 0.5), constraint(0, 1, false, 0, -s), constraint(0, 0.5, false, 0, -s * 0.5),
    ];
  }
}

export class WaypointShape extends Cylinder {
  size = 6;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.setFillColor(this.stroke);
    const s = Math.max(0, getFloat(this.style, 'size', this.size) - 2) + 2 * this.strokewidth;
    c.ellipse(x + (w - s) * 0.5, y + (h - s) * 0.5, s, s);
    c.fill();

    c.setFillColor(NONE);
    c.rect(x, y, w, h);
    c.fill();
  }
}

export class IsoRectangleShape extends Actor {
  size = 20;
  override constraints: readonly ConnectionConstraint[] | null = [];

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const m = Math.min(w, h / tan30);
    c.translate((w - m) / 2, (h - m) / 2 + m / 4);
    c.moveTo(0, 0.25 * m);
    c.lineTo(0.5 * m, m * tan30Dx);
    c.lineTo(m, 0.25 * m);
    c.lineTo(0.5 * m, (0.5 - tan30Dx) * m);
    c.lineTo(0, 0.25 * m);
    c.close();
    c.end();
  }
}

export class IsoCubeShape extends Cylinder {
  size = 20;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number, isForeground: boolean): void {
    const m = Math.min(w, h / (0.5 + tan30));
    if (isForeground) {
      c.moveTo(0, 0.25 * m);
      c.lineTo(0.5 * m, (0.5 - tan30Dx) * m);
      c.lineTo(m, 0.25 * m);
      c.moveTo(0.5 * m, (0.5 - tan30Dx) * m);
      c.lineTo(0.5 * m, (1 - tan30Dx) * m);
      c.end();
    } else {
      c.translate((w - m) / 2, (h - m) / 2);
      c.moveTo(0, 0.25 * m);
      c.lineTo(0.5 * m, m * tan30Dx);
      c.lineTo(m, 0.25 * m);
      c.lineTo(m, 0.75 * m);
      c.lineTo(0.5 * m, (1 - tan30Dx) * m);
      c.lineTo(0, 0.75 * m);
      c.close();
      c.end();
    }
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const m = Math.min(w, h / (0.5 + tan30));
    // The cube is centred and sized from the width, or from the height if it
    // is less than 1.08 times the width: anchored to the middle with offsets
    // from its size, so edges follow a resize that keeps the side it is
    // sized from
    return [
      constraint(0.5, 0.5, false, -0.5 * m, -0.25 * m), constraint(0.5, 0.5, false, 0, (tan30Dx - 0.5) * m),
      constraint(0.5, 0.5, false, 0.5 * m, -0.25 * m), constraint(0.5, 0.5, false, 0.5 * m, 0.25 * m),
      constraint(0.5, 0.5, false, 0, (0.5 - tan30Dx) * m), constraint(0.5, 0.5, false, -0.5 * m, 0.25 * m),
    ];
  }
}

export class DataStoreShape extends Cylinder {
  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number, isForeground: boolean): void {
    const dy = Math.min(h / 2, Math.round(h / 8) + this.strokewidth - 1);

    if ((isForeground && this.fill != null) || (!isForeground && this.fill == null)) {
      c.moveTo(0, dy);
      c.curveTo(0, 2 * dy, w, 2 * dy, w, dy);

      // Needs separate shapes for correct hit-detection
      if (!isForeground) {
        c.stroke();
        c.begin();
      }

      c.translate(0, dy / 2);
      c.moveTo(0, dy);
      c.curveTo(0, 2 * dy, w, 2 * dy, w, dy);

      if (!isForeground) {
        c.stroke();
        c.begin();
      }

      c.translate(0, dy / 2);
      c.moveTo(0, dy);
      c.curveTo(0, 2 * dy, w, 2 * dy, w, dy);

      if (!isForeground) {
        c.stroke();
        c.begin();
      }

      c.translate(0, -dy);
    }

    if (!isForeground) {
      c.moveTo(0, dy);
      c.curveTo(0, -dy / 3, w, -dy / 3, w, dy);
      c.lineTo(w, h - dy);
      c.curveTo(w, h + dy / 3, 0, h + dy / 3, 0, h - dy);
      c.close();
    }
  }
}

export class NoteShape extends Cylinder {
  size = 30;
  darkOpacity = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    const op = Math.max(-1, Math.min(1, getFloat(this.style, 'darkOpacity', this.darkOpacity)));
    c.translate(x, y);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w - s, 0);
    c.lineTo(w, s);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.lineTo(0, 0);
    c.close();
    c.end();
    c.fillAndStroke();

    if (!this.outline) {
      c.setShadow(false);

      if (op !== 0) {
        c.setFillAlpha(Math.abs(op));
        c.setFillColor(op < 0 ? '#FFFFFF' : '#000000');
        c.begin();
        c.moveTo(w - s, 0);
        c.lineTo(w - s, s);
        c.lineTo(w, s);
        c.close();
        c.fill();
      }

      c.begin();
      c.moveTo(w - s, 0);
      c.lineTo(w - s, s);
      c.lineTo(w, s);
      c.end();
      c.stroke();
    }
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    // Relative points with the fixed fold size as offset, so edges follow a
    // resize
    const constr = [
      constraint(0, 0, false), constraint(0.5, 0, false, -s * 0.5, 0), constraint(1, 0, false, -s, 0),
      constraint(1, 0, false, -s * 0.5, s * 0.5), constraint(1, 0, false, 0, s), constraint(1, 0.5, false, 0, s * 0.5),
      constraint(1, 1, false), constraint(0.5, 1, false), constraint(0, 1, false), constraint(0, 0.5, false),
    ];
    if (w >= s * 2) constr.push(constraint(0.5, 0, false));
    return constr;
  }
}

export class NoteShape2 extends NoteShape {}

export class IsoCubeShape2 extends Shape {
  isoAngle = 15;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const isoAngle = Math.max(0.01, Math.min(94, getFloat(this.style, 'isoAngle', this.isoAngle))) * Math.PI / 200;
    const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);

    c.translate(x, y);
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
    // (eg. a taller cube). An iso height that is cut off at half the height
    // puts the corners in the middle, where they stay while it is cut off.
    const fy = isoH === h * 0.5 ? 0.5 : 0;
    const dy = isoH === h * 0.5 ? 0 : isoH;
    return [
      constraint(0.5, 0, false), constraint(1, fy, false, 0, dy), constraint(1, 0.5, false),
      constraint(1, 1 - fy, false, 0, -dy), constraint(0.5, 1, false), constraint(0, 1 - fy, false, 0, -dy),
      constraint(0, 0.5, false), constraint(0, fy, false, 0, dy),
    ];
  }
}

/** (LEGACY) Flexible cylinder Shape (cylinder2). */
export class CylinderShape2 extends Shape {
  size = 15;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const size = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'size', this.size)));
    c.translate(x, y);

    if (size === 0) {
      c.rect(0, 0, w, h);
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(0, size);
      c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, 0);
      c.arcTo(w * 0.5, size, 0, 0, 1, w, size);
      c.lineTo(w, h - size);
      c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, h);
      c.arcTo(w * 0.5, size, 0, 0, 1, 0, h - size);
      c.close();
      c.fillAndStroke();

      c.setShadow(false);

      c.begin();
      c.moveTo(w, size);
      c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, 2 * size);
      c.arcTo(w * 0.5, size, 0, 0, 1, 0, size);
      c.stroke();
    }
  }
}

/** Flexible cylinder3 Shape with offset label. */
export class CylinderShape3 extends Cylinder {
  size = 15;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const size = Math.max(0, Math.min(h * 0.5, getFloat(this.style, 'size', this.size)));
    const lid = truthy(getValue(this.style, 'lid', true));
    c.translate(x, y);

    if (size === 0) {
      c.rect(0, 0, w, h);
      c.fillAndStroke();
    } else {
      c.begin();
      if (lid) {
        c.moveTo(0, size);
        c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, 0);
        c.arcTo(w * 0.5, size, 0, 0, 1, w, size);
      } else {
        c.moveTo(0, 0);
        c.arcTo(w * 0.5, size, 0, 0, 0, w * 0.5, size);
        c.arcTo(w * 0.5, size, 0, 0, 0, w, 0);
      }
      c.lineTo(w, h - size);
      c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, h);
      c.arcTo(w * 0.5, size, 0, 0, 1, 0, h - size);
      c.close();
      c.fillAndStroke();

      c.setShadow(false);

      if (lid) {
        c.begin();
        c.moveTo(w, size);
        c.arcTo(w * 0.5, size, 0, 0, 1, w * 0.5, 2 * size);
        c.arcTo(w * 0.5, size, 0, 0, 1, 0, size);
        c.stroke();
      }
    }
  }

  override getConstraints(_style: Style, _w: number, h: number): ConnectionConstraint[] {
    const s = Math.max(0, Math.min(h, getFloat(this.style, 'size', this.size)));
    return [
      constraint(0.5, 0, false), constraint(0, 0.5, false), constraint(0.5, 1, false), constraint(1, 0.5, false),
      constraint(0, 0, false, 0, s), constraint(1, 0, false, 0, s), constraint(1, 1, false, 0, -s),
      constraint(0, 1, false, 0, -s),
      // Relative points with the fixed size as offset, so edges follow a resize
      constraint(0, 0.25, false, 0, s * 0.5), constraint(1, 0.25, false, 0, s * 0.5),
      constraint(1, 0.75, false, 0, -s * 0.5), constraint(0, 0.75, false, 0, -s * 0.5),
      constraint(0.145, 0, false, 0, s * 0.29), constraint(0.855, 0, false, 0, s * 0.29),
      constraint(0.855, 1, false, 0, -s * 0.29), constraint(0.145, 1, false, 0, -s * 0.29),
    ];
  }
}

export const SWITCH_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, false), constraint(0.5, 0.25, false), constraint(1, 0, false), constraint(0.25, 0.5, false),
  constraint(0.75, 0.5, false), constraint(0, 1, false), constraint(0.5, 0.75, false), constraint(1, 1, false),
];

export class SwitchShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = SWITCH_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const curve = 0.5;
    c.moveTo(0, 0);
    c.quadTo(w / 2, h * curve, w, 0);
    c.quadTo(w * (1 - curve), h / 2, w, h);
    c.quadTo(w / 2, h * (1 - curve), 0, h);
    c.quadTo(w * curve, h / 2, 0, 0);
    c.end();
  }
}

/** Folder Shape, supports tabWidth, tabHeight styles. */
export class FolderShape extends Cylinder {
  tabWidth = 60;
  tabHeight = 20;
  tabPosition = 'right';
  arcSize = 0.1;

  override isRoundable(): boolean { return true; }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    let dx = Math.max(0, Math.min(w, getFloat(this.style, 'tabWidth', this.tabWidth)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'tabHeight', this.tabHeight)));
    const tp = getValue(this.style, 'tabPosition', this.tabPosition);
    const rounded = truthy(getValue(this.style, 'rounded', false));
    const absArcSize = truthy(getValue(this.style, 'absoluteArcSize', false));
    let arcSize = getFloat(this.style, 'arcSize', this.arcSize);

    if (!absArcSize) arcSize = Math.min(w, h) * arcSize;
    arcSize = Math.min(arcSize, w * 0.5, (h - dy) * 0.5);
    dx = Math.max(dx, arcSize);
    dx = Math.min(w - arcSize, dx);
    if (!rounded) arcSize = 0;

    c.begin();
    if (tp === 'left') {
      c.moveTo(Math.max(arcSize, 0), dy);
      c.lineTo(Math.max(arcSize, 0), 0);
      c.lineTo(dx, 0);
      c.lineTo(dx, dy);
    } else {
      // Right is default
      c.moveTo(w - dx, dy);
      c.lineTo(w - dx, 0);
      c.lineTo(w - Math.max(arcSize, 0), 0);
      c.lineTo(w - Math.max(arcSize, 0), dy);
    }

    if (rounded) {
      c.moveTo(0, arcSize + dy);
      c.arcTo(arcSize, arcSize, 0, 0, 1, arcSize, dy);
      c.lineTo(w - arcSize, dy);
      c.arcTo(arcSize, arcSize, 0, 0, 1, w, arcSize + dy);
      c.lineTo(w, h - arcSize);
      c.arcTo(arcSize, arcSize, 0, 0, 1, w - arcSize, h);
      c.lineTo(arcSize, h);
      c.arcTo(arcSize, arcSize, 0, 0, 1, 0, h - arcSize);
    } else {
      c.moveTo(0, dy);
      c.lineTo(w, dy);
      c.lineTo(w, h);
      c.lineTo(0, h);
    }

    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    const sym = getValue(this.style, 'folderSymbol', null);
    if (sym === 'triangle') {
      c.begin();
      c.moveTo(w - 30, dy + 20);
      c.lineTo(w - 20, dy + 10);
      c.lineTo(w - 10, dy + 20);
      c.close();
      c.stroke();
    }
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const dx = Math.max(0, Math.min(w, getFloat(this.style, 'tabWidth', this.tabWidth)));
    const dy = Math.max(0, Math.min(h, getFloat(this.style, 'tabHeight', this.tabHeight)));
    const tp = getValue(this.style, 'tabPosition', this.tabPosition);
    const constr: ConnectionConstraint[] = [];
    if (tp === 'left') {
      constr.push(constraint(0, 0, false), constraint(0, 0, false, dx * 0.5, 0), constraint(0, 0, false, dx, 0),
        constraint(0, 0, false, dx, dy), constraint(0.5, 0, false, dx * 0.5, dy));
    } else {
      // Relative points with the fixed tab size as offsets, so edges follow
      // a resize
      constr.push(constraint(1, 0, false), constraint(1, 0, false, -dx * 0.5, 0), constraint(1, 0, false, -dx, 0),
        constraint(1, 0, false, -dx, dy), constraint(0.5, 0, false, -dx * 0.5, dy));
    }
    constr.push(
      constraint(1, 0, false, 0, dy), constraint(1, 0.25, false, 0, dy * 0.75), constraint(1, 0.5, false, 0, dy * 0.5),
      constraint(1, 0.75, false, 0, dy * 0.25), constraint(1, 1, false), constraint(0, 0, false, 0, dy),
      constraint(0, 0.25, false, 0, dy * 0.75), constraint(0, 0.5, false, 0, dy * 0.5),
      constraint(0, 0.75, false, 0, dy * 0.25), constraint(0, 1, false), constraint(0.25, 1, false),
      constraint(0.5, 1, false), constraint(0.75, 1, false),
    );
    return constr;
  }
}

// --- Card, tape, document, parallelogram, trapezoid, brackets -----------------------

export class CardShape extends Actor {
  size = 30;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(s, 0), pt(w, 0), pt(w, h), pt(0, h), pt(0, s)], this.isRounded, arcSize, true);
    c.end();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const s = Math.max(0, Math.min(w, Math.min(h, getFloat(this.style, 'size', this.size))));
    // Relative points with the fixed corner size as offset, so edges follow a
    // resize
    const constr = [
      constraint(1, 0, false), constraint(0.5, 0, false, s * 0.5, 0), constraint(0, 0, false, s, 0),
      constraint(0, 0, false, s * 0.5, s * 0.5), constraint(0, 0, false, 0, s), constraint(0, 0.5, false, 0, s * 0.5),
      constraint(0, 1, false), constraint(0.5, 1, false), constraint(1, 1, false), constraint(1, 0.5, false),
    ];
    if (w >= s * 2) constr.push(constraint(0.5, 0, false));
    return constr;
  }
}

export const TAPE_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0.35, false), constraint(0, 0.5, false), constraint(0, 0.65, false), constraint(1, 0.35, false),
  constraint(1, 0.5, false), constraint(1, 0.65, false), constraint(0.25, 1, false), constraint(0.75, 0, false),
];

export class TapeShape extends Actor {
  size = 0.4;
  override constraints: readonly ConnectionConstraint[] | null = TAPE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dy = h * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const fy = 1.4;
    const arcSize = this.lineArcSize();
    addCurvedPath(c, 0, dy / 2, [[w / 4, dy * fy, w / 2, dy / 2],
      [w * 3 / 4, dy * (1 - fy), w, dy / 2], [w, h - dy / 2],
      [w * 3 / 4, h - dy * fy, w / 2, h - dy / 2],
      [w / 4, h - dy * (1 - fy), 0, h - dy / 2], [0, dy / 2]],
    this.isRounded, arcSize);
    c.end();
  }
}

export const DOCUMENT_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0, 0.25, true),
  constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true),
  constraint(1, 0.75, true),
];

export class DocumentShape extends Actor {
  size = 0.3;
  override constraints: readonly ConnectionConstraint[] | null = DOCUMENT_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dy = h * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const fy = 1.4;
    const arcSize = this.lineArcSize();
    // Left side ends at the corner if rounded and at dy / 2 as before otherwise
    addCurvedPath(c, 0, 0, [[w, 0], [w, h - dy / 2],
      [w * 3 / 4, h - dy * fy, w / 2, h - dy / 2],
      [w / 4, h - dy * (1 - fy), 0, h - dy / 2],
      [0, this.isRounded ? 0 : dy / 2]],
    this.isRounded, arcSize);
    c.end();
  }
}

export class ParallelogramShape extends Actor {
  size = 0.2;
  fixedSize = 20;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = isFixedSize(this.style)
      ? Math.max(0, Math.min(w, getFloat(this.style, 'size', this.fixedSize)))
      : w * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, h), pt(dx, 0), pt(w, 0), pt(w - dx, h)], this.isRounded, arcSize, true);
    c.end();
  }
}

export class TrapezoidShape extends Actor {
  size = 0.2;
  fixedSize = 20;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dx = isFixedSize(this.style)
      ? Math.max(0, Math.min(w * 0.5, getFloat(this.style, 'size', this.fixedSize)))
      : w * Math.max(0, Math.min(0.5, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, h), pt(dx, 0), pt(w - dx, 0), pt(w, h)], this.isRounded, arcSize, true);
  }
}

export class CurlyBracketShape extends Actor {
  size = 0.5;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.setFillColor(null);
    const s = w * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(w, 0), pt(s, 0), pt(s, h / 2), pt(0, h / 2), pt(s, h / 2), pt(s, h), pt(w, h)],
      this.isRounded, arcSize, false);
    c.end();
  }
}

export class ParallelMarkerShape extends Actor {
  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.setStrokeWidth(1);
    c.setFillColor(this.stroke);
    const w2 = w / 5;
    c.rect(0, 0, w2, h);
    c.fillAndStroke();
    c.rect(2 * w2, 0, w2, h);
    c.fillAndStroke();
    c.rect(4 * w2, 0, w2, h);
    c.fillAndStroke();
  }
}

// --- Process, transparent, plus, ext, internal storage ------------------------------------

export class ProcessShape extends RectangleShape {
  size = 0.1;
  fixedSize = false;

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const fixed = truthy(getValue(this.style, 'fixedSize', this.fixedSize));
    let inset = getFloat(this.style, 'size', this.size);

    if (fixed) inset = Math.max(0, Math.min(w, inset));
    else inset = w * Math.max(0, Math.min(1, inset));

    if (this.isRounded) {
      const f = toNumber(getValue(this.style, 'arcSize', RECTANGLE_ROUNDING_FACTOR * 100)) / 100;
      inset = Math.max(inset, Math.min(w * f, h * f));
    }

    // Crisp rendering of inner lines
    inset = Math.round(inset);

    c.begin();
    c.moveTo(x + inset, y);
    c.lineTo(x + inset, y + h);
    c.moveTo(x + w - inset, y);
    c.lineTo(x + w - inset, y + h);
    c.end();
    c.stroke();
    super.paintForeground(c, x, y, w, h);
  }
}

export class TransparentShape extends RectangleShape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.setFillColor(NONE);
    c.rect(x, y, w, h);
    c.fill();
  }

  override paintForeground(): void { /* nothing */ }
  override isGlassable(): boolean { return false; }
}

export class PlusShape extends RectangleShape {
  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const border = Math.min(w / 5, h / 5) + 1;
    c.begin();
    c.moveTo(x + w / 2, y + border);
    c.lineTo(x + w / 2, y + h - border);
    c.moveTo(x + border, y + h / 2);
    c.lineTo(x + w - border, y + h / 2);
    c.end();
    c.stroke();
    super.paintForeground(c, x, y, w, h);
  }
}

/** CompositeShape (ext): double border and symbols from the style. */
export class ExtendedShape extends RectangleShape {
  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.hasStyle) {
      if (!this.outline && looseEq(styleValue(this.style, 'double'), 1)) {
        const margin = Math.max(2, this.strokewidth + 1) + parseFloat(String(styleValue(this.style, 'margin') || 0));
        const mx = x + margin;
        const my = y + margin;
        const mw = w - 2 * margin;
        const mh = h - 2 * margin;
        if (mw > 0 && mh > 0) super.paintBackground(c, mx, my, mw, mh);
        x = mx;
        y = my;
        w = mw;
        h = mh;
      }

      c.setDashed(false);

      // Draws the symbols defined in the style. The symbols are
      // numbered from 1...n. Possible postfixes are align,
      // verticalAlign, spacing, arcSpacing, width, height
      let counter = 0;
      let ctor = getShapeClass(this.style[`symbol${counter}`]);
      while (ctor != null) {
        const key = `symbol${counter}`;
        const align = this.style[`${key}Align`];
        const valign = this.style[`${key}VerticalAlign`];
        const width = toNumber(styleValue(this.style, `${key}Width`));
        const height = toNumber(styleValue(this.style, `${key}Height`));
        let spacing = toNumber(styleValue(this.style, `${key}Spacing`) || 0);
        let vspacing = toNumber(styleValue(this.style, `${key}VSpacing`) || spacing);
        const arcspacing = styleValue(this.style, `${key}ArcSpacing`);

        if (arcspacing != null) {
          const arcSize = this.getArcSize(w + this.strokewidth, h + this.strokewidth) * toNumber(arcspacing);
          spacing += arcSize;
          vspacing += arcSize;
        }

        let x2 = x;
        let y2 = y;
        if (align === 'center') x2 += (w - width) / 2;
        else if (align === 'right') x2 += w - width - spacing;
        else x2 += spacing;

        if (valign === 'middle') y2 += (h - height) / 2;
        else if (valign === 'bottom') y2 += h - height - vspacing;
        else y2 += vspacing;

        c.save();
        // Small hack to pass style along into subshape
        const tmp = new ctor();
        tmp.style = this.style;
        tmp.hasStyle = true;
        tmp.paintVertexShape(c, x2, y2, width, height);
        c.restore();

        counter++;
        ctor = getShapeClass(this.style[`symbol${counter}`]);
      }
    }

    // Paints glass effect
    super.paintForeground(c, x, y, w, h);
  }
}

export class InternalStorageShape extends RectangleShape {
  dx = 20;
  dy = 20;

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintForeground(c, x, y, w, h);
    let inset = 0;
    if (this.isRounded) {
      const f = toNumber(getValue(this.style, 'arcSize', RECTANGLE_ROUNDING_FACTOR * 100)) / 100;
      inset = Math.max(inset, Math.min(w * f, h * f));
    }
    const dx = Math.max(inset, Math.min(w, getFloat(this.style, 'dx', this.dx)));
    const dy = Math.max(inset, Math.min(h, getFloat(this.style, 'dy', this.dy)));

    c.begin();
    c.moveTo(x, y + dy);
    c.lineTo(x + w, y + dy);
    c.end();
    c.stroke();

    c.begin();
    c.moveTo(x + dx, y);
    c.lineTo(x + dx, y + h);
    c.end();
    c.stroke();
  }
}

// --- Callouts, step, hexagon --------------------------------------------------------------

export class CalloutShape extends MxHexagon {
  size = 30;
  position = 0.5;
  position2 = 0.5;
  base = 20;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.lineArcSize();
    const s = Math.max(0, Math.min(h, getFloat(this.style, 'size', this.size)));
    const dx = w * Math.max(0, Math.min(1, getFloat(this.style, 'position', this.position)));
    const dx2 = w * Math.max(0, Math.min(1, getFloat(this.style, 'position2', this.position2)));
    const base = Math.max(0, Math.min(w, getFloat(this.style, 'base', this.base)));
    this.addPoints(c, [pt(0, 0), pt(w, 0), pt(w, h - s), pt(Math.min(w, dx + base), h - s), pt(dx2, h),
      pt(Math.max(0, dx), h - s), pt(0, h - s)], this.isRounded, arcSize, true, [4]);
  }

  override getConstraints(_style: Style, _w: number, h: number): ConnectionConstraint[] {
    const s = Math.max(0, Math.min(h, getFloat(this.style, 'size', this.size)));
    let p2 = Math.max(0, Math.min(1, getFloat(this.style, 'position2', this.position2)));
    p2 = Number.isNaN(p2) ? this.position2 : p2;
    // Relative points with the fixed pointer size as offset, so edges follow
    // a resize
    return [
      constraint(0, 0, false), constraint(0.25, 0, false), constraint(0.5, 0, false), constraint(0.75, 0, false),
      constraint(1, 0, false), constraint(1, 0.5, false, 0, -s * 0.5), constraint(1, 1, false, 0, -s),
      constraint(p2, 1, false), constraint(0, 1, false, 0, -s), constraint(0, 0.5, false, 0, -s * 0.5),
    ];
  }
}

export interface WedgeTail { points: [Point, Point, Point]; index: number }

/** Wedge callout shape with a freely movable tip. */
export class WedgeCalloutShape extends Actor {
  tipX = -0.25;
  tipY = 1;
  base = 20;
  // Limits the tip offset relative to width and height to keep
  // bounding boxes finite for untrusted styles
  maxTipOffset = 100;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  /** The clamped tip offset relative to width and height as seen from the center of the bubble. */
  getTipOffset(): Point {
    const max = this.maxTipOffset;
    const tx = getFloat(this.style, 'tipX', this.tipX);
    const ty = getFloat(this.style, 'tipY', this.tipY);
    return pt(Math.max(-max, Math.min(max, Number.isFinite(tx) ? tx : this.tipX)),
      Math.max(-max, Math.min(max, Number.isFinite(ty) ? ty : this.tipY)));
  }

  /**
   * The tail as {points: [base1, tip, base2], index: insertion index in the
   * clockwise bubble path} in local coordinates, or null if the tip is
   * inside of the bubble.
   */
  getTailPoints(w: number, h: number): WedgeTail | null {
    const tip = this.getTipOffset();
    const dx = tip.x * w;
    const dy = tip.y * h;
    if (Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2) return null;

    const arcSize = this.lineArcSize();
    let base = getFloat(this.style, 'base', this.base);
    base = Number.isFinite(base) ? Math.max(0, base) : this.base;
    let inset = this.isRounded ? arcSize : 0;
    const tp = pt(w / 2 + dx, h / 2 + dy);

    if (Math.abs(dx) * h >= Math.abs(dy) * w && dx !== 0) {
      // Tail exits through the left or right side
      inset = Math.min(inset, h / 2);
      const hb = Math.max(0, Math.min(base, h - 2 * inset)) / 2;
      let ey = h / 2 + dy * (w / 2) / Math.abs(dx);
      ey = Math.max(inset + hb, Math.min(h - inset - hb, ey));
      return dx > 0
        ? { points: [pt(w, ey - hb), tp, pt(w, ey + hb)], index: 2 }
        : { points: [pt(0, ey + hb), tp, pt(0, ey - hb)], index: 4 };
    }
    // Tail exits through the top or bottom side
    inset = Math.min(inset, w / 2);
    const hb = Math.max(0, Math.min(base, w - 2 * inset)) / 2;
    let ex = w / 2 + dx * (h / 2) / Math.abs(dy);
    ex = Math.max(inset + hb, Math.min(w - inset - hb, ex));
    return dy > 0
      ? { points: [pt(ex + hb, h), tp, pt(ex - hb, h)], index: 3 }
      : { points: [pt(ex - hb, 0), tp, pt(ex + hb, 0)], index: 1 };
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.lineArcSize();
    const pts = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)];
    const tail = this.getTailPoints(w, h);
    let exclude: number[] | null = null;
    if (tail != null) {
      pts.splice(tail.index, 0, ...tail.points);
      exclude = [tail.index, tail.index + 1, tail.index + 2];
    }
    this.addPoints(c, pts, this.isRounded, arcSize, true, exclude);
  }
}

export const STEP_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0.25, 1, true),
  constraint(0.5, 1, true), constraint(0.75, 1, true), constraint(0, 0.25, true), constraint(0, 0.5, true),
  constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true), constraint(1, 0.75, true),
];

export class StepShape extends Actor {
  size = 0.2;
  fixedSize = 20;
  override constraints: readonly ConnectionConstraint[] | null = STEP_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = isFixedSize(this.style)
      ? Math.max(0, Math.min(w, getFloat(this.style, 'size', this.fixedSize)))
      : w * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, 0), pt(w - s, 0), pt(w, h / 2), pt(w - s, h), pt(0, h), pt(s, h / 2)],
      this.isRounded, arcSize, true);
    c.end();
  }
}

export class HexagonShape extends MxHexagon {
  size = 0.25;
  fixedSize = 20;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const s = isFixedSize(this.style)
      ? Math.max(0, Math.min(w * 0.5, getFloat(this.style, 'size', this.fixedSize)))
      : w * Math.max(0, Math.min(1, getFloat(this.style, 'size', this.size)));
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(s, 0), pt(w - s, 0), pt(w, 0.5 * h), pt(w - s, h), pt(s, h), pt(0, 0.5 * h)],
      this.isRounded, arcSize, true);
  }
}
