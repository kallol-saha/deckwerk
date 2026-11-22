/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/shape/mxRectangleShape.js, mxEllipse.js, mxRhombus.js,
 * mxTriangle.js, mxHexagon.js, mxCloud.js, mxLine.js, mxDoubleEllipse.js,
 * mxSwimlane.js, mxImageShape.js, mxLabel.js, the clip paths of
 * mxgraph/src/util/mxSvgCanvas2D.js (processClipPath and friends), and the
 * overrides and connection points of these shapes in js/grapheditor/Shapes.js
 * (glass for ellipses and rhombi, double rhombus, constraints).
 * Modified for DeckWerk: no HTML rendering, label bounds or table lines;
 * images and clip paths are written into the SVG string canvas.
 */

import { fmt, type SvgCanvas } from '../canvas.js';
import type { Rect } from '../types.js';
import {
  Actor, Shape, constraint, getShapeClass, pt, type ConnectionConstraint, type GlassCanvas,
} from './shape.js';
import {
  DEFAULT_IMAGESIZE, DEFAULT_STARTSIZE, NONE, RECTANGLE_ROUNDING_FACTOR, LINE_ARCSIZE, escapeAttr,
  getNumber, getString, getValue, isOne, looseEq, toNumber, truthy,
} from './util.js';

// --- connection points (Shapes.js) ----------------------------------------------

export const RECTANGLE_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, true), constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true),
  constraint(1, 0, true), constraint(0, 0.25, true), constraint(0, 0.5, true), constraint(0, 0.75, true),
  constraint(1, 0.25, true), constraint(1, 0.5, true), constraint(1, 0.75, true), constraint(0, 1, true),
  constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true), constraint(1, 1, true),
];

export const ELLIPSE_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, true), constraint(1, 0, true), constraint(0, 1, true), constraint(1, 1, true),
  constraint(0.5, 0, true), constraint(0.5, 1, true), constraint(0, 0.5, true), constraint(1, 0.5),
];

export const TRIANGLE_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0.25, true), constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(0.5, 0, true),
  constraint(0.5, 1, true), constraint(1, 0.5, true),
];

export const HEXAGON_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.375, 0, true), constraint(0.5, 0, true), constraint(0.625, 0, true), constraint(0, 0.25, true),
  constraint(0, 0.5, true), constraint(0, 0.75, true), constraint(1, 0.25, true), constraint(1, 0.5, true),
  constraint(1, 0.75, true), constraint(0.375, 1, true), constraint(0.5, 1, true), constraint(0.625, 1, true),
];

export const CLOUD_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0.25, false), constraint(0.4, 0.1, false), constraint(0.16, 0.55, false),
  constraint(0.07, 0.4, false), constraint(0.31, 0.8, false), constraint(0.13, 0.77, false),
  constraint(0.8, 0.8, false), constraint(0.55, 0.95, false), constraint(0.875, 0.5, false),
  constraint(0.96, 0.7, false), constraint(0.625, 0.2, false), constraint(0.88, 0.25, false),
];

export const LINE_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0.5, false), constraint(0.25, 0.5, false), constraint(0.75, 0.5, false), constraint(1, 0.5, false),
];

// --- mxRectangleShape -------------------------------------------------------------

export class RectangleShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }
  override isGlassable(): boolean { return true; }

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.isRounded) {
      let r = 0;
      if (looseEq(getValue(this.style, 'absoluteArcSize', 0), '1')) {
        r = Math.min(w / 2, Math.min(h / 2, toNumber(getValue(this.style, 'arcSize', LINE_ARCSIZE)) / 2));
      } else {
        const f = toNumber(getValue(this.style, 'arcSize', RECTANGLE_ROUNDING_FACTOR * 100)) / 100;
        r = Math.min(w * f, h * f);
      }
      c.roundrect(x, y, w, h, r, r);
    } else {
      c.rect(x, y, w, h);
    }
    c.fillAndStroke();
  }

  getFooterSize(): number {
    return Math.max(0, toNumber(getValue(this.style, 'footerSize', 0)));
  }

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const footer = Math.min(h, this.getFooterSize());
    if (footer > 0 && !this.outline) this.paintFooter(c, x, y, w, h, footer);
    if (this.glass && !this.outline && this.fill != null && this.fill !== NONE) {
      this.paintGlassEffect(c, x, y, w, h, this.getArcSize(w + this.strokewidth, h + this.strokewidth));
    }
  }

  paintFooter(c: SvgCanvas, x: number, y: number, w: number, h: number, footer: number): void {
    const color = getString(this.style, 'footerColor', this.stroke);
    const r = this.isRounded ? this.getArcSize(w, h) : 0;
    const rr = Math.min(w / 2, r);
    if (color != null && color !== NONE) {
      c.setFillColor(color);
      c.setStrokeColor(color);
    }
    c.setShadow(false);
    c.begin();
    if (footer >= r) {
      // Footer clears the corners: straight sides plus the full rounding
      c.moveTo(x, y + h - footer);
      c.lineTo(x, y + h - r);
      c.quadTo(x, y + h, x + rr, y + h);
      c.lineTo(x + w - rr, y + h);
      c.quadTo(x + w, y + h, x + w, y + h - r);
      c.lineTo(x + w, y + h - footer);
    } else {
      // Footer falls inside the corners: trace the border (radius r)
      // from where its quadratic crosses y = h - footer (split at t)
      const t = 1 - Math.sqrt(footer / r);
      const px = rr * t * t;
      const bx = rr * t;
      c.moveTo(x + px, y + h - footer);
      c.quadTo(x + bx, y + h, x + rr, y + h);
      c.lineTo(x + w - rr, y + h);
      c.quadTo(x + w - bx, y + h, x + w - px, y + h - footer);
    }
    c.close();
    if (color != null && color !== NONE) c.fillAndStroke();
    else c.stroke();
  }
}

