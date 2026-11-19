/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2020-2025,
 * JGraph Holdings Ltd and Copyright (c) 2020-2025, draw.io AG, Apache
 * License 2.0: shapes/mxUML25.js — the UML 2.5 shapes (inputPin,
 * behaviorAction, action, actionParams) and their connection points.
 * Modified for DeckWerk: the painting code is unchanged; the style is read
 * through the typed helpers.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Style } from '../types.js';
import { Actor, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getFloat, getValue, truthy, type JsValue } from './util.js';

/**
 * The arc size of the UML 2.5 actions: `arcSize` (relative to the smaller
 * side unless absoluteArcSize) or 10 absolute if none is defined, clamped
 * to half the size.
 */
function actionArcSize(style: Style, arcSizeDefault: JsValue, w: number, h: number): number {
  let absArcSize: JsValue = getValue(style, 'absoluteArcSize', false);
  let arcSize = getFloat(style, 'arcSize', arcSizeDefault);

  // Uses the arc size of the shapes in the sidebar if none is defined
  if (isNaN(arcSize)) {
    arcSize = 10;
    absArcSize = true;
  }

  if (!truthy(absArcSize)) {
    arcSize = Math.min(w, h) * arcSize;
  }

  arcSize = Math.max(0, Math.min(arcSize, w * 0.5, h * 0.5));

  return arcSize;
}

// --- Input Pin ------------------------------------------------------------------------------

export class Uml25InputPin extends Actor {
  dx = 0.5;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    c.begin();
    c.moveTo(w * 0.75, h * 0.5);
    c.lineTo(w * 0.25, h * 0.5);
    c.moveTo(w * 0.4, h * 0.4);
    c.lineTo(w * 0.25, h * 0.5);
    c.lineTo(w * 0.4, h * 0.6);
    c.stroke();
  }
}

// --- Behavior Action ------------------------------------------------------------------------

export class Uml25BehaviorAction extends Actor {
  dx = 0.5;
  /** Not defined in draw.io (this.arcSize is undefined), so arcSize defaults to 10 absolute. */
  arcSize: number | undefined = undefined;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const rounded = getValue(this.style, 'rounded', false);
    let arcSize = actionArcSize(this.style, this.arcSize, w, h);

    if (!truthy(rounded)) {
      arcSize = 0;
    }

    c.begin();

    if (truthy(rounded)) {
      c.moveTo(0, arcSize);
      c.arcTo(arcSize, arcSize, 0, 0, 1, arcSize, 0);
      c.lineTo(w - arcSize, 0);
      c.arcTo(arcSize, arcSize, 0, 0, 1, w, arcSize);
      c.lineTo(w, h - arcSize);
      c.arcTo(arcSize, arcSize, 0, 0, 1, w - arcSize, h);
      c.lineTo(arcSize, h);
      c.arcTo(arcSize, arcSize, 0, 0, 1, 0, h - arcSize);
    } else {
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
    }

    c.close();
    c.fillAndStroke();

    c.setShadow(false);

    if (w >= 60 && h >= 40) {
      c.begin();
      c.moveTo(w - 60, h * 0.5 + 20);
      c.lineTo(w - 60, h * 0.5);
      c.lineTo(w - 20, h * 0.5);
      c.lineTo(w - 20, h * 0.5 + 20);
      c.moveTo(w - 40, h * 0.5 - 20);
      c.lineTo(w - 40, h * 0.5 + 20);
      c.stroke();
    }
  }

  // The side middles and the 45 degree points of the corners as painted
  override getConstraints(style: Style, w: number, h: number): ConnectionConstraint[] | null {
    const rounded = getValue(style, 'rounded', false);
    let arcSize = actionArcSize(style, this.arcSize, w, h);

    if (!truthy(rounded)) {
      arcSize = 0;
    }

    const k = arcSize * (1 - Math.SQRT1_2);

    return [constraint(0.5, 0, false),
      constraint(0.5, 1, false),
      constraint(0, 0.5, false),
      constraint(1, 0.5, false),
      constraint(0, 0, false, k, k),
      constraint(1, 0, false, -k, k),
      constraint(1, 1, false, -k, -k),
      constraint(0, 1, false, k, -k)];
  }
}

