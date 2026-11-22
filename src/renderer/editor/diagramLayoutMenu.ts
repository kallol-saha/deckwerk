/**
 * Arrange → Layout in the diagram Format panel: draw.io's layout entries
 * (Horizontal Flow, Vertical Flow, Horizontal Tree, Vertical Tree, Radial
 * Tree, Organic, Circle), each one undo step. The layout runs in
 * shared/diagram/layout.ts (ELK, mxCircleLayout), the same code as
 * `slide-agent diagram layout`.
 *
 * What it lays out, as draw.io's Arrange → Layout: with several shapes
 * selected, those shapes (and the connectors among them); with one
 * container or group selected, its children; otherwise the whole diagram
 * the selection belongs to.
 */

import { isDiagramElement, type DiagramEl, type SlideElement } from '@shared/deck.js';
import { LAYOUT_PRESETS, layoutDiagram, type LayoutOptions } from '@shared/diagram/layout.js';
import { DiagramTree } from '@shared/diagram/structure.js';
import type { DiagramExtrasDeps } from './diagramExtras.js';
import { formatControls, registerDiagramPanelSection } from './diagramFormat.js';
import type { EditorStore } from './store.js';

/** What a layout entry applies to for the current selection. */
export function layoutScopeFor(slide: { elements: SlideElement[]; diagrams?: Record<string, unknown> }, selected: readonly DiagramEl[]): Pick<LayoutOptions, 'cells' | 'parent' | 'diagramId'> {
  const vertices = selected.filter((el) => el.type === 'vertex');
  const diagramId = selected[0]?.diagram;
  if (vertices.length >= 2) return { cells: vertices.map((el) => el.id), diagramId };
  if (vertices.length === 1) {
    const tree = new DiagramTree(slide as never);
    if (tree.children(vertices[0]).some((c) => c.type === 'vertex')) return { parent: vertices[0].cell, diagramId };
  }
  return { diagramId };
}

let running = false;

export async function runLayout(store: EditorStore, presetId: string, setStatus?: (text: string) => void): Promise<void> {
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!preset || running) return;
  const { deck, slideIndex, selection } = store.get();
  const slide = deck.slides[slideIndex];
  if (!slide) return;
  const selected = slide.elements.filter((el): el is DiagramEl => selection.has(el.id) && isDiagramElement(el));
  running = true;
  try {
    const result = await layoutDiagram(slide, {
      algorithm: preset.algorithm,
      ...(preset.direction ? { direction: preset.direction } : {}),
      ...layoutScopeFor(slide, selected),
    });
    if (result.elements.length === 0) {
      setStatus?.('Nothing to lay out.');
      return;
    }
    const byId = new Map<string, SlideElement>(result.elements.map((el) => [el.id, el]));
    const slideId = slide.id;
    store.commit((next) => {
      const target = next.slides.find((s) => s.id === slideId);
      if (!target) return;
      target.elements = target.elements.map((el) => byId.get(el.id) ?? el);
    }, { label: `Layout: ${preset.title}` });
  } catch (error) {
    setStatus?.(`Layout failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    running = false;
  }
}

let installed = false;

export function installDiagramLayout(deps: DiagramExtrasDeps): void {
  if (installed) return;
  installed = true;
  registerDiagramPanelSection('arrange', (store, cells) => {
    if (cells.length === 0) return null;
    const { root, body } = formatControls.section('Layout', 'layout', true);
    const grid = document.createElement('div');
    grid.className = 'dfmt-button-grid';
    for (const preset of LAYOUT_PRESETS) {
      grid.appendChild(formatControls.button(preset.title, () => {
        void runLayout(store, preset.id, deps.setStatusMessage);
      }, `Layout: ${preset.title}`, `layout-${preset.id}`));
    }
    body.appendChild(grid);
    return root;
  });
}