// --- mxEllipse --------------------------------------------------------------------

export class Ellipse extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override isGlassable(): boolean { return true; }

  /** mxEllipse.paintVertexShape with the glass of Shapes.js. */
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.ellipse(x, y, w, h);
    c.fillAndStroke();
    this.paintCenter(c, x, y, w, h);
    if (this.glass && !this.outline && this.fill != null && this.fill !== NONE) {
      this.paintGlassEffect(c, x, y, w, h, 0);
    }
  }

  paintCenter(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (!this.hasStyle || this.outline) return;
    const r = Math.min(Math.max(0, toNumber(getValue(this.style, 'centerRadius', 0))), w / 2, h / 2);
    if (r > 0) {
      const color = getString(this.style, 'centerColor', this.stroke);
      if (color != null && color !== NONE) {
        c.setShadow(false);
        c.setFillColor(color);
        c.ellipse(x + w / 2 - r, y + h / 2 - r, 2 * r, 2 * r);
        // Optional border on the inner circle, drawn in the shape's own
        // stroke color (centerStroke=1). Default stays fill-only.
        if (isOne(this.style, 'centerStroke', 0) && this.stroke != null && this.stroke !== NONE) {
          c.setStrokeColor(this.stroke);
          c.fillAndStroke();
        } else {
          c.fill();
        }
      }
    }
  }

  /**
   * Cubic bezier approximation of the top half of the ellipse, then a wave back through
   * the middle to close the highlight (matches the dip in the rectangular variant).
   */
  override paintGlassEffectPath(c: GlassCanvas, x: number, y: number, w: number, h: number, sw: number): void {
    const kappa = 0.5522847498;
    const rx = w / 2 + sw;
    const ry = h / 2 + sw;
    const cx = x + w / 2;
    const cy = y + h / 2;
    c.moveTo(cx - rx, cy);
    c.curveTo(cx - rx, cy - ry * kappa, cx - rx * kappa, cy - ry, cx, cy - ry);
    c.curveTo(cx + rx * kappa, cy - ry, cx + rx, cy - ry * kappa, cx + rx, cy);
    c.quadTo(cx, cy + h * 0.2, cx - rx, cy);
  }
}

// --- mxRhombus ----------------------------------------------------------------------

export class Rhombus extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }
  override isGlassable(): boolean { return true; }

  /** mxRhombus.paintVertexShape. */
  paintRhombus(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const hw = w / 2;
    const hh = h / 2;
    const arcSize = this.lineArcSize();
    c.begin();
    this.addPoints(c, [pt(x + hw, y), pt(x + w, y + hh), pt(x + hw, y + h), pt(x, y + hh)],
      this.isRounded, arcSize, true);
    c.fillAndStroke();
  }

  /** Shapes.js override: double rhombus (double=1) and glass. */
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    this.paintRhombus(c, x, y, w, h);
    // Stash original bounds; double-handling below mutates x, y, w, h.
    const gx = x;
    const gy = y;
    const gw = w;
    const gh = h;

    if (!this.outline && this.hasStyle && looseEq(getValue(this.style, 'double', null), 1)) {
      const margin = Math.max(2, this.strokewidth + 1) * 2 + parseFloat(String(getValue(this.style, 'margin', null) || 0));
      x += margin;
      y += margin;
      w -= 2 * margin;
      h -= 2 * margin;
      if (w > 0 && h > 0) {
        c.setShadow(false);
        this.paintRhombus(c, x, y, w, h);
      }
    }

    if (this.glass && !this.outline && this.fill != null && this.fill !== NONE) {
      this.paintGlassEffect(c, gx, gy, gw, gh, 0);
    }
  }

  override paintGlassEffectPath(c: GlassCanvas, x: number, y: number, w: number, h: number): void {
    const hw = w / 2;
    const hh = h / 2;
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(x, y + hh), pt(x + hw, y), pt(x + w, y + hh)], this.isRounded, arcSize, false);
    c.quadTo(x + hw, y + h * 0.7, x, y + hh);
  }
}

