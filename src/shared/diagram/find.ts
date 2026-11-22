/*
 * Find and replace in diagram labels, after draw.io's Find window
 * (jgraph/drawio 32.7.4, js/diagramly/Dialogs.js: FindWindow — getSearchLabel,
 * testMeta, search, replaceInLabel, replaceMatch, Replace All).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: DOM-free; every occurrence is a match (draw.io
 * steps cell by cell); Match case and Whole word beside draw.io's Regular
 * expression; a slide is a page; the stored label value is searched, so
 * `%placeholders%` are matched as written (draw.io matches the label it
 * shows and writes a replacement inside a placeholder value into the
 * property it comes from).
 */

/**
 * What is searched, as in draw.io: the label of every drawn vertex and
 * connector and of every label cell on a connector — the text an HTML
 * label shows (tags dropped, entities decoded, `<br>` and block edges as
 * spaces), runs of white space and control characters as one space. While
 * nothing is to be written in their place (`data`), a cell also matches by
 * its whole id or by one of its custom properties.
 *
 * Matches come in deck order: slide by slide, each slide's cells in paint
 * order, a connector's label cells right after it, occurrences left to
 * right. A replacement in an HTML label changes only text: tags inside the
 * replaced range are kept (after the new text), the new text is escaped and
 * takes the formatting of the first character it replaces.
 */

import type { ConnectorEl, Deck, Slide, SlideElement, VertexEl } from '../deck.js';
import { BLOCKS, decodeEntities } from './label/html.js';
import { DiagramTree, isCellLocked } from './structure.js';
import { getStyleValue, resolveStyle } from './style.js';

export interface FindOptions {
  /** What to look for: text, or a JavaScript regular expression with `regex`. */
  query: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  /** Also match whole cell ids and custom property values (draw.io does while Replace is empty). */
  data?: boolean;
}

/** Where to look: the given slide, or every slide of the deck. */
export interface FindScope {
  scope: 'slide' | 'deck';
  /** The current slide (the one searched for 'slide'). */
  slideId: string;
}

/** One searchable label: a cell's own label, or a label cell of a connector. */
export interface LabelSlot {
  slideIndex: number;
  slideId: string;
  elementId: string;
  /** null: the element's own label; a cell id: that label cell of the connector. */
  labelCell: string | null;
  /** Position in the deck order of all slots searched. */
  ordinal: number;
  html: boolean;
  /** The stored label. */
  value: string;
  /** The draw.io cell id (the label cell's for a label cell). */
  cell: string;
  /** Custom properties of the cell (draw.io's `<object>` attributes). */
  attrs: Record<string, string> | null;
}

export interface FindMatch {
  slideIndex: number;
  slideId: string;
  elementId: string;
  labelCell: string | null;
  ordinal: number;
  kind: 'label' | 'data';
  /** The match in the searchable text of the label; -1 for a data match. */
  start: number;
  end: number;
  /** The matched text (the property's value for a data match). */
  text: string;
  /** The matched range of the stored label. */
  from: number;
  to: number;
  /** Capture groups of a regular expression match (for $1 … in the replacement). */
  groups: string[];
}

/** A place in the deck order of labels: matches strictly after (or before) it are next. */
export interface FindPosition {
  slideId: string;
  /** The element, or null for the start of the slide. */
  elementId: string | null;
  labelCell?: string | null;
  /** Offset in the label's searchable text. */
  offset: number;
}

// --- the searchable text of a label ---------------------------------------------------

/** The text searched and, per character, the range of the stored label it comes from. */
interface TextModel {
  text: string;
  starts: number[];
  ends: number[];
  /** Characters that stand for a tag (line breaks of <br> and block edges), not label text. */
  virtual: boolean[];
  /** Tags of an HTML label, as [start, end) ranges of the stored label. */
  tags: Array<[number, number]>;
}

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const SPACE = /[\s\x00-\x1F\x7F-\x9F]/;

