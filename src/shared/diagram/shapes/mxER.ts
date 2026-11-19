/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2010,
 * JGraph Holdings Ltd, Apache License 2.0: the shapes of shapes/er/mxER.js
 * (entity, entityExt, attribute, has, cloud, hierarchy, note, chens,
 * bachmans, ie, rrect, anchor) and their connection points. The ER markers
 * of the file are in ../markers.ts.
 * Modified for DeckWerk: mxUtils.getSizeForString, which measures with the
 * browser, uses the Helvetica (Arial) advance widths of label/metrics.ts;
 * texts are painted as plain canvas text; the painting code is otherwise
 * unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import { textWidth } from '../label/metrics.js';
import { Shape, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getValue, toNumber, type JsValue } from './util.js';

const ALIGN_LEFT = 'left';
const ALIGN_CENTER = 'center';
const ALIGN_MIDDLE = 'middle';

/** mxConstants.DEFAULT_FONTSIZE, the size getSizeForString measures with if none is given. */
const DEFAULT_FONTSIZE = 11;

/**
 * mxUtils.getSizeForString(text, fontSize, DEFAULT_FONTFAMILY).width: the
 * offsetWidth of the unwrapped text at Math.round(fontSize) px, here from
 * Helvetica's advance widths (Arial matches them) instead of the browser.
 */
function getStringWidth(text: string, fontSize: JsValue): number {
  const size = Math.round(toNumber(fontSize != null ? fontSize : DEFAULT_FONTSIZE));
  return Math.round(textWidth(text, size, false));
}

/** A style value as text, as JavaScript converts it (`'' + value`). */
function str(value: JsValue): string {
  return String(value);
}

/** `a + b` in JavaScript for a number and a style value: a string value concatenates. */
function jsAdd(a: number, b: JsValue): number | string {
  return typeof b === 'string' ? String(a) + b : a + toNumber(b);
}

/**
 * c.text(x, y, 0, 0, text, align, ALIGN_MIDDLE, 0, null, overflow, 0, 0) as
 * the shapes of mxER.js call it: plain, unwrapped text at a point.
 */
function paintText(c: SvgCanvas, x: number, y: number, text: JsValue, align: string): void {
  c.text(x, y, 0, 0, text != null ? str(text) : null, align, ALIGN_MIDDLE, false, undefined, null, false, 0);
}

const SIDES_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.25, 0, true),
  constraint(0.5, 0, true),
  constraint(0.75, 0, true),
  constraint(0, 0.25, true),
  constraint(0, 0.5, true),
  constraint(0, 0.75, true),
  constraint(1, 0.25, true),
  constraint(1, 0.5, true),
  constraint(1, 0.75, true),
  constraint(0.25, 1, true),
  constraint(0.5, 1, true),
  constraint(0.75, 1, true),
];

const LEGEND_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0, 0, true),
  constraint(1, 0, true),
  constraint(0, 1, true),
  constraint(1, 1, true),
  constraint(0.25, 0, true),
  constraint(0.5, 0, true),
  constraint(0.75, 0, true),
  constraint(0, 0.25, true),
  constraint(0, 0.5, true),
  constraint(0, 0.75, true),
  constraint(1, 0.25, true),
  constraint(1, 0.5, true),
  constraint(1, 0.75, true),
  constraint(0.25, 1, true),
  constraint(0.5, 1, true),
  constraint(0.75, 1, true),
];

// --- Entity ---------------------------------------------------------------------------------

export class EREntityShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = SIDES_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const rSize = 10;
    w = Math.max(w, 2 * rSize);
    h = Math.max(h, 2 * rSize);
    this.background(c, x, y, w, h, rSize);
    c.setShadow(false);
    this.mainText(c, x, y, w, h, mainText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rSize: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'round'));

    if (buttonStyle === 'round') {
      c.begin();
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'rect') {
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'dblFrame') {
      const fillColor = getValue(this.style, 'fillColor', '#ffffff');
      c.setFillColor(str(fillColor));
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
      rSize = Math.min(w, h);
      c.begin();
      c.moveTo(rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, h - rSize * 0.1);
      c.lineTo(rSize * 0.1, h - rSize * 0.1);
      c.close();
      c.stroke();
    }
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.5, text, ALIGN_CENTER);
  }
}