// --- mxTriangle, mxHexagon, mxCloud ------------------------------------------------------

export class Triangle extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = TRIANGLE_CONSTRAINTS;

  override isRoundable(): boolean { return true; }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0, 0), pt(w, 0.5 * h), pt(0, h)], this.isRounded, arcSize, true);
  }
}

/** mxHexagon (draw.io registers its own HexagonShape under `hexagon`). */
export class MxHexagon extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = HEXAGON_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const arcSize = this.lineArcSize();
    this.addPoints(c, [pt(0.25 * w, 0), pt(0.75 * w, 0), pt(w, 0.5 * h), pt(0.75 * w, h), pt(0.25 * w, h),
      pt(0, 0.5 * h)], this.isRounded, arcSize, true);
  }
}

export class Cloud extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = CLOUD_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.moveTo(0.25 * w, 0.25 * h);
    c.curveTo(0.05 * w, 0.25 * h, 0, 0.5 * h, 0.16 * w, 0.55 * h);
    c.curveTo(0, 0.66 * h, 0.18 * w, 0.9 * h, 0.31 * w, 0.8 * h);
    c.curveTo(0.4 * w, h, 0.7 * w, h, 0.8 * w, 0.8 * h);
    c.curveTo(w, 0.8 * h, w, 0.6 * h, 0.875 * w, 0.5 * h);
    c.curveTo(w, 0.3 * h, 0.8 * w, 0.1 * h, 0.625 * w, 0.2 * h);
    c.curveTo(0.5 * w, 0.05 * h, 0.3 * w, 0.05 * h, 0.25 * w, 0.25 * h);
    c.close();
  }
}

// --- mxLine -----------------------------------------------------------------------------

export class Line extends Shape {
  vertical = false;
  override constraints: readonly ConnectionConstraint[] | null = LINE_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.begin();
    if (this.vertical) {
      const mid = x + w / 2;
      c.moveTo(mid, y);
      c.lineTo(mid, y + h);
    } else {
      const mid = y + h / 2;
      c.moveTo(x, mid);
      c.lineTo(x + w, mid);
    }
    c.stroke();
  }
}

// --- mxDoubleEllipse --------------------------------------------------------------------

export class DoubleEllipse extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.ellipse(x, y, w, h);
    c.fillAndStroke();
  }

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (!this.outline) {
      const margin = toNumber(getValue(this.style, 'margin', Math.min(3 + this.strokewidth, Math.min(w / 5, h / 5))));
      x += margin;
      y += margin;
      w -= 2 * margin;
      h -= 2 * margin;
      // FIXME: Rounding issues in IE8 standards mode (not in 1.x)
      if (w > 0 && h > 0) c.ellipse(x, y, w, h);
      c.stroke();
    }
  }
}

// --- mxSwimlane -------------------------------------------------------------------------

/** A canvas that maps (u, v) of a turned title onto the canvas (mxSwimlane.paintTitleGlassEffect). */
class TurnedGlassCanvas implements GlassCanvas {
  private static readonly dirs = ['north', 'east', 'south', 'west'];

  constructor(private readonly c: SvgCanvas, private readonly turns: number,
    private readonly x: number, private readonly y: number,
    private readonly w: number, private readonly h: number) {}

  private mapX(u: number, v: number): number {
    return this.turns === 1 ? this.x + this.w - v : (this.turns === 2 ? this.x + this.w - u : this.x + v);
  }

  private mapY(u: number, v: number): number {
    return this.turns === 1 ? this.y + u : (this.turns === 2 ? this.y + this.h - v : this.y + this.h - u);
  }

