/**
 * New draw.io cells on a slide. The shape library, the editor's connect
 * gestures, paste and agent operations all make cells here, so a new cell
 * joins a diagram the way draw.io adds one to its model: a fresh cell id,
 * the diagram's view scale and origin, the default layer as parent unless a
 * container is given, and a connector routed against what it joins.
 *
 * Everything works on a slide's elements in slide pixels. Sizes given in
 * draw.io units (`unitW`/`unitH`) are multiplied by the diagram's scale, so a
 * library shape lands the size draw.io would draw it at that zoom.
 */

import type { ConnectorEl, DiagramMeta, Slide, SlideElement, VertexEl } from '../deck.js';
import { rerouted } from './element.js';
import { getStyleValue } from './style.js';
import type { Point } from './types.js';

export const DEFAULT_DIAGRAM_ID = 'diagram-1';

/** draw.io's style for a connector drawn from a shape's hover arrows or ports. */
export const DEFAULT_EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;';

/** draw.io's style for a new text-less rectangle (Sidebar "Rectangle"). */
export const DEFAULT_VERTEX_STYLE = 'rounded=0;whiteSpace=wrap;html=1;';

/**
 * draw.io's view scale for a diagram started on a slide. draw.io's units are
 * sized for a screen at 100% (12px text, 120×60 boxes); a 1920px slide is
 * shown and projected at about half its size, so a new diagram is drawn at
 * scale 2 there, which looks like draw.io at 100%. Its `.drawio` export is
 * still in draw.io's own units.
 */
export const NEW_DIAGRAM_SCALE = 2;

/** A diagram record for a slide that has none: page origin at the slide's corner, scale NEW_DIAGRAM_SCALE. */
export function newDiagramMeta(name = 'Page-1', scale = NEW_DIAGRAM_SCALE): DiagramMeta {
  return {
    name,
    model: {},
    root: '0',
    layers: [{ cell: '1', label: '', dio: '' }],
    origin: { x: 0, y: 0 },
    scale,
  };
}

function isCell(el: SlideElement): el is VertexEl | ConnectorEl {
  return el.type === 'vertex' || el.type === 'connector';
}

/**
 * Which diagram on `slide` new cells join: `preferred` when the slide has
 * it, else the diagram of the first selected cell, else the slide's first
 * diagram, else a new one (`created`, whose record the caller stores in
 * `slide.diagrams`).
 */
export function targetDiagram(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  options: { preferred?: string | null; selection?: Iterable<string> } = {},
): { id: string; meta: DiagramMeta; created: boolean } {
  const diagrams = slide.diagrams ?? {};
  if (options.preferred && diagrams[options.preferred]) {
    return { id: options.preferred, meta: diagrams[options.preferred], created: false };
  }
  if (options.selection) {
    const selected = new Set(options.selection);
    const cell = slide.elements.find((el) => selected.has(el.id) && isCell(el)) as VertexEl | ConnectorEl | undefined;
    if (cell && diagrams[cell.diagram]) return { id: cell.diagram, meta: diagrams[cell.diagram], created: false };
  }
  const first = Object.keys(diagrams)[0];
  if (first) return { id: first, meta: diagrams[first], created: false };
  // Cells without a record (made before the slide kept one) still name a diagram.
  const orphan = slide.elements.find(isCell);
  if (orphan) {
    return {
      id: orphan.diagram,
      meta: { ...newDiagramMeta(), origin: { ...orphan.origin }, scale: orphan.scale },
      created: true,
    };
  }
  return { id: preferredOrDefault(options.preferred), meta: newDiagramMeta(), created: true };
}

function preferredOrDefault(id: string | null | undefined): string {
  return id && id.trim() ? id : DEFAULT_DIAGRAM_ID;
}

