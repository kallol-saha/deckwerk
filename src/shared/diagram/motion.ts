/*
 * The motion of draw.io cells, DOM-free: the frames of a cell's wipe and
 * pop, the moving dashes of a connector's flow, and a diagram in mid-Morph.
 * The player (renderer/player/diagramMotion.ts) puts these on screen.
 *
 * Ported from draw.io (jgraph/drawio 32.7.4): js/grapheditor/Graph.js
 * (createEdgeWipeAnimation, createVertexWipeAnimation,
 * createVertexPopAnimation, addFlowAnimationToNode, addFlowRingsToNode,
 * createFlowAnimationCss, getContinuousPathData), js/diagramly/Editor.js
 * (installAnimationStyles, toggleFlowAnimation) and
 * js/diagramly/gif/AnimationExport.js (cubicBezier).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: frames as SVG strings over DeckWerk elements, and
 * Morph re-routing connectors between interpolated vertices.
 */

import type { ConnectorEl, DiagramEl, SlideElement, VertexEl } from '../deck.js';
import {
  connectorMarkup, connectorStyle, rerouted, vertexMarkup, vertexStyle, type CellMarkupOptions, type ConnectorMarkupOptions,
} from './element.js';
import { styleNumber, styleString } from './style.js';
import type { Point, Style } from './types.js';