function htmlModel(value: string): { chars: string[]; starts: number[]; ends: number[]; virtual: boolean[]; tags: Array<[number, number]> } {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const virtual: boolean[] = [];
  const tags: Array<[number, number]> = [];
  const push = (ch: string, s: number, e: number, v = false) => {
    chars.push(ch);
    starts.push(s);
    ends.push(e);
    virtual.push(v);
  };
  let i = 0;
  while (i < value.length) {
    const c = value.charAt(i);
    if (c === '<') {
      const next = value.charAt(i + 1);
      if (value.startsWith('<!--', i)) {
        const close = value.indexOf('-->', i + 4);
        const end = close < 0 ? value.length : close + 3;
        tags.push([i, end]);
        i = end;
        continue;
      }
      if (/[A-Za-z/!?]/.test(next)) {
        // A tag: up to the '>' outside quotes.
        let j = i + 1;
        let quote = '';
        while (j < value.length) {
          const d = value.charAt(j);
          if (quote) {
            if (d === quote) quote = '';
          } else if (d === '"' || d === "'") {
            quote = d;
          } else if (d === '>') {
            break;
          }
          j += 1;
        }
        let end = Math.min(j + 1, value.length);
        const tag = value.slice(i, end);
        const name = (/^<\/?\s*([A-Za-z][A-Za-z0-9-]*)/.exec(tag)?.[1] ?? '').toLowerCase();
        const closing = tag.startsWith('</');
        if (!closing && RAW_TEXT.has(name) && !/\/>$/.test(tag)) {
          // Their content is never label text: part of the tag.
          const close = value.toLowerCase().indexOf(`</${name}`, end);
          const closeEnd = close < 0 ? value.length : (value.indexOf('>', close) + 1 || value.length);
          end = closeEnd;
        }
        tags.push([i, end]);
        if (name === 'br' || name === 'td' || name === 'th' || BLOCKS.has(name)) push(' ', i, end, true);
        i = end;
        continue;
      }
      push('<', i, i + 1);
      i += 1;
      continue;
    }
    if (c === '&') {
      const ref = /^&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/.exec(value.slice(i, i + 40));
      if (ref) {
        const decoded = decodeEntities(ref[0]);
        if (decoded !== ref[0]) {
          for (const ch of decoded) push(ch, i, i + ref[0].length);
          i += ref[0].length;
          continue;
        }
      }
    }
    push(c, i, i + 1);
    i += 1;
  }
  return { chars, starts, ends, virtual, tags };
}

/** The searchable text of a label: white space collapsed, each character mapped back. */
function textModel(value: string, html: boolean): TextModel {
  let raw: { chars: string[]; starts: number[]; ends: number[]; virtual: boolean[]; tags: Array<[number, number]> };
  if (html) {
    raw = htmlModel(value);
  } else {
    const chars = [...value];
    const starts: number[] = [];
    const ends: number[] = [];
    let at = 0;
    for (const ch of chars) {
      starts.push(at);
      at += ch.length;
      ends.push(at);
    }
    raw = { chars, starts, ends, virtual: chars.map(() => false), tags: [] };
  }
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  const virtual: boolean[] = [];
  for (let k = 0; k < raw.chars.length; k++) {
    const ch = raw.chars[k];
    if (SPACE.test(ch)) {
      // One space for the whole run, spanning it.
      let last = k;
      let allVirtual = raw.virtual[k];
      while (last + 1 < raw.chars.length && SPACE.test(raw.chars[last + 1])) {
        last += 1;
        allVirtual = allVirtual && raw.virtual[last];
      }
      text += ' ';
      starts.push(raw.starts[k]);
      ends.push(raw.ends[last]);
      virtual.push(allVirtual);
      k = last;
      continue;
    }
    // A character outside the BMP is two UTF-16 units: one entry each.
    for (let u = 0; u < ch.length; u++) {
      text += ch.charAt(u);
      starts.push(raw.starts[k]);
      ends.push(raw.ends[k]);
      virtual.push(false);
    }
  }
  return { text, starts, ends, virtual, tags: raw.tags };
}

// --- the labels searched -----------------------------------------------------------------

function isDrawnCell(el: SlideElement): el is VertexEl | ConnectorEl {
  return (el.type === 'vertex' || el.type === 'connector') && !el.hidden && !el.concealed;
}

/** Cells of a slide in paint order (z, then position in the list). */
function cellsInPaintOrder(slide: Slide): Array<VertexEl | ConnectorEl> {
  return slide.elements
    .map((el, index) => ({ el, index }))
    .filter((e): e is { el: VertexEl | ConnectorEl; index: number } => isDrawnCell(e.el))
    .sort((a, b) => (a.el.z - b.el.z) || (a.index - b.index))
    .map(({ el }) => el);
}

function isHtml(dio: string, kind: 'vertex' | 'edge'): boolean {
  return resolveStyle(dio, kind).html === '1';
}

