/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/shape/mxStencil.js, mxgraph/src/shape/mxStencilRegistry.js,
 * the registry overrides at the end of js/grapheditor/Graph.js (getStencil,
 * getBasenameForStencil, parseStencilSet, shape=stencil(...) in
 * mxCellRenderer.createShape, the default-colour parseColor override),
 * mxStencilRegistry.libraries from js/diagramly/Editor.js, and the decoder
 * of the stencil sets at the end of js/stencils.min.js.
 * Modified for DeckWerk: stencil sets are decoded synchronously from
 * ./stencils/data.ts (nothing is fetched), stencils paint into SvgCanvas,
 * text attributes are never evaluated as code, and the graph's colours are
 * the light theme's.
 */

import { inflateSync, strFromU8 } from 'fflate';
import type { SvgCanvas } from './canvas.js';
import type { ConnectionConstraint, Shape } from './shapes/shape.js';
import { getShapeClass } from './shapes/shape.js';
import { getValue, looseEq } from './shapes/util.js';
import { STENCIL_FILES } from './stencils/data.js';
import type { Point, Rect } from './types.js';
import { isElement, parseXml, type XmlElement } from './xml.js';

// --- the encoded stencil sets (stencils.min.js) --------------------------------------

/** Elements whose x/y attributes are coordinates, delta coded per shape. */
const DRAW = new Set(['move', 'line', 'quad', 'curve', 'arc', 'rect', 'roundrect', 'ellipse', 'text', 'image', 'include-shape']);
const XS = new Set(['x', 'x1', 'x2', 'x3']);
const YS = new Set(['y', 'y1', 'y2', 'y3']);

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The decoder of js/stencils.min.js: raw deflate of five streams (element
 * ops, x, y and other numbers as zig-zag varints, and a NUL-separated string
 * table), into the XML element tree of the stencil set.
 */
export function decodeStencilSet(encoded: string): XmlElement {
  const d = inflateSync(base64ToBytes(encoded));
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const s: Uint8Array[] = [];
  for (let i = 0, o = 20; i < 5; i++) {
    const n = v.getUint32(4 * i);
    s.push(d.subarray(o, o + n));
    o += n;
  }
  const ops = s[0];
  const strs = strFromU8(s[4]).split('\0');
  const p = [0, 0, 0, 0];
  let si = 0;
  const names: string[] = [];
  const attrNames: string[] = [];
  const root: XmlElement = { name: '#root', attrs: {}, children: [] };
  const parents: XmlElement[] = [];
  let parent = root;
  let px = 0;
  let py = 0;
  let pn = new Map<string, number>();

  // Reads the next zigzag varint from number stream k
  const read = (k: number): number => {
    const bytes = s[k];
    let n = 0;
    let m = 1;
    let c: number;
    do {
      c = bytes[p[k]++];
      n += (c & 127) * m;
      m *= 128;
    } while (c & 128);
    return (n % 2 === 1) ? -(n + 1) / 2 : n / 2;
  };
  const format = (n: number): string => String(n / 1000);

  while (p[0] < ops.length) {
    const op = ops[p[0]++];
    if (op === 255) {
      parent = parents.pop() ?? root;
      continue;
    }
    if ((op >> 1) === names.length) names.push(strs[si++]);
    const name = names[op >> 1];
    const node: XmlElement = { name, attrs: Object.create(null) as Record<string, string>, children: [] };
    const count = ops[p[0]++];
    const coords = DRAW.has(name);
    parent.children.push(node);
    if (name === 'shape') {
      px = 0;
      py = 0;
      pn = new Map();
    }
    for (let i = 0; i < count; i++) {
      const id = ops[p[0]++];
      if (id === attrNames.length) attrNames.push(strs[si++]);
      const attr = attrNames[id];
      if (ops[p[0]++] === 0) {
        node.attrs[attr] = strs[si++];
      } else if (coords && XS.has(attr)) {
        px += read(1);
        node.attrs[attr] = format(px);
      } else if (coords && YS.has(attr)) {
        py += read(2);
        node.attrs[attr] = format(py);
      } else {
        const key = `${name} ${attr}`;
        const next = (pn.get(key) ?? 0) + read(3);
        pn.set(key, next);
        node.attrs[attr] = format(next);
      }
    }
    if (!(op & 1)) {
      parents.push(parent);
      parent = node;
    }
  }
  const first = root.children[0];
  if (!isElement(first)) throw new Error('empty stencil set');
  return first;
}

