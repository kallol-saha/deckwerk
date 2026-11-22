/**
 * Reading and writing draw.io files: `<mxfile>` with one `<diagram>` per
 * page, each holding an `<mxGraphModel>` either as XML or compressed
 * (base64 of raw deflate of the URI-encoded XML, as Graph.compress writes
 * it), a bare `<mxGraphModel>`, and draw.io's editable SVG export (the file
 * in its `content` attribute). Formats follow draw.io 32.7.4 (Apache-2.0):
 * Editor.parseDiagramNode, Graph.compress/decompress, mxCodec.
 *
 * Attributes this model does not interpret are kept and written back, so a
 * file read and written unchanged keeps its content.
 */

import type { Point, Rect } from './types.js';
import type { CellGeometry, CellKind, DiagramCell, DiagramPage, DrawioDocument } from './model.js';
import { childElements, element, firstChild, parseXml, serializeXml, textContent, type XmlElement, type XmlNode } from './xml.js';

const CELL_KEYS = new Set(['id', 'parent', 'value', 'style', 'vertex', 'edge', 'source', 'target', 'connectable', 'visible', 'collapsed']);

// --- compression ----------------------------------------------------------------

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function pipeThrough(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Graph.decompress: base64 → inflateRaw → decodeURIComponent. */
export async function decompressDiagram(text: string): Promise<string> {
  const inflated = await pipeThrough(base64ToBytes(text), new DecompressionStream('deflate-raw') as unknown as {
    readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>;
  });
  const decoded = new TextDecoder().decode(inflated);
  try {
    return decodeURIComponent(decoded);
  } catch {
    return decoded;
  }
}

/** Graph.compress: encodeURIComponent → deflateRaw → base64. */
export async function compressDiagram(xml: string): Promise<string> {
  const bytes = new TextEncoder().encode(encodeURIComponent(xml));
  const deflated = await pipeThrough(bytes, new CompressionStream('deflate-raw') as unknown as {
    readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>;
  });
  return bytesToBase64(deflated);
}

// --- reading -----------------------------------------------------------------

function num(value: string | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function readPoint(el: XmlElement): Point {
  return { x: num(el.attrs.x), y: num(el.attrs.y) };
}

function readGeometry(el: XmlElement): CellGeometry {
  const g: CellGeometry = {
    x: num(el.attrs.x),
    y: num(el.attrs.y),
    width: num(el.attrs.width),
    height: num(el.attrs.height),
    relative: el.attrs.relative === '1',
  };
  for (const child of childElements(el)) {
    const as = child.attrs.as;
    if (child.name === 'mxPoint') {
      if (as === 'sourcePoint') g.sourcePoint = readPoint(child);
      else if (as === 'targetPoint') g.targetPoint = readPoint(child);
      else if (as === 'offset') g.offset = readPoint(child);
    } else if (child.name === 'Array' && as === 'points') {
      g.points = childElements(child, 'mxPoint').map(readPoint);
    } else if (child.name === 'mxRectangle' && as === 'alternateBounds') {
      const r: Rect = { x: num(child.attrs.x), y: num(child.attrs.y), width: num(child.attrs.width), height: num(child.attrs.height) };
      g.alternateBounds = r;
    }
  }
  return g;
}

function readCell(node: XmlElement, rootId: string | null): DiagramCell | null {
  let cellEl: XmlElement | null = node;
  let object: DiagramCell['object'] = null;
  if (node.name !== 'mxCell') {
    // <object>/<UserObject>/<anything>: the wrapper holds the id and the
    // custom properties, its <mxCell> child the rest.
    cellEl = firstChild(node, 'mxCell');
    if (!cellEl) return null;
    const attrs = { ...node.attrs };
    delete attrs.id;
    object = { tag: node.name, attrs };
  }
  const a = cellEl.attrs;
  const id = (object ? node.attrs.id : a.id) ?? '';
  const parent = a.parent ?? null;
  let kind: CellKind = 'other';
  if (a.vertex === '1') kind = 'vertex';
  else if (a.edge === '1') kind = 'edge';
  else if (parent == null) kind = 'root';
  else if (parent === rootId) kind = 'layer';
  const geometryEl = childElements(cellEl).find((c) => c.name === 'mxGeometry');
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (!CELL_KEYS.has(k)) extra[k] = v;
  return {
    id,
    parent,
    kind,
    value: object ? '' : (a.value ?? ''),
    style: a.style ?? '',
    source: a.source ?? null,
    target: a.target ?? null,
    visible: a.visible !== '0',
    collapsed: a.collapsed === '1',
    connectable: a.connectable !== '0',
    geometry: geometryEl ? readGeometry(geometryEl) : null,
    object,
    extra,
  };
}

/** The cells of an `<mxGraphModel>` element. */
export function readGraphModel(modelEl: XmlElement): { model: Record<string, string>; cells: DiagramCell[] } {
  const rootEl = firstChild(modelEl, 'root');
  const cells: DiagramCell[] = [];
  if (rootEl) {
    // The root cell is the one without a parent; layers name it as parent.
    let rootId: string | null = null;
    for (const child of childElements(rootEl)) {
      const cellEl = child.name === 'mxCell' ? child : firstChild(child, 'mxCell');
      if (cellEl && cellEl.attrs.parent == null) {
        rootId = (child.name === 'mxCell' ? child.attrs.id : child.attrs.id) ?? null;
        break;
      }
    }
    for (const child of childElements(rootEl)) {
      const cell = readCell(child, rootId);
      if (cell) cells.push(cell);
    }
  }
  return { model: { ...modelEl.attrs }, cells };
}

async function readDiagram(diagramEl: XmlElement, index: number): Promise<DiagramPage> {
  const extra = { ...diagramEl.attrs };
  delete extra.id;
  delete extra.name;
  let modelEl = firstChild(diagramEl, 'mxGraphModel');
  if (!modelEl) {
    const text = textContent(diagramEl).trim();
    if (text.length > 0) {
      const xml = text.startsWith('<') ? text : await decompressDiagram(text);
      const parsed = parseXml(xml);
      modelEl = parsed.name === 'mxGraphModel' ? parsed : firstChild(parsed, 'mxGraphModel');
    }
  }
  const { model, cells } = modelEl ? readGraphModel(modelEl) : { model: {}, cells: [] };
  return {
    id: diagramEl.attrs.id ?? `page-${index + 1}`,
    name: diagramEl.attrs.name ?? `Page-${index + 1}`,
    model,
    cells,
    extra,
  };
}

function svgContent(svg: XmlElement): string | null {
  const content = svg.attrs.content;
  if (!content) return null;
  const trimmed = content.trim();
  if (trimmed.startsWith('<')) return trimmed;
  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded.trim().startsWith('<')) return decoded;
  } catch { /* not URI-encoded */ }
  try {
    const decoded = atob(trimmed);
    if (decoded.trim().startsWith('<')) return decoded;
  } catch { /* not base64 */ }
  return null;
}

