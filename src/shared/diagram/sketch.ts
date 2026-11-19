/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * the sketch style of js/diagramly/Editor.js (RoughCanvas, getStyle,
 * limitFill, drawPath and Editor.createRoughCanvas's draw, fillSketch and
 * _drawToContext).
 * Modified for DeckWerk: the RoughCanvas is the canvas's handJiggle instead
 * of methods bound onto the canvas; it draws with rough.js's generator (the
 * same rough.js 4.6.6 build draw.io bundles) directly; the cell id for the
 * seed and the view translate are given to the shape.
 */

import type { Drawable, OpSet, Options, ResolvedOptions } from 'roughjs/bin/core';
import rough from 'roughjs/bundled/rough.esm.js';
import { arcToCurves, fmt, type HandJiggle, type SvgCanvas } from './canvas.js';
import type { Shape } from './shapes/shape.js';
import { getValue, looseEq, parseColor } from './shapes/util.js';
import type { Point } from './types.js';

/** rough.canvas(...).generator of Editor.createRoughCanvas (default options). */
const generator = rough.generator();

/** The options draw.io passes to rough.js: rough's options plus whether the path is filled. */
type SketchStyle = Record<string, unknown> & { filled: boolean; fill?: string; stroke?: string };

/** mxUtils.hex2rgb: `rgb(r, g, b)` for colours it can parse, else the value. */
function hex2rgb(value: string | null | undefined): string | null | undefined {
  if (value == null) return value;
  const rgb = parseColor(value);
  return rgb != null ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : value;
}

/**
 * The seed of a cell's strokes: draw.io hashes the cell id, so a cell is
 * drawn the same way every time (1 without a cell).
 */
export function sketchSeed(cellId: string | null | undefined): number {
  let seed = 1;
  if (cellId != null) {
    for (let i = 0; i < cellId.length; i++) seed = ((seed << 5) - seed + cellId.charCodeAt(i)) << 0;
  }
  return seed;
}

/** True if the style draws with the sketch (rough.js) style. */
export function isSketch(shape: Shape): boolean {
  return !shape.outline && shape.hasStyle && !looseEq(getValue(shape.style, 'sketch', '0'), '0')
    && String(getValue(shape.style, 'sketchStyle', 'rough')) !== 'comic';
}

/**
 * draw.io's RoughCanvas: collects the path a shape paints and draws it
 * with rough.js when it is filled or stroked, back through the canvas.
 */
export class RoughCanvas implements HandJiggle {
  passThrough = false;
  private path: Array<string | number> = [];
  private nextShape: Drawable | null = null;
  private lastX = 0;
  private lastY = 0;

  /** Rough.js rounds hachure lines to whole units, so it is given diagram coordinates: the shape's less this. */
  private readonly tr: Point;

  constructor(readonly canvas: SvgCanvas, readonly shape: Shape) {
    this.tr = shape.viewTranslate ?? { x: 0, y: 0 };
    // Avoids "spikes" in the output
    this.canvas.setLineJoin('round');
    this.canvas.setLineCap('round');
  }

  /** RoughCanvas.getStyle: rough.js options from the canvas state and the shape's style. */
  getStyle(stroke: boolean, fill: boolean): SketchStyle {
    const state = this.canvas.state;
    const shapeStyle = this.shape.style;
    const style: SketchStyle = { strokeWidth: state.strokeWidth, seed: sketchSeed(this.shape.cellId), preserveVertices: true, filled: fill };
    const defs = generator.defaultOptions;

    if (stroke) style.stroke = state.strokeColor === 'none' ? 'transparent' : (state.strokeColor ?? undefined);
    else style.stroke = 'none';

    let gradient: string | null = null;
    if (fill) {
      style.fill = state.fillColor === 'none' ? '' : (state.fillColor ?? undefined);
      gradient = state.gradientColor === 'none' ? null : state.gradientColor;
    } else {
      style.fill = '';
    }

    // Applies cell style
    style.bowing = getValue(shapeStyle, 'bowing', defs.bowing);
    style.hachureAngle = getValue(shapeStyle, 'hachureAngle', defs.hachureAngle);
    style.curveFitting = getValue(shapeStyle, 'curveFitting', defs.curveFitting);
    style.roughness = getValue(shapeStyle, 'jiggle', defs.roughness);
    style.simplification = getValue(shapeStyle, 'simplification', defs.simplification);
    style.disableMultiStroke = getValue(shapeStyle, 'disableMultiStroke', defs.disableMultiStroke);
    style.disableMultiStrokeFill = getValue(shapeStyle, 'disableMultiStrokeFill', defs.disableMultiStrokeFill);

    const hachureGap = getValue(shapeStyle, 'hachureGap', -1);
    style.hachureGap = looseEq(hachureGap, 'auto') ? -1 : hachureGap;
    style.dashGap = getValue(shapeStyle, 'dashGap', hachureGap);
    style.dashOffset = getValue(shapeStyle, 'dashOffset', hachureGap);
    style.zigzagOffset = getValue(shapeStyle, 'zigzagOffset', hachureGap);

    const fillWeight = getValue(shapeStyle, 'fillWeight', -1);
    style.fillWeight = looseEq(fillWeight, 'auto') ? -1 : fillWeight;

    let fillStyle = String(getValue(shapeStyle, 'fillStyle', 'auto'));

    // Dots fill style is disable due to performance problems
    if (fillStyle === 'dots') fillStyle = 'auto';

    if (fillStyle === 'auto') {
      // One of the following backgrounds for solid fill (the light
      // theme's white and shape background)
      const bg = [hex2rgb('#ffffff'), hex2rgb('#ffffff')];
      fillStyle = (style.fill != null && (gradient != null || bg.indexOf(hex2rgb(style.fill)) >= 0)) ? 'solid' : defs.fillStyle;
    }

    style.fillStyle = fillStyle;
    if (fill) this.limitFill(style);
    return style;
  }

