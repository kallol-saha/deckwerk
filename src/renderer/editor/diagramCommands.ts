/*
 * draw.io's structure commands in the editor, after jgraph/drawio 32.7.4
 * (Apache License 2.0): the group, ungroup, collapse and expand actions of
 * js/grapheditor/Actions.js, Graph.foldCells and mxCellRenderer's folding
 * control, and the current layer (Graph.getDefaultParent) the Layers dialog
 * of js/grapheditor/Dialogs.js sets. Modified for DeckWerk's editor store.
 */

/**
 * Groups, containers and layers in the editor:
 *
 * - Group (Ctrl/Cmd+G): two or more cells with one parent go into a new
 *   group, which is selected; a single shape becomes a container, as in
 *   draw.io.
 * - Ungroup (Ctrl/Cmd+Shift+U): see structure.ts ungroupCells.
 * - Collapse / Expand: the +/− icon draw.io draws at a container's
 *   top-left corner, Ctrl/Cmd+Home and Ctrl/Cmd+End, or the context menu.
 * - The current layer of each diagram on each slide (draw.io's default
 *   parent): where new cells go when a caller passes it to insert.ts
 *   (`layer` in VertexSpec/ConnectorSpec). Kept per editor window, not in
 *   the deck, as draw.io keeps it in its view.
 * - Select in layer and Move selection to layer, for the Layers panel.
 */

import type { Slide, SlideElement } from '@shared/deck.js';
import { makeId } from '@shared/geometry.js';
import { defaultLayer, setLayerPreference } from '@shared/diagram/insert.js';
import { registerDiagramGroupCommands } from './diagramFormat.js';
import { setStyleValue } from '@shared/diagram/style.js';
import {
  DiagramTree, addLayer, cellsForGroup, cellsForUngroup, deleteLayer, foldingIconRect, groupCells,
  isCell, isContainer, isFoldable, isLayerLocked, moveCellsToLayer, moveLayer, renameLayer,
  selectableLayerCells, setCollapsed, setLayerHidden, setLayerLocked, ungroupCells,
  type DiagramCellEl,
} from '@shared/diagram/structure.js';
import type { EditorCanvas } from './canvas.js';
import type { EditorStore } from './store.js';

type MenuItem = { label: string; action: () => void } | 'separator';

// --- the current layer ----------------------------------------------------------------

const currentLayers = new Map<string, string>();
const layerListeners = new Set<() => void>();
const layerKey = (slideId: string, diagramId: string) => `${slideId}\u0000${diagramId}`;

/**
 * The layer new cells of `diagramId` on `slide` go on: the one chosen in the
 * Layers panel while it still exists, else insert.ts's default (the first
 * visible layer).
 */
export function currentLayer(slide: Pick<Slide, 'id' | 'diagrams'>, diagramId: string): string {
  const meta = slide.diagrams?.[diagramId];
  const chosen = currentLayers.get(layerKey(slide.id, diagramId));
  if (meta && chosen && meta.layers.some((l) => l.cell === chosen)) return chosen;
  return meta ? defaultLayer(meta) : '1';
}

export function setCurrentLayer(slideId: string, diagramId: string, layerCell: string): void {
  if (currentLayers.get(layerKey(slideId, diagramId)) === layerCell) return;
  currentLayers.set(layerKey(slideId, diagramId), layerCell);
  for (const listener of layerListeners) listener();
}

export function onCurrentLayerChange(listener: () => void): () => void {
  layerListeners.add(listener);
  return () => layerListeners.delete(listener);
}

/**
 * Hook the editor's commands into shared code and the Format panel: new
 * cells go on the current layer whoever makes them (insert.ts consults
 * this when a caller names no layer), and the Arrange tab shows Group and
 * Ungroup.
 */
export function installDiagramCommands(store: EditorStore): void {
  setLayerPreference((meta) => {
    const slide = store.slide;
    if (!slide?.diagrams) return null;
    // The diagram this record belongs to: by identity (callers pass the
    // slide's own record), else by its layers, else the slide's only one.
    const entries = Object.entries(slide.diagrams);
    const sameLayers = (a: typeof meta, b: typeof meta) =>
      a.layers.length === b.layers.length && a.layers.every((l, i) => l.cell === b.layers[i].cell);
    const match = entries.find(([, m]) => m === meta)
      ?? (entries.filter(([, m]) => sameLayers(m, meta)).length === 1 ? entries.find(([, m]) => sameLayers(m, meta)) : undefined)
      ?? (entries.length === 1 ? entries[0] : undefined);
    if (!match) return null;
    // Read the choice directly: currentLayer() falls back to defaultLayer(), which asks here.
    return currentLayers.get(layerKey(slide.id, match[0])) ?? null;
  });
  registerDiagramGroupCommands({
    group: { run: (s) => { groupSelection(s); }, enabled: canGroup, title: 'Group (Ctrl+G)' },
    ungroup: { run: (s) => { ungroupSelection(s); }, enabled: canUngroup, title: 'Ungroup (Ctrl+Shift+U)' },
  });
}