// --- Entity Extended ------------------------------------------------------------------------

export class EREntityExtShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = SIDES_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const attributes = str(getValue(this.style, 'subText', '+ attribute 1,+ attribute 2,+ attribute 3')).split(',');
    const strokeColor = getValue(this.style, 'strokeColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    const mainColor = getValue(this.style, 'fillColor', '#008cff');
    const attrColor = getValue(this.style, 'fillColor2', '#ffffff');
    let maxTextWidth = 0;
    c.translate(x, y);
    const rSize = 10;
    const barY = toNumber(fontSize) * 1.25;

    for (let i = 0; i < attributes.length; i++) {
      const currWidth = getStringWidth(attributes[i], fontSize);

      if (currWidth > maxTextWidth) {
        maxTextWidth = currWidth;
      }
    }

    w = Math.max(w, 2 * rSize, maxTextWidth + rSize);
    h = Math.max(h, 2 * rSize, (attributes.length + 1) * barY);
    this.background(c, x, y, w, h, rSize);
    c.setShadow(false);
    this.shapes(c, x, y, w, h, fontSize, mainColor, attrColor, rSize, barY);
    this.mainText(c, x, y, w, h, mainText, fontSize, attrColor);
    this.attrText(c, x, y, w, h, attributes, fontSize, strokeColor, barY, rSize);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rSize: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'round'));
    c.begin();

    if (buttonStyle === 'round') {
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
    } else if (buttonStyle === 'rect') {
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
    }

    c.close();
    c.fillAndStroke();
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, toNumber(fontSize) * 0.5, text, ALIGN_CENTER);
  }

  shapes(c: SvgCanvas, _x: number, _y: number, w: number, h: number, _fontSize: JsValue, _mainColor: JsValue,
    attrColor: JsValue, rSize: number, barY: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'round'));

    if (buttonStyle === 'round') {
      c.begin();
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, barY);
      c.lineTo(0, barY);
      c.close();
      c.fill();

      c.setFillColor(str(attrColor));
      c.begin();
      c.moveTo(w, barY);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
      c.lineTo(0, barY);
      c.close();
      c.fill();
    } else if (buttonStyle === 'rect') {
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, barY);
      c.lineTo(0, barY);
      c.close();
      c.fill();

      c.setFillColor(str(attrColor));
      c.begin();
      c.moveTo(0, barY);
      c.lineTo(w, barY);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fill();
    }

    c.begin();

    if (buttonStyle === 'round') {
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
    } else if (buttonStyle === 'rect') {
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
    }

    c.close();
    c.stroke();
  }

  attrText(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number, attributes: string[], fontSize: JsValue,
    fontColor: JsValue, barY: number, rSize: number): void {
    for (let i = 0; i < attributes.length; i++) {
      c.begin();
      c.setFontSize(str(fontSize));
      c.setFontColor(str(fontColor));
      paintText(c, rSize * 0.5, (i + 1.5) * barY, attributes[i], ALIGN_LEFT);
    }
  }
}

// --- Attribute ------------------------------------------------------------------------------

export class ERAttributeShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.144, 0.144, false),
    constraint(0.856, 0.144, false),
    constraint(0.856, 0.856, false),
    constraint(0.144, 0.856, false),
    constraint(0, 0.5, true),
    constraint(1, 0.5, true),
    constraint(0.5, 0, true),
    constraint(0.5, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const rSize = 10;
    w = Math.max(w, 2 * rSize);
    h = Math.max(h, 2 * rSize);
    this.background(c, x, y, w, h, rSize);
    c.setShadow(false);
    this.mainText(c, x, y, w, h, mainText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rSize: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'simple'));

    if (buttonStyle === 'simple') {
      c.begin();
      c.ellipse(0, 0, w, h);
      c.fillAndStroke();
    } else if (buttonStyle === 'dblFrame') {
      const fillColor = getValue(this.style, 'fillColor', '#666666');
      c.setFillColor(str(fillColor));
      c.begin();
      c.ellipse(0, 0, w, h);
      c.fillAndStroke();
      rSize = Math.min(w, h);
      c.begin();
      c.ellipse(rSize * 0.1, rSize * 0.1, w - rSize * 0.2, h - rSize * 0.2);
      c.stroke();
    }
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.5, text, ALIGN_CENTER);
  }
}

