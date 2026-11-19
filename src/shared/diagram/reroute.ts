/**
 * Keeping connectors attached: after any change to a deck, every connector
 * joined to a vertex that moved, resized, turned or restyled is routed
 * again, and a connector whose vertex was deleted keeps its end where it
 * was as a loose end (draw.io's Delete without "and connections").
 *
 * Every path that changes a deck runs this — the editor's commits, agent
 * transactions, `.drawio` apply — so a route is never stale, whoever moved
 * the vertex.
 *
 * The editor's commits also carry the deck before the change, and only
 * then do draw.io's structure rules run here (agent transactions and undo
 * write every cell they change themselves):
 *
 * - Contents follow their container. draw.io keeps a child's geometry
 *   relative to its parent, so moving a group, container or swimlane moves
 *   everything inside it, waypoints and loose ends included.
 * - Resizing a group scales what is inside (draw.io's resize handle with
 *   Graph.isRecursiveVertexResize: not a swimlane, has children, not
 *   collapsed, no `recursiveResize=0`, no `childLayout`; mxGraph.scaleCell).
 *   Any other container keeps its contents where they are relative to its
 *   top-left corner. Ports (relative children) stay at their fraction of
 *   their host's size.
 * - A cell the commit itself moved or resized (it was selected too) is left
 *   as the commit made it.
 *
 * Whatever the path, cells under a hidden layer or a collapsed container
 * are marked `concealed`, and a connector to a concealed cell is routed to
 * the collapsed container that stands for it (mxGraphView.getVisibleTerminal).
 */

import type { ConnectorEl, Deck, Slide, SlideElement, VertexEl } from '../deck.js';
import { rerouted } from './element.js';
import { resolveStyle } from './style.js';
import {
  DiagramTree, concealmentChanges, isCell, isCellMovable, isCellResizable, isSwimlane, visibleTerminal,
  type DiagramCellEl,
} from './structure.js';
import type { Point } from './types.js';

const EPSILON = 1e-6;

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
 * order gets a fresh id (as draw.io gives pasted cells new ids). A copy
 * whose group or container was copied with it moves into that copy.
 */
function dedupeCells(elements: readonly SlideElement[]): SlideElement[] | null {
  const used = new Set<string>();
  for (const el of elements) if (el.type === 'vertex' || el.type === 'connector') {
    for (const label of el.type === 'connector' ? el.labels : []) used.add(`${el.diagram}\u0000${label.cell}`);
  }
  const seen = new Set<string>();
  const renamed = new Map<string, string>();
  const ambiguous = new Set<string>();
  const copies = new Set<string>();
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
    if (renamed.has(key)) ambiguous.add(key);
    else renamed.set(key, cell);
    copies.add(el.id);
    changed = true;
    return { ...el, cell };
  });
  if (!changed) return null;
  return out.map((el) => {
    if (!copies.has(el.id) || !isCell(el) || el.parent == null) return el;
    const parentKey = `${el.diagram}\u0000${el.parent}`;
    const parent = renamed.get(parentKey);
    return parent && !ambiguous.has(parentKey) ? { ...el, parent } : el;
  });
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

// --- contents follow their containers ------------------------------------------------

interface Box { x: number; y: number; w: number; h: number }

const boxOf = (el: Box): Box => ({ x: el.x, y: el.y, w: el.w, h: el.h });

function sameBox(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON
    && Math.abs(a.w - b.w) <= EPSILON && Math.abs(a.h - b.h) <= EPSILON;
}