/** Every cell id in use in one diagram on the slide (layers, root and edge labels included). */
export function usedCellIds(slide: Pick<Slide, 'elements' | 'diagrams'>, diagramId: string): Set<string> {
  const used = new Set<string>();
  const meta = slide.diagrams?.[diagramId];
  used.add(meta?.root ?? '0');
  for (const layer of meta?.layers ?? [{ cell: '1' }]) used.add(layer.cell);
  for (const el of slide.elements) {
    if (!isCell(el) || el.diagram !== diagramId) continue;
    used.add(el.cell);
    if (el.type === 'connector') for (const label of el.labels) used.add(label.cell);
  }
  return used;
}

/**
 * A cell id free in `used` (which it joins): `prefix` followed by the
 * smallest number not taken, e.g. `c7`.
 */
export function freshCellId(used: Set<string>, prefix = 'c'): string {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  const id = `${prefix}${n}`;
  used.add(id);
  return id;
}

/**
 * The layer new cells go on: `layer` when the diagram has it (the editor's
 * current layer, draw.io's default parent), else the first visible layer,
 * else the first.
 */
export function defaultLayer(meta: DiagramMeta, layer?: string | null): string {
  if (layer != null && meta.layers.some((l) => l.cell === layer)) return layer;
  const preferred = layerPreference?.(meta);
  if (preferred != null && meta.layers.some((l) => l.cell === preferred)) return preferred;
  return (meta.layers.find((l) => !l.hidden) ?? meta.layers[0])?.cell ?? '1';
}

/**
 * The editor's current layer (draw.io's default parent), consulted when a
 * caller names no layer: the editor registers it once, so every way of making
 * cells (the shape library, the connect gestures, paste) lands on the layer
 * the Layers panel has chosen. The CLI and the server register nothing.
 */
let layerPreference: ((meta: DiagramMeta) => string | null | undefined) | null = null;

export function setLayerPreference(preference: ((meta: DiagramMeta) => string | null | undefined) | null): void {
  layerPreference = preference;
}

function topZ(elements: readonly SlideElement[]): number {
  return elements.reduce((max, el) => Math.max(max, el.z), -1) + 1;
}

export interface VertexSpec {
  dio: string;
  label?: string;
  /** Box in slide pixels. Give `w`/`h`, or `unitW`/`unitH` in draw.io units. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  unitW?: number;
  unitH?: number;
  /** Draw.io parent cell (a container's or group's `cell`); default: the diagram's layer. */
  parent?: string | null;
  /** The layer to use when `parent` is not given (the editor's current layer); see defaultLayer. */
  layer?: string | null;
  diagramId?: string;
  cell?: string;
  z?: number;
}

/**
 * A new vertex for `slide`. When the slide has no diagram yet, `meta` is the
 * record to store under `slide.diagrams[diagramId]`.
 */
export function newVertex(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  spec: VertexSpec,
  makeId: (prefix: string) => string,
  used?: Set<string>,
): { element: VertexEl; diagramId: string; meta: DiagramMeta | null } {
  const target = targetDiagram(slide, { preferred: spec.diagramId });
  const { meta } = target;
  const ids = used ?? usedCellIds(slide, target.id);
  const cell = spec.cell && !ids.has(spec.cell) ? spec.cell : freshCellId(ids);
  ids.add(cell);
  const w = spec.w ?? (spec.unitW ?? 120) * meta.scale;
  const h = spec.h ?? (spec.unitH ?? 60) * meta.scale;
  const rotation = Number(getStyleValue(spec.dio, 'rotation') ?? 0) || 0;
  const element: VertexEl = {
    id: makeId('vertex'),
    type: 'vertex',
    x: spec.x,
    y: spec.y,
    w: Math.max(1, w),
    h: Math.max(1, h),
    rot: rotation,
    z: spec.z ?? topZ(slide.elements),
    opacity: 1,
    class: [],
    style: {},
    dio: spec.dio,
    label: spec.label ?? '',
    cell,
    diagram: target.id,
    parent: spec.parent ?? defaultLayer(meta, spec.layer),
    scale: meta.scale,
    origin: { ...meta.origin },
  };
  return { element, diagramId: target.id, meta: target.created ? meta : null };
}

