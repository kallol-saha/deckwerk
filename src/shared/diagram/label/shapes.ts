/*
 * Ported from draw.io (jgraph/drawio 32.7.4): mxgraph/src/shape/mxShape.js
 * (getLabelBounds), mxgraph/src/util/mxUtils.js (getDirectedBounds), the
 * getLabelBounds/getLabelMargins of mxgraph/src/shape/mxRectangleShape.js,
 * mxSwimlane.js, mxDoubleEllipse.js, and of js/grapheditor/Shapes.js (cube,
 * cylinder family, datastore, note2, cylinder3, folder, umlState, tape,
 * document, process, callout, rhombus, ext, umlBoundary, umlControl,
 * umlLifeline, umlFrame, manualInput, gitTag, mindmapBang, mermaidOdd,
 * mermaidPerson), plus shapes/mxBasic.js and shapes/mxC4.js (callouts,
 * layered rect, C4 persons).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: a table from shape name to its label-bounds rule
 * instead of shape classes; the rules read the style directly.
 */

import type { Rect, Style } from '../types.js';
import { jsValue, looseEq, numberValue, truthy } from './text.js';

/** What the shape rules read from the shape (mxShape fields after apply). */
interface ShapeContext {
  style: Style;
  /** shape.scale; 1 when the bounds are in model units. */
  scale: number;
  /** mxShape.strokewidth (mxUtils.getNumber(style, strokeWidth, 1)). */
  strokewidth: number;
  /** mxShape.direction (null when the style has none). */
  direction: string | null;
  /** mxText.isPaintBoundsInverted of the cell's label. */
  inverted: boolean;
  /** mxShape.isRounded. */
  isRounded: boolean;
}

type BoundsRule = (ctx: ShapeContext, rect: Rect) => Rect;
type MarginsRule = (ctx: ShapeContext, rect: Rect) => Rect | null;

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/** mxUtils.getDirectedBounds. */
export function directedBounds(r: Rect, margins: Rect, style: Style, flipH: boolean, flipV: boolean): Rect {
  const d = style.direction ?? 'east';
  const m = {
    x: Math.round(Math.max(0, Math.min(r.width, margins.x))),
    y: Math.round(Math.max(0, Math.min(r.height, margins.y))),
    width: Math.round(Math.max(0, Math.min(r.width, margins.width))),
    height: Math.round(Math.max(0, Math.min(r.height, margins.height))),
  };
  if ((flipV && (d === 'south' || d === 'north')) || (flipH && (d === 'east' || d === 'west'))) {
    [m.x, m.width] = [m.width, m.x];
  }
  if ((flipH && (d === 'south' || d === 'north')) || (flipV && (d === 'east' || d === 'west'))) {
    [m.y, m.height] = [m.height, m.y];
  }
  const m2 = { ...m };
  if (d === 'south') {
    m2.y = m.x; m2.x = m.height; m2.width = m.y; m2.height = m.width;
  } else if (d === 'west') {
    m2.y = m.height; m2.x = m.width; m2.width = m.x; m2.height = m.y;
  } else if (d === 'north') {
    m2.y = m.width; m2.x = m.y; m2.width = m.height; m2.height = m.x;
  }
  return rect(r.x + m2.x, r.y + m2.y, r.width - m2.width - m2.x, r.height - m2.height - m2.y);
}

/** mxShape.getLabelBounds: margins from the shape, applied for direction and flips. */
function marginBounds(ctx: ShapeContext, r: Rect, margins: MarginsRule): Rect {
  const d = ctx.style.direction ?? 'east';
  let bounds = r;
  if (d !== 'south' && d !== 'north' && ctx.inverted) {
    bounds = rect(r.x, r.y, r.height, r.width);
  }
  const m = margins(ctx, bounds);
  if (m == null) return r;
  let flipH = looseEq(jsValue(ctx.style, 'flipH') ?? false, '1');
  let flipV = looseEq(jsValue(ctx.style, 'flipV') ?? false, '1');
  if (ctx.inverted) {
    const tmp = m.x;
    m.x = m.height;
    m.height = m.width;
    m.width = m.y;
    m.y = tmp;
    [flipH, flipV] = [flipV, flipH];
  }
  return directedBounds(r, m, ctx.style, flipH, flipV);
}

function bounded(ctx: ShapeContext): boolean {
  return truthy(ctx.style, 'boundedLbl');
}

function size(ctx: ShapeContext, fallback: number, key = 'size'): number {
  return numberValue(ctx.style, key, fallback);
}

// --- getLabelMargins ------------------------------------------------------------

const cylinderMargins: MarginsRule = (ctx, r) => {
  if (!bounded(ctx)) return null;
  const s = size(ctx, 0.15) * 2;
  // mxCylinder.prototype.maxHeight = 40
  return rect(0, Math.min(40 * ctx.scale, r.height * s), 0, 0);
};

