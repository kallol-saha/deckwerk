/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxElectrical.js — the transmission shapes (test point, straight
 * bus, bus elbows), the logic gate and buffer, the dual in-line and quad
 * flat package ICs with their pin labels, the mux/demux, the battery stack
 * and the signal sources, their connection points, and the list of every
 * shape the library registers (the electro-mechanical switches are in
 * mxElectrical2.ts).
 * Modified for DeckWerk: the handles (Graph.handleFactory) and the
 * customProperties tables are left out; the painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Style } from '../types.js';
import { ELECTRICAL_SWITCH_SHAPES } from './mxElectrical2.js';
import { Shape, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getFloat, getValue, looseEq, styleValue, truthy, type JsValue } from './util.js';

/** parseInt as JavaScript applies it to any value (ToString first, no radix). */
function jsParseInt(value: JsValue): number {
  return parseInt(String(value));
}

/** mxUtils.safeDecodeURIComponent: the decoded value, or the value if it is not a valid encoding. */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** `c.text(x, y, 0, 0, str, align, mxConstants.ALIGN_MIDDLE, 0, null, 0, 0, rotation)`: an unwrapped label at a point. */
function pointText(c: SvgCanvas, x: number, y: number, str: string, align: string, rotation = 0): void {
  c.text(x, y, 0, 0, str, align, 'middle', false, undefined, null, false, rotation);
}

const VERTICAL_CONSTRAINTS: readonly ConnectionConstraint[] = [constraint(0.5, 0, true), constraint(0.5, 1, true)];
const HORIZONTAL_CONSTRAINTS: readonly ConnectionConstraint[] = [constraint(0, 0.5, true), constraint(1, 0.5, true)];

// --- Test Point ---------------------------------------------------------------------------------

export class ElectricalTestPoint extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = VERTICAL_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');

    const size = Math.min(w, h);

    c.setFillColor(String(strokeColor));
    c.begin();
    c.ellipse(w * 0.5 - size / 2, 0, size, size);
    c.fillAndStroke();

    if (h > w) {
      c.begin();
      c.moveTo(w * 0.5, size);
      c.lineTo(w * 0.5, h);
      c.stroke();
    }
  }
}

// --- Straight Bus -------------------------------------------------------------------------------

export class ElectricalStraightBus extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = VERTICAL_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const x1 = w * 0.2;
    let y1 = 0;

    if (w > h) {
      y1 = h * 0.5;
    } else {
      y1 = w / 2;
    }

    c.begin();
    c.moveTo(w - x1, 0);
    c.lineTo(w - x1, h - y1);
    c.lineTo(w, h - y1);
    c.lineTo(w * 0.5, h);
    c.lineTo(0, h - y1);
    c.lineTo(x1, h - y1);
    c.lineTo(x1, 0);
    c.fillAndStroke();
  }
}

// --- Two-Line Bus Elbow -------------------------------------------------------------------------

export class ElectricalTwoLineBusElbow extends Shape {
  notch = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.stroke();

    const wn = Math.min(w, notch);
    const hn = Math.min(h, notch);

    c.begin();
    c.moveTo(0, h - hn);
    c.lineTo(w - wn, h - hn);
    c.lineTo(w - wn, 0);
    c.stroke();
  }
}

// --- Three-Line Bus Elbow -----------------------------------------------------------------------

export class ElectricalThreeLineBusElbow extends Shape {
  notch = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.stroke();

    const wn = Math.min(w, notch);
    const hn = Math.min(h, notch);

    c.begin();
    c.moveTo(0, h - hn);
    c.lineTo(w - wn, h - hn);
    c.lineTo(w - wn, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn / 2);
    c.lineTo(w - wn / 2, h - hn / 2);
    c.lineTo(w - wn / 2, 0);
    c.stroke();
  }
}

// --- Four-Line Bus Elbow ------------------------------------------------------------------------

export class ElectricalFourLineBusElbow extends Shape {
  notch = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.stroke();

    const wn = Math.min(w, notch);
    const hn = Math.min(h, notch);

    c.begin();
    c.moveTo(0, h - hn);
    c.lineTo(w - wn, h - hn);
    c.lineTo(w - wn, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn / 3);
    c.lineTo(w - wn / 3, h - hn / 3);
    c.lineTo(w - wn / 3, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 2 / 3);
    c.lineTo(w - wn * 2 / 3, h - hn * 2 / 3);
    c.lineTo(w - wn * 2 / 3, 0);
    c.stroke();
  }
}

// --- Eight-Line Bus Elbow -----------------------------------------------------------------------

export class ElectricalEightLineBusElbow extends Shape {
  notch = 0;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const notch = Math.max(0, Math.min(w, getFloat(this.style, 'notch', this.notch)));

    c.translate(x, y);

    c.begin();
    c.moveTo(0, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.stroke();

    const wn = Math.min(w, notch);
    const hn = Math.min(h, notch);

    c.begin();
    c.moveTo(0, h - hn);
    c.lineTo(w - wn, h - hn);
    c.lineTo(w - wn, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn / 7);
    c.lineTo(w - wn / 7, h - hn / 7);
    c.lineTo(w - wn / 7, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 2 / 7);
    c.lineTo(w - wn * 2 / 7, h - hn * 2 / 7);
    c.lineTo(w - wn * 2 / 7, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 3 / 7);
    c.lineTo(w - wn * 3 / 7, h - hn * 3 / 7);
    c.lineTo(w - wn * 3 / 7, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 4 / 7);
    c.lineTo(w - wn * 4 / 7, h - hn * 4 / 7);
    c.lineTo(w - wn * 4 / 7, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 5 / 7);
    c.lineTo(w - wn * 5 / 7, h - hn * 5 / 7);
    c.lineTo(w - wn * 5 / 7, 0);
    c.stroke();

    c.begin();
    c.moveTo(0, h - hn * 6 / 7);
    c.lineTo(w - wn * 6 / 7, h - hn * 6 / 7);
    c.lineTo(w - wn * 6 / 7, 0);
    c.stroke();
  }
}

