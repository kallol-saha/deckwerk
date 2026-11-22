/**
 * What `slide-agent diagram style` and `diagram add` do, DOM-free: patch
 * draw.io style keys on cells the way draw.io's Format panel does (the keys
 * it sets along with the one asked for, from format.ts), and build cells
 * from a compact spec — a line of `key=value` pairs or JSON — so an agent
 * makes a diagram without writing XML.
 */

import type { ConnectorEl, DiagramEl, DiagramMeta, Slide, VertexEl } from '../deck.js';
import * as F from './format.js';
import { DEFAULT_EDGE_STYLE, DEFAULT_VERTEX_STYLE, addCells, newConnector, newDiagramMeta, newVertex, targetDiagram, usedCellIds } from './insert.js';
import { libraryItem, libraryItems, placeItem, searchLibrary, type LibraryItem } from './library/index.js';
import { isKnownMarker, isKnownShape } from './paint.js';
import { EDGE_SHAPES as EDGE_SHAPE_NAMES } from './shapes/index.js';
import { getStyleValue, parseStyleString, resolveStyle, setStyleValue } from './style.js';
import type { Point } from './types.js';

// --- finding cells --------------------------------------------------------------------

/** The cells named by draw.io cell id or element id; `*` or `all` names every cell of the diagram. */
export function findCells(slide: Pick<Slide, 'elements' | 'diagrams'>, refs: readonly string[], diagramId?: string): DiagramEl[] {
  const cells = slide.elements.filter((el): el is DiagramEl => el.type === 'vertex' || el.type === 'connector');
  const inDiagram = diagramId ? cells.filter((el) => el.diagram === diagramId) : cells;
  const out: DiagramEl[] = [];
  for (const ref of refs) {
    if (ref === '*' || ref === 'all') {
      const scope = diagramId ? inDiagram : cells.filter((el) => el.diagram === (Object.keys(slide.diagrams ?? {})[0] ?? cells[0]?.diagram));
      for (const el of scope) if (!out.includes(el)) out.push(el);
      continue;
    }
    const byElement = cells.find((el) => el.id === ref);
    const byCell = inDiagram.filter((el) => el.cell === ref);
    const found = byElement ?? (byCell.length === 1 ? byCell[0] : undefined);
    if (!found) {
      if (byCell.length > 1) {
        throw new Error(`Cell ${ref} is in several diagrams (${byCell.map((el) => el.diagram).join(', ')}); name one with --diagram.`);
      }
      const known = inDiagram.map((el) => el.cell).slice(0, 40).join(', ');
      throw new Error(`No diagram cell ${ref} on this slide. Cells: ${known || 'none'}.`);
    }
    if (!out.includes(found)) out.push(found);
  }
  return out;
}

// --- style patches ----------------------------------------------------------------------

export type StylePatch = Array<[string, string | null]>;

/** `key=value;key=value` (or a bare key, which is set to 1) into a patch; `none` stays a value (draw.io's "remove"). */
export function parsePatch(text: string): StylePatch {
  const out: StylePatch = [];
  for (const entry of parseStyleString(text)) {
    if (entry.key == null) out.push([entry.value, '1']);
    else out.push([entry.key, entry.value]);
  }
  return out;
}

const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|none|default|inherit|swimlane|indicated|[a-z]+|rgba?\([^)]*\)|light-dark\([^)]*\))$/i;
const EDGE_STYLE_NAMES = ['orthogonalEdgeStyle', 'elbowEdgeStyle', 'entityRelationEdgeStyle', 'segmentEdgeStyle',
  'loopEdgeStyle', 'sideToSideEdgeStyle', 'topToBottomEdgeStyle', 'isometricEdgeStyle', 'none'];

