/*
 * draw.io animations ⇄ DeckWerk builds.
 *
 * draw.io keeps a page's animation on the model root (the `animation`
 * attribute of its `<UserObject id="0">`): JSON `{"animation":{"steps":[…]}}`
 * or, in older files, a text script (`show n3 fade`, `wait 500`, …). Its
 * player runs the steps one after another by itself; a `wait` pauses it.
 * DeckWerk builds run on the presenter's clicks. The conversion follows one
 * rule: every beat starts on a click. A `wait` becomes the click that starts
 * the next beat; steps draw.io runs together (one step's actions, and steps
 * marked `immediate`) become "with previous"; steps it runs one after
 * another inside a beat become "after previous", with no delay. The first
 * beat is on a click too. An opening step that hides cells only says how the
 * diagram starts, which an `appear` build already implies.
 *
 * Writing back, a slide whose builds are still the ones its file's
 * animation reads as gets that animation verbatim; otherwise the steps are
 * written from the builds, a click becoming a `wait` (of the length the
 * file had at that place, else a second), and steps DeckWerk keeps without
 * playing (`drawio` entries) go back where they were.
 *
 * Ported from draw.io (jgraph/drawio 32.7.4): js/diagramly/Editor.js
 * (parseAnimationScript, convertLegacyAnimationStep, convertLegacyAnimation,
 * parseAnimationData, Graph.flattenAnimationActions, getCellsForAction and
 * the defaults of Graph.executeCustomActions) and
 * js/diagramly/gif/AnimationExport.js (getBatches, parseTime).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: DOM-free, and producing timeline entries instead of
 * playing the steps.
 */

import type {
  Action, ConnectorEl, DiagramEl, Slide, SlideElement, TimelineEntry, VertexEl,
} from '../deck.js';

/** One draw.io animation step: actions keyed by name (`fadeIn`, `wait`, …), run together. */
export type DrawioStep = Record<string, unknown>;

export interface AnimationData {
  steps: DrawioStep[];
  /** Whether draw.io's viewer repeats it (its default: yes). */
  loop: boolean;
  /** Whether draw.io's viewer plays it at all (its default: yes). */
  enabled: boolean;
}

/** Editor.animationFadeDelay: what a legacy fade or setOpacity takes when it does not say. */
export const LEGACY_FADE_DELAY = 400;
/** Graph.fadeNodes: what fadeIn, fadeOut and fadeTo take when they do not say. */
export const DRAWIO_FADE_DURATION = 1000;
/** Graph.executeAnimations: 30 frames, 30 ms apart, for wipes and pops that do not say. */
export const DRAWIO_EFFECT_FRAMES = 30;
export const DRAWIO_EFFECT_INTERVAL = 30;
export const DRAWIO_EFFECT_DURATION = DRAWIO_EFFECT_FRAMES * DRAWIO_EFFECT_INTERVAL;
/** A `wait` with no length waits this long (executeCustomActions). */
export const DRAWIO_DEFAULT_WAIT = 1000;
/** Graph.highlightCell: how long a highlight shows before it fades, and the fade. */
export const DRAWIO_HIGHLIGHT_DURATION = 1000;
export const DRAWIO_HIGHLIGHT_FADE = 1200;
/** mxConstants.DEFAULT_VALID_COLOR: a highlight's colour when it names none. */
export const DRAWIO_HIGHLIGHT_COLOR = '#00FF00';

// --- draw.io's animation data -------------------------------------------------------

/** A line of a legacy animation script (Editor.parseAnimationScript). */
export interface LegacyStep {
  action: string;
  cell?: string;
  arg?: string;
  delay?: number;
  opacity?: number;
  duration?: number;
}

function parseNumberToken(token: string | undefined): number | undefined {
  if (token == null) return undefined;
  const n = Number.parseFloat(token);
  return !Number.isNaN(n) && n >= 0 ? n : undefined;
}

/** Editor.parseAnimationScript: `show CELL [fade|pop|wipe] [MS]`, `hide`, `flow`, `wait`, `setOpacity`. */
export function parseAnimationScript(script: string | null | undefined): LegacyStep[] {
  const steps: LegacyStep[] = [];
  if (script == null) return steps;
  const effects = new Set(['fade', 'pop', 'wipe']);
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.charAt(0) === '#') continue;
    const tokens = line.split(/\s+/);
    const step: LegacyStep = { action: tokens[0], cell: tokens[1], arg: tokens[2] };
    if (step.action === 'wait') {
      const delay = Number.parseFloat(step.cell ?? '');
      step.delay = Number.isNaN(delay) || delay < 0 ? 1000 : delay;
    } else if (step.action === 'setOpacity') {
      let opacity = Number.parseFloat(tokens[2] ?? '');
      if (Number.isNaN(opacity)) opacity = 1;
      step.opacity = Math.max(0, Math.min(1, opacity));
      step.duration = parseNumberToken(tokens[3]);
      step.arg = undefined;
    } else if (step.action === 'show') {
      // The third token is an effect, or a duration with the default effect.
      if (step.arg != null && !effects.has(step.arg)) {
        const asDuration = parseNumberToken(step.arg);
        if (asDuration != null) {
          step.duration = asDuration;
          step.arg = undefined;
        }
      }
      if (step.duration == null) step.duration = parseNumberToken(tokens[3]);
    } else if (step.action === 'hide') {
      step.duration = parseNumberToken(tokens[2]);
      step.arg = undefined;
    }
    steps.push(step);
  }
  return steps;
}

