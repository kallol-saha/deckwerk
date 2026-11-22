import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type ConnectorEl, type Deck, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { getStyleValue } from '../src/shared/diagram/style.js';
import {
  Cdp,
  electronBinary,
  eventually,
  findTarget,
  launchBrowser,
  stopBrowser,
  type RunningBrowser,
} from './support/browserSession.js';
import { collabClientDir } from './support/collabClient.js';

/**
 * draw.io's Format panel in the inspector, driven like a person would: select
 * a shape on the canvas, give it a fill colour from the Style tab and a font
 * size from the Text tab; select the connector, pick a line end and a
 * waypoint style. Every change has to reach the saved deck's draw.io style
 * string, with the rest of the string as it was.
 */
const DECK_ID = 'diagram-format';
const PANEL = '#inspector';

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

describe.skipIf(!electronBinary)('the draw.io Format panel', () => {
  it('styles a shape and a connector through the Style, Text and Arrange tabs', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'diagram-format-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const clientDir = await collabClientDir();
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    const deck = emptyDeck('Diagram format');
    const slide = deck.slides[0];
    const ids = ['vertex-enc', 'vertex-dec', 'connector-e1'];
    const makeId = () => ids.shift()!;
    const enc = newVertex(slide, { dio: 'rounded=0;whiteSpace=wrap;html=1;', label: 'Encoder', x: 300, y: 400, w: 240, h: 120 }, makeId);
    addCells(slide, [enc]);
    const dec = newVertex(slide, { dio: 'ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;', label: 'z', x: 900, y: 400, w: 240, h: 120 }, makeId);
    addCells(slide, [dec]);
    const edge = newConnector(slide, { source: enc.element.id, target: dec.element.id }, makeId);
    addCells(slide, [edge]);
    // An ordinary DeckWerk shape, for a mixed selection.
    slide.elements.push({
      id: 'plain-box', type: 'shape', x: 300, y: 750, w: 300, h: 150, rot: 0, z: 10,
      opacity: 1, class: [], style: {}, shape: 'rect', fill: '#dbe4ff', stroke: null,
      strokeWidth: 0, radius: 0, path: null, pathSize: null, arrowStart: false, arrowEnd: false,
    } as never);
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; color: #111827; }\n', 'utf8');

    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Format`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    const node = (id: string) => `#canvas [data-element-id="${id}"]`;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${node('vertex-enc')}'))`),
      'the diagram never loaded');
    await cdp.click('#side-tabs button[data-panel="inspector"]', 'Props tab');

    const saved = async <T extends VertexEl | ConnectorEl>(id: string) => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0].elements.find((e) => e.id === id) as T | undefined;
    };
    const shots = process.env.DECKWERK_TEST_SHOTS;
    const shoot = async (name: string) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const box = await cdp.evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
        const r = document.querySelector('#side').getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      })()`);
      const { data } = await cdp.call('Page.captureScreenshot', {
        format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false,
      }) as { data: string };
      await writeFile(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const unfoldAll = () => cdp.evaluate(`(() => {
      for (const s of document.querySelectorAll('${PANEL} .dfmt-section.is-folded')) s.querySelector('.dfmt-section-toggle')?.click();
    })()`);
    const tab = async (name: 'style' | 'text' | 'arrange') => {
      await cdp.click(`${PANEL} .dfmt-tab[data-tab="${name}"]`, `${name} tab`);
      await eventually(async () => cdp.evaluate<boolean>(
        `!document.querySelector('${PANEL} [data-tab-body="${name}"]').hidden`), `the ${name} tab never opened`);
    };

    // --- the shape ---------------------------------------------------------------
    await cdp.click(node('vertex-enc'), 'the Encoder shape');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} .dfmt'))`),
      'the Format panel never appeared for the shape');
    // draw.io's Arrange tab replaces DeckWerk's Geometry for diagram cells.
    expect(await cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} .geometry-section'))`)).toBe(false);
    await tab('style');

    // Fill colour: the swatch opens the colour picker; type the colour in.
    await cdp.click(`${PANEL} [data-dfmt="fillColor-color"] .color-picker-trigger`, 'Fill colour swatch');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('.color-picker-popover'))`),
      'the colour picker never opened');
    await cdp.typeInto('.color-picker-popover input[aria-label="Hex color"]', '#dae8fc', 'Hex field');
    const filled = (await eventually(() => saved<VertexEl>('vertex-enc'), 'the fill never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'fillColor') === '#dae8fc'))!;
    expect(filled.dio).toBe('rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;');

    // A colour scheme swatch: fill and stroke at once.
    await cdp.click(`${PANEL} .dfmt-scheme[data-scheme="0-3"]`, 'green scheme');
    await eventually(() => saved<VertexEl>('vertex-enc'), 'the colour scheme never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'fillColor') === '#d5e8d4' && getStyleValue(el?.dio, 'strokeColor') === '#82b366');
    await unfoldAll();
    await shoot('vertex-style');

    // Font size on the Text tab.
    await tab('text');
    await cdp.typeInto(`${PANEL} input[data-dfmt="fontSize"]`, '18', 'Font size');
    const sized = (await eventually(() => saved<VertexEl>('vertex-enc'), 'the font size never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'fontSize') === '18'))!;
    expect(sized.dio).toBe('rounded=0;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=18;');
    // Bold through the fontStyle bitmask.
    await cdp.click(`${PANEL} [data-dfmt="bold"]`, 'Bold');
    await eventually(() => saved<VertexEl>('vertex-enc'), 'bold never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'fontStyle') === '1');
    await unfoldAll();
    await shoot('vertex-text');

    // Rotation on the Arrange tab keeps the element and the style in step.
    await tab('arrange');
    await cdp.typeInto(`${PANEL} input[data-dfmt="angle"]`, '30', 'Angle');
    const turned = (await eventually(() => saved<VertexEl>('vertex-enc'), 'the angle never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'rotation') === '30'))!;
    expect(turned.rot).toBe(30);
    await unfoldAll();
    await shoot('vertex-arrange');

    // --- the connector -----------------------------------------------------------
    // Click the middle of the route's longest segment.
    const route = (await saved<ConnectorEl>('connector-e1'))!.route;
    let mid = { x: 0, y: 0 };
    let longest = -1;
    for (let i = 1; i < route.length; i++) {
      const length = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
      if (length > longest) {
        longest = length;
        mid = { x: (route[i].x + route[i - 1].x) / 2, y: (route[i].y + route[i - 1].y) / 2 };
      }
    }
    const slideBox = await cdp.evaluate<{ left: number; top: number; scale: number }>(`(() => {
      const r = document.querySelector('#canvas .slide').getBoundingClientRect();
      return { left: r.left, top: r.top, scale: r.width / 1920 };
    })()`);
    await cdp.clickAt(slideBox.left + mid.x * slideBox.scale, slideBox.top + mid.y * slideBox.scale);
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} [data-dfmt="endArrow"]'))`),
      'the Format panel never showed the connector\'s line ends');
    await tab('style');

    // Line end: an open diamond.
    await cdp.click(`${PANEL} [data-dfmt="endArrow"]`, 'Line end menu');
    await cdp.click('.dfmt-menu .dfmt-menu-item[data-marker="diamond"][data-fill="0"]', 'open diamond');
    await eventually(() => saved<ConnectorEl>('connector-e1'), 'the line end never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'endArrow') === 'diamond' && getStyleValue(el?.dio, 'endFill') === '0');

    // Waypoints: entity relation (and the route follows it).
    await cdp.click(`${PANEL} [data-dfmt="waypoints"]`, 'Waypoints menu');
    await cdp.click('.dfmt-menu .dfmt-menu-item[data-edge-style="entityRelation"]', 'Entity relation');
    const routed = (await eventually(() => saved<ConnectorEl>('connector-e1'), 'the waypoint style never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'edgeStyle') === 'entityRelationEdgeStyle'))!;
    expect(routed.dio).toBe('edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=diamond;endFill=0;');

    // Line style: curved turns rounded off.
    await cdp.choose(`${PANEL} select[data-dfmt="lineShape"]`, 'curved', 'Line style');
    await eventually(() => saved<ConnectorEl>('connector-e1'), 'the line style never reached the saved deck',
      (el) => getStyleValue(el?.dio, 'curved') === '1' && getStyleValue(el?.dio, 'rounded') === '0');
    await unfoldAll();
    await shoot('connector-style');
    await tab('text');
    await unfoldAll();
    await shoot('connector-text');
    await tab('arrange');
    await unfoldAll();
    await shoot('connector-arrange');

    // The dark theme is the default; the light one has to read too.
    await cdp.evaluate(`document.documentElement.dataset.uiTheme = 'light'`);
    await tab('style');
    await shoot('connector-style-light');
    await cdp.click(node('vertex-dec'), 'the z shape');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} [data-dfmt="fillColor-color"]'))`),
      'the Format panel never showed the second shape');
    await unfoldAll();
    await shoot('vertex-style-light');
    await cdp.evaluate(`delete document.documentElement.dataset.uiTheme`);

    // Two shapes: one panel for both, one undo step changing both.
    await cdp.clickModified(node('vertex-enc'), 8, 'the Encoder shape, with Shift');
    await eventually(async () => cdp.evaluate<string>(`document.querySelector('${PANEL} .insp-title')?.textContent ?? ''`),
      'the panel never named both shapes', (title) => title === '2 shapes');
    await cdp.click(`${PANEL} .dfmt-scheme[data-scheme="0-6"]`, 'red scheme');
    await eventually(async () => [await saved<VertexEl>('vertex-enc'), await saved<VertexEl>('vertex-dec')],
      'the scheme never reached both shapes', (both) => both.every((el) => getStyleValue(el?.dio, 'fillColor') === '#f8cecc'));

    // A mixed selection keeps DeckWerk's inspector for the plain shape and
    // adds the Format panel for the diagram cells only.
    await cdp.clickModified(node('plain-box'), 8, 'the plain shape, with Shift');
    await eventually(async () => cdp.evaluate<boolean>(
      `Boolean(document.querySelector('${PANEL} .geometry-section') && document.querySelector('${PANEL} .dfmt'))`),
      'a mixed selection did not show both the inspector and the Format panel');
    await cdp.click(`${PANEL} .dfmt-tab[data-tab="style"]`, 'style tab');
    await cdp.click(`${PANEL} .dfmt-scheme[data-scheme="0-2"]`, 'blue scheme');
    await eventually(async () => saved<VertexEl>('vertex-dec'), 'the scheme never reached the shapes in a mixed selection',
      (el) => getStyleValue(el?.dio, 'fillColor') === '#dae8fc');
    const plain = (await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`)
      .then(async (r) => (await r.json() as Deck).slides[0].elements.find((e) => e.id === 'plain-box'))) as { fill?: string };
    expect(plain.fill).toBe('#dbe4ff');
    await shoot('mixed-selection');
  });
});