/** Things in a patch draw.io would not understand (unknown shapes, arrowheads, colours, edge styles). */
export function patchWarnings(el: Pick<DiagramEl, 'type' | 'cell'>, patch: StylePatch): string[] {
  const warnings: string[] = [];
  for (const [key, value] of patch) {
    if (value == null || value === 'none') continue;
    if (/[;]/.test(value)) warnings.push(`${el.cell}: ${key} value "${value}" contains ";", which ends a style entry.`);
    if (key === 'shape') {
      const ok = el.type === 'connector' ? EDGE_SHAPE_NAMES.includes(value) || isKnownShape(value) : isKnownShape(value);
      if (!ok) warnings.push(`${el.cell}: shape=${value} is not a shape DeckWerk draws (it paints as a ${el.type === 'connector' ? 'line' : 'rectangle'}). See \`slide-agent docs diagrams\`.`);
    } else if (key === 'startArrow' || key === 'endArrow') {
      if (!isKnownMarker(value)) warnings.push(`${el.cell}: ${key}=${value} is not an arrowhead DeckWerk draws.`);
    } else if (key === 'edgeStyle') {
      if (!EDGE_STYLE_NAMES.includes(value)) warnings.push(`${el.cell}: edgeStyle=${value} is not one of ${EDGE_STYLE_NAMES.join(', ')}.`);
    } else if (/Color$/.test(key) && !COLOR_RE.test(value)) {
      warnings.push(`${el.cell}: ${key}=${value} is not a colour (#rrggbb, none or default).`);
    }
  }
  return warnings;
}

export interface RestyleOptions {
  /** Keep a connector's waypoints when its edgeStyle changes (draw.io clears them). */
  keepWaypoints?: boolean;
}

/**
 * Applies a patch to one cell (mutating it) with draw.io's dependent keys:
 * the keys draw.io's Format panel sets along with the one changed, unless
 * the patch sets them itself.
 *
 * - `rotation` (vertex): the element turns with it.
 * - `rounded` (vertex): `roundedPerimeter` follows; (connector) `rounded=1` sets `curved=0` and `curved=1` sets `rounded=0`.
 * - `edgeStyle` (connector): waypoints cleared, `curved`, `noEdgeStyle`, `innerLoopWaypoints` removed.
 * - `shape` (connector, a Connection-menu shape): the old shape's sizes and widths removed.
 * - `labelPosition`/`verticalLabelPosition`: `align`/`verticalAlign` set to match, `labelPerimeter` on vertices.
 * - `fontColor=none` hides the label (`noLabel=1`); a colour shows it again.
 * - `sketch=1`: draw.io's `curveFitting=1;jiggle=2`.
 * - `sourcePerimeterSpacing`/`targetPerimeterSpacing` (connector): `fixedPointSpacing=1`.
 * - `labelBackgroundColor`: `defaultLabelBackgroundColor` removed.
 * - `dashPattern`: `dashed=1`.
 * - `html=1`/`0`: the label is converted between plain text and HTML (draw.io's Formatted Text).
 */