// --- DOM-like helpers over XmlElement ----------------------------------------------------

/** node.getAttribute: the value, or null when absent. */
function attr(node: XmlElement, name: string): string | null {
  return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null;
}

/** Number(node.getAttribute(name)), as mxStencil reads numbers (absent is 0). */
function num(node: XmlElement, name: string): number {
  const value = attr(node, name);
  return value == null ? 0 : Number(value);
}

function elementChildren(node: XmlElement): XmlElement[] {
  return node.children.filter(isElement);
}

/** node.getElementsByTagName(name)[0]: the first descendant in document order. */
function firstDescendant(node: XmlElement, name: string): XmlElement | null {
  for (const child of elementChildren(node)) {
    if (child.name === name) return child;
    const found = firstDescendant(child, name);
    if (found != null) return found;
  }
  return null;
}

// --- colours -------------------------------------------------------------------------

/** CSS named colours (CSS Color 4), which the canvas accepts as colours. */
const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue '
  + 'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue '
  + 'darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid '
  + 'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink '
  + 'deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold '
  + 'goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush '
  + 'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey '
  + 'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin '
  + 'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise '
  + 'palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue '
  + 'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow '
  + 'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen '
  + 'transparent currentcolor').split(' '));

/** mxUtils.isValidColor: whether the canvas accepts the value as a colour (`none` is not one). */
export function isValidColor(color: string | null | undefined): boolean {
  if (color == null) return false;
  const value = String(color).replace(/\s/g, '').toLowerCase();
  if (value === 'rgba(0,0,0,0)') return true;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(value)) return true;
  if (/^(rgb|hsl)a?\([\w.,%/+-]*\)$/.test(value)) return true;
  if (/^light-dark\(.+\)$/.test(value)) return true;
  return NAMED_COLORS.has(value);
}

/** Graph.shapeBackgroundColor and shapeForegroundColor of the light theme. */
const SHAPE_BACKGROUND = '#ffffff';
const SHAPE_FOREGROUND = '#000000';

// --- mxStencil ---------------------------------------------------------------------------

/** mxStencil: a shape described in draw.io's stencil XML, painted by drawShape. */
export class Stencil {
  readonly desc: XmlElement;
  constraints: ConnectionConstraint[] | null = null;
  aspect = 'variable';
  w0 = 100;
  h0 = 100;
  bgNode: XmlElement | null = null;
  fgNode: XmlElement | null = null;
  strokewidth = '1';

  constructor(desc: XmlElement) {
    this.desc = desc;
    this.parseDescription();
    this.parseConstraints();
  }

  /** mxStencil.parseDescription. */
  parseDescription(): void {
    this.fgNode = firstDescendant(this.desc, 'foreground');
    this.bgNode = firstDescendant(this.desc, 'background');
    this.w0 = Number(attr(this.desc, 'w') || 100);
    this.h0 = Number(attr(this.desc, 'h') || 100);

    // Possible values for aspect are: variable and fixed where
    // variable means fill the available space and fixed means
    // use w0 and h0 to compute the aspect.
    const aspect = attr(this.desc, 'aspect');
    this.aspect = (aspect != null) ? aspect : 'variable';

    // Possible values for strokewidth are all numbers and "inherit"
    // where the inherit means take the value from the style (ie. the
    // user-defined stroke-width). Note that the strokewidth is scaled
    // by the minimum scaling that is used to draw the shape (sx, sy).
    const sw = attr(this.desc, 'strokewidth');
    this.strokewidth = (sw != null) ? sw : '1';
  }

  /** mxStencil.parseConstraints. */
  parseConstraints(): void {
    const conns = firstDescendant(this.desc, 'connections');
    if (conns != null) {
      const tmp = elementChildren(conns);
      if (tmp.length > 0) this.constraints = tmp.map((node) => this.parseConstraint(node));
    }
  }