// --- Logic Gate ---------------------------------------------------------------------------------

export class ElectricalLogicGate extends Shape {
  /** Maximum number of inputs. Default is 1000. */
  maxInputs = 1000;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const numInputs = Math.min(jsParseInt(getValue(this.style, 'numInputs', '2')), this.maxInputs);
    const spacing = h / numInputs;
    let currH = spacing * 0.5;

    c.begin();
    c.moveTo(w * 0.8, h * 0.5);
    c.lineTo(w, h * 0.5);

    const operation = getValue(this.style, 'operation', 'and');

    for (let i = 0; i < numInputs; i++) {
      c.moveTo(0, currH);

      if (looseEq(operation, 'and')) {
        c.lineTo(w * 0.2, currH);
      } else {
        c.lineTo(w * 0.23, currH);
      }

      currH = currH + spacing;
    }

    c.stroke();

    // switch (operation): xor paints its arc and falls through to or
    if (operation === 'xor') {
      c.begin();
      c.moveTo(w * 0.1, 0);
      c.arcTo(w * 0.6, h, 0, 0, 1, w * 0.1, h);
      c.stroke();
      // no break operation needed, XOR needs to draw an OR shape too
    }

    if (operation === 'xor' || operation === 'or') {
      c.begin();
      c.moveTo(w * 0.4, 0);
      c.arcTo(w * 0.45, h * 0.83, 0, 0, 1, w * 0.8, h * 0.5);
      c.arcTo(w * 0.45, h * 0.83, 0, 0, 1, w * 0.4, h);
      c.lineTo(w * 0.15, h);
      c.arcTo(w * 0.6, h, 0, 0, 0, w * 0.15, 0);
      c.close();
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(w * 0.2, 0);
      c.lineTo(w * 0.5, 0);
      c.arcTo(w * 0.3, h * 0.5, 0, 0, 1, w * 0.5, h);
      c.lineTo(w * 0.2, h);
      c.close();
      c.fillAndStroke();
    }

    const negating = getValue(this.style, 'negating', '0');

    if (looseEq(negating, '1')) {
      let negSize: number;

      if (truthy(styleValue(this.style, 'negSize'))) {
        const tmpSize = getFloat(this.style, 'negSize', '0.13');
        negSize = Math.min(w * tmpSize * 0.5, h * tmpSize);
      } else {
        negSize = Math.min(w * 0.04, h * 0.07);
      }

      c.begin();
      c.ellipse(w * 0.8, h * 0.5 - negSize * 0.5, negSize, negSize);
      c.fillAndStroke();
    }
  }

  override getConstraints(style: Style): ConnectionConstraint[] {
    const constr = [constraint(1, 0.5, false)];

    const numInputs = Math.min(jsParseInt(getValue(style, 'numInputs', '2')), this.maxInputs);
    const spacing = 1 / numInputs;
    let currH = spacing * 0.5;

    for (let i = 0; i < numInputs; i++) {
      constr.push(constraint(0, currH, false));
      currH = currH + spacing;
    }

    return constr;
  }
}

// --- Buffer -------------------------------------------------------------------------------------

export class ElectricalBuffer extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = HORIZONTAL_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(0, h * 0.5);
    c.lineTo(w * 0.2, h * 0.5);
    c.moveTo(w * 0.8, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.stroke();

    c.begin();
    c.moveTo(w * 0.2, 0);
    c.lineTo(w * 0.8, h * 0.5);
    c.lineTo(w * 0.2, h);
    c.close();
    c.fillAndStroke();

    const negating = getValue(this.style, 'negating', '0');

    if (looseEq(negating, '1')) {
      const negSize = Math.min(w * 0.04, h * 0.07);
      c.begin();
      c.ellipse(w * 0.8, h * 0.5 - negSize * 0.5, negSize, negSize);
      c.fillAndStroke();
    }
  }
}

// --- Dual In-Line IC ----------------------------------------------------------------------------

/**
 * Returns the custom label of the pin with the given index or an empty
 * string if there is none (e.g. for the negative pin numbers of a negative
 * pinSpacing).
 */
function getPinLabel(labelNames: string[], index: number): string {
  return labelNames[index] != null ? labelNames[index].toString() : '';
}

export class ElectricalDualInLineIC extends Shape {
  /** Maximum number of pins per side. Default is 1000. */
  maxPins = 1000;

