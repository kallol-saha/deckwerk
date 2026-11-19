/**
 * `slide-agent diagram …`: draw.io diagrams on slides, in draw.io's own file
 * format and vocabulary.
 *
 *   diagram export [deck] --slide <s> [--diagram <id>] [--output f.drawio] [--compressed]
 *   diagram apply  [deck] <f.drawio> --slide <s> [--page <n|name>] [--diagram <id>] [--scale <s>]
 *   diagram import [deck] <f.drawio> [--after <s>] [--scale <s>]
 *   diagram list   [deck] [--slide <s>]
 *   diagram build  [deck] --slide <s> [--diagram <id>] [--cells a,b,…] [--order auto|reading|flow]
 *
 * export writes the slide's diagram as a `.drawio` file; edit it (by hand,
 * in draw.io desktop, or as an agent) and apply it back: cells are matched
 * by their draw.io id, so what you did not touch keeps its builds and
 * pairings. import adds one new slide per page. The file's animation (its
 * draw.io steps) is the diagram's builds, both ways; build makes builds that
 * reveal the diagram cell by cell, every one on a click.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AgentOperation } from '@shared/agent.js';
import type { Deck, Slide } from '@shared/deck.js';
import { makeId } from '@shared/geometry.js';
import { diagramPageOperations, drawioToSlides, pickPage } from '@shared/diagram/apply.js';
import { buildDiagramInOrder } from '@shared/diagram/animation.js';
import { slideDiagramIds, slideToDrawio } from '@shared/diagram/convert.js';
import { writeDrawio } from '@shared/diagram/drawioFile.js';
import { readDiagramFile } from '@shared/diagram/figureExport.js';
import { inflateDiagramChunk } from '@shared/diagram/figureInflate.js';
import { labelText } from '@shared/diagram/label.js';
import { resolveStyle } from '@shared/diagram/style.js';
import { diagramAddCommand, diagramLayoutCommand, diagramStyleCommand } from './diagramAgentCli.js';

export interface DiagramCliIo {
  cwd: string;
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface DiagramCliDeps {
  resolveDeckDir: (candidate: string | undefined) => string;
  loadDeck: (deckDir: string) => Promise<Deck>;
  /** Applies one labelled transaction (through the live editor when it is open); returns the exit code. */
  applyOperations: (deckDir: string, label: string, operations: AgentOperation[], extra: Record<string, unknown>) => Promise<number>;
  usageError: (message: string) => Error;
}

interface Parsed {
  flags: Map<string, string | true>;
  positional: string[];
}

const VALUED = new Set(['slide', 'diagram', 'output', 'page', 'scale', 'after', 'label', 'cells', 'order',
  'vertex-effect', 'connector-effect', 'vertex-duration', 'connector-duration']);

function parse(argv: string[]): Parsed {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o') {
      flags.set('output', argv[++i] ?? '');
      continue;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) flags.set(name, inline);
    else if (VALUED.has(name)) flags.set(name, argv[++i] ?? '');
    else flags.set(name, true);
  }
  return { flags, positional };
}

function slideFor(deck: Deck, ref: string | undefined, deps: DiagramCliDeps): { slide: Slide; index: number } {
  if (!ref) throw deps.usageError('Name the slide with --slide <id|number>.');
  let index = deck.slides.findIndex((s) => s.id === ref);
  if (index < 0 && /^\d+$/.test(ref)) index = Number(ref) - 1;
  const slide = deck.slides[index];
  if (!slide) throw deps.usageError(`No slide ${ref}; the deck has ${deck.slides.length}.`);
  return { slide, index };
}

function known(command: string, parsed: Parsed, allowed: string[], deps: DiagramCliDeps): void {
  for (const name of parsed.flags.keys()) {
    if (!allowed.includes(name)) {
      throw deps.usageError(`Unknown flag --${name} for diagram ${command}. Known: ${allowed.map((a) => `--${a}`).join(', ')}.`);
    }
  }
}

