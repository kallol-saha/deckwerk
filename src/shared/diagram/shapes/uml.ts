/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Shapes.js — the UML shapes (umlActor, umlBoundary,
 * umlEntity, umlDestroy, umlControl, umlState, umlLifeline, umlFrame,
 * lollipop, requires, requiredInterface, providedRequiredInterface, module,
 * component, associativeEntity, endState, startState, smileyFace) and their
 * connection points.
 * Modified for DeckWerk: label bounds and margins are left out, and the
 * mirrored label copy of lifelineMirror=1 is not painted (labels are drawn
 * elsewhere); the painting code is otherwise unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Style } from '../types.js';
import { DoubleEllipse, ELLIPSE_CONSTRAINTS, Ellipse, RectangleShape } from './basic.js';
import { Cylinder, Shape, constraint, getShapeClass, pt, type ConnectionConstraint } from './shape.js';
import { NONE, getFloat, getString, getValue, looseEq } from './util.js';

export const UML_ACTOR_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0.1, false), constraint(0.5, 0, false), constraint(0.75, 0.1, false), constraint(0, 1 / 3, false),
  constraint(0, 1, false), constraint(1, 1 / 3, false), constraint(1, 1, false), constraint(0.5, 0.5, false),
];

export class UmlActorShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = UML_ACTOR_CONSTRAINTS;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // Head
    c.ellipse(w / 4, 0, w / 2, h / 4);
    c.fillAndStroke();

    c.begin();
    c.moveTo(w / 2, h / 4);
    c.lineTo(w / 2, 2 * h / 3);

    // Arms
    c.moveTo(w / 2, h / 3);
    c.lineTo(0, h / 3);
    c.moveTo(w / 2, h / 3);
    c.lineTo(w, h / 3);

    // Legs
    c.moveTo(w / 2, 2 * h / 3);
    c.lineTo(0, h);
    c.moveTo(w / 2, 2 * h / 3);
    c.lineTo(w, h);
    c.end();

    c.stroke();
  }
}

export class UmlBoundaryShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // Base line
    c.begin();
    c.moveTo(0, h / 4);
    c.lineTo(0, h * 3 / 4);
    c.end();
    c.stroke();

    // Horizontal line
    c.begin();
    c.moveTo(0, h / 2);
    c.lineTo(w / 6, h / 2);
    c.end();
    c.stroke();

    // Circle
    c.ellipse(w / 6, 0, w * 5 / 6, h);
    c.fillAndStroke();
  }
}

export class UmlEntityShape extends Ellipse {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);
    c.begin();
    c.moveTo(x + w / 8, y + h);
    c.lineTo(x + w * 7 / 8, y + h);
    c.end();
    c.stroke();
  }
}

export class UmlDestroyShape extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    c.moveTo(w, 0);
    c.lineTo(0, h);
    c.moveTo(0, 0);
    c.lineTo(w, h);
    c.end();
    c.stroke();
  }
}

export class UmlControlShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    // Upper line
    c.begin();
    c.moveTo(w * 3 / 8, h / 8 * 1.1);
    c.lineTo(w * 5 / 8, 0);
    c.end();
    c.stroke();

    // Circle
    c.ellipse(0, h / 8, w, h * 7 / 8);
    c.fillAndStroke();
  }

  /** The canvas is still translated by paintBackground. */
  override paintForeground(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    // Lower line
    c.begin();
    c.moveTo(w * 3 / 8, h / 8 * 1.1);
    c.lineTo(w * 5 / 8, h / 4);
    c.end();
    c.stroke();
  }
}

/** UML State shape. */
export class UmlStateShape extends Cylinder {
  arcSize = 0.1;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const rounded = Boolean(getValue(this.style, 'rounded', false));
    const absArcSize = Boolean(getValue(this.style, 'absoluteArcSize', false));
    let arcSize = getFloat(this.style, 'arcSize', this.arcSize);
    const connPoint = getValue(this.style, 'umlStateConnection', null);

