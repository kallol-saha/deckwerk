/**
 * What drawing one diagram cell needs from the rest of its slide: the
 * page's math="1" and shadow="1", and the custom properties of its
 * ancestors and its page for `%name%` placeholders. vertexMarkup and
 * connectorMarkup draw a single element; every surface that draws a slide
 * (render.ts for the player, editor, thumbnails and PDF; figure export)
 * asks here for the options, so they all draw a cell the same way.
 *
 * Placeholders follow draw.io (jgraph/drawio 32.7.4, Apache-2.0),
 * Graph.replacePlaceholders and getPlaceholderCell: a name the cell does not
 * have is looked up in its parent, the parent's parent, … the layer and the
 * root cell, whose `<object>` holds the page's properties. `%page%` is the
 * page name.
 */

import type { ConnectorEl, DiagramMeta, Slide, SlideElement, VertexEl } from '../deck.js';
import { displayLabel, type CellMarkupOptions, type PlaceholderLookup } from './element.js';
import { DiagramTree } from './structure.js';
import { tablePaint, type TablePaint } from './table.js';

/** A slide, or as much of one as drawing its cells needs (a page record may be partial). */
export interface DiagramSlide {
  elements: readonly SlideElement[];
  diagrams?: Readonly<Record<string, Readonly<Partial<DiagramMeta>>>> | null;
}

type Cell = VertexEl | ConnectorEl;

const indexes = new WeakMap<readonly SlideElement[], Map<string, Cell>>();

function cellIndex(elements: readonly SlideElement[]): Map<string, Cell> {
  let index = indexes.get(elements);
  if (!index) {
    index = new Map();
    for (const el of elements) {
      if (el.type === 'vertex' || el.type === 'connector') index.set(`${el.diagram}\u0000${el.cell}`, el);
    }
    indexes.set(elements, index);
  }
  return index;
}

function own(attrs: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  return attrs && Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : undefined;
}

/**
 * `%name%` from the ancestors of a cell whose parent is `parent`, then the
 * page (getPlaceholderCell above the cell itself, then the global `page`).
 */
export function ancestorPlaceholders(slide: DiagramSlide, diagram: string, parent: string | null): PlaceholderLookup {
  const meta: Readonly<Partial<DiagramMeta>> | undefined = slide.diagrams?.[diagram];
  const index = cellIndex(slide.elements);
  return (name) => {
    let current = parent;
    for (let guard = 0; current != null && guard < 1000; guard++) {
      const cell = index.get(`${diagram}\u0000${current}`);
      if (cell) {
        const value = own(cell.object?.attrs, name);
        if (value !== undefined) return value;
        current = cell.parent;
        continue;
      }
      const layer = meta?.layers?.find((l) => l.cell === current);
      if (layer) {
        const value = own(layer.object?.attrs, name);
        if (value !== undefined) return value;
        current = meta?.root ?? '0';
        continue;
      }
      if (current === (meta?.root ?? '0')) {
        const value = own(meta?.rootObject?.attrs, name);
        if (value !== undefined) return value;
      }
      break;
    }
    if (name === 'page' && meta?.name != null) return meta.name;
    return undefined;
  };
}

/** The options to draw `el` with, from its slide. */
export function cellMarkupOptions(slide: DiagramSlide | null | undefined, el: Cell): CellMarkupOptions {
  if (!slide) return {};
  const model = slide.diagrams?.[el.diagram]?.model;
  return {
    pageShadow: model?.shadow === '1',
    math: model?.math === '1',
    placeholders: usesPlaceholders(el) ? ancestorPlaceholders(slide, el.diagram, el.parent) : null,
    table: tableContext(slide, el),
  };
}

const trees = new WeakMap<readonly SlideElement[], DiagramTree>();

/**
 * Inherited colours and table lines (table.ts tablePaint) for a vertex
 * inside another vertex, or a table.
 */
function tableContext(slide: DiagramSlide, el: Cell): TablePaint | null {
  if (el.type !== 'vertex') return null;
  const inside = el.parent != null && cellIndex(slide.elements).get(`${el.diagram}\u0000${el.parent}`)?.type === 'vertex';
  if (!inside && !/(?:^|;)\s*(?:shape=)?table(?:;|$)/.test(el.dio)) return null;
  let tree = trees.get(slide.elements);
  const like = slide as unknown as Pick<Slide, 'elements' | 'diagrams'>;
  if (!tree) {
    tree = new DiagramTree(like);
    trees.set(slide.elements, tree);
  }
  return tablePaint(like, el, tree);
}

function usesPlaceholders(el: Cell): boolean {
  const on = (o: Cell['object'] | undefined, label: string) => o?.attrs.placeholders === '1' && label.includes('%');
  if (on(el.object, el.label)) return true;
  return el.type === 'connector' && el.labels.some((l) => on(l.object, l.label));
}

/** Whether any diagram on the slide typesets math. */
export function slideHasMath(slide: DiagramSlide): boolean {
  return Object.values(slide.diagrams ?? {}).some((meta) => meta.model?.math === '1');
}

/** The labels `el` shows, placeholders filled from its slide. */
function shownLabels(slide: DiagramSlide, el: Cell): string {
  const lookup = ancestorPlaceholders(slide, el.diagram, el.parent);
  let shown = displayLabel(el, lookup);
  if (el.type === 'connector') {
    for (const label of el.labels) {
      shown += `\u0000${displayLabel({ ...label, object: label.object ?? null }, (n) => own(el.object?.attrs, n) ?? lookup(n))}`;
    }
  }
  return shown;
}

/**
 * A key that changes when something cells are drawn with from outside
 * themselves changes: the pages' math and shadow, and every label a
 * placeholder fills from an ancestor or the page. A view that redraws only
 * the cells that changed redraws all of them when this key changes
 * (render.ts, diagramRedraws).
 */
export function diagramContextKey(slide: DiagramSlide): string {
  const diagrams = slide.diagrams ?? {};
  let key = Object.keys(diagrams)
    .map((id) => `${id}:${diagrams[id].model?.math === '1' ? 1 : 0}${diagrams[id].model?.shadow === '1' ? 1 : 0}`)
    .join(',');
  for (const el of slide.elements) {
    if ((el.type === 'vertex' || el.type === 'connector') && usesPlaceholders(el)) {
      key += `|${el.id}=${shownLabels(slide, el)}`;
    }
  }
  return key;
}

/**
 * Whether `el` (the same on both) draws differently on `slide` than on
 * `previous` because of its surroundings: its page's math was switched, or
 * a placeholder in its label takes another value from an ancestor or the
 * page. A view that redraws only the cells that changed themselves redraws
 * these too (render.ts, diagramRedraws).
 */
export function cellContextChanged(slide: DiagramSlide, previous: DiagramSlide, el: Cell): boolean {
  const math = (s: DiagramSlide) => s.diagrams?.[el.diagram]?.model?.math === '1';
  if (math(slide) !== math(previous)) return true;
  if (!usesPlaceholders(el)) return false;
  const before = previous.elements.find((e) => e.id === el.id);
  if (!before || (before.type !== 'vertex' && before.type !== 'connector')) return false;
  return shownLabels(slide, el) !== shownLabels(previous, before);
}