  setGradient(color1: string | null, color2: string | null, gx: number, gy: number, gw: number, gh: number,
    direction: string | null, alpha1?: number | null, alpha2?: number | null): void {
    const x1 = this.mapX(gx, gy);
    const y1 = this.mapY(gx, gy);
    const x2 = this.mapX(gx + gw, gy + gh);
    const y2 = this.mapY(gx + gw, gy + gh);
    const dirs = TurnedGlassCanvas.dirs;
    const index = dirs.indexOf(direction != null ? direction : 'south');
    this.c.setGradient(color1, color2, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1),
      index >= 0 ? dirs[(index + this.turns) % 4] : direction, alpha1, alpha2);
  }

  begin(): void { this.c.begin(); }
  moveTo(u: number, v: number): void { this.c.moveTo(this.mapX(u, v), this.mapY(u, v)); }
  lineTo(u: number, v: number): void { this.c.lineTo(this.mapX(u, v), this.mapY(u, v)); }
  quadTo(u1: number, v1: number, u2: number, v2: number): void {
    this.c.quadTo(this.mapX(u1, v1), this.mapY(u1, v1), this.mapX(u2, v2), this.mapY(u2, v2));
  }
  curveTo(u1: number, v1: number, u2: number, v2: number, u3: number, v3: number): void {
    this.c.curveTo(this.mapX(u1, v1), this.mapY(u1, v1), this.mapX(u2, v2), this.mapY(u2, v2),
      this.mapX(u3, v3), this.mapY(u3, v3));
  }
  close(): void { this.c.close(); }
  fill(): void { this.c.fill(); }
}

export class Swimlane extends Shape {
  imageSize = 16;
  fixedHeaderDefault = true;
  laneFill: string = NONE;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override apply(style: Record<string, string>): void {
    super.apply(style);
    this.laneFill = String(getValue(style, 'swimlaneFillColor', NONE));
  }

  override isRoundable(): boolean { return true; }
  override isGlassable(): boolean { return true; }

  getTitleSize(): number {
    return Math.max(0, toNumber(getValue(this.style, 'startSize', DEFAULT_STARTSIZE)));
  }

  getFooterSize(): number {
    return Math.max(0, toNumber(getValue(this.style, 'footerSize', 0)));
  }

  override getGradientBounds(_c: SvgCanvas, x: number, y: number, w: number, h: number): Rect {
    const start = this.getTitleSize();
    if (this.isHorizontal()) return { x, y, width: w, height: Math.min(start, h) };
    return { x, y, width: Math.min(start, w), height: h };
  }

  getSwimlaneArcSize(w: number, h: number, start: number): number {
    if (looseEq(getValue(this.style, 'absoluteArcSize', 0), '1')) {
      return Math.min(w / 2, Math.min(h / 2, toNumber(getValue(this.style, 'arcSize', LINE_ARCSIZE)) / 2));
    }
    const f = toNumber(getValue(this.style, 'arcSize', RECTANGLE_ROUNDING_FACTOR * 100)) / 100;
    return start * f * 3;
  }

  isHorizontal(): boolean {
    return looseEq(getValue(this.style, 'horizontal', 1), 1);
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.outline) return;
    let start = this.getTitleSize();
    const fixedHeader = getValue(this.style, 'fixedHeader', this.fixedHeaderDefault);
    if (start === 0 && !truthy(fixedHeader)) return;

    let r = 0;
    if (this.isHorizontal()) start = Math.min(start, h);
    else start = Math.min(start, w);

    c.translate(x, y);

    if (!this.isRounded) {
      this.paintSwimlane(c, x, y, w, h, start);
    } else {
      r = this.getSwimlaneArcSize(w, h, start);
      r = Math.min((this.isHorizontal() ? h : w) - start, Math.min(start, r));
      this.paintRoundedSwimlane(c, x, y, w, h, start, r);
    }

    this.paintFooter(c, x, y, w, h, start, r);
    const sep = getString(this.style, 'separatorColor', NONE);
    this.paintSeparator(c, x, y, w, h, start, sep);

    if (this.image != null) {
      const bounds = this.getImageBounds(x, y, w, h);
      const clipPath = getString(this.style, 'clipPath', null);
      paintImage(c, bounds.x - x, bounds.y - y, bounds.width, bounds.height, this.image, false, false, false, clipPath);
    }