/** Every label searched in `where`, in deck order. */
export function labelSlots(deck: Pick<Deck, 'slides'>, where: FindScope): LabelSlot[] {
  const slots: LabelSlot[] = [];
  deck.slides.forEach((slide, slideIndex) => {
    if (where.scope === 'slide' && slide.id !== where.slideId) return;
    for (const el of cellsInPaintOrder(slide)) {
      slots.push({
        slideIndex, slideId: slide.id, elementId: el.id, labelCell: null, ordinal: slots.length,
        html: isHtml(el.dio, el.type === 'vertex' ? 'vertex' : 'edge'),
        value: el.label, cell: el.cell, attrs: el.object?.attrs ?? null,
      });
      if (el.type !== 'connector') continue;
      for (const label of el.labels) {
        if (label.hidden) continue;
        slots.push({
          slideIndex, slideId: slide.id, elementId: el.id, labelCell: label.cell, ordinal: slots.length,
          html: isHtml(label.dio, 'vertex'), value: label.label, cell: label.cell, attrs: label.object?.attrs ?? null,
        });
      }
    }
  });
  return slots;
}

// --- matching ---------------------------------------------------------------------------

/** The pattern the options ask for; throws on an invalid regular expression. */
export function findPattern(options: FindOptions): RegExp | null {
  if (options.query.length === 0) return null;
  const flags = `g${options.matchCase ? '' : 'i'}`;
  if (options.regex) return new RegExp(options.query, flags);
  // Text is searched with its white space collapsed: so is the query.
  const source = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ' ');
  return new RegExp(source, flags);
}

const WORD = /[\p{L}\p{N}_]/u;

function wordAt(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return WORD.test(String.fromCodePoint(text.codePointAt(index) ?? 0))
    // The second half of a surrogate pair.
    || (index > 0 && /[\uDC00-\uDFFF]/.test(text.charAt(index)) && WORD.test(text.slice(index - 1, index + 1)));
}

/** The non-empty matches of `pattern` in `text` (whole words only with `wholeWord`). */
function matchesIn(text: string, pattern: RegExp, wholeWord: boolean): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (wholeWord && (wordAt(text, start - 1) || wordAt(text, end))) {
      // Try again from the next character: a shorter match may be a whole word.
      re.lastIndex = start + 1;
      continue;
    }
    out.push(m);
  }
  return out;
}

function slotMatches(slot: LabelSlot, pattern: RegExp, options: FindOptions): FindMatch[] {
  const base = {
    slideIndex: slot.slideIndex, slideId: slot.slideId, elementId: slot.elementId,
    labelCell: slot.labelCell, ordinal: slot.ordinal,
  };
  const out: FindMatch[] = [];
  if (slot.value.length > 0) {
    const model = textModel(slot.value, slot.html);
    for (const m of matchesIn(model.text, pattern, options.wholeWord === true)) {
      const start = m.index;
      const end = start + m[0].length;
      out.push({
        ...base, kind: 'label', start, end, text: m[0],
        from: model.starts[start], to: model.ends[end - 1], groups: [...m].slice(1).map((g) => g ?? ''),
      });
    }
  }
  if (out.length === 0 && options.data) {
    const data = dataMatch(slot, pattern, options);
    if (data != null) out.push({ ...base, kind: 'data', start: -1, end: -1, text: data, from: -1, to: -1, groups: [] });
  }
  return out;
}

/**
 * testMeta: the whole cell id (a plain query; a pattern anywhere in it) or
 * any custom property but the label. Returns what matched, or null.
 */
function dataMatch(slot: LabelSlot, pattern: RegExp, options: FindOptions): string | null {
  const id = slot.cell;
  if (options.regex) {
    if (matchesIn(id, pattern, options.wholeWord === true).length > 0) return id;
  } else {
    const query = options.query.replace(/\s+/g, ' ').trim();
    if (options.matchCase ? id === query : id.toLowerCase() === query.toLowerCase()) return id;
  }
  for (const [name, raw] of Object.entries(slot.attrs ?? {})) {
    if (name === 'label' || name === 'placeholders') continue;
    const value = raw.replace(/[\x00-\x1F\x7F-\x9F]|\s+/g, ' ').trim();
    if (matchesIn(value, pattern, options.wholeWord === true).length > 0) return `${name}: ${raw}`;
  }
  return null;
}

/**
 * Every match in `where`, in deck order. Throws a SyntaxError for an
 * invalid regular expression; an empty query matches nothing.
 */
export function findMatches(deck: Pick<Deck, 'slides'>, where: FindScope, options: FindOptions): FindMatch[] {
  const pattern = findPattern(options);
  if (pattern == null) return [];
  const out: FindMatch[] = [];
  for (const slot of labelSlots(deck, where)) out.push(...slotMatches(slot, pattern, options));
  return out;
}

