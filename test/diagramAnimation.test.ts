import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ConnectorEl, Slide, TimelineEntry, VertexEl } from '../src/shared/deck.js';
import { parseDeck } from '../src/shared/deck.js';
import {
  animationToBuilds, buildDiagramInOrder, buildsToAnimation, convertLegacyAnimation, diagramBuildOrder,
  parseAnimationData, placeDiagramBuilds,
} from '../src/shared/diagram/animation.js';
import { diagramPageOperations, drawioToSlides } from '../src/shared/diagram/apply.js';
import { slideToDrawio } from '../src/shared/diagram/convert.js';
import { readDrawio, writeDrawio } from '../src/shared/diagram/drawioFile.js';
import { routeConnector } from '../src/shared/diagram/element.js';
import {
  dashFlow, morphDiagramFrame, popFrameMarkup, ringFlow, springScale, truncateRoute, wipeFrameMarkup,
} from '../src/shared/diagram/motion.js';
import { connectorStyle } from '../src/shared/diagram/element.js';
import { resolveState, groupIntoSteps, buildEffect, effectDuration } from '../src/shared/timeline.js';

const FIXTURE = resolve(__dirname, 'fixtures/drawio-animation/animation-steps.drawio');

let counter = 0;
const makeId = (prefix: string) => `${prefix}-${++counter}`;

async function importFixture(): Promise<Slide> {
  const doc = await readDrawio(readFileSync(FIXTURE, 'utf8'));
  const [slide] = drawioToSlides(doc, { w: 1920, h: 1080 }, makeId);
  return slide;
}

function cellOf(slide: Slide, id: string): string {
  return slide.elements.find((el) => (el.type === 'vertex' || el.type === 'connector') && el.cell === id)!.id;
}

function summary(slide: Slide): Array<[string, string, string, unknown, number | undefined]> {
  const name = new Map(slide.elements.map((el) => [el.id, (el as VertexEl).cell]));
  return slide.timeline.map((e) => [e.trigger.on, e.action.type, name.get(e.action.target)!, e.action.value, e.action.duration]);
}

function rootAnimation(xml: string): string | null {
  const match = /<UserObject[^>]*animation="([^"]*)"/.exec(xml);
  return match ? match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
}

describe('draw.io animation data', () => {
  it('reads a legacy script as draw.io converts it', () => {
    const data = parseAnimationData('show a fade\nshow b fade\nwait 500\nshow e1\nhide a 200\nsetOpacity b 0.5\nflow e1 start\n# note\n');
    expect(data.steps).toEqual(convertLegacyAnimation('show a fade\nshow b fade\nwait 500\nshow e1\nhide a 200\nsetOpacity b 0.5\nflow e1 start').animation.steps);
    expect(data.steps).toEqual([
      { opacity: { cells: ['*'], value: 0 } },
      { fadeIn: { cells: ['a', 'b'], delay: 400 } },
      { wait: 500 },
      { wipeIn: { cells: ['e1'] }, fadeOut: { cells: ['a'], delay: 200 }, fadeTo: { cells: ['b'], delay: 400, value: 0.5 }, flow: { cells: ['e1'], start: true } },
    ]);
    expect(data.loop).toBe(true);
  });

  it('reads JSON in both wrappings, and throws on malformed JSON as draw.io does', () => {
    expect(parseAnimationData('{"steps":[{"wait":1}],"loop":false}')).toEqual({ steps: [{ wait: 1 }], loop: false, enabled: true });
    expect(parseAnimationData({ animation: { steps: [{ wait: 2 }] } }).steps).toEqual([{ wait: 2 }]);
    expect(() => parseAnimationData('{"steps":')).toThrow();
  });
});

