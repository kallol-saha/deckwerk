/**
 * The agent toolkit for diagrams on top of `slide-agent diagram`:
 *
 *   diagram style  [deck] --slide <s> --cells <id,…|*> [--set k=v]… [--unset k]… [--label <text>] [--style <raw>]
 *   diagram add    [deck] --slide <s> [--vertex '<spec>']… [--edge '<spec>']… [--json <file>] [--layout <algo>]
 *   diagram layout [deck] --slide <s> --algo layered|tree|radial|organic|circle [--direction right|down|left|up]
 *
 * Each is one labelled transaction (one undo step in a live editor), and
 * reports what it changed in JSON like the rest of the CLI.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgentOperation } from '@shared/agent.js';
import type { Deck, DiagramEl, Slide, SlideElement } from '@shared/deck.js';
import { makeId } from '@shared/geometry.js';
import {
  addFromSpecs, cellSpec, findCells, parsePatch, parseSpecLine, patchWarnings, restyleCell, specsFromJson,
  type CellSpec, type StylePatch,
} from '@shared/diagram/agentEdit.js';
import * as F from '@shared/diagram/format.js';
import {
  LAYOUT_ALGORITHMS, LAYOUT_DIRECTIONS, LAYOUT_PRESETS, layoutDiagram,
  type LayoutAlgorithm, type LayoutCorners, type LayoutDirection, type LayoutOptions,
} from '@shared/diagram/layout.js';
import type { DiagramCliDeps, DiagramCliIo } from './diagramCli.js';

interface Args {
  flags: Map<string, string[]>;
  positional: string[];
}

const BOOLEAN = new Set(['keep-waypoints']);

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string[]>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
    let value: string;
    if (eq > 0) value = arg.slice(eq + 1);
    else if (BOOLEAN.has(name)) value = 'true';
    else value = argv[++i] ?? '';
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { flags, positional };
}

function one(args: Args, name: string): string | undefined {
  const values = args.flags.get(name);
  return values ? values[values.length - 1] : undefined;
}

function many(args: Args, name: string): string[] {
  return args.flags.get(name) ?? [];
}

function known(command: string, args: Args, allowed: string[], deps: DiagramCliDeps): void {
  for (const name of args.flags.keys()) {
    if (!allowed.includes(name)) {
      throw deps.usageError(`Unknown flag --${name} for diagram ${command}. Known: ${allowed.map((a) => `--${a}`).join(', ')}.`);
    }
  }
}

function slideFor(deck: Deck, ref: string | undefined, deps: DiagramCliDeps): Slide {
  if (!ref) throw deps.usageError('Name the slide with --slide <id|number>.');
  let index = deck.slides.findIndex((s) => s.id === ref);
  if (index < 0 && /^\d+$/.test(ref)) index = Number(ref) - 1;
  const slide = deck.slides[index];
  if (!slide) throw deps.usageError(`No slide ${ref}; the deck has ${deck.slides.length}.`);
  return slide;
}

function numberFlag(args: Args, name: string, deps: DiagramCliDeps): number | undefined {
  const raw = one(args, name);
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw deps.usageError(`--${name} must be a number.`);
  return n;
}

function pointFlag(args: Args, name: string, deps: DiagramCliDeps): { x: number; y: number } | undefined {
  const raw = one(args, name);
  if (raw == null) return undefined;
  const [x, y] = raw.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw deps.usageError(`--${name} is x,y.`);
  return { x, y };
}

function cellRefs(args: Args): string[] {
  return many(args, 'cells').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

function deckArg(args: Args): string | undefined {
  return args.positional[0];
}

function replaceOps(slide: Slide, elements: readonly SlideElement[]): AgentOperation[] {
  return elements.map((element) => ({ op: 'replaceElement', slideId: slide.id, elementId: element.id, element }) as AgentOperation);
}

function sameCell(a: SlideElement, b: SlideElement): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Bounds beyond the canvas, slide pixels, or null. */
function overflow(bounds: { x: number; y: number; width: number; height: number } | null, canvas: { w: number; h: number }): Record<string, number> | null {
  if (!bounds) return null;
  const out: Record<string, number> = {};
  const r = (n: number) => Math.round(n);
  if (bounds.x < 0) out.left = r(-bounds.x);
  if (bounds.y < 0) out.top = r(-bounds.y);
  if (bounds.x + bounds.width > canvas.w) out.right = r(bounds.x + bounds.width - canvas.w);
  if (bounds.y + bounds.height > canvas.h) out.bottom = r(bounds.y + bounds.height - canvas.h);
  return Object.keys(out).length > 0 ? out : null;
}

