/*
 * draw.io's Layers window (LayersWindow in js/grapheditor/Dialogs.js,
 * jgraph/drawio 32.7.4, Apache License 2.0), modified for DeckWerk: a
 * floating panel over the canvas, working on the current slide's diagram
 * through the editor store.
 */

import './layersPanel.css';
import type { DiagramMeta, Slide } from '@shared/deck.js';
import { isLayerLocked, isCell, layerForCells, layerName } from '@shared/diagram/structure.js';
import {
  currentLayer, layerCommands, moveSelectionToLayer, onCurrentLayerChange, selectAllInLayer,
  selectedCells, setCurrentLayer, setLayersToggle,
} from './diagramCommands.js';
import type { EditorCanvas } from './canvas.js';
import type { EditorStore } from './store.js';

/**
 * The Layers panel (Ctrl/Cmd+Shift+L), as draw.io's Layers window:
 *
 * - The layers of the current slide's diagram, top layer first. Each row
 *   has an eye (show/hide), a lock, the name (double-click to rename) and
 *   a dot when everything selected is on that layer. The current layer —
 *   where new cells go — is highlighted; click a row to make it current,
 *   Shift+click to select what is on it. A locked layer is shown in red
 *   and its cells cannot be picked or moved.
 * - Drag a row to reorder the layers.
 * - Buttons: add a layer, delete the current one (with its cells), move it
 *   up or down, select its objects, and move the selection to it.
 */

