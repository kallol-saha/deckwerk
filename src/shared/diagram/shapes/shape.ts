/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/shape/mxShape.js, mxActor.js, mxCylinder.js,
 * mxgraph/src/view/mxCellRenderer.js (configureShape, postConfigureShape,
 * resolveColor, the shape registry), mxgraph/src/view/mxConnectionConstraint.js,
 * and the mxShape/mxCylinder overrides in js/grapheditor/Shapes.js and
 * Graph.js (paintGlassEffect, getCylinderSize, multiple copies).
 * Modified for DeckWerk: no DOM nodes, bounding boxes, outlines, sketch
 * styles, flow animation or label code; the shadow filter and the opacity
 * group are groups on the SVG string canvas; parent colours come from an
 * optional parent style instead of the graph.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point, Rect, Style } from '../types.js';
import {
  LINE_ARCSIZE, NONE, RECTANGLE_ROUNDING_FACTOR, SHADOWCOLOR, SHADOW_BLUR, SHADOW_OFFSET_X,
  SHADOW_OFFSET_Y, SHADOW_OPACITY, addAlphaToColor, escapeAttr, getFloat, getValue,
  isOne, lightColor, looseEq, mod, normalizeImageSource, styleValue, toNumber,
} from './util.js';

/** A connection point (mxConnectionConstraint): relative x/y plus absolute dx/dy. */
export interface ConnectionConstraint {
  x: number;
  y: number;
  perimeter: boolean;
  dx: number;
  dy: number;
  name?: string;
}

/** new mxConnectionConstraint(new mxPoint(x, y), perimeter, null, dx, dy). */
export function constraint(x: number, y: number, perimeter?: boolean | null, dx?: number, dy?: number): ConnectionConstraint {
  return { x, y, perimeter: perimeter != null ? perimeter : true, dx: dx ? dx : 0, dy: dy ? dy : 0 };
}