// --- Has ------------------------------------------------------------------------------------

export class ERHasShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.5, 0, true),
    constraint(0.5, 1, true),
    constraint(0, 0.5, true),
    constraint(1, 0.5, true),
    constraint(0.25, 0.25, false),
    constraint(0.25, 0.75, false),
    constraint(0.75, 0.25, false),
    constraint(0.75, 0.75, false),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const rSize = 10;
    w = Math.max(w, 2 * rSize);
    h = Math.max(h, 2 * rSize);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.mainText(c, x, y, w, h, mainText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'rhombus'));

    if (buttonStyle === 'rhombus') {
      c.begin();
      c.moveTo(0, h * 0.5);
      c.lineTo(w * 0.5, 0);
      c.lineTo(w, h * 0.5);
      c.lineTo(w * 0.5, h);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'dblFrame') {
      const fillColor = getValue(this.style, 'fillColor', '#666666');
      c.setFillColor(str(fillColor));
      c.begin();
      c.moveTo(0, h * 0.5);
      c.lineTo(w * 0.5, 0);
      c.lineTo(w, h * 0.5);
      c.lineTo(w * 0.5, h);
      c.close();
      c.fillAndStroke();
      c.begin();
      c.moveTo(w * 0.1, h * 0.5);
      c.lineTo(w * 0.5, h * 0.1);
      c.lineTo(w * 0.9, h * 0.5);
      c.lineTo(w * 0.5, h * 0.9);
      c.close();
      c.stroke();
    }
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.5, text, ALIGN_CENTER);
  }
}

// --- Cloud ----------------------------------------------------------------------------------

export class ERCloudShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0.08, 0.5, false),
    constraint(0.9, 0.5, false),
    constraint(0.5, 0.1, false),
    constraint(0.5, 0.92, false),
    constraint(0.24, 0.24, false),
    constraint(0.22, 0.8, false),
    constraint(0.81, 0.2, false),
    constraint(0.78, 0.78, false),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const rSize = 10;
    w = Math.max(w, 2 * rSize);
    h = Math.max(h, 2 * rSize);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.mainText(c, x, y, w, h, mainText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0.25 * w, 0.25 * h);
    c.curveTo(0.05 * w, 0.25 * h, 0, 0.5 * h, 0.16 * w, 0.55 * h);
    c.curveTo(0, 0.66 * h, 0.18 * w, 0.9 * h, 0.31 * w, 0.8 * h);
    c.curveTo(0.4 * w, h, 0.7 * w, h, 0.8 * w, 0.8 * h);
    c.curveTo(w, 0.8 * h, w, 0.6 * h, 0.875 * w, 0.5 * h);
    c.curveTo(w, 0.3 * h, 0.8 * w, 0.1 * h, 0.625 * w, 0.2 * h);
    c.curveTo(0.5 * w, 0.05 * h, 0.3 * w, 0.05 * h, 0.25 * w, 0.25 * h);
    c.fillAndStroke();
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.5, text, ALIGN_CENTER);
  }
}

// --- Hierarchy (LEGACY) ---------------------------------------------------------------------