// --- the selection ---------------------------------------------------------------------

/** The selected draw.io cells on the current slide, in slide order. */
export function selectedCells(store: EditorStore): DiagramCellEl[] {
  return store.selectedElements().filter(isCell);
}

/** Change the current slide in one undoable commit. */
function commitSlide(store: EditorStore, label: string, change: (slide: Slide) => void): void {
  const index = store.get().slideIndex;
  store.commit((deck) => {
    const slide = deck.slides[index];
    if (slide) change(slide);
  }, { label });
}

/** Ctrl+G would do something: a shape to make a container, or cells to group. */
export function canGroup(store: EditorStore): boolean {
  const slide = store.slide;
  const cells = selectedCells(store);
  if (!slide || cells.length === 0) return false;
  if (cells.length === 1) return cells[0].type === 'vertex' && !isContainer(cells[0]);
  return cellsForGroup(slide, cells.map((c) => c.id)).length > 1;
}

/**
 * draw.io's Group action: the selected cells that share the first one's
 * parent go into a new group, which becomes the selection; one selected
 * shape becomes a container (`container=1`) instead.
 */
export function groupSelection(store: EditorStore): boolean {
  const slide = store.slide;
  const cells = selectedCells(store);
  if (!slide || cells.length === 0) return false;
  if (cells.length === 1) {
    const only = cells[0];
    if (only.type !== 'vertex' || isContainer(only)) return false;
    commitSlide(store, 'Make container', (draft) => {
      const el = draft.elements.find((candidate) => candidate.id === only.id);
      if (el?.type === 'vertex') el.dio = setStyleValue(el.dio, 'container', '1');
    });
    return true;
  }
  const ids = cells.map((c) => c.id);
  if (cellsForGroup(slide, ids).length < 2) return false;
  let groupId: string | null = null;
  commitSlide(store, 'Group', (draft) => {
    groupId = groupCells(draft, ids, makeId)?.id ?? null;
  });
  if (groupId) store.select([groupId]);
  return groupId !== null;
}

/** Ctrl+Shift+U would do something: a selected group or container. */
export function canUngroup(store: EditorStore): boolean {
  const slide = store.slide;
  const cells = selectedCells(store);
  if (!slide || cells.length === 0) return false;
  return cellsForUngroup(slide, cells.map((c) => c.id)).length > 0 || cells.some(isContainer);
}

/** draw.io's Ungroup action; the ungrouped cells and what stays become the selection. */
export function ungroupSelection(store: EditorStore): boolean {
  if (!canUngroup(store)) return false;
  const ids = selectedCells(store).map((c) => c.id);
  let selection: string[] = [];
  commitSlide(store, 'Ungroup', (draft) => {
    selection = ungroupCells(draft, ids).selection;
  });
  store.select(selection);
  return true;
}

/** Collapse an expanded container or expand a collapsed one (the folding icon). */
export function toggleCollapse(store: EditorStore, elementId: string): boolean {
  const el = store.slide?.elements.find((candidate) => candidate.id === elementId);
  if (el?.type !== 'vertex') return false;
  const collapse = !el.collapsed;
  commitSlide(store, collapse ? 'Collapse' : 'Expand', (draft) => {
    setCollapsed(draft, elementId, collapse);
  });
  // Graph.foldCells selects what it folded.
  store.select([elementId]);
  return true;
}

/** draw.io's Collapse (Ctrl+Home) and Expand (Ctrl+End) on the selection's foldable cells. */
export function setSelectionCollapsed(store: EditorStore, collapse: boolean): boolean {
  const slide = store.slide;
  if (!slide) return false;
  const cells = selectedCells(store)
    .filter((c) => c.type === 'vertex' && isFoldable(c, slide) && Boolean(c.collapsed) !== collapse);
  if (cells.length === 0) return false;
  commitSlide(store, collapse ? 'Collapse' : 'Expand', (draft) => {
    for (const cell of cells) setCollapsed(draft, cell.id, collapse);
  });
  return true;
}

/** draw.io's "Select objects in layer" (Shift+click on a layer). */
export function selectAllInLayer(store: EditorStore, diagramId: string, layerCell: string): void {
  const slide = store.slide;
  if (!slide) return;
  store.select(selectableLayerCells(slide, diagramId, layerCell).map((c) => c.id));
}