/** Editor.convertLegacyAnimationStep: one script line as a JSON action, or null. */
export function convertLegacyAnimationStep(step: LegacyStep): DrawioStep | null {
  if (step.action === 'wait') return { wait: step.delay };
  const ref = step.cell === 'all' ? '*' : step.cell;
  if (ref == null) return null;
  const sel: Record<string, unknown> = { cells: [ref] };
  if (step.duration != null) sel.delay = step.duration;
  else if (step.action === 'show' && step.arg === 'fade') sel.delay = LEGACY_FADE_DELAY;
  else if (step.action === 'hide' || step.action === 'setOpacity') sel.delay = LEGACY_FADE_DELAY;
  if (step.action === 'show') {
    if (step.arg === 'fade') return { fadeIn: sel };
    if (step.arg === 'pop') return { popIn: sel };
    return { wipeIn: sel };
  }
  if (step.action === 'hide') return { fadeOut: sel };
  if (step.action === 'setOpacity') {
    sel.value = step.opacity;
    return { fadeTo: sel };
  }
  if (step.action === 'flow') {
    const out: Record<string, unknown> = { cells: [ref] };
    if (step.arg === 'start') out.start = true;
    else if (step.arg === 'stop') out.start = false;
    return { flow: out };
  }
  return null;
}

/**
 * Editor.convertLegacyAnimation: a legacy script as `{animation:{steps}}`,
 * with the hide-everything step the old player did by itself first, and the
 * lines between two waits merged into steps that run together, as they did.
 */
export function convertLegacyAnimation(text: string): { animation: { steps: DrawioStep[] } } {
  const steps: DrawioStep[] = [{ opacity: { cells: ['*'], value: 0 } }];
  let current: Record<string, Record<string, unknown>> | null = null;
  const flush = (): void => {
    if (current != null) {
      steps.push(current);
      current = null;
    }
  };
  const paramsMatch = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
    a.delay === b.delay && a.value === b.value && a.start === b.start;
  const merge = (converted: DrawioStep): void => {
    if (current == null) current = {};
    for (const key of Object.keys(converted)) {
      const incoming = converted[key] as Record<string, unknown>;
      const existing: Record<string, unknown> | undefined = current[key];
      if (existing != null && incoming != null && Array.isArray(existing.cells)
        && Array.isArray(incoming.cells) && paramsMatch(existing, incoming)) {
        (existing.cells as unknown[]).push(...(incoming.cells as unknown[]));
      } else if (existing != null) {
        flush();
        current = { [key]: incoming };
      } else {
        current[key] = incoming;
      }
    }
  };
  for (const legacy of parseAnimationScript(text)) {
    const converted = convertLegacyAnimationStep(legacy);
    if (converted == null) continue;
    if (converted.wait != null) {
      flush();
      steps.push(converted);
    } else {
      merge(converted);
    }
  }
  flush();
  return { animation: { steps } };
}

/**
 * Editor.parseAnimationData: the steps of an `animation` value — JSON
 * (`{animation:{steps}}` or `{steps}`, as text or parsed) or a legacy
 * script. Malformed JSON throws, as in draw.io.
 */
export function parseAnimationData(value: unknown): AnimationData {
  const normalize = (data: Record<string, unknown> | null | undefined): AnimationData => ({
    steps: Array.isArray(data?.steps) ? (data!.steps as unknown[]).filter((s): s is DrawioStep => s != null && typeof s === 'object') : [],
    loop: data?.loop == null ? true : Boolean(data.loop),
    enabled: data?.enabled == null ? true : Boolean(data.enabled),
  });
  if (value == null || value === '') return normalize({ steps: [] });
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') return parseAnimationData(JSON.parse(trimmed));
    return normalize(convertLegacyAnimation(value).animation);
  }
  if (typeof value !== 'object') return normalize({ steps: [] });
  const object = value as Record<string, unknown>;
  const animation = object.animation as Record<string, unknown> | undefined;
  if (animation != null && typeof animation === 'object' && animation.steps != null) return normalize(animation);
  if (Array.isArray(object.steps)) return normalize(object);
  return normalize({ steps: [] });
}

/** Graph.flattenAnimationActions: nested `{animation:{steps}}` actions inlined. */
export function flattenAnimationActions(actions: readonly unknown[]): DrawioStep[] {
  const out: DrawioStep[] = [];
  for (const action of actions) {
    const nested = action != null && typeof action === 'object'
      ? (action as Record<string, unknown>).animation as Record<string, unknown> | undefined : undefined;
    if (nested != null && typeof nested === 'object' && Array.isArray(nested.steps)) {
      out.push(...flattenAnimationActions(nested.steps));
    } else if (action != null && typeof action === 'object') {
      out.push(action as DrawioStep);
    }
  }
  return out;
}

/**
 * AnimationExport.getBatches: the actions that start together. A step and
 * the `immediate` steps after it are one dispatch; within it, an action not
 * marked `immediate` (a nested animation's steps) starts a batch of its own.
 */
export function animationBatches(steps: readonly DrawioStep[]): DrawioStep[][] {
  const batches: DrawioStep[][] = [];
  let index = 0;
  while (index < steps.length) {
    let end = index + 1;
    while (end < steps.length && steps[end] != null && steps[end].immediate === true) end++;
    let batch: DrawioStep[] | null = null;
    for (const action of flattenAnimationActions(steps.slice(index, end))) {
      if (batch == null || action.immediate !== true) {
        batch = [];
        batches.push(batch);
      }
      batch.push(action);
    }
    index = end;
  }
  return batches;
}