export class ERHierarchyShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = SIDES_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = str(getValue(this.style, 'buttonText', 'main')).split(',');
    const subText = str(getValue(this.style, 'subText', 'sub')).split(',');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const rSize = 10;
    w = Math.max(w, 2 * rSize);
    h = Math.max(h, 2 * rSize);
    this.background(c, x, y, w, h, rSize);
    c.setShadow(false);
    this.shapeText(c, x, y, w, h, mainText, subText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number, rSize: number): void {
    const buttonStyle = str(getValue(this.style, 'buttonStyle', 'round'));

    if (buttonStyle === 'round') {
      c.begin();
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'rect') {
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'dblFrame') {
      const fillColor = getValue(this.style, 'fillColor', '#666666');
      c.setFillColor(str(fillColor));
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
      rSize = Math.min(w, h);
      c.begin();
      c.moveTo(rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, h - rSize * 0.1);
      c.lineTo(rSize * 0.1, h - rSize * 0.1);
      c.close();
      c.stroke();
    }

    let trX = 0;
    let trY = 0;

    if (buttonStyle === 'round') {
      trX = w * 0.5;
      trY = rSize;
      c.translate(trX, trY);
      w = w * 0.5 - rSize;
      h = h - 2 * rSize;
      c.begin();
      c.moveTo(0, rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, rSize, 0);
      c.lineTo(w - rSize, 0);
      c.arcTo(rSize, rSize, 0, 0, 1, w, rSize);
      c.lineTo(w, h - rSize);
      c.arcTo(rSize, rSize, 0, 0, 1, w - rSize, h);
      c.lineTo(rSize, h);
      c.arcTo(rSize, rSize, 0, 0, 1, 0, h - rSize);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'rect') {
      trX = w * 0.5;
      trY = rSize;
      c.translate(trX, trY);
      w = w * 0.5 - rSize;
      h = h - 2 * rSize;
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
    } else if (buttonStyle === 'dblFrame') {
      trX = w * 0.5;
      trY = rSize * 0.15;
      c.translate(trX, trY);
      w = w * 0.5 - rSize * 0.15;
      h = h - rSize * 0.3;
      const fillColor = getValue(this.style, 'fillColor', '#666666');
      c.setFillColor(str(fillColor));
      c.begin();
      c.moveTo(0, 0);
      c.lineTo(w, 0);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.close();
      c.fillAndStroke();
      rSize = Math.min(w, h);
      c.begin();
      c.moveTo(rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, rSize * 0.1);
      c.lineTo(w - rSize * 0.1, h - rSize * 0.1);
      c.lineTo(rSize * 0.1, h - rSize * 0.1);
      c.close();
      c.stroke();
    }

    c.translate(-trX, -trY);
  }

  shapeText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: string[], subText: string[],
    fontSize: JsValue, fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.25, (h - toNumber(fontSize)) * 0.5, text[0], ALIGN_CENTER);
    paintText(c, w * 0.25, toNumber(jsAdd(h, fontSize)) * 0.5, text[1], ALIGN_CENTER);
    paintText(c, w * 0.7, (h - toNumber(fontSize)) * 0.5, subText[0], ALIGN_CENTER);
    paintText(c, w * 0.7, toNumber(jsAdd(h, fontSize)) * 0.5, subText[1], ALIGN_CENTER);
  }
}

// --- Note -----------------------------------------------------------------------------------

export class ERNoteShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = [
    constraint(0, 0, true),
    constraint(0, 1, true),
    constraint(1, 1, true),
    constraint(0.25, 0, true),
    constraint(0.5, 0, true),
    constraint(0.75, 0, true),
    constraint(0, 0.25, true),
    constraint(0, 0.5, true),
    constraint(0, 0.75, true),
    constraint(1, 0.25, true),
    constraint(1, 0.5, true),
    constraint(1, 0.75, true),
    constraint(0.25, 1, true),
    constraint(0.5, 1, true),
    constraint(0.75, 1, true),
  ];

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const mainText = getValue(this.style, 'buttonText', 'Entity');
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    const backColor = getValue(this.style, 'fillColor2', '#ffffff');
    c.translate(x, y);
    const flipSize = 20;
    w = Math.max(w, flipSize * 2);
    h = Math.max(h, flipSize * 2);
    this.background(c, x, y, w, h, flipSize);
    c.setShadow(false);
    this.flipShape(c, x, y, w, h, flipSize, backColor);
    this.mainText(c, x, y, w, h, mainText, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number, flipSize: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w - flipSize, 0);
    c.lineTo(w, flipSize);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  flipShape(c: SvgCanvas, _x: number, _y: number, w: number, _h: number, flipSize: number, backColor: JsValue): void {
    c.setLineJoin('round');
    c.setFillColor(str(backColor));
    c.begin();
    c.moveTo(w - flipSize, 0);
    c.lineTo(w, flipSize);
    c.lineTo(w - flipSize, flipSize);
    c.close();
    c.fillAndStroke();
  }

  mainText(c: SvgCanvas, _x: number, _y: number, w: number, h: number, text: JsValue, fontSize: JsValue,
    fontColor: JsValue): void {
    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.5, text, ALIGN_CENTER);
  }
}

