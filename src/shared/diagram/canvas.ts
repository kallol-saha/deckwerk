/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/util/mxAbstractCanvas2D.js and mxSvgCanvas2D.js.
 * Modified for DeckWerk: emits an SVG string instead of DOM nodes, so it
 * runs without a document; no text, links, tolerance or pointer events.
 */

/**
 * A drawing canvas with draw.io's API (mxAbstractCanvas2D), so shape code
 * from draw.io ports line for line. Paint calls build SVG markup; `svg()`
 * returns it. Coordinates are scaled by `state.scale` after translating by
 * `state.dx/dy`, and rounded to two decimals as mxSvgCanvas2D does.
 */

export interface CanvasState {
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
  fillAlpha: number;
  strokeAlpha: number;
  fillColor: string | null;
  gradientFillAlpha: number;
  gradientColor: string | null;
  gradientAlpha: number;
  gradientDirection: string | null;
  fillStyle: string | null;
  hachureGap: StyleNumber;
  fillWeight: StyleNumber;
  hachureAngle: StyleNumber;
  strokeColor: string | null;
  strokeWidth: number;
  dashed: boolean;
  dashPattern: string;
  fixDash: boolean;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  shadow: boolean;
  shadowColor: string | null;
  shadowAlpha: number;
  shadowDx: number;
  shadowDy: number;
  rotation: number;
  rotationCx: number;
  rotationCy: number;
  /** SVG transform for rotation and flips, as mxSvgCanvas2D keeps it. */
  transform: string;
  fontColor: string | null;
  fontSize: number;
  fontFamily: string;
  fontStyle: number;
}

/** A style value read as draw.io parses it (a number for numeric strings), or null. */
export type StyleNumber = string | number | null;

/** mxConstants.DEFAULT_FONTFAMILY, DEFAULT_FONTSIZE and LINE_HEIGHT. */
export const DEFAULT_FONTFAMILY = 'Arial,Helvetica';
export const DEFAULT_FONTSIZE = 11;
const LINE_HEIGHT = 1.2;

export const SHADOW_COLOR = '#000000';
export const SHADOW_OPACITY = 0.25;
export const SHADOW_OFFSET_X = 2;
export const SHADOW_OFFSET_Y = 3;

/**
 * What replaces the path and paint calls of a canvas for hand-drawn styles
 * (draw.io installs these as canvas methods; the original methods run
 * while `passThrough` is set).
 */