  getPinLabel(labelNames: string[], index: number): string {
    return getPinLabel(labelNames, index);
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const fontColor = getValue(this.style, 'fontColor', '#000000');
    c.setFontColor(String(fontColor));
    const startPin = getValue(this.style, 'startPin', 'n');
    const pinLabelType = getValue(this.style, 'pinLabelType', 'gen');
    const labelNames = safeDecodeURIComponent(String(getValue(this.style, 'labelNames', ''))).split(',');

    c.begin();

    if (looseEq(startPin, 'n') || looseEq(startPin, 's')) {
      c.rect(10, 0, w - 20, h);
    } else {
      c.rect(0, 10, w, h - 20);
    }

    c.fillAndStroke();

    const pinSpacing = getFloat(this.style, 'pinSpacing', '20');
    const pinStyle = getValue(this.style, 'pinStyle', 'line');
    const fontSize = getFloat(this.style, 'fontSize', '12');
    let pinsOne: number;

    if (looseEq(startPin, 'n') || looseEq(startPin, 's')) {
      pinsOne = jsParseInt(h / pinSpacing);
    } else {
      pinsOne = jsParseInt(w / pinSpacing);
    }

    if (looseEq(pinStyle, 'line')) {
      c.setFontSize(fontSize * 0.8);
      let pinCount = 1;
      let currH = pinSpacing * 0.5;

      c.begin();

      if (looseEq(startPin, 'n') || looseEq(startPin, 's')) {
        while (pinCount * pinSpacing <= h && pinCount <= this.maxPins) {
          c.moveTo(0, currH);
          c.lineTo(10, currH);
          c.moveTo(w - 10, currH);
          c.lineTo(w, currH);

          const currPinNum = looseEq(startPin, 'n') ? pinCount : pinsOne + pinCount;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, 20, currH, currPinNum.toString(), 'left');
          } else if (currPinNum - 1 < labelNames.length) {
            pointText(c, 20, currH, this.getPinLabel(labelNames, currPinNum - 1), 'left');
          }

          const pc2 = looseEq(startPin, 'n') ? 2 * pinsOne - pinCount + 1 : pinsOne - pinCount + 1;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, w - 20, currH, pc2.toString(), 'right');
          } else if (pc2 - 1 < labelNames.length) {
            pointText(c, w - 20, currH, this.getPinLabel(labelNames, pc2 - 1), 'right');
          }

          currH = currH + pinSpacing;
          pinCount++;
        }
      } else {
        while (pinCount * pinSpacing <= w && pinCount <= this.maxPins) {
          c.moveTo(currH, 0);
          c.lineTo(currH, 10);
          c.moveTo(currH, h - 10);
          c.lineTo(currH, h);

          const currPinNum = looseEq(startPin, 'e') ? pinsOne - pinCount + 1 : 2 * pinsOne - pinCount + 1;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, currH, 20, currPinNum.toString(), 'center');
          } else if (currPinNum - 1 < labelNames.length) {
            pointText(c, currH, 20, this.getPinLabel(labelNames, currPinNum - 1), 'center');
          }

          const pc2 = looseEq(startPin, 'e') ? pinsOne + pinCount : pinCount;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, currH, h - 20, pc2.toString(), 'center');
          } else if (pc2 - 1 < labelNames.length) {
            pointText(c, currH, h - 20, this.getPinLabel(labelNames, pc2 - 1), 'center');
          }

          currH = currH + pinSpacing;
          pinCount++;
        }
      }

      c.stroke();
    } else {
      c.setFontSize(fontSize * 0.5);
      let pinCount = 1;
      let currH = pinSpacing * 0.5;

      if (looseEq(startPin, 'n') || looseEq(startPin, 's')) {
        while (pinCount * pinSpacing <= h && pinCount <= this.maxPins) {
          c.begin();
          c.rect(0, currH - pinSpacing * 0.25, 10, pinSpacing * 0.5);
          c.fillAndStroke();

          c.begin();
          c.rect(w - 10, currH - pinSpacing * 0.25, 10, pinSpacing * 0.5);
          c.fillAndStroke();

          const currPinNum = looseEq(startPin, 'n') ? pinCount : pinsOne + pinCount;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, 5, currH + 1, currPinNum.toString(), 'center');
          } else if (currPinNum - 1 < labelNames.length) {
            pointText(c, 5, currH + 1, this.getPinLabel(labelNames, currPinNum - 1), 'center');
          }

          const pc2 = looseEq(startPin, 'n') ? 2 * pinsOne - pinCount + 1 : pinsOne - pinCount + 1;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, w - 5, currH + 1, pc2.toString(), 'center');
          } else if (pc2 - 1 < labelNames.length) {
            pointText(c, w - 5, currH + 1, this.getPinLabel(labelNames, pc2 - 1), 'center');
          }

          currH = currH + pinSpacing;
          pinCount++;
        }
      } else {
        while (pinCount * pinSpacing <= w && pinCount <= this.maxPins) {
          c.begin();
          c.rect(currH - pinSpacing * 0.25, 0, pinSpacing * 0.5, 10);
          c.fillAndStroke();

          c.begin();
          c.rect(currH - pinSpacing * 0.25, h - 10, pinSpacing * 0.5, 10);
          c.fillAndStroke();

          const currPinNum = looseEq(startPin, 'e') ? pinsOne - pinCount + 1 : 2 * pinsOne - pinCount + 1;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, currH, 5, currPinNum.toString(), 'center');
          } else if (currPinNum - 1 < labelNames.length) {
            pointText(c, currH, 5, this.getPinLabel(labelNames, currPinNum - 1), 'center');
          }

          const pc2 = looseEq(startPin, 'e') ? pinsOne + pinCount : pinCount;

          if (looseEq(pinLabelType, 'gen')) {
            pointText(c, currH, h - 5, pc2.toString(), 'center');
          } else if (pc2 - 1 < labelNames.length) {
            pointText(c, currH, h - 5, this.getPinLabel(labelNames, pc2 - 1), 'center');
          }

          currH = currH + pinSpacing;
          pinCount++;
        }
      }
    }

    c.setShadow(false);

    c.begin();

    switch (startPin) {
      case 'e':
        if (h > 40) {
          c.moveTo(w, h * 0.5 - 10);
          c.arcTo(12, 12, 0, 0, 0, w, h * 0.5 + 10);
        }
        break;
      case 's':
        if (w > 40) {
          c.moveTo(w * 0.5 - 10, h);
          c.arcTo(12, 12, 0, 0, 1, w * 0.5 + 10, h);
        }
        break;
      case 'w':
        if (h > 40) {
          c.moveTo(0, h * 0.5 - 10);
          c.arcTo(12, 12, 0, 0, 1, 0, h * 0.5 + 10);
        }
        break;
      default:
        if (w > 40) {
          c.moveTo(w * 0.5 - 10, 0);
          c.arcTo(12, 12, 0, 0, 0, w * 0.5 + 10, 0);
        }
    }

    c.stroke();
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    const pinSpacing = getFloat(this.style, 'pinSpacing', '20');
    const startPin = getValue(this.style, 'startPin', 'n');
    let pinCount = 1;
    let currH = pinSpacing * 0.5;
    // (draw.io also computes pinsOne = parseInt(h / pinSpacing) here, unused)

    if (looseEq(startPin, 'n') || looseEq(startPin, 's')) {
      while (pinCount * pinSpacing <= h && pinCount <= this.maxPins) {
        constr.push(constraint(0, 0, false, 0, currH));
        constr.push(constraint(1, 0, false, 0, currH));
        currH = currH + pinSpacing;
        pinCount++;
      }
    } else {
      while (pinCount * pinSpacing <= w && pinCount <= this.maxPins) {
        constr.push(constraint(0, 0, false, currH, 0));
        constr.push(constraint(0, 1, false, currH, 0));
        currH = currH + pinSpacing;
        pinCount++;
      }
    }

    return constr;
  }
}