  /** mxStencil.parseConstraint. */
  parseConstraint(node: XmlElement): ConnectionConstraint {
    const x = Number(attr(node, 'x'));
    const y = Number(attr(node, 'y'));
    const perimeter = attr(node, 'perimeter') === '1';
    const name = attr(node, 'name');
    const dx = Number(attr(node, 'dx'));
    const dy = Number(attr(node, 'dy'));
    const c: ConnectionConstraint = {
      x, y, perimeter, dx: Number.isFinite(dx) ? dx : 0, dy: Number.isFinite(dy) ? dy : 0,
    };
    if (name != null) c.name = name;
    return c;
  }

  /**
   * mxStencil.evaluateAttribute: the attribute value. Text content is only
   * evaluated as a function in draw.io with mxStencil.allowEval, which is
   * off, so it is never run here.
   */
  evaluateAttribute(node: XmlElement, attribute: string): string | null {
    return attr(node, attribute);
  }

  /** mxStencil.evaluateTextAttribute (localized strings are shown as their keys). */
  evaluateTextAttribute(node: XmlElement, attribute: string): string | null {
    return this.evaluateAttribute(node, attribute);
  }

  /** mxStencil.drawShape. */
  drawShape(canvas: SvgCanvas, shape: Shape, x: number, y: number, w: number, h: number): void {
    const stack = canvas.states.slice();

    // TODO: Internal structure (array of special structs?), relative and absolute
    // coordinates (eg. note shape, process vs star, actor etc.), text rendering
    // and non-proportional scaling, how to implement pluggable edge shapes
    // (start, segment, end blocks), pluggable markers, how to implement
    // swimlanes (title area) with this API, add icon, horizontal/vertical
    // label, indicator for all shapes, rotation
    const direction = shape.hasStyle ? getValue(shape.style, 'direction', null) : null;
    const aspect = this.computeAspect(x, y, w, h, direction == null ? null : String(direction));
    const minScale = Math.min(aspect.width, aspect.height);
    const sw = (this.strokewidth === 'inherit')
      ? Number(shape.hasStyle ? getValue(shape.style, 'strokeWidth', 1) : 1)
      : Number(this.strokewidth) * minScale;
    canvas.setStrokeWidth(sw);

    // Draws a transparent rectangle for catching events
    if (shape.hasStyle && looseEq(getValue(shape.style, 'pointerEvents', '0'), '1')) {
      canvas.setStrokeColor('none');
      canvas.rect(x, y, w, h);
      canvas.stroke();
      canvas.setStrokeColor(shape.stroke);
    }

    this.drawChildren(canvas, shape, x, y, w, h, this.bgNode, aspect, false, true);
    this.drawChildren(canvas, shape, x, y, w, h, this.fgNode, aspect, true,
      !shape.outline || !shape.hasStyle || looseEq(getValue(shape.style, 'backgroundOutline', 0), 0));

    // Restores stack for unequal count of save/restore calls
    if (canvas.states.length !== stack.length) canvas.states = stack;
  }

  /** mxStencil.drawChildren. */
  drawChildren(canvas: SvgCanvas, shape: Shape, _x: number, _y: number, w: number, h: number,
    node: XmlElement | null, aspect: Rect, disableShadow: boolean, paint: boolean): void {
    if (node != null && w > 0 && h > 0) {
      for (const tmp of elementChildren(node)) {
        this.drawNode(canvas, shape, tmp, aspect, disableShadow, paint);
      }
    }
  }