    if (this.glass) {
      c.setShadow(false);
      if (this.isHorizontal()) this.paintGlassEffect(c, 0, 0, w, start, r);
      else this.paintTitleGlassEffect(c, 0, 0, start, h, r, 'west');
    }
  }

  /** The glass of a title on the given side, as if the title were on top. */
  paintTitleGlassEffect(c: SvgCanvas, x: number, y: number, w: number, h: number, arc: number, side: string): void {
    const turns = side === 'east' ? 1 : (side === 'south' ? 2 : (side === 'west' ? 3 : 0));
    c.save();
    if (turns === 0) {
      this.paintGlassEffect(c, x, y, w, h, arc);
    } else {
      const vertical = turns !== 2;
      const tw = vertical ? h : w;
      const th = vertical ? w : h;
      // Same as rotating (u, v) by 90 degrees times turns around the center
      this.paintGlassEffect(new TurnedGlassCanvas(c, turns, x, y, w, h), 0, 0, tw, th, arc);
    }
    c.restore();
  }

  private laneFlags(): { events: boolean; line: boolean; head: boolean; body: boolean } {
    return {
      events: looseEq(getValue(this.style, 'pointerEvents', '1'), '1'),
      line: looseEq(getValue(this.style, 'swimlaneLine', 1), 1),
      head: looseEq(getValue(this.style, 'swimlaneHead', 1), 1),
      body: looseEq(getValue(this.style, 'swimlaneBody', 1), 1),
    };
  }

  /** The body of the lane: stroked, filled with the lane fill, or both. */
  private paintBody(c: SvgCanvas, fill: string, body: boolean): void {
    if (body) {
      if (fill === NONE) c.stroke();
      else c.fillAndStroke();
    } else if (fill !== NONE) {
      c.fill();
    }
  }

  paintSwimlane(c: SvgCanvas, x: number, y: number, w: number, h: number, start: number): void {
    const fill = this.laneFill;
    const { events, line, head, body } = this.laneFlags();

    if (this.isHorizontal()) {
      c.begin();
      c.moveTo(0, start);
      c.lineTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, start);
      if (head) c.fillAndStroke();
      else c.fill();

      if (start < h) {
        if (fill === NONE || !events) c.pointerEvents = false;
        if (fill !== NONE) c.setFillColor(fill);
        c.begin();
        c.moveTo(0, start);
        c.lineTo(0, h);
        c.lineTo(w, h);
        c.lineTo(w, start);
        this.paintBody(c, fill, body);
      }
    } else {
      c.begin();
      c.moveTo(start, 0);
      c.lineTo(0, 0);
      c.lineTo(0, h);
      c.lineTo(start, h);
      if (head) c.fillAndStroke();
      else c.fill();

      if (start < w) {
        if (fill === NONE || !events) c.pointerEvents = false;
        if (fill !== NONE) c.setFillColor(fill);
        c.begin();
        c.moveTo(start, 0);
        c.lineTo(w, 0);
        c.lineTo(w, h);
        c.lineTo(start, h);
        this.paintBody(c, fill, body);
      }
    }

    if (line) this.paintDivider(c, x, y, w, h, start, fill === NONE);
  }

  paintRoundedSwimlane(c: SvgCanvas, x: number, y: number, w: number, h: number, start: number, r: number): void {
    const fill = this.laneFill;
    const { events, line, head, body } = this.laneFlags();

    if (this.isHorizontal()) {
      c.begin();
      c.moveTo(w, start);
      c.lineTo(w, r);
      c.quadTo(w, 0, w - Math.min(w / 2, r), 0);
      c.lineTo(Math.min(w / 2, r), 0);
      c.quadTo(0, 0, 0, r);
      c.lineTo(0, start);
      if (head) c.fillAndStroke();
      else c.fill();

      if (start < h) {
        if (fill === NONE || !events) c.pointerEvents = false;
        if (fill !== NONE) c.setFillColor(fill);
        c.begin();
        c.moveTo(0, start);
        c.lineTo(0, h - r);
        c.quadTo(0, h, Math.min(w / 2, r), h);
        c.lineTo(w - Math.min(w / 2, r), h);
        c.quadTo(w, h, w, h - r);
        c.lineTo(w, start);
        this.paintBody(c, fill, body);
      }
    } else {
      c.begin();
      c.moveTo(start, 0);
      c.lineTo(r, 0);
      c.quadTo(0, 0, 0, Math.min(h / 2, r));
      c.lineTo(0, h - Math.min(h / 2, r));
      c.quadTo(0, h, r, h);
      c.lineTo(start, h);
      if (head) c.fillAndStroke();
      else c.fill();

      if (start < w) {
        if (fill === NONE || !events) c.pointerEvents = false;
        if (fill !== NONE) c.setFillColor(fill);
        c.begin();
        c.moveTo(start, h);
        c.lineTo(w - r, h);
        c.quadTo(w, h, w, h - Math.min(h / 2, r));
        c.lineTo(w, Math.min(h / 2, r));
        c.quadTo(w, 0, w - r, 0);
        c.lineTo(start, 0);
        this.paintBody(c, fill, body);
      }
    }

    if (line) this.paintDivider(c, x, y, w, h, start, fill === NONE);
  }

  paintFooter(c: SvgCanvas, _x: number, _y: number, w: number, h: number, start: number, r: number): void {
    let footer = this.getFooterSize();
    const horizontal = this.isHorizontal();
    const size = horizontal ? h : w;

    // Keeps the footer within the body so it never overlaps the title
    footer = Math.min(footer, size - start);
    if (footer <= 0) return;

    const fill = this.fill;

    // Reuses the title fill (the body may have switched to the lane fill) and
    // disables the shadow so the inner border does not cast one onto the body
    if (fill != null && fill !== NONE) c.setFillColor(fill);
    c.setShadow(false);
    c.begin();

    if (horizontal) {
      const rr = Math.min(w / 2, r);
      if (footer >= r) {
        // Divider clears the corners: straight sides plus the full rounding
        c.moveTo(0, h - footer);
        c.lineTo(0, h - r);
        c.quadTo(0, h, rr, h);
        c.lineTo(w - rr, h);
        c.quadTo(w, h, w, h - r);
        c.lineTo(w, h - footer);
      } else {
        // Divider falls inside the corners: trace the lane wall (radius r)
        // from where its quadratic crosses y = h - footer (split at t)
        const t = 1 - Math.sqrt(footer / r);
        const px = rr * t * t;
        const bx = rr * t;
        c.moveTo(px, h - footer);
        c.quadTo(bx, h, rr, h);
        c.lineTo(w - rr, h);
        c.quadTo(w - bx, h, w - px, h - footer);
      }
    } else {
      const rr = Math.min(h / 2, r);
      if (footer >= r) {
        c.moveTo(w - footer, 0);
        c.lineTo(w - r, 0);
        c.quadTo(w, 0, w, rr);
        c.lineTo(w, h - rr);
        c.quadTo(w, h, w - r, h);
        c.lineTo(w - footer, h);
      } else {
        const t = 1 - Math.sqrt(footer / r);
        const py = rr * t * t;
        const by = rr * t;
        c.moveTo(w - footer, py);
        c.quadTo(w, by, w, rr);
        c.lineTo(w, h - rr);
        c.quadTo(w, h - by, w - footer, h - py);
      }
    }

    c.close();
    if (fill != null && fill !== NONE) c.fillAndStroke();
    else c.stroke();
  }

  paintDivider(c: SvgCanvas, _x: number, _y: number, w: number, h: number, start: number, shadow: boolean): void {
    if (start !== 0) {
      if (!shadow) c.setShadow(false);
      c.begin();
      if (this.isHorizontal()) {
        c.moveTo(0, start);
        c.lineTo(w, start);
      } else {
        c.moveTo(start, 0);
        c.lineTo(start, h);
      }
      c.stroke();
    }
  }

  paintSeparator(c: SvgCanvas, _x: number, _y: number, w: number, h: number, start: number, color: string): void {
    if (color !== NONE) {
      c.setStrokeColor(color);
      c.setDashed(true);
      c.begin();
      if (this.isHorizontal()) {
        c.moveTo(w, start);
        c.lineTo(w, h);
      } else {
        c.moveTo(start, 0);
        c.lineTo(w, 0);
      }
      c.stroke();
      c.setDashed(false);
    }
  }

  getImageBounds(x: number, y: number, w: number, _h: number): Rect {
    if (this.isHorizontal()) return { x: x + w - this.imageSize, y, width: this.imageSize, height: this.imageSize };
    return { x, y, width: this.imageSize, height: this.imageSize };
  }
}