// --- Quad Flat Package IC -----------------------------------------------------------------------

export class ElectricalQFPIC extends Shape {
  /** Maximum number of pins per side. Default is 1000. */
  maxPins = 1000;

  getPinLabel(labelNames: string[], index: number): string {
    return getPinLabel(labelNames, index);
  }

  /** The number of a west pin (the `//west pins` switch). */
  private westPinNum(startPin: JsValue, pinCount: number, pinsVOne: number, pinsHOne: number): number {
    switch (startPin) {
      case 'nw':
        return pinCount;
      case 'ne':
        return pinsHOne + pinCount;
      case 'se':
        return pinsVOne + pinsHOne + pinCount;
      default:
        return pinsVOne + 2 * pinsHOne + pinCount;
    }
  }

  /** The number of an east pin (the `//east pins` switch). */
  private eastPinNum(startPin: JsValue, pinCount: number, pinsVOne: number, pinsHOne: number): number {
    switch (startPin) {
      case 'nw':
        return pinsHOne + 2 * pinsVOne - pinCount + 1;
      case 'ne':
        return 2 * pinsHOne + 2 * pinsVOne - pinCount + 1;
      case 'se':
        return pinsVOne - pinCount + 1;
      default:
        return pinsHOne + pinsVOne - pinCount + 1;
    }
  }

  /** The number of a south pin (the `//south pins` switch). */
  private southPinNum(startPin: JsValue, pinCount: number, pinsVOne: number, pinsHOne: number): number {
    switch (startPin) {
      case 'nw':
        return pinsVOne + pinCount;
      case 'ne':
        return pinsVOne + pinsHOne + pinCount;
      case 'se':
        return 2 * pinsVOne + pinsHOne + pinCount;
      default:
        return pinCount;
    }
  }