  /** Maximum width plus height of shapes with a sketch fill; larger shapes are filled solid. */
  maxFillSize = 200000;

  /** Maximum number of lines of a sketch fill (hachure lines, dashes or lines of zigzags). */
  maxFillCount = 100000;

  /**
   * RoughCanvas.limitFill: shapes larger than maxFillSize are filled solid,
   * and the gaps are widened so that the fill has at most maxFillCount lines.
   */
  limitFill(style: SketchStyle): void {
    const bounds = this.shape.bounds;
    const scale = this.shape.scale;
    const fillStyle = style.fillStyle;

    if (bounds != null && scale > 0 && fillStyle !== 'solid') {
      const w = bounds.width / scale;
      const h = bounds.height / scale;

      if (w + h > this.maxFillSize) {
        style.fillStyle = 'solid';
      } else {
        let gap = parseFloat(String(style.hachureGap));
        gap = (gap < 0) ? 4 * Number(style.strokeWidth) : gap;

        if (gap >= 0) {
          const max = this.maxFillCount;

          // Hachure lines in both directions for cross-hatch
          // (rough.js uses a gap of at least 0.1)
          let g = Math.max(gap, 0.1);
          const minGap = ((fillStyle === 'cross-hatch') ? 2 : 1) * (w + h) / max;

          if (g < minGap) {
            g = minGap;
            style.hachureGap = g;
          }

          if (fillStyle === 'dashed') {
            let offset = parseFloat(String(style.dashOffset));
            let dashGap = parseFloat(String(style.dashGap));
            offset = (offset < 0) ? gap : offset;
            dashGap = (dashGap < 0) ? gap : dashGap;
            const dash = (w * h) / (g * max);

            if (offset + dashGap < dash) {
              const f = (offset + dashGap > 0) ? dash / (offset + dashGap) : 0;
              style.dashOffset = (f > 0) ? offset * f : dash / 2;
              style.dashGap = (f > 0) ? dashGap * f : dash / 2;
            }
          } else if (fillStyle === 'zigzag-line') {
            // Lines of zigzags (w * h / ((g + zigzag) * zigzag)), which
            // take twice as long to paint
            let zigzag = parseFloat(String(style.zigzagOffset));
            zigzag = (zigzag < 0) ? gap : zigzag;
            const minZigzag = (Math.sqrt(g * g + 8 * w * h / max) - g) / 2;
            if (zigzag < minZigzag) style.zigzagOffset = minZigzag;
          }
        }
      }
    }
  }

  begin(): void {
    this.path = [];
  }

  end(): void {
    // do nothing
  }

  /** Adds an operation with its points in diagram coordinates. */
  private addOp(op: string, ...coords: number[]): void {
    this.path.push(op);
    for (let i = 0; i + 1 < coords.length; i += 2) {
      this.lastX = coords[i];
      this.lastY = coords[i + 1];
      this.path.push(fmt(this.lastX - this.tr.x));
      this.path.push(fmt(this.lastY - this.tr.y));
    }
  }

  lineTo(endX: number, endY: number): void {
    this.addOp('L', endX, endY);
    this.lastX = endX;
    this.lastY = endY;
  }

  moveTo(endX: number, endY: number): void {
    this.addOp('M', endX, endY);
    this.lastX = endX;
    this.lastY = endY;
  }

  close(): void {
    this.addOp('Z');
  }

  quadTo(x1: number, y1: number, x2: number, y2: number): void {
    this.addOp('Q', x1, y1, x2, y2);
    this.lastX = x2;
    this.lastY = y2;
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    this.addOp('C', x1, y1, x2, y2, x3, y3);
    this.lastX = x3;
    this.lastY = y3;
  }

