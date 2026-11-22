import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type ConnectorEl, type Deck, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { PALETTES } from '../src/shared/diagram/library/index.js';
import { getStyleValue } from '../src/shared/diagram/style.js';
import {
  Cdp,
  electronBinary,
  eventually,
  findTarget,
  launchBrowser,
  stopBrowser,
  wait,
  type RunningBrowser,
} from './support/browserSession.js';
import { collabClientDir } from './support/collabClient.js';

/**
 * draw.io's mouse interactions on diagram cells, with real pointer input:
 * the hover arrows (drag one onto another shape to connect, click one to
 * clone), the connection points, and a selected connector's handles
 * (detach an end, add a waypoint from a virtual bend, move a segment).
 */
const DECK_ID = 'diagram-editing';
const MOD = process.platform === 'darwin' ? 4 : 2;
const SHOTS = process.env.DECKWERK_TEST_SHOTS
  ?? 'C:\\Users\\kallo\\AppData\\Local\\Temp\\claude\\a92ed2403afd4078\\b475ef0a-f832-44ff-85a0-124a8b8f4703\\scratchpad\\shots';

let workDir = '';
let server: RunningCollabServer | null = null;
let browser: RunningBrowser | null = null;
let editor: Cdp | null = null;

afterEach(async () => {
  editor?.close();
  editor = null;
  await stopBrowser(browser?.process ?? null);
  browser = null;
  await server?.close();
  server = null;
  if (workDir) await rm(workDir, { recursive: true, force: true });
  workDir = '';
});

let counter = 0;
const makeId = (prefix: string) => `${prefix}-seed${++counter}`;

/**
 * Two shapes side by side, a loose labelled straight connector below them,
 * a container at the top right and a group of two shapes at the bottom.
 */
function seededDeck(): {
  deck: Deck; a: VertexEl; b: VertexEl; line: ConnectorEl; container: VertexEl; group: VertexEl; child: VertexEl; lockedShape: VertexEl;
  flow: VertexEl;
} {
  const deck = emptyDeck('Diagram editing');
  const slide = deck.slides[0];
  const style = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
  const add = (spec: Parameters<typeof newVertex>[1]) => {
    const made = newVertex(slide, spec, makeId);
    addCells(slide, [made]);
    return made.element;
  };
  const container = add({ dio: 'rounded=0;whiteSpace=wrap;html=1;container=1;fillColor=#f5f5f5;strokeColor=#666666;verticalAlign=top;', label: 'Container', x: 1450, y: 60, w: 400, h: 220 });
  const a = add({ dio: style, label: 'A', x: 300, y: 300, w: 240, h: 120 });
  const b = add({ dio: style, label: 'B', x: 1100, y: 300, w: 240, h: 120 });
  const group = add({ dio: 'group', x: 1000, y: 850, w: 260, h: 100 });
  const child = add({ dio: style, label: 'G1', x: 1000, y: 850, w: 100, h: 100, parent: group.cell });
  add({ dio: style, label: 'G2', x: 1160, y: 850, w: 100, h: 100, parent: group.cell });
  const line = newConnector(slide, {
    dio: 'html=1;endArrow=classic;',
    label: 'go',
    sourcePoint: { x: 300, y: 800 },
    targetPoint: { x: 900, y: 800 },
  }, makeId);
  addCells(slide, [line]);
  // A shape on a locked layer: neither picked nor offered arrows.
  slide.diagrams!['diagram-1'].layers.push({ cell: 'locked-layer', label: 'Locked', dio: 'locked=1;' });
  const lockedShape = add({ dio: style, label: 'L', x: 100, y: 940, w: 120, h: 80, parent: 'locked-layer' });
  // A Flowchart-library shape: its hover picker offers that library's shapes.
  const flowItem = PALETTES.find((p) => p.id === 'flowchart')!.items.find((i) => i.cells.length === 1 && !i.cells[0].edge)!;
  const flow = add({ dio: flowItem.cells[0].style, x: 60, y: 560, unitW: flowItem.cells[0].geometry.width, unitH: flowItem.cells[0].geometry.height });
  return { deck, a, b, line: line.element, container, group, child, lockedShape, flow };
}