export interface HandJiggle {
  passThrough: boolean;
  begin(): void;
  end(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadTo(x1: number, y1: number, x2: number, y2: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void;
  arcTo(rx: number, ry: number, angle: number, largeArcFlag: number, sweepFlag: number, x: number, y: number): void;
  close(): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundrect(x: number, y: number, w: number, h: number, dx: number, dy: number): void;
  ellipse(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  fillAndStroke(): void;
}

interface PendingNode {
  tag: 'path' | 'rect' | 'ellipse';
  attrs: Record<string, string | number>;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Two decimals, as mxSvgCanvas2D.format. */
export function fmt(value: number): number {
  return parseFloat(value.toFixed(2));
}

/**
 * The colour a slide shows for a draw.io colour value. Slides are light, so
 * `light-dark(a, b)` resolves to `a`; `none` is no paint.
 */
export function resolveColor(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'none') return null;
  const lightDark = /^light-dark\(\s*([^,]+?)\s*,/i.exec(trimmed);
  if (lightDark) return lightDark[1];
  return trimmed;
}

/** mxUtils.arcToCurves: an SVG arc as cubic Bézier segments (x1,y1,x2,y2,x,y)*. */
export function arcToCurves(
  x0: number, y0: number, r1: number, r2: number, angle: number,
  largeArcFlag: number, sweepFlag: number, x: number, y: number,
): number[] {
  x -= x0;
  y -= y0;
  if (x === 0 && y === 0) return [];
  if (r1 === 0 || r2 === 0) return [x0, y0, x + x0, y + y0, x + x0, y + y0];
  const fS = sweepFlag;
  const psai = angle;
  r1 = Math.abs(r1);
  r2 = Math.abs(r2);
  const ctx = -x / 2;
  const cty = -y / 2;
  const cpsi = Math.cos(psai * Math.PI / 180);
  const spsi = Math.sin(psai * Math.PI / 180);
  const rxd = cpsi * ctx + spsi * cty;
  const ryd = -1 * spsi * ctx + cpsi * cty;
  const rxdd = rxd * rxd;
  const rydd = ryd * ryd;
  const r1x = r1 * r1;
  const r2y = r2 * r2;
  const lamda = rxdd / r1x + rydd / r2y;
  let sds: number;
  if (lamda > 1) {
    r1 = Math.sqrt(lamda) * r1;
    r2 = Math.sqrt(lamda) * r2;
    sds = 0;
  } else {
    let seif = 1;
    if (largeArcFlag === fS) seif = -1;
    sds = seif * Math.sqrt(Math.max(0, (r1x * r2y - r1x * rydd - r2y * rxdd) / (r1x * rydd + r2y * rxdd)));
  }
  const txd = sds * r1 * ryd / r2;
  const tyd = -1 * sds * r2 * rxd / r1;
  const tx = cpsi * txd - spsi * tyd + x / 2;
  const ty = spsi * txd + cpsi * tyd + y / 2;
  let rad = Math.atan2((ryd - tyd) / r2, (rxd - txd) / r1) - Math.atan2(0, 1);
  let s1 = (rad >= 0) ? rad : 2 * Math.PI + rad;
  rad = Math.atan2((-ryd - tyd) / r2, (-rxd - txd) / r1) - Math.atan2((ryd - tyd) / r2, (rxd - txd) / r1);
  let dr = (rad >= 0) ? rad : 2 * Math.PI + rad;
  if (fS === 0 && dr > 0) dr -= 2 * Math.PI;
  else if (fS !== 0 && dr < 0) dr += 2 * Math.PI;
  const sse = dr * 2 / Math.PI;
  const seg = Math.ceil(sse < 0 ? -1 * sse : sse);
  const segr = dr / seg;
  const t = 8 / 3 * Math.sin(segr / 4) * Math.sin(segr / 4) / Math.sin(segr / 2);
  const cpsir1 = cpsi * r1;
  const cpsir2 = cpsi * r2;
  const spsir1 = spsi * r1;
  const spsir2 = spsi * r2;
  let mc = Math.cos(s1);
  let ms = Math.sin(s1);
  let x2 = -t * (cpsir1 * ms + spsir2 * mc);
  let y2 = -t * (spsir1 * ms - cpsir2 * mc);
  const result: number[] = [];
  for (let n = 0; n < seg; ++n) {
    s1 += segr;
    mc = Math.cos(s1);
    ms = Math.sin(s1);
    const x3 = cpsir1 * mc - spsir2 * ms + tx;
    const y3 = spsir1 * mc + cpsir2 * ms + ty;
    const dx = -t * (cpsir1 * ms + spsir2 * mc);
    const dy = -t * (spsir1 * ms - cpsir2 * mc);
    const index = n * 6;
    result[index] = x2 + x0;
    result[index + 1] = y2 + y0;
    result[index + 2] = x3 - dx + x0;
    result[index + 3] = y3 - dy + y0;
    result[index + 4] = x3 + x0;
    result[index + 5] = y3 + y0;
    x2 = x3 + dx;
    y2 = y3 + dy;
  }
  return result;
}

export class SvgCanvas {
  state: CanvasState;
  /** The saved states (mxAbstractCanvas2D.states); stencils reset it after unbalanced saves. */
  states: CanvasState[] = [];
  private path: Array<string | number> | null = null;
  private node: PendingNode | null = null;
  lastX = 0;
  lastY = 0;
  /** Open groups: each holds the markup of its children. */
  private stack: string[][] = [[]];
  private groupOpen: string[] = [];
  private defs: string[] = [];
  private gradients = new Map<string, string>();
  private patterns = new Map<string, string>();
  /**
   * mxSvgCanvas2D.viewTranslate: where the diagram's origin is in the
   * painted coordinates' units (draw.io units), so fill patterns line up
   * across cells; null anchors them at the canvas origin.
   */
  viewTranslate: { x: number; y: number } | null = null;
  private refCount = 0;
  /** Prefix for ids in `<defs>`, so several canvases can share a page. */
  readonly idPrefix: string;
  /**
   * mxSvgCanvas2D.minStrokeWidth: 0.1, as draw.io's Graph sets for every shape
   * and export (cellRenderer.minSvgStrokeWidth), so thin strokes stay thin.
   */
  minStrokeWidth = 0.1;
  pointerEvents = false;
  /**
   * draw.io's canvas.handJiggle: while set and not passing through, the
   * path and paint calls go to it (the sketch style redraws them with
   * rough.js, see sketch.ts), which paints back through this canvas.
   */
  handJiggle: HandJiggle | null = null;

  constructor(options: { idPrefix?: string } = {}) {
    this.idPrefix = options.idPrefix ?? 'dg';
    this.state = SvgCanvas.createState();
  }

  static createState(): CanvasState {
    return {
      dx: 0, dy: 0, scale: 1,
      alpha: 1, fillAlpha: 1, strokeAlpha: 1,
      fillColor: null, gradientFillAlpha: 1, gradientColor: null, gradientAlpha: 1, gradientDirection: null,
      fillStyle: null, hachureGap: null, fillWeight: null, hachureAngle: null,
      strokeColor: null, strokeWidth: 1,
      dashed: false, dashPattern: '3 3', fixDash: false,
      lineCap: 'flat', lineJoin: 'miter', miterLimit: 10,
      shadow: false, shadowColor: SHADOW_COLOR, shadowAlpha: SHADOW_OPACITY,
      shadowDx: SHADOW_OFFSET_X, shadowDy: SHADOW_OFFSET_Y,
      rotation: 0, rotationCx: 0, rotationCy: 0,
      transform: '',
      fontColor: '#000000', fontSize: DEFAULT_FONTSIZE, fontFamily: DEFAULT_FONTFAMILY, fontStyle: 0,
    };
  }

  format(value: number): number {
    return fmt(value);
  }

  // --- state -------------------------------------------------------------

  save(): void {
    this.states.push(this.state);
    this.state = { ...this.state };
  }

  restore(): void {
    const previous = this.states.pop();
    if (previous) this.state = previous;
  }

  scale(value: number): void {
    this.state.scale *= value;
    this.state.strokeWidth *= value;
  }

  translate(dx: number, dy: number): void {
    this.state.dx += dx;
    this.state.dy += dy;
  }

  /** mxSvgCanvas2D.rotate: built-in rotation plus a flip about (cx, cy). */
  rotate(theta: number, flipH: boolean, flipV: boolean, cx: number, cy: number): void {
    if (theta === 0 && !flipH && !flipV) return;
    const s = this.state;
    cx = (cx + s.dx) * s.scale;
    cy = (cy + s.dy) * s.scale;
    if (flipH && flipV) {
      theta += 180;
    } else if (flipH !== flipV) {
      const tx = flipH ? cx : 0;
      const sx = flipH ? -1 : 1;
      const ty = flipV ? cy : 0;
      const sy = flipV ? -1 : 1;
      s.transform += `translate(${fmt(tx)},${fmt(ty)})scale(${fmt(sx)},${fmt(sy)})translate(${fmt(-tx)},${fmt(-ty)})`;
    }
    if (flipH ? !flipV : flipV) theta *= -1;
    if (theta !== 0) s.transform += `rotate(${fmt(theta)},${fmt(cx)},${fmt(cy)})`;
    s.rotation += theta;
    s.rotationCx = cx;
    s.rotationCy = cy;
  }

  setAlpha(value: number): void { this.state.alpha = value; }
  setFillAlpha(value: number): void { this.state.fillAlpha = value; }
  setStrokeAlpha(value: number): void { this.state.strokeAlpha = value; }

  setFillColor(value: string | null): void {
    this.state.fillColor = resolveColor(value);
    this.state.gradientColor = null;
  }

  /**
   * mxAbstractCanvas2D.setFillStyle: the fill style and the optional hachure
   * gap, fill weight and hachure angle of the pattern fill styles.
   */
  setFillStyle(value: string | null, hachureGap?: StyleNumber, fillWeight?: StyleNumber, hachureAngle?: StyleNumber): void {
    this.state.fillStyle = value === 'none' ? null : value;
    this.state.hachureGap = hachureGap ?? null;
    this.state.fillWeight = fillWeight ?? null;
    this.state.hachureAngle = hachureAngle ?? null;
  }

  setGradient(
    color1: string | null, color2: string | null,
    _x: number, _y: number, _w: number, _h: number,
    direction: string | null, alpha1?: number | null, alpha2?: number | null,
  ): void {
    const s = this.state;
    s.fillColor = color1 == null ? null : (resolveColor(color1) ?? 'none');
    s.gradientFillAlpha = alpha1 ?? 1;
    s.gradientColor = resolveColor(color2);
    s.gradientAlpha = alpha2 ?? 1;
    s.gradientDirection = direction;
  }

  setStrokeColor(value: string | null): void { this.state.strokeColor = resolveColor(value); }
  setStrokeWidth(value: number): void { this.state.strokeWidth = value; }

  setDashed(value: boolean, fixDash?: boolean): void {
    this.state.dashed = value;
    this.state.fixDash = Boolean(fixDash);
  }

  setDashPattern(value: string): void { this.state.dashPattern = value; }
  setLineCap(value: string): void { this.state.lineCap = value; }
  setLineJoin(value: string): void { this.state.lineJoin = value; }
  setMiterLimit(value: number): void { this.state.miterLimit = value; }

  setFontColor(value: string | null): void {
    this.state.fontColor = value === 'none' ? null : value;
  }

  setFontSize(value: number | string): void { this.state.fontSize = parseFloat(String(value)); }
  setFontFamily(value: string): void { this.state.fontFamily = value; }
  setFontStyle(value: number | string | null): void { this.state.fontStyle = value == null ? 0 : Number(value); }

  setShadow(enabled: boolean): void { this.state.shadow = enabled; }
  setShadowColor(value: string | null): void { this.state.shadowColor = value === 'none' ? null : value; }
  setShadowAlpha(value: number): void { this.state.shadowAlpha = value; }
  setShadowOffset(dx: number, dy: number): void {
    this.state.shadowDx = dx;
    this.state.shadowDy = dy;
  }

  // --- paths ---------------------------------------------------------------

  private addOp(op: string, ...coords: number[]): void {
    if (this.path == null) return;
    this.path.push(op);
    const s = this.state;
    for (let i = 0; i + 1 < coords.length; i += 2) {
      this.lastX = coords[i];
      this.lastY = coords[i + 1];
      this.path.push(fmt((this.lastX + s.dx) * s.scale));
      this.path.push(fmt((this.lastY + s.dy) * s.scale));
    }
  }

  /** The active hand jiggle (sketch=1), if it takes the path and paint calls now. */
  private jiggle(): HandJiggle | null {
    const j = this.handJiggle;
    return j != null && !j.passThrough ? j : null;
  }

  begin(): void {
    const j = this.jiggle();
    if (j != null) {
      j.begin();
      return;
    }
    this.lastX = 0;
    this.lastY = 0;
    this.path = [];
    this.node = { tag: 'path', attrs: {} };
  }

  moveTo(x: number, y: number): void {
    const j = this.jiggle();
    if (j != null) j.moveTo(x, y);
    else this.addOp('M', x, y);
  }

  lineTo(x: number, y: number): void {
    const j = this.jiggle();
    if (j != null) j.lineTo(x, y);
    else this.addOp('L', x, y);
  }

  quadTo(x1: number, y1: number, x2: number, y2: number): void {
    const j = this.jiggle();
    if (j != null) j.quadTo(x1, y1, x2, y2);
    else this.addOp('Q', x1, y1, x2, y2);
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    const j = this.jiggle();
    if (j != null) j.curveTo(x1, y1, x2, y2, x3, y3);
    else this.addOp('C', x1, y1, x2, y2, x3, y3);
  }

  arcTo(rx: number, ry: number, angle: number, largeArcFlag: number, sweepFlag: number, x: number, y: number): void {
    const j = this.jiggle();
    if (j != null) {
      j.arcTo(rx, ry, angle, largeArcFlag, sweepFlag, x, y);
      return;
    }
    const curves = arcToCurves(this.lastX, this.lastY, rx, ry, angle, largeArcFlag, sweepFlag, x, y);
    for (let i = 0; i + 5 < curves.length; i += 6) {
      this.curveTo(curves[i], curves[i + 1], curves[i + 2], curves[i + 3], curves[i + 4], curves[i + 5]);
    }
  }

  close(): void {
    const j = this.jiggle();
    if (j != null) j.close();
    else this.addOp('Z');
  }

  end(): void {
    const j = this.jiggle();
    if (j != null) j.end();
  }

  rect(x: number, y: number, w: number, h: number): void {
    const j = this.jiggle();
    if (j != null) {
      j.rect(x, y, w, h);
      return;
    }
    const s = this.state;
    this.path = null;
    this.node = {
      tag: 'rect',
      attrs: {
        x: fmt((x + s.dx) * s.scale),
        y: fmt((y + s.dy) * s.scale),
        width: fmt(w * s.scale),
        height: fmt(h * s.scale),
      },
    };
  }

  roundrect(x: number, y: number, w: number, h: number, dx: number, dy: number): void {
    const j = this.jiggle();
    if (j != null) {
      j.roundrect(x, y, w, h, dx, dy);
      return;
    }
    this.rect(x, y, w, h);
    if (!this.node) return;
    if (dx > 0) this.node.attrs.rx = fmt(dx * this.state.scale);
    if (dy > 0) this.node.attrs.ry = fmt(dy * this.state.scale);
  }

  ellipse(x: number, y: number, w: number, h: number): void {
    const j = this.jiggle();
    if (j != null) {
      j.ellipse(x, y, w, h);
      return;
    }
    const s = this.state;
    this.path = null;
    this.node = {
      tag: 'ellipse',
      attrs: {
        cx: fmt((x + w / 2 + s.dx) * s.scale),
        cy: fmt((y + h / 2 + s.dy) * s.scale),
        rx: fmt(w / 2 * s.scale),
        ry: fmt(h / 2 * s.scale),
      },
    };
  }

  image(x: number, y: number, w: number, h: number, src: string, aspect: boolean, flipH = false, flipV = false): void {
    const s = this.state;
    x = (x + s.dx) * s.scale;
    y = (y + s.dy) * s.scale;
    w *= s.scale;
    h *= s.scale;
    const attrs: string[] = [
      `x="${fmt(x)}"`, `y="${fmt(y)}"`, `width="${fmt(w)}"`, `height="${fmt(h)}"`,
      `href="${escapeAttr(src)}"`,
    ];
    if (!aspect) attrs.push('preserveAspectRatio="none"');
    if (s.alpha < 1 || s.fillAlpha < 1) attrs.push(`opacity="${s.alpha * s.fillAlpha}"`);
    let transform = s.transform;
    if (flipH || flipV) {
      let sx = 1;
      let sy = 1;
      let dx = 0;
      let dy = 0;
      if (flipH) { sx = -1; dx = -w - 2 * x; }
      if (flipV) { sy = -1; dy = -h - 2 * y; }
      transform += `scale(${sx},${sy})translate(${fmt(dx * s.scale)},${fmt(dy * s.scale)})`;
    }
    if (transform) attrs.push(`transform="${transform}"`);
    this.emit(`<image ${attrs.join(' ')}/>`);
  }

  /**
   * mxSvgCanvas2D.text for plain text (mxSvgCanvas2D.plainText): one
   * `<text>` per line at the anchor point, aligned by text-anchor and by
   * offsetting the first baseline. HTML, wrapping and clipping are not
   * supported (stencils and shapes paint plain, unwrapped text).
   */
  text(x: number, y: number, w: number, h: number, str: string | null, align: string | null, valign: string | null,
    _wrap?: boolean, _format?: string, overflow?: string | null, _clip?: boolean, rotation?: number | null): void {
    if (str == null) return;
    const s = this.state;
    x += s.dx;
    y += s.dy;
    rotation = rotation ?? 0;
    const size = s.fontSize;
    let tr = s.transform || '';
    if (rotation !== 0) tr += `rotate(${rotation},${fmt(x * s.scale)},${fmt(y * s.scale)})`;
    const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
    const attrs: string[] = [];
    if (s.fontColor != null) attrs.push(`fill="${escapeAttr(resolveColor(s.fontColor) ?? s.fontColor)}"`);
    attrs.push(`font-family="${escapeAttr(s.fontFamily)}"`);
    if ((s.fontStyle & 1) === 1) attrs.push('font-weight="bold"');
    if ((s.fontStyle & 2) === 2) attrs.push('font-style="italic"');
    const decoration: string[] = [];
    if ((s.fontStyle & 4) === 4) decoration.push('underline');
    if ((s.fontStyle & 8) === 8) decoration.push('line-through');
    if (decoration.length > 0) attrs.push(`text-decoration="${decoration.join(' ')}"`);
    attrs.push('pointer-events="none"', `text-anchor="${anchor}"`);
    if (tr.length > 0) attrs.push(`transform="${tr}"`);
    if (s.alpha < 1) attrs.push(`opacity="${s.alpha}"`);
    attrs.push(`font-size="${fmt(size * s.scale)}px"`);

    const lines = str.split('\n');
    const lh = Math.round(size * LINE_HEIGHT);
    const textHeight = size + (lines.length - 1) * lh;
    let cy = y + size - 1;
    if (valign === 'middle') cy -= overflow === 'fill' ? h / 2 : textHeight / 2;
    else if (valign === 'bottom') cy -= overflow === 'fill' ? h : textHeight + 1;
    let body = '';
    for (const line of lines) {
      // Workaround for bounding box of empty lines and spaces
      if (line.length > 0 && line.trim().length > 0) {
        body += `<text x="${fmt(x * s.scale)}" y="${fmt(cy * s.scale)}">${escapeAttr(line)}</text>`;
      }
      cy += lh;
    }
    void w;
    if (body.length > 0) this.emit(`<g ${attrs.join(' ')}>${body}</g>`);
  }

  // --- painting -------------------------------------------------------------

  stroke(): void {
    const j = this.jiggle();
    if (j != null) j.stroke();
    else this.addNode(false, true);
  }

  fill(): void {
    const j = this.jiggle();
    if (j != null) j.fill();
    else this.addNode(true, false);
  }

  fillAndStroke(): void {
    const j = this.jiggle();
    if (j != null) j.fillAndStroke();
    else this.addNode(true, true);
  }

  private currentStrokeWidth(): number {
    return Math.max(this.minStrokeWidth, Math.max(0.01, fmt(this.state.strokeWidth * this.state.scale)));
  }

  private createDashPattern(scale: number): string {
    const out: number[] = [];
    for (const token of this.state.dashPattern.split(' ')) {
      const value = Number(token);
      if (token !== '' && Number.isFinite(value)) out.push(Math.round(value * scale * 100) / 100);
    }
    return out.join(' ');
  }

  private gradientId(start: string, end: string, alpha1: number, alpha2: number, direction: string | null): string {
    let a = `${start.toLowerCase()}-${alpha1}`;
    let b = `${end.toLowerCase()}-${alpha2}`;
    let dir = 's';
    if (direction == null || direction === 'south') dir = 's';
    else if (direction === 'east') dir = 'e';
    else if (direction === 'radial') dir = 'r';
    else {
      [a, b] = [b, a];
      dir = direction === 'north' ? 's' : 'e';
    }
    const key = `${a}-${b}-${dir}`;
    let id = this.gradients.get(key);
    if (id) return id;
    id = `${this.idPrefix}-g${++this.refCount}`;
    this.gradients.set(key, id);
    const radial = direction === 'radial';
    const coords = { x1: '0%', y1: '0%', x2: '0%', y2: '0%' };
    if (direction == null || direction === 'south') coords.y2 = '100%';
    else if (direction === 'east') coords.x2 = '100%';
    else if (direction === 'north') coords.y1 = '100%';
    else if (direction === 'west') coords.x1 = '100%';
    const tag = radial ? 'radialGradient' : 'linearGradient';
    const geometry = radial ? '' : ` x1="${coords.x1}" y1="${coords.y1}" x2="${coords.x2}" y2="${coords.y2}"`;
    this.defs.push(
      `<${tag} id="${id}"${geometry}>`
      + `<stop offset="0%" stop-color="${escapeAttr(start)}" stop-opacity="${alpha1}"/>`
      + `<stop offset="100%" stop-color="${escapeAttr(end)}" stop-opacity="${alpha2}"/>`
      + `</${tag}>`,
    );
    return id;
  }

  /**
   * mxSvgCanvas2D.getFillPattern: the id of a `<pattern>` for the fill
   * style (hatch, dots, cross-hatch, dashed, zigzag-line), or null for
   * styles without one (they fill solid). hachureGap, fillWeight and
   * hachureAngle override the spacing, line width and angle derived from
   * the stroke width. The tiles are anchored at the diagram's origin (see
   * viewTranslate).
   */
  private fillPatternId(type: string, strokeSize: number, color: string, scale: number,
    hachureGap: StyleNumber, fillWeight: StyleNumber, hachureAngle: StyleNumber): string | null {
    // Validates overrides from untrusted styles where -1, auto and
    // non-numeric values mean unset. The gap is clamped to a minimum
    // of 1 to avoid degenerate patterns.
    let gap: number | null = parseFloat(String(hachureGap));
    gap = (!Number.isFinite(gap) || gap <= 0) ? null : Math.max(1, gap);
    let weight: number | null = parseFloat(String(fillWeight));
    weight = (!Number.isFinite(weight) || weight <= 0) ? null : weight;
    let angle: number | null = parseFloat(String(hachureAngle));
    angle = !Number.isFinite(angle) ? null : angle;

    // If any pattern property is set then the unset properties use the
    // rough.js automatic values so that the same style looks similar in
    // sketch and normal mode. If no property is set, the legacy pattern
    // geometry derived from the stroke width is used unchanged.
    if (gap != null || weight != null || angle != null) {
      gap = gap ?? Math.max(1, strokeSize * 4);
      weight = weight ?? strokeSize / 2;
      angle = angle ?? -41;
    }

    let content: string;
    let size: number;
    const stroke = escapeAttr(color);
    if (type === 'hatch' || type === 'dashed') {
      const baseSW = weight ?? strokeSize * 1.5;
      size = fmt(gap ?? 10 + baseSW);
      // A weight is set if any pattern property is used and is the visible
      // stripe width so the stroke is drawn centered in the tile
      const x = weight != null ? size / 2 : 0;
      const y1 = type === 'dashed' ? size / 4 : 0;
      const y2 = type === 'dashed' ? 3 * size / 4 : size;
      content = `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="${baseSW}"/>`;
    } else if (type === 'zigzag' || type === 'zigzag-line') {
      const baseSW = weight ?? strokeSize * 1.5;
      size = fmt(gap ?? 10 + baseSW);
      const s14 = size / 4;
      const s34 = 3 * size / 4;
      content = `<path d="M ${s14} 0 L ${s34} 0 L ${s14} ${size} L ${s34} ${size}" stroke="${stroke}" stroke-width="${baseSW}" fill="none"/>`;
    } else if (type === 'cross-hatch') {
      const baseSW = weight ?? strokeSize * 0.5;
      size = fmt(gap ?? 1.5 * (10 + baseSW));
      content = `<rect x="0" y="0" width="${size}" height="${size}" stroke="${stroke}" stroke-width="${baseSW}" fill="none"/>`;
    } else if (type === 'dots') {
      size = fmt(gap ?? 10 + strokeSize);
      // The weight is the dot diameter (rough.js convention), at most the tile
      const radius = weight != null ? Math.min(weight / 2, size / 2) : size / 4;
      content = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke="none" fill="${stroke}"/>`;
    } else {
      return null;
    }

    // Anchors the pattern at the diagram's origin and rotates the vertical
    // base strokes of the pattern so they run at the given hachure angle
    // (rough.js convention, 0 means horizontal)
    const vt = this.viewTranslate;
    const tx = vt != null ? fmt(vt.x * scale) : 0;
    const ty = vt != null ? fmt(vt.y * scale) : 0;
    const rotation = angle != null ? 90 + angle : 45;
    const transform = `translate(${tx},${ty})${type !== 'dots' ? ` rotate(${rotation})` : ''} scale(${scale})`;
    const markup = `<pattern patternUnits="userSpaceOnUse" width="${size}" height="${size}" x="0" y="0" patternTransform="${transform}">${content}</pattern>`;
    let id = this.patterns.get(markup);
    if (id == null) {
      id = `${this.idPrefix}-p${++this.refCount}`;
      this.patterns.set(markup, id);
      this.defs.push(markup.replace('<pattern ', `<pattern id="${id}" `));
    }
    return id;
  }

  /** mxSvgCanvas2D.addNode: fill, stroke, transform, then the markup. */
  private addNode(filled: boolean, stroked: boolean): void {
    const node = this.node;
    const s = this.state;
    if (!node) return;
    this.node = null;
    const attrs = node.attrs;
    if (node.tag === 'path') {
      if (!this.path || this.path.length === 0) return;
      attrs.d = this.path.join(' ');
    }
    let hasFill = false;
    if (filled && s.fillColor != null) {
      if (s.alpha < 1 || s.fillAlpha < 1) attrs['fill-opacity'] = s.alpha * s.fillAlpha;
      if (s.gradientColor != null) {
        attrs.fill = `url(#${this.gradientId(s.fillColor, s.gradientColor, s.gradientFillAlpha, s.gradientAlpha, s.gradientDirection)})`;
      } else {
        attrs.fill = s.fillColor.toLowerCase() === 'none' ? 'none' : s.fillColor.toLowerCase();
        // mxSvgCanvas2D.updateFill: pattern fill styles (hatch, dots, …)
        const baseStrokeWidth = Math.max(this.minStrokeWidth, Math.max(0.01, fmt(s.strokeWidth)));
        const pattern = (s.fillStyle == null || s.fillStyle === 'auto' || s.fillStyle === 'solid' || attrs.fill === 'none')
          ? null : this.fillPatternId(s.fillStyle, baseStrokeWidth, attrs.fill, s.scale, s.hachureGap, s.fillWeight, s.hachureAngle);
        if (pattern != null) attrs.fill = `url(#${pattern})`;
      }
      hasFill = attrs.fill !== 'none';
    } else {
      attrs.fill = 'none';
    }
    let hasStroke = false;
    if (stroked && s.strokeColor != null) {
      attrs.stroke = s.strokeColor.toLowerCase();
      hasStroke = true;
      if (s.alpha < 1 || s.strokeAlpha < 1) attrs['stroke-opacity'] = s.alpha * s.strokeAlpha;
      const sw = this.currentStrokeWidth();
      if (sw !== 1) attrs['stroke-width'] = sw;
      if (node.tag === 'path') {
        if (s.lineJoin && s.lineJoin !== 'miter') attrs['stroke-linejoin'] = s.lineJoin;
        const cap = s.lineCap === 'flat' ? 'butt' : s.lineCap;
        if (cap && cap !== 'butt') attrs['stroke-linecap'] = cap;
        if (s.miterLimit != null && s.miterLimit !== 10) attrs['stroke-miterlimit'] = s.miterLimit;
      }
      if (s.dashed) {
        const pattern = this.createDashPattern((s.fixDash ? 1 : s.strokeWidth) * s.scale);
        if (pattern.length > 0) attrs['stroke-dasharray'] = pattern;
      }
    } else {
      attrs.stroke = 'none';
    }
    if (!hasFill && !hasStroke) return;
    if (s.transform) attrs.transform = s.transform;
    const text = Object.entries(attrs).map(([k, v]) => `${k}="${escapeAttr(String(v))}"`).join(' ');
    this.emit(`<${node.tag} ${text}/>`);
  }

  // --- groups and output ----------------------------------------------------

  /** Raw markup at the current position (trusted callers only). */
  emit(markup: string): void {
    this.stack[this.stack.length - 1].push(markup);
  }

  /** Opens a `<g>` with the given (already escaped) attribute text. */
  beginGroup(attributes = ''): void {
    this.groupOpen.push(attributes ? `<g ${attributes}>` : '<g>');
    this.stack.push([]);
  }

  endGroup(): void {
    const children = this.stack.pop();
    const open = this.groupOpen.pop();
    if (children === undefined || open === undefined) return;
    if (children.length > 0) this.emit(`${open}${children.join('')}</g>`);
  }

  /** Adds a definition (gradient, marker, filter) by id, once. */
  addDef(markup: string): void {
    if (!this.defs.includes(markup)) this.defs.push(markup);
  }

  /** The `<defs>` block, empty when nothing needed one. */
  defsMarkup(): string {
    return this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '';
  }

  /** What was painted, without `<defs>`. */
  bodyMarkup(): string {
    while (this.stack.length > 1) this.endGroup();
    return this.stack[0].join('');
  }

  /** `<defs>` plus everything painted. */
  markup(): string {
    const body = this.bodyMarkup();
    return this.defsMarkup() + body;
  }
}

/** CSS drop-shadow for a shape, as mxShape.createDropShadow. */
export function dropShadowFilter(
  options: { dx?: number; dy?: number; blur?: number; color?: string | null; opacity?: number },
  scale = 1,
): string {
  const dx = options.dx ?? SHADOW_OFFSET_X;
  const dy = options.dy ?? SHADOW_OFFSET_Y;
  const blur = options.blur ?? 0;
  const color = resolveColor(options.color ?? SHADOW_COLOR) ?? SHADOW_COLOR;
  const opacity = options.opacity ?? SHADOW_OPACITY;
  const r = (v: number) => Math.round(v * scale * 100) / 100;
  return `drop-shadow(${r(dx)}px ${r(dy)}px ${r(blur)}px ${colorWithAlpha(color, opacity)})`;
}

/** `#rrggbb` (or `#rgb`) plus an alpha as rgba(); anything else is returned unchanged. */
export function colorWithAlpha(color: string, alpha: number): string {
  let hex = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return color;
  const [r, g, b] = [match[1], match[2], match[3]].map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}
