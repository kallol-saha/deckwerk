import type { ConnectorEl, DiagramEl, VertexEl } from '../deck.js';
import type { MeasuredNode } from '../htmlSlides.js';
import { connectorMarkup, vertexMarkup } from './element.js';

/**
 * draw.io cells in the HTML authoring format, both ways.
 *
 *   <div data-element="vertex" data-dio="rounded=1;fillColor=#dae8fc;…"
 *        data-label="Encoder" data-cell="n3" data-diagram-cell="…" style="left:…">
 *     …the drawing, data-element="none"…
 *   </div>
 *
 * `data-dio` is the draw.io style string and `data-label` the label, so an
 * agent restyles a shape in draw.io's vocabulary right in the page; a
 * vertex's box is its CSS geometry like any element's. A connector's box is
 * its route's bounds and is recomputed, so moving one in CSS does nothing:
 * change its ends or waypoints (`slide-agent diagram export/apply` is the
 * better tool for structure). Everything else rides along in
 * `data-diagram-cell` (URI-encoded JSON) and comes back unchanged.
 */

const BASE_KEYS = new Set([
  'id', 'x', 'y', 'w', 'h', 'rot', 'flipX', 'flipY', 'z', 'opacity', 'class', 'style',
  'morphId', 'lineageId', 'layoutMasterId', 'comments', 'type', 'dio', 'label',
]);

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellFields(element: DiagramEl): Record<string, unknown> {
  return Object.fromEntries(Object.entries(element).filter(([key]) => !BASE_KEYS.has(key)));
}

export function diagramElementToHtml(element: DiagramEl, attrs: string, styleAttr: string): string {
  const markup = element.type === 'vertex' ? vertexMarkup(element) : connectorMarkup(element);
  return `  <div ${attrs} data-element="${element.type}"`
    + ` data-dio="${escapeAttr(element.dio)}"`
    + ` data-label="${escapeAttr(element.label)}"`
    + ` data-cell="${escapeAttr(element.cell)}"`
    + ` data-diagram-cell="${escapeAttr(encodeURIComponent(JSON.stringify(cellFields(element))))}"`
    + ` ${styleAttr}>`
    + markup.replace(/^<svg/, '<svg data-element="none"')
    + '</div>';
}

type Base = Omit<VertexEl, 'type' | 'dio' | 'label' | 'cell' | 'diagram' | 'parent' | 'scale' | 'origin'>;

export function diagramElementFromNode(node: MeasuredNode, base: Base, type: 'vertex' | 'connector'): DiagramEl {
  let fields: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(node.dataset.diagramCell ?? ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fields = parsed as Record<string, unknown>;
  } catch {
    fields = {};
  }
  const common = {
    ...base,
    style: {},
    ...fields,
    dio: node.dataset.dio ?? '',
    label: node.dataset.label ?? '',
    cell: node.dataset.cell || (typeof fields.cell === 'string' ? fields.cell : base.id),
  };
  if (type === 'vertex') return { ...common, type: 'vertex' } as VertexEl;
  return { ...common, type: 'connector' } as ConnectorEl;
}
