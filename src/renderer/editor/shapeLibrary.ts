import './shapeLibrary.css';
import { makeId } from '@shared/geometry.js';
import {
  PALETTES, applyLibraryEdit, clickItem, dropInsertPoint, insertItem, insertionFrame, itemSvg,
  libraryItem, paintedBounds, searchLibrary, toSlide, toUnits,
  type ClickModifiers, type ClickView, type LibraryEdit, type LibraryItem, type LibraryPalette,
} from '@shared/diagram/library/index.js';
import type { Point } from '@shared/diagram/types.js';
import { barIconButton } from './shellWiring.js';
import type { EditorStore } from './store.js';

/**
 * Shapes: draw.io's shape library beside the slide rail (draw.io's Sidebar).
 *
 * The palettes are draw.io's own (General, Misc, Advanced, Basic, Arrows,
 * Flowchart, Entity Relation, UML; src/shared/diagram/library), drawn with
 * the diagram engine into draw.io-sized thumbnails. Palettes build their
 * tiles when first opened and tiles draw their thumbnail when scrolled into
 * view, so the hundreds of entries cost nothing until seen.
 *
 * As in draw.io:
 * - a click inserts the entry in the middle of the visible canvas, selected
 *   (Sidebar.itemClicked; Alt: below the diagram);
 * - Alt+click with one shape selected inserts beside it and connects them
 *   (Shift east, Ctrl/Cmd north, Ctrl/Cmd+Shift west, plain Alt south);
 * - Shift+click with shapes selected gives them the entry's style;
 * - a connector entry clicked with two shapes selected joins them; a shape
 *   clicked with a loose connector selected ends the connector;
 * - dragging places the entry where it is dropped, its corner at the pointer,
 *   snapped to the diagram grid (Alt: no snapping), with a live preview;
 * - hovering shows a larger preview with the title (Sidebar.showTooltip);
 * - Ctrl/Cmd+Shift+K shows and hides the panel.
 *
 * Shared by the desktop editor and the browser collab client.
 */

const STORAGE_KEY = 'deckwerk.shapeLibrary';
/** Sidebar.thumbWidth / thumbHeight / thumbBorder (draw.io's default, smaller entries). */
const THUMB_W = 32;
const THUMB_H = 30;
const THUMB_BORDER = 1;
/** Sidebar.tooltipDelay and maxTooltipWidth/Height. */
const TOOLTIP_DELAY = 300;
const TOOLTIP_MAX = 400;
/** Search results shown before "More results" (draw.io pages its results too). */
const RESULTS_PAGE = 60;
/** Pointer travel (px) that makes a press a drag. */
const DRAG_TOLERANCE = 4;

const SHAPES_ICON =
  '<svg class="bar-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<rect x="1.5" y="1.5" width="5" height="5" rx="0.8" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<circle cx="12" cy="4" r="2.6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M4 9.3l2.7 5.2H1.3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
  '<path d="M12 9.2l2.8 2.8-2.8 2.8-2.8-2.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

const CHEVRON =
  '<svg class="shape-palette-chevron" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">' +
  '<path d="M3.5 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface SavedState {
  open?: boolean;
  expanded?: string[];
}

function loadState(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as SavedState : {};
  } catch {
    return {};
  }
}

function saveState(state: SavedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage unavailable */ }
}

/**
 * Thumbnails take the panel's colours where a cell uses draw.io's default
 * ones (Sidebar.createThumb: shapeForegroundColor / shapeBackgroundColor),
 * so shapes read in both UI themes; the CSS maps the attributes.
 */
function themedSvg(svg: string): string {
  return svg
    .replace(/background-color: #ffffff/g, 'background-color: var(--lib-bg)')
    .replace(/(^|[^-])color: #000000/g, '$1color: currentColor');
}

function isTypingTarget(target: EventTarget | null): boolean {
  const t = target instanceof HTMLElement ? target : null;
  return Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('.cm-editor')));
}

export interface ShapeLibraryOptions {
  /** The canvas host (`#canvas`), whose `.stage` is the CSS-scaled slide. */
  canvasHost: HTMLElement;
  setStatusMessage?: (text: string) => void;
}

