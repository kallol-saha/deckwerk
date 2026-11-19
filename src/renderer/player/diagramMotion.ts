/**
 * draw.io cells in motion, on screen: a connector's flow (draw.io's moving
 * dashes, dots or rings), a cell's wipe, pop and highlight, and a diagram's
 * cells in a Morph — vertices sliding between their boxes, connectors
 * re-routed between them every frame. The frames themselves are drawn by
 * shared/diagram/motion.ts; this module puts them on the nodes the renderer
 * made and takes them away again, leaving each node as it was drawn.
 */

import type { ConnectorEl, DiagramEl, SlideElement } from '@shared/deck.js';
import { elementTransform } from '@shared/flip.js';
import { cellMarkupOptions, type DiagramSlide } from '@shared/diagram/cellContext.js';
import { connectorStyle } from '@shared/diagram/element.js';
import {
  FLOW_CSS, FLOW_KEYFRAMES, cellParts, continuousPathData, dashFlow, easingFunction, flowType, highlightMarkup,
  morphDiagramFrame, morphFrameMarkup, popFrameMarkup, ringFlow, wipeFrameMarkup, type CellPair,
} from '@shared/diagram/motion.js';
import { DRAWIO_HIGHLIGHT_COLOR, DRAWIO_HIGHLIGHT_DURATION, DRAWIO_HIGHLIGHT_FADE } from '@shared/diagram/animation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function parseSvg(markup: string): SVGElement | null {
  if (typeof document === 'undefined') return null;
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild as SVGElement | null;
}

/** A cell node's drawing: the SVG renderDiagramCell put in it. */
function cellSvg(node: Element): SVGElement | null {
  return node.querySelector<SVGElement>(':scope > svg.diagram-svg');
}

// --- flow ---------------------------------------------------------------------------------

let flowCss: HTMLStyleElement | null = null;

/** The keyframes every flow runs on, once per document (Editor.installAnimationStyles). */
function installFlowCss(): void {
  if (typeof document === 'undefined' || !document.head) return;
  if (flowCss?.isConnected) return;
  flowCss = document.createElement('style');
  flowCss.dataset.deckwerk = 'diagram-flow';
  flowCss.textContent = FLOW_CSS;
  document.head.appendChild(flowCss);
}

/**
 * mxShape.getFlowAnimationPath: the line the flow moves along, the first
 * path that is stroked and not filled (the heads are filled).
 */
function flowPath(svg: Element): SVGPathElement | null {
  const paths = [...svg.querySelectorAll<SVGPathElement>('path')]
    .filter((p) => !p.hasAttribute('data-dw-flow-part') && p.getAttribute('visibility') !== 'hidden'
      && p.getAttribute('stroke') !== 'none' && p.getAttribute('stroke') != null);
  return paths.find((p) => p.getAttribute('fill') === 'none') ?? paths[0] ?? null;
}

/** Take a flow off a drawing, leaving the line as it was painted. */
function clearFlow(svg: Element): void {
  for (const part of svg.querySelectorAll('[data-dw-flow-part]')) part.remove();
  for (const masked of svg.querySelectorAll('[data-dw-flow-masked]')) {
    masked.removeAttribute('mask');
    masked.removeAttribute('data-dw-flow-masked');
  }
  for (const line of svg.querySelectorAll<SVGElement>('[data-dw-flow]')) {
    const own = line.getAttribute('data-dw-flow-dash');
    if (own === '') line.removeAttribute('stroke-dasharray');
    else if (own != null) line.setAttribute('stroke-dasharray', own);
    line.style.removeProperty('animation');
    line.style.removeProperty('stroke-dashoffset');
    line.removeAttribute('data-dw-flow');
    line.removeAttribute('data-dw-flow-dash');
  }
}

let maskCount = 0;