describe('draw.io steps become builds', () => {
  it('turns each wait into a click and runs together what draw.io runs together', async () => {
    const slide = await importFixture();
    expect(summary(slide)).toEqual([
      // e3 is hidden by the opening step and never shown
      ['withPrev', 'disappear', 'e3', null, undefined],
      ['click', 'appear', 'enc', 'dissolve', 400],
      ['click', 'appear', 'e1', 'wipe', 900],
      ['withPrev', 'appear', 'z', 'pop', 600],
      ['click', 'appear', 'e2', 'wipe', 700],
      ['afterPrev', 'appear', 'dec', 'dissolve', 1000],
      ['withPrev', 'flow', 'e2', 'start', undefined],
      ['click', 'opacity', 'enc', 0.3, 500],
      ['afterPrev', 'highlight', 'dec', null, 800],
      ['afterPrev', 'drawio', 'enc', '{"viewbox":{"x":0,"y":0,"width":400,"height":200,"smooth":true}}', undefined],
    ]);
    expect(slide.timeline.find((e) => e.action.type === 'highlight')!.action.color).toBe('#ff0000');
    // The parsed deck keeps every entry.
    expect(() => parseDeck({ version: 1, slides: [slide] })).not.toThrow();
  });

  it('never makes a beat that plays by itself', async () => {
    const slide = await importFixture();
    expect(slide.timeline.every((e) => e.trigger.delay === 0)).toBe(true);
    const steps = groupIntoSteps(slide);
    // Step 0 (on arrival) only sets the starting state, at once.
    expect(steps[0].every((e) => buildEffect(e, slide) === null)).toBe(true);
    expect(steps.length).toBe(5);
    const start = resolveState(slide, 0);
    for (const cell of ['enc', 'z', 'dec', 'e1', 'e2', 'e3']) expect(start.visible.has(cellOf(slide, cell))).toBe(false);
    const end = resolveState(slide, 4);
    expect(end.visible.has(cellOf(slide, 'enc'))).toBe(true);
    expect(end.opacity.get(cellOf(slide, 'enc'))).toBe(0.3);
    expect(end.flowing.get(cellOf(slide, 'e2'))).toBe(true);
    expect(end.visible.has(cellOf(slide, 'e3'))).toBe(false);
  });

  it('gives wipes, pops and opacity changes their durations', async () => {
    const slide = await importFixture();
    const wipe = slide.timeline.find((e) => e.action.value === 'wipe')!;
    expect(buildEffect(wipe, slide)).toBe('wipe');
    expect(effectDuration(wipe, 'wipe')).toBe(900);
    const pop = slide.timeline.find((e) => e.action.value === 'pop')!;
    expect(buildEffect(pop, slide)).toBe('pop');
    const dim = slide.timeline.find((e) => e.action.type === 'opacity')!;
    expect(buildEffect(dim, slide)).toBe('opacity');
  });

  it('makes a fade to a partial opacity of a hidden cell an opacity then a dissolve', () => {
    const slide = vertexSlide();
    const builds = animationToBuilds(JSON.stringify({ animation: { steps: [
      { opacity: { cells: ['*'], value: 0 } }, { fadeTo: { cells: ['a'], value: 0.5 } },
    ] } }), slide, 'diagram-1', makeId);
    expect(builds.entries.map((e) => [e.trigger.on, e.action.type, e.action.value, e.action.duration])).toEqual([
      ['click', 'opacity', 0.5, 0], ['withPrev', 'appear', 'dissolve', 1000],
    ]);
  });
});