  /**
   * mxStencil.computeAspect: x/y is the origin of the drawing and
   * width/height the horizontal and vertical scales.
   */
  computeAspect(x: number, y: number, w: number, h: number, direction: string | null): Rect {
    let x0 = x;
    let y0 = y;
    let sx = w / this.w0;
    let sy = h / this.h0;
    const inverse = (direction === 'north' || direction === 'south');

    if (inverse) {
      sy = w / this.h0;
      sx = h / this.w0;
      const delta = (w - h) / 2;
      x0 += delta;
      y0 -= delta;
    }

    if (this.aspect === 'fixed') {
      sy = Math.min(sx, sy);
      sx = sy;

      // Centers the shape inside the available space
      if (inverse) {
        x0 += (h - this.w0 * sx) / 2;
        y0 += (w - this.h0 * sy) / 2;
      } else {
        x0 += (w - this.w0 * sx) / 2;
        y0 += (h - this.h0 * sy) / 2;
      }
    }

    return { x: x0, y: y0, width: sx, height: sy };
  }

  /** mxStencil.parseColor with Graph's override for `default`. */
  parseColor(shape: Shape, node: XmlElement, value: string | null): string | null {
    if (value === 'default') {
      return node.name === 'fillcolor' ? SHAPE_BACKGROUND : SHAPE_FOREGROUND;
    }
    if (value === 'stroke') return shape.stroke;
    if (value === 'fill') return shape.fill;
    if (value === 'font' && shape.hasStyle) {
      const font = getValue(shape.style, 'fontColor', 'black');
      return font == null ? null : String(font);
    }
    if (shape.hasStyle && !isValidColor(value)) {
      let result = this.getColorValue(shape, node, value);
      if (result === 'default') result = this.getDefaultColorValue(node);
      return result;
    }
    return value;
  }

  /**
   * mxStencil.getColorValue as it runs in a graph: a style key, or the
   * node's default if the cell's style does not have the key. (draw.io also
   * keeps the default out when the key is explicitly `none`; resolved styles
   * here have dropped such keys, so the default applies.)
   */
  getColorValue(shape: Shape, node: XmlElement, value: string | null): string | null {
    const defaultValue = attr(node, 'default');
    let result: string | null = null;
    if (value != null) {
      const v = getValue(shape.style, value, null);
      result = v == null ? null : String(v);
    }
    if (result == null) {
      result = defaultValue;
    } else if (result === 'default' && defaultValue != null && defaultValue !== 'none') {
      result = defaultValue;
    }
    return result;
  }

  /** mxStencil.getDefaultColorValue in a graph. */
  getDefaultColorValue(node: XmlElement): string {
    return node.name === 'fillcolor' ? SHAPE_BACKGROUND : SHAPE_FOREGROUND;
  }

