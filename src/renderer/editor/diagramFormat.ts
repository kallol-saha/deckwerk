/*
 * The panel follows draw.io's Format panel (jgraph/drawio 32.7.4,
 * Copyright (c) 2006-2024, JGraph Ltd and draw.io AG, Apache License 2.0):
 * js/grapheditor/Format.js (StyleFormatPanel, TextFormatPanel, ArrangePanel)
 * and js/diagramly/Editor.js (the colour schemes and the Property list).
 * Modified for DeckWerk: built from DeckWerk's inspector controls, every
 * change one undoable store edit; the logic lives in shared/diagram/format.ts.
 */

/**
 * draw.io's Format panel for diagram cells, inside DeckWerk's inspector: the
 * Style, Text and Arrange tabs for every selected `vertex` and `connector`.
 *
 * The panel is rebuilt by the inspector after every change, like the rest of
 * the inspector; what it has to remember between rebuilds (the open tab, the
 * folded sections, the colour scheme row, a copied style) is kept here.
 */

import './diagramFormat.css';
import { isDiagramElement, type DiagramEl, type Slide } from '@shared/deck.js';
import * as F from '@shared/diagram/format.js';
import { edgeSvg } from '@shared/diagram/paint.js';
import { resolveStyle } from '@shared/diagram/style.js';
import { arrangeSelection, type ArrangeDirection } from './arrange.js';
import { colorField, colorForInput } from './colorPicker.js';
import type { EditorStore } from './store.js';
import { closePopover, openAnchoredPopover } from './ui.js';

export {
  clearDefaultStyle, defaultEdgeStyle, defaultVertexStyle, storeDefaultStyle,
} from '@shared/diagram/format.js';

type Tab = 'style' | 'text' | 'arrange';

/** What the panel keeps between rebuilds. */
const memory = {
  tab: 'style' as Tab,
  /** Sections folded or unfolded by hand, by id; the rest use draw.io's default. */
  folded: new Map<string, boolean>(),
  scheme: 0,
  /** Copy Style (EditorUi.copiedStyle). */
  copied: null as F.CopiedStyle | null,
  /** The colour a row had before its box was unticked, to restore on a second click. */
  lastColor: new Map<string, string>(),
  distributeSpacing: false,
};

/** The copied style, for other commands (a context menu, a shortcut). */
export function copiedDiagramStyle(): F.CopiedStyle | null {
  return memory.copied;
}

/**
 * HOOK (Group / Ungroup): src/renderer/editor/diagramCommands.ts registers
 * draw.io's group commands here; the Arrange tab shows their buttons only
 * once something is registered. This panel does not group anything itself.
 */
export interface DiagramGroupCommands {
  group?: { run: (store: EditorStore) => void; enabled?: (store: EditorStore) => boolean; title?: string };
  ungroup?: { run: (store: EditorStore) => void; enabled?: (store: EditorStore) => boolean; title?: string };
  /** draw.io's "Remove from Group". */
  removeFromGroup?: { run: (store: EditorStore) => void; enabled?: (store: EditorStore) => boolean; title?: string };
}

let groupCommands: DiagramGroupCommands = {};

export function registerDiagramGroupCommands(commands: DiagramGroupCommands): void {
  groupCommands = { ...groupCommands, ...commands };
}

/**
 * HOOK (more sections): other modules add a section to the end of a tab —
 * a table's row and column commands (diagramTable.ts), the diagram's
 * options such as Mathematical Typesetting (diagramMath.ts). Each is asked
 * on every rebuild and returns its section for the selected cells, or null.
 */
export type DiagramPanelSection = (store: EditorStore, cells: DiagramEl[]) => HTMLElement | null;
const extraSections: Record<Tab, DiagramPanelSection[]> = { style: [], text: [], arrange: [] };

export function registerDiagramPanelSection(tab: 'style' | 'text' | 'arrange', build: DiagramPanelSection): void {
  extraSections[tab].push(build);
}

/** The panel's own controls, for the sections other modules add. */
export const formatControls = {
  section: (title: string, id: string, foldedByDefault = false) => section(title, id, foldedByDefault),
  checkbox: (label: string, value: boolean, onChange: (on: boolean) => void, data?: string, disabled = false) =>
    checkbox(label, value, onChange, data, disabled),
  button: (label: string, onClick: () => void, title = label, data?: string) => textButton(label, onClick, title, data),
  row: (label: string, ...controls: Array<HTMLElement | null>) => row(label, ...controls),
};

// --- small controls --------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function svgIcon(body: string, viewBox: string, className = 'dfmt-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  svg.innerHTML = body;
  return svg;
}

function textButton(label: string, onClick: (event: MouseEvent) => void, title = label, data?: string): HTMLButtonElement {
  const b = el('button', 'dfmt-button', label);
  b.type = 'button';
  b.title = title;
  if (data) b.dataset.dfmt = data;
  b.addEventListener('click', onClick);
  return b;
}