describe('builds become draw.io steps', () => {
  it('writes an untouched animation back verbatim', async () => {
    const original = rootAnimation(readFileSync(FIXTURE, 'utf8'));
    const slide = await importFixture();
    const xml = await writeDrawio(slideToDrawio(slide));
    expect(rootAnimation(xml)).toBe(original);
    // and applying the exported file changes no build
    const doc = await readDrawio(xml);
    const { operations } = diagramPageOperations({ canvas: { w: 1920, h: 1080 } }, slide, doc.pages[0], { makeId });
    const props = operations.find((op) => op.op === 'setSlideProperties') as { slide: { timeline?: unknown } };
    expect(props.slide.timeline).toBeUndefined();
  });

  it('writes edited builds as steps, keeping the file\'s waits and the steps it does not play', async () => {
    const slide = await importFixture();
    const enc = slide.timeline.find((e) => e.action.type === 'appear' && e.action.target === cellOf(slide, 'enc'))!;
    enc.action.duration = 250;
    const animation = buildsToAnimation(slide, 'diagram-1')!;
    const steps = JSON.parse(animation).animation.steps;
    expect(steps).toEqual([
      { opacity: { cells: ['*'], value: 0 } },
      { fadeIn: { cells: ['enc'], delay: 250 } },
      { wait: 800 },
      { wipeIn: { cells: ['e1'], delay: 900 } },
      { popIn: { cells: ['z'], delay: 600 }, immediate: true },
      { wait: 500 },
      { wipeIn: { cells: ['e2'], delay: 700 } },
      { fadeIn: { cells: ['dec'], delay: 1000 }, flow: { cells: ['e2'], start: true } },
      { wait: 1000 },
      { fadeTo: { cells: ['enc'], value: 0.3, delay: 500 } },
      { highlight: { cells: ['dec'], color: '#ff0000', duration: 800 } },
      { viewbox: { x: 0, y: 0, width: 400, height: 200, smooth: true } },
    ]);
    expect(JSON.parse(animation).animation.loop).toBe(false);
    // Read back, they are the edited builds.
    const again = animationToBuilds(animation, slide, 'diagram-1', makeId);
    const strip = (list: TimelineEntry[]) => list.map(({ trigger, action }) => ({ on: trigger.on, ...action }));
    expect(strip([...again.initial, ...again.entries])).toEqual(strip(slide.timeline));
  });

  it('writes builds made in DeckWerk, a click becoming a wait', () => {
    const slide = vertexSlide();
    slide.timeline = [
      { id: 't1', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'va', value: 'dissolve', duration: 300 } },
      { id: 't2', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'vb', value: 'pop' } },
      { id: 't3', trigger: { on: 'withPrev', ref: null, delay: 0 }, action: { type: 'appear', target: 'cab', value: 'draw', duration: 500 } },
    ];
    const steps = JSON.parse(buildsToAnimation(slide, 'diagram-1')!).animation.steps;
    expect(steps).toEqual([
      { opacity: { cells: ['*'], value: 0 } },
      { fadeIn: { cells: ['a'], delay: 300 } },
      { wait: 1000 },
      { popIn: { cells: ['b'], delay: 900 } },
      { wipeIn: { cells: ['ab'], delay: 500 }, immediate: true },
    ]);
  });

  it('drops the animation when every build is gone', async () => {
    const slide = await importFixture();
    slide.timeline = [];
    expect(buildsToAnimation(slide, 'diagram-1')).toBeUndefined();
  });
});

function vertex(id: string, cell: string, x: number, y: number): VertexEl {
  return {
    type: 'vertex', id, cell, x, y, w: 100, h: 50, rot: 0, z: 0, opacity: 1, class: [], style: {},
    dio: 'rounded=1;whiteSpace=wrap;html=1;', label: cell, diagram: 'diagram-1', parent: '1', scale: 1, origin: { x: 0, y: 0 },
  } as VertexEl;
}

function connector(id: string, cell: string, source: string, target: string, dio = 'endArrow=classic;html=1;'): ConnectorEl {
  return {
    type: 'connector', id, cell, x: 0, y: 0, w: 1, h: 1, rot: 0, z: 1, opacity: 1, class: [], style: {},
    dio, label: '', diagram: 'diagram-1', parent: '1', scale: 1, origin: { x: 0, y: 0 },
    source, target, points: [], sourcePoint: null, targetPoint: null, labels: [], route: [],
  } as ConnectorEl;
}

function routed(elements: Array<VertexEl | ConnectorEl>): Array<VertexEl | ConnectorEl> {
  const find = (id: string) => elements.find((el): el is VertexEl => el.id === id && el.type === 'vertex');
  return elements.map((el) => (el.type === 'connector' ? { ...el, route: routeConnector(el, find) } : el));
}