/** The part of the canvas API the glass effect paints with (see mxSwimlane.paintTitleGlassEffect). */
export interface GlassCanvas {
  setGradient(color1: string | null, color2: string | null, x: number, y: number, w: number, h: number,
    direction: string | null, alpha1?: number | null, alpha2?: number | null): void;
  begin(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadTo(x1: number, y1: number, x2: number, y2: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  close(): void;
  fill(): void;
}

/** The part of the canvas API addPoints paints with. */
export interface PathCanvas {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadTo(x1: number, y1: number, x2: number, y2: number): void;
  close(): void;
}

export type ShapeClass = new () => Shape;

/** mxCellRenderer.defaultShapes. */
const registry: Record<string, ShapeClass> = Object.create(null) as Record<string, ShapeClass>;

/** mxCellRenderer.registerShape. */
export function registerShape(name: string, ctor: ShapeClass): void {
  registry[name] = ctor;
}

/** mxCellRenderer.getShape: the class registered for a name, or null. */
export function getShapeClass(name: string | null | undefined): ShapeClass | null {
  if (name == null) return null;
  return Object.prototype.hasOwnProperty.call(registry, name) ? registry[name] : null;
}

export function registeredShapeNames(): string[] {
  return Object.keys(registry);
}

/** Colour values mxCellRenderer.resolveColor replaces (mxCellRenderer.placeholderValues). */
export const PLACEHOLDER_COLORS = ['inherit', 'swimlane', 'indicated', 'parentFillColor', 'parentStrokeColor'] as const;

export interface ShadowStyle {
  dx: number;
  dy: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface ConfigureOptions {
  /** Style of the parent cell, for `inherit`, `parentFillColor` and `parentStrokeColor`. */
  parentStyle?: Style | null;
}

type ColorField = 'fill' | 'stroke' | 'gradient' | 'indicatorColor' | 'indicatorGradientColor';

/** mxShape: the painting pipeline every shape shares. */
export class Shape {
  /** The resolved style; empty for shapes that were never applied (eg. label indicators). */
  style: Style = {};
  /** Whether apply() ran, ie. `this.style != null` in mxShape. */
  hasStyle = false;
  bounds: Rect | null = null;
  points: Point[] | null = null;
  scale = 1;
  outline = false;

  fill: string | null = null;
  gradient: string | null = null;
  gradientDirection: string | null = null;
  opacity = 100;
  fillOpacity = 100;
  strokeOpacity = 100;
  fillStyle: string | null = null;
  stroke: string | null = null;
  strokewidth = 1;
  spacing = 0;
  startSize = 0;
  endSize = 0;
  startArrow: string | null = null;
  endArrow: string | null = null;
  rotation = 0;
  direction: string | null = null;
  flipH = false;
  flipV = false;
  isShadow: boolean | null = null;
  isDashed: boolean | null = null;
  isRounded = false;
  glass = false;

  image: string | null = null;
  indicatorShape: ShapeClass | null = null;
  indicatorColor: string | null = null;
  indicatorStrokeColor: string | null = null;
  indicatorGradientColor: string | null = null;
  indicatorDirection: string | null = null;
  indicatorImage: string | null = null;

  /** Default connection points (the prototype's `constraints`). */
  constraints: readonly ConnectionConstraint[] | null = null;

  /** mxShape.apply: copies the style into the shape's fields. */
  apply(style: Style): void {
    this.style = style;
    this.hasStyle = true;
    this.fill = colorValue(getValue(style, 'fillColor', this.fill));
    this.gradient = colorValue(getValue(style, 'gradientColor', this.gradient));
    this.gradientDirection = stringValue(getValue(style, 'gradientDirection', this.gradientDirection));
    this.opacity = toNumber(getValue(style, 'opacity', this.opacity));
    this.fillOpacity = toNumber(getValue(style, 'fillOpacity', this.fillOpacity));
    this.fillStyle = stringValue(getValue(style, 'fillStyle', null));
    this.strokeOpacity = toNumber(getValue(style, 'strokeOpacity', this.strokeOpacity));
    this.stroke = colorValue(getValue(style, 'strokeColor', this.stroke));
    this.strokewidth = numberOr(style, 'strokeWidth', this.strokewidth);
    this.spacing = toNumber(getValue(style, 'spacing', this.spacing));
    this.startSize = numberOr(style, 'startSize', this.startSize);
    this.endSize = numberOr(style, 'endSize', this.endSize);
    this.startArrow = stringValue(getValue(style, 'startArrow', this.startArrow));
    this.endArrow = stringValue(getValue(style, 'endArrow', this.endArrow));
    this.rotation = toNumber(getValue(style, 'rotation', this.rotation));
    this.direction = stringValue(getValue(style, 'direction', this.direction));
    this.flipH = isOne(style, 'flipH', 0);
    this.flipV = isOne(style, 'flipV', 0);

    if (this.direction === 'north' || this.direction === 'south') {
      const tmp = this.flipH;
      this.flipH = this.flipV;
      this.flipV = tmp;
    }

    this.isShadow = looseEq(getValue(style, 'shadow', this.isShadow), 1);
    this.isDashed = looseEq(getValue(style, 'dashed', this.isDashed), 1);
    this.isRounded = looseEq(getValue(style, 'rounded', this.isRounded), 1);
    this.glass = looseEq(getValue(style, 'glass', this.glass), 1);

    if (this.fill === NONE) this.fill = null;
    if (this.gradient === NONE) this.gradient = null;
    if (this.stroke === NONE) this.stroke = null;
  }

  /**
   * mxCellRenderer.configureShape plus postConfigureShape: apply, the image
   * and indicator fields, then the placeholder colours.
   */
  configure(style: Style, options: ConfigureOptions = {}): void {
    this.apply(style);
    this.image = normalizeImageSource(style.image);
    this.indicatorColor = style.indicatorColor ?? null;
    this.indicatorStrokeColor = style.indicatorStrokeColor ?? null;
    this.indicatorGradientColor = style.indicatorGradientColor ?? null;
    this.indicatorDirection = style.indicatorDirection ?? null;
    this.indicatorImage = normalizeImageSource(style.indicatorImage);
    this.indicatorShape = getShapeClass(style.indicatorShape);
    this.resolveColor('indicatorGradientColor', 'gradientColor', options);
    this.resolveColor('indicatorColor', 'fillColor', options);
    this.resolveColor('gradient', 'gradientColor', options);
    this.resolveColor('stroke', 'strokeColor', options);
    this.resolveColor('fill', 'fillColor', options);
  }

  /**
   * mxCellRenderer.resolveColor without a graph: `inherit` and the parent
   * keywords read the parent style if one is given (none otherwise),
   * `swimlane` falls back to black/white as it does without a swimlane.
   */
  protected resolveColor(field: ColorField, key: string, options: ConfigureOptions): void {
    const value = this[field];
    if (value == null) return;
    const parent = options.parentStyle ?? null;
    let referenced: string | null | undefined;
    let resolve = false;
    if (value === 'inherit') {
      resolve = true;
      referenced = parent?.[key];
    } else if (value === 'parentFillColor' || value === 'parentStrokeColor') {
      resolve = true;
      referenced = parent?.[value === 'parentFillColor' ? 'fillColor' : 'strokeColor'];
    } else if (value === 'swimlane') {
      this[field] = key === 'strokeColor' ? '#000000' : '#ffffff';
    } else if (value === 'indicated') {
      this[field] = this.indicatorColor;
    } else if (key !== 'fillColor' && value === 'fillColor') {
      this[field] = this.style.fillColor ?? null;
    } else if (key !== 'strokeColor' && value === 'strokeColor') {
      this[field] = this.style.strokeColor ?? null;
    }
    if (resolve) this[field] = referenced == null || referenced === NONE ? null : referenced;
  }

  isRoundable(): boolean { return false; }
  isGlassable(): boolean { return false; }

  /** mxShape.paint (with Graph's multiple copies), painting into the given canvas. */
  paint(c: SvgCanvas): void {
    if (this.bounds == null) return;
    const s = this.scale;
    let x = this.bounds.x / s;
    let y = this.bounds.y / s;
    let w = this.bounds.width / s;
    let h = this.bounds.height / s;

    if (this.isPaintBoundsInverted()) {
      const t = (w - h) / 2;
      x += t;
      y -= t;
      const tmp = w;
      w = h;
      h = tmp;
    }

    this.updateTransform(c, x, y, w, h);
    this.configureCanvas(c, x, y, w, h);

    // The shadow is a CSS drop-shadow filter on the node of the shape
    // (mxShape.updateSvgFilters), so it covers everything the shape paints
    const filter = this.isShadowEnabled() ? this.createDropShadow(this.getShadowStyle(), c.state.scale) : null;
    if (filter != null) c.beginGroup(`style="filter:${escapeAttr(filter)}"`);

    // Paints into a group with the opacity of the shape
    const opacityGroup = this.isOpacityGroup();
    if (opacityGroup) {
      c.beginGroup(`opacity="${this.opacity / 100}"`);
      c.setAlpha(1);
    }

    this.paintShape(c, x, y, w, h);

    if (opacityGroup) {
      c.endGroup();
      c.setAlpha(this.opacity / 100);
    }
    if (filter != null) c.endGroup();
  }

  /** mxShape.isOpacityGroup. */
  isOpacityGroup(): boolean {
    return this.opacity < 100 && this.hasStyle && looseEq(getValue(this.style, 'opacityGroup', '0'), '1');
  }

  /** Graph.getMultipleCopies for vertices with multiple=1. */
  getMultipleCopies(): { count: number; dx: number; dy: number } | null {
    if (this.points != null || this.outline || !this.hasStyle) return null;
    if (!looseEq(getValue(this.style, 'multiple', '0'), '1')) return null;
    const count = Math.min(10, parseInt(String(getValue(this.style, 'multipleCount', 2)), 10));
    const dx = getFloat(this.style, 'multipleDx', 8);
    const dy = getFloat(this.style, 'multipleDy', -8);
    return count > 0 && Number.isFinite(dx) && Number.isFinite(dy) ? { count, dx, dy } : null;
  }

  /** Graph's mxShape.paintShape: copies of multiple=1 behind the shape, last copy first. */
  paintShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const copies = this.getMultipleCopies();
    if (copies != null) {
      // The offset is on the page, so it is reversed through the
      // rotation and the flips of mxShape.updateTransform
      const rad = this.getShapeRotation() * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let dx = copies.dx * cos + copies.dy * sin;
      let dy = copies.dy * cos - copies.dx * sin;
      dx = this.flipH ? -dx : dx;
      dy = this.flipV ? -dy : dy;
      for (let i = copies.count; i > 0; i--) {
        c.save();
        c.translate(i * dx, i * dy);
        this.paintShapeOnce(c, x, y, w, h);
        c.restore();
      }
    }
    this.paintShapeOnce(c, x, y, w, h);
  }

  /** mxShape.paintShape: the edge or the vertex shape in the configured canvas. */
  protected paintShapeOnce(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // Stencils have separate strokewidth
    c.setStrokeWidth(this.strokewidth);
    const pts = this.getWaypoints();
    if (pts != null) {
      // Paints edge shape
      if (pts.length > 1) this.paintEdgeShape(c, pts);
    } else {
      // Paints vertex shape and resets translates
      const dx = c.state.dx;
      const dy = c.state.dy;
      this.paintVertexShape(c, x, y, w, h);
      c.state.dx = dx;
      c.state.dy = dy;
    }
  }

  /** mxShape.getWaypoints: the points without ones that overlap the previous point. */
  getWaypoints(): Point[] | null {
    const pts = this.points;
    if (pts == null) return null;
    const result: Point[] = [];
    if (pts.length > 0) {
      const s = this.scale;
      const t = Math.max(s, 1);
      let p0 = pts[0];
      result.push({ x: p0.x / s, y: p0.y / s });
      for (let i = 1; i < pts.length; i++) {
        const pe = pts[i];
        if (Math.abs(p0.x - pe.x) >= t || Math.abs(p0.y - pe.y) >= t) {
          result.push({ x: pe.x / s, y: pe.y / s });
        }
        p0 = pe;
      }
    }
    return result;
  }

  /** mxShape.configureCanvas: alpha, dashes, fill or gradient, line style, stroke. */
  configureCanvas(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const dash = this.hasStyle ? styleValue(this.style, 'dashPattern') : undefined;
    c.setAlpha(this.opacity / 100);
    c.setFillAlpha(this.fillOpacity / 100);
    c.setStrokeAlpha(this.strokeOpacity / 100);

    // Sets alpha, colors and gradients
    if (this.isShadow != null) c.setShadow(this.isShadow);

    // Dash pattern
    if (this.isDashed != null) {
      c.setDashed(this.isDashed, this.hasStyle ? isOne(this.style, 'fixDash', false) : false);
    }

    // A numeric pattern (eg. dashPattern=5) is a number in draw.io's parsed
    // style, which mxSvgCanvas2D.createDashPattern ignores: a solid line
    if (dash != null) c.setDashPattern(typeof dash === 'string' ? dash : '');

    if (this.fill != null && this.fill !== NONE && this.gradient && this.gradient !== NONE) {
      const b = this.getGradientBounds(c, x, y, w, h);
      c.setGradient(this.fill, this.gradient, b.x, b.y, b.width, b.height, this.gradientDirection);
    } else {
      c.setFillColor(this.fill);
      c.setFillStyle(this.fillStyle);
    }

    if (this.hasStyle) {
      if (this.style.linecap != null) c.setLineCap(this.style.linecap);
      if (this.style.linejoin != null) c.setLineJoin(this.style.linejoin);
      if (this.style.miterlimit != null) c.setMiterLimit(toNumber(styleValue(this.style, 'miterlimit')));
    }

    c.setStrokeColor(this.stroke);
  }

  /** mxShape.getGradientBounds. */
  getGradientBounds(_c: SvgCanvas, x: number, y: number, w: number, h: number): Rect {
    return { x, y, width: w, height: h };
  }

  /** mxShape.updateTransform: scale, then rotation, direction and flips. */
  updateTransform(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // NOTE: Currently, scale is implemented in state and canvas. This will
    // move to canvas in a later version, so that the states are unscaled
    // and untranslated and do not need an update after zooming or panning.
    c.scale(this.scale);
    c.rotate(this.getShapeRotation(), this.flipH, this.flipV, x + w / 2, y + h / 2);
  }

  /** Whether the foreground is painted: always, as outlines are not painted here. */
  protected paintsForeground(): boolean {
    return !this.outline || !this.hasStyle || looseEq(getValue(this.style, 'backgroundOutline', 0), 0);
  }

  /** mxShape.paintVertexShape. */
  paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    this.paintBackground(c, x, y, w, h);
    if (this.paintsForeground()) {
      c.setShadow(false);
      this.paintForeground(c, x, y, w, h);
    }
  }

  paintBackground(_c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void { /* hook */ }
  paintForeground(_c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void { /* hook */ }
  paintEdgeShape(_c: SvgCanvas, _pts: Point[]): void { /* hook */ }

  /** mxShape.getArcSize. */
  getArcSize(w: number, h: number): number {
    let r = 0;
    if (looseEq(getValue(this.style, 'absoluteArcSize', 0), '1')) {
      r = Math.min(w / 2, Math.min(h / 2, toNumber(getValue(this.style, 'arcSize', LINE_ARCSIZE)) / 2));
    } else {
      const f = toNumber(getValue(this.style, 'arcSize', RECTANGLE_ROUNDING_FACTOR * 100)) / 100;
      r = Math.min(w * f, h * f);
    }
    return r;
  }

  /** `mxUtils.getValue(style, arcSize, LINE_ARCSIZE) / 2`, the corner size of rounded paths. */
  protected lineArcSize(): number {
    return toNumber(getValue(this.style, 'arcSize', LINE_ARCSIZE)) / 2;
  }

  /** Shapes.js mxShape.paintGlassEffect: the highlight over the top part of the shape. */
  paintGlassEffect(c: GlassCanvas, x: number, y: number, w: number, h: number, arc: number): void {
    const sw = Math.ceil(this.strokewidth / 2);
    c.setGradient('#ffffff', '#ffffff', x, y, w, h * 0.6, 'south', 0.9, 0.1);
    c.begin();
    this.paintGlassEffectPath(c, x, y, w, h, sw, arc);
    c.close();
    c.fill();
  }

  /** Shapes.js mxShape.paintGlassEffectPath. */
  paintGlassEffectPath(c: GlassCanvas, x: number, y: number, w: number, h: number, sw: number, arc: number): void {
    arc += 2 * sw;
    if (this.isRounded) {
      c.moveTo(x - sw + arc, y - sw);
      c.quadTo(x - sw, y - sw, x - sw, y - sw + arc);
      c.lineTo(x - sw, y + h * 0.4);
      c.quadTo(x + w * 0.5, y + h * 0.7, x + w + sw, y + h * 0.4);
      c.lineTo(x + w + sw, y - sw + arc);
      c.quadTo(x + w + sw, y - sw, x + w + sw - arc, y - sw);
    } else {
      c.moveTo(x - sw, y - sw);
      c.lineTo(x - sw, y + h * 0.4);
      c.quadTo(x + w * 0.5, y + h * 0.7, x + w + sw, y + h * 0.4);
      c.lineTo(x + w + sw, y - sw);
    }
  }

  /** mxShape.addPoints: the given points with rounded corners. */
  addPoints(c: PathCanvas, pts: Point[] | null, rounded: boolean, arcSize: number, close: boolean,
    exclude?: number[] | null, initialMove?: boolean | null): void {
    if (pts == null || pts.length === 0) return;
    initialMove = initialMove != null ? initialMove : true;
    const pe = pts[pts.length - 1];

    // Adds virtual waypoint in the center between start and end point
    if (close && rounded) {
      pts = pts.slice();
      const p0 = pts[0];
      const wp = { x: pe.x + (p0.x - pe.x) / 2, y: pe.y + (p0.y - pe.y) / 2 };
      pts.splice(0, 0, wp);
    }

    let pt = pts[0];
    let i = 1;

    // Draws the line segments
    if (initialMove) c.moveTo(pt.x, pt.y);
    else c.lineTo(pt.x, pt.y);

    while (i < (close ? pts.length : pts.length - 1)) {
      let tmp = pts[mod(i, pts.length)];
      let dx = pt.x - tmp.x;
      let dy = pt.y - tmp.y;

      if (rounded && (dx !== 0 || dy !== 0) && (exclude == null || exclude.indexOf(i - 1) < 0)) {
        // Draws a line from the last point to the current
        // point with a spacing of size off the current point
        // into direction of the last point
        let dist = Math.sqrt(dx * dx + dy * dy);
        const nx1 = dx * Math.min(arcSize, dist / 2) / dist;
        const ny1 = dy * Math.min(arcSize, dist / 2) / dist;
        const x1 = tmp.x + nx1;
        const y1 = tmp.y + ny1;
        c.lineTo(x1, y1);

        // Draws a curve from the last point to the current
        // point with a spacing of size off the current point
        // into direction of the next point
        let next = pts[mod(i + 1, pts.length)];

        // Uses next non-overlapping point
        while (i < pts.length - 2 && Math.round(next.x - tmp.x) === 0 && Math.round(next.y - tmp.y) === 0) {
          next = pts[mod(i + 2, pts.length)];
          i++;
        }

        dx = next.x - tmp.x;
        dy = next.y - tmp.y;
        dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const nx2 = dx * Math.min(arcSize, dist / 2) / dist;
        const ny2 = dy * Math.min(arcSize, dist / 2) / dist;
        const x2 = tmp.x + nx2;
        const y2 = tmp.y + ny2;
        c.quadTo(tmp.x, tmp.y, x2, y2);
        tmp = { x: x2, y: y2 };
      } else {
        c.lineTo(tmp.x, tmp.y);
      }

      pt = tmp;
      i++;
    }

    if (close) c.close();
    else c.lineTo(pe.x, pe.y);
  }

  /** mxShape.isPaintBoundsInverted. */
  isPaintBoundsInverted(): boolean {
    // Stencil implements inversion via aspect
    return this.direction === 'north' || this.direction === 'south';
  }

  getRotation(): number {
    return this.rotation != null ? this.rotation : 0;
  }

  /** mxShape.getShapeRotation: rotation plus the turn of the direction. */
  getShapeRotation(): number {
    let rot = this.getRotation();
    if (this.direction != null) {
      if (this.direction === 'north') rot += 270;
      else if (this.direction === 'west') rot += 180;
      else if (this.direction === 'south') rot += 90;
    }
    return rot;
  }

  isShadowEnabled(): boolean {
    return this.isShadow === true;
  }

  /** mxShape.getShadowStyle. */
  getShadowStyle(): ShadowStyle {
    const s: ShadowStyle = {
      dx: SHADOW_OFFSET_X, dy: SHADOW_OFFSET_Y, blur: SHADOW_BLUR, color: SHADOWCOLOR, opacity: SHADOW_OPACITY * 100,
    };
    if (this.hasStyle) {
      s.dx = toNumber(getValue(this.style, 'shadowOffsetX', s.dx));
      s.dy = toNumber(getValue(this.style, 'shadowOffsetY', s.dy));
      s.blur = toNumber(getValue(this.style, 'shadowBlur', s.blur));
      const color = String(getValue(this.style, 'shadowColor', s.color));
      // The color is used in drop-shadow(), where a closing parenthesis
      // and url() would add a filter that is loaded (see createDropShadow)
      if (!/url\(/i.test(color) && !/[;{}]/.test(color)) s.color = color;
      s.opacity = toNumber(getValue(this.style, 'shadowOpacity', s.opacity));
    }
    return s;
  }

  /** mxShape.createDropShadow: the CSS filter, with the light colour of light-dark(). */
  createDropShadow(style: ShadowStyle, scale: number): string {
    const alpha = style.opacity / 100;
    const color = style.color === NONE ? 'transparent' : addAlphaToColor(lightColor(style.color), alpha);
    const r = (v: number) => Math.round(v * scale * 100) / 100;
    return `drop-shadow(${r(style.dx)}px ${r(style.dy)}px ${r(style.blur)}px ${color})`;
  }

  /** mxShape.getConstraints: connection points that depend on the size; null for the static ones. */
  getConstraints(_style: Style, _w: number, _h: number): ConnectionConstraint[] | null {
    return null;
  }
}

/** A colour field value: none stays 'none' (apply turns it into null), numbers become strings. */
function colorValue(value: string | number | boolean | null | undefined): string | null {
  if (value == null || value === false) return null;
  return String(value);
}

function stringValue(value: string | number | boolean | null | undefined): string | null {
  return value == null ? null : String(value);
}

/** mxUtils.getNumber(style, key, current): Number of the value or the current value. */
function numberOr(style: Style, key: string, current: number): number {
  const value = styleValue(style, key);
  return value == null ? current : Number(value);
}

// --- mxActor -----------------------------------------------------------------

export const ACTOR_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.5, 0, true), constraint(0.25, 0.2, false), constraint(0.1, 0.5, false), constraint(0, 0.75, true),
  constraint(0.75, 0.25, false), constraint(0.9, 0.5, false), constraint(1, 0.75, true), constraint(0.25, 1, true),
  constraint(0.5, 1, true), constraint(0.75, 1, true),
];

/** mxActor: one filled path drawn by redrawPath in local coordinates. */
export class Actor extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = ACTOR_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    this.redrawPath(c, x, y, w, h);
    c.fillAndStroke();
  }

  redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const width = w / 3;
    c.moveTo(0, h);
    c.curveTo(0, 3 * h / 5, 0, 2 * h / 5, w / 2, 2 * h / 5);
    c.curveTo(w / 2 - width, 2 * h / 5, w / 2 - width, 0, w / 2, 0);
    c.curveTo(w / 2 + width, 0, w / 2 + width, 2 * h / 5, w / 2, 2 * h / 5);
    c.curveTo(w, 2 * h / 5, w, 3 * h / 5, w, h);
    c.close();
  }
}

// --- mxCylinder ----------------------------------------------------------------

export const CYLINDER_CONSTRAINTS: readonly ConnectionConstraint[] = [
  constraint(0.15, 0.05, false), constraint(0.5, 0, true), constraint(0.85, 0.05, false),
  constraint(0, 0.3, true), constraint(0, 0.5, true), constraint(0, 0.7, true),
  constraint(1, 0.3, true), constraint(1, 0.5, true), constraint(1, 0.7, true),
  constraint(0.15, 0.95, false), constraint(0.5, 1, true), constraint(0.85, 0.95, false),
];

/** mxCylinder: a filled background path plus a stroked foreground path. */
export class Cylinder extends Shape {
  maxHeight = 40;
  override constraints: readonly ConnectionConstraint[] | null = CYLINDER_CONSTRAINTS;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    c.begin();
    this.redrawPath(c, x, y, w, h, false);
    c.fillAndStroke();

    if (this.paintsForeground()) {
      c.setShadow(false);
      c.begin();
      this.redrawPath(c, x, y, w, h, true);
      c.stroke();
    }
  }

  /** Shapes.js override: the `size` style is a fraction of the height. */
  getCylinderSize(_x: number, _y: number, _w: number, h: number): number {
    const size = styleValue(this.style, 'size');
    if (size != null) return h * Math.max(0, Math.min(1, toNumber(size)));
    return Math.min(this.maxHeight, Math.round(h / 5));
  }

  redrawPath(c: SvgCanvas, x: number, y: number, w: number, h: number, isForeground: boolean): void {
    const dy = this.getCylinderSize(x, y, w, h);

    if ((isForeground && this.fill != null) || (!isForeground && this.fill == null)) {
      c.moveTo(0, dy);
      c.curveTo(0, 2 * dy, w, 2 * dy, w, dy);

      // Needs separate shapes for correct hit-detection
      if (!isForeground) {
        c.stroke();
        c.begin();
      }
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

/** Points helpers for ports that build mxPoint arrays. */
export function pt(x: number, y: number): Point {
  return { x, y };
}