const MARGINS: Record<string, MarginsRule> = {
  cube: (ctx) => {
    if (!bounded(ctx)) return null;
    const s = size(ctx, 20) * ctx.scale;
    return rect(s, s, 0, 0);
  },
  cylinder: cylinderMargins,
  waypoint: cylinderMargins,
  isoCube: cylinderMargins,
  note: cylinderMargins,
  message: cylinderMargins,
  module: cylinderMargins,
  component: cylinderMargins,
  datastore: (ctx, r) => rect(0, 2.5 * Math.min(r.height / 2, Math.round(r.height / 8) + ctx.strokewidth - 1), 0, 0),
  note2: (ctx, r) => {
    if (!bounded(ctx)) return null;
    const s = size(ctx, 15);
    return rect(0, Math.min(r.height * ctx.scale, s * ctx.scale), 0, Math.max(0, s * ctx.scale));
  },
  cylinder3: (ctx, r) => {
    if (!bounded(ctx)) return null;
    let s = size(ctx, 15);
    if (!truthy(ctx.style, 'lid', true)) s /= 2;
    return rect(0, Math.min(r.height * ctx.scale, s * 2 * ctx.scale), 0, Math.max(0, s * 0.3 * ctx.scale));
  },
  folder: (ctx, r) => {
    if (!bounded(ctx)) return null;
    const sizeY = size(ctx, 15, 'tabHeight') * ctx.scale;
    if (truthy(ctx.style, 'labelInHeader')) {
      const sizeX = size(ctx, 15, 'tabWidth') * ctx.scale;
      const rounded = truthy(ctx.style, 'rounded');
      const absArcSize = truthy(ctx.style, 'absoluteArcSize');
      let arcSize = size(ctx, 0.1, 'arcSize');
      if (!absArcSize) arcSize = Math.min(r.width, r.height) * arcSize;
      arcSize = Math.min(arcSize, r.width * 0.5, (r.height - sizeY) * 0.5);
      if (!rounded) arcSize = 0;
      if ((ctx.style.tabPosition ?? 'right') === 'left') {
        return rect(arcSize, 0, Math.min(r.width, r.width - sizeX), Math.min(r.height, r.height - sizeY));
      }
      return rect(Math.min(r.width, r.width - sizeX), 0, arcSize, Math.min(r.height, r.height - sizeY));
    }
    return rect(0, Math.min(r.height, sizeY), 0, 0);
  },
  umlState: (ctx) => (bounded(ctx) && ctx.style.umlStateConnection != null ? rect(10 * ctx.scale, 0, 0, 0) : null),
  document: (ctx, r) => (bounded(ctx) ? rect(0, 0, 0, size(ctx, 0.3) * r.height) : null),
  callout: (ctx) => rect(0, 0, 0, size(ctx, 30) * ctx.scale),
  umlBoundary: (_ctx, r) => rect(r.width / 6, 0, 0, 0),
  umlFrame: (ctx, r) => rect(0, 0,
    r.width - size(ctx, 60, 'width') * ctx.scale,
    r.height - size(ctx, 30, 'height') * ctx.scale),
  manualInput: (ctx) => (bounded(ctx) ? rect(0, size(ctx, 30) * ctx.scale, 0, 0) : null),
  'mxgraph.basic.rectCallout': (ctx) => (bounded(ctx) ? rect(0, 0, 0, size(ctx, 0.5, 'dy') * ctx.scale) : null),
  'mxgraph.basic.roundRectCallout': (ctx) => (bounded(ctx) ? rect(0, 0, 0, size(ctx, 0.5, 'dy') * ctx.scale) : null),
  'mxgraph.basic.layered_rect': (ctx, r) => {
    if (!bounded(ctx)) return null;
    const w = r.width / ctx.scale;
    const h = r.height / ctx.scale;
    let dx = Math.max(0, Math.min(w, size(ctx, 0.5, 'dx')));
    dx = Math.min(w * 0.5, h * 0.5, dx) * ctx.scale;
    return rect(0, 0, dx, dx);
  },
  'mxgraph.c4.person': (_ctx, r) => rect(0, Math.min(r.width / 2, r.height / 3) * 0.8, 0, 0),
  'mxgraph.c4.person2': (_ctx, r) => rect(0, Math.min(r.width * 0.45, r.height * 0.45) * 0.8, 0, 0),
};

// --- getLabelBounds ---------------------------------------------------------------

/** mxRectangleShape.getLabelBounds: the footer is not part of the label. */
const rectangleBounds: BoundsRule = (ctx, r) => {
  const footer = Math.max(0, size(ctx, 0, 'footerSize')) * ctx.scale;
  return footer > 0 ? rect(r.x, r.y, r.width, r.height - Math.min(r.height, footer)) : r;
};