// --- images and clip paths (mxSvgCanvas2D.image / processClipPath) -----------------------

interface ClipShape {
  markup: string;
  bbox: Rect | null;
}

/** mxSvgCanvas2D.parseClipValue: a relative number between 0 and 1. */
function parseClipValue(values: string[], index: number): number {
  const str = values[Math.min(index, values.length - 1)];
  let value = 1;
  if (str === 'center') {
    value = 0.5;
  } else if (str === 'top' || str === 'left') {
    value = 0;
  } else {
    const temp = parseFloat(str);
    if (!Number.isNaN(temp)) value = Math.max(0, Math.min(1, temp / 100));
  }
  return value;
}

/** mxSvgCanvas2D.appendClipPath: the clip shape in objectBoundingBox units and its box. */
function clipShape(clipPath: string): ClipShape | null {
  const tokens = /\(([^)]+)\)/.exec(clipPath);
  if (tokens == null) return null;
  const values = tokens[1].split(/[ ,]+/);
  if (clipPath.substring(0, 7) === 'polygon') {
    let minX: number | null = null;
    let minY: number | null = null;
    let maxX: number | null = null;
    let maxY: number | null = null;
    const pts: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const value = parseClipValue(values, i);
      if (i % 2 === 0) {
        if (minX == null || minX > value) minX = value;
        if (maxX == null || maxX < value) maxX = value;
      } else {
        if (minY == null || minY > value) minY = value;
        if (maxY == null || maxY < value) maxY = value;
      }
      pts.push(value);
    }
    return {
      markup: `<polygon points="${pts.join(',')}"/>`,
      bbox: { x: minX ?? 0, y: minY ?? 0, width: (maxX ?? 0) - (minX ?? 0), height: (maxY ?? 0) - (minY ?? 0) },
    };
  } else if (clipPath.substring(0, 6) === 'circle') {
    const r = parseClipValue(values, 0);
    const cx = parseClipValue(values, 2);
    const cy = parseClipValue(values, 3);
    return { markup: `<circle r="${r}" cx="${cx}" cy="${cy}"/>`, bbox: { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r } };
  } else if (clipPath.substring(0, 7) === 'ellipse') {
    const rx = parseClipValue(values, 0);
    const ry = parseClipValue(values, 1);
    const cx = parseClipValue(values, 3);
    const cy = parseClipValue(values, 4);
    return {
      markup: `<ellipse rx="${rx}" ry="${ry}" cx="${cx}" cy="${cy}"/>`,
      bbox: { x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry },
    };
  } else if (clipPath.substring(0, 5) === 'inset') {
    const top = parseClipValue(values, 0);
    const right = parseClipValue(values, 1);
    const bottom = parseClipValue(values, 2);
    const left = parseClipValue(values, 3);
    const w = 1 - right - left;
    const h = 1 - top - bottom;
    let round = '';
    if (values.length > 4 && values[4] === 'round') {
      const r = parseClipValue(values, 5);
      round = ` rx="${r}" ry="${r}"`;
    }
    return { markup: `<rect x="${left}" y="${top}" width="${w}" height="${h}"${round}/>`, bbox: { x: left, y: top, width: w, height: h } };
  }
  return { markup: '', bbox: null };
}