function vertexSlide(): Slide {
  return {
    id: 's', name: '', background: { color: null, image: null }, notes: '', timeline: [],
    elements: routed([vertex('va', 'a', 100, 100), vertex('vb', 'b', 400, 100), connector('cab', 'ab', 'va', 'vb')]),
    diagrams: { 'diagram-1': { name: 'P', model: {}, root: '0', layers: [{ cell: '1', label: '', dio: '' }], origin: { x: 0, y: 0 }, scale: 1 } },
  } as Slide;
}

describe('build diagram in order', () => {
  it('follows the connectors from their sources and draws each connector once both ends are in', () => {
    // c sits above a, but a feeds b feeds c
    const els = routed([
      vertex('vc', 'c', 700, 0), vertex('va', 'a', 100, 200), vertex('vb', 'b', 400, 200), vertex('vd', 'd', 100, 400),
      connector('e1', 'e1', 'vb', 'vc'), connector('e0', 'e0', 'va', 'vb'),
    ]);
    expect(diagramBuildOrder(els as Array<VertexEl | ConnectorEl>).map((el) => el.id)).toEqual(['va', 'vb', 'e0', 'vc', 'e1', 'vd']);
    expect(diagramBuildOrder(els as Array<VertexEl | ConnectorEl>, { order: 'reading' }).map((el) => el.id)).toEqual(['vc', 'va', 'vb', 'e1', 'e0', 'vd']);
  });

  it('puts every step on a click, replacing earlier builds of those cells in place', () => {
    const slide = vertexSlide();
    slide.elements.push({ ...vertex('title', 't', 0, 0), type: 'vertex', diagram: 'other' } as VertexEl);
    slide.timeline = [
      { id: 'x', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'title', value: null } },
      { id: 'old', trigger: { on: 'afterPrev', ref: null, delay: 500 }, action: { type: 'appear', target: 'vb', value: null } },
      { id: 'y', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'disappear', target: 'title', value: null } },
    ];
    const timeline = buildDiagramInOrder(slide, new Set(['va', 'vb', 'cab']), makeId);
    expect(timeline.map((e) => [e.trigger.on, e.action.target, e.action.value])).toEqual([
      ['click', 'title', null],
      ['click', 'va', 'dissolve'], ['click', 'vb', 'dissolve'], ['click', 'cab', 'wipe'],
      ['click', 'title', null],
    ]);
    expect(timeline.every((e) => e.trigger.on === 'click' && e.trigger.delay === 0)).toBe(true);
  });

  it('places a diagram\'s starting state first and its beats where they were', () => {
    const existing: TimelineEntry[] = [
      { id: 'a', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'other', value: null } },
      { id: 'b', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'va', value: null } },
      { id: 'c', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'other2', value: null } },
    ];
    const start: TimelineEntry = { id: 's', trigger: { on: 'withPrev', ref: null, delay: 0 }, action: { type: 'disappear', target: 'vb', value: null } };
    const beat: TimelineEntry = { id: 'n', trigger: { on: 'click', ref: null, delay: 0 }, action: { type: 'appear', target: 'va', value: 'wipe' } };
    expect(placeDiagramBuilds(existing, new Set(['va', 'vb']), { initial: [start], entries: [beat] }).map((e) => e.id)).toEqual(['s', 'a', 'n', 'c']);
  });
});