    if (!absArcSize) arcSize = Math.min(w, h) * arcSize;
    arcSize = Math.min(arcSize, w * 0.5, h * 0.5);
    if (!rounded) arcSize = 0;

    let dx = 0;
    if (connPoint != null) dx = 10;

    c.begin();
    c.moveTo(dx, arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, dx + arcSize, 0);
    c.lineTo(w - arcSize, 0);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w, arcSize);
    c.lineTo(w, h - arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w - arcSize, h);
    c.lineTo(dx + arcSize, h);
    c.arcTo(arcSize, arcSize, 0, 0, 1, dx, h - arcSize);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    const sym = getValue(this.style, 'umlStateSymbol', null);
    if (sym === 'collapseState') {
      c.roundrect(w - 40, h - 20, 10, 10, 3, 3);
      c.stroke();
      c.roundrect(w - 20, h - 20, 10, 10, 3, 3);
      c.stroke();
      c.begin();
      c.moveTo(w - 30, h - 15);
      c.lineTo(w - 20, h - 15);
      c.stroke();
    }

    if (connPoint === 'connPointRefEntry') {
      c.ellipse(0, h * 0.5 - 10, 20, 20);
      c.fillAndStroke();
    } else if (connPoint === 'connPointRefExit') {
      c.ellipse(0, h * 0.5 - 10, 20, 20);
      c.fillAndStroke();
      c.begin();
      c.moveTo(5, h * 0.5 - 5);
      c.lineTo(15, h * 0.5 + 5);
      c.moveTo(15, h * 0.5 - 5);
      c.lineTo(5, h * 0.5 + 5);
      c.stroke();
    }
  }
}

/** UML Lifeline Shape: a head (box or participant shape) and a dashed line. */
export class UmlLifeline extends RectangleShape {
  size = 40;
  override constraints: readonly ConnectionConstraint[] | null = null;

  /**
   * lifelineMirror=1 repeats the head (participant box or icon) at the foot
   * of the cell, so a single lifeline cell renders both participant ends of
   * a UML sequence column. Off by default for backward compatibility.
   */
  isMirrored(): boolean {
    return looseEq(getValue(this.style, 'lifelineMirror', '0'), '1');
  }

  /** Head (and mirrored foot) height, at most half the height when mirrored. */
  getHeadSize(h: number): number {
    return Math.max(0, Math.min(this.isMirrored() ? h / 2 : h, getFloat(this.style, 'size', this.size)));
  }

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const size = this.getHeadSize(h);
    const mirror = this.isMirrored();
    const participant = getString(this.style, 'participant', null);

    if (participant == null) {
      super.paintBackground(c, x, y, w, size);
      if (mirror) super.paintBackground(c, x, y + h - size, w, size);
    } else {
      const ctor = getShapeClass(participant);
      if (ctor != null && ctor !== UmlLifeline) {
        const shape = new ctor();
        shape.apply(this.style);
        c.save();
        shape.paintVertexShape(c, x, y, w, size);
        c.restore();

        if (mirror) {
          c.save();
          shape.paintVertexShape(c, x, y + h - size, w, size);
          c.restore();
        }
      }
    }

    const lineEnd = mirror ? h - size : h;
    if (size < lineEnd) {
      c.setDashed(looseEq(getValue(this.style, 'lifelineDashed', '1'), '1'));

      // Optional color of the line, eg. Mermaid 12's redux themes draw a
      // palette-colored head over a line in the ink color
      const lifelineColor = getString(this.style, 'lifelineColor', null);
      if (lifelineColor != null) c.setStrokeColor(lifelineColor);

      c.begin();
      c.moveTo(x + w / 2, y + size);
      c.lineTo(x + w / 2, y + lineEnd);
      c.end();
      c.stroke();
    }
  }

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // A custom participant shape owns the outline of the head
    const participant = getString(this.style, 'participant', null);
    const size = this.getHeadSize(h);
    if (participant == null) {
      super.paintForeground(c, x, y, w, Math.min(h, size));
      if (this.isMirrored()) super.paintForeground(c, x, y + h - size, w, size);
    }
  }
}

