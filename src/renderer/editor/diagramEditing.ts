/*
 * draw.io's mouse interactions for diagram cells on the editor canvas.
 * Behaviour, images and timing follow draw.io (jgraph/drawio 32.7.4,
 * Apache License 2.0): HoverIcons and the handler overrides in
 * js/grapheditor/Graph.js, mxConnectionHandler, mxConstraintHandler,
 * mxEdgeHandler, mxEdgeSegmentHandler, mxElbowEdgeHandler and
 * mxGraphHandler under mxgraph/src/handler. Modified for DeckWerk: one
 * module over the editor store, drawing into the canvas overlay; the
 * geometry lives in shared/diagram/editing.ts.
 *
 * What it does:
 * - Hovering a connectable shape shows its connection points (blue x's)
 *   at once and, after draw.io's activation delay, the four blue arrows.
 *   Hovering an arrow previews the clone it would make; clicking it clones
 *   the shape that way with a connector (Graph.connectVertex); dragging it
 *   draws a new connector that attaches where it is let go, or clones the
 *   shape there over empty slide.
 * - Pressing a connection point starts a connector from it.
 * - A selected connector shows draw.io's edge handles instead of a box:
 *   its ends (reconnect or detach), its waypoints and virtual bends, its
 *   segments (orthogonal) or its elbow, and its label.
 * - A connector moved without the shapes it joins is detached from them;
 *   a shape moved over a container is put into it, and out of it when it
 *   leaves; a click on a grouped shape selects the group first.
 *
 * The canvas calls in at a few points (see canvas.ts): `hover` while no
 * button is down, `pointerDown` before its own hit test (a returned
 * gesture becomes the drag), `pickCell` on the hit, `beginMove`,
 * `moveFeedback` and `endMove` around object moves, `endGesture` when any
 * drag ends, `connectorChrome` for each selected connector and `overlay`
 * once per overlay redraw.
 */

import './diagramEditing.css';
import type { ConnectorEl, Slide, SlideElement, VertexEl } from '@shared/deck.js';
import { makeId } from '@shared/geometry.js';
import { SvgCanvas } from '@shared/diagram/canvas.js';
import { connectorMarkup, connectorStyle, isConcealed, vertexStyle } from '@shared/diagram/element.js';
import { paintVertex } from '@shared/diagram/paint.js';
import { DEFAULT_EDGE_STYLE, freshCellId, newConnector, usedCellIds } from '@shared/diagram/insert.js';
import type { ConnectionConstraint } from '@shared/diagram/route.js';
import { resolveStyle, styleNames } from '@shared/diagram/style.js';
import { CELL_STYLES } from '@shared/diagram/format.js';
import { itemSvg } from '@shared/diagram/library/template.js';
import { PALETTES } from '@shared/diagram/library/index.js';
import {
  DiagramTree, isCellLocked, isCellMovable, isCellResizable, isCellSelectable, isContainer, isSwimlane,
  isValidDropTarget, reparent,
} from '@shared/diagram/structure.js';
import type { Point, Rect } from '@shared/diagram/types.js';
import {
  DEFAULT_EDGE_LENGTH, DIRECTIONS, HOVER, OUTLINE_CONNECT_DELAY, OUTLINE_HIGHLIGHT, POINT_ICON_SIZE, VIRTUAL_BEND_OPACITY,
  outlineConstraint, outlineDistance,
  allowsArrows, ancestors, applyNewEdgeStyle, bendPreviewPoints, boxContains, connectTarget,
  detachedForMove, directionalDistance, dropClonePlacement, dropTarget, edgeHandles, elbowCursor, endConstraint,
  flippedElbow, focusArea, frameOf, gridTileSvg, growRect, hoverArrowRects, hoverCollisionProbes, hoverStep, initialCell,
  isConnectable, isGroupVertex, labelAnchor, labelGeometryAt, libraryPickerEntries,
  nearestConnectionPoint, parentVertex, pastedStyle, pickerEntries, rectContains, rectsIntersect, removableWaypoint, rotatedBox,
  segmentCursor, segmentDragPoints, snapDeltaToGrid, snapToGrid, snapToGridLine, snapToPoints, storedPoint, terminalLook, unionRects,
  vertexHitAt, visibleArrows, vertexConnectionPoints, withConnectionConstraint,
  type Direction, type EdgeHandle, type HoverMemory, type PickerEntry,
} from '@shared/diagram/editing.js';
import { currentLayer } from './diagramCommands.js';
import type { EditorStore } from './store.js';

type XY = Point;

// --- draw.io's images --------------------------------------------------------------------

const ARROW_FILL = '#29b6f2';