/** Graph.addFlowRingsToNode: dots or rings riding along the line. */
function addRings(svg: Element, line: SVGPathElement, el: ConnectorEl): void {
  const style = connectorStyle(el);
  const sw = Number.parseFloat(line.getAttribute('stroke-width') ?? '1');
  const ring = ringFlow(style, el.scale, sw);
  const d = continuousPathData(line.getAttribute('d') ?? '');
  const parent = line.parentNode as Element | null;
  if (!parent || !d) return;
  let box: { x: number; y: number; width: number; height: number } | null = null;
  try {
    const b = (line as SVGGraphicsElement).getBBox?.();
    if (b && Number.isFinite(b.width)) box = { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    box = null;
  }
  // A box that holds the line, its heads and the rings, for the masks.
  const w = Number.parseFloat(svg.getAttribute('width') ?? '0');
  const h = Number.parseFloat(svg.getAttribute('height') ?? '0');
  const grow = Math.max(ring.size / 2, 5 * (sw || 1)) + 1;
  const region = box ?? { x: 0, y: 0, width: w, height: h };
  const bounds = { x: Math.min(region.x, 0) - grow, y: Math.min(region.y, 0) - grow, width: Math.max(region.width, w) + 2 * grow, height: Math.max(region.height, h) + 2 * grow };
  const dots = (width: number, color: string): SVGPathElement => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(Math.round(width * 100) / 100));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-dasharray', ring.dasharray);
    path.setAttribute('pathLength', '100');
    path.setAttribute('pointer-events', 'none');
    path.setAttribute('data-dw-flow-part', '');
    path.setAttribute('data-dw-flow', '');
    path.style.animation = ring.animation;
    path.style.strokeDashoffset = String(ring.offset);
    return path;
  };
  const mask = (width: number): string => {
    const m = document.createElementNS(SVG_NS, 'mask');
    const id = `dw-flow-ring-${++maskCount}-${Math.random().toString(36).slice(2, 7)}`;
    m.setAttribute('id', id);
    m.setAttribute('maskUnits', 'userSpaceOnUse');
    m.setAttribute('data-dw-flow-part', '');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('fill', 'white');
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      const value = String(Math.round(bounds[key] * 100) / 100);
      m.setAttribute(key, value);
      rect.setAttribute(key, value);
    }
    m.append(rect, dots(width, 'black'));
    parent.appendChild(m);
    return `url(#${id})`;
  };
  // A ring cuts a gap into the line and its heads.
  if (ring.hollow || line.getAttribute('stroke-opacity') != null) {
    const masked = [...parent.children].filter((child) => (child.tagName === 'path' || child.tagName === 'ellipse')
      && !child.hasAttribute('data-dw-flow-part') && child.getAttribute('visibility') !== 'hidden'
      && (child.getAttribute('stroke') !== 'none' || child.getAttribute('fill') !== 'none'));
    if (masked.length > 0) {
      const url = mask(ring.size);
      for (const child of masked) {
        child.setAttribute('mask', url);
        child.setAttribute('data-dw-flow-masked', '');
      }
    }
  }
  const moving = dots(ring.size, line.getAttribute('stroke') ?? '#000000');
  if (line.getAttribute('stroke-opacity') != null) moving.setAttribute('stroke-opacity', line.getAttribute('stroke-opacity')!);
  if (ring.hollow) moving.setAttribute('mask', mask(ring.size - 2 * (sw || 1)));
  parent.appendChild(moving);
}

/**
 * Start or stop a connector's flow on its drawing. `on` null: as its style
 * says (flowAnimation=1). A style flow is draw.io's (dashes in the line's
 * pattern, dots or rings, its period and direction); a flow a build starts
 * on a connector without one is draw.io's flow action (8 px dashes moving
 * 16 px every half second). Without motion (print, reduced motion, the
 * slide rail) the dashes stand still.
 */