/** AnimationExport.parseTime: a duration as the engine's timers read it. */
export function parseTime(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

/** The animation a value holds, or null when it is empty or malformed. */
export function readAnimation(value: string | null | undefined): AnimationData | null {
  if (value == null || value.trim() === '') return null;
  try {
    return parseAnimationData(value);
  } catch {
    return null;
  }
}

// --- the cells a step names -------------------------------------------------------------

/** The cells of one diagram on a slide, as draw.io's selectors see them. */
export interface CellScope {
  diagramId: string;
  /** Every cell element of the diagram, drawn or not. */
  all: DiagramEl[];
  /** The drawn ones: what an animation step can act on. */
  cells: DiagramEl[];
  byCell: Map<string, DiagramEl>;
  /** Label cells on connectors (not elements of their own), by cell id. */
  labelOwner: Map<string, ConnectorEl>;
  /** Layer cell ids, bottom first. */
  layers: string[];
}

function isCell(el: SlideElement): el is DiagramEl {
  return el.type === 'vertex' || el.type === 'connector';
}

function drawn(el: DiagramEl): boolean {
  return !el.hidden && !el.concealed;
}

export function cellScope(
  slide: Pick<Slide, 'elements'> & { diagrams?: Slide['diagrams'] },
  diagramId: string,
): CellScope {
  const all = slide.elements.filter((el): el is DiagramEl => isCell(el) && el.diagram === diagramId);
  const byCell = new Map(all.map((el) => [el.cell, el]));
  const labelOwner = new Map<string, ConnectorEl>();
  for (const el of all) {
    if (el.type === 'connector') for (const label of el.labels) labelOwner.set(label.cell, el);
  }
  const layers = (slide.diagrams?.[diagramId]?.layers ?? [{ cell: '1' }]).map((layer) => layer.cell);
  return { diagramId, all, cells: all.filter(drawn), byCell, labelOwner, layers };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' || typeof v === 'number').map(String) : [];
}

/** The layer a cell is on: its topmost ancestor's parent. */
function layerOf(el: DiagramEl, scope: CellScope): string | null {
  let parent = el.parent;
  for (let i = 0; i < 100 && parent != null; i++) {
    const up = scope.byCell.get(parent);
    if (!up) break;
    parent = up.parent;
  }
  return parent;
}

function descendantsOf(el: DiagramEl, scope: CellScope): DiagramEl[] {
  const out: DiagramEl[] = [];
  const queue = [el.cell];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of scope.all) {
      if (child.parent !== id || seen.has(child.cell)) continue;
      seen.add(child.cell);
      out.push(child);
      queue.push(child.cell);
    }
  }
  return out;
}

/**
 * Graph.getCellsForAction: the cells a step's selector names — `cells`
 * (ids, `*` for all), `tags` (all of them, or any with `tagsMatch: "or"`),
 * `layers`, plus `descendants`, less `excludeCells` — that are drawn. Label
 * cells on connectors are not elements and are left out.
 */
export function resolveSelector(selector: unknown, scope: CellScope): DiagramEl[] {
  if (selector == null || typeof selector !== 'object') return [];
  const sel = selector as Record<string, unknown>;
  const result: DiagramEl[] = [];
  const seen = new Set<string>();
  const add = (el: DiagramEl | undefined): void => {
    if (!el || seen.has(el.id)) return;
    seen.add(el.id);
    result.push(el);
  };
  for (const id of stringList(sel.cells)) {
    if (id === '*') for (const el of scope.all) add(el);
    else add(scope.byCell.get(id));
  }
  const tags = stringList(sel.tags).filter((t) => t.length > 0);
  if (tags.length > 0) {
    const any = sel.tagsMatch === 'or';
    for (const el of scope.all) {
      const own = (el.object?.attrs.tags ?? '').split(' ').filter(Boolean);
      const hits = tags.filter((t) => own.includes(t)).length;
      if (any ? hits > 0 : hits === tags.length) add(el);
    }
  }
  const layers = stringList(sel.layers);
  if (layers.length > 0) {
    for (const el of scope.all) if (layers.includes(layerOf(el, scope) ?? '')) add(el);
  }
  if (sel.descendants === true) for (const el of [...result]) for (const d of descendantsOf(el, scope)) add(d);
  const exclude = stringList(sel.excludeCells);
  if (exclude.includes('*')) return [];
  return result.filter((el) => drawn(el) && !exclude.includes(el.cell));
}

// --- draw.io steps → builds -------------------------------------------------------------

/** A diagram's animation as builds. */
export interface DiagramBuilds {
  /**
   * How the diagram starts, before the first click: cells the animation
   * never reveals, hidden; cells it starts translucent, dimmed. Instant, and
   * belonging at the front of the slide's timeline.
   */
  initial: TimelineEntry[];
  /** The beats, in order; each starts on a click. */
  entries: TimelineEntry[];
}

/** Action keys whose cells change instantly: a leading step of only these is the diagram's starting state. */
const INSTANT_KEYS = new Set(['opacity', 'show', 'hide', 'toggle']);
/** Keys of a step that are not actions. */
const NOT_ACTIONS = new Set(['immediate', 'steps', 'delay', 'title', 'transient']);
/** Actions the conversion understands, in the order executeCustomActions runs them. */
const KNOWN_ACTIONS = ['wait', 'opacity', 'fadeIn', 'fadeOut', 'fadeTo', 'flow', 'wipeIn', 'wipeOut', 'popIn', 'popOut', 'toggle', 'show', 'hide', 'highlight'];
const EFFECT_KEYS = ['wipeIn', 'wipeOut', 'popIn', 'popOut'];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * The builds an `animation` value reads as, on the cells of one diagram.
 * Empty when there is none, it is malformed, or draw.io keeps it switched
 * off (`enabled: false`). Durations are draw.io's own: what a step says,
 * else its defaults.
 */
