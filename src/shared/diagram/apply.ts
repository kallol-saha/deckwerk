/**
 * Putting a draw.io page onto a slide, and updating a diagram already there
 * from an edited `.drawio` file, as agent operations.
 *
 * Updating matches cells by their draw.io id: a cell that is still in the
 * file keeps its DeckWerk element (its id, so its builds, Morph pairing and
 * comments survive) and takes the file's style, label and geometry; a new
 * cell is inserted; a cell the file no longer has is deleted. Placement is
 * kept from the slide's record of the diagram, so a file exported from the
 * slide and applied back lands exactly where it was.
 */

import type { AgentOperation } from '../agent.js';
import type { Deck, DiagramMeta, Slide, SlideElement } from '../deck.js';
import { animationToBuilds, buildsMatchAnimation, placeDiagramBuilds } from './animation.js';
import { fitPlacement, pageToElements, type Placement } from './convert.js';
import type { DiagramPage, DrawioDocument } from './model.js';

export interface ApplyOptions {
  /** The slide's key for the diagram; default: the one the page came from, else `diagram-1`. */
  diagramId?: string;
  /** Override where the page goes; default: as recorded on the slide, else fitted to the canvas. */
  placement?: Placement;
  /** draw.io view scale for a new diagram (fitted when absent). */
  scale?: number;
  makeId: (prefix: string) => string;
}

export interface ApplySummary {
  diagramId: string;
  inserted: string[];
  updated: string[];
  deleted: string[];
  unchanged: number;
}

/** Which page of a document a diagram on a slide came from. */
export function pickPage(doc: DrawioDocument, meta: DiagramMeta | undefined, wanted?: string): DiagramPage {
  if (doc.pages.length === 0) throw new Error('The file has no diagram pages.');
  if (wanted != null) {
    const byIndex = /^\d+$/.test(wanted) ? doc.pages[Number(wanted) - 1] : undefined;
    const page = byIndex ?? doc.pages.find((p) => p.id === wanted || p.name === wanted);
    if (!page) throw new Error(`No page ${wanted}; the file has ${doc.pages.map((p, i) => `${i + 1} "${p.name}"`).join(', ')}.`);
    return page;
  }
  if (meta) {
    const page = doc.pages.find((p) => (meta.pageId && p.id === meta.pageId) || p.name === meta.name);
    if (page) return page;
  }
  return doc.pages[0];
}

function stripVolatile(el: SlideElement): unknown {
  const { id: _id, z: _z, comments: _c, morphId: _m, lineageId: _l, ...rest } = el as SlideElement & Record<string, unknown>;
  return rest;
}

/**
 * Equal up to the rounding a `.drawio` file applies (positions are written
 * to a thousandth of a draw.io unit), so applying an exported file that
 * nobody edited changes nothing.
 */
function nearlyEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.01;
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => nearlyEqual(v, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => nearlyEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function sameContent(a: SlideElement, b: SlideElement): boolean {
  return nearlyEqual(stripVolatile(a), stripVolatile(b));
}

/**
 * The operations that make `slide`'s diagram match `page`. Elements of other
 * diagrams and non-diagram elements are left alone.
 */
export function diagramPageOperations(
  deck: Pick<Deck, 'canvas'>,
  slide: Slide,
  page: DiagramPage,
  options: ApplyOptions,
  fileAttributes?: Record<string, string>,
): { operations: AgentOperation[]; summary: ApplySummary } {
  const diagramId = options.diagramId
    ?? Object.entries(slide.diagrams ?? {}).find(([, m]) => m.pageId === page.id || m.name === page.name)?.[0]
    ?? (slide.diagrams && Object.keys(slide.diagrams).length > 0 ? Object.keys(slide.diagrams)[0] : 'diagram-1');
  const meta = slide.diagrams?.[diagramId];
  const placement = options.placement
    ?? (meta ? { origin: meta.origin, scale: meta.scale } : fitPlacement(page, deck.canvas, options.scale ? { scale: options.scale } : {}));

  const existing = slide.elements.filter((el) => (el.type === 'vertex' || el.type === 'connector') && el.diagram === diagramId);
  const byCell = new Map(existing.map((el) => [`${el.type}:${(el as { cell: string }).cell}`, el]));
  const baseZ = existing.length > 0
    ? Math.min(...existing.map((el) => el.z))
    : slide.elements.reduce((max, el) => Math.max(max, el.z), -1) + 1;

  const { elements: fresh, meta: nextMeta } = pageToElements(page, {
    diagramId,
    placement,
    makeId: options.makeId,
    z: baseZ,
    fileAttributes,
  });

  // Keep the element ids of cells the slide already has, so builds and
  // pairings that name them survive the update.
  const idFor = new Map<string, string>();
  for (const el of fresh) {
    const key = `${el.type}:${(el as { cell: string }).cell}`;
    const old = byCell.get(key);
    idFor.set(el.id, old ? old.id : el.id);
  }
  const remapped = fresh.map((el) => {
    const id = idFor.get(el.id) ?? el.id;
    const old = byCell.get(`${el.type}:${(el as { cell: string }).cell}`);
    const keep = old ? { morphId: old.morphId, lineageId: old.lineageId, opacity: old.opacity, class: old.class } : {};
    if (el.type === 'connector') {
      return {
        ...el, ...keep, id,
        source: el.source ? idFor.get(el.source) ?? el.source : null,
        target: el.target ? idFor.get(el.target) ?? el.target : null,
      };
    }
    return { ...el, ...keep, id };
  }) as SlideElement[];

  const keptIds = new Set(remapped.map((el) => el.id));
  const inserted: SlideElement[] = [];
  const updated: SlideElement[] = [];
  let unchanged = 0;
  const oldById = new Map(existing.map((el) => [el.id, el]));
  for (const el of remapped) {
    const old = oldById.get(el.id);
    if (!old) inserted.push(el);
    else if (!sameContent(old, el) || old.z !== el.z) updated.push(el);
    else unchanged++;
  }
  const deleted = existing.filter((el) => !keptIds.has(el.id)).map((el) => el.id);

  const operations: AgentOperation[] = [];
  if (deleted.length > 0) operations.push({ op: 'deleteElements', slideId: slide.id, elementIds: deleted });
  for (const el of updated) operations.push({ op: 'replaceElement', slideId: slide.id, elementId: el.id, element: el });
  if (inserted.length > 0) {
    const lastExisting = [...slide.elements].reverse().find((el) => keptIds.has(el.id));
    operations.push({
      op: 'insertElements',
      slideId: slide.id,
      elements: inserted,
      ...(lastExisting ? { afterElementId: lastExisting.id } : {}),
    });
  }
  // The file's animation is the diagram's builds: when it reads as other
  // builds than the slide has, they are replaced (with no animation in the
  // file, the builds are left as they are).
  const diagrams = { ...(slide.diagrams ?? {}), [diagramId]: nextMeta };
  const after: Slide = {
    ...slide,
    elements: [...slide.elements.filter((el) => !deleted.includes(el.id) && !keptIds.has(el.id)), ...remapped],
    timeline: slide.timeline.filter((entry) => !deleted.includes(entry.action.target)),
    diagrams,
  };
  let timeline: Slide['timeline'] | undefined;
  if (nextMeta.animation != null && !buildsMatchAnimation(after, diagramId)) {
    const cellIds = new Set(remapped.map((el) => el.id));
    timeline = placeDiagramBuilds(after.timeline, cellIds, animationToBuilds(nextMeta.animation, after, diagramId, options.makeId));
  }
  operations.push({
    op: 'setSlideProperties',
    slideId: slide.id,
    slide: { id: slide.id, diagrams, ...(timeline ? { timeline } : {}) },
  });
  return {
    operations,
    summary: {
      diagramId,
      inserted: inserted.map((el) => el.id),
      updated: updated.map((el) => el.id),
      deleted,
      unchanged,
    },
  };
}

/** New slides for every page of a document, one diagram each. */
export function drawioToSlides(
  doc: DrawioDocument,
  canvas: { w: number; h: number },
  makeId: (prefix: string) => string,
  options: { scale?: number } = {},
): Slide[] {
  return doc.pages.map((page) => {
    const placement = fitPlacement(page, canvas, options.scale ? { scale: options.scale } : {});
    const { elements, meta } = pageToElements(page, {
      diagramId: 'diagram-1', placement, makeId, z: 0, fileAttributes: doc.attributes,
    });
    return {
      id: makeId('slide'),
      name: page.name,
      // draw.io's page background becomes the slide's.
      background: { color: pageBackground(page.model.background), image: null },
      notes: '',
      elements,
      // draw.io's animation, as builds on the cells.
      timeline: placeDiagramBuilds([], new Set(elements.map((el) => el.id)),
        animationToBuilds(meta.animation, { elements, diagrams: { 'diagram-1': meta } }, 'diagram-1', makeId)),
      diagrams: { 'diagram-1': meta },
    };
  });
}

/** A draw.io page background colour worth carrying to a slide, or null. */
function pageBackground(value: string | undefined): string | null {
  if (!value || value === 'none' || value === 'default') return null;
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]+$/i.test(value) ? value : null;
}
