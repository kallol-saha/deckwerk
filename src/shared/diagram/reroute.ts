/**
 * Keeping connectors attached: after any change to a deck, every connector
 * joined to a vertex that moved, resized, turned or restyled is routed
 * again, and a connector whose vertex was deleted keeps its end where it
 * was as a loose end (draw.io's Delete without "and connections").
 *
 * Every path that changes a deck runs this — the editor's commits, agent
 * transactions, `.drawio` apply — so a route is never stale, whoever moved
 * the vertex.
 */

import type { ConnectorEl, Deck, Slide, SlideElement } from '../deck.js';
import { rerouteConnectors } from './element.js';

function hasDiagram(slide: Slide): boolean {
  return slide.elements.some((el) => el.type === 'connector');
}

/** The ids on `slide` that differ from `before` (changed, added or removed). */
function touchedIds(before: Slide | undefined, slide: Slide): Set<string> {
  const touched = new Set<string>();
  if (!before) {
    for (const el of slide.elements) touched.add(el.id);
    return touched;
  }
  const old = new Map(before.elements.map((el) => [el.id, el]));
  for (const el of slide.elements) {
    if (old.get(el.id) !== el) touched.add(el.id);
    old.delete(el.id);
  }
  for (const id of old.keys()) touched.add(id);
  return touched;
}

/** Ends attached to a vertex that is gone become loose ends where they were. */
function loosenDangling(elements: readonly SlideElement[]): Map<string, ConnectorEl> {
  const vertices = new Set(elements.filter((el) => el.type === 'vertex').map((el) => el.id));
  const out = new Map<string, ConnectorEl>();
  for (const el of elements) {
    if (el.type !== 'connector') continue;
    const sourceGone = el.source != null && !vertices.has(el.source);
    const targetGone = el.target != null && !vertices.has(el.target);
    if (!sourceGone && !targetGone) continue;
    const first = el.route[0] ?? el.sourcePoint ?? { x: el.x, y: el.y };
    const last = el.route[el.route.length - 1] ?? el.targetPoint ?? { x: el.x + el.w, y: el.y + el.h };
    out.set(el.id, {
      ...el,
      ...(sourceGone ? { source: null, sourcePoint: { ...first } } : {}),
      ...(targetGone ? { target: null, targetPoint: { ...last } } : {}),
    });
  }
  return out;
}

/**
 * Cell ids are unique within a diagram. A paste or a duplicate can bring a
 * second cell with an id the diagram already has; the later one in paint
 * order gets a fresh id (as draw.io gives pasted cells new ids).
 */
function dedupeCells(elements: readonly SlideElement[]): SlideElement[] | null {
  const used = new Set<string>();
  for (const el of elements) if (el.type === 'vertex' || el.type === 'connector') {
    for (const label of el.type === 'connector' ? el.labels : []) used.add(`${el.diagram}\u0000${label.cell}`);
  }
  const seen = new Set<string>();
  let changed = false;
  const out = elements.map((el) => {
    if (el.type !== 'vertex' && el.type !== 'connector') return el;
    const key = `${el.diagram}\u0000${el.cell}`;
    if (!seen.has(key)) {
      seen.add(key);
      return el;
    }
    let n = 2;
    while (seen.has(`${el.diagram}\u0000${el.cell}-${n}`) || used.has(`${el.diagram}\u0000${el.cell}-${n}`)) n++;
    const cell = `${el.cell}-${n}`;
    seen.add(`${el.diagram}\u0000${cell}`);
    changed = true;
    return { ...el, cell };
  });
  return changed ? out : null;
}

/**
 * A connector whose box was moved as a whole (dragged, nudged, aligned)
 * takes its waypoints and loose ends along; attached ends stay attached and
 * the route is recomputed. Anything else that changed is left to routing.
 */
function followMoves(before: Slide | undefined, elements: readonly SlideElement[]): SlideElement[] | null {
  if (!before) return null;
  const old = new Map(before.elements.map((el) => [el.id, el]));
  let changed = false;
  const out = elements.map((el) => {
    if (el.type !== 'connector') return el;
    const prev = old.get(el.id);
    if (!prev || prev === el || prev.type !== 'connector') return el;
    const dx = el.x - prev.x;
    const dy = el.y - prev.y;
    if (dx === 0 && dy === 0) return el;
    // A pure move: same size, same route, same waypoints as before.
    if (Math.abs(el.w - prev.w) > 1e-6 || Math.abs(el.h - prev.h) > 1e-6) return el;
    if (el.route !== prev.route && JSON.stringify(el.route) !== JSON.stringify(prev.route)) return el;
    if (el.points !== prev.points && JSON.stringify(el.points) !== JSON.stringify(prev.points)) return el;
    const shift = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
    changed = true;
    return {
      ...el,
      points: el.points.map(shift),
      sourcePoint: el.sourcePoint ? shift(el.sourcePoint) : null,
      targetPoint: el.targetPoint ? shift(el.targetPoint) : null,
      route: el.route.map(shift),
    };
  });
  return changed ? out : null;
}

/** One slide with its connectors brought up to date; the same object when nothing changed. */
export function routeSlide(slide: Slide, before?: Slide): Slide {
  const hasCells = slide.elements.some((el) => el.type === 'vertex' || el.type === 'connector');
  if (!hasCells) return slide;
  const touched = touchedIds(before, slide);
  if (touched.size === 0) return slide;
  const deduped = dedupeCells(slide.elements);
  if (deduped) slide = { ...slide, elements: deduped };
  if (!hasDiagram(slide)) return slide;
  const moved = followMoves(before, slide.elements);
  if (moved) slide = { ...slide, elements: moved };
  let elements = slide.elements;
  const loosened = loosenDangling(elements);
  if (loosened.size > 0) {
    elements = elements.map((el) => loosened.get(el.id) ?? el);
    for (const id of loosened.keys()) touched.add(id);
  }
  const routed = rerouteConnectors(elements, touched);
  if (routed.size === 0 && loosened.size === 0) return elements === slide.elements ? slide : { ...slide, elements };
  return { ...slide, elements: elements.map((el) => routed.get(el.id) ?? el) };
}

/**
 * `next` with every connector routed against its vertices. Slides that are
 * the same object in `previous` are skipped, so a commit that touched one
 * slide costs one slide. Returns `next` itself when nothing changed.
 */
export function withRoutedConnectors(previous: Deck | null, next: Deck): Deck {
  const before = new Map((previous?.slides ?? []).map((s) => [s.id, s]));
  let changed = false;
  const slides = next.slides.map((slide) => {
    const old = before.get(slide.id);
    if (old === slide) return slide;
    const routed = routeSlide(slide, old);
    if (routed !== slide) changed = true;
    return routed;
  });
  return changed ? { ...next, slides } : next;
}