/** UML Frame Shape. */
export class UmlFrame extends Shape {
  width = 60;
  height = 30;
  corner = 10;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const co = this.corner;
    const w0 = Math.min(w, Math.max(co, getFloat(this.style, 'width', this.width)));
    const h0 = Math.min(h, Math.max(co * 1.5, getFloat(this.style, 'height', this.height)));
    const bg = getString(this.style, 'swimlaneFillColor', NONE);

    if (bg !== NONE) {
      c.setFillColor(bg);
      c.rect(x, y, w, h);
      c.fill();
    }

    if (this.fill != null && this.fill !== NONE && this.gradient && this.gradient !== NONE) {
      c.setGradient(this.fill, this.gradient, x, y, w, h, this.gradientDirection);
    } else {
      c.setFillColor(this.fill);
    }

    c.begin();
    c.moveTo(x, y);
    c.lineTo(x + w0, y);
    c.lineTo(x + w0, y + Math.max(0, h0 - co * 1.5));
    c.lineTo(x + Math.max(0, w0 - co), y + h0);
    c.lineTo(x, y + h0);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(x + w0, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y + h0);
    c.stroke();
  }
}

// --- Interfaces ---------------------------------------------------------------------

export const LOLLIPOP_CONSTRAINTS: readonly ConnectionConstraint[] = [constraint(0.5, 0, false), constraint(0.5, 1, false)];
export const INTERFACE_CONSTRAINTS: readonly ConnectionConstraint[] = [constraint(0, 0.5, false), constraint(1, 0.5, false)];

/** Provided Interface Shape (aka Lollipop). */
export class LollipopShape extends Shape {
  size = 10;
  override constraints: readonly ConnectionConstraint[] | null = LOLLIPOP_CONSTRAINTS;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const sz = getFloat(this.style, 'size', this.size);
    c.translate(x, y);
    c.ellipse((w - sz) / 2, 0, sz, sz);
    c.fillAndStroke();
    c.begin();
    c.moveTo(w / 2, sz);
    c.lineTo(w / 2, h);
    c.end();
    c.stroke();
  }
}

/** Required Interface Shape. */
export class RequiresShape extends Shape {
  size = 10;
  inset = 2;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const sz = getFloat(this.style, 'size', this.size);
    const inset = getFloat(this.style, 'inset', this.inset) + this.strokewidth;
    c.translate(x, y);

    c.begin();
    c.moveTo(w / 2, sz + inset);
    c.lineTo(w / 2, h);
    c.end();
    c.stroke();

    c.begin();
    c.moveTo((w - sz) / 2 - inset, sz / 2);
    c.quadTo((w - sz) / 2 - inset, sz + inset, w / 2, sz + inset);
    c.quadTo((w + sz) / 2 + inset, sz + inset, (w + sz) / 2 + inset, sz / 2);
    c.end();
    c.stroke();
  }
}

export class RequiredInterfaceShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = INTERFACE_CONSTRAINTS;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    c.moveTo(0, 0);
    c.quadTo(w, 0, w, h / 2);
    c.quadTo(w, h, 0, h);
    c.end();
    c.stroke();
  }
}

export class ProvidedRequiredInterfaceShape extends Shape {
  inset = 2;
  override constraints: readonly ConnectionConstraint[] | null = INTERFACE_CONSTRAINTS;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const inset = getFloat(this.style, 'inset', this.inset) + this.strokewidth;
    c.translate(x, y);
    c.ellipse(0, inset, w - 2 * inset, h - 2 * inset);
    c.fillAndStroke();
    c.begin();
    c.moveTo(w / 2, 0);
    c.quadTo(w, 0, w, h / 2);
    c.quadTo(w, h, w / 2, h);
    c.end();
    c.stroke();
  }
}

// --- Module and component -------------------------------------------------------------