/** draw.io's "Move selection to" a layer. Refused for a locked layer, as draw.io greys it out. */
export function moveSelectionToLayer(store: EditorStore, diagramId: string, layerCell: string): boolean {
  const slide = store.slide;
  const layer = slide?.diagrams?.[diagramId]?.layers.find((l) => l.cell === layerCell);
  const cells = selectedCells(store).filter((c) => c.diagram === diagramId);
  if (!slide || !layer || isLayerLocked(layer) || cells.length === 0) return false;
  let moved = 0;
  commitSlide(store, 'Move to layer', (draft) => {
    moved = moveCellsToLayer(draft, cells.map((c) => c.id), layerCell).length;
  });
  return moved > 0;
}

// --- layer edits, one undoable commit each ------------------------------------------------

export const layerCommands = {
  add(store: EditorStore, diagramId: string): string | null {
    const slide = store.slide;
    if (!slide) return null;
    let cell: string | null = null;
    commitSlide(store, 'Add layer', (draft) => {
      cell = addLayer(draft, diagramId);
    });
    if (cell) setCurrentLayer(slide.id, diagramId, cell);
    return cell;
  },
  rename(store: EditorStore, diagramId: string, layerCell: string, label: string): void {
    commitSlide(store, 'Rename layer', (draft) => {
      renameLayer(draft, diagramId, layerCell, label);
    });
  },
  remove(store: EditorStore, diagramId: string, layerCell: string): void {
    const slide = store.slide;
    if (!slide) return;
    let current: string | null = null;
    commitSlide(store, 'Delete layer', (draft) => {
      current = deleteLayer(draft, diagramId, layerCell)?.current ?? null;
    });
    if (current) setCurrentLayer(slide.id, diagramId, current);
  },
  move(store: EditorStore, diagramId: string, layerCell: string, index: number): void {
    commitSlide(store, 'Reorder layers', (draft) => {
      moveLayer(draft, diagramId, layerCell, index);
    });
  },
  setHidden(store: EditorStore, diagramId: string, layerCell: string, hidden: boolean): void {
    commitSlide(store, hidden ? 'Hide layer' : 'Show layer', (draft) => {
      setLayerHidden(draft, diagramId, layerCell, hidden);
    });
    if (hidden) deselectLayer(store, diagramId, layerCell);
  },
  setLocked(store: EditorStore, diagramId: string, layerCell: string, locked: boolean): void {
    commitSlide(store, locked ? 'Lock layer' : 'Unlock layer', (draft) => {
      setLayerLocked(draft, diagramId, layerCell, locked);
    });
    // draw.io drops the layer's cells from the selection when it locks.
    if (locked) deselectLayer(store, diagramId, layerCell);
  },
};

function deselectLayer(store: EditorStore, diagramId: string, layerCell: string): void {
  const slide = store.slide;
  if (!slide) return;
  const tree = new DiagramTree(slide);
  const inLayer = new Set(tree.layerCells(diagramId, layerCell).map((c) => c.id));
  const selection = [...store.get().selection];
  const kept = selection.filter((id) => !inLayer.has(id));
  if (kept.length !== selection.length) store.select(kept);
}

// --- keys and the context menu ----------------------------------------------------------

let layersToggle: (() => void) | null = null;

/** The Layers panel registers how Ctrl/Cmd+Shift+L and "Layers…" open it. */
export function setLayersToggle(toggle: (() => void) | null): void {
  layersToggle = toggle;
}

/**
 * draw.io's keys for structure: Ctrl/Cmd+G group, Ctrl/Cmd+Shift+U
 * ungroup, Ctrl/Cmd+Home collapse, Ctrl/Cmd+End expand (with diagram cells
 * selected), Ctrl/Cmd+Shift+L the Layers panel. Returns whether it took
 * the key; anything else is left to the editor's own keys (Ctrl+Shift+U
 * without a group selected still underlines text).
 */
export function handleDiagramKey(e: KeyboardEvent, store: EditorStore): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return false;
  const key = e.key.toLowerCase();
  if (e.shiftKey && (key === 'l' || e.code === 'KeyL')) {
    if (!layersToggle) return false;
    e.preventDefault();
    if (!e.repeat) layersToggle();
    return true;
  }
  if (selectedCells(store).length === 0) return false;
  if (!e.shiftKey && (key === 'g' || e.code === 'KeyG')) {
    e.preventDefault();
    if (!e.repeat) groupSelection(store);
    return true;
  }
  if (e.shiftKey && (key === 'u' || e.code === 'KeyU')) {
    if (!canUngroup(store)) return false;
    e.preventDefault();
    if (!e.repeat) ungroupSelection(store);
    return true;
  }
  if (!e.shiftKey && (e.key === 'Home' || e.key === 'End')) {
    e.preventDefault();
    setSelectionCollapsed(store, e.key === 'Home');
    return true;
  }
  return false;
}