function samePoint(a: Point | null, b: Point | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

/** The commit left the cell's geometry as it was. */
function sameGeometry(prev: SlideElement, el: DiagramCellEl): boolean {
  if (prev === el) return true;
  if (prev.type !== el.type || !sameBox(prev, el)) return false;
  if (prev.type !== 'connector' || el.type !== 'connector') return true;
  return prev.points.length === el.points.length && prev.points.every((p, i) => samePoint(p, el.points[i]))
    && samePoint(prev.sourcePoint, el.sourcePoint) && samePoint(prev.targetPoint, el.targetPoint);
}

/** Graph.isRecursiveVertexResize: a resize of this cell scales its children. */
function isRecursiveResize(tree: DiagramTree, el: VertexEl): boolean {
  if (isSwimlane(el) || el.collapsed || tree.children(el).length === 0) return false;
  const style = resolveStyle(el.dio, 'vertex');
  return (style.recursiveResize ?? '1') === '1' && style.childLayout == null;
}

/**
 * The cells inside every group, container or swimlane the commit moved or
 * resized, brought along (see the file comment). Returns the replaced
 * elements by id, or null when no container changed.
 */
function followContainers(before: Slide, slide: Slide): Map<string, SlideElement> | null {
  const old = new Map(before.elements.map((el) => [el.id, el]));
  // Most commits move no vertex at all (typing, restyling): skip the tree.
  const anyBoxChanged = slide.elements.some((el) => {
    if (el.type !== 'vertex') return false;
    const prev = old.get(el.id);
    return prev !== undefined && prev !== el && prev.type === 'vertex' && !sameBox(prev, el);
  });
  if (!anyBoxChanged) return null;
  const tree = new DiagramTree(slide);
  const movers: VertexEl[] = [];
  for (const el of tree.byId.values()) {
    if (el.type !== 'vertex') continue;
    const prev = old.get(el.id);
    if (!prev || prev === el || prev.type !== 'vertex') continue;
    // Folding swaps the bounds itself (structure.ts setCollapsed).
    if (Boolean(prev.collapsed) !== Boolean(el.collapsed)) continue;
    if (sameBox(prev, el) || tree.children(el).length === 0) continue;
    movers.push(el);
  }
  if (movers.length === 0) return null;
  const moverIds = new Set(movers.map((m) => m.id));
  movers.sort((a, b) => tree.depth(a) - tree.depth(b));
  const out = new Map<string, SlideElement>();
  const handled = new Set<string>();

  const untouched = (el: DiagramCellEl): boolean => {
    const prev = old.get(el.id);
    return prev !== undefined && sameGeometry(prev, el);
  };

  // Children of a cell whose box went from `from` to `to`: shifted with its
  // corner, or (scale) placed and sized by mxGraph.scaleCell.
  const follow = (parent: DiagramCellEl, from: Box, to: Box, scale: boolean) => {
    const sx = from.w !== 0 ? to.w / from.w : 1;
    const sy = from.h !== 0 ? to.h / from.h : 1;
    const map = (p: Point): Point => (scale
      ? { x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }
      : { x: p.x + to.x - from.x, y: p.y + to.y - from.y });
    for (const child of tree.children(parent)) {
      if (handled.has(child.id) || moverIds.has(child.id)) continue;
      handled.add(child.id);
      if (!untouched(child)) continue;
      if (child.type === 'connector') {
        const at = map({ x: child.x, y: child.y });
        out.set(child.id, {
          ...child,
          x: at.x,
          y: at.y,
          points: child.points.map(map),
          sourcePoint: child.sourcePoint ? map(child.sourcePoint) : null,
          targetPoint: child.targetPoint ? map(child.targetPoint) : null,
          route: child.route.map(map),
        });
        continue;
      }
      const prevBox = boxOf(child);
      let nextBox: Box;
      if (child.relative) {
        // A port: the same fraction of its host's (new) size, the same size.
        const off = child.relative.offset ?? { x: 0, y: 0 };
        const ox = off.x * child.scale;
        const oy = off.y * child.scale;
        const fx = from.w !== 0 ? (child.x - from.x - ox) / from.w : child.relative.x;
        const fy = from.h !== 0 ? (child.y - from.y - oy) / from.h : child.relative.y;
        nextBox = { x: to.x + fx * to.w + ox, y: to.y + fy * to.h + oy, w: child.w, h: child.h };
      } else if (!scale) {
        nextBox = { ...prevBox, x: prevBox.x + to.x - from.x, y: prevBox.y + to.y - from.y };
      } else {
        // mxGeometry.scale, then the style's resizeWidth/resizeHeight, movable and resizable.
        const style = resolveStyle(child.dio, 'vertex');
        const fixed = style.aspect === 'fixed';
        const kx = fixed ? Math.min(sx, sy) : sx;
        const ky = fixed ? Math.min(sx, sy) : sy;
        let w = prevBox.w * kx;
        let h = prevBox.h * ky;
        if (style.resizeWidth === '1') w = prevBox.w * sx;
        else if (style.resizeWidth === '0') w = prevBox.w;
        if (style.resizeHeight === '1') h = prevBox.h * sy;
        else if (style.resizeHeight === '0') h = prevBox.h;
        let x = to.x + (prevBox.x - from.x) * sx;
        let y = to.y + (prevBox.y - from.y) * sy;
        if (!isCellMovable(slide, child, tree)) {
          x = to.x + (prevBox.x - from.x);
          y = to.y + (prevBox.y - from.y);
        }
        if (!isCellResizable(slide, child, tree)) {
          w = prevBox.w;
          h = prevBox.h;
        }
        nextBox = { x, y, w: Math.max(w, 0.01), h: Math.max(h, 0.01) };
      }
      if (!sameBox(prevBox, nextBox)) out.set(child.id, { ...child, ...nextBox });
      // Inside a scaled cell everything scales (cellResized with recurse);
      // inside a moved one everything moves.
      follow(child, prevBox, nextBox, scale && !child.relative);
    }
  };

  for (const mover of movers) {
    const prev = old.get(mover.id) as VertexEl;
    const resized = Math.abs(prev.w - mover.w) > EPSILON || Math.abs(prev.h - mover.h) > EPSILON;
    follow(mover, boxOf(prev), boxOf(mover), resized && isRecursiveResize(tree, mover));
  }
  return out.size > 0 ? out : null;
}

// --- concealment and routing -----------------------------------------------------------

/** `concealed` brought up to date on every cell; null when every flag is right. */
function syncConcealment(slide: Slide): Map<string, SlideElement> | null {
  const changes = concealmentChanges(slide);
  if (changes.size === 0) return null;
  const out = new Map<string, SlideElement>();
  for (const el of slide.elements) {
    if (!isCell(el) || !changes.has(el.id)) continue;
    if (changes.get(el.id)) {
      out.set(el.id, { ...el, concealed: true });
    } else {
      const copy = { ...el };
      delete copy.concealed;
      out.set(el.id, copy);
    }
  }
  return out;
}

function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 1e-6 || Math.abs(a[i].y - b[i].y) > 1e-6) return false;
  }
  return true;
}