/**
 * Reads a `.drawio` (or `.xml`, or draw.io's editable `.svg`) file. Throws
 * when the text holds no diagram.
 */
export async function readDrawio(text: string): Promise<DrawioDocument> {
  let root = parseXml(text);
  if (root.name === 'svg') {
    const content = svgContent(root);
    if (!content) throw new Error('This SVG carries no draw.io diagram.');
    root = parseXml(content);
  }
  if (root.name === 'mxGraphModel') {
    const { model, cells } = readGraphModel(root);
    return { attributes: {}, pages: [{ id: 'page-1', name: 'Page-1', model, cells, extra: {} }] };
  }
  if (root.name === 'diagram') {
    return { attributes: {}, pages: [await readDiagram(root, 0)] };
  }
  if (root.name !== 'mxfile') throw new Error(`Not a draw.io file (root element <${root.name}>).`);
  const diagrams = childElements(root, 'diagram');
  const pages: DiagramPage[] = [];
  for (let i = 0; i < diagrams.length; i++) pages.push(await readDiagram(diagrams[i], i));
  return { attributes: { ...root.attrs }, pages };
}

// --- writing -----------------------------------------------------------------

function fmtNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function writePoint(p: Point, as?: string): XmlElement {
  const attrs: Record<string, string> = {};
  if (p.x !== 0) attrs.x = fmtNum(p.x);
  if (p.y !== 0) attrs.y = fmtNum(p.y);
  if (as) attrs.as = as;
  return element('mxPoint', attrs);
}