export function restyleCell(el: DiagramEl, patch: StylePatch, options: RestyleOptions = {}): void {
  const explicit = new Set(patch.map(([key]) => key));
  const changes: Array<[string, string | number | null]> = [];
  const follow = (key: string, value: string | number | null) => {
    if (!explicit.has(key)) changes.push([key, value]);
  };
  const edge = el.type === 'connector';
  let html: boolean | null = null;
  for (const [key, value] of patch) {
    if (key === 'html') {
      html = value === '1' || value === 'true';
      continue;
    }
    // draw.io switches sketch off by removing the key.
    changes.push([key, key === 'sketch' && value !== '1' ? null : value]);
    if (key === 'rounded') {
      if (!edge) follow('roundedPerimeter', value === '1' ? '1' : null);
      else if (value === '1') follow('curved', '0');
    } else if (key === 'curved' && edge && value === '1') {
      follow('rounded', '0');
    } else if (key === 'edgeStyle' && edge) {
      if (!options.keepWaypoints) (el as ConnectorEl).points = [];
      follow('innerLoopWaypoints', null);
      follow('noEdgeStyle', null);
      follow('libavoidRouting', null);
      follow('curved', null);
    } else if (key === 'shape' && edge) {
      const choice = F.EDGE_SHAPES.find((s) => s.id === (value ?? 'connector'));
      if (choice) for (const [k, v] of F.edgeShapeChanges(choice)) if (k !== 'shape') follow(k, v);
    } else if (key === 'fontColor') {
      follow('noLabel', value === 'none' ? '1' : null);
    } else if (key === 'sketch') {
      const on = value === '1';
      follow('curveFitting', on ? '1' : null);
      follow('jiggle', on ? '2' : null);
    } else if ((key === 'sourcePerimeterSpacing' || key === 'targetPerimeterSpacing') && edge) {
      follow('fixedPointSpacing', '1');
    } else if (key === 'labelBackgroundColor') {
      follow('defaultLabelBackgroundColor', null);
    } else if (key === 'dashPattern' && value != null && value !== 'none') {
      follow('dashed', '1');
    }
  }
  if (explicit.has('labelPosition') || explicit.has('verticalLabelPosition')) {
    const current = F.cellStyle(el);
    const lp = patch.find(([k]) => k === 'labelPosition')?.[1] ?? current.labelPosition ?? 'center';
    const vlp = patch.find(([k]) => k === 'verticalLabelPosition')?.[1] ?? current.verticalLabelPosition ?? 'middle';
    const entry = (Object.entries(F.LABEL_POSITIONS) as Array<[F.LabelPosition, readonly string[]]>)
      .find(([, [a, b]]) => a === lp && b === vlp);
    if (entry) for (const [k, v] of F.labelPositionChanges(el, entry[0])) if (k !== 'labelPosition' && k !== 'verticalLabelPosition') follow(k, v);
  }
  F.applyStyleChanges(el, changes);
  if (html != null) F.setFormattedText(el, html);
}

// --- the compact spec -----------------------------------------------------------------------

/** `id=enc label="Encoder" style="rounded=1;…" x=100` → key/value pairs (double or single quotes, backslash escapes). */
export function parseSpecLine(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const s = text.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let key = '';
    while (i < s.length && s[i] !== '=' && !/\s/.test(s[i])) key += s[i++];
    if (s[i] !== '=') throw new Error(`Expected key=value in "${text}" near "${key}".`);
    i++;
    let value = '';
    const quote = s[i] === '"' || s[i] === "'" ? s[i] : null;
    if (quote) {
      i++;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && i + 1 < s.length) {
          const next = s[i + 1];
          value += next === 'n' ? '\n' : next;
          i += 2;
        } else value += s[i++];
      }
      if (s[i] !== quote) throw new Error(`Unclosed quote in "${text}".`);
      i++;
    } else {
      while (i < s.length && !/\s/.test(s[i])) value += s[i++];
    }
    out[key] = value;
  }
  return out;
}

export interface CellSpec {
  kind: 'vertex' | 'edge';
  id?: string;
  label?: string;
  style?: string;
  /** Draw.io units, relative to the diagram's origin. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** A library entry (`shape=library:Cylinder`): its title, id or a search. */
  library?: string;
  /** Draw.io parent cell (a group or container). */
  parent?: string;
  from?: string;
  to?: string;
  /** Waypoints, draw.io units. */
  points?: Point[];
}

const VERTEX_KEYS = ['id', 'label', 'style', 'x', 'y', 'w', 'h', 'width', 'height', 'shape', 'parent'];
const EDGE_KEYS = ['id', 'label', 'style', 'from', 'to', 'source', 'target', 'points', 'parent'];