export function animationToBuilds(
  animation: string | null | undefined,
  slide: Pick<Slide, 'elements'> & { diagrams?: Slide['diagrams'] },
  diagramId: string,
  makeId: (prefix: string) => string,
): DiagramBuilds {
  const data = readAnimation(animation);
  const empty: DiagramBuilds = { initial: [], entries: [] };
  if (!data || !data.enabled || data.steps.length === 0) return empty;
  const scope = cellScope(slide, diagramId);
  if (scope.cells.length === 0) return empty;

  const sim = new Map<string, { visible: boolean; factor: number }>(scope.cells.map((el) => [el.id, { visible: true, factor: 1 }]));
  const state = (el: DiagramEl) => sim.get(el.id)!;
  const entries: TimelineEntry[] = [];
  const firstVisibility = new Map<string, 'appear' | 'disappear'>();
  let leading = true;
  let pendingClick = true;
  let batchOpen = false;

  const emit = (action: Omit<Action, 'value'> & { value?: Action['value'] }): void => {
    const on: TimelineEntry['trigger']['on'] = batchOpen ? 'withPrev' : pendingClick ? 'click' : 'afterPrev';
    entries.push({ id: makeId('t'), trigger: { on, ref: null, delay: 0 }, action: { value: null, ...action } as Action });
    batchOpen = true;
    pendingClick = false;
    if ((action.type === 'appear' || action.type === 'disappear') && !firstVisibility.has(action.target)) {
      firstVisibility.set(action.target, action.type);
    }
  };
  const setOpacity = (el: DiagramEl, value: number, duration = 0): void => {
    emit({ type: 'opacity', target: el.id, value: round3(value), duration });
    state(el).factor = value;
  };
  /** draw.io's opacity, show, hide and toggle: the DOM opacity set at once. */
  const instant = (el: DiagramEl, value: number, quiet: boolean): void => {
    const s = state(el);
    if (value <= 0) {
      if (s.visible && !quiet) emit({ type: 'disappear', target: el.id });
      s.visible = false;
      return;
    }
    if (s.factor !== value) {
      if (!quiet) setOpacity(el, value);
      else s.factor = value;
    }
    if (!s.visible && !quiet) emit({ type: 'appear', target: el.id });
    s.visible = true;
  };
  /** Before a draw.io effect that starts its cells at full opacity. */
  const full = (el: DiagramEl): void => {
    if (state(el).factor !== 1) setOpacity(el, 1);
  };

  for (const batch of animationBatches(data.steps)) {
    batchOpen = false;
    const onlyInstant = batch.every((action) => Object.keys(action)
      .every((key) => NOT_ACTIONS.has(key) || INSTANT_KEYS.has(key)));
    const quiet = leading && onlyInstant;
    if (!quiet) leading = false;
    let waits = false;
    for (const action of batch) {
      if (action.wait != null) waits = true;
      const cells = (key: string) => resolveSelector(action[key], scope);
      const params = (key: string) => (action[key] ?? {}) as Record<string, unknown>;
      const opacity = params('opacity');
      if (action.opacity != null && opacity.value != null) {
        for (const el of cells('opacity')) instant(el, Number(opacity.value) || 0, quiet);
      }
      if (action.fadeIn != null) {
        const d = parseTime(params('fadeIn').delay, DRAWIO_FADE_DURATION);
        for (const el of cells('fadeIn')) {
          full(el);
          emit({ type: 'appear', target: el.id, value: 'dissolve', duration: d });
          state(el).visible = true;
        }
      }
      if (action.fadeOut != null) {
        const d = parseTime(params('fadeOut').delay, DRAWIO_FADE_DURATION);
        for (const el of cells('fadeOut')) {
          full(el);
          emit({ type: 'disappear', target: el.id, value: 'dissolve', duration: d });
          state(el).visible = false;
        }
      }
      const fadeTo = params('fadeTo');
      if (action.fadeTo != null && fadeTo.value != null) {
        const d = parseTime(fadeTo.delay, DRAWIO_FADE_DURATION);
        const v = Math.max(0, Math.min(1, Number.parseFloat(String(fadeTo.value))));
        const value = Number.isNaN(v) ? 1 : v;
        for (const el of cells('fadeTo')) {
          const s = state(el);
          if (value <= 0) {
            if (s.visible) emit({ type: 'disappear', target: el.id, value: 'dissolve', duration: d });
            s.visible = false;
          } else if (!s.visible) {
            if (s.factor !== value) setOpacity(el, value);
            emit({ type: 'appear', target: el.id, value: 'dissolve', duration: d });
            s.visible = true;
          } else {
            setOpacity(el, value, d);
          }
        }
      }
      if (action.flow != null) {
        const start = params('flow').start;
        const value = start === true ? 'start' : start === false ? 'stop' : 'toggle';
        for (const el of cells('flow')) if (el.type === 'connector') emit({ type: 'flow', target: el.id, value });
      }
      // Wipes and pops of one step share a clock: the longest duration any
      // names, else frames × interval (executeCustomActions).
      if (EFFECT_KEYS.some((key) => action[key] != null)) {
        const named = EFFECT_KEYS.map((key) => params(key).delay).filter((d) => d != null).map((d) => parseTime(d, 0));
        const d = named.length > 0 ? Math.max(...named)
          : parseTime(action.steps, DRAWIO_EFFECT_FRAMES) * parseTime(action.delay, DRAWIO_EFFECT_INTERVAL);
        for (const key of EFFECT_KEYS) {
          if (action[key] == null) continue;
          const inward = key.endsWith('In');
          for (const el of cells(key)) {
            if (inward) full(el);
            emit({ type: inward ? 'appear' : 'disappear', target: el.id, value: key.startsWith('wipe') ? 'wipe' : 'pop', duration: d });
            state(el).visible = inward;
          }
        }
      }
      if (action.toggle != null) for (const el of cells('toggle')) instant(el, state(el).visible ? 0 : 1, quiet);
      if (action.show != null) for (const el of cells('show')) instant(el, 1, quiet);
      if (action.hide != null) for (const el of cells('hide')) instant(el, 0, quiet);
      const highlight = params('highlight');
      if (action.highlight != null) {
        for (const el of cells('highlight')) {
          emit({
            type: 'highlight',
            target: el.id,
            value: highlight.opacity != null ? Number(highlight.opacity) : null,
            ...(highlight.duration != null ? { duration: parseTime(highlight.duration, DRAWIO_HIGHLIGHT_DURATION) } : {}),
            ...(typeof highlight.color === 'string' ? { color: highlight.color } : {}),
          });
        }
      }
      // Everything else is kept as a step of its own, for writing back:
      // DeckWerk does not play it.
      const kept: DrawioStep = {};
      for (const key of Object.keys(action)) {
        if (NOT_ACTIONS.has(key) || KNOWN_ACTIONS.includes(key)) continue;
        kept[key] = action[key];
      }
      // A known action that names no cell DeckWerk has (a label cell, a
      // hidden one) is kept too, so the file keeps it.
      for (const key of KNOWN_ACTIONS) {
        if (key === 'wait' || action[key] == null || quiet) continue;
        if (key === 'opacity' && opacity.value == null) continue;
        if (cells(key).length === 0) kept[key] = action[key];
      }
      if (Object.keys(kept).length > 0) {
        for (const key of ['steps', 'delay']) if (action[key] != null && EFFECT_KEYS.some((k) => k in kept)) kept[key] = action[key];
        const named = Object.values(kept).flatMap((sel) => resolveSelector(sel, scope));
        const target = (named[0] ?? scope.cells[0]).id;
        emit({ type: 'drawio', target, value: JSON.stringify(kept) });
      }
    }
    if (waits) pendingClick = true;
  }

  // The state the leading steps left is how the diagram starts.
  const initial: TimelineEntry[] = [];
  const startEntry = (action: Action): TimelineEntry => ({ id: makeId('t'), trigger: { on: 'withPrev', ref: null, delay: 0 }, action });
  const startState = startStates(data, scope);
  for (const el of scope.cells) {
    const s = startState.get(el.id)!;
    if (s.factor !== 1) initial.push(startEntry({ type: 'opacity', target: el.id, value: round3(s.factor), duration: 0 }));
    if (!s.visible && firstVisibility.get(el.id) !== 'appear') initial.push(startEntry({ type: 'disappear', target: el.id, value: null }));
  }
  return { initial, entries };
}