  /** mxStencil.drawNode. */
  drawNode(canvas: SvgCanvas, shape: Shape, node: XmlElement, aspect: Rect, disableShadow: boolean, paint: boolean): void {
    const name = node.name;
    const x0 = aspect.x;
    const y0 = aspect.y;
    const sx = aspect.width;
    const sy = aspect.height;
    const minScale = Math.min(sx, sy);

    if (name === 'save') {
      canvas.save();
    } else if (name === 'restore') {
      canvas.restore();
    } else if (paint) {
      if (name === 'path') {
        canvas.begin();
        let parseRegularly = true;

        if (attr(node, 'rounded') === '1') {
          parseRegularly = false;
          const arcSize = Number(attr(node, 'arcSize'));
          let pointCount = 0;
          const segs: Point[][] = [];

          // Renders the elements inside the given path
          for (const childNode of elementChildren(node)) {
            const childName = childNode.name;
            if (childName === 'move' || childName === 'line') {
              if (childName === 'move' || segs.length === 0) segs.push([]);
              segs[segs.length - 1].push({ x: x0 + num(childNode, 'x') * sx, y: y0 + num(childNode, 'y') * sy });
              pointCount++;
            } else {
              // We only support move and line for rounded corners
              parseRegularly = true;
              break;
            }
          }

          if (!parseRegularly && pointCount > 0) {
            for (const seg of segs) {
              let close = false;
              const ps = seg[0];
              const pe = seg[seg.length - 1];
              if (ps.x === pe.x && ps.y === pe.y) {
                seg.pop();
                close = true;
              }
              shape.addPoints(canvas, seg, true, arcSize, close);
            }
          } else {
            parseRegularly = true;
          }
        }

        if (parseRegularly) {
          // Renders the elements inside the given path
          for (const childNode of elementChildren(node)) {
            this.drawNode(canvas, shape, childNode, aspect, disableShadow, paint);
          }
        }
      } else if (name === 'close') {
        canvas.close();
      } else if (name === 'move') {
        canvas.moveTo(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy);
      } else if (name === 'line') {
        canvas.lineTo(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy);
      } else if (name === 'quad') {
        canvas.quadTo(x0 + num(node, 'x1') * sx, y0 + num(node, 'y1') * sy,
          x0 + num(node, 'x2') * sx, y0 + num(node, 'y2') * sy);
      } else if (name === 'curve') {
        canvas.curveTo(x0 + num(node, 'x1') * sx, y0 + num(node, 'y1') * sy,
          x0 + num(node, 'x2') * sx, y0 + num(node, 'y2') * sy,
          x0 + num(node, 'x3') * sx, y0 + num(node, 'y3') * sy);
      } else if (name === 'arc') {
        canvas.arcTo(num(node, 'rx') * sx, num(node, 'ry') * sy, num(node, 'x-axis-rotation'),
          num(node, 'large-arc-flag'), num(node, 'sweep-flag'),
          x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy);
      } else if (name === 'rect') {
        canvas.rect(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy, num(node, 'w') * sx, num(node, 'h') * sy);
      } else if (name === 'roundrect') {
        let arcsize = num(node, 'arcsize');
        if (arcsize === 0) arcsize = 0.15 * 100;
        const w = num(node, 'w') * sx;
        const h = num(node, 'h') * sy;
        const factor = arcsize / 100;
        const r = Math.min(w * factor, h * factor);
        canvas.roundrect(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy, w, h, r, r);
      } else if (name === 'ellipse') {
        canvas.ellipse(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy, num(node, 'w') * sx, num(node, 'h') * sy);
      } else if (name === 'image') {
        if (!shape.outline) {
          const src = this.evaluateAttribute(node, 'src');
          if (src != null) {
            canvas.image(x0 + num(node, 'x') * sx, y0 + num(node, 'y') * sy, num(node, 'w') * sx, num(node, 'h') * sy,
              src, false, attr(node, 'flipH') === '1', attr(node, 'flipV') === '1');
          }
        }
      } else if (name === 'text') {
        if (!shape.outline) this.drawText(canvas, shape, node, x0, y0, sx, sy);
      } else if (name === 'include-shape') {
        const stencil = getStencil(attr(node, 'name'));
        if (stencil != null) {
          const x = x0 + num(node, 'x') * sx;
          const y = y0 + num(node, 'y') * sy;
          const w = num(node, 'w') * sx;
          const h = num(node, 'h') * sy;
          stencil.drawShape(canvas, shape, x, y, w, h);
        }
      } else if (name === 'fillstroke') {
        canvas.fillAndStroke();
      } else if (name === 'fill') {
        canvas.fill();
      } else if (name === 'stroke') {
        canvas.stroke();
      } else if (name === 'strokewidth') {
        const s = (attr(node, 'fixed') === '1') ? 1 : minScale;
        canvas.setStrokeWidth(num(node, 'width') * s);
      } else if (name === 'dashed') {
        canvas.setDashed(attr(node, 'dashed') === '1');
      } else if (name === 'dashpattern') {
        const value = attr(node, 'pattern');
        if (value != null) {
          const pat: number[] = [];
          for (const token of value.split(' ')) {
            if (token.length > 0) pat.push(Number(token) * minScale);
          }
          canvas.setDashPattern(pat.join(' '));
        }
      } else if (name === 'strokecolor') {
        canvas.setStrokeColor(this.parseColor(shape, node, attr(node, 'color')));
      } else if (name === 'linecap') {
        const cap = attr(node, 'cap');
        if (cap != null) canvas.setLineCap(cap);
      } else if (name === 'linejoin') {
        const join = attr(node, 'join');
        if (join != null) canvas.setLineJoin(join);
      } else if (name === 'miterlimit') {
        canvas.setMiterLimit(num(node, 'limit'));
      } else if (name === 'fillcolor') {
        canvas.setFillColor(this.parseColor(shape, node, attr(node, 'color')));
      } else if (name === 'alpha' || name === 'fillalpha' || name === 'strokealpha') {
        // draw.io sets the alpha for all three (as a string)
        canvas.setAlpha(Number(attr(node, 'alpha')));
      } else if (name === 'fontcolor') {
        canvas.setFontColor(this.parseColor(shape, node, attr(node, 'color')));
      } else if (name === 'fontstyle') {
        canvas.setFontStyle(num(node, 'style'));
      } else if (name === 'fontfamily') {
        canvas.setFontFamily(attr(node, 'family') ?? '');
      } else if (name === 'fontsize') {
        canvas.setFontSize(num(node, 'size') * minScale);
      }

      if (disableShadow && (name === 'fillstroke' || name === 'fill' || name === 'stroke')) {
        disableShadow = false;
        canvas.setShadow(false);
      }
    }
  }