// --- Chen's Notation Legend (LEGACY) --------------------------------------------------------

export class ERChenShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEGEND_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    const flipSize = 20;
    w = Math.max(w, flipSize * 2);
    h = Math.max(h, flipSize * 2);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.foreground(c, x, y, w, h, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, _x: number, _y: number, w: number, h: number, fontSize: JsValue, fontColor: JsValue): void {
    c.begin();
    c.moveTo(0, h * 0.25);
    c.lineTo(w, h * 0.25);
    c.moveTo(0, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.moveTo(0, h * 0.75);
    c.lineTo(w, h * 0.75);

    c.moveTo(w * 0.25, h * 0.5);
    c.lineTo(w * 0.25, h);

    c.moveTo(w * 0.5, h * 0.25);
    c.lineTo(w * 0.5, h);

    c.moveTo(w * 0.75, h * 0.5);
    c.lineTo(w * 0.75, h);
    c.stroke();

    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.125, 'ERD Peter Chen\'s Notation', ALIGN_CENTER);

    c.setFontSize(toNumber(fontSize) * 0.85);
    paintText(c, w * 0.25, h * 0.375, 'Cardinality', ALIGN_CENTER);
    paintText(c, w * 0.75, h * 0.375, 'Optionality', ALIGN_CENTER);

    c.setFontSize(toNumber(fontSize) * 0.7);
    paintText(c, w * 0.125, h * 0.625, '1', ALIGN_CENTER);
    paintText(c, w * 0.375, h * 0.625, 'One', ALIGN_CENTER);
    paintText(c, w * 0.625, h * 0.625, '0', ALIGN_CENTER);
    paintText(c, w * 0.875, h * 0.625, 'Optional', ALIGN_CENTER);

    paintText(c, w * 0.125, h * 0.875, 'N', ALIGN_CENTER);
    paintText(c, w * 0.375, h * 0.875, 'Many', ALIGN_CENTER);
    paintText(c, w * 0.625, h * 0.875, '1', ALIGN_CENTER);
    paintText(c, w * 0.875, h * 0.875, 'Mandatory', ALIGN_CENTER);
  }
}

// --- Bachman's Notation Legend (LEGACY) -----------------------------------------------------

export class ERBachmanShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEGEND_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.foreground(c, x, y, w, h, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, _x: number, _y: number, w: number, h: number, fontSize: JsValue, fontColor: JsValue): void {
    c.begin();
    c.moveTo(0, h * 0.125);
    c.lineTo(w, h * 0.125);
    c.moveTo(0, h * 0.25);
    c.lineTo(w, h * 0.25);
    c.moveTo(0, h * 0.375);
    c.lineTo(w, h * 0.375);
    c.moveTo(0, h * 0.5);
    c.lineTo(w, h * 0.5);
    c.moveTo(0, h * 0.625);
    c.lineTo(w, h * 0.625);
    c.moveTo(0, h * 0.75);
    c.lineTo(w, h * 0.75);
    c.moveTo(0, h * 0.875);
    c.lineTo(w, h * 0.875);