function num(value: unknown, key: string): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number, not "${String(value)}".`);
  return n;
}

function pointsOf(value: unknown): Point[] | undefined {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) }));
  return String(value).trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`points are "x,y x,y …", not "${String(value)}".`);
    return { x, y };
  });
}

/** One spec from a line or a JSON object. */
export function cellSpec(kind: 'vertex' | 'edge', fields: Record<string, unknown>): CellSpec {
  const allowed = kind === 'vertex' ? VERTEX_KEYS : EDGE_KEYS;
  for (const key of Object.keys(fields)) {
    if (key === 'kind' || key === 'type') continue;
    if (!allowed.includes(key)) throw new Error(`Unknown ${kind} key "${key}". Known: ${allowed.join(', ')}.`);
  }
  const str = (k: string) => (fields[k] == null ? undefined : String(fields[k]));
  if (kind === 'vertex') {
    let style = str('style');
    let library: string | undefined;
    const shape = str('shape');
    if (shape?.startsWith('library:')) library = shape.slice('library:'.length);
    else if (shape) style = setStyleValue(style ?? DEFAULT_VERTEX_STYLE, 'shape', shape);
    return {
      kind, id: str('id'), label: str('label'), style, library, parent: str('parent'),
      x: num(fields.x, 'x'), y: num(fields.y, 'y'), w: num(fields.w ?? fields.width, 'w'), h: num(fields.h ?? fields.height, 'h'),
    };
  }
  return {
    kind, id: str('id'), label: str('label'), style: str('style'), parent: str('parent'),
    from: str('from') ?? str('source'), to: str('to') ?? str('target'), points: pointsOf(fields.points),
  };
}

/** `{vertices:[…], edges:[…]}`, `{cells:[…]}` or an array of cells with `kind` (vertex|edge). */
export function specsFromJson(data: unknown): CellSpec[] {
  const out: CellSpec[] = [];
  const kindOf = (c: Record<string, unknown>): 'vertex' | 'edge' => {
    const k = String(c.kind ?? c.type ?? (c.from != null || c.to != null || c.source != null ? 'edge' : 'vertex'));
    if (k === 'vertex' || k === 'shape' || k === 'node') return 'vertex';
    if (k === 'edge' || k === 'connector') return 'edge';
    throw new Error(`Unknown cell kind "${k}" (vertex or edge).`);
  };
  if (Array.isArray(data)) {
    for (const c of data) out.push(cellSpec(kindOf(c as Record<string, unknown>), c as Record<string, unknown>));
    return out;
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const c of (o.vertices ?? o.nodes ?? []) as Array<Record<string, unknown>>) out.push(cellSpec('vertex', c));
    for (const c of (o.edges ?? o.connectors ?? []) as Array<Record<string, unknown>>) out.push(cellSpec('edge', c));
    for (const c of (o.cells ?? []) as Array<Record<string, unknown>>) out.push(cellSpec(kindOf(c), c));
    return out;
  }
  throw new Error('A JSON spec is {"vertices": […], "edges": […]} or an array of cells.');
}

/** A library entry by id, exact title (any case) or the best search match. */
export function findLibraryItem(query: string): LibraryItem | undefined {
  const byId = libraryItem(query);
  if (byId) return byId;
  const q = query.trim().toLowerCase();
  const exact = libraryItems().find((item) => item.title.toLowerCase() === q);
  return exact ?? searchLibrary(query)[0];
}

function withHtml(style: string, kind: 'vertex' | 'edge'): string {
  let out = style;
  if (getStyleValue(out, 'html') == null) out = setStyleValue(out, 'html', '1');
  if (kind === 'vertex' && getStyleValue(out, 'whiteSpace') == null) out = setStyleValue(out, 'whiteSpace', 'wrap');
  return out;
}

export interface AddOptions {
  diagramId?: string;
  /** For a slide without a diagram yet: draw.io's view scale (default 2) and where its origin sits (slide px). */
  scale?: number;
  origin?: Point;
}

export interface AddResult {
  diagramId: string;
  /** The diagram record when the slide had none (to store on the slide). */
  meta: DiagramMeta | null;
  elements: Array<VertexEl | ConnectorEl>;
  /** What each spec became: its cell id, element id and kind. */
  added: Array<{ cell: string; element: string; kind: 'vertex' | 'connector'; library?: string }>;
  warnings: string[];
}

/**
 * New cells from specs, on a copy of `slide` (the slide itself is not
 * changed). Connectors may join cells added in the same call or cells
 * already there (by cell id or element id).
 */
export function addFromSpecs(slide: Pick<Slide, 'elements' | 'diagrams'>, specs: readonly CellSpec[], makeId: (prefix: string) => string, options: AddOptions = {}): AddResult {
  const work: Slide = { ...(slide as Slide), elements: [...slide.elements], diagrams: { ...(slide.diagrams ?? {}) } };
  const target = targetDiagram(work, { preferred: options.diagramId });
  let meta: DiagramMeta | null = null;
  if (target.created) {
    meta = { ...newDiagramMeta(), ...(options.scale ? { scale: options.scale } : {}), ...(options.origin ? { origin: { ...options.origin } } : {}) };
    work.diagrams = { ...work.diagrams, [target.id]: meta };
  }
  const diagramMeta = work.diagrams![target.id];
  const diagramId = target.id;
  const s = diagramMeta.scale;
  const o = diagramMeta.origin;
  const toSlide = (p: Point): Point => ({ x: o.x + p.x * s, y: o.y + p.y * s });
  const used = usedCellIds(work, diagramId);
  const result: AddResult = { diagramId, meta, elements: [], added: [], warnings: [] };
  const cellRef = (ref: string | undefined): VertexEl | undefined => {
    if (!ref) return undefined;
    const found = work.elements.filter((el): el is VertexEl => el.type === 'vertex'
      && (el.id === ref || (el.cell === ref && el.diagram === diagramId)));
    return found[0];
  };
  // Shapes without a position go in a row to the right of what is there.
  let cursor: Point | null = null;
  const nextFree = (w: number): Point => {
    if (!cursor) {
      const mine = work.elements.filter((el): el is VertexEl => el.type === 'vertex' && el.diagram === diagramId);
      if (mine.length === 0) cursor = { x: 40, y: 40 };
      else {
        const right = Math.max(...mine.map((el) => (el.x + el.w - o.x) / s));
        const top = Math.min(...mine.map((el) => (el.y - o.y) / s));
        cursor = { x: Math.round(right + 40), y: Math.round(top) };
      }
    }
    const at = { ...cursor };
    cursor = { x: cursor.x + w + 40, y: cursor.y };
    return at;
  };
  const push = (el: VertexEl | ConnectorEl) => {
    work.elements.push(el);
    result.elements.push(el);
  };
  for (const spec of specs.filter((sp) => sp.kind === 'vertex')) {
    if (spec.id && used.has(spec.id)) throw new Error(`Cell id ${spec.id} is already used in ${diagramId}.`);
    if (spec.parent && !cellRef(spec.parent) && !diagramMeta.layers.some((l) => l.cell === spec.parent)) {
      throw new Error(`Parent ${spec.parent} is not a cell or layer of ${diagramId}.`);
    }
    const parentCell = spec.parent ? (cellRef(spec.parent)?.cell ?? spec.parent) : undefined;
    let style = spec.style;
    let label = spec.label;
    let w = spec.w;
    let h = spec.h;
    if (spec.library) {
      const item = findLibraryItem(spec.library);
      if (!item) throw new Error(`No library shape matches "${spec.library}". Try \`slide-agent docs diagrams\` for the list.`);
      const top = item.cells.filter((c) => c.parent == null);
      if (top.length === 1 && !top[0].edge && item.cells.length === 1) {
        const c = top[0];
        // The entry's style, with the spec's own keys on top.
        style = c.style;
        for (const [k, v] of parsePatch(spec.style ?? '')) style = setStyleValue(style, k, v);
        label ??= c.value ?? c.object?.attrs.label ?? '';
        w ??= c.geometry.width;
        h ??= c.geometry.height;
      } else {
        // A multi-cell entry (a container with rows, a class…): placed as draw.io inserts it.
        const first = top.find((c) => !c.edge) ?? top[0];
        const at = spec.x != null && spec.y != null ? { x: spec.x, y: spec.y } : nextFree(item.width);
        const placed = placeItem(work, item, { x: Math.round(at.x - first.geometry.x), y: Math.round(at.y - first.geometry.y) }, makeId, { diagramId, parent: parentCell ?? null });
        placed.forEach(({ element }, index) => {
          if (index === 0 && spec.id) element.cell = spec.id;
          if (index === 0 && spec.label != null) element.label = spec.label;
          used.add(element.cell);
          push(element);
        });
        if (spec.w != null || spec.h != null || spec.style) result.warnings.push(`${spec.library}: a multi-cell library entry keeps its own size and style; restyle it with diagram style.`);
        const head = placed[0]?.element;
        if (head) result.added.push({ cell: head.cell, element: head.id, kind: head.type, library: item.title });
        continue;
      }
      result.added.push({ cell: '', element: '', kind: 'vertex', library: item.title });
    } else {
      result.added.push({ cell: '', element: '', kind: 'vertex' });
    }
    w ??= 120;
    h ??= 60;
    const dio = withHtml(style ?? DEFAULT_VERTEX_STYLE, 'vertex');
    const at = spec.x != null && spec.y != null ? { x: spec.x, y: spec.y } : nextFree(w);
    const p = toSlide({ x: spec.x ?? at.x, y: spec.y ?? at.y });
    const made = newVertex(work, { dio, label: label ?? '', x: p.x, y: p.y, unitW: w, unitH: h, parent: parentCell ?? null, diagramId, cell: spec.id }, makeId, used);
    push(made.element);
    const entry = result.added[result.added.length - 1];
    entry.cell = made.element.cell;
    entry.element = made.element.id;
    result.warnings.push(...patchWarnings(made.element, parsePatch(dio)));
  }
  for (const spec of specs.filter((sp) => sp.kind === 'edge')) {
    if (spec.id && used.has(spec.id)) throw new Error(`Cell id ${spec.id} is already used in ${diagramId}.`);
    const source = cellRef(spec.from);
    const targetEl = cellRef(spec.to);
    if (spec.from && !source) throw new Error(`Edge ${spec.id ?? ''} from=${spec.from}: no such shape in ${diagramId}.`);
    if (spec.to && !targetEl) throw new Error(`Edge ${spec.id ?? ''} to=${spec.to}: no such shape in ${diagramId}.`);
    if (!source || !targetEl) throw new Error(`Edge ${spec.id ?? ''} needs from= and to= (shape cell ids).`);
    const dio = withHtml(spec.style ?? DEFAULT_EDGE_STYLE, 'edge');
    const made = newConnector(work, {
      dio, label: spec.label ?? '', source: source.id, target: targetEl.id, diagramId, cell: spec.id,
      points: (spec.points ?? []).map(toSlide), parent: spec.parent ?? null,
    }, makeId, { used });
    push(made.element);
    result.added.push({ cell: made.element.cell, element: made.element.id, kind: 'connector' });
    result.warnings.push(...patchWarnings(made.element, parsePatch(dio)));
  }
  return result;
}

/** For tests and the editor: put the result on a slide (mutating it). */
export function applyAdd(slide: Slide, result: AddResult): void {
  addCells(slide, result.elements.map((element, i) => ({ element, diagramId: result.diagramId, meta: i === 0 ? result.meta : null })));
}

/** Resolved style for reporting: the shape a vertex draws as. */
export function shapeOf(el: DiagramEl): string {
  return resolveStyle(el.dio, el.type === 'vertex' ? 'vertex' : 'edge').shape ?? (el.type === 'vertex' ? 'rectangle' : 'connector');
}