/** The context menu's rows for diagrams: Group, Ungroup, Collapse/Expand, Layers…. */
export function diagramContextItems(store: EditorStore, el: SlideElement | null): MenuItem[] {
  const slide = store.slide;
  if (!slide) return [];
  const items: MenuItem[] = [];
  if (el && isCell(el)) {
    if (canGroup(store)) {
      items.push({ label: selectedCells(store).length === 1 ? 'Make container' : 'Group', action: () => groupSelection(store) });
    }
    if (canUngroup(store)) items.push({ label: 'Ungroup', action: () => ungroupSelection(store) });
    if (el.type === 'vertex' && isFoldable(el, slide)) {
      items.push({ label: el.collapsed ? 'Expand' : 'Collapse', action: () => toggleCollapse(store, el.id) });
    }
  }
  const hasDiagram = slide.elements.some(isCell) || Object.keys(slide.diagrams ?? {}).length > 0;
  if (hasDiagram && layersToggle) {
    const toggle = layersToggle;
    items.push({ label: 'Layers…', action: () => toggle() });
  }
  return items.length > 0 ? ['separator', ...items] : [];
}

// --- the folding icons ------------------------------------------------------------------

/** draw.io's folding images (Graph.createFoldingImage), as it draws them. */
function foldingImage(collapsed: boolean): string {
  const gradient = collapsed
    ? '<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
    : '<linearGradient id="g" x1="50%" y1="0%" x2="50%" y2="100%">';
  const sign = collapsed ? 'M 4.5 2 L 4.5 7 M 2 4.5 L 7 4.5 z' : 'M 2 4.5 L 7 4.5 z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9"><defs>${gradient}`
    + '<stop offset="30%" style="stop-color:#f0f0f0;"/><stop offset="100%" style="stop-color:#AFB0B6;"/></linearGradient></defs>'
    + '<rect x="0" y="0" width="9" height="9" stroke="#8A94A5" fill="url(#g)" stroke-width="2"/>'
    + `<path d="${sign}" stroke="#000"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Smallest the icon is drawn and hit on screen (draw.io: 9 px at 100 %, minControlHitSize 12). */
const MIN_ICON_PX = 9;
const MIN_HIT_PX = 14;

/**
 * Draws draw.io's +/− folding icon on every container of the current slide
 * that can fold (structure.ts foldingIconRect) in a layer over the slide; a
 * click collapses or expands it. Redrawn when the slide or the zoom changes.
 */
export function installFoldingIcons(store: EditorStore, canvas: EditorCanvas): void {
  const layer = canvas.addStageLayer('dg-folding-layer');
  let drawn = '';
  const draw = () => {
    const slide = store.slide;
    const scale = canvas.stageScale() || 1;
    const icons: Array<{ id: string; collapsed: boolean; x: number; y: number; w: number; h: number }> = [];
    if (slide) {
      for (const el of slide.elements) {
        if (el.type !== 'vertex' || el.hidden || el.concealed) continue;
        const rect = foldingIconRect(el, slide);
        if (rect) icons.push({ id: el.id, collapsed: Boolean(el.collapsed), x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }
    const signature = `${scale}|${icons.map((i) => `${i.id}:${i.collapsed}:${i.x},${i.y},${i.w}`).join(';')}`;
    if (signature === drawn) return;
    drawn = signature;
    layer.replaceChildren();
    for (const icon of icons) {
      const size = Math.max(icon.w, MIN_ICON_PX / scale);
      const hit = Math.max(size, MIN_HIT_PX / scale);
      const cx = icon.x + icon.w / 2;
      const cy = icon.y + icon.h / 2;
      const button = document.createElement('div');
      button.className = 'dg-folding-icon';
      button.dataset.elementId = icon.id;
      button.dataset.collapsed = String(icon.collapsed);
      button.title = icon.collapsed ? 'Expand' : 'Collapse';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', button.title);
      Object.assign(button.style, {
        position: 'absolute', left: `${cx - hit / 2}px`, top: `${cy - hit / 2}px`, width: `${hit}px`, height: `${hit}px`,
        pointerEvents: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      const img = document.createElement('img');
      img.src = foldingImage(icon.collapsed);
      img.alt = '';
      img.draggable = false;
      Object.assign(img.style, { width: `${size}px`, height: `${size}px`, display: 'block', pointerEvents: 'none' });
      button.append(img);
      // The canvas starts selections and drags on pointerdown: the icon is not the shape.
      const swallow = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      button.addEventListener('pointerdown', swallow);
      button.addEventListener('mousedown', swallow);
      button.addEventListener('dblclick', swallow);
      button.addEventListener('contextmenu', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => {
        swallow(event);
        toggleCollapse(store, icon.id);
      });
      layer.append(button);
    }
  };
  store.subscribe(draw);
  canvas.addViewportListener(draw);
  draw();
}