export interface ConnectorSpec {
  dio?: string;
  label?: string;
  /** Element ids of the vertices joined; null or absent for a loose end. */
  source?: string | null;
  target?: string | null;
  /** Loose ends, slide pixels. */
  sourcePoint?: Point | null;
  targetPoint?: Point | null;
  points?: Point[];
  parent?: string | null;
  /** The layer to use when neither `parent` nor the ends give one (the editor's current layer). */
  layer?: string | null;
  diagramId?: string;
  cell?: string;
  z?: number;
}

/**
 * A new connector for `slide`, routed against the vertices it joins (which
 * must already be among `slide.elements`, or in `extra`).
 */
export function newConnector(
  slide: Pick<Slide, 'elements' | 'diagrams'>,
  spec: ConnectorSpec,
  makeId: (prefix: string) => string,
  options: { used?: Set<string>; extra?: readonly SlideElement[] } = {},
): { element: ConnectorEl; diagramId: string; meta: DiagramMeta | null } {
  const all = [...slide.elements, ...(options.extra ?? [])];
  const end = (id: string | null | undefined) => all.find((el) => el.id === id && el.type === 'vertex') as VertexEl | undefined;
  const sourceEl = end(spec.source);
  const targetEl = end(spec.target);
  const target = targetDiagram(slide, { preferred: spec.diagramId ?? sourceEl?.diagram ?? targetEl?.diagram });
  const { meta } = target;
  const ids = options.used ?? usedCellIds(slide, target.id);
  const cell = spec.cell && !ids.has(spec.cell) ? spec.cell : freshCellId(ids);
  ids.add(cell);
  const draft: ConnectorEl = {
    id: makeId('connector'),
    type: 'connector',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    z: spec.z ?? topZ(all),
    opacity: 1,
    class: [],
    style: {},
    dio: spec.dio ?? DEFAULT_EDGE_STYLE,
    label: spec.label ?? '',
    cell,
    diagram: target.id,
    parent: spec.parent ?? commonParent(sourceEl, targetEl) ?? defaultLayer(meta, spec.layer),
    scale: meta.scale,
    origin: { ...meta.origin },
    source: sourceEl ? sourceEl.id : null,
    target: targetEl ? targetEl.id : null,
    points: (spec.points ?? []).map((p) => ({ ...p })),
    sourcePoint: sourceEl ? null : spec.sourcePoint ? { ...spec.sourcePoint } : null,
    targetPoint: targetEl ? null : spec.targetPoint ? { ...spec.targetPoint } : null,
    labels: [],
    route: [],
  };
  const vertices = new Map(all.filter((el): el is VertexEl => el.type === 'vertex').map((el) => [el.id, el]));
  const element = rerouted(draft, (id) => vertices.get(id));
  return { element, diagramId: target.id, meta: target.created ? meta : null };
}

/**
 * draw.io puts a new edge in the nearest common ancestor of its terminals
 * that is not one of them; with no terminals or no common container, the
 * layer (returned as null so the caller picks the default layer).
 */
function commonParent(a: VertexEl | undefined, b: VertexEl | undefined): string | null {
  if (!a || !b) return (a ?? b)?.parent ?? null;
  return a.parent === b.parent ? a.parent : null;
}

/**
 * Put new cells on a slide (mutating it, as inside a store commit): appended
 * in paint order, with the diagram record stored when it was created.
 */
export function addCells(
  slide: Slide,
  cells: Array<{ element: VertexEl | ConnectorEl; diagramId: string; meta: DiagramMeta | null }>,
): void {
  for (const { element, diagramId, meta } of cells) {
    if (meta && !slide.diagrams?.[diagramId]) slide.diagrams = { ...(slide.diagrams ?? {}), [diagramId]: meta };
    slide.elements.push(element);
  }
}