    c.moveTo(w * 0.5, h * 0.125);
    c.lineTo(w * 0.5, h);
    c.stroke();

    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.0625, 'ERD Bachman\'s Notation', ALIGN_CENTER);

    c.setFontSize(toNumber(fontSize) * 0.85);
    paintText(c, w * 0.52, h * 0.1875, 'Relationship', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.3125, 'Cardinality (One)', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.4375, 'Cardinality (Many)', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.5625, 'Mandatory, One', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.6875, 'Mandatory, Many', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.8125, 'Optional, One', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.9375, 'Optional, Many', ALIGN_LEFT);

    const hasFormsWidth = getStringWidth('has/forms', fontSize);
    c.begin();
    c.moveTo(w * 0.04, h * 0.1875);
    c.lineTo(w * 0.25 - hasFormsWidth * 0.5, h * 0.1875);
    c.moveTo(w * 0.25 + hasFormsWidth * 0.5, h * 0.1875);
    c.lineTo(w * 0.46, h * 0.1875);

    paintText(c, w * 0.25, h * 0.1875, 'has/forms', ALIGN_CENTER);

    c.moveTo(w * 0.04, h * 0.3125);
    c.lineTo(w * 0.46, h * 0.3125);

    c.moveTo(w * 0.04, h * 0.4375);
    c.lineTo(w * 0.46, h * 0.4375);
    c.moveTo(w * 0.46, h * 0.4050);
    c.lineTo(w * 0.4, h * 0.4375);
    c.lineTo(w * 0.46, h * 0.47);

    c.moveTo(w * 0.04, h * 0.5625);
    c.lineTo(w * 0.46, h * 0.5625);
    c.moveTo(w * 0.38, h * 0.53);
    c.lineTo(w * 0.38, h * 0.595);

    c.moveTo(w * 0.04, h * 0.6875);
    c.lineTo(w * 0.46, h * 0.6875);
    c.moveTo(w * 0.46, h * 0.655);
    c.lineTo(w * 0.4, h * 0.6875);
    c.lineTo(w * 0.46, h * 0.72);
    c.moveTo(w * 0.38, h * 0.655);
    c.lineTo(w * 0.38, h * 0.72);

    c.moveTo(w * 0.04, h * 0.8125);
    c.lineTo(w * 0.46, h * 0.8125);

    c.moveTo(w * 0.04, h * 0.9375);
    c.lineTo(w * 0.46, h * 0.9375);
    c.moveTo(w * 0.46, h * 0.9050);
    c.lineTo(w * 0.4, h * 0.9375);
    c.lineTo(w * 0.46, h * 0.97);

    c.stroke();

    const ellSize = h / 15;
    c.begin();
    c.ellipse(w * 0.46 - ellSize, h * 0.8125 - ellSize * 0.5, ellSize, ellSize);
    c.fillAndStroke();

    c.begin();
    c.ellipse(w * 0.4 - ellSize, h * 0.9375 - ellSize * 0.5, ellSize, ellSize);
    c.fillAndStroke();
  }
}

// --- Information Engineering Notation Legend (LEGACY) ---------------------------------------