const USAGE = `usage:
  slide-agent diagram export [deck] --slide <s> [--diagram <id>] [--output <f.drawio>] [--compressed]
  slide-agent diagram apply  [deck] <f.drawio> --slide <s> [--page <n|name>] [--diagram <id>] [--scale <s>]
  slide-agent diagram import [deck] <f.drawio> [--after <s>] [--scale <s>]
  slide-agent diagram list   [deck] [--slide <s>]
  slide-agent diagram build  [deck] --slide <s> [--diagram <id>] [--cells <id,id,…>] [--order auto|reading|flow]
                             [--vertex-effect dissolve|wipe|pop|appear] [--vertex-duration <ms>]
                             [--connector-effect wipe|dissolve|pop|appear] [--connector-duration <ms>]
  slide-agent diagram add    [deck] --slide <s> [--vertex '<spec>']… [--edge '<spec>']… [--json <file>]
                             [--layout <algo> [--direction …]] [--scale <s>] [--origin x,y]
  slide-agent diagram style  [deck] --slide <s> --cells <id,…|*> [--set key=value]… [--unset key]…
                             [--label <text>] [--style <raw style>] [--keep-waypoints]
  slide-agent diagram layout [deck] --slide <s> --algo layered|tree|radial|organic|circle
                             [--direction right|down|left|up] [--spacing <n>] [--layer-spacing <n>]
                             [--cells <id,…>] [--parent <cell>] [--corners keep|straight|rounded|curved]
                             [--at x,y] [--elk key=value]…

  specs: --vertex 'id=enc label="Encoder" style="rounded=1;fillColor=#dae8fc" x=100 y=100 w=120 h=60'
         --vertex 'id=db shape=library:Cylinder x=300 y=100'
         --edge   'id=e1 from=enc to=db style="endArrow=classic"'
  (draw.io units, relative to the diagram origin; slide-agent docs diagrams has every key)`;

export async function diagramCommand(argv: string[], io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  const [sub, ...rest] = argv;
  // The agent toolkit (diagramAgentCli.ts) parses its own repeated flags.
  if (sub === 'style') return diagramStyleCommand(rest, io, deps);
  if (sub === 'add') return diagramAddCommand(rest, io, deps);
  if (sub === 'layout') return diagramLayoutCommand(rest, io, deps);
  const parsed = parse(rest);
  switch (sub) {
    case 'export': return exportCommand(parsed, io, deps);
    case 'apply': return applyCommand(parsed, io, deps);
    case 'import': return importCommand(parsed, io, deps);
    case 'list': return listCommand(parsed, io, deps);
    case 'build': return buildCommand(parsed, io, deps);
    default:
      io.err(`${sub ? `Unknown diagram command: ${sub}\n\n` : ''}${USAGE}`);
      return 2;
  }
}

async function exportCommand(parsed: Parsed, io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  known('export', parsed, ['slide', 'diagram', 'output', 'compressed'], deps);
  const deckDir = deps.resolveDeckDir(parsed.positional[0]);
  const deck = await deps.loadDeck(deckDir);
  const { slide } = slideFor(deck, parsed.flags.get('slide') as string | undefined, deps);
  const ids = slideDiagramIds(slide);
  const wanted = parsed.flags.get('diagram');
  const chosen = typeof wanted === 'string' ? [wanted] : ids;
  if (chosen.length === 0) throw deps.usageError(`Slide ${slide.id} has no diagram. Use diagram apply to put one there.`);
  for (const id of chosen) if (!ids.includes(id)) throw deps.usageError(`Slide ${slide.id} has no diagram ${id}; it has ${ids.join(', ') || 'none'}.`);
  const text = await writeDrawio(slideToDrawio(slide, chosen), { compressed: parsed.flags.get('compressed') === true });
  const output = parsed.flags.get('output');
  if (typeof output === 'string' && output) {
    await writeFile(resolve(io.cwd, output), text, 'utf8');
    io.out(`${JSON.stringify({ status: 'exported', slide: slide.id, diagrams: chosen, file: resolve(io.cwd, output) }, null, 2)}\n`);
  } else {
    io.out(text);
  }
  return 0;
}