/** mxSwimlane.getLabelBounds: the title region. */
const swimlaneBounds: BoundsRule = (ctx, r) => {
  const start = Math.max(0, size(ctx, 40, 'startSize'));
  const fixedHeader = truthy(ctx.style, 'fixedHeader', true);
  if (start === 0 && !fixedHeader) return marginBounds(ctx, r, () => null);
  const flipH = looseEq(jsValue(ctx.style, 'flipH') ?? 0, 1);
  const flipV = looseEq(jsValue(ctx.style, 'flipV') ?? 0, 1);
  const bounds = { ...r };
  const horizontal = looseEq(jsValue(ctx.style, 'horizontal') ?? 1, 1);
  const dir = ctx.direction;
  const shapeVertical = dir === 'north' || dir === 'south';
  const realHorizontal = horizontal === !shapeVertical;
  const backwards = dir === 'south' || dir === 'west';
  const realFlipH = !realHorizontal && flipH !== backwards;
  const realFlipV = realHorizontal && flipV !== backwards;
  if (!shapeVertical) {
    const tmp = Math.min(bounds.height, start * ctx.scale);
    if (realFlipH || realFlipV) bounds.y += bounds.height - tmp;
    bounds.height = tmp;
  } else {
    const tmp = Math.min(bounds.width, start * ctx.scale);
    if (realFlipH || realFlipV) bounds.x += bounds.width - tmp;
    bounds.width = tmp;
  }
  return bounds;
};

const processBounds: BoundsRule = (ctx, r) => {
  const dir = ctx.direction;
  const horizontalShape = dir == null || dir === 'east' || dir === 'west';
  if (!looseEq(jsValue(ctx.style, 'horizontal') ?? true, horizontalShape)) return r;
  const w = r.width;
  const h = r.height;
  const out = { ...r };
  let inset = size(ctx, 0.1);
  if (truthy(ctx.style, 'fixedSize')) {
    inset = Math.max(0, Math.min(w, inset * ctx.scale));
  } else {
    inset = w * Math.max(0, Math.min(1, inset));
    if (ctx.isRounded) {
      const f = size(ctx, 15, 'arcSize') / 100;
      inset = Math.max(inset, Math.min(w * f, h * f));
    }
  }
  out.x += Math.round(inset);
  out.width -= Math.round(2 * inset);
  return out;
};

const tapeBounds: BoundsRule = (ctx, r) => {
  if (!bounded(ctx)) return r;
  const s = size(ctx, 0.4);
  const dir = ctx.direction;
  if (dir == null || dir === 'east' || dir === 'west') {
    const dy = r.height * s;
    return rect(r.x, r.y + dy, r.width, r.height - 2 * dy);
  }
  const dx = r.width * s;
  return rect(r.x + dx, r.y, r.width - 2 * dx, r.height);
};

function inset(r: Rect, margin: number): Rect {
  return rect(r.x + margin, r.y + margin, r.width - 2 * margin, r.height - 2 * margin);
}

const rhombusBounds: BoundsRule = (ctx, r) => {
  if (!looseEq(jsValue(ctx.style, 'double'), 1)) return r;
  return inset(r, (Math.max(2, ctx.strokewidth + 1) * 2 + numberValue(ctx.style, 'margin', 0)) * ctx.scale);
};

const extBounds: BoundsRule = (ctx, r) => {
  if (!looseEq(jsValue(ctx.style, 'double'), 1)) return r;
  return inset(r, (Math.max(2, ctx.strokewidth + 1) + numberValue(ctx.style, 'margin', 0)) * ctx.scale);
};

const doubleEllipseBounds: BoundsRule = (ctx, r) => {
  const fallback = Math.min(3 + ctx.strokewidth, Math.min(r.width / 5 / ctx.scale, r.height / 5 / ctx.scale));
  return inset(r, numberValue(ctx.style, 'margin', fallback) * ctx.scale);
};

/** MermaidPersonShape.getGeometry. */
function mermaidPerson(w: number, h: number): { bodyTop: number; bodyHeight: number } {
  const headRadius = Math.min(Math.max(w * 0.23, 16), 56);
  const bodyTop = Math.min(h, 2 * headRadius - headRadius * 0.27);
  return { bodyTop, bodyHeight: h - bodyTop };
}

