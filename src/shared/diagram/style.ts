/*
 * Style semantics follow draw.io (jgraph/drawio 32.7.4, Apache License 2.0):
 * mxgraph/src/view/mxStylesheet.js (getCellStyle), styles/default.xml (the
 * named styles below, copied verbatim) and Graph.replaceDefaultColors.
 */

import type { Style } from './types.js';

/**
 * draw.io style strings: `[name;]key=value;…`.
 *
 * - A token without `=` merges a named style (e.g. `ellipse`, `text`, `group`).
 * - `key=none` removes the key, including one a default or a named style set.
 * - A string starting with `;` skips the defaults.
 * - `default` as a colour is the theme colour: black for strokes and text,
 *   white for fills and label backgrounds (slides are light).
 *
 * The string stored on an element is never rewritten wholesale; edits go
 * through `setStyleValue`, which keeps the order and spelling of every
 * other entry, so a style written by draw.io round-trips unchanged.
 */

type NamedStyle = Record<string, string>;

const DEFAULT_VERTEX: NamedStyle = {
  shape: 'label', perimeter: 'rectanglePerimeter', fontSize: '12', fontFamily: 'Helvetica',
  align: 'center', verticalAlign: 'middle', fillColor: 'default', strokeColor: 'default', fontColor: 'default',
};

const DEFAULT_EDGE: NamedStyle = {
  shape: 'connector', labelBackgroundColor: 'default', endArrow: 'classic', fontSize: '11',
  fontFamily: 'Helvetica', align: 'center', verticalAlign: 'middle', rounded: '1',
  strokeColor: 'default', fontColor: 'default',
};

const FANCY: NamedStyle = { shadow: '1', glass: '1' };

function colourStyle(gradientColor: string, fillColor: string, strokeColor: string, fancy: boolean): NamedStyle {
  return { ...(fancy ? FANCY : {}), gradientColor, fillColor, strokeColor };
}

const TEXT: NamedStyle = { fillColor: 'none', gradientColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'top' };
const LABEL: NamedStyle = {
  fontStyle: '1', align: 'left', verticalAlign: 'middle', spacing: '2', spacingLeft: '52',
  imageWidth: '42', imageHeight: '42', rounded: '1',
};
const IMAGE: NamedStyle = {
  shape: 'image', labelBackgroundColor: 'default', verticalAlign: 'top', verticalLabelPosition: 'bottom',
};

/** styles/default.xml, with `extend` already applied. */
export const NAMED_STYLES: Readonly<Record<string, NamedStyle>> = {
  defaultVertex: DEFAULT_VERTEX,
  defaultEdge: DEFAULT_EDGE,
  text: TEXT,
  edgeLabel: { ...TEXT, labelBackgroundColor: 'default', fontSize: '11' },
  label: LABEL,
  icon: {
    ...LABEL, align: 'center', imageAlign: 'center', verticalLabelPosition: 'bottom', verticalAlign: 'top',
    spacingTop: '6', labelBackgroundColor: 'default', spacing: '0', spacingLeft: '0', fontStyle: '0',
    imageWidth: '48', imageHeight: '48',
  },
  swimlane: { shape: 'swimlane', fontSize: '12', fontStyle: '1', startSize: '23' },
  group: { verticalAlign: 'top', fillColor: 'none', strokeColor: 'none', gradientColor: 'none', pointerEvents: '0' },
  ellipse: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
  rhombus: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
  triangle: { shape: 'triangle', perimeter: 'trianglePerimeter' },
  line: { shape: 'line', strokeWidth: '4', labelBackgroundColor: 'default', verticalAlign: 'top', spacingTop: '8' },
  image: IMAGE,
  roundImage: { ...IMAGE, perimeter: 'ellipsePerimeter' },
  rhombusImage: { ...IMAGE, perimeter: 'rhombusPerimeter' },
  arrow: { shape: 'arrow', edgeStyle: 'none', fillColor: 'default' },
  fancy: FANCY,
  gray: colourStyle('#B3B3B3', '#F5F5F5', '#666666', true),
  blue: colourStyle('#7EA6E0', '#DAE8FC', '#6C8EBF', true),
  green: colourStyle('#97D077', '#D5E8D4', '#82B366', true),
  turquoise: colourStyle('#67AB9F', '#D5E8D4', '#6A9153', true),
  yellow: colourStyle('#FFD966', '#FFF2CC', '#D6B656', true),
  orange: colourStyle('#FFA500', '#FFCD28', '#D79B00', true),
  red: colourStyle('#EA6B66', '#F8CECC', '#B85450', true),
  pink: colourStyle('#B5739D', '#E6D0DE', '#996185', true),
  purple: colourStyle('#8C6C9C', '#E1D5E7', '#9673A6', true),
  'plain-gray': colourStyle('#B3B3B3', '#F5F5F5', '#666666', false),
  'plain-blue': colourStyle('#7EA6E0', '#DAE8FC', '#6C8EBF', false),
  'plain-green': colourStyle('#97D077', '#D5E8D4', '#82B366', false),
  'plain-turquoise': colourStyle('#67AB9F', '#D5E8D4', '#6A9153', false),
  'plain-yellow': colourStyle('#FFD966', '#FFF2CC', '#D6B656', false),
  'plain-orange': colourStyle('#FFA500', '#FFCD28', '#D79B00', false),
  'plain-red': colourStyle('#EA6B66', '#F8CECC', '#B85450', false),
  'plain-pink': colourStyle('#B5739D', '#E6D0DE', '#996185', false),
  'plain-purple': colourStyle('#8C6C9C', '#E1D5E7', '#9673A6', false),
};