/** The cells' visibility and opacity after the animation's leading instant steps. */
function startStates(data: AnimationData, scope: CellScope): Map<string, { visible: boolean; factor: number }> {
  const sim = new Map(scope.cells.map((el) => [el.id, { visible: true, factor: 1 }]));
  for (const batch of animationBatches(data.steps)) {
    const onlyInstant = batch.every((action) => Object.keys(action).every((key) => NOT_ACTIONS.has(key) || INSTANT_KEYS.has(key)));
    if (!onlyInstant) break;
    for (const action of batch) {
      const set = (key: string, value: (s: { visible: boolean }) => number) => {
        for (const el of resolveSelector(action[key], scope)) {
          const s = sim.get(el.id)!;
          const v = value(s);
          if (v <= 0) s.visible = false;
          else {
            s.visible = true;
            s.factor = v;
          }
        }
      };
      const opacity = action.opacity as Record<string, unknown> | undefined;
      if (opacity != null && opacity.value != null) set('opacity', () => Number(opacity.value) || 0);
      if (action.toggle != null) set('toggle', (s) => (s.visible ? 0 : 1));
      if (action.show != null) set('show', () => 1);
      if (action.hide != null) set('hide', () => 0);
    }
  }
  return sim;
}

/**
 * A slide's timeline with one diagram's builds replaced: the entries on its
 * cells removed, its starting state put first (on slide entry) and its beats
 * where its first build was, or at the end.
 */
export function placeDiagramBuilds(
  timeline: readonly TimelineEntry[],
  cellIds: ReadonlySet<string>,
  builds: DiagramBuilds,
): TimelineEntry[] {
  // Where the diagram's first beat was (its starting state, before the
  // first click, goes to the front either way).
  const firstClick = timeline.findIndex((entry) => entry.trigger.on === 'click');
  const at = firstClick < 0 ? -1
    : timeline.findIndex((entry, index) => index >= firstClick && cellIds.has(entry.action.target));
  const before: TimelineEntry[] = [];
  const after: TimelineEntry[] = [];
  timeline.forEach((entry, index) => {
    if (cellIds.has(entry.action.target)) return;
    if (at >= 0 && index > at) after.push(entry);
    else before.push(entry);
  });
  return [...builds.initial, ...before, ...builds.entries, ...after];
}

/** Builds compared without their ids: what they do and when. */
function sameBuilds(a: readonly TimelineEntry[], b: readonly TimelineEntry[]): boolean {
  if (a.length !== b.length) return false;
  const key = (entry: TimelineEntry): string => {
    const { trigger, action } = entry;
    const fields = Object.entries(action)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
    return JSON.stringify([trigger.on, trigger.delay, fields]);
  };
  return a.every((entry, i) => key(entry) === key(b[i]));
}

/** Whether a slide's builds on a diagram are the ones its stored animation reads as. */
export function buildsMatchAnimation(
  slide: Pick<Slide, 'elements' | 'timeline'> & { diagrams?: Slide['diagrams'] },
  diagramId: string,
  animation = slide.diagrams?.[diagramId]?.animation,
): boolean {
  const ids = new Set(cellScope(slide, diagramId).all.map((el) => el.id));
  const current = slide.timeline.filter((entry) => ids.has(entry.action.target));
  let n = 0;
  const converted = animationToBuilds(animation, slide, diagramId, () => `t-${n++}`);
  return sameBuilds([...converted.initial, ...converted.entries], current);
}