async function applyCommand(parsed: Parsed, io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  known('apply', parsed, ['slide', 'diagram', 'page', 'scale', 'label'], deps);
  const [deckArg, fileArg] = parsed.positional.length >= 2 ? parsed.positional : [undefined, parsed.positional[0]];
  if (!fileArg) throw deps.usageError('diagram apply needs a .drawio file.');
  const deckDir = deps.resolveDeckDir(deckArg);
  const deck = await deps.loadDeck(deckDir);
  const { slide } = slideFor(deck, parsed.flags.get('slide') as string | undefined, deps);
  const doc = await readDiagramFile(new Uint8Array(await readFile(resolve(io.cwd, fileArg))), inflateDiagramChunk);
  const diagramFlag = parsed.flags.get('diagram');
  const diagramId = typeof diagramFlag === 'string' ? diagramFlag : undefined;
  const meta = diagramId ? slide.diagrams?.[diagramId] : undefined;
  const pageFlag = parsed.flags.get('page');
  const page = pickPage(doc, meta, typeof pageFlag === 'string' ? pageFlag : undefined);
  const scaleFlag = parsed.flags.get('scale');
  const scale = typeof scaleFlag === 'string' ? Number(scaleFlag) : undefined;
  if (scale !== undefined && !(scale > 0)) throw deps.usageError('--scale must be a positive number.');
  const { operations, summary } = diagramPageOperations(deck, slide, page, {
    diagramId,
    scale,
    ...(scale !== undefined && slide.diagrams?.[diagramId ?? ''] ? {
      placement: { origin: slide.diagrams[diagramId ?? ''].origin, scale },
    } : {}),
    makeId,
  }, doc.attributes);
  const label = typeof parsed.flags.get('label') === 'string' ? parsed.flags.get('label') as string : `Apply diagram ${page.name}`;
  return deps.applyOperations(deckDir, label, operations, {
    slide: slide.id,
    diagram: summary.diagramId,
    page: page.name,
    changes: { inserted: summary.inserted.length, updated: summary.updated.length, deleted: summary.deleted, unchanged: summary.unchanged },
  });
}

async function importCommand(parsed: Parsed, io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  known('import', parsed, ['after', 'scale', 'label'], deps);
  const [deckArg, fileArg] = parsed.positional.length >= 2 ? parsed.positional : [undefined, parsed.positional[0]];
  if (!fileArg) throw deps.usageError('diagram import needs a .drawio file.');
  const deckDir = deps.resolveDeckDir(deckArg);
  const deck = await deps.loadDeck(deckDir);
  const doc = await readDiagramFile(new Uint8Array(await readFile(resolve(io.cwd, fileArg))), inflateDiagramChunk);
  const scaleFlag = parsed.flags.get('scale');
  const scale = typeof scaleFlag === 'string' ? Number(scaleFlag) : undefined;
  const slides = drawioToSlides(doc, deck.canvas, makeId, scale ? { scale } : {});
  const after = parsed.flags.get('after');
  let afterSlideId: string | null = deck.slides[deck.slides.length - 1]?.id ?? null;
  if (typeof after === 'string') {
    afterSlideId = after === '0' ? null : slideFor(deck, after, deps).slide.id;
  }
  return deps.applyOperations(deckDir, `Import ${doc.pages.length === 1 ? doc.pages[0].name : `${doc.pages.length} diagram pages`}`, [
    { op: 'insertSlides', afterSlideId, slides },
  ], { slides: slides.map((s) => s.id) });
}