describe('Morph between slides that share diagram cells', () => {
  it('re-routes connectors every frame between the interpolated vertex boxes', () => {
    const from = routed([vertex('a1', 'a', 100, 100), vertex('b1', 'b', 400, 100), connector('c1', 'ab', 'a1', 'b1', 'edgeStyle=orthogonalEdgeStyle;endArrow=block;')]);
    const to = routed([vertex('a2', 'a', 100, 300), vertex('b2', 'b', 600, 120), connector('c2', 'ab', 'a2', 'b2', 'edgeStyle=orthogonalEdgeStyle;endArrow=block;')]);
    const pairs = from.map((el, i) => [el, to[i]] as [VertexEl | ConnectorEl, VertexEl | ConnectorEl]);
    const half = morphDiagramFrame(pairs, to, 0.5);
    const a = half.get('a2')!.now as VertexEl;
    expect([a.x, a.y]).toEqual([100, 200]);
    const b = half.get('b2')!.now as VertexEl;
    expect([b.x, b.y]).toEqual([500, 110]);
    // The route is draw.io's routing of the vertices where they are now,
    // not a blend of the two routes.
    const expected = routeConnector(to[2] as ConnectorEl, (id) => (id === 'a2' ? a : b));
    expect((half.get('c2')!.now as ConnectorEl).route).toEqual(expected);
    const blended = (from[2] as ConnectorEl).route.map((p, i) => ({ x: (p.x + (to[2] as ConnectorEl).route[i].x) / 2, y: (p.y + (to[2] as ConnectorEl).route[i].y) / 2 }));
    expect((half.get('c2')!.now as ConnectorEl).route).not.toEqual(blended);
    // At the end it is the target's own route.
    expect((morphDiagramFrame(pairs, to, 1).get('c2')!.now as ConnectorEl).route).toEqual((to[2] as ConnectorEl).route);
  });
});

describe('frames of a cell build', () => {
  it('draws a connector on along its route with the arrowhead at the tip', () => {
    expect(truncateRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.75)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]);
    const line: ConnectorEl = { ...connector('c', 'c', 'va', 'vb'), source: null, target: null, sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 200, y: 0 } };
    const full = routed([line])[0] as ConnectorEl;
    const box = { ...full, x: -10, y: -10, w: 220, h: 20 };
    const half = wipeFrameMarkup(box, 0.5);
    // the head's tip is at x = 100 in the box (110 local): the head path starts there
    const tip = /<path d="M ([\d.]+) [\d.]+ L/.exec(half.split('</path>')[0].split('<path')[2] ? `<path${half.split('<path')[2]}` : '');
    // (the head's tip sits a little short of the end, as draw.io paints it)
    expect(Number(tip?.[1])).toBeGreaterThan(108);
    expect(Number(tip?.[1])).toBeLessThan(110.5);
    expect(wipeFrameMarkup(box, 0)).not.toContain('<path');
  });

  it('pops a vertex on draw.io\'s spring', () => {
    expect(springScale(0)).toBe(0);
    expect(springScale(1)).toBeCloseTo(1, 1);
    expect(springScale(0.2)).toBeGreaterThan(1.3);
    expect(popFrameMarkup(vertex('v', 'v', 0, 0), 0.2)).toContain('translate(');
  });
});

describe('flow', () => {
  it('moves draw.io\'s default dashes 16 px every half second', () => {
    expect(dashFlow(connectorStyle(connector('c', 'c', 'a', 'b', 'flowAnimation=1;')), 1, null))
      .toEqual({ dasharray: '8', offset: 16, duration: 500, timing: 'linear', direction: 'normal' });
    // At twice the scale the dashes are twice as long and take as long.
    expect(dashFlow(connectorStyle(connector('c', 'c', 'a', 'b', 'flowAnimation=1;')), 2, null).duration).toBe(500);
    const dashed = dashFlow(connectorStyle(connector('c', 'c', 'a', 'b', 'flowAnimation=1;dashed=1;dashPattern=4 2;strokeWidth=2;')), 1, null);
    expect(dashed.dasharray).toBe('8 4');
    expect(dashed.duration).toBe(375);
  });

  it('sizes rings and dots as draw.io does', () => {
    const ring = ringFlow(connectorStyle(connector('c', 'c', 'a', 'b', 'flowAnimation=1;flowAnimationType=ring;')), 1, 1);
    expect(ring).toMatchObject({ hollow: true, size: 12, dasharray: '0 101', offset: 51 });
    expect(ring.animation).toBe('dw-flow-ring 1500ms linear -750ms infinite normal');
  });
});