// --- frames of a wipe and a pop -------------------------------------------------------

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** An SVG the size of a cell's box that lets what it holds overflow, as cells are drawn. */
function frameOpen(w: number, h: number): string {
  const W = fmt(Math.max(w, 0));
  const H = fmt(Math.max(h, 0));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="diagram-svg" width="${W}" height="${H}" `
    + `viewBox="0 0 ${W} ${H}" overflow="visible" style="position:absolute;left:0;top:0;overflow:visible">`;
}

/**
 * The labels of a cell's drawing: what its full markup has that the same
 * cell drawn without labels does not. Taken from the two drawings rather
 * than laid out again, so it is exactly what the cell shows.
 */
export function labelPart(full: string, shapeOnly: string): string {
  let p = 0;
  const n = Math.min(full.length, shapeOnly.length);
  while (p < n && full.charCodeAt(p) === shapeOnly.charCodeAt(p)) p++;
  let q = 0;
  while (q < n - p && full.charCodeAt(full.length - 1 - q) === shapeOnly.charCodeAt(shapeOnly.length - 1 - q)) q++;
  // Back up to a tag boundary, so the part is whole elements.
  while (p > 0 && full.charAt(p) !== '<') p--;
  let end = full.length - q;
  while (end < full.length && full.charAt(end) !== '<') end++;
  return p < end ? full.slice(p, end) : '';
}

function unlabelled<T extends DiagramEl>(el: T): T {
  return (el.type === 'connector' ? { ...el, label: '', labels: [] } : { ...el, label: '' }) as T;
}

/** A cell drawn, labels apart: its shape (or line) and its labels. */
export function cellParts(el: DiagramEl, options: ConnectorMarkupOptions = {}): { shape: string; labels: string } {
  const shape = el.type === 'vertex' ? vertexMarkup(unlabelled(el), options) : connectorMarkup(unlabelled(el), options);
  const full = el.type === 'vertex' ? vertexMarkup(el, options) : connectorMarkup(el, options);
  return { shape, labels: labelPart(full, shape) };
}

/** Total length of a polyline. */
export function routeLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/**
 * createEdgeWipeAnimation: the part of a route drawn when a fraction `f` of
 * its length is, from its start. Its end is the tip, where the arrowhead goes.
 */
export function truncateRoute(points: readonly Point[], f: number): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [{ ...points[0] }];
  let dist = routeLength(points) * Math.max(0, Math.min(1, f));
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (dist <= seg) {
      const k = seg > 0 ? dist / seg : 0;
      out.push({ x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k });
      break;
    }
    dist -= seg;
    out.push({ ...points[i] });
  }
  return out;
}

/** createVertexPopAnimation's damped spring: 0 at the start, overshooting 1, settling at it. */
export function springScale(t: number): number {
  return 1 - Math.exp(-5 * t) * Math.cos(5 * Math.PI * t);
}

/**
 * A cell `f` of the way through draw.io's wipe (0: nothing, 1: whole). A
 * connector is drawn along its route up to that fraction, its arrowhead at
 * the tip; a vertex is drawn `f` of its width wide from its left edge. Its
 * labels fade in with it. The frame is the cell's box, like its drawing.
 */
export function wipeFrameMarkup(el: DiagramEl, f: number, options: CellMarkupOptions = {}, labels?: string): string {
  const t = Math.max(0, Math.min(1, f));
  const text = labels ?? cellParts(el, options).labels;
  let shape = '';
  if (el.type === 'connector') {
    const route = truncateRoute(el.route, t);
    if (route.length >= 2 && routeLength(route) > 0.25) {
      shape = connectorMarkup({ ...unlabelled(el), route }, { ...options, routedPoints: null });
    }
  } else if (t > 0) {
    shape = vertexMarkup({ ...unlabelled(el), w: Math.max(el.w * t, 0.01) }, options);
  }
  const label = text && t > 0 ? `<g opacity="${fmt(t)}">${text}</g>` : '';
  return `${frameOpen(el.w, el.h)}${shape}${label}</svg>`;
}

/**
 * A cell at time `t` (0…1) of draw.io's pop: a vertex grows about its
 * centre on the spring, overshooting and settling, its labels fading in
 * over the first third; a connector wipes, as draw.io pops edges.
 */
export function popFrameMarkup(el: DiagramEl, t: number, options: CellMarkupOptions = {}, labels?: string): string {
  if (el.type === 'connector') return wipeFrameMarkup(el, t, options, labels);
  const u = Math.max(0, Math.min(1, t));
  const text = labels ?? cellParts(el, options).labels;
  const s = springScale(u);
  let shape = '';
  if (s > 0.001) {
    const dx = (el.w - el.w * s) / 2;
    const dy = (el.h - el.h * s) / 2;
    const grown = { ...unlabelled(el), x: el.x + dx, y: el.y + dy, w: el.w * s, h: el.h * s };
    shape = `<g transform="translate(${fmt(dx)} ${fmt(dy)})">${vertexMarkup(grown, options)}</g>`;
  }
  const alpha = Math.min(1, u * 3);
  const label = text && alpha > 0 ? `<g opacity="${fmt(alpha)}">${text}</g>` : '';
  return `${frameOpen(el.w, el.h)}${shape}${label}</svg>`;
}

/**
 * mxCellHighlight on a cell: its outline (a vertex's shape, a connector's
 * line without its heads), unfilled, in `color`, `strokeWidth` wider than
 * its own stroke (at least 5 px), as draw.io highlights a cell.
 */
export function highlightMarkup(el: DiagramEl, color: string, options: CellMarkupOptions = {}): string {
  const safe = /^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]+$/i.test(color) ? color : '#00FF00';
  const own = styleNumber(el.type === 'vertex' ? vertexStyle(el) : connectorStyle(el), 'strokeWidth', 1);
  const sw = Math.max(4 + 1, own + 4);
  const keys = `;fillColor=none;gradientColor=none;strokeColor=${safe};strokeWidth=${sw};dashed=0;shadow=0;opacity=100;strokeOpacity=100;glass=0;sketch=0;flowAnimation=0;`;
  if (el.type === 'connector') {
    return connectorMarkup({ ...unlabelled(el), dio: `${el.dio}${keys}startArrow=none;endArrow=none;` }, { ...options, routedPoints: null, pageShadow: false });
  }
  return vertexMarkup({ ...unlabelled(el), dio: `${el.dio}${keys}` }, { ...options, pageShadow: false });
}

// --- flow ---------------------------------------------------------------------------------

/** Graph.flowRingPeriod and flowRingOffset, for a pathLength of 100. */
export const FLOW_RING_PERIOD = 101;
export const FLOW_RING_OFFSET = 51;
/** Graph.defaultFlowRingSize, defaultFlowDotSize, maxFlowRingSize, maxFlowRingCount, defaultFlowRingDuration. */
export const FLOW_RING_SIZE = 12;
export const FLOW_DOT_SIZE = 8;
export const FLOW_MAX_SIZE = 1000;
export const FLOW_MAX_COUNT = 100;
export const FLOW_RING_DURATION = 1500;

/** The keyframes the flow animations run on (Graph.createFlowAnimationCss, Editor.installAnimationStyles). */
export const FLOW_KEYFRAMES = {
  dash: 'dw-flow',
  ring: 'dw-flow-ring',
  ringOnce: 'dw-flow-ring-once',
  edge: 'dw-edge-flow',
};

export const FLOW_CSS = `@keyframes ${FLOW_KEYFRAMES.dash} { to { stroke-dashoffset: 0; } }\n`
  + `@keyframes ${FLOW_KEYFRAMES.ring} { from { stroke-dashoffset: ${FLOW_RING_PERIOD}; } to { stroke-dashoffset: 0; } }\n`
  + `@keyframes ${FLOW_KEYFRAMES.ringOnce} { from { stroke-dashoffset: 0; } to { stroke-dashoffset: ${-2 * FLOW_RING_PERIOD}; } }\n`
  + `@keyframes ${FLOW_KEYFRAMES.edge} { to { stroke-dashoffset: -16; } }\n`
  // Still where motion is unwanted or impossible: a still frame of the dashes.
  + '@media (prefers-reduced-motion: reduce), print { [data-dw-flow] { animation: none !important; } }\n'
  + '.rail-thumb-inner [data-dw-flow], .dw-still [data-dw-flow] { animation: none !important; }\n';

export type FlowType = 'dash' | 'ring' | 'dot';

/** Graph.getFlowAnimationType. */
export function flowType(style: Style): FlowType {
  const type = style.flowAnimationType;
  return type === 'ring' || type === 'dot' ? type : 'dash';
}

/** Whether a connector's style has draw.io's flow animation on. */
export function hasFlowAnimation(el: Pick<ConnectorEl, 'dio'>): boolean {
  return connectorStyle(el as ConnectorEl).flowAnimation === '1';
}

/** What a dash flow puts on the line (Graph.addFlowAnimationToNode). */
export interface DashFlow {
  /** The dash pattern to set when the line has none. */
  dasharray: string | null;
  /** The offset the dashes start from, moving to 0. */
  offset: number;
  /** One period, in ms. */
  duration: number;
  timing: string;
  direction: string;
}

/** addFlowAnimationToNode for flowAnimation=1 (dashes): `existing` is the line's own dash pattern, if any. */
export function dashFlow(style: Style, scale: number, existing: string | null): DashFlow {
  let tokens: number[];
  let dasharray: string | null = null;
  if (existing == null || existing === '') {
    const pattern = String(styleString(style, 'dashPattern', '8')).split(' ');
    const sw = style.fixDash === '1' || style.dashPattern == null ? 1 : styleNumber(style, 'strokeWidth', 1);
    tokens = pattern.map((t) => Math.round(Number(t) * scale * sw * 100) / 100);
    dasharray = tokens.join(' ');
  } else {
    tokens = existing.split(/[\s,]+/).filter(Boolean).map((t) => Number.parseFloat(t));
  }
  let sum = tokens.filter((t) => !Number.isNaN(t)).reduce((a, b) => a + b, 0);
  if (tokens.length % 2 !== 0) sum *= 2;
  const per = Number.parseInt(styleString(style, 'flowAnimationDuration', '500'), 10);
  return {
    dasharray,
    offset: sum,
    duration: Math.round((sum / scale / 16) * (Number.isNaN(per) ? 500 : per)),
    timing: styleString(style, 'flowAnimationTimingFunction', 'linear'),
    direction: styleString(style, 'flowAnimationDirection', 'normal'),
  };
}

/** What rings or dots moving along the line are (Graph.addFlowRingsToNode). */
export interface RingFlow {
  hollow: boolean;
  /** Diameter of a ring or dot, in the line's units. */
  size: number;
  dasharray: string;
  offset: number;
  /** The CSS animation of the dots. */
  animation: string;
}

/** addFlowRingsToNode's parameters for flowAnimationType=ring|dot, a line `strokeWidth` wide. */
export function ringFlow(style: Style, scale: number, strokeWidth: number): RingFlow {
  const hollow = flowType(style) === 'ring';
  const sw = strokeWidth > 0 && Number.isFinite(strokeWidth) ? strokeWidth : 1;
  const own = Number.parseFloat(style.flowAnimationSize ?? '');
  const size = Number.isFinite(own)
    ? Math.max((hollow ? 3 : 2) * sw, Math.min(own, FLOW_MAX_SIZE) * scale)
    : hollow ? Math.max(4 * sw, FLOW_RING_SIZE * scale) : Math.max(3 * sw, FLOW_DOT_SIZE * scale);
  let count = Number.parseInt(style.flowAnimationCount ?? '1', 10);
  count = count > 1 ? Math.min(count, FLOW_MAX_COUNT) : 1;
  const loop = (style.flowAnimationLoop ?? '1') !== '0';
  let dur = Number.parseInt(style.flowAnimationDuration ?? String(FLOW_RING_DURATION), 10);
  dur = dur > 0 ? dur : FLOW_RING_DURATION;
  const tf = styleString(style, 'flowAnimationTimingFunction', 'linear');
  const ad = styleString(style, 'flowAnimationDirection', 'normal');
  const spacing = Math.round((FLOW_RING_PERIOD / count) * 10000) / 10000;
  let dasharray = `0 ${spacing}`;
  let offset = FLOW_RING_OFFSET;
  let delay = -Math.round(dur / 2);
  if (!loop) {
    dasharray = `0 ${3 * FLOW_RING_PERIOD}`;
    offset = -2 * FLOW_RING_PERIOD;
    delay = 0;
    for (let i = 1; i < count; i++) dasharray += ` 0 ${spacing}`;
    // A reverse pass starts when the last ring enters the end.
    if (ad === 'reverse' || ad === 'alternate-reverse') {
      delay = -Math.round((dur * (FLOW_RING_PERIOD + 1 - (count - 1) * spacing)) / FLOW_RING_PERIOD);
    }
  }
  const animation = `${loop ? FLOW_KEYFRAMES.ring : FLOW_KEYFRAMES.ringOnce} ${loop ? dur : 2 * dur}ms ${tf} ${delay}ms ${loop ? 'infinite' : '1'} ${ad}`;
  return { hollow, size, dasharray, offset, animation };
}

/**
 * Graph.getContinuousPathData: a path's subpaths joined into one (dashes
 * restart at each subpath, at line jumps), the bars of jumpStyle=line dropped.
 */
export function continuousPathData(d: string): string {
  if (d.indexOf('M', 1) <= 0) return d;
  const parts = d.split(/(?=M)/);
  const subpaths: Array<{ data: string; values: number[] }> = [];
  for (const part of parts) {
    const values = part.match(/-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/gi);
    if (values != null && values.length >= 4) subpaths.push({ data: part.replace(/^\s*M/, ''), values: values.map(Number.parseFloat) });
  }
  const near = (x: number, y: number, values: number[], index: number) =>
    Math.abs(x - values[index]) < 0.1 && Math.abs(y - values[index + 1]) < 0.1;
  let result = '';
  subpaths.forEach((sub, i) => {
    const v = sub.values;
    let bar = false;
    if (v.length === 4 && i > 0 && i < subpaths.length - 1 && /^[\s\d.e+-]*L[\s\d.e+-]*$/i.test(sub.data)) {
      const cx = (v[0] + v[2]) / 2;
      const cy = (v[1] + v[3]) / 2;
      const prev = subpaths[i - 1].values;
      bar = near(cx, cy, prev, prev.length - 2) || near(cx, cy, subpaths[i + 1].values, 0);
    }
    if (!bar) result += (result.length === 0 ? 'M' : ' L') + sub.data.replace(/\s+$/, '');
  });
  return result.length > 0 ? result : d;
}

// --- a diagram in mid-Morph ---------------------------------------------------------------

/** AnimationExport.cubicBezier: the CSS timing function cubic-bezier(x1, y1, x2, y2) as a function. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bezier = (u: number, p1: number, p2: number) => {
    const v = 1 - u;
    return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
  };
  return (t) => {
    if (t <= 0 || t >= 1) return Math.max(0, Math.min(1, t));
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 30; i++) {
      u = (lo + hi) / 2;
      if (bezier(u, x1, x2) < t) lo = u;
      else hi = u;
    }
    return bezier(u, y1, y2);
  };
}

/** A CSS easing (`linear`, `ease-in-out`, `cubic-bezier(…)`) as a function. */
export function easingFunction(css: string): (t: number) => number {
  const named: Record<string, [number, number, number, number]> = {
    ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
  };
  if (css === 'linear') return (t) => Math.max(0, Math.min(1, t));
  const match = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(css);
  const p = match ? match.slice(1, 5).map(Number) as [number, number, number, number] : named[css] ?? named['ease-in-out'];
  return cubicBezier(...p);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPoint = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** A pair of cells, the same draw.io cell on two slides. */
export type CellPair = [DiagramEl, DiagramEl];

/** One cell in a Morph frame: where it is now, and how it looked on each side. */
export interface MorphCell {
  /** The target slide's element at its place in this frame. */
  now: DiagramEl;
  /** The source slide's look at the same place (null: unpaired, nothing to fade from). */
  was: DiagramEl | null;
}

function geometryAt<T extends DiagramEl>(from: T, to: T, t: number): Pick<T, 'x' | 'y' | 'w' | 'h' | 'rot' | 'scale' | 'origin'> {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    w: lerp(from.w, to.w, t),
    h: lerp(from.h, to.h, t),
    rot: lerp(from.rot, to.rot, t),
    scale: lerp(from.scale, to.scale, t),
    origin: lerpPoint(from.origin ?? { x: 0, y: 0 }, to.origin ?? { x: 0, y: 0 }, t),
  } as Pick<T, 'x' | 'y' | 'w' | 'h' | 'rot' | 'scale' | 'origin'>;
}

/**
 * The target slide's diagram cells at time `t` (0…1, eased) of a Morph from
 * the source slide: each paired vertex's box between its two boxes, and
 * every connector that a moving vertex holds re-routed between them by
 * draw.io's router — never morphed path to path. Unpaired vertices stay
 * where the target has them. Returns the cells that move or change look.
 */
export function morphDiagramFrame(
  pairs: readonly CellPair[],
  target: readonly SlideElement[],
  t: number,
): Map<string, MorphCell> {
  const out = new Map<string, MorphCell>();
  const vertices = new Map<string, VertexEl>();
  for (const el of target) if (el.type === 'vertex') vertices.set(el.id, el);
  const fromOf = new Map(pairs.map(([from, to]) => [to.id, from]));
  for (const [from, to] of pairs) {
    if (from.type !== 'vertex' || to.type !== 'vertex') continue;
    const now = { ...to, ...geometryAt(from, to, t) };
    vertices.set(to.id, now);
    out.set(to.id, { now, was: { ...from, ...geometryAt(from, to, t), id: to.id } });
  }
  const find = (id: string) => vertices.get(id);
  for (const el of target) {
    if (el.type !== 'connector') continue;
    const from = fromOf.get(el.id);
    const pairedFrom = from?.type === 'connector' ? from : null;
    const ends = [el.source, el.target].filter((id): id is string => id != null);
    const moving = pairedFrom != null || ends.some((id) => out.has(id));
    if (!moving) continue;
    const base: ConnectorEl = pairedFrom
      ? {
        ...el,
        scale: lerp(pairedFrom.scale, el.scale, t),
        origin: lerpPoint(pairedFrom.origin ?? { x: 0, y: 0 }, el.origin ?? { x: 0, y: 0 }, t),
        points: pairedFrom.points.length === el.points.length
          ? el.points.map((p, i) => lerpPoint(pairedFrom.points[i], p, t)) : el.points,
        sourcePoint: pairedFrom.sourcePoint && el.sourcePoint ? lerpPoint(pairedFrom.sourcePoint, el.sourcePoint, t) : el.sourcePoint,
        targetPoint: pairedFrom.targetPoint && el.targetPoint ? lerpPoint(pairedFrom.targetPoint, el.targetPoint, t) : el.targetPoint,
      }
      : el;
    const now = rerouted(base, find);
    const was = pairedFrom
      ? { ...pairedFrom, id: el.id, route: now.route, x: now.x, y: now.y, w: now.w, h: now.h, scale: now.scale, origin: now.origin }
      : null;
    out.set(el.id, { now, was });
  }
  return out;
}

/** Whether two sides of a pair look the same (they differ only in where they are). */
export function sameLook(a: DiagramEl, b: DiagramEl): boolean {
  if (a.dio !== b.dio || a.label !== b.label) return false;
  if (a.type === 'connector' && b.type === 'connector') {
    return JSON.stringify(a.labels.map((l) => [l.label, l.dio, l.x, l.y])) === JSON.stringify(b.labels.map((l) => [l.label, l.dio, l.x, l.y]));
  }
  return true;
}

/**
 * A cell's drawing in a Morph frame. The same look: drawn at its place.
 * Restyled or relabelled: the target's shape with the source's laid over
 * it fading out, and the two labels cross-fading.
 */
export function morphFrameMarkup(cell: MorphCell, t: number, options: ConnectorMarkupOptions = {}): string {
  const { now, was } = cell;
  const draw = (el: DiagramEl) => (el.type === 'vertex' ? vertexMarkup(el, options) : connectorMarkup(el, { ...options, routedPoints: null }));
  if (!was || sameLook(was, now)) return draw(now);
  const a = cellParts(was, { ...options, routedPoints: null });
  const b = cellParts(now, { ...options, routedPoints: null });
  const fade = was.dio !== now.dio ? `<g opacity="${fmt(1 - t)}">${a.shape}</g>` : '';
  return `${frameOpen(now.w, now.h)}${b.shape}${fade}`
    + `${a.labels ? `<g opacity="${fmt(1 - t)}">${a.labels}</g>` : ''}`
    + `${b.labels ? `<g opacity="${fmt(t)}">${b.labels}</g>` : ''}</svg>`;
}