  /** The number of a north pin (the `//north pins` switch). */
  private northPinNum(startPin: JsValue, pinCount: number, pinsVOne: number, pinsHOne: number): number {
    switch (startPin) {
      case 'nw':
        return 2 * pinsHOne + 2 * pinsVOne - pinCount + 1;
      case 'ne':
        return pinsHOne - pinCount + 1;
      case 'se':
        return pinsHOne + pinsVOne - pinCount + 1;
      default:
        return 2 * pinsHOne + pinsVOne - pinCount + 1;
    }
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    c.begin();
    c.moveTo(15, 10);
    c.lineTo(w - 15, 10);
    c.lineTo(w - 10, 15);
    c.lineTo(w - 10, h - 15);
    c.lineTo(w - 15, h - 10);
    c.lineTo(15, h - 10);
    c.lineTo(10, h - 15);
    c.lineTo(10, 15);
    c.close();
    c.fillAndStroke();

    const pinSpacing = getFloat(this.style, 'pinSpacing', '20');
    const pinStyle = getValue(this.style, 'pinStyle', 'line');
    const pinLabelType = getValue(this.style, 'pinLabelType', 'gen');
    const labelNames = safeDecodeURIComponent(String(getValue(this.style, 'labelNames', ''))).split(',');
    const fontSize = getFloat(this.style, 'fontSize', '12');
    const fontColor = getValue(this.style, 'fontColor', '#000000');
    c.setFontColor(String(fontColor));
    const startPin = getValue(this.style, 'startPin', 'sw');

    if (looseEq(pinStyle, 'line')) {
      c.setFontSize(fontSize * 0.8);
      let pinCount = 1;
      let currH = pinSpacing * 0.5 + 20;

      c.begin();

      const pinsVOne = jsParseInt((h - pinSpacing - 40) / pinSpacing) + 1;
      const pinsHOne = jsParseInt((w - pinSpacing - 40) / pinSpacing) + 1;

      while (currH <= h - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
        c.moveTo(0, currH);
        c.lineTo(10, currH);
        c.moveTo(w - 10, currH);
        c.lineTo(w, currH);

        //west pins
        const currPinNum = this.westPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, 20, currH, currPinNum.toString(), 'center');
        } else if (currPinNum - 1 < labelNames.length) {
          pointText(c, 20, currH, this.getPinLabel(labelNames, currPinNum - 1), 'center');
        }

        //east pins
        const pc2 = this.eastPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, w - 20, currH, pc2.toString(), 'center');
        } else if (pc2 - 1 < labelNames.length) {
          pointText(c, w - 20, currH, this.getPinLabel(labelNames, pc2 - 1), 'center');
        }

        currH = currH + pinSpacing;
        pinCount++;
      }

      pinCount = 1;
      currH = pinSpacing * 0.5 + 20;

      while (currH <= w - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
        c.moveTo(currH, 0);
        c.lineTo(currH, 10);
        c.moveTo(currH, h - 10);
        c.lineTo(currH, h);

        //south pins
        const currPinNum = this.southPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, currH, h - 20, currPinNum.toString(), 'center');
        } else if (currPinNum - 1 < labelNames.length) {
          pointText(c, currH, h - 20, this.getPinLabel(labelNames, currPinNum - 1), 'center');
        }

        //north pins
        const pc2 = this.northPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, currH, 20, pc2.toString(), 'center');
        } else if (pc2 - 1 < labelNames.length) {
          pointText(c, currH, 20, this.getPinLabel(labelNames, pc2 - 1), 'center');
        }

        currH = currH + pinSpacing;
        pinCount++;
      }

      c.stroke();
    } else {
      c.setFontSize(fontSize * 0.5);
      let pinCount = 1;
      let currH = pinSpacing * 0.5 + 20;
      const pinsVOne = jsParseInt((h - pinSpacing - 40) / pinSpacing) + 1;
      const pinsHOne = jsParseInt((w - pinSpacing - 40) / pinSpacing) + 1;

      while (currH <= h - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
        c.begin();
        c.rect(0, currH - pinSpacing * 0.25, 10, pinSpacing * 0.5);
        c.fillAndStroke();

        c.begin();
        c.rect(w - 10, currH - pinSpacing * 0.25, 10, pinSpacing * 0.5);
        c.fillAndStroke();

        //west pins
        const currPinNum = this.westPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, 5, currH + 1, currPinNum.toString(), 'center');
        } else if (currPinNum - 1 < labelNames.length) {
          pointText(c, 5, currH + 1, this.getPinLabel(labelNames, currPinNum - 1), 'center');
        }

        //east pins
        const pc2 = this.eastPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, w - 5, currH + 1, pc2.toString(), 'center');
        } else if (pc2 - 1 < labelNames.length) {
          pointText(c, w - 5, currH + 1, this.getPinLabel(labelNames, pc2 - 1), 'center');
        }

        currH = currH + pinSpacing;
        pinCount++;
      }

      pinCount = 1;
      currH = pinSpacing * 0.5 + 20;

      while (currH <= w - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
        c.begin();
        c.rect(currH - pinSpacing * 0.25, 0, pinSpacing * 0.5, 10);
        c.fillAndStroke();

        c.begin();
        c.rect(currH - pinSpacing * 0.25, h - 10, pinSpacing * 0.5, 10);
        c.fillAndStroke();

        //south pins
        const currPinNum = this.southPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, currH, h - 4, currPinNum.toString(), 'center');
        } else if (currPinNum - 1 < labelNames.length) {
          pointText(c, currH, h - 4, this.getPinLabel(labelNames, currPinNum - 1), 'center');
        }

        //north pins
        const pc2 = this.northPinNum(startPin, pinCount, pinsVOne, pinsHOne);

        if (looseEq(pinLabelType, 'gen')) {
          pointText(c, currH, 6, pc2.toString(), 'center');
        } else if (pc2 - 1 < labelNames.length) {
          pointText(c, currH, 6, this.getPinLabel(labelNames, pc2 - 1), 'center');
        }

        currH = currH + pinSpacing;
        pinCount++;
      }
    }

    c.setShadow(false);

    if (w > 40) {
      c.setFillColor(String(getValue(this.style, 'strokeColor', '#000000')));

      c.begin();

      switch (startPin) {
        case 'nw':
          c.ellipse(15, 15, 10, 10);
          break;
        case 'ne':
          c.ellipse(w - 25, 15, 10, 10);
          break;
        case 'se':
          c.ellipse(w - 25, h - 25, 10, 10);
          break;
        default:
          c.ellipse(15, h - 25, 10, 10);
      }

      c.fillAndStroke();
    }
  }

  override getConstraints(_style: Style, w: number, h: number): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];

    const pinSpacing = getFloat(this.style, 'pinSpacing', '20');
    let pinCount = 1;
    let currH = pinSpacing * 0.5 + 20;

    while (currH <= h - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
      constr.push(constraint(0, 0, false, 0, currH));
      constr.push(constraint(1, 0, false, 0, currH));
      currH = currH + pinSpacing;
      pinCount++;
    }

    pinCount = 1;
    currH = pinSpacing * 0.5 + 20;

    while (currH <= w - pinSpacing * 0.5 - 20 && pinCount <= this.maxPins) {
      constr.push(constraint(0, 0, false, currH, 0));
      constr.push(constraint(0, 1, false, currH, 0));
      currH = currH + pinSpacing;
      pinCount++;
    }

    return constr;
  }
}