/** Graph.createSvgImage as a data URI. */
function svgImage(w: number, h: number, body: string, viewW?: number, viewH?: number): string {
  const viewBox = viewW != null && viewH != null ? ` viewBox="0 0 ${viewW} ${viewH}"` : '';
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}px" height="${h}px"${viewBox} version="1.1">${body}</svg>`,
  )}`;
}

/** HoverIcons.triangleUp/Right/Down/Left. */
const ARROW_IMAGES: Record<Direction, string> = {
  north: svgImage(18, 28, `<path d="m 6 26 L 12 26 L 12 12 L 18 12 L 9 1 L 1 12 L 6 12 z" stroke="#fff" fill="${ARROW_FILL}"/>`),
  east: svgImage(26, 18, `<path d="m 1 6 L 14 6 L 14 1 L 26 9 L 14 18 L 14 12 L 1 12 z" stroke="#fff" fill="${ARROW_FILL}"/>`),
  south: svgImage(18, 26, `<path d="m 6 1 L 6 14 L 1 14 L 9 26 L 18 14 L 12 14 L 12 1 z" stroke="#fff" fill="${ARROW_FILL}"/>`),
  west: svgImage(28, 18, `<path d="m 1 9 L 12 1 L 12 6 L 26 6 L 26 12 L 12 12 L 12 18 z" stroke="#fff" fill="${ARROW_FILL}"/>`),
};

/** The handle images draw.io's edge handler uses (HoverIcons.mainHandle, …). */
const HANDLE_IMAGES = {
  main: { size: 18, src: svgImage(18, 18, `<circle cx="9" cy="9" r="5" stroke="#fff" fill="${ARROW_FILL}"/>`) },
  endMain: { size: 18, src: svgImage(18, 18, `<circle cx="9" cy="9" r="6" stroke="#fff" fill="${ARROW_FILL}"/>`) },
  secondary: { size: 16, src: svgImage(16, 16, '<path d="m 8 3 L 13 8 L 8 13 L 3 8 z" stroke="#fff" fill="#fca000"/>') },
  fixed: {
    size: 22,
    src: svgImage(22, 22, '<circle cx="11" cy="11" r="6" stroke="#fff" fill="#01bd22"/><path d="m 8 8 L 14 14M 8 14 L 14 8" stroke="#fff"/>'),
  },
  endFixed: {
    size: 22,
    src: svgImage(22, 22, '<circle cx="11" cy="11" r="7" stroke="#fff" fill="#01bd22"/><path d="m 8 8 L 14 14M 8 14 L 14 8" stroke="#fff"/>'),
  },
  terminal: {
    size: 22,
    src: svgImage(22, 22, `<circle cx="11" cy="11" r="6" stroke="#fff" fill="${ARROW_FILL}"/><circle cx="11" cy="11" r="3" stroke="#fff" fill="transparent"/>`),
  },
  endTerminal: {
    size: 22,
    src: svgImage(22, 22, `<circle cx="11" cy="11" r="7" stroke="#fff" fill="${ARROW_FILL}"/><circle cx="11" cy="11" r="3" stroke="#fff" fill="transparent"/>`),
  },
} as const;

/** mxConstraintHandler.pointImage (Graph.js). */
const POINT_IMAGE = svgImage(5, 5,
  '<path d="m 0 0 L 5 5 M 0 5 L 5 0" stroke-width="2" style="stroke-opacity:0.4" stroke="#ffffff"/>'
  + `<path d="m 0 0 L 5 5 M 0 5 L 5 0" stroke="${ARROW_FILL}"/>`);

/** mxConstants as Graph.js sets them. */
const VALID_COLOR = '#00a8ff';
const DROP_TARGET_COLOR = '#0000FF';
const HIGHLIGHT_STROKEWIDTH = 5;
const HIGHLIGHT_OPACITY = 0.5;
/** mxConstants.HIGHLIGHT_SIZE + 1 around the point icon, less a pixel: a 16 px disc. */
const POINT_HIGHLIGHT_SIZE = 16;
/** mxEdgeHandler.getSnapToTerminalTolerance */
const SNAP_TO_TERMINAL_PX = 2;
const DOUBLE_CLICK_MS = 500;
/** Editor.shapePickerHoverDelay */
const SHAPE_PICKER_HOVER_DELAY = 300;
/** EditorUi's nudge: one undoable step after the keys pause this long (commitNudge). */
const NUDGE_COMMIT_MS = 400;

// --- the canvas this works on ---------------------------------------------------------------

export interface DiagramCanvasHost {
  readonly store: EditorStore;
  /** The canvas host element (cursor classes go on it). */
  readonly host: HTMLElement;
  /** The scaled stage the slide and overlay live in. */
  readonly stage: HTMLElement;
  /** Screen pixels per slide pixel. */
  zoom(): number;
  /** The topmost element at a slide point, as a click picks it. */
  hitTest(point: XY): SlideElement | null;
  /** Redraw the selection overlay. */
  redrawOverlay(): void;
  /** Typing, a pen, point editing or cropping is under way: no hover chrome. */
  busy(): boolean;
}

/** A drag the canvas hands its pointer to. */
export interface DiagramGesture {
  move(point: XY, ev: PointerEvent): void;
  up(point: XY, ev: PointerEvent, dragged: boolean): void;
  cancel(): void;
}

interface ArrowState {
  id: string;
  rects: Record<Direction, Rect>;
  visible: Record<Direction, boolean>;
  /** HoverIcons.bbox: the shape and its arrows, grown by 10 screen px. */
  bbox: Rect;
}

interface FocusState {
  id: string;
  /** The element the points were computed for. */
  el: VertexEl;
  points: Array<{ constraint: ConnectionConstraint; at: Point }>;
  area: Rect;
}

interface Feedback {
  /** A shape outlined: a connection's drop target (blue) or a container (dark blue). */
  highlight?: { id: string; color: string; width: number } | null;
  /** A connector drawn in the overlay: the one being made, or the click preview. */
  preview?: ConnectorEl | null;
  previewFaint?: boolean;
  /** The dashed outline of where a clone would go (geDragPreview). */
  ghost?: { box: Rect; rot: number } | null;
}

type Cell = VertexEl | ConnectorEl;

const isCell = (el: SlideElement | null | undefined): el is Cell => el?.type === 'vertex' || el?.type === 'connector';

export class DiagramEditing {
  /** The overlay layer this draws into, kept across overlay redraws. */
  readonly layer: HTMLDivElement;
  private hoverMemory: HoverMemory = { prev: null, startTime: null, current: null };
  private hoverTimer: number | null = null;
  private arrows: ArrowState | null = null;
  private activeArrow: Direction | null = null;
  /** Arrows hidden while the button is down (HoverIcons.setDisplay('none')). */
  private arrowsHidden = false;
  private focus: FocusState | null = null;
  private focusIndex = -1;
  private feedback: Feedback = {};
  private gesture: DiagramGesture | null = null;
  /** The child a click on a selected group selects when it does not drag. */
  private delayedSelection: string | null = null;
  /** The last press on an edge handle, for double-clicks. */
  private lastHandlePress: { key: string; time: number; x: number; y: number } | null = null;

  constructor(private readonly canvas: DiagramCanvasHost) {
    this.layer = document.createElement('div');
    this.layer.className = 'dg-layer';
  }

  // --- model access --------------------------------------------------------------------

  private get store(): EditorStore {
    return this.canvas.store;
  }

  private elements(): SlideElement[] {
    return this.store.slide?.elements ?? [];
  }

  private find(id: string | null | undefined): SlideElement | undefined {
    if (!id) return undefined;
    return this.elements().find((el) => el.id === id);
  }

  private vertex(id: string | null | undefined): VertexEl | undefined {
    const el = this.find(id);
    return el?.type === 'vertex' ? el : undefined;
  }

  private connector(id: string | null | undefined): ConnectorEl | undefined {
    const el = this.find(id);
    return el?.type === 'connector' ? el : undefined;
  }

  private findVertex = (id: string): VertexEl | undefined => this.vertex(id);

  private treeCache: { slide: Slide; tree: DiagramTree } | null = null;

  /** The draw.io tree of the current slide (structure.ts), built once per slide state. */
  private tree(): DiagramTree | null {
    const slide = this.store.slide;
    if (!slide) return null;
    if (this.treeCache?.slide !== slide) this.treeCache = { slide, tree: new DiagramTree(slide) };
    return this.treeCache.tree;
  }

  /**
   * May an element be picked on the canvas (click, marquee, hover)? Diagram
   * cells not drawn, or on a locked layer, may not (structure.ts's
   * isCellSelectable); everything else may.
   */
  selectable(el: SlideElement): boolean {
    if (!isCell(el)) return true;
    const slide = this.store.slide;
    const tree = this.tree();
    return !slide || !tree || isCellSelectable(slide, el, tree);
  }

  /** draw.io's isCellLocked: the cell, a container around it or its layer is locked. */
  private locked(el: Cell): boolean {
    const slide = this.store.slide;
    const tree = this.tree();
    return Boolean(slide && tree && isCellLocked(slide, el, tree));
  }

  private movable(el: Cell): boolean {
    const slide = this.store.slide;
    const tree = this.tree();
    return !slide || !tree || isCellMovable(slide, el, tree);
  }

  private zoom(): number {
    return this.canvas.zoom() || 1;
  }

  /** The diagram's grid in draw.io units, or 0 when it is off. */
  private gridSize(el: Cell): number {
    const meta = this.store.slide?.diagrams?.[el.diagram];
    if (meta?.model?.grid === '0') return 0;
    const size = Number(meta?.model?.gridSize ?? 10);
    return Number.isFinite(size) && size > 0 ? size : 10;
  }

  /**
   * The topmost visible vertex at a point (box test, turned with the
   * shape), skipping `exclude` and, when asked, transparent groups.
   */
  private vertexAt(point: XY, opts: { exclude?: ReadonlySet<string>; skipGroups?: boolean } = {}): VertexEl | null {
    const ordered = this.elements().map((el, i) => ({ el, i }))
      .sort((a, b) => b.el.z - a.el.z || b.i - a.i);
    for (const { el } of ordered) {
      if (el.type !== 'vertex' || isConcealed(el) || el.layoutMasterId || !this.selectable(el)) continue;
      if (opts.exclude?.has(el.id)) continue;
      if (opts.skipGroups && isGroupVertex(el)) continue;
      if (boxContains(el, point)) return el;
    }
    return null;
  }

  /**
   * The shape the pointer is over for hovering and connecting: what a
   * click would hit, with connectors transparent (draw.io's constraint
   * handler looks through edges) and anything else on top hiding it.
   */
  private hoveredVertex(point: XY, exclude?: ReadonlySet<string>): VertexEl | null {
    const hit = this.canvas.hitTest(point);
    let v: VertexEl | null = null;
    if (hit?.type === 'vertex' && !exclude?.has(hit.id)) v = hit;
    else if (!hit || hit.type === 'connector' || exclude?.has(hit.id)) v = this.vertexAt(point, { exclude });
    if (!v) return null;
    // Uses the connectable parent vertex if the shape is not connectable
    if (!isConnectable(v)) {
      const parent = parentVertex(this.elements(), v);
      v = parent && isConnectable(parent) ? parent : null;
    }
    // Locked cells get no arrows and no connection points (HoverIcons.getState,
    // mxConstraintHandler.getCellForEvent)
    return v && !isConcealed(v) && this.selectable(v) && !this.locked(v) ? v : null;
  }

  // --- hover --------------------------------------------------------------------------------

  /** A pointer move with no button down and no drag. */
  hover(ev: PointerEvent, point: XY): void {
    // Slides without diagram shapes cost no hit test per pointer move.
    if (this.canvas.busy() || ev.buttons !== 0 || !this.store.slide?.elements.some((el) => el.type === 'vertex')) {
      this.resetAll();
      return;
    }
    this.arrowsHidden = false;
    let changed = false;
    const target = ev.target instanceof Element ? ev.target : null;
    // Over a shown shape picker: everything stays as it is.
    if (target?.closest('.dg-shape-picker')) return;
    const arrowNode = target?.closest<HTMLElement>('[data-dg-arrow]');
    if (arrowNode && this.arrows) {
      const dir = arrowNode.dataset.dgArrow as Direction;
      if (this.activeArrow !== dir) {
        this.activeArrow = dir;
        // the constraint handler is reset when an arrow is entered
        this.focus = null;
        this.focusIndex = -1;
        this.armHoverPicker(dir);
        changed = true;
      }
      if (changed) this.paint();
      return;
    }
    if (this.activeArrow) {
      // HoverIcons' 'blur': the pending picker is cancelled
      this.activeArrow = null;
      this.cancelHoverPicker();
      changed = true;
    }
    // HoverIcons.isResetEvent: Alt, or Shift without an active arrow
    if (ev.altKey || ev.shiftKey) {
      if (this.arrows) changed = true;
      this.resetArrows(true);
    }
    const vertex = this.hoveredVertex(point);
    changed = this.updateFocus(vertex, point, ev) || changed;
    if (!ev.altKey && !ev.shiftKey) changed = this.updateArrows(vertex, point) || changed;
    if (changed) this.paint();
  }

  /** HoverIcons.update with the cell under the pointer. */
  private updateArrows(vertex: VertexEl | null, point: XY | null): boolean {
    const cell = vertex && isConnectable(vertex) && allowsArrows(vertex) && !vertex.relative ? vertex.id : null;
    const inside = this.arrows && point ? rectContains(this.arrows.bbox, point) : null;
    const step = hoverStep(this.hoverMemory, cell, performance.now(), inside, this.activeArrow != null);
    this.hoverMemory = step.memory;
    if (step.clearTimer && this.hoverTimer != null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (step.armTimer && cell) {
      const at = point;
      this.hoverTimer = window.setTimeout(() => {
        this.hoverTimer = null;
        // Starts timer to update current state with no mouse events
        if (this.activeArrow == null && this.gesture == null && !this.canvas.busy()) {
          this.hoverMemory = { ...this.hoverMemory, prev: cell };
          const v = this.vertex(cell);
          if (this.updateArrows(v ?? null, at)) this.paint();
        }
      }, HOVER.updateDelay + 10);
    }
    if (step.show === undefined) return false;
    if (step.show == null) {
      const had = this.arrows != null;
      this.arrows = null;
      this.activeArrow = null;
      return had;
    }
    this.arrows = this.arrowsFor(step.show);
    if (!this.arrows) this.hoverMemory = { ...this.hoverMemory, current: null };
    return true;
  }

  /** HoverIcons.repaint: where the arrows of a shape go and which show. */
  private arrowsFor(id: string): ArrowState | null {
    const v = this.vertex(id);
    if (!v || isConcealed(v) || !isConnectable(v)) return null;
    const zoom = this.zoom();
    const bounds = rotatedBox(v);
    const center = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const rects = hoverArrowRects(bounds, center, zoom);
    const probes = hoverCollisionProbes(bounds, center, zoom);
    const elements = this.elements();
    const ancestorIds = new Set(ancestors(elements, v).map((a) => a.id));
    const beside = {} as Record<Direction, { id: string; w: number; h: number; ignore: boolean } | null>;
    for (const dir of DIRECTIONS) {
      const other = this.vertexAt(probes[dir], { exclude: new Set([v.id]) });
      beside[dir] = other ? {
        id: other.id,
        w: other.w,
        h: other.h,
        ignore: ancestorIds.has(other.id) || isSwimlane(other),
      } : null;
    }
    const visible = visibleArrows({ w: v.w, h: v.h }, beside);
    if (resolveStyle(v.dio, 'vertex').portConstraint === 'eastwest') {
      visible.north = false;
      visible.south = false;
    }
    const shown = DIRECTIONS.filter((d) => visible[d]).map((d) => rects[d]);
    const bbox = growRect(unionRects([{ x: v.x, y: v.y, width: v.w, height: v.h }, ...shown])!, HOVER.bboxGrow / zoom);
    return { id, rects, visible, bbox };
  }

  /**
   * mxConstraintHandler.update: the shape whose connection points show
   * (kept while the pointer stays near it and no other shape is under it,
   * or with Shift held), and the point under the pointer. Alt hides them.
   */
  private updateFocus(vertex: VertexEl | null, point: XY, ev: { altKey: boolean; shiftKey: boolean }): boolean {
    const beforeId = this.focus?.id ?? null;
    const beforeIndex = this.focusIndex;
    const keep = ev.shiftKey && !ev.altKey;
    if (ev.altKey && !keep) {
      this.focus = null;
      this.focusIndex = -1;
      return beforeId != null;
    }
    const zoom = this.zoom();
    const tol = HOVER.tolerance / zoom;
    const mouse = { x: point.x - tol, y: point.y - tol, width: 2 * tol, height: 2 * tol };
    const focusId = this.focus?.id ?? null;
    if (!keep && (this.focus == null || vertex != null || !rectsIntersect(this.focus.area, mouse)) && (vertex?.id ?? null) !== focusId) {
      this.focus = vertex && isConnectable(vertex) ? this.focusFor(vertex) : null;
    } else if (this.focus) {
      // the shape may have moved since (the store replaces changed elements)
      const v = this.vertex(this.focus.id);
      if (v !== this.focus.el) this.focus = v ? this.focusFor(v) : null;
    }
    this.focusIndex = this.focus && (vertex == null || vertex.id === this.focus.id)
      ? nearestConnectionPoint(this.focus.points.map((p) => p.at), point, zoom)
      : -1;
    return beforeId !== (this.focus?.id ?? null) || beforeIndex !== this.focusIndex;
  }

  private focusFor(v: VertexEl): FocusState {
    const points = vertexConnectionPoints(v);
    return { id: v.id, el: v, points, area: focusArea(rotatedBox(v), points.map((p) => p.at), this.zoom()) };
  }

  /**
   * Hovering an arrow (HoverIcons 'focus' in EditorUi): after
   * Editor.shapePickerHoverDelay the first four picker shapes appear beside
   * the arrow, faint until the pointer enters them; picking one inserts it
   * that way, connected (connectVertex with the picked cell).
   */
  private armHoverPicker(dir: Direction): void {
    this.cancelHoverPicker();
    const sourceId = this.arrows?.id;
    this.hoverPickerTimer = window.setTimeout(() => {
      this.hoverPickerTimer = null;
      const source = this.vertex(sourceId);
      // the arrow as drawn now (the layer is redrawn on every change)
      const arrow = this.layer.querySelector<HTMLElement>(`[data-dg-arrow="${dir}"]`);
      if (!source || this.activeArrow !== dir || !arrow || this.gesture) return;
      const rect = arrow.getBoundingClientRect();
      this.showPicker({ x: rect.left, y: rect.top }, source, dir, true, (entry, ev) => {
        this.insertConnected(source, dir, ev, { make: entry, forceClone: true });
      }, rect);
    }, SHAPE_PICKER_HOVER_DELAY);
  }

  private cancelHoverPicker(): void {
    if (this.hoverPickerTimer != null) {
      window.clearTimeout(this.hoverPickerTimer);
      this.hoverPickerTimer = null;
    }
  }

  private resetArrows(clearTimer: boolean): void {
    if (clearTimer && this.hoverTimer != null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.arrows = null;
    this.activeArrow = null;
    this.hoverMemory = { ...this.hoverMemory, current: null };
    // HoverIcons 'reset': a pending or shown hover picker goes too
    this.cancelHoverPicker();
    if (this.picker?.hovering) this.hidePicker();
  }

  /** Everything off: arrows, points, previews. */
  private resetAll(): void {
    const had = this.arrows != null || this.focus != null || this.feedback.preview != null || this.feedback.highlight != null;
    this.resetArrows(true);
    this.hoverMemory = { prev: null, startTime: null, current: null };
    this.focus = null;
    this.focusIndex = -1;
    this.feedback = {};
    if (had) this.paint();
  }

  // --- presses ---------------------------------------------------------------------------

  /**
   * A press on the canvas, before the canvas hit-tests it. True when the
   * press is on an edge handle, a hover arrow, a connector's label or a
   * connection point: the canvas then hands the drag over (`drag`,
   * `release`).
   */
  pointerDown(ev: PointerEvent, point: XY, target: HTMLElement): boolean {
    return this.press(ev, point, target) != null;
  }

  /** The canvas's drag moves, once past its threshold. */
  drag(point: XY, ev: PointerEvent): void {
    this.gesture?.move(point, ev);
  }

  /** The canvas's pointer-up of a drag handed over; `dragged` once past the threshold. */
  release(point: XY, ev: PointerEvent, dragged: boolean): void {
    const gesture = this.gesture;
    this.gesture = null;
    gesture?.up(point, ev, dragged);
  }

  private press(ev: PointerEvent, point: XY, target: HTMLElement): DiagramGesture | null {
    this.delayedSelection = null;
    if (ev.button !== 0 || !this.store.slide) return null;
    const handle = target.closest<HTMLElement>('[data-dg-handle]');
    if (handle) return this.begin(this.handleGesture(handle, ev, point));
    const arrow = target.closest<HTMLElement>('[data-dg-arrow]');
    if (arrow && this.arrows && !ev.altKey) {
      const source = this.vertex(this.arrows.id);
      const dir = arrow.dataset.dgArrow as Direction;
      this.arrowsHidden = true;
      if (source) return this.begin(new ConnectGesture(this, source, null, dir));
    }
    // A press on the label of a selected connector drags the label.
    const selection = this.store.get().selection;
    for (const id of selection) {
      const el = this.connector(id);
      if (el && el.label && this.labelContains(el, point)) return this.begin(new LabelGesture(this, el, point));
    }
    // A press on a connection point starts a connector from it (not with Ctrl or Shift).
    if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !ev.altKey && !this.canvas.busy()) {
      this.updateFocus(this.hoveredVertex(point), point, ev);
      if (this.focus && this.focusIndex >= 0) {
        const source = this.vertex(this.focus.id);
        const constraint = this.focus.points[this.focusIndex]?.constraint ?? null;
        if (source && constraint) {
          this.arrowsHidden = true;
          return this.begin(new ConnectGesture(this, source, constraint, null));
        }
      }
    }
    // Any other press hides the arrows while the button is down.
    if (this.arrows && !this.arrowsHidden) {
      this.arrowsHidden = true;
      this.paint();
    }
    return null;
  }

  private begin(gesture: DiagramGesture | null): DiagramGesture | null {
    this.gesture = gesture;
    return gesture;
  }

  /** The gesture of a press on one of a selected connector's handles. */
  private handleGesture(node: HTMLElement, ev: PointerEvent, point: XY): DiagramGesture | null {
    const el = this.connector(node.dataset.dgConnector);
    if (!el) return null;
    // A locked connector keeps its handles but does not change (isCellEditable).
    if (!this.movable(el)) return new NoopGesture();
    const kind = node.dataset.dgHandle as EdgeHandle['kind'] | 'label';
    const index = Number(node.dataset.dgIndex ?? 0);
    // double-clicks: a waypoint goes, an elbow flips (dblClickRemoveEnabled, flipEnabled)
    const key = `${el.id}:${kind}:${index}`;
    const previous = this.lastHandlePress;
    const second = previous != null && previous.key === key && ev.timeStamp - previous.time <= DOUBLE_CLICK_MS
      && Math.abs(previous.x - ev.clientX) <= 4 && Math.abs(previous.y - ev.clientY) <= 4;
    this.lastHandlePress = second ? null : { key, time: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    if (second && kind === 'bend') {
      const at = removableWaypoint(el.route, el.points, index);
      if (at >= 0) {
        this.commitConnector(el.id, (c) => {
          c.points = c.points.filter((_, i) => i !== at);
        }, 'Remove waypoint');
        return new NoopGesture();
      }
    }
    if (second && kind === 'elbow') {
      this.commitConnector(el.id, (c) => {
        c.dio = flippedElbow(c.dio);
      }, 'Flip connector');
      return new NoopGesture();
    }
    switch (kind) {
      case 'terminal': return new TerminalGesture(this, el, index === 0);
      case 'bend': return new BendGesture(this, el, { bend: index });
      case 'virtual': return new BendGesture(this, el, { virtual: index });
      case 'segment': return new SegmentGesture(this, el, index);
      case 'elbow': return new BendGesture(this, el, { elbow: true });
      case 'label': return new LabelGesture(this, el, point);
      default: return null;
    }
  }

  /** Any drag ended (pointer up or cancel): transient feedback goes. */
  endGesture(): void {
    if (this.gesture) {
      this.gesture.cancel();
      this.gesture = null;
    }
    this.canvas.host.classList.remove('dg-connecting');
    this.outlineSince = null;
    const had = this.feedback.preview != null || this.feedback.highlight != null || this.feedback.ghost != null;
    this.feedback = {};
    if (had) this.paint();
  }

  // --- selection: groups first --------------------------------------------------------------

  /**
   * The cell a click on `hit` acts on (draw.io's selection propagation):
   * the outermost unselected group around it on the first click; when a
   * group around it is already selected, that group (so a drag moves it)
   * and, if the press does not drag, its child on the way to `hit` once
   * the button is let go.
   */
  pickCell(hit: SlideElement | null, ev: { shiftKey: boolean }): SlideElement | null {
    this.delayedSelection = null;
    if (!isCell(hit) || ev.shiftKey) return hit;
    const elements = this.elements();
    const selected = this.store.get().selection;
    if (selected.has(hit.id)) return hit;
    const chain: Cell[] = [hit, ...ancestors(elements, hit)];
    const at = chain.findIndex((c) => selected.has(c.id));
    if (at > 0) {
      this.delayedSelection = chain[at - 1].id;
      return chain[at];
    }
    return initialCell(elements, hit, selected);
  }

  // --- moving shapes and connectors -----------------------------------------------------

  /**
   * A move drag of the selection is starting: connectors moved without the
   * shapes they join come loose from them (draw.io's disconnectOnMove), and
   * their boxes in `origin` are brought up to date.
   */
  beginMove(origin: Map<string, { x: number; y: number; w: number; h: number }>): void {
    this.delayedSelection = null;
    this.resetArrows(true);
    const elements = this.elements();
    // Locked cells and `movable=0` stay where they are (structure.ts's isCellMovable).
    for (const el of elements) {
      if (isCell(el) && origin.has(el.id) && !this.movable(el)) origin.delete(el.id);
    }
    const moved = new Set(origin.keys());
    const detached = new Map<string, ConnectorEl>();
    for (const el of elements) {
      if (el.type !== 'connector' || !moved.has(el.id)) continue;
      const next = detachedForMove(el, moved, elements);
      if (next) detached.set(el.id, next);
    }
    if (detached.size === 0) return;
    this.store.updateSelected((el) => {
      const next = detached.get(el.id);
      if (!next || el.type !== 'connector') return;
      el.source = next.source;
      el.target = next.target;
      el.sourcePoint = next.sourcePoint;
      el.targetPoint = next.targetPoint;
    });
    for (const id of detached.keys()) {
      const el = this.find(id);
      if (el) origin.set(id, { ...origin.get(id), x: el.x, y: el.y, w: el.w, h: el.h });
    }
  }

  /** The vertices of a move that are not inside another moved one. */
  private movedRoots(moved: ReadonlySet<string>): VertexEl[] {
    const elements = this.elements();
    return elements.filter((el): el is VertexEl => el.type === 'vertex' && moved.has(el.id)
      && !ancestors(elements, el).some((a) => moved.has(a.id)));
  }

  /** mxGraphHandler's drop target for the pointer during a move, or null. */
  private moveTarget(point: XY, moved: ReadonlySet<string>, ev: { altKey: boolean }): VertexEl | null {
    if (ev.altKey) return null;
    const elements = this.elements();
    const exclude = new Set<string>();
    for (const el of elements) {
      if (!isCell(el)) continue;
      if (moved.has(el.id) || ancestors(elements, el).some((a) => moved.has(a.id))) exclude.add(el.id);
    }
    const under = this.vertexAt(point, { exclude, skipGroups: false });
    const slide = this.store.slide;
    if (!slide) return null;
    const cells = elements.filter((el): el is Cell => isCell(el) && moved.has(el.id));
    return dropTarget(elements, under, moved, (cell) => isValidDropTarget(slide, cell, cells));
  }

  /** During a move: the container the moved shapes would drop into is outlined. */
  moveFeedback(point: XY, origin: ReadonlyMap<string, unknown>, ev: { altKey: boolean }): void {
    const moved = new Set(origin.keys());
    const roots = this.movedRoots(moved);
    let highlight: Feedback['highlight'] = null;
    if (roots.length > 0) {
      const target = this.moveTarget(point, moved, ev);
      // not highlighted when the shapes are in it already (isValidDropTarget)
      if (target && !roots.every((v) => v.parent === target.cell && v.diagram === target.diagram)) {
        highlight = { id: target.id, color: DROP_TARGET_COLOR, width: 3 };
      }
    }
    const before = this.feedback.highlight;
    if ((before?.id ?? null) !== (highlight?.id ?? null)) {
      this.feedback = { ...this.feedback, highlight };
      this.paint();
    }
  }

  /**
   * The move's pointer-up. Without a drag, a click on a grouped shape whose
   * group was selected selects the shape. After a drag, moved shapes go
   * into the container under the pointer, or out of the container they
   * left (to the current layer, draw.io's default parent); structure.ts's
   * reparent stacks them and moves their connectors to the new common
   * parent (mxGraphModel.maintainEdgeParent).
   */
  endMove(point: XY, ev: { altKey: boolean }, origin: ReadonlyMap<string, unknown>, dragged: boolean): void {
    if (!dragged) {
      const child = this.delayedSelection;
      this.delayedSelection = null;
      if (child && this.find(child)) this.store.select([child]);
      return;
    }
    this.delayedSelection = null;
    const moved = new Set(origin.keys());
    const roots = this.movedRoots(moved);
    if (roots.length === 0) return;
    const target = this.moveTarget(point, moved, ev);
    const elements = this.elements();
    const changes = new Map<string, string>();
    for (const v of roots) {
      if (target && target.diagram === v.diagram) {
        if (v.parent !== target.cell) changes.set(v.id, target.cell);
      } else if (!target) {
        // mxGraphHandler.shouldRemoveCellsFromParent: let go outside the parent
        const parent = parentVertex(elements, v);
        const slide = this.store.slide;
        if (parent && slide && !boxContains(parent, point)) changes.set(v.id, currentLayer(slide, v.diagram));
      }
    }
    if (changes.size === 0) return;
    const index = this.store.get().slideIndex;
    this.store.commit((deck) => {
      const slide = deck.slides[index];
      if (!slide) return;
      for (const [id, parent] of changes) reparent(slide, id, parent);
    }, { label: 'Move objects' });
  }

  // --- the selected connector's chrome ---------------------------------------------------------

  /**
   * Fills the selection box of a selected connector with draw.io's edge
   * chrome: the route dashed in the selection colour and its handles.
   * The box sits on the connector's box, so points are drawn relative to it.
   */
  connectorChrome(box: HTMLElement, el: ConnectorEl): void {
    box.classList.add('dg-edge-selection');
    const zoom = this.zoom();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('dg-edge-path');
    svg.setAttribute('width', String(Math.max(1, el.w)));
    svg.setAttribute('height', String(Math.max(1, el.h)));
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', el.route.map((p) => `${p.x - el.x},${p.y - el.y}`).join(' '));
    line.setAttribute('stroke-width', String(1 / zoom));
    line.setAttribute('stroke-dasharray', `${3 / zoom} ${3 / zoom}`);
    svg.appendChild(line);
    box.appendChild(svg);

    const handles = edgeHandles(el);
    const place = (node: HTMLElement, at: Point, size: number) => {
      node.style.left = `${at.x - el.x}px`;
      node.style.top = `${at.y - el.y}px`;
      node.style.width = `${size / zoom}px`;
      node.style.height = `${size / zoom}px`;
    };
    const make = (kind: string, index: number, image: string, size: number, at: Point, cursor: string, faint = false) => {
      const node = document.createElement('div');
      node.className = `dg-handle dg-handle-${kind}`;
      node.dataset.dgHandle = kind;
      node.dataset.dgIndex = String(index);
      node.dataset.dgConnector = el.id;
      node.style.backgroundImage = `url("${image}")`;
      node.style.cursor = cursor;
      if (faint) node.style.opacity = String(VIRTUAL_BEND_OPACITY);
      place(node, at, size);
      // a double-click on a handle is the handle's (removing a waypoint), not a label edit
      node.addEventListener('dblclick', (event) => event.stopPropagation());
      return node;
    };
    const style = connectorStyle(el);
    // inner handles first so the ends are on top
    for (const h of handles) {
      if (h.kind === 'virtual') box.appendChild(make('virtual', h.index, HANDLE_IMAGES.main.src, HANDLE_IMAGES.main.size, h.at, 'crosshair', true));
      else if (h.kind === 'bend') box.appendChild(make('bend', h.index, HANDLE_IMAGES.main.src, HANDLE_IMAGES.main.size, h.at, 'crosshair'));
      else if (h.kind === 'segment') {
        box.appendChild(make('segment', h.index, HANDLE_IMAGES.main.src, HANDLE_IMAGES.main.size, h.at,
          segmentCursor(el.route, h.index, el.scale), h.faint));
      } else if (h.kind === 'elbow') {
        box.appendChild(make('elbow', h.index, HANDLE_IMAGES.main.src, HANDLE_IMAGES.main.size, h.at, elbowCursor(style), h.faint));
      }
    }
    for (const h of handles) {
      if (h.kind !== 'terminal') continue;
      const source = h.index === 0;
      const look = terminalLook(el, source);
      const image = look === 'fixed' ? (source ? HANDLE_IMAGES.fixed : HANDLE_IMAGES.endFixed)
        : look === 'terminal' ? (source ? HANDLE_IMAGES.terminal : HANDLE_IMAGES.endTerminal)
          : (source ? HANDLE_IMAGES.main : HANDLE_IMAGES.endMain);
      const node = make('terminal', h.index, image.src, image.size, h.at, 'pointer');
      node.dataset.dgLook = look;
      box.appendChild(node);
    }
    // the label handle (manageLabelHandle: moved off a bend it would cover)
    const anchor = el.label ? labelAnchor(el) : null;
    if (anchor) {
      const size = HANDLE_IMAGES.secondary.size;
      const at = { ...anchor };
      const half = size / 2 / zoom;
      for (const h of handles) {
        const other = h.kind === 'terminal' ? 11 / zoom : 9 / zoom;
        if (Math.abs(h.at.x - at.x) < half + other && Math.abs(h.at.y - at.y) < half + other) {
          at.y = h.at.y < at.y ? h.at.y + other + half : h.at.y - other - half;
        }
      }
      box.appendChild(make('label', 0, HANDLE_IMAGES.secondary.src, size, at, 'default'));
    }
  }

  // --- labels --------------------------------------------------------------------------------

  /** The screen boxes of a connector's own label text, in slide px. */
  private labelRects(el: ConnectorEl): Rect[] {
    const node = this.canvas.stage.querySelector<HTMLElement>(`.slide-layer [data-element-id="${CSS.escape(el.id)}"]`);
    if (!node) return [];
    const stage = this.canvas.stage.getBoundingClientRect();
    const zoom = this.zoom();
    const out: Rect[] = [];
    const nodes = node.querySelectorAll<Element>('foreignObject div[style*="inline-block"], text');
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      out.push({ x: (r.left - stage.left) / zoom, y: (r.top - stage.top) / zoom, width: r.width / zoom, height: r.height / zoom });
    }
    return out;
  }

  /** True if a slide point is on a connector's label text (edge labels select their edge). */
  labelContains(el: SlideElement, point: XY): boolean {
    if (el.type !== 'connector' || isConcealed(el) || (!el.label && el.labels.length === 0)) return false;
    return this.labelRects(el).some((r) => rectContains(r, point));
  }

  /** Where the in-place editor for a connector's label goes: its anchor, slide px. */
  labelEditAnchor(el: ConnectorEl): XY | null {
    const anchor = labelAnchor(el);
    if (!anchor) return null;
    if (el.label) return anchor;
    // an empty label is edited at the middle of the route (draw.io's default geometry)
    return labelAnchor({ ...el, labelGeometry: { x: 0, y: 0, offset: null } });
  }

  // --- drawing ----------------------------------------------------------------------------------

  /** The layer for the overlay redraw, brought up to date. */
  overlay(): HTMLDivElement {
    if (this.arrows) {
      const next = this.arrowsFor(this.arrows.id);
      if (!next) this.resetArrows(false);
      else this.arrows = next;
    }
    if (this.focus) {
      const v = this.vertex(this.focus.id);
      if (v !== this.focus.el) this.focus = v ? this.focusFor(v) : null;
      if (!this.focus) this.focusIndex = -1;
    }
    this.syncGrid();
    this.paint();
    return this.layer;
  }

  /** Redraws the layer from the current state. */
  paint(): void {
    const layer = this.layer;
    layer.replaceChildren();
    if (!this.store.slide) return;
    const zoom = this.zoom();
    const frag = document.createDocumentFragment();

    const highlight = this.feedback.highlight;
    if (highlight) {
      const v = this.vertex(highlight.id);
      if (v) frag.appendChild(outlineNode(v, highlight.color, highlight.width, zoom));
    }
    const ghost = this.feedback.ghost;
    if (ghost) {
      const node = document.createElement('div');
      node.className = 'dg-drag-preview';
      node.style.left = `${ghost.box.x}px`;
      node.style.top = `${ghost.box.y}px`;
      node.style.width = `${ghost.box.width}px`;
      node.style.height = `${ghost.box.height}px`;
      node.style.borderWidth = `${1 / zoom}px`;
      if (ghost.rot) node.style.transform = `rotate(${ghost.rot}deg)`;
      frag.appendChild(node);
    }
    const preview = this.feedback.preview;
    if (preview && preview.route.length > 1) {
      const node = document.createElement('div');
      node.className = `dg-connector-preview${this.feedback.previewFaint ? ' faint' : ''}`;
      node.style.left = `${preview.x}px`;
      node.style.top = `${preview.y}px`;
      node.style.width = `${preview.w}px`;
      node.style.height = `${preview.h}px`;
      node.innerHTML = connectorMarkup(preview);
      frag.appendChild(node);
    }
    if (this.focus) {
      const size = POINT_ICON_SIZE / zoom;
      this.focus.points.forEach((p, i) => {
        const icon = document.createElement('div');
        icon.className = 'dg-point';
        icon.style.left = `${Math.round(p.at.x * zoom - POINT_ICON_SIZE / 2) / zoom}px`;
        icon.style.top = `${Math.round(p.at.y * zoom - POINT_ICON_SIZE / 2) / zoom}px`;
        icon.style.width = `${size}px`;
        icon.style.height = `${size}px`;
        icon.style.backgroundImage = `url("${POINT_IMAGE}")`;
        frag.appendChild(icon);
        if (i === this.focusIndex) {
          const disc = document.createElement('div');
          disc.className = 'dg-point-highlight';
          const d = POINT_HIGHLIGHT_SIZE / zoom;
          disc.style.left = `${p.at.x - d / 2}px`;
          disc.style.top = `${p.at.y - d / 2}px`;
          disc.style.width = `${d}px`;
          disc.style.height = `${d}px`;
          frag.insertBefore(disc, frag.firstChild);
        }
      });
    }
    if (this.arrows && !this.arrowsHidden && this.gesture == null) {
      for (const dir of DIRECTIONS) {
        if (!this.arrows.visible[dir]) continue;
        const r = this.arrows.rects[dir];
        const node = document.createElement('div');
        node.className = 'dg-arrow';
        node.dataset.dgArrow = dir;
        node.dataset.dgFor = this.arrows.id;
        node.title = 'Click to connect and clone (ctrl+click to clone, shift+click to connect). Drag to connect (ctrl+drag to clone)';
        node.style.left = `${r.x}px`;
        node.style.top = `${r.y}px`;
        node.style.width = `${r.width}px`;
        node.style.height = `${r.height}px`;
        node.style.backgroundImage = `url("${ARROW_IMAGES[dir]}")`;
        node.style.opacity = this.activeArrow === dir ? '1' : String(HOVER.inactiveOpacity);
        frag.appendChild(node);
      }
    }
    layer.appendChild(frag);
  }

  // --- connecting ---------------------------------------------------------------------------------

  /**
   * Graph.connectVertex: an existing shape near the point `length` beyond
   * the side is connected to (unless `ignoreCellAt`); otherwise the shape
   * is cloned there — or `make`, a picked shape, is put there — into the
   * container found there or its own container, with a connector; Shift
   * (without Ctrl, and without `forceClone`) asks for a connector only.
   */
  planConnectVertex(source: VertexEl, dir: Direction, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    opts: { forceClone?: boolean; ignoreCellAt?: boolean; make?: PickerEntry | null } = {}): {
    clone: VertexEl | null; target: VertexEl | null; connector: ConnectorEl; parent: string | null;
  } | null {
    const slide = this.store.slide;
    if (!slide) return null;
    let src: VertexEl = source;
    // Uses parent for relative child cells
    while (src.relative) {
      const parent = parentVertex(slide.elements, src);
      if (!parent) break;
      src = parent;
    }
    const frame = frameOf(src);
    const box = { x: src.x, y: src.y, width: src.w, height: src.h };
    const length = DEFAULT_EDGE_LENGTH * frame.scale;
    const make = opts.make ?? null;
    const isClone = !make || (make.style === src.dio && (make.value ?? '') === src.label);
    const size = make ? { width: make.width * frame.scale, height: make.height * frame.scale } : box;
    const { probe, clone: cloneBox } = connectTarget(box, dir, length, size);
    const elements = slide.elements;
    const srcAncestors = new Set(ancestors(elements, src).map((a) => a.id));
    const near = growRect({ x: probe.x, y: probe.y, width: 0, height: 0 }, 40 * frame.scale);
    let container: VertexEl | null = null;
    let target: VertexEl | null = null;
    const ordered = elements.map((el, i) => ({ el, i })).sort((a, b) => b.el.z - a.el.z || b.i - a.i);
    for (const { el } of opts.ignoreCellAt ? [] : ordered) {
      if (el.type !== 'vertex' || el.id === src.id || isConcealed(el) || el.diagram !== src.diagram) continue;
      if (!this.selectable(el) || this.locked(el)) continue;
      if (!rectsIntersect(near, rotatedBox(el))) continue;
      const isDescendant = ancestors(elements, el).some((a) => a.id === src.id);
      // Direct parent overrides all possible containers
      if (!isDescendant && isContainer(el) && (container == null || el.cell === src.parent)) {
        container = el;
      } else if (target == null && isConnectable(el) && !srcAncestors.has(el.id) && !isSwimlane(el)
        && !rectsIntersect(box, rotatedBox(el))) {
        target = el;
      }
    }
    if (container == null && target == null) {
      const parent = parentVertex(elements, src);
      if (parent && isContainer(parent) && !this.locked(parent) && probe.x >= parent.x && probe.y >= parent.y) {
        container = parent;
      }
    }
    const ctrl = ev.ctrlKey || ev.metaKey;
    const duplicate = !ev.shiftKey || ctrl || Boolean(opts.forceClone);
    const dio = applyNewEdgeStyle(DEFAULT_EDGE_STYLE, src, dir);
    // New cells go on the current layer (draw.io's default parent).
    const layer = currentLayer(slide, src.diagram);
    let clone: VertexEl | null = null;
    if (!target && duplicate) {
      const used = usedCellIds(slide, src.diagram);
      clone = {
        ...structuredClone(src),
        id: makeId('vertex'),
        cell: freshCellId(used),
        x: Math.round(cloneBox.x * 100) / 100,
        y: Math.round(cloneBox.y * 100) / 100,
        parent: container ? container.cell : layer,
        lineageId: src.lineageId ?? src.id,
        morphId: null,
        z: elements.reduce((m, el) => Math.max(m, el.z), 0) + 2,
      };
      delete clone.comments;
      delete clone.relative;
      if (make && !isClone) {
        // a picked shape: its own style, size and label, nothing of the source
        clone = { ...clone, dio: make.style, label: make.value ?? '', w: cloneBox.width, h: cloneBox.height, rot: 0 };
        for (const key of ['object', 'extra', 'collapsed', 'alternateBounds', 'offset', 'connectable', 'lineageId'] as const) delete clone[key];
      }
    }
    const end = target ?? clone;
    const connector = newConnector(slide, {
      dio,
      source: src.id,
      target: end?.id ?? null,
      targetPoint: end ? null : storedPoint(probe, frame),
      diagramId: src.diagram,
      layer,
      z: elements.reduce((m, el) => Math.max(m, el.z), 0) + 1,
    }, makeId, { extra: clone ? [clone] : [] }).element;
    return { clone, target, connector, parent: container?.cell ?? null };
  }

  /**
   * A click on an arrow, as draw.io 32.7.4 (HoverIcons.execute in
   * EditorUi): Ctrl/Cmd clones the shape that way regardless of what is
   * there, Shift draws a connector only; a plain click connects to a shape
   * already there, else opens the shape picker under the pointer and puts
   * the picked shape there, connected.
   */
  clickArrow(source: VertexEl, dir: Direction, ev: PointerEvent): void {
    const clone = ev.ctrlKey || ev.metaKey;
    if (clone || ev.shiftKey) {
      this.insertConnected(source, dir, ev, { forceClone: clone, ignoreCellAt: clone });
      return;
    }
    const plan = this.planConnectVertex(source, dir, ev);
    if (!plan) return;
    if (plan.target) {
      this.insertConnected(source, dir, ev, {});
      return;
    }
    this.resetArrows(true);
    this.paint();
    const at = { x: ev.clientX, y: ev.clientY };
    // Asynchronous, as draw.io's, so the click's own events do not close it.
    window.setTimeout(() => {
      this.showPicker(at, source, dir, false, (entry, pickEv) => {
        this.insertConnected(source, dir, pickEv, { make: entry, forceClone: false });
      });
    }, 30);
  }

  /**
   * Graph.connectVertex committed (one undoable edit), then
   * selectCellsForConnectVertex: the new or found shape is selected, else
   * the connector.
   */
  insertConnected(source: VertexEl, dir: Direction, ev: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    opts: { forceClone?: boolean; ignoreCellAt?: boolean; make?: PickerEntry | null }): string | null {
    const plan = this.planConnectVertex(source, dir, ev, opts);
    if (!plan) return null;
    // Ctrl+Shift clones without a connector
    const withEdge = !((ev.ctrlKey || ev.metaKey) && ev.shiftKey && plan.clone);
    const index = this.store.get().slideIndex;
    this.store.commit((deck) => {
      const slide = deck.slides[index];
      if (!slide) return;
      if (plan.clone) slide.elements.push(structuredClone(plan.clone));
      if (withEdge) slide.elements.push(structuredClone(plan.connector));
    }, { label: plan.clone ? (opts.make ? 'Insert and connect' : 'Clone and connect') : 'Connect shapes' });
    this.resetArrows(true);
    this.feedback = {};
    const selected = plan.clone?.id ?? plan.target?.id ?? plan.connector.id;
    this.store.select([selected]);
    return selected;
  }

  // --- the shape picker (EditorUi.showShapePicker) ----------------------------------------------

  private picker: { node: HTMLElement; hovering: boolean; off: () => void } | null = null;
  private hoverPickerTimer: number | null = null;

  /**
   * draw.io's shape picker: the source shape and the basic shapes, with the
   * source's look pasted on them (Graph.pasteStyle), in a rounded panel. A
   * click picker sits under the pointer (translate -22,-22) and lists all
   * sixteen; a hover picker lists four beside its arrow (centerShapePicker),
   * faint until the pointer enters it and gone when it leaves. `at` and
   * `arrow` are client coordinates.
   */
  showPicker(at: XY, source: VertexEl, dir: Direction, hovering: boolean,
    onPick: (entry: PickerEntry, ev: MouseEvent) => void, arrow?: DOMRect): void {
    this.hidePicker();
    const host = this.canvas.host;
    const hostRect = host.getBoundingClientRect();
    const node = document.createElement('div');
    node.className = `dg-shape-picker${hovering ? ' hovering' : ''}`;
    node.title = 'Click to connect and clone (ctrl+click to clone, shift+click to connect). Drag to connect (ctrl+drag to clone)';
    const sourceStyle = vertexStyle(source);
    // A shape of a library other than the basic one offers that library's shapes.
    const usedStyles = this.elements().filter((el): el is VertexEl => el.type === 'vertex').map((el) => el.dio);
    const library = libraryPickerEntries(source, PALETTES, usedStyles, CELL_STYLES);
    const all = library ? [pickerEntries(source, false)[0], ...library] : pickerEntries(source, false);
    node.dataset.dgPicker = library ? 'library' : 'basic';
    for (const entry of hovering ? all.slice(0, 4) : all) {
      const isSource = entry.style === source.dio;
      // library shapes keep their palette style (shapePickerKeepStyle)
      const dio = isSource || library ? entry.style : pastedStyle(entry.style, sourceStyle, CELL_STYLES);
      const picked: PickerEntry = { ...entry, style: dio };
      const item = document.createElement('a');
      item.className = 'dg-shape-picker-item';
      item.tabIndex = 0;
      item.dataset.dgPickStyle = dio;
      const shape = /(?:^|;)shape=([^;]+)/.exec(dio)?.[1] ?? styleNames(dio)[0] ?? 'rectangle';
      item.setAttribute('aria-label', entry.value || shape);
      try {
        item.innerHTML = itemSvg({
          cells: [{ id: '1', style: dio, value: entry.value ?? '', geometry: { x: 0, y: 0, width: entry.width, height: entry.height } }],
          width: entry.width,
          height: entry.height,
        }, { width: 25, height: 25, border: 1 });
      } catch {
        item.textContent = '?';
      }
      // The canvas starts selections and drags on pointerdown: the picker is not the slide.
      item.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.hidePicker();
        onPick(picked, event);
      });
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.hidePicker();
          onPick(picked, new MouseEvent('click'));
        }
      });
      node.appendChild(item);
    }
    node.addEventListener('pointerdown', (event) => event.stopPropagation());
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.hidePicker();
      }
    });
    host.appendChild(node);
    let x = at.x - hostRect.left;
    let y = at.y - hostRect.top;
    if (hovering && arrow) {
      // EditorUi.centerShapePicker
      if (dir === 'east' || dir === 'west') node.style.width = '40px';
      const r2 = node.getBoundingClientRect();
      if (dir === 'north') {
        x -= r2.width / 2 - 10;
        y -= r2.height + 6;
      } else if (dir === 'south') {
        x -= r2.width / 2 - 10;
        y += arrow.height + 6;
      } else if (dir === 'west') {
        x -= r2.width + 6;
        y -= r2.height / 2 - 10;
      } else {
        x += arrow.width + 6;
        y -= r2.height / 2 - 10;
      }
      node.style.opacity = '0.3';
      node.addEventListener('mouseenter', () => { node.style.opacity = '1'; });
      node.addEventListener('mouseleave', () => this.hidePicker());
    } else {
      node.style.transform = 'translate(-22px, -22px)';
    }
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    // Keeps the picker inside the canvas (createShapePicker).
    const r = node.getBoundingClientRect();
    const overBottom = r.bottom - hostRect.bottom;
    if (overBottom > 0) node.style.top = `${Math.max(22, y - overBottom)}px`;
    const overRight = r.right - hostRect.right;
    if (overRight > 0) node.style.left = `${Math.max(22, x - overRight)}px`;
    // A press anywhere else closes it.
    const close = (event: Event) => {
      if (!(event.target instanceof Node) || !node.contains(event.target)) this.hidePicker();
    };
    window.addEventListener('pointerdown', close, true);
    this.picker = { node, hovering, off: () => window.removeEventListener('pointerdown', close, true) };
  }

  hidePicker(): void {
    const picker = this.picker;
    if (!picker) return;
    this.picker = null;
    picker.off();
    picker.node.remove();
  }

  /** Whether a shape picker is open (tests, the key handler). */
  pickerOpen(): boolean {
    return this.picker != null;
  }

  // --- the grid (View > Grid) ---------------------------------------------------------------

  private gridButton: HTMLButtonElement | null = null;
  private gridDrawn = '';

  /**
   * The diagram whose grid shows on the slide: the selected cell's, else the
   * first with cells; with its frame and grid (model `grid`/`gridSize`,
   * draw.io's default on and 10).
   */
  private gridDiagram(): { id: string; on: boolean; size: number; origin: Point; scale: number } | null {
    const slide = this.store.slide;
    if (!slide) return null;
    const selection = this.store.get().selection;
    const cells = slide.elements.filter(isCell);
    const cell = cells.find((c) => selection.has(c.id)) ?? cells[0];
    const id = cell?.diagram ?? Object.keys(slide.diagrams ?? {})[0];
    if (!id) return null;
    const meta = slide.diagrams?.[id];
    const size = Number(meta?.model?.gridSize ?? 10);
    return {
      id,
      on: meta?.model?.grid !== '0',
      size: Number.isFinite(size) && size > 0 ? size : 10,
      origin: meta?.origin ?? cell?.origin ?? { x: 0, y: 0 },
      scale: meta?.scale ?? cell?.scale ?? 1,
    };
  }

  /** The grid toggle for the zoom pill (draw.io's View > Grid, Ctrl+Shift+G). */
  gridControl(): HTMLButtonElement {
    if (this.gridButton) return this.gridButton;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zoom-button dg-grid-toggle';
    button.title = 'Grid (Ctrl+Shift+G)';
    button.setAttribute('aria-label', 'Grid');
    button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">'
      + '<path d="M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
    button.addEventListener('click', () => this.toggleGrid());
    this.gridButton = button;
    this.syncGrid();
    return button;
  }

  /**
   * Turns the grid of the slide's diagrams on or off: draw.io keeps it as
   * the page's `grid` attribute, so it is an undoable change to the deck.
   */
  toggleGrid(): boolean {
    const grid = this.gridDiagram();
    if (!grid) return false;
    const value = grid.on ? '0' : '1';
    const index = this.store.get().slideIndex;
    this.store.commit((deck) => {
      const slide = deck.slides[index];
      if (!slide) return;
      const diagrams = slide.diagrams ?? {};
      const ids = new Set([...Object.keys(diagrams), ...slide.elements.filter(isCell).map((c) => c.diagram)]);
      for (const id of ids) {
        const meta = diagrams[id];
        if (meta) meta.model = { ...meta.model, grid: value };
      }
    }, { label: value === '1' ? 'Show grid' : 'Hide grid' });
    this.syncGrid();
    return true;
  }

  /**
   * Draws draw.io's grid behind the slide's shapes (editor only): CSS
   * variables on the canvas host feed a pseudo-element under the slide's
   * elements, so the slide's own DOM, the player and exports never see it.
   */
  syncGrid(): void {
    const host = this.canvas.host;
    const grid = this.gridDiagram();
    const visible = Boolean(grid?.on);
    if (this.gridButton) {
      this.gridButton.hidden = !grid;
      this.gridButton.classList.toggle('active', visible);
      this.gridButton.setAttribute('aria-pressed', String(visible));
    }
    if (!grid || !visible) {
      if (this.gridDrawn !== '') {
        host.classList.remove('dg-grid');
        this.gridDrawn = '';
      }
      return;
    }
    const zoom = this.zoom();
    const key = `${grid.size}|${grid.scale}|${zoom}|${grid.origin.x},${grid.origin.y}`;
    if (key === this.gridDrawn) return;
    this.gridDrawn = key;
    const { tile, svg } = gridTileSvg(grid.size, grid.scale, zoom);
    host.classList.add('dg-grid');
    host.style.setProperty('--dg-grid-image', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    host.style.setProperty('--dg-grid-size', `${tile}px ${tile}px`);
    host.style.setProperty('--dg-grid-position', `${grid.origin.x}px ${grid.origin.y}px`);
  }

  /** The grid moves and resizes of `ids` snap to: all of them diagram cells, the grid on, no Alt. */
  private snapGrid(ids: Iterable<string>, ev: { altKey: boolean }): { g: number; origin: Point } | null {
    if (ev.altKey) return null;
    const slide = this.store.slide;
    if (!slide) return null;
    let diagram: string | null = null;
    let any = false;
    for (const id of ids) {
      const el = slide.elements.find((c) => c.id === id);
      if (!el) continue;
      if (!isCell(el)) return null;
      diagram ??= el.diagram;
      any = true;
    }
    if (!any || diagram == null) return null;
    const meta = slide.diagrams?.[diagram];
    if (meta?.model?.grid === '0') return null;
    const size = Number(meta?.model?.gridSize ?? 10);
    const cell = slide.elements.find((c): c is Cell => isCell(c) && c.diagram === diagram);
    const scale = meta?.scale ?? cell?.scale ?? 1;
    return { g: (Number.isFinite(size) && size > 0 ? size : 10) * scale, origin: meta?.origin ?? cell?.origin ?? { x: 0, y: 0 } };
  }

  /**
   * A move of diagram cells with the grid on (mxGraphHandler with mxGuide):
   * an axis an alignment guide took stays there, the other snaps the
   * shapes' bounds to the grid (mxGraph.snapDelta). `bounds` is the moved
   * selection's box when the drag began, `rect` where it goes now.
   */
  gridMove<R extends { x: number; y: number; w: number; h: number }>(bounds: R, rect: R,
    origin: ReadonlyMap<string, { x: number; y: number; w: number; h: number }>, ev: { altKey: boolean },
    guides: ReadonlyArray<{ axis: 'x' | 'y' }>, suspended = false): R {
    if (suspended) return rect;
    const grid = this.snapGrid(origin.keys(), ev);
    if (!grid) return rect;
    // draw.io's handler bounds are the shapes' (connectors only without shapes)
    const elements = this.elements();
    const boxes = [...origin.entries()]
      .filter(([id]) => elements.find((e) => e.id === id)?.type === 'vertex')
      .map(([, o]) => ({ x: o.x, y: o.y, width: o.w, height: o.h }));
    const vb = unionRects(boxes) ?? { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h };
    const guidedX = guides.some((g) => g.axis === 'x');
    const guidedY = guides.some((g) => g.axis === 'y');
    const dx = guidedX ? rect.x - bounds.x : snapDeltaToGrid(rect.x - bounds.x, vb.x, grid.origin.x, grid.g);
    const dy = guidedY ? rect.y - bounds.y : snapDeltaToGrid(rect.y - bounds.y, vb.y, grid.origin.y, grid.g);
    return { ...rect, x: bounds.x + dx, y: bounds.y + dy };
  }

  /**
   * A resize of a diagram shape with the grid on (mxVertexHandler.union):
   * the edges being dragged snap to the grid unless a guide took them.
   */
  gridResize<R extends { x: number; y: number; w: number; h: number }>(rect: R,
    edges: { left: boolean; right: boolean; top: boolean; bottom: boolean },
    origins: ReadonlyMap<string, unknown>, ev: { altKey: boolean },
    guides: ReadonlyArray<{ axis: 'x' | 'y' }>, rotated: boolean): R {
    if (rotated) return rect;
    const grid = this.snapGrid(origins.keys(), ev);
    if (!grid) return rect;
    const guidedX = guides.some((g) => g.axis === 'x');
    const guidedY = guides.some((g) => g.axis === 'y');
    let { x, y, w, h } = rect;
    const right = x + w;
    const bottom = y + h;
    if (!guidedX && edges.left) {
      x = snapToGridLine(x, grid.origin.x, grid.g);
      w = Math.max(grid.g, right - x);
    } else if (!guidedX && edges.right) {
      w = Math.max(grid.g, snapToGridLine(right, grid.origin.x, grid.g) - x);
    }
    if (!guidedY && edges.top) {
      y = snapToGridLine(y, grid.origin.y, grid.g);
      h = Math.max(grid.g, bottom - y);
    } else if (!guidedY && edges.bottom) {
      h = Math.max(grid.g, snapToGridLine(bottom, grid.origin.y, grid.g) - y);
    }
    return { ...rect, x, y, w, h };
  }

  // --- locks and hit testing ------------------------------------------------------------------

  /** May an element be resized: diagram cells not locked (layer included) and without `resizable=0`. */
  resizable(el: SlideElement): boolean {
    if (!isCell(el)) return true;
    const slide = this.store.slide;
    const tree = this.tree();
    return !slide || !tree || isCellResizable(slide, el, tree);
  }

  /**
   * May a click at `point` pick the element: selectable (structure.ts), and
   * a diagram shape is hit as draw.io's SVG takes the pointer (a group's
   * empty gaps are not the group).
   */
  pickable(el: SlideElement, point: XY, tolerance: number): boolean {
    if (!this.selectable(el)) return false;
    return el.type !== 'vertex' || vertexHitAt(el, point, tolerance);
  }

  // --- keyboard ---------------------------------------------------------------------------------

  private nudgeTimer: number | null = null;

  /**
   * draw.io's keys for diagram cells (EditorUi.createKeyHandler), ahead of
   * the shell's own: Escape cancels a gesture or closes the picker;
   * Ctrl/Cmd+Shift+G toggles the grid; with only diagram cells selected,
   * arrows move by a unit and Shift+arrows by the grid, Ctrl/Cmd+arrows
   * resize (by the grid with Shift), Alt+arrows select the nearest cell
   * that way and Alt+Shift+arrows clone and connect. True when handled.
   */
  handleKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      if (this.gesture) {
        this.cancelGesture();
        return true;
      }
      if (this.picker) {
        this.hidePicker();
        return true;
      }
      this.resetAll();
      return false;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && !e.altKey && (e.code === 'KeyG' || e.key.toLowerCase() === 'g')) {
      if (!this.gridDiagram()) return false;
      e.preventDefault();
      return this.toggleGrid();
    }
    const dirs: Record<string, Direction> = { ArrowLeft: 'west', ArrowUp: 'north', ArrowRight: 'east', ArrowDown: 'south' };
    const dir = dirs[e.key];
    if (!dir) return false;
    const selected = this.store.selectedElements();
    if (selected.length === 0 || !selected.every(isCell)) return false;
    const cells = selected as Cell[];
    e.preventDefault();
    const dx = dir === 'west' ? -1 : dir === 'east' ? 1 : 0;
    const dy = dir === 'north' ? -1 : dir === 'south' ? 1 : 0;
    const first = cells[0];
    const grid = this.gridDiagram();
    const unit = first.scale || 1;
    const gridStep = (grid?.size ?? 10) * unit;
    if (!mod && e.shiftKey && e.altKey) {
      if (first.type === 'vertex') {
        // graph.connectVertex(cell, dir, length, evt, forceClone = true)
        this.insertConnected(first, dir, { shiftKey: true, ctrlKey: false, metaKey: false }, { forceClone: true });
      }
      return true;
    }
    if (mod) {
      this.resizeByKey(cells, dx, dy, e.shiftKey ? gridStep : unit);
      return true;
    }
    if (e.altKey) {
      this.selectInDirection(first, dx, dy);
      return true;
    }
    this.nudge(cells, dx * (e.shiftKey ? gridStep : unit), dy * (e.shiftKey ? gridStep : unit));
    return true;
  }

  /** EditorUi's nudge: the selection moves, the steps grouped into one undoable edit. */
  private nudge(cells: Cell[], dx: number, dy: number): void {
    const origin = new Map(cells.filter((c) => this.movable(c)).map((c) => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]));
    if (origin.size === 0) return;
    if (this.nudgeTimer == null) this.store.beginTransaction('Move objects');
    else window.clearTimeout(this.nudgeTimer);
    // a connector moved without its shapes comes loose, as with the mouse
    this.beginMove(origin);
    this.store.updateSelected((el) => {
      if (!origin.has(el.id)) return;
      el.x += dx;
      el.y += dy;
    });
    this.nudgeTimer = window.setTimeout(() => {
      this.nudgeTimer = null;
      this.store.endTransaction();
    }, NUDGE_COMMIT_MS);
  }

  /** Ctrl/Cmd+arrows: resizable shapes grow or shrink by `step` (keepResizeCenter with resizeCentered=1). */
  private resizeByKey(cells: Cell[], dx: number, dy: number, step: number): void {
    const targets = new Set(cells.filter((c) => c.type === 'vertex' && this.resizable(c)).map((c) => c.id));
    if (targets.size === 0) return;
    this.store.updateSelected((el) => {
      if (!targets.has(el.id) || el.type !== 'vertex') return;
      const w = Math.max(0, el.w + dx * step);
      const h = Math.max(0, el.h + dy * step);
      if (resolveStyle(el.dio, 'vertex').resizeCentered === '1') {
        el.x -= (w - el.w) / 2;
        el.y -= (h - el.h) / 2;
      }
      el.w = Math.max(1, w);
      el.h = Math.max(1, h);
    }, { label: 'Resize objects' });
  }

  /** EditorUi.selectCellInDirection over the selectable cells. */
  private selectInDirection(cell: Cell, dx: number, dy: number): void {
    const elements = this.elements();
    const box = (c: Cell) => {
      if (c.type === 'connector') {
        const p = labelAnchor({ ...c, labelGeometry: { x: 0, y: 0, offset: null } });
        if (p) return { left: p.x, top: p.y, right: p.x, bottom: p.y };
      }
      return { left: c.x, top: c.y, right: c.x + c.w, bottom: c.y + c.h };
    };
    const depth = (c: Cell) => ancestors(elements, c).length;
    const a = box(cell);
    const level = depth(cell);
    const own = new Set(ancestors(elements, cell).map((v) => v.id));
    let next: Cell | null = null;
    let min: number | null = null;
    for (const el of elements) {
      if (!isCell(el) || el.id === cell.id || el.diagram !== cell.diagram || !this.selectable(el)) continue;
      if (own.has(el.id) || ancestors(elements, el).some((v) => v.id === cell.id)) continue;
      const b = box(el);
      const ahead = dx * (b.left + b.right - a.left - a.right) + dy * (b.top + b.bottom - a.top - a.bottom) > 0;
      let dist = ahead ? directionalDistance(a, b, dx, dy) : null;
      if (dist != null) dist += Math.abs(depth(el) - level);
      if (dist != null && (min == null || dist < min)) {
        next = el;
        min = dist;
      }
    }
    if (next) this.store.select([next.id]);
  }

  /** Escape during a gesture: everything it changed goes back, and the drag does nothing more. */
  private cancelGesture(): void {
    const gesture = this.gesture;
    this.gesture = null;
    gesture?.cancel();
    this.canvas.host.classList.remove('dg-connecting');
    this.feedback = {};
    this.focus = null;
    this.focusIndex = -1;
    this.paint();
  }

  /** Writes a change to one connector as an undoable edit. */
  commitConnector(id: string, change: (el: ConnectorEl) => void, label: string): void {
    const index = this.store.get().slideIndex;
    this.store.commit((deck) => {
      const el = deck.slides[index]?.elements.find((candidate) => candidate.id === id);
      if (el?.type === 'connector') change(el);
    }, { label });
  }

  /** Changes a selected connector during a drag (inside the drag's transaction). */
  updateConnector(id: string, change: (el: ConnectorEl) => void): void {
    this.store.updateSelected((el) => {
      if (el.id === id && el.type === 'connector') change(el);
    });
  }

  /**
   * mxEdgeHandler.getPointForEvent: the pointer snapped to the terminals'
   * centres and the route's points (2 screen px), then to the diagram's
   * grid unless Alt is held; rounded as draw.io stores points.
   */
  snapPoint(el: ConnectorEl, point: XY, ev: { altKey: boolean }): XY {
    const frame = frameOf(el);
    const zoom = this.zoom();
    let snapped = { point, snappedX: false, snappedY: false };
    if (!ev.altKey) {
      const targets: Point[] = [];
      for (const id of [el.source, el.target]) {
        const v = this.vertex(id);
        if (v) targets.push({ x: v.x + v.w / 2, y: v.y + v.h / 2 });
      }
      el.route.forEach((p, i) => {
        if ((i > 0 || el.source == null) && (i < el.route.length - 1 || el.target == null)) targets.push(p);
      });
      snapped = snapToPoints(point, targets, SNAP_TO_TERMINAL_PX / zoom);
    }
    let out = snapped.point;
    const grid = this.gridSize(el);
    if (grid > 0 && !ev.altKey) {
      const g = snapToGrid(out, frame, grid);
      out = { x: snapped.snappedX ? out.x : g.x, y: snapped.snappedY ? out.y : g.y };
    }
    return storedPoint(out, frame);
  }

  /** Feedback while a connector end is over `point` (connect or reconnect). */
  terminalFeedback(point: XY, ev: PointerEvent, exclude: ReadonlySet<string>): {
    vertex: VertexEl | null; constraint: ConnectionConstraint | null; at: XY | null;
  } {
    let vertex = this.hoveredVertex(point, exclude);
    // The outline highlight reaches past the shape's box: just outside it the
    // pointer is still on the highlighted shape's outline.
    const zoom = this.zoom();
    const reach = (OUTLINE_HIGHLIGHT.width / 2 + HOVER.tolerance) / zoom;
    const lastId = this.feedback.highlight?.id ?? null;
    if (!vertex && lastId && !exclude.has(lastId)) {
      const last = this.vertex(lastId);
      if (last && outlineDistance(last, point) <= reach) vertex = last;
    }
    this.updateFocus(vertex, point, ev);
    let constraint: ConnectionConstraint | null = null;
    let at: XY | null = null;
    let terminal: VertexEl | null = null;
    if (this.focus && this.focusIndex >= 0) {
      terminal = this.vertex(this.focus.id) ?? null;
      constraint = this.focus.points[this.focusIndex].constraint;
      at = this.focus.points[this.focusIndex].at;
      this.feedback = { ...this.feedback, highlight: null };
      this.outlineSince = null;
    } else if (vertex && isConnectable(vertex) && !(ev.altKey && !ev.shiftKey)) {
      terminal = vertex;
      if (this.isOutlineConnect(vertex, point, ev, reach)) {
        // Graph.getOutlineConstraint: the exact point on the outline, fixed
        constraint = outlineConstraint(vertex, point);
        at = point;
        this.feedback = { ...this.feedback, highlight: { id: vertex.id, color: OUTLINE_HIGHLIGHT.color, width: OUTLINE_HIGHLIGHT.width } };
      } else {
        this.feedback = { ...this.feedback, highlight: { id: vertex.id, color: VALID_COLOR, width: HIGHLIGHT_STROKEWIDTH } };
      }
    } else {
      this.feedback = { ...this.feedback, highlight: null };
      this.outlineSince = null;
    }
    return { vertex: terminal, constraint, at };
  }

  /** When the end goes on the shape (or its outline highlight) since: draw.io's 2 s rule. */
  private outlineSince: { id: string; time: number } | null = null;

  /**
   * mxEdgeHandler.isOutlineConnectEvent with Graph.js's override: on the
   * outline highlight (the pointer within the 5 px stroke and the
   * tolerance of the outline), with Shift (not Alt), or after resting two
   * seconds on the shape; `outlineConnect=2` always, `0` and `3` never;
   * Alt+Shift never.
   */
  private isOutlineConnect(v: VertexEl, point: XY, ev: { altKey: boolean; shiftKey: boolean }, reach: number): boolean {
    const now = performance.now();
    if (this.outlineSince?.id !== v.id) this.outlineSince = { id: v.id, time: now };
    if (ev.shiftKey && ev.altKey) return false;
    const mode = resolveStyle(v.dio, 'vertex').outlineConnect ?? '1';
    if (mode === '3' || mode === '0') return false;
    if (mode === '2') return true;
    if (ev.shiftKey && !ev.altKey) return true;
    if (now - this.outlineSince.time > OUTLINE_CONNECT_DELAY) return true;
    return outlineDistance(v, point) <= reach;
  }

  /** Shows a connector drawn in the overlay (the one being made). */
  setPreview(el: ConnectorEl | null): void {
    this.feedback = { ...this.feedback, preview: el, previewFaint: false, ghost: null };
    this.paint();
  }

  get storeRef(): EditorStore {
    return this.store;
  }

  get hostElement(): HTMLElement {
    return this.canvas.host;
  }

  slideElements(): SlideElement[] {
    return this.elements();
  }

  vertexById(id: string | null | undefined): VertexEl | undefined {
    return this.vertex(id);
  }

  connectorById(id: string | null | undefined): ConnectorEl | undefined {
    return this.connector(id);
  }

  findVertexFn(): (id: string) => VertexEl | undefined {
    return this.findVertex;
  }

  zoomLevel(): number {
    return this.zoom();
  }

  /** The handle boxes of a connector's route points, by route index (a waypoint dropped on one goes). */
  bendBoxes(el: ConnectorEl, count?: number): Array<Rect | null> {
    const zoom = this.zoom();
    const n = count ?? el.route.length;
    const out: Array<Rect | null> = [];
    for (let i = 0; i < n; i++) {
      const terminal = i === 0 || i === n - 1;
      const p = i === n - 1 ? el.route[el.route.length - 1] : el.route[i];
      if (!p) {
        out.push(null);
        continue;
      }
      const size = (terminal ? (terminalLook(el, i === 0) === 'loose' ? HANDLE_IMAGES.main.size : HANDLE_IMAGES.terminal.size) : HANDLE_IMAGES.main.size) / zoom;
      out.push({ x: p.x - size / 2, y: p.y - size / 2, width: size, height: size });
    }
    return out;
  }
}

// --- gestures --------------------------------------------------------------------------------------

class NoopGesture implements DiagramGesture {
  move(): void {}
  up(): void {}
  cancel(): void {
    // nothing was changed
  }
}

/** A cancelled connector gesture: the connector as it was when the drag began. */
function restoreConnector(editing: DiagramEditing, origin: ConnectorEl): void {
  editing.updateConnector(origin.id, (c) => {
    c.dio = origin.dio;
    c.source = origin.source;
    c.target = origin.target;
    c.sourcePoint = origin.sourcePoint ? { ...origin.sourcePoint } : null;
    c.targetPoint = origin.targetPoint ? { ...origin.targetPoint } : null;
    c.points = origin.points.map((p) => ({ ...p }));
    c.labelGeometry = origin.labelGeometry ? structuredClone(origin.labelGeometry) : origin.labelGeometry;
  });
}

/**
 * A new connector from a shape: dragged from a hover arrow or from one of
 * its connection points. Let go over a shape it connects (to the point
 * under the pointer, or floating); over empty slide it clones the source
 * there (mxConnectionHandler.createTargetVertex) — Ctrl/Cmd leaves a loose
 * end instead. A click on an arrow without dragging clones that way.
 */
class ConnectGesture implements DiagramGesture {
  private target: VertexEl | null = null;
  private constraint: ConnectionConstraint | null = null;
  private last: XY | null = null;
  private done = false;

  constructor(
    private readonly editing: DiagramEditing,
    private readonly source: VertexEl,
    private readonly sourceConstraint: ConnectionConstraint | null,
    private readonly arrow: Direction | null,
  ) {}

  private dio(): string {
    let dio = applyNewEdgeStyle(DEFAULT_EDGE_STYLE, this.source, this.arrow);
    if (this.sourceConstraint) dio = withConnectionConstraint(dio, true, this.sourceConstraint);
    if (this.constraint) dio = withConnectionConstraint(dio, false, this.constraint);
    return dio;
  }

  private draft(point: XY, clone: VertexEl | null): ConnectorEl | null {
    const slide = this.editing.storeRef.slide;
    if (!slide) return null;
    const end = clone ?? this.target;
    return newConnector(slide, {
      dio: this.dio(),
      source: this.source.id,
      target: end?.id ?? null,
      targetPoint: end ? null : storedPoint(point, frameOf(this.source)),
      diagramId: this.source.diagram,
      layer: currentLayer(slide, this.source.diagram),
    }, makeId, { extra: clone ? [clone] : [] }).element;
  }

  move(point: XY, ev: PointerEvent): void {
    this.last = point;
    this.editing.hostElement.classList.add('dg-connecting');
    const fb = this.editing.terminalFeedback(point, ev, new Set());
    // the source itself is no target (but its own points are, for loops)
    if (fb.vertex && fb.vertex.id === this.source.id && !fb.constraint) {
      this.target = null;
      this.constraint = null;
    } else {
      this.target = fb.vertex;
      this.constraint = fb.constraint;
    }
    this.editing.setPreview(this.draft(point, null));
  }

  up(point: XY, ev: PointerEvent, dragged: boolean): void {
    this.done = true;
    this.editing.hostElement.classList.remove('dg-connecting');
    const store = this.editing.storeRef;
    const slide = store.slide;
    if (!slide) return;
    if (!dragged) {
      if (this.arrow) this.editing.clickArrow(this.source, this.arrow, ev);
      return;
    }
    const at = this.last ?? point;
    let clone: VertexEl | null = null;
    // mxConnectionHandler.isCreateTarget in Graph.js: draw.io leaves a loose
    // end over empty slide and clones the source only with Ctrl/Cmd.
    const createTarget = ev.ctrlKey || ev.metaKey;
    if (!this.target && createTarget) {
      const box = dropClonePlacement({ x: this.source.x, y: this.source.y, width: this.source.w, height: this.source.h }, at, frameOf(this.source));
      const used = usedCellIds(slide, this.source.diagram);
      clone = {
        ...structuredClone(this.source),
        id: makeId('vertex'),
        cell: freshCellId(used),
        x: box.x,
        y: box.y,
        // the current layer, draw.io's default parent
        parent: currentLayer(slide, this.source.diagram),
        lineageId: this.source.lineageId ?? this.source.id,
        morphId: null,
        z: slide.elements.reduce((m, el) => Math.max(m, el.z), 0) + 2,
      };
      delete clone.comments;
      delete clone.relative;
    }
    const connector = this.draft(at, clone);
    if (!connector) return;
    connector.z = slide.elements.reduce((m, el) => Math.max(m, el.z), 0) + 1;
    const index = store.get().slideIndex;
    store.commit((deck) => {
      const s = deck.slides[index];
      if (!s) return;
      if (clone) s.elements.push(structuredClone(clone));
      s.elements.push(structuredClone(connector));
    }, { label: clone ? 'Clone and connect' : 'Connect shapes' });
    store.select([connector.id]);
  }

  cancel(): void {
    if (!this.done) this.editing.hostElement.classList.remove('dg-connecting');
  }
}

/**
 * Dragging an end of a selected connector (mxEdgeHandler with isSource /
 * isTarget): over a connection point it attaches there, over a shape it
 * attaches floating, elsewhere the end comes loose at the pointer. A click
 * on an attached end selects the shape it is attached to.
 */
class TerminalGesture implements DiagramGesture {
  private started = false;
  private readonly origin: ConnectorEl;

  constructor(private readonly editing: DiagramEditing, el: ConnectorEl, private readonly source: boolean) {
    this.origin = structuredClone(el);
  }

  move(point: XY, ev: PointerEvent): void {
    const store = this.editing.storeRef;
    if (!this.started) {
      this.started = true;
      store.beginTransaction(this.source ? 'Move connector start' : 'Move connector end');
    }
    const fb = this.editing.terminalFeedback(point, ev, new Set([this.origin.id]));
    const loose = fb.vertex ? null : this.editing.snapPoint(this.origin, point, ev);
    this.editing.paint();
    this.editing.updateConnector(this.origin.id, (c) => {
      c.dio = withConnectionConstraint(c.dio, this.source, fb.vertex ? fb.constraint : null);
      if (this.source) {
        c.source = fb.vertex?.id ?? null;
        c.sourcePoint = fb.vertex ? null : loose;
      } else {
        c.target = fb.vertex?.id ?? null;
        c.targetPoint = fb.vertex ? null : loose;
      }
    });
  }

  up(_point: XY, _ev: PointerEvent, dragged: boolean): void {
    if (dragged) return;
    const terminal = this.source ? this.origin.source : this.origin.target;
    if (terminal && this.editing.vertexById(terminal)) this.editing.storeRef.select([terminal]);
  }

  cancel(): void {
    if (this.started) restoreConnector(this.editing, this.origin);
  }
}

/**
 * Dragging a waypoint, a virtual bend (which adds a waypoint) or an elbow
 * connector's middle handle (mxEdgeHandler.getPreviewPoints).
 */
class BendGesture implements DiagramGesture {
  private started = false;
  private readonly origin: ConnectorEl;

  constructor(private readonly editing: DiagramEditing, el: ConnectorEl,
    private readonly which: { bend?: number; virtual?: number; elbow?: boolean }) {
    this.origin = structuredClone(el);
  }

  move(point: XY, ev: PointerEvent): void {
    const store = this.editing.storeRef;
    if (!this.started) {
      this.started = true;
      store.beginTransaction(this.which.virtual != null ? 'Add waypoint' : 'Move waypoint');
    }
    const el = this.origin;
    const pointer = this.editing.snapPoint(el, point, ev);
    const zoom = this.editing.zoomLevel();
    const centre = (id: string | null, source: boolean): Point | null => {
      const v = this.editing.vertexById(id);
      if (!v || endConstraint(el, source)) return null;
      return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    };
    let points: Point[];
    if (this.which.elbow) {
      // the elbow's three handles: source, middle, target
      const boxes = this.editing.bendBoxes(el, 3);
      points = el.points.length === 0 ? [pointer] : bendPreviewPoints({
        points: el.points, route: el.route, bend: 1, pointer, bendBoxes: boxes,
        sourceCenter: centre(el.source, true), targetCenter: centre(el.target, false),
        tolerance: HOVER.tolerance / zoom, alt: ev.altKey,
      });
    } else {
      points = bendPreviewPoints({
        points: el.points,
        route: el.route,
        bend: this.which.bend,
        virtual: this.which.virtual,
        pointer,
        bendBoxes: this.editing.bendBoxes(el),
        sourceCenter: centre(el.source, true),
        targetCenter: centre(el.target, false),
        tolerance: HOVER.tolerance / zoom,
        alt: ev.altKey,
      });
    }
    this.editing.updateConnector(el.id, (c) => {
      c.points = points;
    });
  }

  up(): void {}
  cancel(): void {
    if (this.started) restoreConnector(this.editing, this.origin);
  }
}

/** Moving a segment of an orthogonal or segment connector across (mxEdgeSegmentHandler). */
class SegmentGesture implements DiagramGesture {
  private started = false;
  private readonly origin: ConnectorEl;

  constructor(private readonly editing: DiagramEditing, el: ConnectorEl, private readonly index: number) {
    this.origin = structuredClone(el);
  }

  move(point: XY, ev: PointerEvent): void {
    const store = this.editing.storeRef;
    if (!this.started) {
      this.started = true;
      store.beginTransaction('Move segment');
    }
    const pointer = this.editing.snapPoint(this.origin, point, ev);
    const points = segmentDragPoints(this.origin, this.index, pointer, this.editing.findVertexFn());
    this.editing.updateConnector(this.origin.id, (c) => {
      c.points = points;
    });
  }

  up(): void {}
  cancel(): void {
    if (this.started) restoreConnector(this.editing, this.origin);
  }
}

/** Dragging a connector's own label (mxEdgeHandler.moveLabel). */
class LabelGesture implements DiagramGesture {
  private started = false;
  private readonly origin: ConnectorEl;
  private readonly offset: XY;

  constructor(private readonly editing: DiagramEditing, el: ConnectorEl, start: XY) {
    this.origin = structuredClone(el);
    const anchor = labelAnchor(el) ?? start;
    // keeps the distance between the pointer and the label
    this.offset = { x: anchor.x - start.x, y: anchor.y - start.y };
  }

  move(point: XY, ev: PointerEvent): void {
    const store = this.editing.storeRef;
    if (!this.started) {
      this.started = true;
      store.beginTransaction('Move label');
    }
    const at = this.editing.snapPoint(this.origin, { x: point.x + this.offset.x, y: point.y + this.offset.y }, ev);
    const geometry = labelGeometryAt(this.origin, at);
    this.editing.updateConnector(this.origin.id, (c) => {
      c.labelGeometry = { ...(c.labelGeometry ?? {}), x: geometry.x, y: geometry.y, offset: geometry.offset };
    });
  }

  up(): void {}
  cancel(): void {
    if (this.started) restoreConnector(this.editing, this.origin);
  }
}

// --- drawing helpers ----------------------------------------------------------------------------------

/**
 * mxCellHighlight: the shape's own outline, unfilled, in `color`, `width`
 * screen pixels wide at half opacity, turned with the shape.
 */
function outlineNode(v: VertexEl, color: string, width: number, zoom: number): HTMLElement {
  const s = v.scale || 1;
  const style = { ...vertexStyle(v) };
  for (const key of ['fillColor', 'gradientColor', 'swimlaneFillColor', 'image', 'fillOpacity', 'strokeOpacity', 'shadow', 'glass', 'dashed', 'sketch']) {
    delete style[key];
  }
  if (style.shape === 'image' || style.shape === 'label') style.shape = 'rectangle';
  style.fillColor = 'none';
  style.strokeColor = color;
  style.strokeWidth = String(width / (zoom * s));
  const c = new SvgCanvas({ idPrefix: `dg-hl-${v.id.replace(/[^A-Za-z0-9_-]/g, '_')}` });
  c.scale(s);
  paintVertex(c, style, { x: 0, y: 0, width: v.w / s, height: v.h / s }, { ignoreRotation: true });
  const node = document.createElement('div');
  node.className = 'dg-highlight';
  node.style.left = `${v.x}px`;
  node.style.top = `${v.y}px`;
  node.style.width = `${v.w}px`;
  node.style.height = `${v.h}px`;
  node.style.opacity = String(HIGHLIGHT_OPACITY);
  if (v.rot) node.style.transform = `rotate(${v.rot}deg)`;
  node.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${v.w}" height="${v.h}" overflow="visible" style="overflow:visible;position:absolute;left:0;top:0">${c.markup()}</svg>`;
  return node;
}