// --- stepping ---------------------------------------------------------------------------

/** The place just at a match: the next match is after it, the previous one before. */
export function positionOf(match: Pick<FindMatch, 'slideId' | 'elementId' | 'labelCell' | 'start'>): FindPosition {
  return { slideId: match.slideId, elementId: match.elementId, labelCell: match.labelCell, offset: match.start };
}

/** The place just before an element's labels (matches in it are next), or before a slide's when `elementId` is null. */
export function positionBefore(slideId: string, elementId: string | null): FindPosition {
  return { slideId, elementId, labelCell: null, offset: -2 };
}

/** [ordinal, offset] of a position among `slots`. */
function positionKey(deck: Pick<Deck, 'slides'>, slots: readonly LabelSlot[], at: FindPosition, backwards: boolean): [number, number] {
  if (at.elementId != null) {
    const slot = slots.find((s) => s.elementId === at.elementId && s.slideId === at.slideId
      && s.labelCell === (at.labelCell ?? null))
      ?? slots.find((s) => s.elementId === at.elementId && s.slideId === at.slideId);
    if (slot) return [slot.ordinal, slot.labelCell === (at.labelCell ?? null) ? at.offset : -2];
  }
  // The start of the slide (going forward) or its end (going back).
  const slideIndex = Math.max(0, deck.slides.findIndex((s) => s.id === at.slideId));
  if (!backwards) {
    const first = slots.find((s) => s.slideIndex >= slideIndex);
    return [first ? first.ordinal : slots.length, -3];
  }
  const after = slots.find((s) => s.slideIndex > slideIndex);
  return [after ? after.ordinal : slots.length, -3];
}

/**
 * The index in `matches` (from findMatches over the same deck and scope) of
 * the next match after `at` (the previous one before it with `backwards`),
 * wrapping around; -1 when there are none.
 */
export function stepMatch(
  deck: Pick<Deck, 'slides'>, where: FindScope, matches: readonly FindMatch[], at: FindPosition | null, backwards = false,
): number {
  if (matches.length === 0) return -1;
  if (at == null) return backwards ? matches.length - 1 : 0;
  const [ordinal, offset] = positionKey(deck, labelSlots(deck, where), at, backwards);
  const after = (m: FindMatch) => m.ordinal > ordinal || (m.ordinal === ordinal && m.start > offset);
  const before = (m: FindMatch) => m.ordinal < ordinal || (m.ordinal === ordinal && m.start < offset);
  if (!backwards) {
    const i = matches.findIndex(after);
    return i >= 0 ? i : 0;
  }
  for (let i = matches.length - 1; i >= 0; i--) if (before(matches[i])) return i;
  return matches.length - 1;
}

/** Whether two matches are the same occurrence. */
export function sameMatch(a: FindMatch | null, b: FindMatch | null): boolean {
  return a != null && b != null && a.slideId === b.slideId && a.elementId === b.elementId
    && a.labelCell === b.labelCell && a.kind === b.kind && a.start === b.start && a.end === b.end;
}

// --- replacing --------------------------------------------------------------------------

/** `$&`, `$1`…`$99` and `$$` in a regular expression's replacement. */
export function expandReplacement(replacement: string, match: Pick<FindMatch, 'text' | 'groups'>, regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (whole, what: string) => {
    if (what === '$') return '$';
    if (what === '&') return match.text;
    const n = Number(what);
    if (n >= 1 && n <= match.groups.length) return match.groups[n - 1];
    // $12 with one group: $1 then "2", as String.replace reads it.
    if (what.length === 2) {
      const one = Number(what.charAt(0));
      if (one >= 1 && one <= match.groups.length) return match.groups[one - 1] + what.charAt(1);
    }
    return whole;
  });
}

function escapeLabelHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>');
}

/**
 * The label with one match replaced. The new text goes where the first
 * replaced character of label text was; tags within the range are kept
 * around it (draw.io's replaceInLabel keeps them too).
 */
function replaceRange(value: string, html: boolean, model: TextModel, match: FindMatch, text: string): string {
  if (!html) return value.slice(0, match.from) + text + value.slice(match.to);
  const from = match.from;
  const to = match.to;
  // The first character of label text in the match (not a <br> or a block edge).
  let anchor = -1;
  for (let k = match.start; k < match.end; k++) {
    if (!model.virtual[k]) {
      anchor = model.starts[k];
      break;
    }
  }
  if (anchor < 0) anchor = to;
  const tagsIn = model.tags.filter(([s, e]) => s >= from && e <= to);
  const before = tagsIn.filter(([s]) => s < anchor).map(([s, e]) => value.slice(s, e)).join('');
  const after = tagsIn.filter(([s]) => s >= anchor).map(([s, e]) => value.slice(s, e)).join('');
  return value.slice(0, from) + before + escapeLabelHtml(text) + after + value.slice(to);
}