const clipCounters = new WeakMap<SvgCanvas, number>();

/**
 * mxSvgCanvas2D.image with a CSS clip-path (inset, polygon, circle,
 * ellipse): the image is scaled so the clip box fills its bounds.
 */
export function paintImage(c: SvgCanvas, x: number, y: number, w: number, h: number, src: string,
  aspect: boolean, flipH: boolean, flipV: boolean, clipPath: string | null): void {
  const clip = clipPath != null ? clipShape(clipPath) : null;
  if (clip == null) {
    c.image(x, y, w, h, src, aspect, flipH, flipV);
    return;
  }
  const s = c.state;
  x += s.dx;
  y += s.dy;
  let nx = x * s.scale;
  let ny = y * s.scale;
  let nw = w * s.scale;
  let nh = h * s.scale;
  const bbox = clip.bbox;
  if (bbox != null) {
    nx = x * s.scale - (w * s.scale * bbox.x) / bbox.width;
    ny = y * s.scale - (h * s.scale * bbox.y) / bbox.height;
    nw = w * s.scale / bbox.width;
    nh = h * s.scale / bbox.height;
  }
  const n = (clipCounters.get(c) ?? 0) + 1;
  clipCounters.set(c, n);
  const id = `${c.idPrefix}-clip${n}`;
  c.addDef(`<clipPath id="${id}" clipPathUnits="objectBoundingBox">${clip.markup}</clipPath>`);

  const attrs = [
    `x="${fmt(nx)}"`, `y="${fmt(ny)}"`, `width="${fmt(nw)}"`, `height="${fmt(nh)}"`, `href="${escapeAttr(src)}"`,
  ];
  if (!aspect) attrs.push('preserveAspectRatio="none"');
  if (s.alpha < 1 || s.fillAlpha < 1) attrs.push(`opacity="${s.alpha * s.fillAlpha}"`);
  let transform = s.transform;
  if (flipH || flipV) {
    const sx = flipH ? -1 : 1;
    const sy = flipV ? -1 : 1;
    const dx = flipH ? -w - 2 * x : 0;
    const dy = flipV ? -h - 2 * y : 0;
    transform += `scale(${sx},${sy})translate(${fmt(dx * s.scale)},${fmt(dy * s.scale)})`;
  }
  if (transform) attrs.push(`transform="${transform}"`);
  attrs.push(`clip-path="url(#${id})"`);
  c.emit(`<image ${attrs.join(' ')}/>`);
}

// --- mxImageShape ----------------------------------------------------------------------

export class ImageShape extends RectangleShape {
  preserveImageAspect = true;
  imageBackground: string | null = null;
  imageBorder: string | null = null;
  clipPath: string | null = null;

  override apply(style: Record<string, string>): void {
    super.apply(style);
    this.fill = null;
    this.stroke = null;
    this.gradient = null;
    this.preserveImageAspect = getNumber(style, 'imageAspect', 1) === 1;
    this.imageBackground = getString(style, 'imageBackground', null);
    this.imageBorder = getString(style, 'imageBorder', null);
    // Legacy support for imageFlipH/V
    this.flipH = this.flipH || isOne(style, 'imageFlipH', 0);
    this.flipV = this.flipV || isOne(style, 'imageFlipV', 0);
    this.clipPath = getString(style, 'clipPath', null);
  }