const SVG = (body: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${body}</svg>`;
const ICONS = {
  visible: SVG('<path d="M1.2 8S3.6 3.5 8 3.5 14.8 8 14.8 8 12.4 12.5 8 12.5 1.2 8 1.2 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/>'),
  hidden: SVG('<path d="M1.2 8S3.6 3.5 8 3.5 14.8 8 14.8 8 12.4 12.5 8 12.5 1.2 8 1.2 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 13.5l11-11" stroke="currentColor" stroke-width="1.3"/>'),
  locked: SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/>'),
  unlocked: SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
  add: SVG('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  remove: SVG('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'),
  up: SVG('<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  down: SVG('<path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: SVG('<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
};

function iconButton(className: string, icon: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', label);
  return button;
}

/** The diagram ids on a slide: those its cells name, then records without cells. */
function diagramIds(slide: Slide): string[] {
  const ids: string[] = [];
  for (const el of slide.elements) if (isCell(el) && !ids.includes(el.diagram)) ids.push(el.diagram);
  for (const id of Object.keys(slide.diagrams ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

const NEW_DIAGRAM_ID = 'diagram-1';

export class LayersPanel {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly picker: HTMLSelectElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly tools: Record<'add' | 'remove' | 'up' | 'down' | 'select' | 'move', HTMLButtonElement>;
  private chosenDiagram: string | null = null;
  private drawn = '';
  private renaming: string | null = null;
  private dragging: string | null = null;
  private placed = false;

  /**
   * `anchor` is the canvas host: the panel opens over its top-right corner
   * but lives on the page body, since the canvas captures the pointer on
   * every press inside it.
   */
  constructor(private readonly anchor: HTMLElement, private readonly store: EditorStore) {
    this.root = document.createElement('div');
    this.root.className = 'layers-panel';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Layers');
    this.root.hidden = true;

    const head = document.createElement('div');
    head.className = 'layers-head';
    this.title = document.createElement('span');
    this.title.className = 'layers-title';
    this.title.textContent = 'Layers';
    this.picker = document.createElement('select');
    this.picker.className = 'layers-diagram';
    this.picker.title = 'Diagram';
    this.picker.addEventListener('change', () => {
      this.chosenDiagram = this.picker.value;
      this.render(true);
    });
    const close = iconButton('layers-close', ICONS.close, 'Close');
    close.addEventListener('click', () => this.hide());
    head.append(this.title, this.picker, close);
    this.makeDraggable(head);

    this.list = document.createElement('div');
    this.list.className = 'layers-list';
    this.list.setAttribute('role', 'list');
    this.list.setAttribute('aria-label', 'Layers');

    this.empty = document.createElement('div');
    this.empty.className = 'layers-empty';
    this.empty.textContent = 'No diagram on this slide yet. New layers start one.';

    const tools = document.createElement('div');
    tools.className = 'layers-tools';
    this.tools = {
      add: iconButton('layers-add', ICONS.add, 'Add layer'),
      remove: iconButton('layers-remove', ICONS.remove, 'Delete layer'),
      up: iconButton('layers-up', ICONS.up, 'Move layer up'),
      down: iconButton('layers-down', ICONS.down, 'Move layer down'),
      select: document.createElement('button'),
      move: document.createElement('button'),
    };
    this.tools.select.type = 'button';
    this.tools.select.className = 'layers-select';
    this.tools.select.textContent = 'Select';
    this.tools.select.title = 'Select objects in layer';
    this.tools.move.type = 'button';
    this.tools.move.className = 'layers-move';
    this.tools.move.textContent = 'Move here';
    this.tools.move.title = 'Move selection to this layer';
    this.tools.add.addEventListener('click', () => this.addLayer());
    this.tools.remove.addEventListener('click', () => this.withCurrent((d, cell) => layerCommands.remove(this.store, d, cell)));
    this.tools.up.addEventListener('click', () => this.shiftCurrent(1));
    this.tools.down.addEventListener('click', () => this.shiftCurrent(-1));
    this.tools.select.addEventListener('click', () => this.withCurrent((d, cell) => selectAllInLayer(this.store, d, cell)));
    this.tools.move.addEventListener('click', () => this.withCurrent((d, cell) => moveSelectionToLayer(this.store, d, cell)));
    const spacer = document.createElement('span');
    spacer.className = 'layers-spacer';
    tools.append(this.tools.add, this.tools.remove, this.tools.up, this.tools.down, spacer, this.tools.select, this.tools.move);

    this.root.append(head, this.list, this.empty, tools);
    // Keys typed into the panel (renaming) are not the editor's.
    this.root.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(this.root);
    store.subscribe(() => this.render());
    onCurrentLayerChange(() => this.render(true));
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    if (!this.placed) {
      // Over the canvas's top-right corner, below the toolbar's reach.
      const area = this.anchor.getBoundingClientRect();
      const width = this.root.offsetWidth || 272;
      Object.assign(this.root.style, {
        left: `${Math.max(8, area.right - width - 16)}px`,
        top: `${Math.max(8, area.top + 16)}px`,
      });
    }
    this.render(true);
  }

  hide(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen()) this.hide();
    else this.show();
  }

  /** The diagram the panel shows: the selection's, the one picked, else the slide's first. */
  diagramId(slide: Slide): string | null {
    const ids = diagramIds(slide);
    const selected = selectedCells(this.store)[0]?.diagram;
    if (selected && ids.includes(selected)) return selected;
    if (this.chosenDiagram && ids.includes(this.chosenDiagram)) return this.chosenDiagram;
    return ids[0] ?? null;
  }

  private meta(slide: Slide, diagramId: string | null): DiagramMeta | null {
    return diagramId ? slide.diagrams?.[diagramId] ?? null : null;
  }

  private withCurrent(action: (diagramId: string, layerCell: string) => void): void {
    const slide = this.store.slide;
    const diagramId = slide ? this.diagramId(slide) : null;
    if (!slide || !diagramId || !this.meta(slide, diagramId)) return;
    action(diagramId, currentLayer(slide, diagramId));
  }

  private shiftCurrent(step: number): void {
    this.withCurrent((diagramId, cell) => {
      const layers = this.store.slide?.diagrams?.[diagramId]?.layers ?? [];
      const index = layers.findIndex((l) => l.cell === cell);
      if (index < 0) return;
      layerCommands.move(this.store, diagramId, cell, index + step);
    });
  }

  private addLayer(): void {
    const slide = this.store.slide;
    if (!slide) return;
    const diagramId = this.diagramId(slide) ?? NEW_DIAGRAM_ID;
    this.chosenDiagram = diagramId;
    const cell = layerCommands.add(this.store, diagramId);
    // draw.io starts renaming the new layer at once.
    if (cell) {
      this.render(true);
      this.startRename(cell);
    }
  }

  /** Rebuild the rows when what they show changed (or `force`). */
  render(force = false): void {
    if (!this.isOpen() || this.renaming) return;
    const slide = this.store.slide;
    const diagramId = slide ? this.diagramId(slide) : null;
    const meta = slide ? this.meta(slide, diagramId) : null;
    const selection = [...this.store.get().selection];
    const selectionLayer = slide && selection.length > 0 ? layerForCells(slide, selection) : null;
    const current = slide && diagramId && meta ? currentLayer(slide, diagramId) : null;
    const ids = slide ? diagramIds(slide) : [];
    const signature = JSON.stringify([
      slide?.id, diagramId, ids, meta?.layers.map((l) => [l.cell, l.label, l.dio, l.hidden]), current,
      selectionLayer?.diagram === diagramId ? selectionLayer?.layer : null, selection.length > 0,
    ]);
    if (!force && signature === this.drawn) return;
    this.drawn = signature;

    this.picker.replaceChildren(...ids.map((id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = slide?.diagrams?.[id]?.name || id;
      return option;
    }));
    this.picker.hidden = ids.length < 2;
    if (diagramId) this.picker.value = diagramId;

    this.list.replaceChildren();
    this.empty.hidden = Boolean(meta);
    const layers = meta?.layers ?? [];
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      const row = document.createElement('div');
      row.className = 'layers-row';
      row.dataset.layer = layer.cell;
      row.setAttribute('role', 'listitem');
      row.title = `${layerName(layer)} (${layer.cell})`;
      row.draggable = true;
      const locked = isLayerLocked(layer);
      row.classList.toggle('current', layer.cell === current);
      row.classList.toggle('locked', locked);
      row.classList.toggle('hidden-layer', Boolean(layer.hidden));
      if (layer.cell === current) row.setAttribute('aria-current', 'true');

      const eye = iconButton('layers-eye', layer.hidden ? ICONS.hidden : ICONS.visible, layer.hidden ? 'Show' : 'Hide');
      eye.setAttribute('aria-pressed', String(!layer.hidden));
      eye.addEventListener('click', (event) => {
        event.stopPropagation();
        layerCommands.setHidden(this.store, diagramId!, layer.cell, !layer.hidden);
      });
      const lock = iconButton('layers-lock', locked ? ICONS.locked : ICONS.unlocked, locked ? 'Unlock' : 'Lock');
      lock.setAttribute('aria-pressed', String(locked));
      lock.addEventListener('click', (event) => {
        event.stopPropagation();
        layerCommands.setLocked(this.store, diagramId!, layer.cell, !locked);
      });
      const name = document.createElement('span');
      name.className = 'layers-name';
      name.textContent = layerName(layer);
      row.append(eye, lock, name);
      if (selectionLayer && selectionLayer.diagram === diagramId && selectionLayer.layer === layer.cell) {
        const dot = document.createElement('span');
        dot.className = 'layers-dot';
        dot.textContent = '•';
        dot.title = 'All selected objects are in this layer';
        row.append(dot);
      }

      row.addEventListener('click', (event) => {
        if (!slide || !diagramId) return;
        setCurrentLayer(slide.id, diagramId, layer.cell);
        if (event.shiftKey) selectAllInLayer(this.store, diagramId, layer.cell);
      });
      row.addEventListener('dblclick', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        this.startRename(layer.cell);
      });
      row.addEventListener('dragstart', (event) => {
        this.dragging = layer.cell;
        event.dataTransfer?.setData('text/plain', layer.cell);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => {
        this.dragging = null;
        row.classList.remove('dragging');
        for (const other of this.list.querySelectorAll('.drop-target')) other.classList.remove('drop-target');
      });
      row.addEventListener('dragover', (event) => {
        if (!this.dragging || this.dragging === layer.cell) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        for (const other of this.list.querySelectorAll('.drop-target')) other.classList.remove('drop-target');
        row.classList.add('drop-target');
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const moving = this.dragging;
        this.dragging = null;
        if (!moving || moving === layer.cell || !diagramId) return;
        // Dropped on a row: the layer takes that row's place in the stack.
        layerCommands.move(this.store, diagramId, moving, index);
      });
      this.list.append(row);
    }

    const hasCurrent = Boolean(meta && current);
    const currentIndex = layers.findIndex((l) => l.cell === current);
    this.tools.remove.disabled = !hasCurrent;
    this.tools.up.disabled = !hasCurrent || currentIndex >= layers.length - 1;
    this.tools.down.disabled = !hasCurrent || currentIndex <= 0;
    const currentLocked = currentIndex >= 0 && isLayerLocked(layers[currentIndex]);
    this.tools.select.disabled = !hasCurrent || currentLocked;
    this.tools.move.disabled = !hasCurrent || currentLocked || selection.length === 0
      || (selectionLayer?.diagram === diagramId && selectionLayer?.layer === current);
  }

  /** Rename in place (draw.io: the name becomes editable; Enter keeps, Escape cancels). */
  private startRename(layerCell: string): void {
    const row = this.list.querySelector<HTMLElement>(`.layers-row[data-layer="${CSS.escape(layerCell)}"]`);
    const name = row?.querySelector<HTMLElement>('.layers-name');
    const slide = this.store.slide;
    const diagramId = slide ? this.diagramId(slide) : null;
    if (!row || !name || !diagramId) return;
    const input = document.createElement('input');
    input.className = 'layers-rename';
    input.value = name.textContent ?? '';
    input.setAttribute('aria-label', 'Layer name');
    row.draggable = false;
    name.replaceWith(input);
    this.renaming = layerCell;
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      this.renaming = null;
      const value = input.value;
      if (keep && value !== name.textContent) layerCommands.rename(this.store, diagramId, layerCell, value);
      this.render(true);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        finish(event.key === 'Enter');
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('dblclick', (event) => event.stopPropagation());
  }

  /** Move the panel by its title bar, as draw.io's windows move. */
  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button, select')) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      const box = this.root.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const left = Math.max(0, Math.min(window.innerWidth - box.width, box.left + ev.clientX - start.x));
        const top = Math.max(0, Math.min(window.innerHeight - 40, box.top + ev.clientY - start.y));
        Object.assign(this.root.style, { left: `${left}px`, top: `${top}px` });
        this.placed = true;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}

/**
 * The Layers panel over the canvas, opened with Ctrl/Cmd+Shift+L, the
 * canvas's "Layers…" menu row or the layers button by the zoom control.
 */
export function installLayersPanel(store: EditorStore, canvas: EditorCanvas, host: HTMLElement | null = document.getElementById('canvas')): LayersPanel {
  const panel = new LayersPanel(host ?? document.body, store);
  setLayersToggle(() => panel.toggle());
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zoom-button layers-toggle';
  button.title = 'Layers (Ctrl+Shift+L)';
  button.setAttribute('aria-label', 'Layers');
  button.innerHTML = SVG('<path d="M8 2l6 3.2-6 3.2-6-3.2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'
    + '<path d="M2 8.2l6 3.2 6-3.2M2 11l6 3.2 6-3.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>');
  button.addEventListener('click', () => panel.toggle());
  canvas.addViewControl(button);
  // Shown where there is a diagram, or while the panel is open.
  const sync = () => {
    const slide = store.slide;
    const has = Boolean(slide && (slide.elements.some(isCell) || Object.keys(slide.diagrams ?? {}).length > 0));
    button.hidden = !has && !panel.isOpen();
    button.classList.toggle('active', panel.isOpen());
  };
  store.subscribe(sync);
  new MutationObserver(sync).observe(panel.root, { attributes: true, attributeFilter: ['hidden'] });
  sync();
  return panel;
}