// --- builds → draw.io steps -------------------------------------------------------------

interface Planned {
  key: string;
  params: Record<string, unknown>;
  cell: string;
}

function plannedFor(entry: TimelineEntry, el: DiagramEl): Planned[] | DrawioStep | null {
  const { action } = entry;
  const d = action.duration;
  const value = action.value;
  const p = (key: string, params: Record<string, unknown> = {}): Planned[] => [{ key, params, cell: el.cell }];
  switch (action.type) {
    case 'appear':
      if (value === 'dissolve' || value === 'blur') return p('fadeIn', { delay: d ?? DRAWIO_FADE_DURATION });
      if (value === 'wipe' || value === 'draw') return p('wipeIn', { delay: d ?? DRAWIO_EFFECT_DURATION });
      if (value === 'pop') return p('popIn', { delay: d ?? DRAWIO_EFFECT_DURATION });
      return p('show');
    case 'disappear':
      if (value === 'dissolve' || value === 'blur') return p('fadeOut', { delay: d ?? DRAWIO_FADE_DURATION });
      if (value === 'wipe' || value === 'draw') return p('wipeOut', { delay: d ?? DRAWIO_EFFECT_DURATION });
      if (value === 'pop') return p('popOut', { delay: d ?? DRAWIO_EFFECT_DURATION });
      return p('hide');
    case 'opacity': {
      const v = typeof value === 'number' ? value : Number(value ?? 1);
      return d != null && d > 0 ? p('fadeTo', { value: v, delay: d }) : p('opacity', { value: v });
    }
    case 'flow':
      return el.type === 'connector'
        ? p('flow', value === 'start' ? { start: true } : value === 'stop' ? { start: false } : {})
        : null;
    case 'highlight':
      return p('highlight', {
        ...(action.color ? { color: action.color } : {}),
        ...(d != null ? { duration: d } : {}),
        ...(typeof value === 'number' ? { opacity: value } : {}),
      });
    case 'drawio': {
      try {
        const step = JSON.parse(String(value ?? '{}')) as unknown;
        return step != null && typeof step === 'object' && !Array.isArray(step) ? step as DrawioStep : null;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** One batch of planned actions as draw.io steps: the first runs after what came before, the rest with it. */
function batchSteps(items: Array<Planned[] | DrawioStep>): DrawioStep[] {
  const steps: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (!Array.isArray(item)) {
      const { immediate: _immediate, ...rest } = item;
      steps.push({ ...rest });
      continue;
    }
    for (const planned of item) {
      const match = steps.find((step) => {
        const sel = step[planned.key] as Record<string, unknown> | undefined;
        if (!sel || !Array.isArray(sel.cells)) return false;
        const { cells: _c, ...params } = sel;
        return sameParams(params, planned.params);
      });
      if (match) {
        ((match[planned.key] as Record<string, unknown>).cells as string[]).push(planned.cell);
        continue;
      }
      // Wipes and pops of one step share one clock (the longest delay), so
      // one with another duration goes in a step of its own.
      const clockOk = (step: Record<string, unknown>) => !EFFECT_KEYS.includes(planned.key)
        || EFFECT_KEYS.every((k) => step[k] == null || (step[k] as Record<string, unknown>).delay === planned.params.delay);
      const free = steps.find((step) => step[planned.key] == null && clockOk(step)
        && Object.keys(step).every((k) => KNOWN_ACTIONS.includes(k)));
      const sel = { cells: [planned.cell], ...planned.params };
      if (free) free[planned.key] = sel;
      else steps.push({ [planned.key]: sel });
    }
  }
  return steps.map((step, index) => (index === 0 ? step : { ...step, immediate: true }));
}

/**
 * Within one batch, a DeckWerk pair that is one draw.io action: the opacity
 * a cell is given just before it appears. Before a fade, it is draw.io's
 * fadeTo from nothing; before anything else draw.io starts at full opacity,
 * so an opacity of 1 there says nothing.
 */
function foldOpacity(batch: Array<{ entry: TimelineEntry; el: DiagramEl }>): Array<{ entry: TimelineEntry; el: DiagramEl }> {
  const out: Array<{ entry: TimelineEntry; el: DiagramEl }> = [];
  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const { action } = item.entry;
    if (action.type === 'opacity' && !(action.duration && action.duration > 0)) {
      const next = batch.slice(i + 1).find((other) => other.el.id === item.el.id
        && (other.entry.action.type === 'appear' || other.entry.action.type === 'disappear'));
      if (next) {
        const v = typeof action.value === 'number' ? action.value : 1;
        const fade = next.entry.action.value === 'dissolve' || next.entry.action.value === 'blur';
        if (next.entry.action.type === 'appear' && fade && v !== 1) {
          // fadeTo v, in place of the appear
          const index = batch.indexOf(next);
          batch[index] = {
            el: next.el,
            entry: { ...next.entry, action: { ...next.entry.action, type: 'opacity', value: v, duration: next.entry.action.duration ?? DRAWIO_FADE_DURATION } },
          };
          continue;
        }
        if (v === 1 && (next.entry.action.value != null || next.entry.action.type === 'disappear')) continue;
      }
    }
    out.push(item);
  }
  return out;
}

/**
 * The draw.io `animation` value for a diagram's builds: the stored one when
 * the builds are still what it reads as, else steps written from the builds
 * (undefined when there are none).
 */
export function buildsToAnimation(
  slide: Pick<Slide, 'elements'> & { timeline?: Slide['timeline']; diagrams?: Slide['diagrams'] },
  diagramId: string,
): string | undefined {
  const original = slide.diagrams?.[diagramId]?.animation;
  if (!slide.timeline) return original;
  const timeline = slide.timeline;
  const scope = cellScope(slide, diagramId);
  const byId = new Map(scope.all.map((el) => [el.id, el]));
  const current = timeline.filter((entry) => byId.has(entry.action.target));
  const data = readAnimation(original);
  if (original != null && (data == null ? current.length === 0 : buildsMatchAnimation({ ...slide, timeline }, diagramId))) {
    return original;
  }
  if (current.length === 0) return undefined;

  // How the diagram starts: what its first builds reveal starts hidden.
  const decided = new Set<string>();
  const hidden = new Set<string>();
  for (const entry of timeline) {
    const { type, target } = entry.action;
    if ((type !== 'appear' && type !== 'disappear') || decided.has(target)) continue;
    decided.add(target);
    if (type === 'appear' && byId.has(target)) hidden.add(target);
  }

  // Walk the timeline: a click is a new beat, "after previous" a new batch
  // in the same beat, "with previous" the same batch.
  type Batch = { beat: number; pause?: number; items: Array<{ entry: TimelineEntry; el: DiagramEl }> };
  const batches: Batch[] = [];
  const startDim: Array<{ el: DiagramEl; value: number }> = [];
  let beat = 0;
  let broken = true;
  for (const entry of timeline) {
    if (entry.trigger.on === 'click') {
      beat++;
      broken = true;
    }
    const el = byId.get(entry.action.target);
    if (!el) {
      if (entry.trigger.on !== 'withPrev') broken = true;
      continue;
    }
    const { type, value, duration } = entry.action;
    // On slide entry, instant changes are the starting state.
    if (beat === 0 && entry.trigger.delay === 0) {
      if (type === 'disappear' && value == null) {
        hidden.add(el.id);
        continue;
      }
      if (type === 'opacity' && !(duration && duration > 0)) {
        startDim.push({ el, value: typeof value === 'number' ? value : 1 });
        continue;
      }
    }
    const last = batches[batches.length - 1];
    if (entry.trigger.on === 'withPrev' && !broken && last && last.beat === beat) {
      last.items.push({ entry, el });
    } else {
      // A delay is a pause draw.io makes by itself: a wait.
      const pause = entry.trigger.delay > 0 ? entry.trigger.delay : undefined;
      batches.push({ beat, items: [{ entry, el }], ...(pause ? { pause } : {}) });
    }
    broken = false;
  }

  // The waits the file had, in order, are reused where clicks still are: a
  // wait before anything played stays before the first beat.
  const { leading: leadingWait, between: waits } = fileWaits(data);
  let nextWait = 0;
  const wait = (): DrawioStep => ({ wait: waits[nextWait++] ?? DRAWIO_DEFAULT_WAIT });

  const steps: DrawioStep[] = [];
  const hiddenCells = scope.cells.filter((el) => hidden.has(el.id));
  if (hiddenCells.length > 0) {
    const all = hiddenCells.length === scope.cells.length;
    steps.push({ opacity: { cells: all ? ['*'] : hiddenCells.map((el) => el.cell), value: 0 } });
  }
  if (startDim.length > 0) {
    steps.push(...batchSteps(startDim.map(({ el, value }) => [{ key: 'opacity', params: { value }, cell: el.cell }])));
  }
  let lastBeat = 0;
  let played = false;
  for (const batch of batches) {
    if (batch.beat !== lastBeat) {
      if (played) steps.push(wait());
      else if (leadingWait != null) steps.push({ wait: leadingWait });
    }
    if (batch.pause) steps.push({ wait: batch.pause });
    lastBeat = batch.beat;
    const items = foldOpacity(batch.items)
      .map(({ entry, el }) => plannedFor(entry, el))
      .filter((item): item is Planned[] | DrawioStep => item != null);
    if (items.length === 0) continue;
    steps.push(...batchSteps(items));
    played = true;
  }

  const result: Record<string, unknown> = { steps };
  // DeckWerk's builds play once; a file's own choice is kept.
  if (data ? !data.loop : true) result.loop = false;
  if (data && !data.enabled) result.enabled = false;
  return JSON.stringify({ animation: result });
}

/** A file's waits: one before anything played (if any), then the rest in order. */
function fileWaits(data: AnimationData | null): { leading: number | null; between: number[] } {
  let leading: number | null = null;
  const between: number[] = [];
  let played = false;
  let opening = true;
  for (const batch of data ? animationBatches(data.steps) : []) {
    const keys = batch.flatMap((action) => Object.keys(action).filter((key) => !NOT_ACTIONS.has(key)));
    if (opening && keys.every((key) => INSTANT_KEYS.has(key))) continue;
    opening = false;
    for (const action of batch) {
      if (action.wait == null) continue;
      const ms = action.wait !== '' ? parseTime(action.wait, DRAWIO_DEFAULT_WAIT) : DRAWIO_DEFAULT_WAIT;
      if (played) between.push(ms);
      else if (leading == null) leading = ms;
    }
    if (keys.some((key) => key !== 'wait')) played = true;
  }
  return { leading, between };
}

// --- building a diagram in order -------------------------------------------------------

export interface BuildOrderOptions {
  /** `reading`: top to bottom, left to right; `flow`: along the connectors from their sources; `auto` (default): flow when connectors join the vertices. */
  order?: 'auto' | 'reading' | 'flow';
  /** How vertices come in (default: dissolve, 400 ms, draw.io's fade). */
  vertexEffect?: 'appear' | 'dissolve' | 'wipe' | 'pop';
  vertexDuration?: number;
  /** How connectors come in (default: wipe — drawn along the route — 900 ms, draw.io's). */
  connectorEffect?: 'appear' | 'dissolve' | 'wipe' | 'pop';
  connectorDuration?: number;
}

/** Vertices in reading order: rows top to bottom (centres within half a box of each other share a row), then left to right. */
export function readingOrder<T extends Pick<VertexEl, 'x' | 'y' | 'w' | 'h'>>(vertices: readonly T[]): T[] {
  const byY = [...vertices].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);
  const rows: T[][] = [];
  for (const v of byY) {
    const row = rows[rows.length - 1];
    const cy = v.y + v.h / 2;
    if (row) {
      const top = row[0];
      const tolerance = Math.min(...row.map((r) => r.h), v.h) / 2;
      if (Math.abs(cy - (top.y + top.h / 2)) <= tolerance) {
        row.push(v);
        continue;
      }
    }
    rows.push([v]);
  }
  return rows.flatMap((row) => row.sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2)));
}