  arcTo(rx: number, ry: number, angle: number, largeArcFlag: number, sweepFlag: number, x: number, y: number): void {
    const curves = arcToCurves(this.lastX, this.lastY, rx, ry, angle, largeArcFlag, sweepFlag, x, y);
    for (let i = 0; i + 5 < curves.length; i += 6) {
      this.curveTo(curves[i], curves[i + 1], curves[i + 2], curves[i + 3], curves[i + 4], curves[i + 5]);
    }
    this.lastX = x;
    this.lastY = y;
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.path = [];
    this.nextShape = generator.rectangle(x - this.tr.x, y - this.tr.y, w, h, this.getStyle(true, true) as Options);
  }

  ellipse(x: number, y: number, w: number, h: number): void {
    this.path = [];
    this.nextShape = generator.ellipse(x + w / 2 - this.tr.x, y + h / 2 - this.tr.y, w, h, this.getStyle(true, true) as Options);
  }

  roundrect(x: number, y: number, w: number, h: number, dx: number, dy: number): void {
    this.begin();
    this.moveTo(x + dx, y);
    this.lineTo(x + w - dx, y);
    this.quadTo(x + w, y, x + w, y + dy);
    this.lineTo(x + w, y + h - dy);
    this.quadTo(x + w, y + h, x + w - dx, y + h);
    this.lineTo(x + dx, y + h);
    this.quadTo(x, y + h, x, y + h - dy);
    this.lineTo(x, y + dy);
    this.quadTo(x, y, x + dx, y);
  }

  /** RoughCanvas.drawPath: the collected path (or rectangle/ellipse) through rough.js, in the shape's coordinates. */
  drawPath(style: SketchStyle): void {
    const tr = this.tr;
    const translate = tr.x !== 0 || tr.y !== 0;
    if (translate) {
      this.canvas.save();
      this.canvas.translate(tr.x, tr.y);
    }

    if (this.path.length > 0) {
      this.passThrough = true;
      try {
        this.draw(generator.path(this.path.join(' '), style as Options));
      } catch {
        // ignore
      }
      this.passThrough = false;
    } else if (this.nextShape != null) {
      const options = this.nextShape.options as unknown as Record<string, unknown>;
      for (const key of Object.keys(style)) options[key] = style[key];
      if (style.stroke === 'none' || style.stroke == null) delete options.stroke;
      if (!style.filled) delete options.fill;
      this.passThrough = true;
      this.draw(this.nextShape);
      this.passThrough = false;
    }

    if (translate) this.canvas.restore();
  }

  stroke(): void {
    this.drawPath(this.getStyle(true, false));
  }

  fill(): void {
    this.drawPath(this.getStyle(false, true));
  }

  fillAndStroke(): void {
    this.drawPath(this.getStyle(true, true));
  }

  /** Editor.createRoughCanvas's draw: each set of the drawable through the canvas. */
  private draw(drawable: Drawable): void {
    const sets = drawable.sets || [];
    const o = drawable.options || generator.defaultOptions;
    for (const drawing of sets) {
      switch (drawing.type) {
        case 'path':
          if (o.stroke != null) this.drawToContext(drawing, o);
          break;
        case 'fillPath':
          this.drawToContext(drawing, o);
          break;
        case 'fillSketch':
          this.fillSketch(drawing, o);
          break;
      }
    }
  }

  /** Editor.createRoughCanvas's fillSketch: hachure lines stroked in the fill colour. */
  private fillSketch(drawing: OpSet, o: ResolvedOptions): void {
    const c = this.canvas;
    const strokeColor = c.state.strokeColor;
    const strokeWidth = c.state.strokeWidth;
    const strokeAlpha = c.state.strokeAlpha;
    const dashed = c.state.dashed;

    let fweight = o.fillWeight;
    if (fweight < 0) fweight = o.strokeWidth / 2;

    c.setStrokeAlpha(c.state.fillAlpha);
    c.setStrokeColor(o.fill || '');
    c.setStrokeWidth(fweight);
    c.setDashed(false);

    this.drawToContext(drawing, o);

    c.setDashed(dashed);
    c.setStrokeWidth(strokeWidth);
    c.setStrokeColor(strokeColor);
    c.setStrokeAlpha(strokeAlpha);
  }

  /** Editor.createRoughCanvas's _drawToContext. */
  private drawToContext(drawing: OpSet, o: ResolvedOptions): void {
    const ctx = this.canvas;
    ctx.begin();
    for (const item of drawing.ops) {
      const data = item.data;
      switch (item.op) {
        case 'move':
          ctx.moveTo(data[0], data[1]);
          break;
        case 'bcurveTo':
          ctx.curveTo(data[0], data[1], data[2], data[3], data[4], data[5]);
          break;
        case 'lineTo':
          ctx.lineTo(data[0], data[1]);
          break;
      }
    }
    ctx.end();
    if (drawing.type === 'fillPath' && (o as ResolvedOptions & { filled?: boolean }).filled) ctx.fill();
    else ctx.stroke();
  }
}