export class ERInfEngShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = LEGEND_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const fontColor = getValue(this.style, 'textColor', '#666666');
    const fontSize = getValue(this.style, 'fontSize', '17');
    c.translate(x, y);
    w = Math.max(w, h / 1.5);
    h = Math.max(h, toNumber(fontSize) * 5);
    this.background(c, x, y, w, h);
    c.setShadow(false);
    this.foreground(c, x, y, w, h, fontSize, fontColor);
  }

  background(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.begin();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
    c.fillAndStroke();
  }

  foreground(c: SvgCanvas, _x: number, _y: number, w: number, h: number, fontSize: JsValue, fontColor: JsValue): void {
    c.begin();
    c.moveTo(0, h * 0.2);
    c.lineTo(w, h * 0.2);
    c.moveTo(0, h * 0.4);
    c.lineTo(w, h * 0.4);
    c.moveTo(0, h * 0.6);
    c.lineTo(w, h * 0.6);
    c.moveTo(0, h * 0.8);
    c.lineTo(w, h * 0.8);

    c.moveTo(w * 0.5, h * 0.2);
    c.lineTo(w * 0.5, h);
    c.stroke();

    c.begin();
    c.setFontSize(str(fontSize));
    c.setFontColor(str(fontColor));
    paintText(c, w * 0.5, h * 0.1, 'ERD Information Engineering Notation', ALIGN_CENTER);

    c.setFontSize(toNumber(fontSize) * 0.85);
    paintText(c, w * 0.52, h * 0.3, 'Zero or one', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.5, 'One only', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.7, 'Zero or more', ALIGN_LEFT);
    paintText(c, w * 0.52, h * 0.9, 'One or more', ALIGN_LEFT);

    const ellSize = h / 12;

    c.begin();
    c.moveTo(w * 0.04, h * 0.3);
    c.lineTo(w * 0.46, h * 0.3);
    c.moveTo(w * 0.46 - ellSize, h * 0.25);
    c.lineTo(w * 0.46 - ellSize, h * 0.35);

    c.moveTo(w * 0.04, h * 0.5);
    c.lineTo(w * 0.46, h * 0.5);
    c.moveTo(w * 0.46 - ellSize * 2, h * 0.45);
    c.lineTo(w * 0.46 - ellSize * 2, h * 0.55);
    c.moveTo(w * 0.46 - ellSize * 2.5, h * 0.45);
    c.lineTo(w * 0.46 - ellSize * 2.5, h * 0.55);

    c.moveTo(w * 0.04, h * 0.7);
    c.lineTo(w * 0.46, h * 0.7);
    c.moveTo(w * 0.46, h * 0.65);
    c.lineTo(w * 0.46 - ellSize * 2, h * 0.7);
    c.lineTo(w * 0.46, h * 0.75);
    c.stroke();

    c.moveTo(w * 0.04, h * 0.9);
    c.lineTo(w * 0.46, h * 0.9);
    c.moveTo(w * 0.46, h * 0.85);
    c.lineTo(w * 0.46 - ellSize * 2, h * 0.9);
    c.lineTo(w * 0.46, h * 0.95);
    c.moveTo(w * 0.46 - ellSize * 2.5, h * 0.85);
    c.lineTo(w * 0.46 - ellSize * 2.5, h * 0.95);
    c.stroke();

    c.begin();
    c.ellipse(w * 0.46 - ellSize * 3, h * 0.3 - ellSize * 0.5, ellSize, ellSize);
    c.fillAndStroke();

    c.begin();
    c.ellipse(w * 0.46 - ellSize * 3, h * 0.7 - ellSize * 0.5, ellSize, ellSize);
    c.fillAndStroke();
  }
}

// --- Rounded rectangle (adjustable rounding) ------------------------------------------------

export class ERRRectShape extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = SIDES_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);

    const rSize = parseInt(str(getValue(this.style, 'rSize', '10')));
    // draw.io passes no dy, so only rx is set (undefined > 0 is false)
    c.roundrect(0, 0, w, h, rSize, NaN);
    c.fillAndStroke();
  }
}

// --- Anchor (a dummy shape without visuals used for anchoring) ------------------------------

export class ERAnchorShape extends Shape {
  override paintVertexShape(_c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void {
    // paints nothing
  }
}

/** The shapes in the order mxER.js registers them. */
export const ER_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.er.entity', EREntityShape],
  ['mxgraph.er.entityExt', EREntityExtShape],
  ['mxgraph.er.attribute', ERAttributeShape],
  ['mxgraph.er.has', ERHasShape],
  ['mxgraph.er.cloud', ERCloudShape],
  ['mxgraph.er.hierarchy', ERHierarchyShape],
  ['mxgraph.er.note', ERNoteShape],
  ['mxgraph.er.chens', ERChenShape],
  ['mxgraph.er.bachmans', ERBachmanShape],
  ['mxgraph.er.ie', ERInfEngShape],
  ['mxgraph.er.rrect', ERRRectShape],
  ['mxgraph.er.anchor', ERAnchorShape],
];