/**
 * The order to build a diagram's cells in: vertices in reading order, or —
 * when connectors join them — each vertex once every vertex leading into it
 * is in (the earliest in reading order first among those ready; a cycle is
 * broken at its first vertex in reading order), and each connector straight
 * after the later of its two ends.
 */
export function diagramBuildOrder(
  cells: readonly DiagramEl[],
  options: Pick<BuildOrderOptions, 'order'> & { visible?: (id: string) => boolean } = {},
): DiagramEl[] {
  const vertices = cells.filter((el): el is VertexEl => el.type === 'vertex');
  const connectors = cells.filter((el): el is ConnectorEl => el.type === 'connector');
  const inSet = new Set(vertices.map((v) => v.id));
  const reading = readingOrder(vertices);
  const rank = new Map(reading.map((v, i) => [v.id, i]));
  const links = connectors.filter((c) => c.source && c.target && inSet.has(c.source) && inSet.has(c.target) && c.source !== c.target);
  const flow = options.order === 'flow' || (options.order !== 'reading' && links.length > 0);

  let ordered: VertexEl[] = reading;
  if (flow) {
    const preds = new Map<string, Set<string>>(vertices.map((v) => [v.id, new Set()]));
    for (const c of links) preds.get(c.target!)!.add(c.source!);
    const done = new Set<string>();
    ordered = [];
    while (ordered.length < vertices.length) {
      const remaining = reading.filter((v) => !done.has(v.id));
      const ready = remaining.filter((v) => [...preds.get(v.id)!].every((p) => done.has(p)));
      // A cycle: start it at the vertex with the fewest unbuilt inputs, earliest in reading order.
      const next = ready[0] ?? [...remaining].sort((a, b) =>
        ([...preds.get(a.id)!].filter((p) => !done.has(p)).length - [...preds.get(b.id)!].filter((p) => !done.has(p)).length)
        || rank.get(a.id)! - rank.get(b.id)!)[0];
      done.add(next.id);
      ordered.push(next);
    }
  }

  const out: DiagramEl[] = [];
  const shown = new Set<string>();
  const visible = (id: string | null): boolean => id == null || shown.has(id) || (!inSet.has(id) && (options.visible?.(id) ?? true));
  const pending = [...connectors];
  const release = (): void => {
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      if (visible(c.source) && visible(c.target)) {
        out.push(c);
        pending.splice(i--, 1);
      }
    }
  };
  release();
  for (const v of ordered) {
    out.push(v);
    shown.add(v.id);
    release();
  }
  out.push(...pending);
  return out;
}