export interface StyleEntry {
  /** null for a named-style token. */
  key: string | null;
  value: string;
}

/** The tokens of a style string in order; empty tokens dropped. */
export function parseStyleString(text: string | null | undefined): StyleEntry[] {
  const entries: StyleEntry[] = [];
  if (!text) return entries;
  for (const token of text.split(';')) {
    if (token === '') continue;
    const at = token.indexOf('=');
    if (at >= 0) entries.push({ key: token.slice(0, at), value: token.slice(at + 1) });
    else entries.push({ key: null, value: token });
  }
  return entries;
}

export function serializeStyle(entries: readonly StyleEntry[]): string {
  if (entries.length === 0) return '';
  return `${entries.map((e) => (e.key == null ? e.value : `${e.key}=${e.value}`)).join(';')};`;
}

/** The value written for `key` in the string itself (not resolved), or null. */
export function getStyleValue(text: string | null | undefined, key: string): string | null {
  let found: string | null = null;
  for (const entry of parseStyleString(text)) if (entry.key === key) found = entry.value;
  return found;
}

/**
 * Sets (or with `null` removes) one key, keeping every other entry as it
 * was written. A new key goes at the end, as mxUtils.setStyle does.
 */
export function setStyleValue(text: string | null | undefined, key: string, value: string | number | null): string {
  const leading = (text ?? '').startsWith(';');
  const entries = parseStyleString(text);
  const next: StyleEntry[] = [];
  let placed = false;
  for (const entry of entries) {
    if (entry.key === key) {
      if (value != null && !placed) next.push({ key, value: String(value) });
      placed = true;
    } else {
      next.push(entry);
    }
  }
  if (!placed && value != null) next.push({ key, value: String(value) });
  const out = serializeStyle(next);
  return leading ? `;${out}` : out;
}

/** The named styles a string names, in order (e.g. `ellipse`, `text`). */
export function styleNames(text: string | null | undefined): string[] {
  return parseStyleString(text).filter((e) => e.key == null).map((e) => e.value);
}

export interface ResolveOptions {
  /** Colour `default` resolves to for fills and label backgrounds. */
  background?: string;
  /** Colour `default` resolves to for strokes and text. */
  foreground?: string;
}

const FOREGROUND_KEYS = ['fontColor', 'gradientColor', 'strokeColor', 'imageBorder', 'labelBorderColor'];
const BACKGROUND_KEYS = ['fillColor', 'imageBackground', 'swimlaneFillColor', 'labelBackgroundColor'];

/**
 * The style draw.io draws a cell with: mxStylesheet.getCellStyle over the
 * vertex or edge defaults, then Graph.replaceDefaultColors.
 */
export function resolveStyle(text: string | null | undefined, kind: 'vertex' | 'edge', options: ResolveOptions = {}): Style {
  const base = kind === 'edge' ? DEFAULT_EDGE : DEFAULT_VERTEX;
  const style: Style = (text ?? '').startsWith(';') ? {} : { ...base };
  for (const entry of parseStyleString(text)) {
    if (entry.key == null) {
      const named = Object.prototype.hasOwnProperty.call(NAMED_STYLES, entry.value) ? NAMED_STYLES[entry.value] : null;
      if (named) Object.assign(style, named);
    } else if (entry.value === 'none') {
      delete style[entry.key];
    } else {
      style[entry.key] = entry.value;
    }
  }
  const fg = options.foreground ?? '#000000';
  const bg = options.background ?? '#ffffff';
  for (const key of FOREGROUND_KEYS) if (style[key] === 'default') style[key] = fg;
  for (const key of BACKGROUND_KEYS) if (style[key] === 'default') style[key] = bg;
  return style;
}

// --- typed accessors (mxUtils.getValue / getNumber semantics) ---------------

export function styleString(style: Style, key: string, fallback: string): string;
export function styleString(style: Style, key: string, fallback?: string | null): string | null;
export function styleString(style: Style, key: string, fallback: string | null = null): string | null {
  const value = style[key];
  return value == null ? fallback : value;
}

export function styleNumber(style: Style, key: string, fallback: number): number {
  const value = style[key];
  if (value == null) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** draw.io flags are `1`/`0` (sometimes `true`/`false`). */
export function styleFlag(style: Style, key: string, fallback = false): boolean {
  const value = style[key];
  if (value == null) return fallback;
  return value === '1' || value === 'true';
}

/** A colour, or null for none/absent. */
export function styleColor(style: Style, key: string, fallback: string | null = null): string | null {
  const value = style[key];
  if (value == null) return fallback;
  if (value === 'none' || value === '') return null;
  return value;
}

/** fontStyle bit flags. */
export const FONT_BOLD = 1;
export const FONT_ITALIC = 2;
export const FONT_UNDERLINE = 4;
export const FONT_STRIKETHROUGH = 8;