  /** The `text` node of mxStencil.drawNode. */
  private drawText(canvas: SvgCanvas, shape: Shape, node: XmlElement, x0: number, y0: number, sx: number, sy: number): void {
    const str = this.evaluateTextAttribute(node, 'str');
    let rotation = attr(node, 'vertical') === '1' ? -90 : 0;
    const tx = x0 + num(node, 'x') * sx;
    const ty = y0 + num(node, 'y') * sy;
    let align = attr(node, 'align') || 'left';
    let valign = attr(node, 'valign') || 'top';

    // Optionally undoes the flip of the shape for the text so
    // that it stays readable (not mirrored) in flipped shapes
    const unflip = attr(node, 'flip-shape') === '0';
    const unflipH = unflip && shape.flipH;
    const unflipV = unflip && shape.flipV;

    if (attr(node, 'align-shape') === '0') {
      const dr = shape.rotation;

      // Depends on flipping
      const flipH = looseEq(getValue(shape.style, 'flipH', 0), 1);
      const flipV = looseEq(getValue(shape.style, 'flipV', 0), 1);

      if (unflipH || unflipV) rotation -= dr;
      else if (flipH && flipV) rotation -= dr;
      else if (flipH || flipV) rotation += dr;
      else rotation -= dr;
    }

    rotation -= num(node, 'rotation');

    if (unflipH || unflipV) {
      // Mirrors the alignment so that the text occupies the
      // area of the flipped text (only for unrotated text)
      if (rotation === 0) {
        if (unflipH) align = (align === 'left') ? 'right' : ((align === 'right') ? 'left' : align);
        if (unflipV) valign = (valign === 'top') ? 'bottom' : ((valign === 'bottom') ? 'top' : valign);
      }
      canvas.save();
      canvas.rotate(0, unflipH, unflipV, tx, ty);
    }

    canvas.text(tx, ty, 0, 0, str ?? '', align, valign, false, '', null, false, rotation);

    if (unflipH || unflipV) canvas.restore();
  }
}

// --- mxStencilRegistry ---------------------------------------------------------------

/** mxStencilRegistry.stencils. */
const stencils = new Map<string, Stencil>();
/** Files already parsed (mxStencilRegistry.packages / filesLoaded). */
const loadedFiles = new Set<string>();
/** Custom stencils of `shape=stencil(...)`, by style value. */
const customStencils = new Map<string, Stencil | null>();

/**
 * mxStencilRegistry.libraries (js/diagramly/Editor.js) for the sets shipped
 * here: the XML files a package name loads besides its JavaScript shapes.
 */
const LIBRARIES: Record<string, string[]> = {
  basic: ['basic.xml'],
  bpmn: ['bpmn.xml'],
  bpmn2: ['bpmn.xml'],
  flowchart: ['flowchart.xml'],
  lean_mapping: ['lean_mapping.xml'],
  networks: ['networks.xml'],
};

/** mxStencilRegistry.addStencil. */
export function addStencil(name: string, stencil: Stencil): void {
  stencils.set(name, stencil);
}