async function listCommand(parsed: Parsed, io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  known('list', parsed, ['slide'], deps);
  const deckDir = deps.resolveDeckDir(parsed.positional[0]);
  const deck = await deps.loadDeck(deckDir);
  const slides = parsed.flags.has('slide')
    ? [slideFor(deck, parsed.flags.get('slide') as string, deps)]
    : deck.slides.map((slide, index) => ({ slide, index }));
  const out: unknown[] = [];
  for (const { slide, index } of slides) {
    for (const diagramId of slideDiagramIds(slide)) {
      const cells = slide.elements.filter((el) => (el.type === 'vertex' || el.type === 'connector') && el.diagram === diagramId);
      out.push({
        slide: index + 1,
        slideId: slide.id,
        diagram: diagramId,
        page: slide.diagrams?.[diagramId]?.name,
        cells: cells.map((el) => {
          if (el.type === 'vertex') {
            const style = resolveStyle(el.dio, 'vertex');
            return { cell: el.cell, element: el.id, kind: 'vertex', shape: style.shape, label: labelText(style, el.label), box: [round(el.x), round(el.y), round(el.w), round(el.h)] };
          }
          if (el.type === 'connector') {
            const source = cells.find((c) => c.id === el.source);
            const target = cells.find((c) => c.id === el.target);
            return {
              cell: el.cell, element: el.id, kind: 'connector',
              from: source && source.type === 'vertex' ? source.cell : null,
              to: target && target.type === 'vertex' ? target.cell : null,
              label: labelText(resolveStyle(el.dio, 'edge'), el.label),
            };
          }
          return null;
        }),
      });
    }
  }
  io.out(`${JSON.stringify(out, null, 2)}\n`);
  return 0;
}

/**
 * diagram build: one appear build per cell, each on its own click —
 * vertices in order along the connectors (or reading order), each connector
 * drawn along its route once both its ends are in. Earlier builds of those
 * cells are replaced. One undoable change.
 */
async function buildCommand(parsed: Parsed, _io: DiagramCliIo, deps: DiagramCliDeps): Promise<number> {
  known('build', parsed, ['slide', 'diagram', 'cells', 'order', 'label', 'vertex-effect', 'connector-effect', 'vertex-duration', 'connector-duration'], deps);
  const deckDir = deps.resolveDeckDir(parsed.positional[0]);
  const deck = await deps.loadDeck(deckDir);
  const { slide } = slideFor(deck, parsed.flags.get('slide') as string | undefined, deps);
  const diagram = parsed.flags.get('diagram');
  const wanted = typeof parsed.flags.get('cells') === 'string'
    ? new Set((parsed.flags.get('cells') as string).split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const cells = slide.elements.filter((el) => (el.type === 'vertex' || el.type === 'connector')
    && (typeof diagram !== 'string' || el.diagram === diagram)
    && (!wanted || wanted.has(el.cell) || wanted.has(el.id)));
  if (cells.length === 0) throw deps.usageError(`Slide ${slide.id} has no such diagram cells.`);
  const order = parsed.flags.get('order');
  if (order !== undefined && order !== 'auto' && order !== 'reading' && order !== 'flow') throw deps.usageError('--order is auto, reading or flow.');
  const effect = (name: string) => {
    const value = parsed.flags.get(name);
    if (value === undefined) return undefined;
    if (value !== 'appear' && value !== 'dissolve' && value !== 'wipe' && value !== 'pop') throw deps.usageError(`--${name} is appear, dissolve, wipe or pop.`);
    return value;
  };
  const ms = (name: string) => {
    const value = parsed.flags.get(name);
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!(n >= 0)) throw deps.usageError(`--${name} is a number of milliseconds.`);
    return n;
  };
  const timeline = buildDiagramInOrder(slide, new Set(cells.map((el) => el.id)), makeId, {
    order: order as 'auto' | 'reading' | 'flow' | undefined,
    vertexEffect: effect('vertex-effect'), connectorEffect: effect('connector-effect'),
    vertexDuration: ms('vertex-duration'), connectorDuration: ms('connector-duration'),
  });
  const label = typeof parsed.flags.get('label') === 'string' ? parsed.flags.get('label') as string : 'Build diagram in order';
  const byId = new Map(cells.map((el) => [el.id, el]));
  return deps.applyOperations(deckDir, label, [
    { op: 'setSlideProperties', slideId: slide.id, slide: { id: slide.id, timeline } },
  ], {
    slide: slide.id,
    builds: timeline.filter((e) => byId.has(e.action.target)).map((e) => (byId.get(e.action.target) as { cell: string }).cell),
  });
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