// --- Mux ----------------------------------------------------------------------------------------

export class ElectricalMux extends Shape {
  /** Maximum number of selector pins (2^n inputs or outputs). Default is 10. */
  maxSelectorPins = 10;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const selectorPins = Math.min(jsParseInt(getValue(this.style, 'selectorPins', '1')), this.maxSelectorPins);
    const operation = getValue(this.style, 'operation', 'mux');
    const fontSize = getFloat(this.style, 'fontSize', '12');
    c.setFontSize(fontSize * 0.5);
    const fontColor = getValue(this.style, 'fontColor', '#000000');
    c.setFontColor(String(fontColor));
    const dir = getValue(this.style, 'direction', 'east');
    let txtRot = 0;

    switch (dir) {
      case 'south':
        txtRot = 270;
        break;
      case 'west':
        txtRot = 180;
        break;
      case 'north':
        txtRot = 90;
        break;
    }

    switch (operation) {
      case 'demux':
        c.begin();
        c.moveTo(w - 10, 0);
        c.lineTo(10, h * 0.1);
        c.lineTo(10, h * 0.9 - 10);
        c.lineTo(w - 10, h - 10);
        c.close();
        c.fillAndStroke();
        break;
      default:
        c.begin();
        c.moveTo(10, 0);
        c.lineTo(w - 10, h * 0.1);
        c.lineTo(w - 10, h * 0.9 - 10);
        c.lineTo(10, h - 10);
        c.close();
        c.fillAndStroke();
    }

    let numInputs = 1;
    let numOutputs = 1;
    let spacing: number;

    if (looseEq(operation, 'mux')) {
      numInputs = Math.pow(2, selectorPins);
      spacing = (h - 16) / numInputs;
    } else {
      numOutputs = Math.pow(2, selectorPins);
      spacing = (h - 16) / numOutputs;
    }

    let currH = 3 + spacing * 0.5;

    c.begin();

    if (numInputs === 1) {
      c.moveTo(0, (h - 10) * 0.5);
      c.lineTo(10, (h - 10) * 0.5);
    } else {
      for (let i = 0; i < numInputs; i++) {
        c.moveTo(0, currH);
        c.lineTo(10, currH);
        pointText(c, 14, currH + 1, '' + i.toString(), 'center', txtRot);
        currH = currH + spacing;
      }
    }

    if (numOutputs === 1) {
      c.moveTo(w - 10, (h - 10) * 0.5);
      c.lineTo(w, (h - 10) * 0.5);
    } else {
      for (let i = 0; i < numOutputs; i++) {
        c.moveTo(w - 10, currH);
        c.lineTo(w, currH);
        pointText(c, w - 14, currH + 1, '' + i.toString(), 'center', txtRot);
        currH = currH + spacing;
      }
    }

    spacing = (w - 20) / selectorPins;
    let currW = 10 + spacing * 0.5;

    for (let i = 0; i < selectorPins; i++) {
      if (looseEq(operation, 'mux')) {
        c.moveTo(currW, h - 10 - (currW - 10) / (w - 20) * h * 0.1);
      } else {
        c.moveTo(currW, h - 10 - (w - currW - 10) / (w - 20) * h * 0.1);
      }

      c.lineTo(currW, h);

      pointText(c, currW + 5, h - 4, 'S' + (selectorPins - i - 1).toString(), 'center', txtRot);
      currW = currW + spacing;
    }

    c.stroke();
  }

  override getConstraints(): ConnectionConstraint[] {
    const constr: ConnectionConstraint[] = [];
    const selectorPins = Math.min(jsParseInt(getValue(this.style, 'selectorPins', '1')), this.maxSelectorPins);
    const operation = getValue(this.style, 'operation', 'mux');

    let numInputs = 1;
    let numOutputs = 1;

    if (looseEq(operation, 'mux')) {
      numInputs = Math.pow(2, selectorPins);
    } else {
      numOutputs = Math.pow(2, selectorPins);
    }

    // Pin i of n is painted at 3 + (h - 16) * (i + 0.5) / n and selector pin i
    // at 10 + (w - 20) * (i + 0.5) / n: relative points with the fixed margins
    // as offsets, so edges follow a resize
    if (numInputs === 1) {
      constr.push(constraint(0, 0.5, false, 0, -5));
    } else {
      for (let i = 0; i < numInputs; i++) {
        const f = (i + 0.5) / numInputs;
        constr.push(constraint(0, f, false, 0, 3 - 16 * f));
      }
    }

    if (numOutputs === 1) {
      constr.push(constraint(1, 0.5, false, 0, -5));
    } else {
      for (let i = 0; i < numOutputs; i++) {
        const f = (i + 0.5) / numOutputs;
        constr.push(constraint(1, f, false, 0, 3 - 16 * f));
      }
    }

    for (let i = 0; i < selectorPins; i++) {
      const f = (i + 0.5) / selectorPins;
      constr.push(constraint(f, 1, false, 10 - 20 * f, 0));
    }

    return constr;
  }
}

// --- Battery stack ------------------------------------------------------------------------------

export class ElectricalBatteryStack extends Shape {
  /** Maximum number of painted cells. Default is 1000. */
  maxCells = 1000;
  override constraints: readonly ConnectionConstraint[] | null = HORIZONTAL_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const bw = h * 0.3;
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');
    const dashed = getValue(this.style, 'dashed', '0');

    // Limits the number of cells for tiny heights and huge widths
    const bNum = Math.min(Math.floor((w - 20) / bw), this.maxCells);
    const startX = (w - bNum * bw) * 0.5;