describe.skipIf(!electronBinary)('draw.io interactions on the canvas', () => {
  it('connects, clones, detaches and bends with draw.io gestures', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'diagram-editing-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const clientDir = await collabClientDir();
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await mkdir(SHOTS, { recursive: true });
    const { deck, a, b, line, container, group, child, lockedShape, flow } = seededDeck();
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; }\n', 'utf8');
    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Diagram`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    await eventually(async () => editor!.evaluate<boolean>(
      `Boolean(document.querySelector('#canvas .slide [data-element-id="${a.id}"]'))`), 'the diagram never drew');

    const saved = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0].elements;
    };
    const slide = await editor.evaluate<{ left: number; top: number; scale: number }>(`(() => {
      const r = document.querySelector('#canvas .slide').getBoundingClientRect();
      return { left: r.left, top: r.top, scale: r.width / 1920 };
    })()`);
    const screen = (p: { x: number; y: number }) => ({ x: slide.left + p.x * slide.scale, y: slide.top + p.y * slide.scale });
    const mouse = (type: string, p: { x: number; y: number }, buttons: number, modifiers = 0) => editor!.call('Input.dispatchMouseEvent', {
      type, x: p.x, y: p.y, button: buttons || type !== 'mouseMoved' ? 'left' : 'none', buttons, clickCount: 1, modifiers,
    });
    const hover = async (p: { x: number; y: number }) => mouse('mouseMoved', screen(p), 0);
    /** A real drag between two screen points, through a few intermediate moves. */
    const dragScreen = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await mouse('mouseMoved', from, 0);
      await mouse('mousePressed', from, 1);
      for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
        await mouse('mouseMoved', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, 1);
      }
      await mouse('mouseReleased', to, 0);
    };
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => dragScreen(screen(from), screen(to));
    const clickScreen = async (p: { x: number; y: number }, modifiers = 0) => {
      await mouse('mouseMoved', p, 0, modifiers);
      await mouse('mousePressed', p, 1, modifiers);
      await mouse('mouseReleased', p, 0, modifiers);
    };
    const savedEl = async <T>(id: string) => (await saved()).find((el) => el.id === id) as T;
    const shot = async (name: string) => {
      const { data } = await editor!.call('Page.captureScreenshot', { format: 'png' }) as { data: string };
      await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'));
    };
    const centerOf = (selector: string) => editor!.evaluate<{ x: number; y: number } | null>(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);

    // 1. Hovering A shows its connection points at once and its arrows after draw.io's delay.
    await hover({ x: a.x + 60, y: a.y + 30 });
    await hover({ x: a.x + 70, y: a.y + 40 });
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-point').length`),
      'no connection points on hover', (n) => n === 16);
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-arrow').length`),
      'the hover arrows never showed', (n) => n === 4);
    await shot('diagram-hover-arrows.png');

    // Pointing at a connection point highlights it.
    await hover({ x: a.x + a.w - 1, y: a.y + a.h / 2 });
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-point-highlight').length`),
      'the connection point under the pointer was not highlighted', (n) => n === 1);
    await shot('diagram-connection-points.png');

    // Resting on the east arrow shows draw.io's hover picker: four shapes beside it.
    await hover({ x: a.x + a.w / 2, y: a.y + a.h / 2 });
    const east = (await eventually(() => centerOf(`.dg-arrow[data-dg-arrow="east"]`), 'no east arrow', (p) => p != null))!;
    await mouse('mouseMoved', east, 0);
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-shape-picker.hovering .dg-shape-picker-item').length`),
      'resting on an arrow showed no shape picker', (n) => n === 4);
    await shot('diagram-hover-picker.png');

    // 2. Dragging the east arrow onto B connects A to B.
    await dragScreen(east, screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    const connected = (await eventually(saved, 'no connector from A to B was saved',
      (els) => els.some((el) => el.type === 'connector' && el.source === a.id && el.target === b.id)))!;
    const ab = connected.find((el) => el.type === 'connector' && el.source === a.id && el.target === b.id) as ConnectorEl;
    expect(ab.dio).toContain('edgeStyle=orthogonalEdgeStyle');
    // The new connector is selected and shows draw.io's handles instead of a box.
    await eventually(async () => editor!.evaluate<number>(
      `document.querySelectorAll('.dg-handle-terminal[data-dg-connector="${ab.id}"]').length`),
    'the new connector shows no terminal handles', (n) => n === 2);
    expect(await editor.evaluate<string>(
      `document.querySelector('.dg-handle-terminal[data-dg-connector="${ab.id}"]').dataset.dgLook`)).toBe('terminal');
    await shot('diagram-selected-connector.png');

    // 3. Moving its middle segment down stores the route's corners.
    const segment = (await eventually(() => centerOf(`.dg-handle-segment[data-dg-connector="${ab.id}"][data-dg-index="2"]`),
      'no middle segment handle', (p) => p != null))!;
    await dragScreen(segment, { x: segment.x, y: segment.y + 120 * slide.scale });
    await eventually(saved, 'moving the segment stored no waypoints',
      (els) => ((els.find((el) => el.id === ab.id) as ConnectorEl | undefined)?.points.length ?? 0) > 0);

    // 4. Dragging the target handle off B detaches that end.
    const end = (await eventually(() => centerOf(`.dg-handle-terminal[data-dg-connector="${ab.id}"][data-dg-index="1"]`),
      'no target handle', (p) => p != null))!;
    await dragScreen(end, screen({ x: 1500, y: 700 }));
    const detached = (await eventually(saved, 'the target end was not detached',
      (els) => (els.find((el) => el.id === ab.id) as ConnectorEl | undefined)?.target === null))!;
    const loose = detached.find((el) => el.id === ab.id) as ConnectorEl;
    expect(loose.source).toBe(a.id);
    expect(loose.targetPoint!.x).toBeCloseTo(1500, -1);
    expect(loose.targetPoint!.y).toBeCloseTo(700, -1);
    await eventually(async () => editor!.evaluate<string | null>(
      `document.querySelector('.dg-handle-terminal[data-dg-connector="${ab.id}"][data-dg-index="1"]')?.dataset.dgLook ?? null`),
    'the loose end does not look loose', (look) => look === 'loose');

    // 5. Selecting the straight connector and dragging its virtual bend adds a waypoint.
    await clickScreen(screen({ x: 450, y: 800 }));
    const virtual = (await eventually(() => centerOf(`.dg-handle-virtual[data-dg-connector="${line.id}"]`),
      'the straight connector shows no virtual bend', (p) => p != null))!;
    await dragScreen(virtual, screen({ x: 600, y: 680 }));
    const bent = (await eventually(saved, 'dragging the virtual bend added no waypoint',
      (els) => ((els.find((el) => el.id === line.id) as ConnectorEl | undefined)?.points.length ?? 0) === 1))!;
    const waypoint = (bent.find((el) => el.id === line.id) as ConnectorEl).points[0];
    expect(waypoint.x).toBeCloseTo(600, -1);
    expect(waypoint.y).toBeCloseTo(680, -1);

    // Its label handle moves the label.
    const labelHandle = (await eventually(() => centerOf(`.dg-handle-label[data-dg-connector="${line.id}"]`),
      'the labelled connector shows no label handle', (p) => p != null))!;
    await dragScreen(labelHandle, { x: labelHandle.x, y: labelHandle.y - 60 * slide.scale });
    // labelGeometry is in draw.io units: slide px over the diagram's scale
    await eventually(saved, 'dragging the label handle did not move the label', (els) => {
      const moved = els.find((el) => el.id === line.id) as ConnectorEl | undefined;
      return Math.abs(moved?.labelGeometry?.y ?? 0) * (moved?.scale ?? 1) >= 40;
    });
    await shot('diagram-waypoint-and-label.png');

    // A double-click on the waypoint removes it.
    const bend = (await eventually(() => centerOf(`.dg-handle-bend[data-dg-connector="${line.id}"]`),
      'no waypoint handle', (p) => p != null))!;
    await clickScreen(bend);
    await clickScreen(bend);
    await eventually(saved, 'a double-click on the waypoint did not remove it',
      (els) => (els.find((el) => el.id === line.id) as ConnectorEl | undefined)?.points.length === 0);

    // 6. Ctrl+clicking B's south arrow clones B below it with a connector, and selects the clone.
    const southArrowOf = async (v: VertexEl) => {
      await clickScreen(screen({ x: 1800, y: 1000 }));
      await hover({ x: v.x + v.w / 2, y: v.y + v.h / 2 });
      await hover({ x: v.x + v.w / 2 + 5, y: v.y + v.h / 2 });
      const arrow = (await eventually(() => centerOf(`.dg-arrow[data-dg-arrow="south"]`), 'no south arrow', (p) => p != null))!;
      await wait(50);
      return arrow;
    };
    const south = await southArrowOf(b);
    await clickScreen(south, 2);
    const seeded = new Set(deck.slides[0].elements.map((el) => el.id));
    const cloned = (await eventually(saved, 'clicking the arrow made no clone',
      (els) => els.some((el) => el.type === 'vertex' && !seeded.has(el.id))))!;
    const clone = cloned.find((el) => el.type === 'vertex' && !seeded.has(el.id)) as VertexEl;
    expect(clone.w).toBe(b.w);
    expect(clone.x).toBe(b.x);
    // draw.io's default edge length (80 units, at the diagram's scale) below B
    expect(clone.y).toBe(b.y + b.h + 80 * b.scale);
    expect(clone.label).toBe('B');
    expect(cloned.some((el) => el.type === 'connector' && el.source === b.id && el.target === clone.id)).toBe(true);

    // 7. One undo takes the clone and its connector back.
    const vertexCount = cloned.filter((el) => el.type === 'vertex').length;
    await editor.chord('z', 'KeyZ', 90, MOD);
    await eventually(saved, 'undo did not remove the clone',
      (els) => els.filter((el) => el.type === 'vertex').length === vertexCount - 1
        && !els.some((el) => el.type === 'connector' && el.target === clone.id));

    // A plain click opens draw.io's shape picker under the pointer; the ellipse
    // goes below B, connected, with B's colours.
    await clickScreen(await southArrowOf(b));
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-shape-picker:not(.hovering) .dg-shape-picker-item').length`),
      'a plain click on an arrow opened no shape picker', (n) => n === 16);
    await shot('diagram-shape-picker.png');
    // The slide has a Flowchart shape, so draw.io offers that library for B (a
    // rectangle is also Flowchart's Process) when it is used most; else the basic shapes.
    const pickerKind = await editor.evaluate<string>(`document.querySelector('.dg-shape-picker').dataset.dgPicker`);
    const pickStyle = await editor.evaluate<string>(`document.querySelector('.dg-shape-picker .dg-shape-picker-item:nth-child(3)').dataset.dgPickStyle`);
    const ellipse = (await centerOf('.dg-shape-picker .dg-shape-picker-item:nth-child(3)'))!;
    await clickScreen(ellipse);
    const picked = (await eventually(saved, 'picking a shape inserted nothing',
      (els) => els.some((el) => el.type === 'vertex' && !seeded.has(el.id) && el.dio === pickStyle)))!;
    const oval = picked.find((el) => el.type === 'vertex' && !seeded.has(el.id) && el.dio === pickStyle) as VertexEl;
    if (pickerKind === 'basic') {
      expect(oval.dio.startsWith('ellipse;')).toBe(true);
      expect(oval.w).toBe(80 * b.scale);
      expect(oval.dio).toContain('fillColor=#dae8fc');
    }
    expect(oval.x + oval.w / 2).toBe(b.x + b.w / 2);
    expect(picked.some((el) => el.type === 'connector' && el.source === b.id && el.target === oval.id)).toBe(true);
    await editor.chord('z', 'KeyZ', 90, MOD);
    await eventually(saved, 'undo did not remove the picked shape', (els) => !els.some((el) => el.id === oval.id));

    // Dragging an arrow to empty slide leaves a loose connector (Ctrl/Cmd would clone).
    const southAgain = await southArrowOf(b);
    await dragScreen(southAgain, screen({ x: b.x + b.w / 2, y: 680 }));
    const dangling = (await eventually(saved, 'the drop on empty slide made no loose connector',
      (els) => els.some((el) => el.type === 'connector' && el.source === b.id && el.target === null)))!;
    expect(dangling.filter((el) => el.type === 'vertex' && !seeded.has(el.id))).toHaveLength(0);
    await editor.chord('z', 'KeyZ', 90, MOD);

    // 8. A click on a grouped shape selects its group; the next click the shape.
    const selectionBox = () => editor!.evaluate<{ w: number; n: number }>(`(() => {
      const boxes = document.querySelectorAll('.sel-box');
      return { n: boxes.length, w: boxes[0] ? parseFloat(boxes[0].style.width) : 0 };
    })()`);
    await clickScreen(screen({ x: 1800, y: 1000 }));
    await wait(600);
    await clickScreen(screen({ x: child.x + 50, y: child.y + 50 }));
    await eventually(selectionBox, 'the first click did not select the group', (s) => s.n === 1 && s.w === group.w);
    await wait(600);
    await clickScreen(screen({ x: child.x + 50, y: child.y + 50 }));
    await eventually(selectionBox, 'the second click did not select the grouped shape', (s) => s.n === 1 && s.w === child.w);

    // 9. Dropping A on the container puts it inside; dragging it out takes it out.
    await clickScreen(screen({ x: 1800, y: 1000 }));
    await drag({ x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: container.x + 200, y: container.y + 130 });
    await eventually(saved, 'A was not put into the container',
      (els) => (els.find((el) => el.id === a.id) as VertexEl | undefined)?.parent === container.cell);
    const inside = (await saved()).find((el) => el.id === a.id) as VertexEl;
    expect(inside.z).toBeGreaterThan(container.z);
    await drag({ x: container.x + 200, y: container.y + 130 }, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    await eventually(saved, 'A was not taken out of the container',
      (els) => (els.find((el) => el.id === a.id) as VertexEl | undefined)?.parent === '1');

    // 10. A shape on a locked layer is neither picked nor offered points or arrows.
    await clickScreen(screen({ x: 1800, y: 1000 }));
    await hover({ x: lockedShape.x + 60, y: lockedShape.y + 40 });
    await wait(700);
    await hover({ x: lockedShape.x + 61, y: lockedShape.y + 40 });
    expect(await editor.evaluate<number>(`document.querySelectorAll('.dg-arrow, .dg-point').length`)).toBe(0);
    await clickScreen(screen({ x: lockedShape.x + 60, y: lockedShape.y + 40 }));
    await wait(200);
    expect(await editor.evaluate<number>(`document.querySelectorAll('.sel-box').length`)).toBe(0);

    // 11. draw.io's grid shows behind the diagram; the toggle and Ctrl+Shift+G write the page's `grid`.
    const gridState = () => editor!.evaluate<{ button: boolean; active: boolean; drawn: boolean }>(`(() => {
      const b = document.querySelector('#canvas .dg-grid-toggle');
      return { button: Boolean(b && !b.hidden), active: Boolean(b?.classList.contains('active')),
        drawn: Boolean(document.querySelector('#canvas.dg-grid, #canvas .canvas-host.dg-grid, .canvas-host.dg-grid')) };
    })()`);
    expect(await gridState()).toEqual({ button: true, active: true, drawn: true });
    await shot('diagram-grid.png');
    const gridModel = async () => (await (await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`)).json() as Deck)
      .slides[0].diagrams?.['diagram-1']?.model?.grid;
    await clickScreen((await centerOf('#canvas .dg-grid-toggle'))!);
    await eventually(gridModel, 'the grid toggle did not turn the grid off', (g) => g === '0');
    expect((await gridState()).drawn).toBe(false);
    await editor.chord('G', 'KeyG', 71, MOD | 8);
    await eventually(gridModel, 'Ctrl+Shift+G did not turn the grid on', (g) => g === '1');

    // 12. Moving B snaps it to the grid (10 units at the diagram's scale).
    const g = 10 * b.scale;
    const bNow = await savedEl<VertexEl>(b.id);
    await drag({ x: bNow.x + bNow.w / 2, y: bNow.y + bNow.h / 2 }, { x: bNow.x + bNow.w / 2 + 37, y: bNow.y + bNow.h / 2 + 23 });
    const snappedB = (await eventually(() => savedEl<VertexEl>(b.id), 'B did not move', (v) => v.x !== bNow.x))!;
    expect(snappedB.x % g).toBe(0);
    expect(snappedB.y % g).toBe(0);

    // 13. Keys: an arrow moves B by a unit, Shift+arrow by the grid, Alt+Shift+arrow clones and connects.
    await editor.chord('ArrowRight', 'ArrowRight', 39, 0);
    await eventually(() => savedEl<VertexEl>(b.id), 'ArrowRight did not move B', (v) => v.x === snappedB.x + b.scale);
    await editor.chord('ArrowDown', 'ArrowDown', 40, 8);
    await eventually(() => savedEl<VertexEl>(b.id), 'Shift+ArrowDown did not move B a grid step', (v) => v.y === snappedB.y + g);
    const beforeKeys = new Set((await saved()).map((el) => el.id));
    await editor.chord('ArrowRight', 'ArrowRight', 39, 1 | 8);
    const keyed = (await eventually(saved, 'Alt+Shift+ArrowRight made no connected clone',
      (els) => els.some((el) => el.type === 'vertex' && !beforeKeys.has(el.id))))!;
    const right = keyed.find((el) => el.type === 'vertex' && !beforeKeys.has(el.id)) as VertexEl;
    const bKeyed = keyed.find((el) => el.id === b.id) as VertexEl;
    expect(right.x).toBe(bKeyed.x + bKeyed.w + 80 * b.scale);
    expect(keyed.some((el) => el.type === 'connector' && el.source === b.id && el.target === right.id)).toBe(true);

    // 14. Escape during a handle drag puts the connector back.
    await clickScreen(screen({ x: 450, y: 800 }));
    const lineBefore = await savedEl<ConnectorEl>(line.id);
    const startHandle = (await eventually(() => centerOf(`.dg-handle-terminal[data-dg-connector="${line.id}"][data-dg-index="0"]`),
      'no start handle', (p) => p != null))!;
    await mouse('mouseMoved', startHandle, 0);
    await mouse('mousePressed', startHandle, 1);
    await mouse('mouseMoved', { x: startHandle.x + 40, y: startHandle.y + 40 }, 1);
    await mouse('mouseMoved', { x: startHandle.x + 80, y: startHandle.y + 60 }, 1);
    await editor.key('Escape', 27);
    await mouse('mouseMoved', { x: startHandle.x + 120, y: startHandle.y + 80 }, 1);
    await mouse('mouseReleased', { x: startHandle.x + 120, y: startHandle.y + 80 }, 0);
    await wait(500);
    expect((await savedEl<ConnectorEl>(line.id)).sourcePoint).toEqual(lineBefore.sourcePoint);

    // 15. Outline connect: an end dropped on B's border attaches at that exact point,
    // fixed and not projected, with draw.io's green outline highlight on the way.
    await clickScreen(screen({ x: 450, y: 800 }));
    const bOut = await savedEl<VertexEl>(b.id);
    const start = (await eventually(() => centerOf(`.dg-handle-terminal[data-dg-connector="${line.id}"][data-dg-index="0"]`),
      'no start handle', (p) => p != null))!;
    const onBorder = screen({ x: bOut.x + bOut.w - 2, y: bOut.y + bOut.h * 0.375 });
    await mouse('mouseMoved', start, 0);
    await mouse('mousePressed', start, 1);
    for (const t of [0.3, 0.6, 0.9, 1]) {
      await mouse('mouseMoved', { x: start.x + (onBorder.x - start.x) * t, y: start.y + (onBorder.y - start.y) * t }, 1);
    }
    expect(await editor.evaluate<boolean>(`/stroke="#00ff00"/i.test(document.querySelector('.dg-highlight')?.innerHTML ?? '')`)).toBe(true);
    await shot('diagram-outline-connect.png');
    await mouse('mouseReleased', onBorder, 0);
    const outlined = (await eventually(() => savedEl<ConnectorEl>(line.id), 'the end did not attach to B', (c) => c.source === b.id))!;
    expect(Number(getStyleValue(outlined.dio, 'exitX'))).toBeCloseTo((bOut.w - 2) / bOut.w, 2);
    expect(Number(getStyleValue(outlined.dio, 'exitY'))).toBeCloseTo(0.375, 2);
    expect(getStyleValue(outlined.dio, 'exitPerimeter')).toBe('0');

    // 16. A Flowchart shape's picker offers the Flowchart library's shapes.
    await clickScreen(screen({ x: 1800, y: 1000 }));
    await hover({ x: flow.x + flow.w / 2, y: flow.y + flow.h / 2 });
    await hover({ x: flow.x + flow.w / 2 + 3, y: flow.y + flow.h / 2 });
    const flowEast = (await eventually(() => centerOf(`.dg-arrow[data-dg-arrow="east"]`), 'no east arrow on the flowchart shape', (p) => p != null))!;
    await wait(50);
    await clickScreen(flowEast);
    const library = (await eventually(async () => editor!.evaluate<{ kind: string; n: number } | null>(`(() => {
      const p = document.querySelector('.dg-shape-picker:not(.hovering)');
      return p ? { kind: p.dataset.dgPicker, n: p.querySelectorAll('.dg-shape-picker-item').length } : null;
    })()`), 'no picker for the flowchart shape', (p) => p != null))!;
    expect(library.kind).toBe('library');
    expect(library.n).toBeGreaterThan(4);
    await shot('diagram-library-picker.png');
    await editor.key('Escape', 27);
    await eventually(async () => editor!.evaluate<number>(`document.querySelectorAll('.dg-shape-picker').length`),
      'Escape did not close the picker', (n) => n === 0);
  });
});