function iconButton(body: string, viewBox: string, title: string, onClick: () => void, active = false, data?: string): HTMLButtonElement {
  const b = el('button', 'dfmt-icon-button');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.setAttribute('aria-pressed', String(active));
  if (active) b.classList.add('is-active');
  if (data) b.dataset.dfmt = data;
  b.appendChild(svgIcon(body, viewBox));
  b.addEventListener('pointerdown', (event) => event.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}

/** A labelled row: name on the left, controls on the right. */
function row(label: string, ...controls: Array<HTMLElement | null>): HTMLElement {
  const r = el('div', 'dfmt-row');
  if (label) {
    const name = el('span', 'dfmt-row-label', label);
    name.title = label;
    r.appendChild(name);
  }
  const box = el('div', 'dfmt-row-controls');
  for (const c of controls) if (c) box.appendChild(c);
  r.appendChild(box);
  return r;
}

function checkbox(label: string, value: boolean | F.Mixed, onChange: (on: boolean) => void, data?: string, disabled = false): HTMLElement {
  const wrap = el('label', 'dfmt-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = value === true;
  input.indeterminate = value === F.MIXED;
  input.disabled = disabled;
  if (data) wrap.dataset.dfmt = data;
  input.addEventListener('change', () => onChange(input.checked));
  const span = el('span', '', label);
  wrap.title = label;
  wrap.append(input, span);
  return wrap;
}

function numberInput(
  value: number | string | F.Mixed | null,
  onCommit: (value: number) => void,
  opts: { title: string; unit?: string; min?: number; max?: number; step?: number; data?: string; onEmpty?: () => void; placeholder?: string } ,
): HTMLElement {
  const wrap = el('label', 'dfmt-number');
  wrap.title = opts.title;
  const input = el('input');
  input.type = 'number';
  input.step = String(opts.step ?? 1);
  if (opts.min != null) input.min = String(opts.min);
  if (opts.max != null) input.max = String(opts.max);
  input.setAttribute('aria-label', opts.title);
  if (opts.data) input.dataset.dfmt = opts.data;
  if (value === F.MIXED || value == null) {
    input.value = '';
    input.placeholder = value === F.MIXED ? '—' : opts.placeholder ?? '';
  } else {
    const n = typeof value === 'number' ? value : parseFloat(value);
    input.value = Number.isFinite(n) ? String(F.round2(n)) : '';
    if (!Number.isFinite(n)) input.placeholder = String(value);
  }
  input.addEventListener('change', () => {
    if (input.value.trim() === '') {
      opts.onEmpty?.();
      return;
    }
    let n = Number(input.value);
    if (!Number.isFinite(n)) return;
    if (opts.min != null) n = Math.max(opts.min, n);
    if (opts.max != null) n = Math.min(opts.max, n);
    onCommit(n);
  });
  wrap.appendChild(input);
  if (opts.unit) wrap.appendChild(el('span', 'dfmt-unit', opts.unit));
  return wrap;
}

function selectInput(
  options: ReadonlyArray<{ value: string; title: string }>,
  value: string | F.Mixed | null,
  onChange: (value: string) => void,
  title: string,
  data?: string,
): HTMLSelectElement {
  const select = el('select', 'dfmt-select');
  select.title = title;
  select.setAttribute('aria-label', title);
  if (data) select.dataset.dfmt = data;
  if (value === F.MIXED) {
    const mixed = el('option', '', 'Mixed');
    mixed.value = '__mixed__';
    mixed.disabled = true;
    select.appendChild(mixed);
  }
  for (const o of options) {
    const opt = el('option', '', o.title);
    opt.value = o.value;
    select.appendChild(opt);
  }
  select.value = value === F.MIXED ? '__mixed__' : value ?? '';
  select.addEventListener('change', () => {
    if (select.value !== '__mixed__') onChange(select.value);
  });
  return select;
}

/** A section with a title that folds, as draw.io's collapsible sections do. */
function section(title: string, id: string, foldedByDefault = false, foldable = true): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', 'dfmt-section');
  root.dataset.section = id;
  const head = el('div', 'dfmt-section-head');
  const body = el('div', 'dfmt-section-body');
  if (foldable) {
    const toggle = el('button', 'dfmt-section-toggle');
    toggle.type = 'button';
    const caret = el('span', 'dfmt-caret');
    toggle.append(caret, el('span', 'dfmt-section-title', title));
    const folded = memory.folded.get(id) ?? foldedByDefault;
    root.classList.toggle('is-folded', folded);
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.addEventListener('click', () => {
      const now = !root.classList.contains('is-folded');
      root.classList.toggle('is-folded', now);
      toggle.setAttribute('aria-expanded', String(!now));
      memory.folded.set(id, now);
    });
    head.appendChild(toggle);
  } else {
    head.appendChild(el('span', 'dfmt-section-title', title));
  }
  root.append(head, body);
  return { root, body };
}

interface MenuEntry {
  icon: SVGElement | null;
  title: string;
  data?: Record<string, string>;
  active?: boolean;
  onPick: () => void;
}

/** An icon grid in a popover (draw.io's style menus). */
function iconMenu(trigger: HTMLElement, items: MenuEntry[], columns: number): void {
  const pop = el('div', 'dfmt-menu');
  pop.style.setProperty('--dfmt-columns', String(columns));
  pop.setAttribute('role', 'menu');
  for (const item of items) {
    const b = el('button', 'dfmt-menu-item');
    b.type = 'button';
    b.title = item.title;
    b.setAttribute('aria-label', item.title);
    b.setAttribute('role', 'menuitem');
    if (item.active) b.classList.add('is-active');
    for (const [k, v] of Object.entries(item.data ?? {})) b.dataset[k] = v;
    if (item.icon) b.appendChild(item.icon);
    else b.appendChild(el('span', 'dfmt-menu-text', item.title));
    b.addEventListener('click', () => {
      closePopover();
      item.onPick();
    });
    pop.appendChild(b);
  }
  openAnchoredPopover(trigger, pop, { beside: trigger.closest('#side') ?? trigger.closest('.editor-inspector') });
}

function menuTrigger(content: Node, title: string, data: string): HTMLButtonElement {
  const b = el('button', 'dfmt-menu-trigger');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.setAttribute('aria-haspopup', 'menu');
  b.dataset.dfmt = data;
  b.append(content, el('span', 'dfmt-menu-arrow'));
  return b;
}

// --- previews -----------------------------------------------------------------------

/** A Line start / Line end entry as draw.io draws it (the end mirrored), or the marker itself. */
function markerIcon(choice: F.MarkerChoice | { marker: string; fill: 0 | 1 | null; path: string | null; filled: boolean }, start: boolean): SVGSVGElement {
  if (choice.marker === 'none') {
    return svgIcon('<path transform="translate(4,2)" stroke-width="2" d="M 0 8 L 24 8" stroke="currentColor" fill="none"/>', '0 0 32 20', 'dfmt-marker');
  }
  let body: string;
  if (choice.path) {
    body = `<path transform="translate(4,2)" stroke-width="2" d="${choice.path}" stroke="currentColor" fill="${choice.filled ? 'currentColor' : 'none'}"/>`;
  } else {
    // A marker draw.io's menu does not list: painted by the diagram engine.
    const style = resolveStyle(`startArrow=${choice.marker};startFill=${choice.fill ?? 1};endArrow=none;strokeColor=currentColor;fillColor=none;`, 'edge');
    body = edgeSvg(style, [{ x: 6, y: 10 }, { x: 30, y: 10 }], { idPrefix: `dfmt-${choice.marker}` });
  }
  const svg = svgIcon(start ? body : `<g transform="matrix(-1 0 0 1 32 0)">${body}</g>`, '0 0 32 20', 'dfmt-marker');
  return svg;
}

function dashPreview(pattern: string): SVGSVGElement {
  const dash = pattern === 'solid' ? '' : pattern === 'dashed' ? '3 3' : pattern.split(' ').map((n) => String(Number(n) / 2)).join(' ');
  return svgIcon(`<line x1="2" y1="5" x2="62" y2="5" stroke="currentColor" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`, '0 0 64 10', 'dfmt-dash');
}

// --- the panel -----------------------------------------------------------------------

export interface DiagramFormatOptions {
  store: EditorStore;
  /** The selected diagram cells (other selected objects keep the normal inspector). */
  cells: DiagramEl[];
}

/** draw.io's Format panel for the selected diagram cells. */
export function diagramFormatPanel({ store, cells }: DiagramFormatOptions): HTMLElement {
  const panel = el('div', 'dfmt');
  panel.dataset.dfmt = 'panel';
  if (cells.length === 0) return panel;
  const ctx = new PanelContext(store, cells);

  const tabs = el('div', 'dfmt-tabs');
  tabs.setAttribute('role', 'tablist');
  const bodies: Record<Tab, HTMLElement> = {
    style: ctx.styleTab(),
    text: ctx.textTab(),
    arrange: ctx.arrangeTab(),
  };
  const names: Record<Tab, string> = { style: 'Style', text: 'Text', arrange: 'Arrange' };
  const buttons: HTMLButtonElement[] = [];
  const show = (tab: Tab) => {
    memory.tab = tab;
    for (const b of buttons) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const [key, body] of Object.entries(bodies)) body.hidden = key !== tab;
  };
  for (const tab of ['style', 'text', 'arrange'] as Tab[]) {
    const b = el('button', 'dfmt-tab', names[tab]);
    b.type = 'button';
    b.dataset.tab = tab;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => show(tab));
    buttons.push(b);
    tabs.appendChild(b);
  }
  panel.appendChild(tabs);
  for (const tab of ['style', 'text', 'arrange'] as Tab[]) {
    for (const build of extraSections[tab]) {
      const extra = build(store, cells);
      if (extra) bodies[tab].appendChild(extra);
    }
    bodies[tab].classList.add('dfmt-tab-body');
    bodies[tab].dataset.tabBody = tab;
    bodies[tab].setAttribute('role', 'tabpanel');
    panel.appendChild(bodies[tab]);
  }
  show(memory.tab);
  return panel;
}

class PanelContext {
  readonly ss: F.SelectionState;
  readonly style: F.Style;
  readonly vertices: DiagramEl[];
  readonly edges: DiagramEl[];
  readonly edgesOnly: boolean;
  readonly verticesOnly: boolean;

  constructor(readonly store: EditorStore, readonly cells: DiagramEl[]) {
    this.ss = F.selectionState(cells);
    this.style = this.ss.style;
    this.vertices = this.ss.vertices;
    this.edges = this.ss.edges;
    this.edgesOnly = this.edges.length === cells.length;
    this.verticesOnly = this.vertices.length === cells.length;
  }

  // -- edits ---------------------------------------------------------------------

  /** One undoable edit over the selected diagram cells. */
  update(label: string, fn: (cell: DiagramEl) => void, only?: (cell: DiagramEl) => boolean): void {
    this.store.updateSelected((e) => {
      if (isDiagramElement(e) && (!only || only(e))) fn(e);
    }, { label });
  }

  /** Graph.setCellStyles: one undo step setting keys on every selected cell (or those `only` keeps). */
  setStyle(label: string, changes: F.StyleChanges | ((cell: DiagramEl) => F.StyleChanges), only?: (cell: DiagramEl) => boolean): void {
    this.update(label, (cell) => F.applyStyleChanges(cell, typeof changes === 'function' ? changes(cell) : changes), only);
  }

  /** One undoable edit with the whole slide in reach (geometry that moves children too). */
  commitSlide(label: string, fn: (selected: DiagramEl[], slide: Slide) => void): void {
    const { slideIndex, selection } = this.store.get();
    this.store.commit((deck) => {
      const slide = deck.slides[slideIndex];
      if (!slide) return;
      const selected = slide.elements.filter((e): e is DiagramEl => selection.has(e.id) && isDiagramElement(e));
      fn(selected, slide);
    }, { label });
  }

  // -- shared controls -------------------------------------------------------------