function writeGeometry(g: CellGeometry): XmlElement {
  const attrs: Record<string, string> = {};
  if (g.x !== 0) attrs.x = fmtNum(g.x);
  if (g.y !== 0) attrs.y = fmtNum(g.y);
  if (g.width !== 0) attrs.width = fmtNum(g.width);
  if (g.height !== 0) attrs.height = fmtNum(g.height);
  if (g.relative) attrs.relative = '1';
  attrs.as = 'geometry';
  const children: XmlNode[] = [];
  if (g.sourcePoint) children.push(writePoint(g.sourcePoint, 'sourcePoint'));
  if (g.targetPoint) children.push(writePoint(g.targetPoint, 'targetPoint'));
  if (g.points && g.points.length > 0) {
    children.push(element('Array', { as: 'points' }, g.points.map((p) => writePoint(p))));
  }
  if (g.offset) children.push(writePoint(g.offset, 'offset'));
  if (g.alternateBounds) {
    const r = g.alternateBounds;
    children.push(element('mxRectangle', {
      ...(r.x !== 0 ? { x: fmtNum(r.x) } : {}),
      ...(r.y !== 0 ? { y: fmtNum(r.y) } : {}),
      width: fmtNum(r.width), height: fmtNum(r.height), as: 'alternateBounds',
    }));
  }
  return element('mxGeometry', attrs, children);
}

function writeCell(cell: DiagramCell): XmlElement {
  const attrs: Record<string, string> = {};
  if (!cell.object) attrs.id = cell.id;
  if (!cell.object && (cell.kind === 'vertex' || cell.kind === 'edge' || cell.value !== '')) attrs.value = cell.value;
  if (cell.style !== '') attrs.style = cell.style;
  Object.assign(attrs, cell.extra);
  if (cell.kind === 'vertex') attrs.vertex = '1';
  if (cell.kind === 'edge') attrs.edge = '1';
  if (!cell.connectable) attrs.connectable = '0';
  if (!cell.visible) attrs.visible = '0';
  if (cell.collapsed) attrs.collapsed = '1';
  if (cell.parent != null) attrs.parent = cell.parent;
  if (cell.source != null) attrs.source = cell.source;
  if (cell.target != null) attrs.target = cell.target;
  const children = cell.geometry ? [writeGeometry(cell.geometry)] : [];
  const mxCell = element('mxCell', attrs, children);
  if (!cell.object) return mxCell;
  return element(cell.object.tag, { ...cell.object.attrs, id: cell.id }, [mxCell]);
}

export function writeGraphModel(page: Pick<DiagramPage, 'model' | 'cells'>): XmlElement {
  return element('mxGraphModel', { ...page.model }, [element('root', {}, page.cells.map(writeCell))]);
}

export interface WriteOptions {
  /** Compress each page as draw.io's "Compressed" option does. */
  compressed?: boolean;
  /** Indent elements; default true. */
  pretty?: boolean;
}

/** The document as `.drawio` text. */
export async function writeDrawio(doc: DrawioDocument, options: WriteOptions = {}): Promise<string> {
  const indent = options.pretty === false ? '' : '  ';
  const diagrams: XmlElement[] = [];
  for (const page of doc.pages) {
    const model = writeGraphModel(page);
    const attrs = { ...page.extra, name: page.name, id: page.id };
    if (options.compressed) {
      diagrams.push(element('diagram', attrs, [await compressDiagram(serializeXml(model))]));
    } else {
      diagrams.push(element('diagram', attrs, [model]));
    }
  }
  const fileAttrs: Record<string, string> = { host: 'DeckWerk', ...doc.attributes };
  if (options.compressed) fileAttrs.compressed = 'true';
  else delete fileAttrs.compressed;
  return serializeXml(element('mxfile', fileAttrs, diagrams), indent) + '\n';
}

/** A fresh, empty page: root cell `0` and default layer `1`, as draw.io makes one. */
export function emptyPage(name = 'Page-1', id = 'page-1'): DiagramPage {
  const blank = (cellId: string, parent: string | null, kind: CellKind): DiagramCell => ({
    id: cellId, parent, kind, value: '', style: '', source: null, target: null,
    visible: true, collapsed: false, connectable: true, geometry: null, object: null, extra: {},
  });
  return {
    id,
    name,
    model: { grid: '1', gridSize: '10', guides: '1', tooltips: '1', connect: '1', arrows: '1', fold: '1', page: '1', pageScale: '1', math: '0', shadow: '0' },
    cells: [blank('0', null, 'root'), blank('1', '0', 'layer')],
    extra: {},
  };
}