function effectAction(target: string, effect: BuildOrderOptions['vertexEffect'], duration: number): Action {
  if (effect === 'appear') return { type: 'appear', target, value: null };
  return { type: 'appear', target, value: effect ?? 'dissolve', duration };
}

/**
 * A slide's timeline with the given diagram cells built in order: one
 * `appear` per cell, each on its own click — vertices dissolving in,
 * connectors drawn along their route once both their ends are in. Earlier
 * builds on those cells are replaced; the new ones go where the first of
 * them was, or at the end.
 */
export function buildDiagramInOrder(
  slide: Pick<Slide, 'elements' | 'timeline'>,
  cellIds: ReadonlySet<string>,
  makeId: (prefix: string) => string,
  options: BuildOrderOptions = {},
): TimelineEntry[] {
  const cells = slide.elements.filter((el): el is DiagramEl => isCell(el) && cellIds.has(el.id) && drawn(el));
  const ids = new Set(cells.map((el) => el.id));
  // What is outside the set is on screen unless a build of its own reveals it.
  const revealed = new Set(slide.timeline.filter((e) => e.action.type === 'appear' && !ids.has(e.action.target)).map((e) => e.action.target));
  const order = diagramBuildOrder(cells, { order: options.order, visible: (id) => !revealed.has(id) });
  const entries: TimelineEntry[] = order.map((el) => ({
    id: makeId('t'),
    trigger: { on: 'click', ref: null, delay: 0 },
    action: el.type === 'vertex'
      ? effectAction(el.id, options.vertexEffect ?? 'dissolve', options.vertexDuration ?? LEGACY_FADE_DELAY)
      : effectAction(el.id, options.connectorEffect ?? 'wipe', options.connectorDuration ?? DRAWIO_EFFECT_DURATION),
  }));
  const at = slide.timeline.findIndex((entry) => ids.has(entry.action.target));
  const kept = slide.timeline.filter((entry) => !ids.has(entry.action.target));
  if (at < 0) return [...kept, ...entries];
  const before = slide.timeline.slice(0, at).filter((entry) => !ids.has(entry.action.target)).length;
  return [...kept.slice(0, before), ...entries, ...kept.slice(before)];
}