  override isRoundable(): boolean { return true; }
  override isGlassable(): boolean { return false; }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.image != null) {
      const r = this.isRounded ? this.getArcSize(w, h) : 0;

      if (this.imageBackground != null) {
        // Stroke rendering required for shadow
        c.setFillColor(this.imageBackground);
        c.setStrokeColor(this.imageBorder);
        if (r > 0) c.roundrect(x, y, w, h, r, r);
        else c.rect(x, y, w, h);
        c.fillAndStroke();
      }

      // FlipH/V are implicit via mxShape.updateTransform
      let clip = this.clipPath;
      if (r > 0) {
        const roundVal = ` round ${r * 100 / Math.min(w, h)}%`;
        if (clip != null && clip.substring(0, 5) === 'inset' && clip.indexOf('round') < 0) {
          clip = clip.replace(')', `${roundVal})`);
        } else if (clip == null) {
          clip = `inset(0% 0% 0% 0%${roundVal})`;
        }
      }

      paintImage(c, x, y, w, h, this.image, this.preserveImageAspect, false, false, clip);

      if (this.imageBorder != null) {
        c.setShadow(false);
        c.setStrokeColor(this.imageBorder);
        if (r > 0) c.roundrect(x, y, w, h, r, r);
        else c.rect(x, y, w, h);
        c.stroke();
      }
    } else {
      super.paintBackground(c, x, y, w, h);
    }
  }
}

// --- mxLabel ---------------------------------------------------------------------------

export class Label extends RectangleShape {
  imageSize = DEFAULT_IMAGESIZE;
  override spacing = 2;
  indicatorSize = 10;
  indicatorSpacing = 2;

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    this.paintImage(c, x, y, w, h);
    this.paintIndicator(c, x, y, w, h);
    super.paintForeground(c, x, y, w, h);
  }

  paintImage(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.image != null) {
      const bounds = this.getImageBounds(x, y, w, h);
      const clipPath = getString(this.style, 'clipPath', null);
      paintImage(c, bounds.x, bounds.y, bounds.width, bounds.height, this.image, false, false, false, clipPath);
    }
  }

  getImageBounds(x: number, y: number, w: number, h: number): Rect {
    const align = getString(this.style, 'imageAlign', 'left');
    const valign = getString(this.style, 'imageVerticalAlign', 'middle');
    const width = getNumber(this.style, 'imageWidth', DEFAULT_IMAGESIZE);
    const height = getNumber(this.style, 'imageHeight', DEFAULT_IMAGESIZE);
    const spacing = getNumber(this.style, 'spacing', this.spacing) + 5;

    if (align === 'center') x += (w - width) / 2;
    else if (align === 'right') x += w - width - spacing;
    else x += spacing; // default is left

    if (valign === 'top') y += spacing;
    else if (valign === 'bottom') y += h - height - spacing;
    else y += (h - height) / 2; // default is middle

    return { x, y, width, height };
  }

  /** The indicator is a shape of its own (never applied) painted into this canvas. */
  paintIndicator(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    if (this.indicatorShape != null) {
      const indicator = new this.indicatorShape();
      indicator.fill = this.indicatorColor;
      indicator.stroke = this.indicatorStrokeColor;
      indicator.gradient = this.indicatorGradientColor;
      indicator.direction = this.indicatorDirection;
      indicator.bounds = this.getIndicatorBounds(x, y, w, h);
      indicator.paint(c);
    } else if (this.indicatorImage != null) {
      const bounds = this.getIndicatorBounds(x, y, w, h);
      c.image(bounds.x, bounds.y, bounds.width, bounds.height, this.indicatorImage, false, false, false);
    }
  }

  getIndicatorBounds(x: number, y: number, w: number, h: number): Rect {
    const align = getString(this.style, 'imageAlign', 'left');
    const valign = getString(this.style, 'imageVerticalAlign', 'middle');
    const width = getNumber(this.style, 'indicatorWidth', this.indicatorSize);
    const height = getNumber(this.style, 'indicatorHeight', this.indicatorSize);
    const spacing = this.spacing + 5;

    if (align === 'right') x += w - width - spacing;
    else if (align === 'center') x += (w - width) / 2;
    else x += spacing; // default is left

    if (valign === 'bottom') y += h - height - spacing;
    else if (valign === 'top') y += spacing;
    else y += (h - height) / 2; // default is middle

    return { x, y, width, height };
  }
}

/** The shape class for a name, or `fallback` for unknown names (mxCellRenderer.getShapeConstructor). */
export function shapeClassOr(name: string | null | undefined, fallback: new () => Shape): new () => Shape {
  return getShapeClass(name) ?? fallback;
}

