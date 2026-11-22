import { DiagramMetaSchema, type ConnectorEl, type DiagramEl, type DiagramMeta, type Slide, type SlideElement, type VertexEl } from '../deck.js';
import type { MeasuredNode } from '../htmlSlides.js';
import { connectorMarkup, vertexMarkup } from './element.js';

/**
 * The slide's diagram records (`slide.diagrams`: page name and id, layers,
 * origin, scale, model attributes, animation) ride on the section as
 * `data-diagrams` (URI-encoded JSON), so a page round-trips them and a
 * section copied elsewhere keeps its layers.
 */
export function diagramRecordsAttr(slide: Pick<Slide, 'diagrams'>): string {
  const records = slide.diagrams;
  if (!records || Object.keys(records).length === 0) return '';
  return ` data-diagrams="${escapeAttr(encodeURIComponent(JSON.stringify(records)))}"`;
}

/** The records a section's `data-diagrams` states, as slide properties; unreadable ones are dropped. */
export function diagramRecordsFromSection(encoded: string | undefined, _elements: readonly SlideElement[]): { diagrams?: Record<string, DiagramMeta> } {
  if (!encoded) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, DiagramMeta> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const meta = DiagramMetaSchema.safeParse(value);
      if (meta.success) out[id] = meta.data;
    }
    return Object.keys(out).length > 0 ? { diagrams: out } : {};
  } catch {
    return {};
  }
}

/** The previous slide's records for the diagrams `elements` still have cells in, or null. */
export function keptDiagramRecords(previous: Pick<Slide, 'diagrams'>, elements: readonly SlideElement[]): Record<string, DiagramMeta> | null {
  if (!previous.diagrams) return null;
  const used = new Set(elements.flatMap((el) => (el.type === 'vertex' || el.type === 'connector' ? [el.diagram] : [])));
  const kept = Object.fromEntries(Object.entries(previous.diagrams).filter(([id]) => used.has(id)));
  return Object.keys(kept).length > 0 ? structuredClone(kept) : null;
}

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