export function applyConnectorFlow(svg: Element | null, el: ConnectorEl, on: boolean | null): void {
  if (!svg || typeof document === 'undefined') return;
  const style = connectorStyle(el);
  const styled = style.flowAnimation === '1';
  const flowing = on ?? styled;
  const current = svg.querySelector('[data-dw-flow]') != null;
  if (!flowing && !current) return;
  clearFlow(svg);
  if (!flowing) return;
  const line = flowPath(svg);
  if (!line) return;
  installFlowCss();
  if (styled && flowType(style) !== 'dash') {
    addRings(svg, line, el);
    return;
  }
  const own = line.getAttribute('stroke-dasharray');
  line.setAttribute('data-dw-flow', '');
  line.setAttribute('data-dw-flow-dash', own ?? '');
  if (styled) {
    const flow = dashFlow(style, el.scale, own);
    if (flow.dasharray != null) line.setAttribute('stroke-dasharray', flow.dasharray);
    line.style.animation = `${FLOW_KEYFRAMES.dash} ${flow.duration}ms ${flow.timing} infinite ${flow.direction}`;
    line.style.strokeDashoffset = String(flow.offset);
  } else {
    if (style.dashed !== '1') line.setAttribute('stroke-dasharray', '8');
    line.style.animation = `${FLOW_KEYFRAMES.edge} 500ms linear infinite`;
  }
}

/** Whether a connector's drawing is flowing now. */
export function connectorFlowing(node: Element): boolean {
  const svg = cellSvg(node);
  return svg?.querySelector('[data-dw-flow]') != null;
}

/** Put a build state's flow on a connector node (the player's applyState). */
export function syncConnectorFlow(node: Element, el: ConnectorEl, flowing: boolean | undefined): void {
  const svg = cellSvg(node);
  if (!svg) return;
  const want = flowing ?? connectorStyle(el).flowAnimation === '1';
  if (want === (svg.querySelector('[data-dw-flow]') != null)) return;
  applyConnectorFlow(svg, el, want);
}

// --- wipe, pop and highlight ---------------------------------------------------------------

/** Run `show(t)` for t from 0 to 1 over `duration`, linearly; returns a function that finishes it at once. */
function animateFrames(duration: number, show: (t: number) => void, done: () => void, alive: () => boolean): () => void {
  let finished = false;
  let frame = 0;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    clearTimeout(fallback);
    done();
  };
  const started = performance.now();
  const tick = (now: number): void => {
    if (finished) return;
    if (!alive()) {
      finished = true;
      clearTimeout(fallback);
      return;
    }
    const t = Math.min(1, Math.max(0, (now - started) / duration));
    if (t >= 1) finish();
    else {
      show(t);
      frame = requestAnimationFrame(tick);
    }
  };
  show(0);
  frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : 0;
  // A window that gets no frames still ends whole.
  const fallback = setTimeout(finish, duration + 250);
  return finish;
}

/**
 * draw.io's wipe or pop on a cell, in (`inward`) or out. In: the node is on
 * screen whole; its drawing is replaced by frames and put back at the end.
 * Out: the node is already hidden; a copy plays the frames and goes.
 * Linear, as draw.io's executeAnimations steps. Returns a finisher.
 */
export function playCellEffect(
  node: HTMLElement,
  el: DiagramEl,
  kind: 'wipe' | 'pop',
  inward: boolean,
  duration: number,
  slide?: DiagramSlide,
): () => void {
  if (duration <= 0 || typeof document === 'undefined') return () => {};
  const options = cellMarkupOptions(slide, el);
  let host: HTMLElement = node;
  if (!inward && node.style.visibility === 'hidden') return () => {};
  if (!inward) {
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-element-id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.visibility = 'visible';
    ghost.style.pointerEvents = 'none';
    node.after(ghost);
    host = ghost;
  } else if (node.style.visibility === 'hidden') {
    return () => {};
  }
  const original = cellSvg(host);
  if (!original) {
    if (!inward) host.remove();
    return () => {};
  }
  const { labels } = cellParts(el, options);
  let current: SVGElement = original;
  const show = (t: number): void => {
    const f = inward ? t : 1 - t;
    const markup = kind === 'wipe' ? wipeFrameMarkup(el, f, options, labels) : popFrameMarkup(el, f, options, labels);
    const fresh = parseSvg(markup);
    if (!fresh || !current.isConnected) return;
    current.replaceWith(fresh);
    current = fresh;
  };
  return animateFrames(duration, show, () => {
    if (!inward) host.remove();
    else if (current !== original && current.isConnected) current.replaceWith(original);
  }, () => current.isConnected);
}