const MODULE_JETTY_WIDTH = 20;
const MODULE_JETTY_HEIGHT = 10;

export class ModuleShape extends Cylinder {
  jettyWidth = MODULE_JETTY_WIDTH;
  jettyHeight = MODULE_JETTY_HEIGHT;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number, isForeground: boolean): void {
    const dx = getFloat(this.style, 'jettyWidth', this.jettyWidth);
    const dy = getFloat(this.style, 'jettyHeight', this.jettyHeight);
    const x0 = dx / 2;
    const x1 = x0 + dx / 2;
    const y0 = Math.min(dy, h - dy);
    const y1 = Math.min(y0 + 2 * dy, h - dy);
    paintJetties(c, w, h, x0, x1, y0, y1, dy, isForeground);
  }

  override getConstraints(style: Style, _w: number, h: number): ConnectionConstraint[] {
    const x0 = getFloat(style, 'jettyWidth', MODULE_JETTY_WIDTH) / 2;
    const dy = getFloat(style, 'jettyHeight', MODULE_JETTY_HEIGHT);
    const constr = [
      constraint(0, 0, false, x0), constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true),
      constraint(1, 0, true), constraint(1, 0.25, true), constraint(1, 0.5, true), constraint(1, 0.75, true),
      constraint(0, 1, false, x0), constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true),
      constraint(1, 1, true), constraint(0, 0, false, 0, Math.min(h - 0.5 * dy, 1.5 * dy)),
      constraint(0, 0, false, 0, Math.min(h - 0.5 * dy, 3.5 * dy)),
    ];
    if (h > 5 * dy) constr.push(constraint(0, 0.75, false, x0));
    if (h > 8 * dy) constr.push(constraint(0, 0.5, false, x0));
    if (h > 15 * dy) constr.push(constraint(0, 0.25, false, x0));
    return constr;
  }
}

/** The body with two jetties (background) or the jetty outlines (foreground). */
function paintJetties(c: SvgCanvas, w: number, h: number, x0: number, x1: number, y0: number, y1: number,
  dy: number, isForeground: boolean): void {
  if (isForeground) {
    c.moveTo(x0, y0);
    c.lineTo(x1, y0);
    c.lineTo(x1, y0 + dy);
    c.lineTo(x0, y0 + dy);
    c.moveTo(x0, y1);
    c.lineTo(x1, y1);
    c.lineTo(x1, y1 + dy);
    c.lineTo(x0, y1 + dy);
    c.end();
  } else {
    c.moveTo(x0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(x0, h);
    c.lineTo(x0, y1 + dy);
    c.lineTo(0, y1 + dy);
    c.lineTo(0, y1);
    c.lineTo(x0, y1);
    c.lineTo(x0, y0 + dy);
    c.lineTo(0, y0 + dy);
    c.lineTo(0, y0);
    c.lineTo(x0, y0);
    c.close();
    c.end();
  }
}

export const COMPONENT_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0, true), constraint(0.5, 0, true), constraint(0.75, 0, true), constraint(0, 0.3, true),
  constraint(0, 0.7, true), constraint(1, 0.25, true), constraint(1, 0.5, true), constraint(1, 0.75, true),
  constraint(0.25, 1, true), constraint(0.5, 1, true), constraint(0.75, 1, true),
];

export class ComponentShape extends Cylinder {
  jettyWidth = 32;
  jettyHeight = 12;
  override constraints: readonly ConnectionConstraint[] | null = COMPONENT_CONSTRAINTS;

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number, isForeground: boolean): void {
    const dx = getFloat(this.style, 'jettyWidth', this.jettyWidth);
    const dy = getFloat(this.style, 'jettyHeight', this.jettyHeight);
    const x0 = dx / 2;
    const x1 = x0 + dx / 2;
    const y0 = 0.3 * h - dy / 2;
    const y1 = 0.7 * h - dy / 2;
    paintJetties(c, w, h, x0, x1, y0, y1, dy, isForeground);
  }
}

