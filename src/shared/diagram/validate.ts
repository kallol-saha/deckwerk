/**
 * Diagram checks for `slide-agent validate`: what draw.io would load but
 * draw wrongly, or what an agent most often gets wrong writing cells by hand.
 * Warnings, reported per cell with its draw.io id; the deck still loads.
 */

import type { Deck, DiagramEl, Slide } from '../deck.js';
import { isKnownMarker, isKnownShape } from './paint.js';
import { EDGE_SHAPES } from './shapes/index.js';
import { getStyleValue, resolveStyle } from './style.js';

export type DiagramProblemKind =
  | 'dangling-connector'
  | 'duplicate-cell'
  | 'missing-parent'
  | 'unknown-shape'
  | 'unknown-arrow'
  | 'rotation-mismatch'
  | 'outside-slide';

export interface DiagramProblem {
  slideId: string;
  diagram: string;
  cell: string;
  elementId: string;
  kind: DiagramProblemKind;
  message: string;
}

function rotatedBox(el: DiagramEl): { x: number; y: number; w: number; h: number } {
  const rot = ((el.rot % 360) + 360) % 360;
  if (el.type !== 'vertex' || rot === 0) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const a = (rot * Math.PI) / 180;
  const w = Math.abs(el.w * Math.cos(a)) + Math.abs(el.h * Math.sin(a));
  const h = Math.abs(el.w * Math.sin(a)) + Math.abs(el.h * Math.cos(a));
  return { x: el.x + el.w / 2 - w / 2, y: el.y + el.h / 2 - h / 2, w, h };
}

/** Every problem with the diagram cells of one slide. */
export function slideDiagramProblems(slide: Slide, canvas: { w: number; h: number }): DiagramProblem[] {
  const out: DiagramProblem[] = [];
  const cells = slide.elements.filter((el): el is DiagramEl => el.type === 'vertex' || el.type === 'connector');
  if (cells.length === 0) return out;
  const byElement = new Map(slide.elements.map((el) => [el.id, el]));
  const add = (el: DiagramEl, kind: DiagramProblemKind, message: string) =>
    out.push({ slideId: slide.id, diagram: el.diagram, cell: el.cell, elementId: el.id, kind, message });

  // Cell ids per diagram: cells, edge-label cells, layers and the root.
  const ids = new Map<string, Map<string, string>>();
  const known = (diagram: string) => {
    let m = ids.get(diagram);
    if (!m) {
      m = new Map();
      const meta = slide.diagrams?.[diagram];
      m.set(meta?.root ?? '0', 'root');
      for (const layer of meta?.layers ?? [{ cell: '1' }]) m.set(layer.cell, 'layer');
      ids.set(diagram, m);
    }
    return m;
  };
  for (const el of cells) {
    const m = known(el.diagram);
    const seen = m.get(el.cell);
    if (seen != null) {
      add(el, 'duplicate-cell', `Cell id ${el.cell} is used twice in ${el.diagram} (${seen === 'root' || seen === 'layer' ? `it is the ${seen}` : `also by ${seen}`}); draw.io ids must be unique.`);
    } else m.set(el.cell, el.id);
    if (el.type === 'connector') {
      for (const label of el.labels) {
        if (m.has(label.cell)) add(el, 'duplicate-cell', `Edge label cell ${label.cell} of ${el.cell} reuses an id in ${el.diagram}.`);
        else m.set(label.cell, el.id);
      }
    }
  }

  for (const el of cells) {
    const style = resolveStyle(el.dio, el.type === 'vertex' ? 'vertex' : 'edge');
    if (el.parent != null && !known(el.diagram).has(el.parent)) {
      add(el, 'missing-parent', `Parent ${el.parent} of ${el.cell} is not a cell or layer of ${el.diagram}; it is drawn on the first layer.`);
    }
    if (el.type === 'connector') {
      for (const [end, id, loose] of [['source', el.source, el.sourcePoint], ['target', el.target, el.targetPoint]] as const) {
        if (id == null) {
          if (loose == null) add(el, 'dangling-connector', `Connector ${el.cell} has no ${end}: neither a shape nor a ${end}Point.`);
          continue;
        }
        const end2 = byElement.get(id);
        if (!end2) add(el, 'dangling-connector', `Connector ${el.cell}'s ${end} ${id} does not exist on the slide.`);
        else if (end2.type !== 'vertex') add(el, 'dangling-connector', `Connector ${el.cell}'s ${end} ${id} is a ${end2.type}, not a diagram shape.`);
        else if (end2.diagram !== el.diagram) add(el, 'dangling-connector', `Connector ${el.cell}'s ${end} ${end2.cell} is in diagram ${end2.diagram}, not ${el.diagram}.`);
      }
      const shape = style.shape ?? 'connector';
      if (!EDGE_SHAPES.includes(shape) && !isKnownShape(shape)) {
        add(el, 'unknown-shape', `Connector ${el.cell} has shape=${shape}, which DeckWerk does not draw (it paints as a line).`);
      }
      for (const key of ['startArrow', 'endArrow']) {
        const marker = style[key];
        if (marker != null && marker !== 'none' && marker !== '' && !isKnownMarker(marker)) {
          add(el, 'unknown-arrow', `Connector ${el.cell} has ${key}=${marker}, which is not an arrowhead DeckWerk draws.`);
        }
      }
    } else {
      const shape = style.shape;
      if (shape && shape !== 'label' && !isKnownShape(shape)) {
        add(el, 'unknown-shape', `Shape ${el.cell} has shape=${shape}, which is neither a shape class nor a stencil (it paints as a rectangle).`);
      }
      const written = Number(getStyleValue(el.dio, 'rotation') ?? 0) || 0;
      const norm = (d: number) => ((d % 360) + 360) % 360;
      if (Math.abs(norm(written) - norm(el.rot)) > 0.01) {
        add(el, 'rotation-mismatch', `Shape ${el.cell} is turned ${el.rot}° but its style says rotation=${written}; set both (diagram style --set rotation=… keeps them together).`);
      }
    }
    if (!el.hidden && !el.concealed) {
      const box = rotatedBox(el);
      const beyond: string[] = [];
      if (box.x < -0.5) beyond.push(`left ${Math.round(-box.x)}px`);
      if (box.y < -0.5) beyond.push(`top ${Math.round(-box.y)}px`);
      if (box.x + box.w > canvas.w + 0.5) beyond.push(`right ${Math.round(box.x + box.w - canvas.w)}px`);
      if (box.y + box.h > canvas.h + 0.5) beyond.push(`bottom ${Math.round(box.y + box.h - canvas.h)}px`);
      if (beyond.length > 0) add(el, 'outside-slide', `${el.type === 'vertex' ? 'Shape' : 'Connector'} ${el.cell} reaches past the slide (${beyond.join(', ')}).`);
    }
  }
  return out;
}

/** Every diagram problem in the deck. */
export function diagramProblems(deck: Pick<Deck, 'slides' | 'canvas'>): DiagramProblem[] {
  return deck.slides.flatMap((slide) => slideDiagramProblems(slide, deck.canvas));
}
