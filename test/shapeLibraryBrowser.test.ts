import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type Deck } from '../src/shared/deck.js';
import { libraryItem, paintedBounds } from '../src/shared/diagram/library/index.js';
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
 * The Shapes panel (draw.io's shape library) driven with real input in the
 * browser editor: open it from the toolbar, search, click a result, and drag
 * an entry onto the slide. The saved deck is the witness.
 */
const DECK_ID = 'shape-library';

type VertexEl = Extract<Deck['slides'][number]['elements'][number], { type: 'vertex' }>;
type ConnectorEl = Extract<Deck['slides'][number]['elements'][number], { type: 'connector' }>;

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

async function shot(cdp: Cdp, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  const dir = process.env.DECKWERK_TEST_SHOTS;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  const { data } = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  }) as { data: string };
  await writeFile(join(dir, name), Buffer.from(data, 'base64'));
}

describe.skipIf(!electronBinary)('the Shapes panel', () => {
  // The production client build is setup, and slow on a busy machine.
  let clientDir = '';
  beforeAll(async () => {
    clientDir = await collabClientDir();
  }, 600_000);

  it('searches, inserts by click and by drag and drop', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'shape-library-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    await saveDeck(deckDir, emptyDeck('Shapes'));
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; }\n', 'utf8');
    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Shapes`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('.shape-library-toggle'))`), 'no Shapes toggle');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('#canvas .stage .slide'))`), 'no slide on the canvas');

    const saved = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0].elements;
    };

    // Shapes on the Insert bar opens the panel beside the rail, General open.
    expect(await cdp.evaluate<boolean>(`document.getElementById('shapes').hidden`)).toBe(true);
    await cdp.click('.shape-library-toggle', 'Shapes');
    await eventually(async () => cdp.evaluate<boolean>(`(() => {
      const panel = document.getElementById('shapes');
      return !panel.hidden && panel.getBoundingClientRect().width > 150
        && document.querySelectorAll('[data-palette="general"] .shape-tile svg').length > 10;
    })()`), 'the panel never showed General');
    expect(await cdp.evaluate<string>(`document.querySelector('.shape-library-toggle').getAttribute('aria-pressed')`)).toBe('true');
    const layout = await cdp.evaluate<{ rail: number; shapes: number; canvas: number }>(`(() => ({
      rail: document.getElementById('rail').getBoundingClientRect().right,
      shapes: document.getElementById('shapes').getBoundingClientRect().left,
      canvas: document.getElementById('canvas').getBoundingClientRect().left,
    }))()`);
    // Between the rail and the canvas.
    expect(layout.shapes).toBeGreaterThanOrEqual(layout.rail - 1);
    expect(layout.canvas).toBeGreaterThan(layout.shapes + 150);

    // Open a second palette by its title.
    await cdp.click('[data-palette="flowchart"] .shape-palette-title', 'Flowchart');
    await eventually(async () => cdp.evaluate<boolean>(
      `document.querySelectorAll('[data-palette="flowchart"] .shape-tile').length > 20`), 'Flowchart never opened');
    const panelBox = await cdp.evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
      const r = document.getElementById('shapes').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    })()`);
    await wait(300);
    await shot(cdp, 'shape-library-palettes.png', panelBox);

    // Hovering an entry shows the larger preview with its title.
    const hoverAt = await cdp.evaluate<{ x: number; y: number }>(`(() => {
      const tile = document.querySelector('[data-item="general.12"]');
      tile.scrollIntoView({ block: 'nearest' });
      const r = tile.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverAt.x, y: hoverAt.y, button: 'none', buttons: 0 });
    await eventually(async () => cdp.evaluate<string | null>(
      `document.querySelector('.shape-library-tooltip-title')?.textContent ?? null`), 'no tooltip', (t) => t === 'Cylinder');
    await shot(cdp, 'shape-library-tooltip.png', { x: panelBox.x, y: panelBox.y, width: panelBox.width + 260, height: Math.min(panelBox.height, 420) });

    // Search: "cylinder" lists the cylinder first; clicking it inserts it.
    await cdp.click('.shape-library-search input', 'search');
    await cdp.typeKeys('cylinder');
    await eventually(async () => cdp.evaluate<number>(
      `document.querySelectorAll('.shape-library-results .shape-tile').length`), 'no search results', (n) => n > 0);
    expect(await cdp.evaluate<boolean>(`document.querySelector('.shape-library-palettes').hidden`)).toBe(true);
    await shot(cdp, 'shape-library-search.png', panelBox);
    expect(await cdp.evaluate<string>(`document.querySelector('.shape-library-results .shape-tile').getAttribute('aria-label')`)).toBe('Cylinder');
    await cdp.click('.shape-library-results .shape-tile', 'first result');
    const withCylinder = await eventually(saved, 'no cylinder in the saved deck',
      (els) => els.some((e) => e.type === 'vertex' && e.dio.includes('shape=cylinder3')));
    const cylinder = withCylinder!.find((e) => e.type === 'vertex') as VertexEl;
    // A new diagram is drawn at scale 2: draw.io's 60×80 is 120×160 on the slide.
    expect(cylinder).toMatchObject({ w: 120, h: 160, scale: 2 });
    expect(cylinder.dio).toBe('shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;');
    // Selected, in the middle of the visible canvas (snapped to the 10-unit grid).
    expect(await cdp.evaluate<string[]>(`[...window.store.get().selection]`)).toEqual([cylinder.id]);
    const centre = await cdp.evaluate<{ x: number; y: number }>(`(() => {
      const host = document.getElementById('canvas').getBoundingClientRect();
      const stage = document.querySelector('#canvas .stage').getBoundingClientRect();
      const s = stage.width / 1920;
      return { x: (host.left + host.width / 2 - stage.left) / s, y: (host.top + host.height / 2 - stage.top) / s };
    })()`);
    expect(Math.abs(cylinder.x + 60 - centre.x)).toBeLessThanOrEqual(20);
    expect(Math.abs(cylinder.y + 80 - centre.y)).toBeLessThanOrEqual(20);
    // On draw.io's 10-unit grid: 20 slide pixels at scale 2.
    expect(cylinder.x % 20).toBe(0);
    expect(cylinder.y % 20).toBe(0);

    // Clear the search; drag Rectangle onto the slide at slide point (346, 726), which is
    // (173, 363) in draw.io units at scale 2.
    await cdp.click('.shape-library-search input', 'search');
    await cdp.key('Escape', 27);
    await eventually(async () => cdp.evaluate<boolean>(`!document.querySelector('.shape-library-palettes').hidden`), 'search never cleared');
    const from = await cdp.evaluate<{ x: number; y: number }>(`(() => {
      const r = document.querySelector('[data-item="general.0"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    const to = await cdp.evaluate<{ x: number; y: number }>(`(() => {
      const r = document.querySelector('#canvas .stage').getBoundingClientRect();
      const s = r.width / 1920;
      return { x: r.left + 346 * s, y: r.top + 726 * s };
    })()`);
    const move = (type: string, p: { x: number; y: number }, buttons: number) => cdp.call('Input.dispatchMouseEvent', {
      type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1,
    });
    await move('mouseMoved', from, 0);
    await move('mousePressed', from, 1);
    for (let i = 1; i <= 8; i++) {
      await move('mouseMoved', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }, 1);
    }
    // The live preview sits where the shape will land, at its size on the slide.
    const preview = await cdp.evaluate<{ left: number; top: number; width: number; height: number; scale: number } | null>(`(() => {
      const p = document.querySelector('.shape-library-drag-preview:not(.is-thumb) > svg');
      if (!p) return null;
      const r = p.getBoundingClientRect();
      const stage = document.querySelector('#canvas .stage').getBoundingClientRect();
      return { left: r.left - stage.left, top: r.top - stage.top, width: r.width, height: r.height, scale: stage.width / 1920 };
    })()`);
    expect(preview).not.toBeNull();
    await shot(cdp, 'shape-library-drag.png');
    await move('mouseReleased', to, 0);
    const withRect = await eventually(saved, 'the dropped rectangle never reached the saved deck',
      (els) => els.some((e) => e.type === 'vertex' && e.dio === 'rounded=0;whiteSpace=wrap;html=1;'));
    const rect = withRect!.find((e) => e.type === 'vertex' && e.dio === 'rounded=0;whiteSpace=wrap;html=1;') as VertexEl;
    // Its corner at the pointer, snapped half a grid step back: (173, 363) → (170, 360) in
    // draw.io units, (340, 720) on the slide; draw.io's 120×60 is 240×120.
    expect(rect).toMatchObject({ x: 340, y: 720, w: 240, h: 120, scale: 2 });
    // The preview drew what was inserted, where it landed: the entry's painted bounds (the box
    // and the stroke around it, in draw.io units) at the diagram's scale times the stage's.
    const painted = paintedBounds(libraryItem('general.0')!);
    const k = rect.scale * preview!.scale;
    expect(Math.abs(preview!.width - painted.width * k)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(preview!.height - painted.height * k)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(preview!.left - (rect.x + painted.x * rect.scale) * preview!.scale)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(preview!.top - (rect.y + painted.y * rect.scale) * preview!.scale)).toBeLessThanOrEqual(1.5);
    expect(rect.cell).not.toBe(cylinder.cell);
    expect(rect.diagram).toBe(cylinder.diagram);

    // Alt+click with the rectangle selected: an ellipse below it, connected.
    await eventually(async () => cdp.evaluate<boolean>(`(() => {
      const s = window.store?.get?.().selection;
      return Boolean(s && s.has(${JSON.stringify(rect.id)}));
    })()`), 'the dropped rectangle is not selected');
    await cdp.clickModified('[data-item="general.4"]', 1 /* Alt */, 'Ellipse');
    const connected = await eventually(saved, 'Alt+click never connected a new shape',
      (els) => els.some((e) => e.type === 'connector' && e.source === rect.id));
    const edge = connected!.find((e) => e.type === 'connector' && e.source === rect.id) as ConnectorEl;
    const ellipse = connected!.find((e) => e.id === edge.target) as VertexEl;
    expect(ellipse.dio).toContain('ellipse');
    // 80 draw.io units below, 160 slide pixels at scale 2.
    expect(ellipse.y).toBe(rect.y + rect.h + 160);
    await wait(300);
    await shot(cdp, 'shape-library-inserted.png');

    // The light UI theme: thumbnails take its colours.
    await cdp.evaluate(`document.documentElement.dataset.uiTheme = 'light'`);
    await wait(300);
    await shot(cdp, 'shape-library-light.png', panelBox);
  });
});