    if (bNum > 0) {
      c.begin();
      c.moveTo(0, h * 0.5);
      c.lineTo(startX + bw * 0.2, h * 0.5);
      c.moveTo(w - startX - bw * 0.2, h * 0.5);
      c.lineTo(w, h * 0.5);
      c.stroke();

      let currX = startX;
      c.setFillColor(String(strokeColor));

      for (let i = 0; i < bNum; i++) {
        c.rect(currX + bw * 0.2, h * 0.25, bw * 0.2, h * 0.5);
        c.fillAndStroke();

        c.begin();
        c.moveTo(currX + bw * 0.8, 0);
        c.lineTo(currX + bw * 0.8, h);
        c.stroke();

        if (i > 0) {
          // setDashed('1') and setDashed(dashed): the canvas tests the stored
          // value for truthiness, so the default '0' (a string) is dashed too
          c.setDashed(true);
          c.begin();
          c.moveTo(currX - bw * 0.2, h * 0.5);
          c.lineTo(currX + bw * 0.2, h * 0.5);
          c.stroke();
          c.setDashed(truthy(dashed));
        }

        currX = currX + bw;
      }
    }
  }
}

// --- DC Source 3 v2 -----------------------------------------------------------------------------

export class ElectricalDCSource3V2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = VERTICAL_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const ss = Math.max(3, Math.min(h, w) * 0.05); // half of symbol size
    const i = 3; //indent
    c.ellipse(0, 0, w, h);
    c.fillAndStroke();

    c.begin();
    c.moveTo(w * 0.5 - ss, h * 0.05 + i);
    c.lineTo(w * 0.5 + ss, h * 0.05 + i);
    c.moveTo(w * 0.5, h * 0.05 - ss + i);
    c.lineTo(w * 0.5, h * 0.05 + ss + i);
    c.moveTo(w * 0.5 - ss, h * 0.95 - i);
    c.lineTo(w * 0.5 + ss, h * 0.95 - i);
    c.stroke();
  }
}

// --- Source -------------------------------------------------------------------------------------