// --- Action ---------------------------------------------------------------------------------

export class Uml25Action extends Actor {
  dx = 0.5;
  /** Not defined in draw.io (this.arcSize is undefined), so arcSize defaults to 10 absolute. */
  arcSize: number | undefined = undefined;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const arcSize = actionArcSize(this.style, this.arcSize, w, h);

    c.begin();
    c.moveTo(0, arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, arcSize, 0);
    c.lineTo(w - arcSize - 10, 0);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w - 10, arcSize);
    c.lineTo(w - 10, h - arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w - arcSize - 10, h);
    c.lineTo(arcSize, h);
    c.arcTo(arcSize, arcSize, 0, 0, 1, 0, h - arcSize);
    c.close();
    c.fillAndStroke();

    c.rect(w - 10, h * 0.5 - 10, 10, 20);
    c.fillAndStroke();
  }

  // The end of the pin on the right (flipped shapes are mirrored by the graph),
  // the middles of the other sides of the body and the 45 degree points of its
  // corners. Positions that depend on the size are relative, so edges follow a
  // resize; only the 10 px pin and the absolute corners are offsets.
  override getConstraints(style: Style, w: number, h: number): ConnectionConstraint[] | null {
    const arcSize = actionArcSize(style, this.arcSize, w, h);
    const k = arcSize * (1 - Math.SQRT1_2);

    return [constraint(0.5, 0, false, -5, 0),
      constraint(0.5, 1, false, -5, 0),
      constraint(0, 0.5, false),
      constraint(1, 0.5, false),
      constraint(0, 0, false, k, k),
      constraint(1, 0, false, -10 - k, k),
      constraint(1, 1, false, -10 - k, -k),
      constraint(0, 1, false, k, -k)];
  }
}

// --- Action with parameters -----------------------------------------------------------------

export class Uml25ActionParams extends Actor {
  dx = 0.5;
  /** Not defined in draw.io (this.arcSize is undefined), so arcSize defaults to 10 absolute. */
  arcSize: number | undefined = undefined;
  override constraints: readonly ConnectionConstraint[] | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const arcSize = actionArcSize(this.style, this.arcSize, w, h);

    c.begin();
    c.moveTo(20, arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, 20 + arcSize, 0);
    c.lineTo(w - arcSize, 0);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w, arcSize);
    c.lineTo(w, h - arcSize);
    c.arcTo(arcSize, arcSize, 0, 0, 1, w - arcSize, h);
    c.lineTo(20 + arcSize, h);
    c.arcTo(arcSize, arcSize, 0, 0, 1, 20, h - arcSize);
    c.close();
    c.fillAndStroke();

    c.rect(5, h * 0.5 - 17, 20, 34);
    c.fillAndStroke();

    c.rect(0, h * 0.5 - 13, 10, 10);
    c.fillAndStroke();

    c.rect(0, h * 0.5 + 3, 10, 10);
    c.fillAndStroke();
  }

  // The two input pins on the left, the middles of the other sides of the body
  // (which starts behind the parameter box) and the 45 degree points of its
  // corners
  override getConstraints(style: Style, w: number, h: number): ConnectionConstraint[] | null {
    const arcSize = actionArcSize(style, this.arcSize, w, h);
    const k = arcSize * (1 - Math.SQRT1_2);

    return [constraint(0.5, 0, false, 10, 0),
      constraint(0.5, 1, false, 10, 0),
      constraint(1, 0.5, false),
      constraint(0, 0.5, false, 0, -8),
      constraint(0, 0.5, false, 0, 8),
      constraint(0, 0, false, 20 + k, k),
      constraint(1, 0, false, -k, k),
      constraint(1, 1, false, -k, -k),
      constraint(0, 1, false, 20 + k, -k)];
  }
}

/** The shapes in the order mxUML25.js registers them. */
export const UML25_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.uml25.inputPin', Uml25InputPin],
  ['mxgraph.uml25.behaviorAction', Uml25BehaviorAction],
  ['mxgraph.uml25.action', Uml25Action],
  ['mxgraph.uml25.actionParams', Uml25ActionParams],
];