  /**
   * BaseFormatPanel.createCellColorOption: a box that switches the colour on
   * (`defaultColor`, or the colour it had) and off (none), and the swatch.
   */
  colorRow(label: string, key: string, opts: {
    defaultColor?: string;
    resolvedDefault: string;
    onSet?: (value: string) => void;
    hideCheckbox?: boolean;
    only?: (cell: DiagramEl) => boolean;
    extra?: HTMLElement | null;
  }): HTMLElement {
    const value = F.sharedValue(opts.only ? this.cells.filter(opts.only) : this.cells, key, null);
    const defaultColor = opts.defaultColor ?? 'default';
    const apply = opts.onSet ?? ((v: string) => this.setStyle(`Change ${label.toLowerCase()}`, F.setKey(key, v), opts.only));
    const on = value !== F.MIXED && value != null && value !== 'none' && value !== 'inherit';
    const r = el('div', 'dfmt-row dfmt-color-row');
    r.dataset.key = key;
    const head = el('label', 'dfmt-check');
    head.title = label;
    const box = el('input');
    box.type = 'checkbox';
    box.checked = on;
    box.indeterminate = value === F.MIXED;
    box.dataset.dfmt = `${key}-on`;
    box.addEventListener('change', () => {
      if (box.checked) apply(memory.lastColor.get(key) ?? defaultColor);
      else {
        if (typeof value === 'string' && value !== 'none') memory.lastColor.set(key, value);
        apply('none');
      }
    });
    if (opts.hideCheckbox || F.isSpecialColor(value === F.MIXED ? null : value)) box.hidden = true;
    head.append(box, el('span', '', label));
    const controls = el('div', 'dfmt-row-controls');
    if (opts.extra) controls.appendChild(opts.extra);
    if (on || value === F.MIXED || opts.hideCheckbox) {
      const shown = value === F.MIXED ? null : value;
      const isDefault = shown === 'default';
      const hex = shown && !isDefault ? colorForInput(shown) : null;
      const field = colorField(label, isDefault ? null : hex ?? shown, (picked) => {
        if (picked == null) apply('default');
        else apply(colorForInput(picked) ?? picked);
      }, {
        mixed: value === F.MIXED,
        clear: { kind: 'theme', label: 'Default' },
        inheritedValue: isDefault ? opts.resolvedDefault : undefined,
        ...(isDefault ? { source: { kind: 'theme' as const, label: 'Default colour', preview: opts.resolvedDefault } } : {}),
      });
      field.classList.add('dfmt-color');
      field.dataset.dfmt = `${key}-color`;
      controls.appendChild(field);
    }
    r.append(head, controls);
    return r;
  }

  /** BaseFormatPanel.createCellOption over the selection. */
  option(label: string, key: string, opts: {
    defaultOn?: boolean; enabledValue?: string | number | null; disabledValue?: string | number | null;
    changes?: (on: boolean, cell: DiagramEl) => F.StyleChanges; only?: (cell: DiagramEl) => boolean; disabled?: boolean;
  } = {}): HTMLElement {
    const enabled = opts.enabledValue === undefined ? 1 : opts.enabledValue;
    const disabledValue = opts.disabledValue === undefined ? 0 : opts.disabledValue;
    const cells = opts.only ? this.cells.filter(opts.only) : this.cells;
    let shared: boolean | F.Mixed | undefined;
    for (const cell of cells) {
      const raw = F.cellStyle(cell)[key] ?? (opts.defaultOn ? String(enabled) : null);
      // A flag written as 0 is off whatever unticking writes (noLabel=0, shadow=0).
      const isOn = raw != null && raw !== String(disabledValue) && !(raw === '0' && String(enabled) === '1');
      if (shared === undefined) shared = isOn;
      else if (shared !== isOn) shared = F.MIXED;
    }
    return checkbox(label, shared ?? false, (on) => this.setStyle(label, (cell) => (opts.changes
      ? opts.changes(on, cell)
      : F.optionChanges(key, on, enabled, disabledValue)), opts.only), `opt-${key}`, opts.disabled);
  }

  /** installInputHandler: a number for one key, `fallback` where unset. */
  numberKey(title: string, key: string, fallback: number, opts: {
    unit?: string; min?: number; max?: number; step?: number; label?: string;
    changes?: (value: number, cell: DiagramEl) => F.StyleChanges; only?: (cell: DiagramEl) => boolean;
  } = {}): HTMLElement {
    const cells = opts.only ? this.cells.filter(opts.only) : this.cells;
    const value = F.sharedNumber(cells, key, fallback);
    return numberInput(value, (n) => this.setStyle(opts.label ?? `Change ${title.toLowerCase()}`,
      (cell) => (opts.changes ? opts.changes(n, cell) : F.setKey(key, n)), opts.only), {
      title, unit: opts.unit, min: opts.min, max: opts.max, step: opts.step, data: key,
    });
  }

  // -- Style tab -----------------------------------------------------------------------

  styleTab(): HTMLElement {
    const root = el('div');
    const { ss } = this;
    if (ss.cells.length > 0) root.appendChild(this.schemes());
    if (ss.fill) root.appendChild(this.fillSection());
    root.appendChild(this.lineSection());
    const opacity = row('Opacity', this.numberKey('Opacity', 'opacity', 100, { unit: '%', min: 0, max: 100 }));
    opacity.classList.add('dfmt-opacity-row');
    root.appendChild(opacity);
    root.appendChild(this.effectsSection());
    const props = this.propertiesSection();
    if (props) root.appendChild(props);
    root.appendChild(this.styleOps());
    return root;
  }