const BOUNDS: Record<string, BoundsRule> = {
  rectangle: rectangleBounds,
  label: rectangleBounds,
  image: rectangleBounds,
  transparent: rectangleBounds,
  plus: rectangleBounds,
  associativeEntity: rectangleBounds,
  internalStorage: rectangleBounds,
  zigzag: rectangleBounds,
  curvedText: rectangleBounds,
  swimlane: swimlaneBounds,
  table: swimlaneBounds,
  tableRow: swimlaneBounds,
  process: processBounds,
  process2: processBounds,
  tape: tapeBounds,
  rhombus: rhombusBounds,
  sortShape: rhombusBounds,
  ext: extBounds,
  doubleEllipse: doubleEllipseBounds,
  endState: doubleEllipseBounds,
  startState: doubleEllipseBounds,
  umlControl: (_ctx, r) => rect(r.x, r.y + r.height / 8, r.width, r.height * 7 / 8),
  umlLifeline: (ctx, r) => {
    const mirrored = ctx.style.lifelineMirror === '1';
    const s = Math.max(0, Math.min(mirrored ? r.height / 2 : r.height, size(ctx, 40) * ctx.scale));
    return rect(r.x, r.y, r.width, s);
  },
  gitTag: (ctx, r) => {
    const tab = size(ctx, 8, 'tabSize') * ctx.scale;
    return rect(r.x + tab, r.y, r.width - tab, r.height);
  },
  mindmapBang: (_ctx, r) => {
    const insetX = r.width * 0.10;
    const insetY = r.height * 0.10;
    return rect(r.x + insetX, r.y + insetY, r.width - insetX * 2, r.height - insetY * 2);
  },
  mermaidOdd: (_ctx, r) => rect(r.x + r.height / 4, r.y, r.width - r.height / 4, r.height),
  mermaidPerson: (ctx, r) => {
    const g = mermaidPerson(r.width / ctx.scale, r.height / ctx.scale);
    return rect(r.x, r.y + g.bodyTop * ctx.scale, r.width, g.bodyHeight * ctx.scale);
  },
};

/**
 * shape.getLabelBounds(rect) for the cell's shape: the part of the vertex
 * box its label is laid out in. `rect` is the label rectangle mxCellRenderer
 * hands the shape (already swapped for horizontal=0).
 *
 * A shape name draw.io would draw with mxRectangleShape (a name that is no
 * shape and no stencil) gets the rectangle rule; stencils (`mxgraph.*`
 * without a rule here) keep the whole box, as stencils without labelBounds
 * nodes do.
 */
export function shapeLabelBounds(style: Style, r: Rect, options: { scale: number; inverted: boolean }): Rect {
  const name = style.shape ?? 'rectangle';
  const ctx: ShapeContext = {
    style,
    scale: options.scale,
    strokewidth: numberValue(style, 'strokeWidth', 1),
    direction: style.direction ?? null,
    inverted: options.inverted,
    isRounded: looseEq(jsValue(style, 'rounded') ?? false, 1),
  };
  const bounds = Object.prototype.hasOwnProperty.call(BOUNDS, name) ? BOUNDS[name] : null;
  if (bounds) return bounds(ctx, r);
  const margins = Object.prototype.hasOwnProperty.call(MARGINS, name) ? MARGINS[name] : null;
  if (margins) return marginBounds(ctx, r, margins);
  if (KNOWN_PLAIN_SHAPES.has(name) || name.startsWith('mxgraph.')) return r;
  return rectangleBounds(ctx, r);
}

/**
 * Shapes draw.io registers that keep the label box as it is (mxShape's
 * getLabelBounds with no margins). Any other unknown name falls back to
 * mxRectangleShape, as mxCellRenderer.createShape does.
 */
const KNOWN_PLAIN_SHAPES = new Set([
  'actor', 'arrow', 'arrowConnector', 'cloud', 'connector', 'ellipse', 'hexagon', 'line',
  'triangle', 'card', 'collate', 'corner', 'cross', 'crossbar', 'curlyBracket', 'customShape',
  'cylinder2', 'dataStorage', 'delay', 'dimension', 'display', 'doubleArrow', 'filledEdge',
  'flexArrow', 'gitCherryPick', 'gitMergeCommit', 'ishikawaHead', 'isoCube2', 'isoRectangle',
  'lineEllipse', 'link', 'lollipop', 'loopLimit', 'mermaidBlockArrow', 'mermaidSankeyLink',
  'mermaidUsecaseActor', 'offPageConnector', 'or', 'orEllipse', 'parallelMarker', 'parallelogram',
  'partialRectangle', 'pipe', 'providedRequiredInterface', 'requiredInterface', 'requires',
  'sample', 'seqActorStick', 'seqBoundary', 'seqCollections', 'seqControl', 'seqDatabase',
  'seqEntity', 'seqQueue', 'singleArrow', 'smileyFace', 'step', 'sumEllipse', 'switch',
  'tableLine', 'tapeData', 'taperedArrow', 'tee', 'tie', 'trapezoid', 'umlActor', 'umlDestroy',
  'umlEntity', 'wedgeCallout', 'wire', 'xor',
]);