// --- diagram style -----------------------------------------------------------------------

export async function diagramStyleCommand(argv: string[], _io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  const args = parseArgs(argv);
  known('style', args, ['slide', 'diagram', 'cells', 'set', 'unset', 'label', 'style', 'keep-waypoints'], deps);
  const deckDir = deps.resolveDeckDir(deckArg(args));
  const deck = await deps.loadDeck(deckDir);
  const slide = slideFor(deck, one(args, 'slide'), deps);
  const refs = cellRefs(args);
  if (refs.length === 0) throw deps.usageError('Name the cells with --cells <cell id,…> (draw.io ids or element ids; * for all).');
  let cells: DiagramEl[];
  try {
    cells = findCells(slide, refs, one(args, 'diagram'));
  } catch (error) {
    throw deps.usageError((error as Error).message);
  }
  const patch: StylePatch = [];
  for (const set of many(args, 'set')) {
    if (!set.includes('=')) throw deps.usageError(`--set takes key=value (or "k=v;k=v"), not "${set}".`);
    patch.push(...parsePatch(set));
  }
  for (const key of many(args, 'unset').flatMap((v) => v.split(/[,;]/)).map((k) => k.trim()).filter(Boolean)) patch.push([key, null]);
  const raw = one(args, 'style');
  const label = one(args, 'label');
  if (patch.length === 0 && raw == null && label == null) throw deps.usageError('Nothing to change: give --set, --unset, --style or --label.');
  const warnings: string[] = [];
  const changed: DiagramEl[] = [];
  for (const cell of cells) {
    const next = JSON.parse(JSON.stringify(cell)) as DiagramEl;
    if (raw != null) F.editStyleText(next, raw);
    if (patch.length > 0) restyleCell(next, patch, { keepWaypoints: one(args, 'keep-waypoints') === 'true' });
    if (label != null) next.label = label;
    warnings.push(...patchWarnings(next, raw != null ? [...parsePatch(raw), ...patch] : patch));
    if (!sameCell(cell, next)) changed.push(next);
  }
  return deps.applyOperations(deckDir, `Restyle ${changed.length === 1 ? changed[0].cell : `${changed.length} cells`}`, replaceOps(slide, changed), {
    slide: slide.id,
    changes: {
      updated: changed.map((el) => ({ cell: el.cell, element: el.id, dio: el.dio, ...(label != null ? { label: el.label } : {}) })),
      unchanged: cells.length - changed.length,
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

// --- diagram layout ----------------------------------------------------------------------

function layoutOptions(args: Args, deps: DiagramCliDeps, algoFlag = 'algo'): LayoutOptions {
  const algoRaw = one(args, algoFlag);
  if (!algoRaw) throw deps.usageError(`Choose --${algoFlag} ${LAYOUT_ALGORITHMS.join('|')} (or a draw.io preset: ${LAYOUT_PRESETS.map((p) => p.id).join(', ')}).`);
  const preset = LAYOUT_PRESETS.find((p) => p.id.toLowerCase() === algoRaw.toLowerCase());
  const algorithm = (preset?.algorithm ?? algoRaw) as LayoutAlgorithm;
  if (!LAYOUT_ALGORITHMS.includes(algorithm)) {
    throw deps.usageError(`Unknown layout ${algoRaw}. Choose ${LAYOUT_ALGORITHMS.join(', ')} or ${LAYOUT_PRESETS.map((p) => p.id).join(', ')}.`);
  }
  const direction = (one(args, 'direction') ?? preset?.direction) as LayoutDirection | undefined;
  if (direction && !LAYOUT_DIRECTIONS.includes(direction)) throw deps.usageError(`--direction is ${LAYOUT_DIRECTIONS.join('|')}.`);
  const corners = one(args, 'corners') as LayoutCorners | undefined;
  if (corners && !['keep', 'straight', 'rounded', 'curved'].includes(corners)) throw deps.usageError('--corners is keep|straight|rounded|curved.');
  const elk: Record<string, string> = {};
  for (const entry of many(args, 'elk')) {
    const at = entry.indexOf('=');
    if (at <= 0) throw deps.usageError(`--elk takes an ELK option key=value, e.g. elk.layered.layering.strategy=LONGEST_PATH.`);
    elk[entry.slice(0, at)] = entry.slice(at + 1);
  }
  return {
    algorithm,
    ...(direction ? { direction } : {}),
    ...(numberFlag(args, 'spacing', deps) != null ? { spacing: numberFlag(args, 'spacing', deps) } : {}),
    ...(numberFlag(args, 'layer-spacing', deps) != null ? { layerSpacing: numberFlag(args, 'layer-spacing', deps) } : {}),
    ...(corners ? { corners } : {}),
    ...(Object.keys(elk).length > 0 ? { elk } : {}),
    ...(pointFlag(args, 'at', deps) ? { at: pointFlag(args, 'at', deps) } : {}),
  };
}

export async function diagramLayoutCommand(argv: string[], _io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  const args = parseArgs(argv);
  known('layout', args, ['slide', 'diagram', 'cells', 'parent', 'algo', 'direction', 'spacing', 'layer-spacing', 'corners', 'elk', 'at'], deps);
  const deckDir = deps.resolveDeckDir(deckArg(args));
  const deck = await deps.loadDeck(deckDir);
  const slide = slideFor(deck, one(args, 'slide'), deps);
  const options = layoutOptions(args, deps);
  const diagramId = one(args, 'diagram');
  const refs = cellRefs(args);
  let cells: string[] | undefined;
  if (refs.length > 0) {
    try {
      cells = findCells(slide, refs, diagramId).map((el) => el.id);
    } catch (error) {
      throw deps.usageError((error as Error).message);
    }
  }
  const result = await layoutDiagram(slide, { ...options, ...(diagramId ? { diagramId } : {}), ...(cells ? { cells } : {}), parent: one(args, 'parent') ?? null });
  if (result.nodes.length === 0) throw deps.usageError(`Nothing to lay out on slide ${slide.id}${diagramId ? ` in ${diagramId}` : ''}.`);
  const beyond = overflow(result.bounds, deck.canvas);
  const preset = LAYOUT_PRESETS.find((p) => p.algorithm === options.algorithm && (p.direction ?? null) === (options.direction ?? (p.direction ? 'down' : null)));
  return deps.applyOperations(deckDir, `Layout: ${preset?.title ?? options.algorithm}`, replaceOps(slide, result.elements), {
    slide: slide.id,
    diagram: result.diagramId,
    layout: { algorithm: options.algorithm, direction: options.direction ?? null },
    changes: { shapes: result.nodes.length, connectors: result.edges.length, updated: result.elements.length },
    bounds: result.bounds && {
      x: Math.round(result.bounds.x), y: Math.round(result.bounds.y), w: Math.round(result.bounds.width), h: Math.round(result.bounds.height),
    },
    ...(beyond ? { warnings: [`The laid-out diagram reaches past the slide (${Object.entries(beyond).map(([k, v]) => `${k} ${v}px`).join(', ')}): use --spacing, smaller shapes, --at, or a smaller --scale on diagram apply.`] } : {}),
  });
}

// --- diagram add ----------------------------------------------------------------------------

export async function diagramAddCommand(argv: string[], io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  const args = parseArgs(argv);
  known('add', args, ['slide', 'diagram', 'vertex', 'edge', 'json', 'scale', 'origin', 'layout', 'direction', 'spacing', 'layer-spacing', 'corners', 'elk', 'at'], deps);
  const deckDir = deps.resolveDeckDir(deckArg(args));
  const deck = await deps.loadDeck(deckDir);
  const slide = slideFor(deck, one(args, 'slide'), deps);
  const specs: CellSpec[] = [];
  try {
    for (const line of many(args, 'vertex')) specs.push(cellSpec('vertex', parseSpecLine(line)));
    for (const line of many(args, 'edge')) specs.push(cellSpec('edge', parseSpecLine(line)));
    for (const file of many(args, 'json')) {
      const text = file.trim().startsWith('{') || file.trim().startsWith('[') ? file : await readFile(resolve(io.cwd, file), 'utf8');
      specs.push(...specsFromJson(JSON.parse(text)));
    }
  } catch (error) {
    throw deps.usageError((error as Error).message);
  }
  if (specs.length === 0) throw deps.usageError('Nothing to add: give --vertex, --edge or --json.');
  let added;
  try {
    added = addFromSpecs(slide, specs, makeId, {
      ...(one(args, 'diagram') ? { diagramId: one(args, 'diagram') } : {}),
      ...(numberFlag(args, 'scale', deps) ? { scale: numberFlag(args, 'scale', deps) } : {}),
      ...(pointFlag(args, 'origin', deps) ? { origin: pointFlag(args, 'origin', deps) } : {}),
    });
  } catch (error) {
    throw deps.usageError((error as Error).message);
  }
  let elements = added.elements;
  const extraOps: AgentOperation[] = [];
  let layout: Record<string, unknown> | null = null;
  const warnings = [...added.warnings];
  if (one(args, 'layout')) {
    const options = layoutOptions(args, deps, 'layout');
    const work: Slide = {
      ...slide,
      elements: [...slide.elements, ...elements],
      diagrams: { ...(slide.diagrams ?? {}), ...(added.meta ? { [added.diagramId]: added.meta } : {}) },
    };
    const result = await layoutDiagram(work, { ...options, diagramId: added.diagramId });
    const byId = new Map<string, SlideElement>(result.elements.map((el) => [el.id, el]));
    elements = elements.map((el) => (byId.get(el.id) ?? el) as typeof el);
    const fresh = new Set(elements.map((el) => el.id));
    extraOps.push(...replaceOps(slide, result.elements.filter((el) => !fresh.has(el.id))));
    layout = { algorithm: options.algorithm, direction: options.direction ?? null, shapes: result.nodes.length };
    const beyond = overflow(result.bounds, deck.canvas);
    if (beyond) warnings.push(`The laid-out diagram reaches past the slide (${Object.entries(beyond).map(([k, v]) => `${k} ${v}px`).join(', ')}).`);
  }
  const operations: AgentOperation[] = [];
  if (added.meta) {
    operations.push({ op: 'setSlideProperties', slideId: slide.id, slide: { id: slide.id, diagrams: { ...(slide.diagrams ?? {}), [added.diagramId]: added.meta } } } as AgentOperation);
  }
  operations.push({ op: 'insertElements', slideId: slide.id, elements } as AgentOperation);
  operations.push(...extraOps);
  return deps.applyOperations(deckDir, `Add ${elements.length === 1 ? elements[0].cell : `${elements.length} diagram cells`}`, operations, {
    slide: slide.id,
    diagram: added.diagramId,
    changes: { inserted: added.added },
    ...(layout ? { layout } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