/** mxStencilRegistry.getBasenameForStencil: `mxgraph.a.b.c` → `a/b`. */
export function getBasenameForStencil(name: string | null | undefined): string | null {
  let tmp: string | null = null;
  if (name != null && typeof name === 'string') {
    const parts = name.split('.');
    if (parts.length > 0 && parts[0] === 'mxgraph') {
      tmp = parts[1];
      for (let i = 2; i < parts.length - 1; i++) tmp += `/${parts[i]}`;
    }
  }
  return tmp;
}

/** mxStencilRegistry.parseStencilSet: registers each shape as `package.name` in lower case. */
export function parseStencilSet(root: XmlElement): void {
  if (root.name === 'stencils') {
    for (const shapes of elementChildren(root)) {
      if (shapes.name === 'shapes') parseStencilSet(shapes);
    }
    return;
  }
  let packageName = '';
  const setName = attr(root, 'name');
  if (setName != null) packageName = `${setName}.`;
  packageName = packageName.toLowerCase();
  for (const shape of elementChildren(root)) {
    const name = attr(shape, 'name');
    if (name != null) {
      const stencilName = name.replace(/ /g, '_');
      addStencil(packageName + stencilName.toLowerCase(), new Stencil(shape));
    }
  }
}

/** mxStencilRegistry.loadStencilSet for a shipped file; false if it is not shipped. */
function loadStencilFile(file: string): boolean {
  if (loadedFiles.has(file)) return true;
  const data = Object.prototype.hasOwnProperty.call(STENCIL_FILES, file) ? STENCIL_FILES[file] : undefined;
  if (data == null) return false;
  loadedFiles.add(file);
  try {
    parseStencilSet(decodeStencilSet(data));
  } catch {
    // A broken set paints its shapes as rectangles, as a failed load does in draw.io
  }
  return true;
}

/** Graph.decompress: base64 → inflateRaw → decodeURIComponent (control characters removed). */
function decompress(data: string): string {
  const inflated = strFromU8(inflateSync(base64ToBytes(data)));
  let text = inflated;
  try {
    text = decodeURIComponent(inflated);
  } catch {
    // keeps the raw text
  }
  // Graph.zapGremlins
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** The stencil of `shape=stencil(<compressed XML>)` (Graph's mxCellRenderer.createShape). */
function customStencil(shape: string): Stencil | null {
  let stencil = customStencils.get(shape);
  if (stencil === undefined) {
    stencil = null;
    try {
      const doc = parseXml(decompress(shape.substring(8, shape.length - 1)));
      stencil = new Stencil(doc);
    } catch {
      stencil = null;
    }
    if (customStencils.size > 500) customStencils.clear();
    customStencils.set(shape, stencil);
  }
  return stencil;
}

/**
 * mxStencilRegistry.getStencil with Graph's dynamic loading: the stencil
 * registered under the name, loading the set its package name points to
 * on first use (synchronously; every set is bundled). Names with a
 * JavaScript shape have none, as mxCellRenderer.createShape asks only for
 * names without one.
 */
export function getStencil(name: string | null | undefined): Stencil | null {
  if (name == null) return null;
  if (name.substring(0, 8) === 'stencil(') return customStencil(name);
  let result = stencils.get(name);
  if (result == null && getShapeClass(name) == null) {
    const basename = getBasenameForStencil(name);
    if (basename != null) {
      const libs = Object.prototype.hasOwnProperty.call(LIBRARIES, basename) ? LIBRARIES[basename] : null;
      if (libs != null) {
        for (const file of libs) loadStencilFile(file);
      } else {
        // Replaces '_-_' with '_'
        loadStencilFile(`${basename.replace('_-_', '_')}.xml`);
      }
      result = stencils.get(name);
    }
  }
  return result ?? null;
}

/** Every stencil name in the shipped sets (loads them all). */
export function shippedStencilNames(): string[] {
  for (const file of Object.keys(STENCIL_FILES)) loadStencilFile(file);
  return Array.from(stencils.keys()).sort();
}

/** The shipped stencil set files (`basic.xml`, `electrical/abstract.xml`, …). */
export function shippedStencilFiles(): string[] {
  return Object.keys(STENCIL_FILES);
}