/** The element and label a slot names, in a deck (a draft being changed). */
function slotTarget(deck: Deck, slideId: string, elementId: string, labelCell: string | null): {
  slide: Slide; el: VertexEl | ConnectorEl; get: () => string; set: (v: string) => void; dio: string; html: boolean;
} | null {
  const slide = deck.slides.find((s) => s.id === slideId);
  const el = slide?.elements.find((e) => e.id === elementId);
  if (!slide || !el || (el.type !== 'vertex' && el.type !== 'connector')) return null;
  if (labelCell == null) {
    return {
      slide, el, dio: el.dio, html: isHtml(el.dio, el.type === 'vertex' ? 'vertex' : 'edge'),
      get: () => el.label, set: (v) => { el.label = v; },
    };
  }
  if (el.type !== 'connector') return null;
  const label = el.labels.find((l) => l.cell === labelCell);
  if (!label) return null;
  return { slide, el, dio: label.dio, html: isHtml(label.dio, 'vertex'), get: () => label.label, set: (v) => { label.label = v; } };
}

/** draw.io's isCellEditable for a label: not locked, no `editable=0`. */
function editable(target: NonNullable<ReturnType<typeof slotTarget>>): boolean {
  if (getStyleValue(target.dio, 'editable') === '0' || getStyleValue(target.el.dio, 'editable') === '0') return false;
  return !isCellLocked(target.slide, target.el, new DiagramTree(target.slide));
}

export interface ReplaceResult {
  /** Where the search goes on: just after the new text. */
  next: FindPosition;
}

/**
 * Replace one match (from findMatches) in `deck`, a draft the caller
 * commits. The label must still hold that match; data matches, locked and
 * non-editable cells are left alone. Returns null when nothing changed.
 */
export function replaceMatch(deck: Deck, match: FindMatch, replacement: string, options: FindOptions): ReplaceResult | null {
  if (match.kind !== 'label') return null;
  const target = slotTarget(deck, match.slideId, match.elementId, match.labelCell);
  if (!target || !editable(target)) return null;
  const pattern = findPattern(options);
  if (pattern == null) return null;
  const value = target.get();
  const model = textModel(value, target.html);
  const slot: LabelSlot = {
    slideIndex: match.slideIndex, slideId: match.slideId, elementId: match.elementId, labelCell: match.labelCell,
    ordinal: match.ordinal, html: target.html, value, cell: '', attrs: null,
  };
  const current = slotMatches(slot, pattern, { ...options, data: false }).find((m) => m.start === match.start && m.end === match.end);
  if (!current) return null;
  const text = expandReplacement(replacement, current, options.regex === true);
  const next = replaceRange(value, target.html, model, current, text);
  if (next !== value) target.set(next);
  const added = textModel(target.html ? escapeLabelHtml(text) : text, target.html).text.length;
  return {
    next: {
      slideId: match.slideId, elementId: match.elementId, labelCell: match.labelCell,
      offset: current.start + added - 1,
    },
  };
}

/**
 * Replace every match in `where` (draw.io's Replace All) in `deck`, a
 * draft the caller commits as one change. Returns how many were replaced.
 */
export function replaceAll(deck: Deck, where: FindScope, replacement: string, options: FindOptions): number {
  const pattern = findPattern(options);
  if (pattern == null) return 0;
  let count = 0;
  for (const slot of labelSlots(deck, where)) {
    const target = slotTarget(deck, slot.slideId, slot.elementId, slot.labelCell);
    if (!target || !editable(target)) continue;
    const matches = slotMatches(slot, pattern, { ...options, data: false });
    if (matches.length === 0) continue;
    const model = textModel(slot.value, slot.html);
    let value = slot.value;
    // Last first: each replacement keeps within its own range, so earlier ranges stay put.
    for (let i = matches.length - 1; i >= 0; i--) {
      value = replaceRange(value, slot.html, model, matches[i], expandReplacement(replacement, matches[i], options.regex === true));
      count += 1;
    }
    if (value !== slot.value) target.set(value);
  }
  return count;
}

/** The searchable text of a label (for tests and the status line). */
export function searchableText(value: string, html: boolean): string {
  return textModel(value, html).text;
}
