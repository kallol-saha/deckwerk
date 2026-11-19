/**
 * Mathematical Typesetting (draw.io's Extras ▸ Mathematical Typesetting, the
 * Diagram tab's Options): the page's math="1", which typesets TeX in its
 * labels (src/shared/diagram/mathLabel.ts). DeckWerk's format panel has no
 * Diagram tab, so the switch sits in the Text tab, for the diagrams of the
 * selected cells; it is one undoable change.
 */

import type { DiagramEl } from '@shared/deck.js';
import { ensureDiagramMeta } from '@shared/diagram/structure.js';
import type { DiagramExtrasDeps } from './diagramExtras.js';
import { formatControls, registerDiagramPanelSection } from './diagramFormat.js';
import type { EditorStore } from './store.js';

/** Turns math on or off for the given diagrams of the current slide. */
export function setDiagramMath(store: EditorStore, diagrams: readonly string[], on: boolean): void {
  const { slideIndex } = store.get();
  store.commit((deck) => {
    const slide = deck.slides[slideIndex];
    if (!slide) return;
    for (const id of diagrams) {
      const meta = ensureDiagramMeta(slide, id);
      meta.model = { ...meta.model, math: on ? '1' : '0' };
    }
  }, { label: on ? 'Mathematical typesetting on' : 'Mathematical typesetting off' });
}

function mathSection(store: EditorStore, cells: DiagramEl[]): HTMLElement | null {
  const slide = store.slide;
  if (!slide || cells.length === 0) return null;
  const diagrams = [...new Set(cells.map((c) => c.diagram))];
  const on = diagrams.every((id) => slide.diagrams?.[id]?.model?.math === '1');
  const { root, body } = formatControls.section('Diagram', 'diagram-options');
  const box = formatControls.checkbox('Mathematical Typesetting', on, (checked) => setDiagramMath(store, diagrams, checked), 'math');
  box.title = 'Typeset LaTeX in labels: $$…$$ or \\[…\\] for display, \\(…\\) inline';
  body.appendChild(box);
  return root;
}

export function installDiagramMath(_deps: DiagramExtrasDeps): void {
  registerDiagramPanelSection('text', mathSection);
}