/**
 * Every drawn connector attached to (or being) one of `touched`, routed
 * against the cells its ends are drawn to: a cell inside a collapsed
 * container is stood in for by that container. A connector that is not
 * drawn keeps its last route until it is shown again.
 */
function rerouteTouched(slide: Slide, touched: ReadonlySet<string>): Map<string, ConnectorEl> {
  const tree = new DiagramTree(slide);
  const find = (id: string): VertexEl | undefined => {
    const vertex = tree.vertex(id);
    if (!vertex || (!vertex.hidden && !vertex.concealed)) return vertex;
    return visibleTerminal(tree, vertex) ?? vertex;
  };
  const out = new Map<string, ConnectorEl>();
  for (const el of slide.elements) {
    if (el.type !== 'connector' || el.hidden || el.concealed) continue;
    if (!touched.has(el.id) && !(el.source && touched.has(el.source)) && !(el.target && touched.has(el.target))) continue;
    const next = rerouted(el, find);
    if (!samePoints(next.route, el.route) || next.x !== el.x || next.y !== el.y || next.w !== el.w || next.h !== el.h) {
      out.set(el.id, next);
    }
  }
  return out;
}

function replaced(slide: Slide, changes: ReadonlyMap<string, SlideElement>, touched: Set<string>): Slide {
  for (const id of changes.keys()) touched.add(id);
  return { ...slide, elements: slide.elements.map((el) => changes.get(el.id) ?? el) };
}

/** One slide with its connectors brought up to date; the same object when nothing changed. */
export function routeSlide(slide: Slide, before?: Slide): Slide {
  const hasCells = slide.elements.some((el) => el.type === 'vertex' || el.type === 'connector');
  if (!hasCells) return slide;
  const touched = touchedIds(before, slide);
  if (touched.size === 0) return slide;
  const deduped = dedupeCells(slide.elements);
  if (deduped) slide = { ...slide, elements: deduped };
  if (before) {
    const followed = followContainers(before, slide);
    if (followed) slide = replaced(slide, followed, touched);
  }
  const concealment = syncConcealment(slide);
  if (concealment) slide = replaced(slide, concealment, touched);
  if (!hasDiagram(slide)) return slide;
  const moved = followMoves(before, slide.elements);
  if (moved) slide = { ...slide, elements: moved };
  const loosened = loosenDangling(slide.elements);
  if (loosened.size > 0) slide = replaced(slide, loosened, touched);
  const routed = rerouteTouched(slide, touched);
  if (routed.size === 0) return slide;
  return { ...slide, elements: slide.elements.map((el) => routed.get(el.id) ?? el) };
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