export class ElectricalSource extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const sourceType = getValue(this.style, 'elSourceType', 'independent');
    const signalType = getValue(this.style, 'elSignalType', 'none');

    switch (sourceType) {
      case 'independent':
        c.ellipse(0, 0, w, h);
        c.fillAndStroke();
        break;
      case 'dependent':
        c.begin();
        c.moveTo(0, h * 0.5);
        c.lineTo(w * 0.5, 0);
        c.lineTo(w, h * 0.5);
        c.lineTo(w * 0.5, h);
        c.lineTo(0, h * 0.5);
        c.close();
        c.fillAndStroke();
        break;
    }

    switch (signalType) {
      case 'ac':
        c.begin();
        c.moveTo(w * 0.3, h * 0.5);
        c.quadTo(w * 0.34, h * 0.35, w * 0.4, h * 0.35);
        c.quadTo(w * 0.46, h * 0.35, w * 0.5, h * 0.5);
        c.quadTo(w * 0.53, h * 0.65, w * 0.6, h * 0.65);
        c.quadTo(w * 0.66, h * 0.65, w * 0.7, h * 0.5);
        c.stroke();
        break;
      case 'square':
        c.begin();
        c.moveTo(w * 0.3, h * 0.5);
        c.lineTo(w * 0.3, h * 0.35);
        c.lineTo(w * 0.5, h * 0.35);
        c.lineTo(w * 0.5, h * 0.65);
        c.lineTo(w * 0.7, h * 0.65);
        c.lineTo(w * 0.7, h * 0.5);
        c.stroke();
        break;
      case 'triangular':
        c.begin();
        c.moveTo(w * 0.3, h * 0.65);
        c.lineTo(w * 0.4, h * 0.35);
        c.lineTo(w * 0.5, h * 0.65);
        c.lineTo(w * 0.6, h * 0.35);
        c.lineTo(w * 0.7, h * 0.65);
        c.stroke();
        break;
      case 'sawtooth':
        c.begin();
        c.moveTo(w * 0.24, h * 0.65);
        c.lineTo(w * 0.42, h * 0.35);
        c.lineTo(w * 0.42, h * 0.65);
        c.lineTo(w * 0.58, h * 0.35);
        c.lineTo(w * 0.58, h * 0.65);
        c.lineTo(w * 0.76, h * 0.35);
        c.lineTo(w * 0.76, h * 0.65);
        c.stroke();
        break;
      case 'noise':
        c.begin();
        c.moveTo(w * 0.5, h * 0.17);
        c.lineTo(w * 0.5, h * 0.5);
        c.moveTo(w * 0.18, h * 0.42);
        c.lineTo(w * 0.5, h * 0.5);
        c.moveTo(w * 0.32, h * 0.78);
        c.lineTo(w * 0.5, h * 0.5);
        c.moveTo(w * 0.82, h * 0.42);
        c.lineTo(w * 0.5, h * 0.5);
        c.moveTo(w * 0.68, h * 0.78);
        c.lineTo(w * 0.5, h * 0.5);
        c.stroke();
        break;
      case 'ideal':
        c.begin();
        c.moveTo(0, h * 0.5);
        c.lineTo(w, h * 0.5);
        c.stroke();
        break;
      case 'expSquib': {
        c.ellipse(0, h * 0.43, w * 0.14, h * 0.14);
        c.stroke();
        c.ellipse(w * 0.86, h * 0.43, w * 0.14, h * 0.14);
        c.stroke();
        c.begin();
        c.moveTo(w * 0.83, h * 0.63);
        c.lineTo(w * 0.73, h * 0.73);
        c.lineTo(w * 0.27, h * 0.27);
        c.lineTo(w * 0.17, h * 0.37);
        c.stroke();
        c.begin();

        const strokeColor = getValue(this.style, 'strokeColor', '#000000');
        c.setFillColor(String(strokeColor));

        c.moveTo(w * 0.2, h * 0.25);
        c.lineTo(w * 0.13, h * 0.4);
        c.lineTo(w * 0.28, h * 0.33);
        c.close();
        c.fillAndStroke();
        break;
      }
      case 'pulse':
        c.begin();
        c.moveTo(w * 0.3, h * 0.65);
        c.lineTo(w * 0.4, h * 0.65);
        c.lineTo(w * 0.4, h * 0.35);
        c.lineTo(w * 0.6, h * 0.35);
        c.lineTo(w * 0.6, h * 0.65);
        c.lineTo(w * 0.7, h * 0.65);
        c.stroke();
        break;
      case 'invPulse':
        c.begin();
        c.moveTo(w * 0.3, h * 0.35);
        c.lineTo(w * 0.4, h * 0.35);
        c.lineTo(w * 0.4, h * 0.65);
        c.lineTo(w * 0.6, h * 0.65);
        c.lineTo(w * 0.6, h * 0.35);
        c.lineTo(w * 0.7, h * 0.35);
        c.stroke();
        break;
      case 'chopSquare':
        c.begin();
        c.moveTo(w * 0.3, h * 0.5);
        c.lineTo(w * 0.33, h * 0.35);
        c.lineTo(w * 0.47, h * 0.35);
        c.lineTo(w * 0.53, h * 0.65);
        c.lineTo(w * 0.67, h * 0.65);
        c.lineTo(w * 0.7, h * 0.5);
        c.stroke();
        break;
      case 'stepOn':
        c.begin();
        c.moveTo(w * 0.3, h * 0.65);
        c.lineTo(w * 0.5, h * 0.65);
        c.lineTo(w * 0.5, h * 0.35);
        c.lineTo(w * 0.7, h * 0.35);
        c.stroke();
        break;
      case 'stepOff':
        c.begin();
        c.moveTo(w * 0.3, h * 0.35);
        c.lineTo(w * 0.5, h * 0.35);
        c.lineTo(w * 0.5, h * 0.65);
        c.lineTo(w * 0.7, h * 0.65);
        c.stroke();
        break;
      case 'dc1':
        c.begin();
        c.moveTo(w * 0.17, h * 0.5);
        c.lineTo(w * 0.83, h * 0.5);
        c.moveTo(w * 0.67, h * 0.42);
        c.lineTo(w * 0.83, h * 0.5);
        c.lineTo(w * 0.67, h * 0.58);
        c.stroke();
        break;
      case 'dc2':
        c.begin();
        c.moveTo(w * 0.5, h * 0.17);
        c.lineTo(w * 0.5, h * 0.83);
        c.moveTo(w * 0.42, h * 0.67);
        c.lineTo(w * 0.5, h * 0.83);
        c.lineTo(w * 0.58, h * 0.67);
        c.stroke();
        break;
      case 'dc3': {
        const ss = Math.max(3, Math.min(h, w) * 0.05); // half of symbol size
        let i = 3; //indent

        if (looseEq(sourceType, 'dependent')) {
          i += 3;
        }

        c.begin();
        c.moveTo(w * 0.5 - ss, h * 0.05 + i);
        c.lineTo(w * 0.5 + ss, h * 0.05 + i);
        c.moveTo(w * 0.5, h * 0.05 - ss + i);
        c.lineTo(w * 0.5, h * 0.05 + ss + i);
        c.moveTo(w * 0.5 - ss, h * 0.95 - i);
        c.lineTo(w * 0.5 + ss, h * 0.95 - i);
        c.stroke();
        break;
      }
    }
  }
}

// --- Registration -------------------------------------------------------------------------------

/** The shapes of mxElectrical.js, in the order the file registers them. */
export const ELECTRICAL_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.electrical.transmission.testPoint', ElectricalTestPoint],
  ['mxgraph.electrical.transmission.straightBus', ElectricalStraightBus],
  ['mxgraph.electrical.transmission.twoLineBusElbow', ElectricalTwoLineBusElbow],
  ['mxgraph.electrical.transmission.threeLineBusElbow', ElectricalThreeLineBusElbow],
  ['mxgraph.electrical.transmission.fourLineBusElbow', ElectricalFourLineBusElbow],
  ['mxgraph.electrical.transmission.eightLineBusElbow', ElectricalEightLineBusElbow],
  ['mxgraph.electrical.logic_gates.logic_gate', ElectricalLogicGate],
  ['mxgraph.electrical.logic_gates.buffer2', ElectricalBuffer],
  ['mxgraph.electrical.logic_gates.dual_inline_ic', ElectricalDualInLineIC],
  ['mxgraph.electrical.logic_gates.qfp_ic', ElectricalQFPIC],
  ['mxgraph.electrical.abstract.mux2', ElectricalMux],
  ['mxgraph.electrical.miscellaneous.batteryStack', ElectricalBatteryStack],
  ['mxgraph.electrical.signal_sources.dc_source_3_v2', ElectricalDCSource3V2],
  ['mxgraph.electrical.signal_sources.source', ElectricalSource],
  ...ELECTRICAL_SWITCH_SHAPES,
];