export class ShapeLibrary {
  /** The toolbar toggle, for the Insert group. */
  readonly button: HTMLButtonElement;
  private readonly search: HTMLInputElement;
  private readonly scroller: HTMLElement;
  private readonly results: HTMLElement;
  private readonly resultsGrid: HTMLElement;
  private readonly resultsHead: HTMLElement;
  private readonly resultsMore: HTMLButtonElement;
  private readonly palettesHost: HTMLElement;
  private readonly expanded = new Set<string>();
  private readonly observer: IntersectionObserver | null;
  private tooltip: HTMLElement | null = null;
  private tooltipTimer = 0;
  private tooltipTile: HTMLElement | null = null;
  private resultItems: LibraryItem[] = [];
  private resultShown = 0;
  private drag: DragState | null = null;

  constructor(private readonly host: HTMLElement, private readonly store: EditorStore, private readonly options: ShapeLibraryOptions) {
    const saved = loadState();
    for (const p of PALETTES) if (saved.expanded ? saved.expanded.includes(p.id) : p.expanded) this.expanded.add(p.id);

    host.classList.add('shape-library');
    host.setAttribute('aria-label', 'Shapes');
    host.replaceChildren();

    const searchWrap = document.createElement('div');
    searchWrap.className = 'shape-library-search';
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'Search shapes';
    this.search.setAttribute('aria-label', 'Search shapes');
    this.search.spellcheck = false;
    this.search.autocomplete = 'off';
    this.search.addEventListener('input', () => this.runSearch());
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.search.value) {
        e.preventDefault();
        e.stopPropagation();
        this.search.value = '';
        this.runSearch();
      } else if (e.key === 'Enter') {
        // Enter inserts the best match, as Enter on a focused entry does.
        const first = this.resultsGrid.querySelector<HTMLElement>('.shape-tile');
        if (first) {
          e.preventDefault();
          this.activate(first, e);
        }
      }
    });
    searchWrap.append(this.search);

    this.scroller = document.createElement('div');
    this.scroller.className = 'shape-library-scroll';
    this.scroller.addEventListener('scroll', () => this.hideTooltip(), { passive: true });

    this.results = document.createElement('section');
    this.results.className = 'shape-library-results';
    this.results.hidden = true;
    this.resultsHead = document.createElement('div');
    this.resultsHead.className = 'shape-library-results-head';
    this.resultsGrid = document.createElement('div');
    this.resultsGrid.className = 'shape-library-grid';
    this.resultsGrid.setAttribute('role', 'list');
    this.resultsMore = document.createElement('button');
    this.resultsMore.type = 'button';
    this.resultsMore.className = 'shape-library-more';
    this.resultsMore.textContent = 'More results';
    this.resultsMore.addEventListener('click', () => this.showMoreResults());
    this.results.append(this.resultsHead, this.resultsGrid, this.resultsMore);

    this.palettesHost = document.createElement('div');
    this.palettesHost.className = 'shape-library-palettes';
    for (const palette of PALETTES) this.palettesHost.append(this.paletteSection(palette));

    const hint = document.createElement('p');
    hint.className = 'shape-library-hint';
    hint.textContent = 'Click or drag to insert. Alt+click connects to the selected shape; Shift+click restyles the selection.';

    this.scroller.append(this.results, this.palettesHost, hint);
    host.append(searchWrap, this.scroller);

    this.observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        this.drawThumb(entry.target as HTMLElement);
        this.observer?.unobserve(entry.target);
      }
    }, { root: this.scroller, rootMargin: '120px 0px' });

    this.button = barIconButton('Shapes', SHAPES_ICON, () => this.toggle());
    this.button.classList.add('shape-library-toggle');
    this.button.title = 'draw.io shapes (Ctrl+Shift+K)';
    this.button.setAttribute('aria-pressed', 'false');
    this.button.setAttribute('aria-controls', host.id || 'shapes');

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !isTypingTarget(e.target)) {
        e.preventDefault();
        this.toggle();
      }
    });

    this.setOpen(saved.open === true, false);
  }

  isOpen(): boolean {
    return !this.host.hidden;
  }

  toggle(): void {
    this.setOpen(!this.isOpen());
  }

  setOpen(open: boolean, remember = true): void {
    this.host.hidden = !open;
    this.button.setAttribute('aria-pressed', String(open));
    this.button.classList.toggle('is-active', open);
    if (!open) this.hideTooltip();
    if (remember) this.persist();
    if (open) for (const id of this.expanded) this.fillPalette(id);
  }

  /** Focus the search box (opening the panel). */
  focusSearch(): void {
    if (!this.isOpen()) this.setOpen(true);
    this.search.focus();
    this.search.select();
  }

  private persist(): void {
    saveState({ open: this.isOpen(), expanded: [...this.expanded] });
  }

  // --- palettes -----------------------------------------------------------------

  private paletteSection(palette: LibraryPalette): HTMLElement {
    const section = document.createElement('section');
    section.className = 'shape-palette';
    section.dataset.palette = palette.id;
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'shape-palette-title';
    title.innerHTML = `${CHEVRON}<span></span>`;
    title.querySelector('span')!.textContent = palette.title;
    const grid = document.createElement('div');
    grid.className = 'shape-library-grid';
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', palette.title);
    const open = this.expanded.has(palette.id);
    title.setAttribute('aria-expanded', String(open));
    grid.hidden = !open;
    title.addEventListener('click', () => {
      const next = grid.hidden;
      grid.hidden = !next;
      title.setAttribute('aria-expanded', String(next));
      if (next) {
        this.expanded.add(palette.id);
        this.fillPalette(palette.id);
      } else {
        this.expanded.delete(palette.id);
      }
      this.persist();
    });
    section.append(title, grid);
    return section;
  }

  /** Builds a palette's tiles the first time it is open (Sidebar.addPalette's deferred onInit). */
  private fillPalette(id: string): void {
    if (!this.isOpen()) return;
    const section = this.palettesHost.querySelector<HTMLElement>(`.shape-palette[data-palette="${CSS.escape(id)}"]`);
    const grid = section?.querySelector<HTMLElement>('.shape-library-grid');
    const palette = PALETTES.find((p) => p.id === id);
    if (!grid || !palette || grid.childElementCount > 0) return;
    for (const item of palette.items) grid.append(this.tile(item));
  }

  private tile(item: LibraryItem): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'shape-tile';
    tile.dataset.item = item.id;
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-label', item.title || 'Shape');
    tile.style.width = `${THUMB_W + 2 * THUMB_BORDER}px`;
    tile.style.height = `${THUMB_H + 2 * THUMB_BORDER}px`;
    if (this.observer) this.observer.observe(tile);
    else this.drawThumb(tile);
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !this.drag) this.scheduleTooltip(tile);
    });
    tile.addEventListener('pointerleave', () => this.hideTooltip());
    tile.addEventListener('pointerdown', (e) => this.pointerDown(e, tile));
    tile.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.activate(tile, e);
      } else if (e.key.startsWith('Arrow') && !e.altKey) {
        e.preventDefault();
        this.focusNeighbour(tile, e.key);
      }
    });
    return tile;
  }

  private drawThumb(tile: HTMLElement): void {
    if (tile.dataset.drawn) return;
    const item = libraryItem(tile.dataset.item ?? '');
    if (!item) return;
    tile.dataset.drawn = '1';
    try {
      tile.innerHTML = themedSvg(itemSvg(item, { width: THUMB_W + 2 * THUMB_BORDER, height: THUMB_H + 2 * THUMB_BORDER, border: THUMB_BORDER }));
    } catch {
      tile.textContent = '?';
    }
  }

  /** Sidebar.focusItemInDirection: arrow keys move between entries. */
  private focusNeighbour(tile: HTMLElement, key: string): void {
    const grid = tile.parentElement;
    if (!grid) return;
    const tiles = [...grid.querySelectorAll<HTMLElement>('.shape-tile')];
    const at = tiles.indexOf(tile);
    const perRow = Math.max(1, Math.round(grid.clientWidth / (tile.offsetWidth + 4)));
    const step = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -perRow : perRow;
    tiles[Math.max(0, Math.min(tiles.length - 1, at + step))]?.focus();
  }

  // --- search -----------------------------------------------------------------

  private runSearch(): void {
    const query = this.search.value.trim();
    this.hideTooltip();
    if (!query) {
      this.results.hidden = true;
      this.palettesHost.hidden = false;
      this.resultsGrid.replaceChildren();
      return;
    }
    this.resultItems = searchLibrary(query);
    this.resultShown = 0;
    this.resultsGrid.replaceChildren();
    this.results.hidden = false;
    this.palettesHost.hidden = true;
    const count = this.resultItems.length;
    this.resultsHead.textContent = count === 0 ? `No shapes match “${query}”` : `${count} result${count === 1 ? '' : 's'} for “${query}”`;
    this.showMoreResults();
  }

  private showMoreResults(): void {
    const next = this.resultItems.slice(this.resultShown, this.resultShown + RESULTS_PAGE);
    for (const item of next) this.resultsGrid.append(this.tile(item));
    this.resultShown += next.length;
    this.resultsMore.hidden = this.resultShown >= this.resultItems.length;
  }

  // --- tooltip (Sidebar.showTooltip / createTooltip) -------------------------------------

  private scheduleTooltip(tile: HTMLElement): void {
    if (this.tooltipTile === tile) return;
    window.clearTimeout(this.tooltipTimer);
    this.tooltipTile = tile;
    // Moving from one entry to the next while a tooltip shows updates it at once.
    if (this.tooltip?.isConnected) this.showTooltip(tile);
    else this.tooltipTimer = window.setTimeout(() => this.showTooltip(tile), TOOLTIP_DELAY);
  }

  private showTooltip(tile: HTMLElement): void {
    const item = libraryItem(tile.dataset.item ?? '');
    if (!item || !tile.isConnected || this.drag) return;
    const bounds = paintedBounds(item);
    const w = Math.max(1, bounds.width);
    const h = Math.max(1, bounds.height);
    const scale = (w > TOOLTIP_MAX || h > TOOLTIP_MAX) ? Math.round(Math.min(TOOLTIP_MAX / w, TOOLTIP_MAX / h) * 100) / 100 : 1;
    const tip = this.tooltip ?? document.createElement('div');
    tip.className = 'shape-library-tooltip';
    tip.setAttribute('role', 'tooltip');
    const art = document.createElement('div');
    art.className = 'shape-library-tooltip-art';
    try {
      art.innerHTML = themedSvg(itemSvg(item, { scale, width: Math.ceil(w * scale), height: Math.ceil(h * scale) }));
    } catch { /* drawn as the title alone */ }
    const title = document.createElement('div');
    title.className = 'shape-library-tooltip-title';
    title.textContent = item.title;
    tip.replaceChildren(art, title);
    if (!tip.isConnected) document.body.append(tip);
    this.tooltip = tip;
    // Beside the panel, level with the entry, kept on screen (Sidebar.getTooltipOffset).
    const panel = this.host.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const top = Math.max(8, Math.min(window.innerHeight - tr.height - 8, r.top - 8));
    const left = Math.min(window.innerWidth - tr.width - 8, panel.right + 10);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;
  }

  private hideTooltip(): void {
    window.clearTimeout(this.tooltipTimer);
    this.tooltipTimer = 0;
    this.tooltipTile = null;
    this.tooltip?.remove();
  }

  // --- inserting ---------------------------------------------------------------------

  private stage(): HTMLElement | null {
    return this.options.canvasHost.querySelector<HTMLElement>('.stage');
  }

  /** Client pixels → slide pixels, through the CSS-scaled stage. */
  private slidePoint(clientX: number, clientY: number): { point: Point; scale: number } | null {
    const stage = this.stage();
    const canvasW = this.store.get().deck.canvas.w;
    if (!stage || !canvasW) return null;
    const r = stage.getBoundingClientRect();
    const s = r.width / canvasW;
    if (!(s > 0)) return null;
    return { point: { x: (clientX - r.left) / s, y: (clientY - r.top) / s }, scale: s };
  }

  /** The visible canvas, in slide pixels (Graph.getCenterInsertPoint reads the container). */
  private view(): ClickView | null {
    const host = this.options.canvasHost.getBoundingClientRect();
    const centre = this.slidePoint(host.left + host.width / 2, host.top + host.height / 2);
    const topLeft = this.slidePoint(host.left, host.top);
    return centre && topLeft ? { centre: centre.point, topLeft: topLeft.point } : null;
  }

  private activate(tile: HTMLElement, e: ClickModifiers): void {
    const item = libraryItem(tile.dataset.item ?? '');
    if (item) this.itemClicked(item, e);
  }

  /** Sidebar.itemClicked. */
  itemClicked(item: LibraryItem, modifiers: ClickModifiers = {}): void {
    const slide = this.store.slide;
    const view = this.view();
    if (!slide || !view) {
      this.options.setStatusMessage?.('Open a slide to insert shapes');
      return;
    }
    const selection = [...this.store.get().selection];
    let edit = clickItem(slide, item, selection, modifiers, view, makeId);
    // A plain click over an earlier one steps aside by a grid step, so
    // repeated clicks do not stack shapes exactly on top of each other.
    if (edit && !modifiers.altKey && !modifiers.shiftKey && edit.update.size === 0 && edit.add.length > 0) {
      const { frame, grid } = insertionFrame(slide, selection);
      const step = grid.size * frame.scale;
      const taken = (e: LibraryEdit) => {
        const first = e.add[0].element;
        return slide.elements.some((el) => (el.type === 'vertex' || el.type === 'connector')
          && Math.abs(el.x - first.x) < 0.5 && Math.abs(el.y - first.y) < 0.5);
      };
      for (let n = 1; n < 40 && taken(edit!); n++) {
        edit = clickItem(slide, item, selection, modifiers, {
          ...view,
          centre: { x: view.centre.x + n * step, y: view.centre.y + n * step },
        }, makeId);
        if (!edit) break;
      }
    }
    this.apply(edit);
  }

  private apply(edit: LibraryEdit | null): void {
    if (!edit) return;
    const index = this.store.get().slideIndex;
    this.store.commit((deck) => {
      const slide = deck.slides[index];
      if (slide) applyLibraryEdit(slide, edit);
    }, { label: edit.label });
    const ids = new Set(this.store.slide?.elements.map((el) => el.id));
    const select = edit.select.filter((id) => ids.has(id));
    if (select.length > 0) this.store.select(select);
  }

  // --- drag and drop (Sidebar.createDragSource / createDropHandler) ---------------------

  private pointerDown(e: PointerEvent, tile: HTMLElement): void {
    if (e.button !== 0) return;
    const item = libraryItem(tile.dataset.item ?? '');
    if (!item) return;
    e.preventDefault();
    this.hideTooltip();
    tile.setPointerCapture?.(e.pointerId);
    const state: DragState = {
      item, tile, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dragging: false, preview: null,
      previewKey: '',
    };
    this.drag = state;
    tile.classList.add('is-pressed');
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== state.pointerId) return;
      if (!state.dragging && Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY) > DRAG_TOLERANCE) {
        state.dragging = true;
        tile.classList.add('is-dragging');
        document.body.classList.add('shape-library-dragging');
      }
      if (state.dragging) this.updatePreview(state, ev);
    };
    const finish = (ev: PointerEvent | null, cancelled: boolean) => {
      tile.removeEventListener('pointermove', move);
      tile.removeEventListener('pointerup', up);
      tile.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape, true);
      tile.classList.remove('is-pressed', 'is-dragging');
      document.body.classList.remove('shape-library-dragging');
      state.preview?.remove();
      this.drag = null;
      if (cancelled || !ev) return;
      if (state.dragging) this.drop(state, ev);
      else {
        tile.blur();
        this.itemClicked(item, ev);
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === state.pointerId) finish(ev, false);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId === state.pointerId) finish(null, true);
    };
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(null, true);
    };
    tile.addEventListener('pointermove', move);
    tile.addEventListener('pointerup', up);
    tile.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape, true);
  }

  /** Whether the pointer is over the slide canvas (not the panel or other chrome). */
  private overCanvas(clientX: number, clientY: number): boolean {
    const hit = document.elementFromPoint(clientX, clientY);
    return Boolean(hit && this.options.canvasHost.contains(hit) && !hit.closest('.zoom-controls'));
  }

  /** Where the dragged entry would land: draw.io units and the slide frame. */
  private dropTarget(ev: { clientX: number; clientY: number; altKey: boolean }) {
    const slide = this.store.slide;
    const at = this.slidePoint(ev.clientX, ev.clientY);
    if (!slide || !at) return null;
    const selection = [...this.store.get().selection];
    const { frame, grid } = insertionFrame(slide, selection);
    // Alt drops without the grid, as mxGraph.isGridEnabledEvent.
    const corner = dropInsertPoint(toUnits(at.point, frame), { ...grid, enabled: grid.enabled && !ev.altKey });
    return { slide, frame, corner, stageScale: at.scale, selection };
  }

  /** The live preview: the entry at the canvas zoom, half transparent, where it will land (mxDragSource.dragOver). */
  private updatePreview(state: DragState, ev: PointerEvent): void {
    const target = this.overCanvas(ev.clientX, ev.clientY) ? this.dropTarget(ev) : null;
    if (!state.preview) {
      state.preview = document.createElement('div');
      state.preview.className = 'shape-library-drag-preview';
      document.body.append(state.preview);
    }
    const preview = state.preview;
    if (!target) {
      // Off the canvas: the thumbnail follows the pointer.
      if (state.previewKey !== 'thumb') {
        preview.classList.add('is-thumb');
        preview.innerHTML = themedSvg(itemSvg(state.item, { width: THUMB_W + 2, height: THUMB_H + 2 }));
        state.previewKey = 'thumb';
      }
      preview.style.left = `${ev.clientX + 4}px`;
      preview.style.top = `${ev.clientY + 4}px`;
      return;
    }
    const k = target.frame.scale * target.stageScale;
    const key = `live:${k.toFixed(4)}`;
    const bounds = paintedBounds(state.item);
    if (state.previewKey !== key) {
      preview.classList.remove('is-thumb');
      preview.innerHTML = itemSvg(state.item, {
        scale: k,
        width: Math.max(1, Math.ceil(bounds.width * k)),
        height: Math.max(1, Math.ceil(bounds.height * k)),
      });
      state.previewKey = key;
    }
    const stage = this.stage()!.getBoundingClientRect();
    const corner = toSlide({ x: target.corner.x + bounds.x, y: target.corner.y + bounds.y }, target.frame);
    preview.style.left = `${stage.left + corner.x * target.stageScale}px`;
    preview.style.top = `${stage.top + corner.y * target.stageScale}px`;
  }

  /** createDropHandler: the cells moved to the previewed corner, selected. */
  private drop(state: DragState, ev: PointerEvent): void {
    if (!this.overCanvas(ev.clientX, ev.clientY)) return;
    const target = this.dropTarget(ev);
    if (!target) return;
    this.apply(insertItem(target.slide, state.item, target.corner, makeId, { selection: target.selection }));
  }
}

interface DragState {
  item: LibraryItem;
  tile: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  preview: HTMLElement | null;
  previewKey: string;
}

/**
 * The panel in `#shapes` (made beside the rail when the page has none) and
 * its toolbar toggle; both editors call this.
 */
export function createShapeLibrary(store: EditorStore, options: ShapeLibraryOptions): ShapeLibrary {
  let host = document.getElementById('shapes');
  if (!host) {
    host = document.createElement('aside');
    host.id = 'shapes';
    host.hidden = true;
    const rail = document.getElementById('rail');
    if (rail?.parentElement) rail.after(host);
    else options.canvasHost.before(host);
  }
  return new ShapeLibrary(host, store, options);
}