  /** StyleFormatPanel.addStyles: draw.io's colour schemes, one row at a time. */
  schemes(): HTMLElement {
    const wrap = el('div', 'dfmt-schemes');
    const grid = el('div', 'dfmt-scheme-grid');
    const dots = el('div', 'dfmt-scheme-dots');
    const paint = () => {
      grid.replaceChildren();
      const schemes = F.COLOR_SCHEMES[memory.scheme] ?? F.COLOR_SCHEMES[0];
      schemes.forEach((scheme, index) => {
        const b = el('button', 'dfmt-scheme');
        b.type = 'button';
        const title = scheme.fill === '' && scheme.stroke === '' ? 'Default' : `Style ${index + 1}`;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.dataset.scheme = `${memory.scheme}-${index}`;
        const fill = scheme.fill;
        if (scheme.gradient) b.style.backgroundImage = `linear-gradient(${fill} 0px, ${scheme.gradient} 100%)`;
        else if (fill === 'none') b.classList.add('is-none');
        else if (fill == null || fill === '') b.style.backgroundColor = '#ffffff';
        else b.style.backgroundColor = fill;
        b.style.borderColor = scheme.stroke && scheme.stroke !== '' ? scheme.stroke : '#000000';
        if (scheme.font) b.style.color = scheme.font;
        b.textContent = scheme.font ? 'Aa' : '';
        b.addEventListener('click', (event) => {
          const mods: F.SchemeModifiers = { keepFill: event.shiftKey, keepFont: event.ctrlKey || event.metaKey, keepStroke: event.altKey };
          this.setStyle('Apply style', (cell) => F.colorSchemeChanges(cell, scheme, mods));
        });
        grid.appendChild(b);
      });
      dots.querySelectorAll<HTMLElement>('.dfmt-scheme-dot').forEach((dot, i) => dot.classList.toggle('is-active', i === memory.scheme));
    };
    const step = (delta: number) => {
      const n = F.COLOR_SCHEMES.length;
      memory.scheme = (((memory.scheme + delta) % n) + n) % n;
      paint();
    };
    const prev = iconButton('<path d="M9 3 5 7l4 4" fill="none" stroke="currentColor" stroke-width="1.5"/>', '0 0 14 14', 'Previous colours', () => step(-1));
    const next = iconButton('<path d="m5 3 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/>', '0 0 14 14', 'Next colours', () => step(1));
    F.COLOR_SCHEMES.forEach((_, i) => {
      const dot = el('button', 'dfmt-scheme-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Colours ${i + 1}`);
      dot.addEventListener('click', () => {
        memory.scheme = i;
        paint();
      });
      dots.appendChild(dot);
    });
    const body = el('div', 'dfmt-scheme-body');
    body.append(prev, grid, next);
    wrap.append(body, dots);
    paint();
    return wrap;
  }

  /** StyleFormatPanel.addFill. */
  fillSection(): HTMLElement {
    const { root, body } = section('Fill', 'fill');
    const fillKey = F.fillKeyOf(this.style);
    body.appendChild(this.colorRow('Fill', fillKey, { resolvedDefault: '#ffffff' }));
    const fill = this.style[fillKey];
    if (this.ss.gradient && !this.ss.containsImage && fill != null && fill !== 'none' && this.style.shape !== 'filledEdge') {
      const gradient = F.sharedValue(this.cells, 'gradientColor', null);
      const direction = gradient !== F.MIXED && gradient != null && gradient !== 'none'
        ? selectInput(F.GRADIENT_DIRECTIONS.map((d) => ({ value: d, title: d[0].toUpperCase() + d.slice(1) })),
          F.sharedValue(this.cells, 'gradientDirection', 'south') || 'south',
          (v) => this.setStyle('Change gradient', F.setKey('gradientDirection', v)), 'Gradient direction', 'gradientDirection')
        : null;
      body.appendChild(this.colorRow('Gradient', 'gradientColor', { resolvedDefault: '#000000', extra: direction }));
    }
    // Primary colours of the shape (footer, centre) and a swimlane's lane colour.
    for (const prop of F.cellProperties(this.cells)) {
      if (prop.type === 'color' && prop.primary) {
        body.appendChild(this.colorRow(prop.dispName, prop.name, { defaultColor: '#ffffff', resolvedDefault: '#ffffff' }));
      }
    }
    if (this.vertices.some((v) => F.cellStyle(v).shape === 'swimlane')) {
      body.appendChild(this.colorRow('Lane Color', 'swimlaneFillColor', { resolvedDefault: '#ffffff' }));
    }
    return root;
  }

  /** StyleFormatPanel.addStroke (+ addLineJumps). */
  lineSection(): HTMLElement {
    const { style } = this;
    const image = style.shape === 'image';
    const { root, body } = section(image ? 'Border' : 'Line', 'line');
    const strokeKey = F.strokeKeyOf(style);
    let lineStyle: HTMLElement | null = null;
    if (this.edges.length > 0 && F.edgeSupportsCurved(style)) {
      lineStyle = selectInput([
        { value: 'sharp', title: 'Sharp' }, { value: 'rounded', title: 'Rounded' }, { value: 'curved', title: 'Curved' },
      ], this.edges.length === this.cells.length ? sharedLineShape(this.edges) : F.lineShapeOf(style),
      (v) => this.setStyle('Change line style', F.lineShapeChanges(v as F.LineShapeStyle)), 'Line style', 'lineShape');
    }
    body.appendChild(this.colorRow(image ? 'Border' : 'Line', strokeKey, { resolvedDefault: '#000000', extra: lineStyle }));

    // Pattern and width (and for edges the connector shape).
    const controls: HTMLElement[] = [];
    if (this.edgesOnly) controls.push(this.edgeShapeMenu());
    controls.push(this.patternMenu());
    controls.push(numberInput(F.sharedNumber(this.cells, 'strokeWidth', 1), (n) =>
      this.setStyle('Change line width', F.setKey('strokeWidth', Math.min(999, Math.max(0, n)))), {
      title: 'Line width', unit: 'pt', min: 0, max: 999, data: 'strokeWidth',
    }));
    const patternRow = row('', ...controls);
    patternRow.classList.add('dfmt-pattern-row');
    body.appendChild(patternRow);

    if (this.edgesOnly) {
      body.appendChild(row('', this.waypointsMenu(), this.markerMenu(true), this.markerMenu(false)));
      const isEdge = (c: DiagramEl) => c.type === 'connector';
      const size = el('div', 'dfmt-pair-grid');
      size.append(
        el('span', 'dfmt-row-label', 'Size'),
        this.numberKey('Line start size', 'startSize', 6, { unit: 'pt', min: 0, max: 999, only: isEdge }),
        this.numberKey('Line end size', 'endSize', 6, { unit: 'pt', min: 0, max: 999, only: isEdge }),
        el('span', 'dfmt-row-label', 'Offset'),
        this.numberKey('Line start offset', 'sourcePerimeterSpacing', 0, {
          unit: 'pt', min: -999, max: 999, only: isEdge,
          changes: (n, cell) => F.perimeterSpacingChanges(cell, 'sourcePerimeterSpacing', n),
        }),
        this.numberKey('Line end offset', 'targetPerimeterSpacing', 0, {
          unit: 'pt', min: -999, max: 999, only: isEdge,
          changes: (n, cell) => F.perimeterSpacingChanges(cell, 'targetPerimeterSpacing', n),
        }),
        el('span'), el('span', 'dfmt-caption', 'Line Start'), el('span', 'dfmt-caption', 'Line End'),
      );
      body.appendChild(size);
      body.appendChild(this.fillToggles());
      if (this.ss.lineJumps) {
        body.appendChild(row('Line jumps',
          selectInput(F.JUMP_STYLES.map((s) => ({ value: s, title: s[0].toUpperCase() + s.slice(1) })),
            F.sharedValue(this.cells, 'jumpStyle', 'none'), (v) => this.setStyle('Change line jumps', F.setKey('jumpStyle', v)), 'Line jumps', 'jumpStyle'),
          this.numberKey('Jump size', 'jumpSize', F.DEFAULT_JUMP_SIZE, { unit: 'pt', min: 0, max: 999 })));
      }
    } else if (this.verticesOnly) {
      body.appendChild(row('Perimeter', this.numberKey('Perimeter', 'perimeterSpacing', 0, { unit: 'pt', min: 0, max: 999 })));
    }
    return root;
  }

  /** The start/end fill flags beside the markers (draw.io keeps them in the Property list). */
  fillToggles(): HTMLElement {
    const isEdge = (c: DiagramEl) => c.type === 'connector';
    const wrap = el('div', 'dfmt-check-pair');
    wrap.append(
      this.option('Start fill', 'startFill', { defaultOn: true, only: isEdge }),
      this.option('End fill', 'endFill', { defaultOn: true, only: isEdge }),
    );
    return wrap;
  }

  patternMenu(): HTMLElement {
    const current = sharedOf(this.cells, (s) => F.dashPatternOf(s));
    const preview = current === F.MIXED ? el('span', 'dfmt-menu-text', 'Mixed')
      : current === 'custom' ? el('span', 'dfmt-menu-text', 'Custom') : dashPreview(current === 'solid' ? 'solid' : current === 'dashed' ? 'dashed' : current === 'dotted' ? '1 1' : current);
    const trigger = menuTrigger(preview, 'Pattern', 'pattern');
    trigger.addEventListener('click', () => {
      const items: MenuEntry[] = F.DASH_PATTERNS.map((p) => ({
        icon: dashPreview(p.preview),
        title: p.title,
        data: { pattern: p.id },
        active: current === p.id,
        onPick: () => this.setStyle('Change pattern', F.dashChanges(p.dashed, p.pattern)),
      }));
      items.push({
        icon: null, title: 'Custom…', data: { pattern: 'custom' }, active: current === 'custom',
        onPick: () => {
          const value = window.prompt('Pattern', this.style.dashPattern ?? '8 4 1 4');
          if (value != null && value.trim() !== '') this.setStyle('Change pattern', F.dashChanges('1', value.trim()));
        },
      });
      iconMenu(trigger, items, 1);
    });
    return trigger;
  }

  edgeShapeMenu(): HTMLElement {
    const current = sharedOf(this.edges, (s) => F.edgeShapeOf(s));
    const choice = F.EDGE_SHAPES.find((s) => s.id === current);
    const trigger = menuTrigger(choice ? svgIcon(choice.icon, '0 0 42 20', 'dfmt-shape-icon') : el('span', 'dfmt-menu-text', 'Mixed'), 'Connection', 'edgeShape');
    trigger.addEventListener('click', () => iconMenu(trigger, F.EDGE_SHAPES.map((s) => ({
      icon: svgIcon(s.icon, '0 0 42 20', 'dfmt-shape-icon'),
      title: s.title,
      data: { edgeShape: s.id },
      active: current === s.id,
      onPick: () => this.setStyle('Change connection', F.edgeShapeChanges(s), (c) => c.type === 'connector'),
    })), 1));
    return trigger;
  }

  waypointsMenu(): HTMLElement {
    const current = sharedOf(this.edges, (s) => F.edgeStyleOf(s));
    const choice = F.EDGE_STYLES.find((s) => s.id === current);
    const choices = F.edgeStyleChoices(this.style);
    const trigger = menuTrigger(choice ? svgIcon(choice.icon, '0 0 36 36', 'dfmt-route-icon') : el('span', 'dfmt-menu-text', 'Mixed'), 'Waypoints', 'waypoints');
    trigger.disabled = choices.length === 0;
    trigger.addEventListener('click', () => iconMenu(trigger, choices.map((s) => ({
      icon: svgIcon(s.icon, '0 0 36 36', 'dfmt-route-icon'),
      title: s.title,
      data: { edgeStyle: s.id },
      active: current === s.id,
      onPick: () => this.update('Change waypoints', (cell) => {
        if (cell.type === 'connector') F.applyEdgeStyleChoice(cell, s);
      }),
    })), 2));
    return trigger;
  }

  markerMenu(start: boolean): HTMLElement {
    const prefix = start ? 'start' : 'end';
    const title = start ? 'Line start' : 'Line end';
    const current = sharedOf(this.edges, (s) => {
      const m = F.markerOf(s, start);
      return `${m.marker}|${m.fill}`;
    });
    const enabled = F.hasLineMarkers(this.style);
    let preview: Node;
    if (current === F.MIXED) preview = el('span', 'dfmt-menu-text', 'Mixed');
    else {
      const [marker, fill] = current.split('|');
      if (marker === 'none') preview = el('span', 'dfmt-menu-text', 'None');
      else {
        const listed = F.markerChoices(this.style, start).find((c) => c.marker === marker && (c.fill == null || String(c.fill) === fill))
          ?? F.markerChoices(this.style, start).find((c) => c.marker === marker);
        preview = markerIcon(listed ?? { marker, fill: fill === '0' ? 0 : 1, path: null, filled: false }, start);
      }
    }
    const trigger = menuTrigger(preview, title, `${prefix}Arrow`);
    trigger.classList.toggle('is-dimmed', !enabled);
    trigger.addEventListener('click', () => {
      const items: MenuEntry[] = [];
      const copy = F.copyOtherMarker(this.style, start);
      if (copy && this.edges.length > 0) {
        const other = F.markerOf(this.style, !start);
        const listed = F.markerChoices(this.style, !start).find((c) => c.marker === other.marker && c.fill === other.fill);
        items.push({
          icon: markerIcon(listed ?? { marker: other.marker, fill: other.fill, path: null, filled: false }, start),
          title: 'Copy', data: { marker: 'copy' },
          onPick: () => this.setStyle(title, copy, (c) => c.type === 'connector'),
        });
      }
      for (const choice of F.markerChoices(this.style, start)) {
        items.push({
          icon: markerIcon(choice, start),
          title: choice.title,
          data: { marker: choice.marker, fill: choice.fill == null ? '' : String(choice.fill) },
          active: current === `${choice.marker}|${choice.fill ?? (current === F.MIXED ? '' : current.split('|')[1])}`,
          onPick: () => this.setStyle(title, F.markerChanges(start, choice), (c) => c.type === 'connector'),
        });
      }
      iconMenu(trigger, items, 3);
    });
    return trigger;
  }

  /** StyleFormatPanel.addEffects. */
  effectsSection(): HTMLElement {
    const { root, body } = section('Effects', 'effects', true);
    const grid = el('div', 'dfmt-check-grid');
    const { ss } = this;
    if (ss.rounded) {
      grid.appendChild(this.option('Rounded', 'rounded', { changes: (on, cell) => F.roundedChanges(cell, on) }));
    }
    if (this.vertices.some((v) => F.cellStyle(v).shape === 'swimlane')) grid.appendChild(this.option('Divider', 'swimlaneLine', { defaultOn: true }));
    grid.appendChild(this.option('Sketch', 'sketch', { changes: (on) => F.sketchChanges(on) }));
    if (ss.glass) grid.appendChild(this.option('Glass', 'glass'));
    grid.appendChild(this.option('Shadow', 'shadow'));
    if (this.verticesOnly) grid.appendChild(this.option('Multiple', 'multiple'));
    if (this.edgesOnly) {
      grid.appendChild(this.option('Flow Animation', 'flowAnimation'));
      const implied = this.edges.some((e) => {
        const es = F.cellStyle(e).edgeStyle ?? '';
        return ['orthogonalEdgeStyle', 'elbowEdgeStyle', 'segmentEdgeStyle', 'sideToSideEdgeStyle', 'topToBottomEdgeStyle', 'isometricEdgeStyle'].includes(es);
      });
      if (!implied) grid.appendChild(this.option('Orthogonal Ends', 'orthogonal'));
      grid.appendChild(this.option('Follow Terminals', 'followTerminals'));
    }
    for (const prop of F.cellProperties(this.cells)) {
      if (prop.type === 'bool' && prop.primary) grid.appendChild(this.option(prop.dispName, prop.name, { defaultOn: prop.defVal === true }));
    }
    body.appendChild(grid);
    return root;
  }

  /** StyleFormatPanel.addProperties: the shape's and the common properties. */
  propertiesSection(): HTMLElement | null {
    const props = F.cellProperties(this.cells).filter((p) => !p.primary);
    if (props.length === 0) return null;
    const { root, body } = section('Property', 'properties', true);
    const table = el('div', 'dfmt-props');
    for (const prop of props) {
      const value = F.propertyValue(prop, this.cells);
      const name = el('span', 'dfmt-prop-name', prop.dispName);
      name.title = prop.name;
      const cell = el('div', 'dfmt-prop-value');
      cell.dataset.prop = prop.name;
      const commit = (v: string | number | boolean | null) => this.setStyle(prop.dispName, F.propertyChange(prop, v));
      if (prop.type === 'bool') {
        const input = el('input');
        input.type = 'checkbox';
        input.checked = value === true;
        input.indeterminate = value === F.MIXED;
        input.setAttribute('aria-label', prop.dispName);
        input.addEventListener('change', () => commit(input.checked));
        cell.appendChild(input);
      } else if (prop.type === 'enum') {
        const options = (prop.enumList ?? []).map((o) => ({ value: o.val ?? '', title: o.dispName }));
        cell.appendChild(selectInput(options, value === F.MIXED ? F.MIXED : value == null ? '' : String(value), (v) => commit(v), prop.dispName));
      } else if (prop.type === 'color') {
        const current = value === F.MIXED ? null : value == null || value === 'none' ? null : String(value);
        const field = colorField(prop.dispName, current ? colorForInput(current) ?? current : null, (picked) =>
          commit(picked == null ? null : colorForInput(picked) ?? picked), {
          mixed: value === F.MIXED, clear: { kind: 'none', label: 'None' },
        });
        field.classList.add('dfmt-color');
        cell.appendChild(field);
      } else {
        const input = el('input', 'dfmt-prop-input');
        const numeric = (prop.type === 'int' || prop.type === 'float') && !prop.allowAuto;
        input.type = numeric ? 'number' : 'text';
        if (numeric) {
          input.step = prop.type === 'int' ? '1' : 'any';
          if (prop.min != null) input.min = String(prop.min);
          if (prop.max != null) input.max = String(prop.max);
        }
        input.setAttribute('aria-label', prop.dispName);
        input.value = value === F.MIXED || value == null ? '' : String(value);
        if (value === F.MIXED) input.placeholder = '—';
        input.addEventListener('change', () => commit(input.value));
        cell.appendChild(input);
      }
      table.append(name, cell);
    }
    body.appendChild(table);
    return root;
  }

  /** Edit Style, Copy Style / Paste Style, Set as Default Style. */
  styleOps(): HTMLElement {
    const wrap = el('div', 'dfmt-ops');
    const { root, body } = section('Edit Style', 'editStyle', false);
    const area = el('textarea', 'dfmt-style-text');
    area.rows = 4;
    area.spellcheck = false;
    area.value = this.cells[0].dio;
    area.setAttribute('aria-label', 'Edit Style (draw.io)');
    area.dataset.dfmt = 'editStyle';
    area.addEventListener('change', () => this.update('Edit style', (cell) => F.editStyleText(cell, area.value)));
    body.appendChild(area);
    wrap.appendChild(root);

    const buttons = el('div', 'dfmt-button-row');
    if (this.cells.length === 1) {
      buttons.appendChild(textButton('Copy Style', () => {
        memory.copied = F.copyCellStyle(this.cells[0]);
        pasteButton.disabled = false;
      }, 'Copy Style (Alt+C)', 'copyStyle'));
    }
    const pasteButton = textButton('Paste Style', () => {
      const copied = memory.copied;
      if (copied) this.update('Paste style', (cell) => F.pasteStyleInto(cell, copied));
    }, 'Paste Style (Alt+V)', 'pasteStyle');
    pasteButton.disabled = memory.copied == null;
    buttons.appendChild(pasteButton);
    wrap.appendChild(buttons);

    if (this.cells.length === 1) {
      const kind = F.kindOf(this.cells[0]);
      const defaults = el('div', 'dfmt-button-row');
      const set = textButton('Set as Default Style', () => {
        F.storeDefaultStyle(this.cells[0]);
        clear.disabled = false;
      }, `New ${kind === 'edge' ? 'connectors' : 'shapes'} take this style (Ctrl+Shift+D)`, 'setAsDefaultStyle');
      const clear = textButton('Clear Default Style', () => {
        F.clearDefaultStyle(kind);
        clear.disabled = true;
      }, 'New cells use draw.io\'s default style again (Ctrl+Shift+R)', 'clearDefaultStyle');
      clear.disabled = F.storedDefaultStyle(kind) == null;
      defaults.append(set, clear);
      wrap.appendChild(defaults);
    }
    return wrap;
  }

  // -- Text tab ------------------------------------------------------------------------

  textTab(): HTMLElement {
    const root = el('div');
    const { style, ss } = this;
    const font = section('Font', 'font', false, false);

    // Family.
    const family = F.sharedValue(this.cells, 'fontFamily', F.DEFAULT_FONT);
    const familyInput = el('input', 'dfmt-font-family');
    familyInput.type = 'text';
    familyInput.setAttribute('list', 'dfmt-fonts');
    familyInput.setAttribute('aria-label', 'Font family');
    familyInput.title = 'Font family';
    familyInput.dataset.dfmt = 'fontFamily';
    familyInput.value = family === F.MIXED ? '' : family ?? F.DEFAULT_FONT;
    if (family === F.MIXED) familyInput.placeholder = 'Mixed';
    const list = el('datalist');
    list.id = 'dfmt-fonts';
    for (const name of F.DEFAULT_FONTS) {
      const opt = el('option');
      opt.value = name;
      list.appendChild(opt);
    }
    familyInput.addEventListener('change', () => {
      const v = familyInput.value.trim();
      if (v) this.setStyle('Change font', [['fontFamily', v], ['fontSource', null]]);
    });
    font.body.append(familyInput, list);

    // Bold, italic, underline, strikethrough, vertical; size.
    const flags: Array<[number, string, string, string]> = [
      [F.FONT_BOLD, 'Bold', '<text x="7" y="11" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">B</text>', 'bold'],
      [F.FONT_ITALIC, 'Italic', '<text x="7" y="11" text-anchor="middle" font-size="11" font-style="italic" font-family="serif" fill="currentColor">I</text>', 'italic'],
      [F.FONT_UNDERLINE, 'Underline', '<text x="7" y="10" text-anchor="middle" font-size="10" fill="currentColor">U</text><path d="M3.5 12.5h7" stroke="currentColor"/>', 'underline'],
      [F.FONT_STRIKETHROUGH, 'Strikethrough', '<text x="7" y="11" text-anchor="middle" font-size="10" fill="currentColor">S</text><path d="M2.5 7.5h9" stroke="currentColor"/>', 'strikethrough'],
    ];
    const styleRow = el('div', 'dfmt-row dfmt-font-row');
    const toggles = el('div', 'dfmt-toggle-group');
    for (const [flag, title, glyph, data] of flags) {
      const shared = F.sharedFontFlag(this.cells, flag);
      toggles.appendChild(iconButton(glyph, '0 0 14 14', title, () => {
        const target = F.fontStyleToggleTarget(this.cells, flag);
        this.update(title, (cell) => { cell.dio = F.setStyleFlag(cell.dio, 'fontStyle', flag, target); });
      }, shared === true, data));
    }
    const vertical = F.sharedValue(this.cells, 'horizontal', '1') === '0';
    toggles.appendChild(iconButton('<text x="7" y="7" text-anchor="middle" dominant-baseline="central" font-size="9" fill="currentColor" transform="rotate(-90 7 7)">Ab</text>', '0 0 14 14', 'Vertical',
      () => this.setStyle('Vertical text', F.setKey('horizontal', vertical ? null : '0')), vertical, 'vertical'));
    styleRow.appendChild(toggles);
    styleRow.appendChild(this.numberKey('Font size', 'fontSize', F.DEFAULT_FONT_SIZE, { unit: 'pt', min: 1, max: 999, label: 'Change font size' }));
    font.body.appendChild(styleRow);

    // Alignment.
    const align = F.sharedValue(this.cells, 'align', 'center');
    const valign = F.sharedValue(this.cells, 'verticalAlign', 'middle');
    const alignRow = el('div', 'dfmt-row dfmt-align-row');
    const aligns = el('div', 'dfmt-toggle-group');
    for (const [value, title, lines] of [
      ['left', 'Left', [[2, 10], [2, 7], [2, 10], [2, 5]]],
      ['center', 'Center', [[2, 10], [3.5, 7], [2, 10], [4.5, 5]]],
      ['right', 'Right', [[2, 10], [5, 7], [2, 10], [7, 5]]],
    ] as Array<[string, string, number[][]]>) {
      const glyph = lines.map(([x, w], i) => `<rect x="${x}" y="${2.4 + i * 2.6}" width="${w}" height="1.1" rx=".5" fill="currentColor"/>`).join('');
      aligns.appendChild(iconButton(glyph, '0 0 14 14', title, () => this.setStyle('Align text', F.setKey('align', value)), align === value, `align-${value}`));
    }
    const valigns = el('div', 'dfmt-toggle-group');
    for (const [value, title, glyph] of [
      ['top', 'Top', '<path d="M2 2h10" stroke="currentColor"/><rect x="4" y="4" width="6" height="1.6" fill="currentColor"/><rect x="4" y="7" width="6" height="1.6" fill="currentColor"/>'],
      ['middle', 'Middle', '<rect x="4" y="4" width="6" height="1.6" fill="currentColor"/><rect x="4" y="8.4" width="6" height="1.6" fill="currentColor"/><path d="M2 7h10" stroke="currentColor" stroke-dasharray="1.5 1.5"/>'],
      ['bottom', 'Bottom', '<path d="M2 12h10" stroke="currentColor"/><rect x="4" y="5.4" width="6" height="1.6" fill="currentColor"/><rect x="4" y="8.4" width="6" height="1.6" fill="currentColor"/>'],
    ] as Array<[string, string, string]>) {
      valigns.appendChild(iconButton(glyph, '0 0 14 14', title, () => this.setStyle('Align text', F.setKey('verticalAlign', value)), valign === value, `valign-${value}`));
    }
    alignRow.append(aligns, valigns);
    font.body.appendChild(alignRow);

    // Position and writing direction.
    const position = sharedOf(this.cells, (s) => F.labelPositionOf(s));
    font.body.appendChild(row('Position', selectInput(
      (Object.keys(F.LABEL_POSITIONS) as F.LabelPosition[]).map((p) => ({ value: p, title: F.LABEL_POSITION_TITLES[p] })),
      position, (v) => this.setStyle('Change label position', (cell) => F.labelPositionChanges(cell, v as F.LabelPosition)), 'Position', 'labelPosition')));
    const dirs = F.WRITING_DIRECTIONS.filter((d) => !d.html || ss.html);
    font.body.appendChild(row('Writing Direction', selectInput(dirs.map((d) => ({ value: d.id, title: d.title })),
      sharedOf(this.cells, (s) => F.writingDirectionOf(s, s.html === '1')),
      (v) => this.setStyle('Change writing direction', F.setKey('textDirection', dirs.find((d) => d.id === v)?.value ?? null)), 'Writing direction', 'textDirection')));

    // Label background (None / Solid / Transparent), font colour, border, text shadow.
    font.body.appendChild(this.labelBackgroundRow());
    font.body.appendChild(this.colorRow('Font Color', 'fontColor', {
      resolvedDefault: '#000000',
      onSet: (v) => this.setStyle('Change font colour', F.fontColorChanges(v)),
    }));
    const fontColor = style.fontColor;
    if (fontColor !== 'none') {
      font.body.appendChild(this.colorRow('Border Color', 'labelBorderColor', { defaultColor: 'default', resolvedDefault: '#000000' }));
    }
    font.body.appendChild(this.option('Shadow', 'textShadow'));
    root.appendChild(font.root);

    // Advanced: word wrap, formatted text, hide label, fit to shape, label width.
    const adv = section('Advanced', 'textAdvanced', true);
    const grid = el('div', 'dfmt-check-grid dfmt-check-grid-1');
    grid.appendChild(this.option('Word Wrap', 'whiteSpace', { enabledValue: 'wrap', disabledValue: null }));
    const formatted = F.sharedFlag(this.cells, 'html');
    grid.appendChild(checkbox('Formatted Text', formatted, (on) => this.update('Formatted text', (cell) => F.setFormattedText(cell, on)), 'opt-html'));
    grid.appendChild(this.option('Hide Label', 'noLabel', { disabledValue: null }));
    if (F.supportsShapeInside(this.cells)) {
      // Needs word wrap, as in draw.io.
      const wrap = this.style.whiteSpace === 'wrap';
      grid.appendChild(this.option('Fit Text to Shape', 'shapeInside', { disabled: !wrap }));
    }
    adv.body.appendChild(grid);
    const labelWidth = F.sharedValue(this.cells, 'labelWidth', null);
    adv.body.appendChild(row('Label Width', numberInput(labelWidth === F.MIXED ? F.MIXED : labelWidth, (n) =>
      this.setStyle('Change label width', F.setKey('labelWidth', Math.max(1, n))), {
      title: 'Label width', unit: 'pt', min: 1, data: 'labelWidth',
      onEmpty: () => this.setStyle('Change label width', F.setKey('labelWidth', null)),
    })));
    root.appendChild(adv.root);

    // Text opacity.
    const opacity = row('Opacity', this.numberKey('Text opacity', 'textOpacity', 100, { unit: '%', min: 0, max: 100, label: 'Change text opacity' }));
    opacity.classList.add('dfmt-opacity-row');
    root.appendChild(opacity);

    // Spacing: top, left; global, bottom, right (TextFormatPanel.addFont).
    const spacing = section('Spacing', 'spacing', true);
    const grid2 = el('div', 'dfmt-spacing');
    const cell = (title: string, key: string, fallback: number) => {
      const box = el('div', 'dfmt-spacing-cell');
      box.append(this.numberKey(title, key, fallback, { unit: 'pt', min: -999, max: 999, label: 'Change spacing' }), el('span', 'dfmt-caption', title));
      return box;
    };
    grid2.append(cell('Top', 'spacingTop', 0), cell('Left', 'spacingLeft', 0), el('span'),
      cell('Global', 'spacing', 2), cell('Bottom', 'spacingBottom', 0), cell('Right', 'spacingRight', 0));
    spacing.body.appendChild(grid2);
    root.appendChild(spacing.root);

    // The label itself (DeckWerk: draw.io edits it on the canvas only).
    if (this.cells.length === 1) {
      const label = section('Label', 'label', true);
      const area = el('textarea', 'dfmt-style-text');
      area.rows = 3;
      area.value = this.cells[0].label;
      area.setAttribute('aria-label', 'Label');
      area.dataset.dfmt = 'label';
      area.addEventListener('change', () => this.update('Edit label', (c) => { c.label = area.value; }));
      label.body.appendChild(area);
      root.appendChild(label.root);
    }
    return root;
  }

  /** TextFormatPanel.createLabelBackgroundOption. */
  labelBackgroundRow(): HTMLElement {
    const value = sharedOf(this.cells, (s) => F.labelBackgroundOf(s));
    const options = [{ value: 'none', title: 'None' }, { value: 'solid', title: 'Solid' }];
    if (this.edgesOnly || value === 'transparent') options.push({ value: 'transparent', title: 'Transparent' });
    const color = F.sharedValue(this.cells, 'labelBackgroundColor', 'none');
    const select = selectInput(options, value, (v) => this.setStyle('Change label background', F.labelBackgroundChanges(
      v as F.LabelBackground, color === F.MIXED ? null : color)), 'Background', 'labelBackground');
    const r = row('Background', select);
    r.classList.add('dfmt-color-row');
    if (value === 'solid') {
      const shown = color === F.MIXED ? null : color;
      const field = colorField('Background', shown === 'default' ? null : shown ? colorForInput(shown) ?? shown : null, (picked) => {
        this.setStyle('Change label background', F.labelBackgroundColorChanges(picked == null ? 'default' : colorForInput(picked) ?? picked));
      }, {
        mixed: color === F.MIXED,
        clear: { kind: 'theme', label: 'Default' },
        inheritedValue: shown === 'default' ? '#ffffff' : undefined,
      });
      field.classList.add('dfmt-color');
      field.dataset.dfmt = 'labelBackgroundColor-color';
      r.querySelector('.dfmt-row-controls')?.appendChild(field);
    }
    return r;
  }

  // -- Arrange tab ---------------------------------------------------------------------

  arrangeTab(): HTMLElement {
    const root = el('div');
    // Layer ops (ArrangePanel.addLayerOps).
    const layer = el('div', 'dfmt-button-grid');
    for (const [dir, label] of [['front', 'To Front'], ['back', 'To Back'], ['forward', 'Bring Forward'], ['backward', 'Send Backward']] as Array<[ArrangeDirection, string]>) {
      layer.appendChild(textButton(label, () => arrangeSelection(this.store, dir), label, `arrange-${dir}`));
    }
    root.appendChild(layer);

    if (this.vertices.length > 0) root.appendChild(this.geometrySection());
    if (this.edges.length === 1 && this.cells.length === 1) {
      const loose = this.looseEndsSection(this.edges[0]);
      if (loose) root.appendChild(loose);
    }
    if (this.vertices.length > 0) root.appendChild(this.angleSection());
    root.appendChild(this.flipSection());
    if (this.vertices.length > 1) {
      root.appendChild(this.alignSection());
      root.appendChild(this.distributeSection());
    }
    const groups = this.groupSection();
    if (groups) root.appendChild(groups);
    if (this.edges.some((e) => e.type === 'connector' && e.points.length > 0)) {
      root.appendChild(textButton('Clear Waypoints', () => this.update('Clear waypoints', (cell) => {
        if (cell.type === 'connector') {
          cell.points = [];
          cell.dio = F.withStyle(cell.dio, [['innerLoopWaypoints', null]]);
        }
      }), 'Clear Waypoints (Alt+Shift+C)', 'clearWaypoints'));
    }
    if (this.cells.length === 1) root.appendChild(this.dataSection(this.cells[0]));
    return root;
  }

  /** ArrangePanel.addGeometry: size and position in draw.io units. */
  geometrySection(): HTMLElement {
    const { root, body } = section('Size / Position', 'geometry');
    const vertices = this.vertices as Array<Extract<DiagramEl, { type: 'vertex' }>>;
    const boxes = vertices.map((v) => F.unitBox(v));
    const shared = (k: keyof F.UnitBox): number | F.Mixed => {
      const first = boxes[0][k];
      return boxes.every((b) => Math.abs(b[k] - first) < 1e-9) ? first : F.MIXED;
    };
    const constrain = F.sharedValue(vertices, 'aspect', null) === 'fixed';
    const resize = (side: 'w' | 'h', value: number) => this.commitSlide('Resize', (selected) => {
      for (const cell of selected) {
        if (cell.type !== 'vertex') continue;
        const fixed = F.cellStyle(cell).aspect === 'fixed';
        F.setUnitBox(cell, F.resizedBox(F.unitBox(cell), side, value, fixed));
      }
    });
    const move = (axis: 'x' | 'y', value: number) => this.commitSlide('Move', (selected, slide) => {
      for (const cell of selected) {
        if (cell.type !== 'vertex') continue;
        const box = F.unitBox(cell);
        const moved = F.setUnitBox(cell, { ...box, [axis]: value });
        for (const child of F.descendantCells(slide.elements, [cell])) {
          if (!selected.includes(child)) F.translateCell(child, moved.x, moved.y);
        }
      }
    });
    const grid = el('div', 'dfmt-pair-grid');
    grid.append(
      el('span', 'dfmt-row-label', 'Size'),
      numberInput(shared('w'), (n) => resize('w', n), { title: 'Width', unit: 'pt', min: 1, data: 'width' }),
      numberInput(shared('h'), (n) => resize('h', n), { title: 'Height', unit: 'pt', min: 1, data: 'height' }),
      el('span'), el('span', 'dfmt-caption', 'Width'), el('span', 'dfmt-caption', 'Height'),
    );
    body.appendChild(grid);
    body.appendChild(checkbox('Constrain Proportions', constrain, (on) =>
      this.setStyle('Constrain proportions', F.setKey('aspect', on ? 'fixed' : null), (c) => c.type === 'vertex'), 'opt-aspect'));
    const pos = el('div', 'dfmt-pair-grid');
    pos.append(
      el('span', 'dfmt-row-label', 'Position'),
      numberInput(shared('x'), (n) => move('x', n), { title: 'Left', unit: 'pt', data: 'left' }),
      numberInput(shared('y'), (n) => move('y', n), { title: 'Top', unit: 'pt', data: 'top' }),
      el('span'), el('span', 'dfmt-caption', 'Left'), el('span', 'dfmt-caption', 'Top'),
    );
    body.appendChild(pos);
    return root;
  }

  /** ArrangePanel.addEdgeGeometry: the loose ends of a connector, in draw.io units. */
  looseEndsSection(edge: DiagramEl): HTMLElement | null {
    if (edge.type !== 'connector' || (edge.source && edge.target)) return null;
    const title = [edge.source ? '' : 'Line Start', edge.target ? '' : 'Line End'].filter(Boolean).join(' / ');
    const { root, body } = section(title, 'looseEnds');
    const s = edge.scale || 1;
    const o = edge.origin;
    const end = (which: 'sourcePoint' | 'targetPoint', label: string) => {
      const route = edge.route;
      const p = edge[which] ?? (which === 'sourcePoint' ? route[0] : route[route.length - 1]) ?? { x: 0, y: 0 };
      const set = (axis: 'x' | 'y', value: number) => this.update(`Move ${label.toLowerCase()}`, (cell) => {
        if (cell.type !== 'connector') return;
        const cur = cell[which] ?? p;
        cell[which] = { ...cur, [axis]: (axis === 'x' ? o.x : o.y) + value * s };
      });
      const grid = el('div', 'dfmt-pair-grid');
      grid.append(
        el('span', 'dfmt-row-label', label),
        numberInput((p.x - o.x) / s, (n) => set('x', n), { title: `${label} left`, unit: 'pt', data: `${which}-x` }),
        numberInput((p.y - o.y) / s, (n) => set('y', n), { title: `${label} top`, unit: 'pt', data: `${which}-y` }),
        el('span'), el('span', 'dfmt-caption', 'Left'), el('span', 'dfmt-caption', 'Top'),
      );
      body.appendChild(grid);
    };
    if (!edge.source) end('sourcePoint', 'Start');
    if (!edge.target) end('targetPoint', 'End');
    return root;
  }

  /** ArrangePanel.addAngle: rotation= and the element's rot together. */
  angleSection(): HTMLElement {
    const { root, body } = section('Rotation', 'rotation', true);
    const vertices = this.vertices as Array<Extract<DiagramEl, { type: 'vertex' }>>;
    const first = vertices[0].rot;
    const angle = vertices.every((v) => v.rot === first) ? first : F.MIXED;
    body.appendChild(row('Angle', numberInput(angle, (n) => this.update('Rotate', (cell) => {
      if (cell.type === 'vertex') F.setRotation(cell, n);
    }), { title: 'Angle', unit: '°', min: -360, max: 720, data: 'angle' })));
    return root;
  }

  /** ArrangePanel.addFlip. */
  flipSection(): HTMLElement {
    const { root, body } = section('Flip', 'flip', false, false);
    const buttons = el('div', 'dfmt-button-row');
    for (const [horizontal, label] of [[true, 'Horizontal'], [false, 'Vertical']] as Array<[boolean, string]>) {
      buttons.appendChild(textButton(label, () => {
        const value = F.flipTarget(this.cells, horizontal);
        this.update(`Flip ${label.toLowerCase()}`, (cell) => F.flipCell(cell, horizontal, value));
      }, `Flip ${label.toLowerCase()}`, `flip-${horizontal ? 'h' : 'v'}`));
    }
    body.appendChild(buttons);
    return root;
  }

  /** ArrangePanel.addAlign (mxGraph.alignCells). */
  alignSection(): HTMLElement {
    const { root, body } = section('Align', 'align', false, false);
    const strip = el('div', 'dfmt-toggle-group dfmt-align-strip');
    const glyphs: Record<F.AlignMode, string> = {
      left: '<path d="M1.5 1v12" stroke="currentColor"/><rect x="3" y="3" width="9" height="3" fill="currentColor"/><rect x="3" y="8" width="5.5" height="3" fill="currentColor"/>',
      center: '<path d="M7 1v12" stroke="currentColor"/><rect x="2.5" y="3" width="9" height="3" fill="currentColor"/><rect x="4.25" y="8" width="5.5" height="3" fill="currentColor"/>',
      right: '<path d="M12.5 1v12" stroke="currentColor"/><rect x="2" y="3" width="9" height="3" fill="currentColor"/><rect x="5.5" y="8" width="5.5" height="3" fill="currentColor"/>',
      top: '<path d="M1 1.5h12" stroke="currentColor"/><rect x="3" y="3" width="3" height="9" fill="currentColor"/><rect x="8" y="3" width="3" height="5.5" fill="currentColor"/>',
      middle: '<path d="M1 7h12" stroke="currentColor"/><rect x="3" y="2.5" width="3" height="9" fill="currentColor"/><rect x="8" y="4.25" width="3" height="5.5" fill="currentColor"/>',
      bottom: '<path d="M1 12.5h12" stroke="currentColor"/><rect x="3" y="2" width="3" height="9" fill="currentColor"/><rect x="8" y="5.5" width="3" height="5.5" fill="currentColor"/>',
    };
    for (const mode of ['left', 'center', 'right', 'top', 'middle', 'bottom'] as F.AlignMode[]) {
      strip.appendChild(iconButton(glyphs[mode], '0 0 14 14', mode[0].toUpperCase() + mode.slice(1), () =>
        this.commitSlide('Align', (selected, slide) => moveTo(slide, selected, F.alignCells(selected, mode))), false, `align-cells-${mode}`));
    }
    body.appendChild(strip);
    return root;
  }

  /** ArrangePanel.addDistribute (Graph.distributeCells). */
  distributeSection(): HTMLElement {
    const { root, body } = section('Distribute', 'distribute', false, false);
    const buttons = el('div', 'dfmt-button-row');
    for (const [horizontal, label] of [[true, 'Horizontal'], [false, 'Vertical']] as Array<[boolean, string]>) {
      buttons.appendChild(textButton(label, () => this.commitSlide('Distribute', (selected, slide) =>
        moveTo(slide, selected, F.distributeCells(selected, horizontal, memory.distributeSpacing))), `Distribute ${label.toLowerCase()}`, `distribute-${horizontal ? 'h' : 'v'}`));
    }
    body.appendChild(buttons);
    body.appendChild(checkbox('Spacing', memory.distributeSpacing, (on) => { memory.distributeSpacing = on; }, 'distribute-spacing'));
    return root;
  }

  /** ArrangePanel.addGroupOps: Group / Ungroup come from diagramCommands.ts (see registerDiagramGroupCommands). */
  groupSection(): HTMLElement | null {
    const entries = ([['group', 'Group'], ['ungroup', 'Ungroup'], ['removeFromGroup', 'Remove from Group']] as const)
      .map(([key, label]) => [groupCommands[key], label, key] as const)
      .filter(([command]) => command != null);
    if (entries.length === 0) return null;
    const buttons = el('div', 'dfmt-button-row');
    for (const [command, label, key] of entries) {
      const b = textButton(label, () => command!.run(this.store), command!.title ?? label, key);
      b.disabled = command!.enabled ? !command!.enabled(this.store) : false;
      buttons.appendChild(b);
    }
    return buttons;
  }

  /** Edit Data (EditDataDialog): the cell's id, custom properties and the placeholders flag. */
  dataSection(cell: DiagramEl): HTMLElement {
    const { root, body } = section('Edit Data', 'data', true);
    const id = row('ID', el('code', 'dfmt-cell-id', cell.cell));
    body.appendChild(id);
    const data = F.cellData(cell);
    const rows = data.attrs.map(([name, value]) => [name, value] as [string, string]);
    const save = (next: Array<[string, string]>, placeholders: boolean, label = 'Edit data') =>
      this.update(label, (c) => F.setCellData(c, next, placeholders));
    const table = el('div', 'dfmt-data');
    rows.forEach(([name, value], index) => {
      const key = el('span', 'dfmt-prop-name', name);
      key.title = name;
      const input = el('input', 'dfmt-prop-input');
      input.type = 'text';
      input.value = value;
      input.setAttribute('aria-label', name);
      input.dataset.dataKey = name;
      input.addEventListener('change', () => {
        const next = rows.map((r) => [...r] as [string, string]);
        next[index][1] = input.value;
        save(next, data.placeholders);
      });
      const remove = iconButton('<path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.4"/>', '0 0 14 14', `Delete ${name}`, () =>
        save(rows.filter((_, i) => i !== index), data.placeholders, 'Delete property'), false, `data-delete-${name}`);
      table.append(key, input, remove);
    });
    body.appendChild(table);
    const add = el('div', 'dfmt-data-add');
    const nameInput = el('input', 'dfmt-prop-input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Property name';
    nameInput.setAttribute('aria-label', 'New property name');
    nameInput.dataset.dfmt = 'data-new-name';
    const addButton = textButton('Add Property', () => {
      const name = nameInput.value.trim();
      if (!F.isValidDataName(name) || rows.some(([n]) => n === name)) {
        nameInput.setCustomValidity('Use a new name of letters, digits, _ . or - (not id, label or placeholders)');
        nameInput.reportValidity();
        return;
      }
      save([...rows, [name, '']], data.placeholders, 'Add property');
    }, 'Add Property', 'data-add');
    nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addButton.click();
      }
    });
    add.append(nameInput, addButton);
    body.appendChild(add);
    body.appendChild(checkbox('Placeholders', data.placeholders, (on) => save(rows, on, 'Placeholders'), 'data-placeholders'));
    return root;
  }
}

/** One value derived from each cell's drawn style, or MIXED. */
function sharedOf<T extends string>(cells: readonly DiagramEl[], read: (style: F.Style) => T): T | F.Mixed {
  let found: T | undefined;
  for (const cell of cells) {
    const value = read(F.cellStyle(cell));
    if (found === undefined) found = value;
    else if (found !== value) return F.MIXED;
  }
  return found ?? (read({}) as T);
}

function sharedLineShape(edges: readonly DiagramEl[]): F.LineShapeStyle | F.Mixed {
  return sharedOf(edges, (s) => F.lineShapeOf(s));
}

/** Moves vertices to new slide positions, their children with them. */
function moveTo(slide: Slide, selected: DiagramEl[], moves: Map<string, F.Point>): void {
  for (const cell of selected) {
    const to = moves.get(cell.id);
    if (!to || cell.type !== 'vertex') continue;
    const dx = to.x - cell.x;
    const dy = to.y - cell.y;
    F.translateCell(cell, dx, dy);
    for (const child of F.descendantCells(slide.elements, [cell])) {
      if (!selected.includes(child)) F.translateCell(child, dx, dy);
    }
  }
}