/** Associative entity derived from rectangle shape. */
export class AssociativeEntity extends RectangleShape {
  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const hw = w / 2;
    const hh = h / 2;
    const arcSize = this.lineArcSize();
    c.begin();
    this.addPoints(c, [pt(x + hw, y), pt(x + w, y + hh), pt(x + hw, y + h), pt(x, y + hh)], this.isRounded, arcSize, true);
    c.stroke();
    super.paintForeground(c, x, y, w, h);
  }
}

// --- States -------------------------------------------------------------------------------

/** State Shapes derives from double ellipse (endState). */
export class StateShape extends DoubleEllipse {
  outerStroke = true;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const inset = Math.min(4, Math.min(w / 5, h / 5));
    if (w > 0 && h > 0) {
      c.ellipse(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
      c.fillAndStroke();
    }
    c.setShadow(false);
    if (this.outerStroke) {
      c.ellipse(x, y, w, h);
      c.stroke();
    }
  }
}

export class StartStateShape extends StateShape {
  override outerStroke = false;
}

/** Smiley face shape used by the mermaid journey renderer (smileyType=happy, neutral, sad). */
export class SmileyFaceShape extends Shape {
  featureColor = '#666666';
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const smileyType = getValue(this.style, 'smileyType', 'happy');
    const featureColor = getString(this.style, 'smileyFeatureColor', this.featureColor);
    c.translate(x, y);

    // Face circle uses cell's own fill/stroke + strokeWidth
    const r = Math.min(w, h) / 2;
    c.ellipse(w / 2 - r, h / 2 - r, r * 2, r * 2);
    c.fillAndStroke();

    const s = Math.min(w, h) / 30;
    const cx = w / 2;
    const cy = h / 2;

    // Eyes: r=1.5 circles at (cx±5, cy-5) with fill & stroke = featureColor,
    // stroke-width=2 to match mermaid's stroke-width="2" on the eye circles
    c.setFillColor(featureColor);
    c.setStrokeColor(featureColor);
    c.setStrokeWidth(2 * s);
    const eyeR = 1.5 * s;
    const eyeXOffset = 5 * s;
    const eyeYOffset = 5 * s;
    c.ellipse(cx - eyeXOffset - eyeR, cy - eyeYOffset - eyeR, eyeR * 2, eyeR * 2);
    c.fillAndStroke();
    c.ellipse(cx + eyeXOffset - eyeR, cy - eyeYOffset - eyeR, eyeR * 2, eyeR * 2);
    c.fillAndStroke();

    // Mouth: happy/sad are filled crescents (default mermaid fill = black,
    // stroke = #666 from .mouth CSS), neutral is a grey line
    c.setStrokeWidth(1 * s);
    c.setFillColor('#000000');

    if (smileyType === 'happy') {
      const mcx = cx;
      const mcy = cy + 2 * s;
      c.begin();
      c.moveTo(mcx + 7.5 * s, mcy);
      c.arcTo(7.5 * s, 7.5 * s, 0, 1, 1, mcx - 7.5 * s, mcy);
      c.lineTo(mcx - 6.818 * s, mcy);
      c.arcTo(6.818 * s, 6.818 * s, 0, 1, 0, mcx + 6.818 * s, mcy);
      c.close();
      c.fillAndStroke();
    } else if (smileyType === 'sad') {
      const mcx = cx;
      const mcy = cy + 7 * s;
      c.begin();
      c.moveTo(mcx - 7.5 * s, mcy);
      c.arcTo(7.5 * s, 7.5 * s, 0, 1, 1, mcx + 7.5 * s, mcy);
      c.lineTo(mcx + 6.818 * s, mcy);
      c.arcTo(6.818 * s, 6.818 * s, 0, 1, 0, mcx - 6.818 * s, mcy);
      c.close();
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(cx - 5 * s, cy + 7 * s);
      c.lineTo(cx + 5 * s, cy + 7 * s);
      c.stroke();
    }
  }
}