/**
 * Graph.highlightCell: the cell's outline drawn over it in a colour for
 * `hold` ms, then fading out over 1.2 s. It changes nothing it leaves
 * behind and does not hold up what comes after it.
 */
export function playCellHighlight(
  node: HTMLElement,
  el: DiagramEl,
  color: string | undefined,
  hold: number | undefined,
  opacityPercent: number | null,
  slide?: DiagramSlide,
): () => void {
  if (typeof document === 'undefined' || node.style.visibility === 'hidden') return () => {};
  const overlay = parseSvg(highlightMarkup(el, color ?? DRAWIO_HIGHLIGHT_COLOR, cellMarkupOptions(slide, el)));
  if (!overlay) return () => {};
  overlay.classList.add('dw-highlight');
  overlay.style.pointerEvents = 'none';
  overlay.style.opacity = String(Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100);
  node.appendChild(overlay);
  const wait = hold ?? DRAWIO_HIGHLIGHT_DURATION;
  let fade = null as Animation | null;
  const timer = setTimeout(() => {
    if (!overlay.isConnected) return;
    fade = overlay.animate?.([{ opacity: overlay.style.opacity }, { opacity: '0' }],
      { duration: DRAWIO_HIGHLIGHT_FADE, easing: 'ease-in-out', fill: 'forwards' }) ?? null;
    if (fade) void fade.finished.then(() => overlay.remove(), () => overlay.remove());
    else overlay.remove();
  }, wait);
  return () => {
    clearTimeout(timer);
    fade?.cancel();
    overlay.remove();
  };
}

// --- Morph ----------------------------------------------------------------------------------

function placeNode(node: HTMLElement, el: DiagramEl): void {
  node.style.left = `${el.x}px`;
  node.style.top = `${el.y}px`;
  node.style.width = `${el.w}px`;
  node.style.height = `${el.h}px`;
  node.style.transform = elementTransform(el);
}

/**
 * The diagram cells of a Morph: each frame, every paired vertex drawn at
 * its box between the two slides' (eased like the rest of the Morph), and
 * every connector one of them holds re-routed between them with draw.io's
 * router; a restyled or relabelled cell cross-fades its paint and labels.
 * The nodes end exactly as the target slide drew them.
 */
export function morphDiagramCells(
  stage: ParentNode,
  pairs: readonly CellPair[],
  target: DiagramSlide & { elements: readonly SlideElement[] },
  duration: number,
  easing: string,
): () => void {
  if (pairs.length === 0 || duration <= 0 || typeof document === 'undefined') return () => {};
  const ease = easingFunction(easing);
  const nodes = new Map<string, { node: HTMLElement; original: SVGElement; current: SVGElement; el: DiagramEl }>();
  const byId = new Map(target.elements.map((el) => [el.id, el]));
  const show = (t: number): void => {
    const e = ease(t);
    for (const [id, cell] of morphDiagramFrame(pairs, target.elements, e)) {
      let entry = nodes.get(id);
      if (!entry) {
        const node = stage.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(id)}"]`);
        const original = node ? cellSvg(node) : null;
        const el = byId.get(id);
        if (!node || !original || !el || (el.type !== 'vertex' && el.type !== 'connector') || node.style.visibility === 'hidden') continue;
        entry = { node, original, current: original, el };
        nodes.set(id, entry);
      }
      if (!entry.current.isConnected) continue;
      placeNode(entry.node, cell.now);
      const fresh = parseSvg(morphFrameMarkup(cell, e, cellMarkupOptions(target, entry.el)));
      if (!fresh) continue;
      entry.current.replaceWith(fresh);
      entry.current = fresh;
    }
  };
  return animateFrames(duration, show, () => {
    for (const { node, original, current, el } of nodes.values()) {
      placeNode(node, el);
      if (current !== original && current.isConnected) current.replaceWith(original);
    }
  }, () => true);
}
