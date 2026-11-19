import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type Deck } from '../src/shared/deck.js';
import { drawioFromPng } from '../src/shared/diagram/figureExport.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { Cdp, electronBinary, eventually, findTarget, launchBrowser, stopBrowser, type RunningBrowser } from './support/browserSession.js';
import { collabClientDir } from './support/collabClient.js';

/**
 * Math in diagram labels and Export Diagram as…, in the browser editor:
 * switch Mathematical Typesetting on from the Text tab and the label is
 * typeset on the canvas; export the diagram as a PNG and the download is a
 * cropped image that carries the diagram.
 */
const DECK_ID = 'diagram-math-figure';
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

describe.skipIf(!electronBinary)('math labels and figure export in the editor', () => {
  it('typesets on the canvas and exports a PNG that reopens', { timeout: 240_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'diagram-math-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const downloads = join(workDir, 'downloads');
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(downloads, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    const deck = emptyDeck('Math');
    const slide = deck.slides[0];
    const ids = ['vertex-loss', 'vertex-value', 'connector-e1'];
    const makeId = () => ids.shift()!;
    const loss = newVertex(slide, { dio: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=20;', label: 'Loss $$\\mathcal{L} = \\sum_i (y_i - \\hat{y}_i)^2$$', x: 300, y: 300, w: 420, h: 200 }, makeId);
    addCells(slide, [loss]);
    const value = newVertex(slide, { dio: 'ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=20;', label: 'Value \\(V(s)\\)', x: 1000, y: 330, w: 300, h: 140 }, makeId);
    addCells(slide, [value]);
    addCells(slide, [newConnector(slide, { source: loss.element.id, target: value.element.id }, makeId)]);
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; color: #111827; }\n', 'utf8');

    server = await startCollabServer({ rootDir: decksRoot, clientDir: await collabClientDir(), host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Math`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }).catch(() =>
      cdp.call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }));
    const node = (id: string) => `#canvas [data-element-id="${id}"]`;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${node('vertex-loss')}'))`), 'the diagram never loaded');
    expect(await cdp.evaluate<boolean>(`Boolean(document.querySelector('${node('vertex-loss')} .katex'))`)).toBe(false);
    const shots = process.env.DECKWERK_TEST_SHOTS;
    const shoot = async (name: string, selector: string) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const box = await cdp.evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      })()`);
      const { data } = await cdp.call('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } }) as { data: string };
      await writeFile(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
    };

    // Mathematical Typesetting, on the Text tab.
    await cdp.click('#side-tabs button[data-panel="inspector"]', 'Props tab');
    await cdp.click(node('vertex-loss'), 'the Loss shape');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} .dfmt'))`), 'no Format panel');
    await cdp.click(`${PANEL} .dfmt-tab[data-tab="text"]`, 'Text tab');
    await cdp.click(`${PANEL} [data-dfmt="math"] input`, 'Mathematical Typesetting');
    await eventually(async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0].diagrams?.[loss.element.diagram]?.model.math;
    }, 'math never reached the saved deck', (math) => math === '1');
    await eventually(async () => cdp.evaluate<boolean>(
      `Boolean(document.querySelector('${node('vertex-loss')} .katex')) && Boolean(document.querySelector('${node('vertex-value')} .katex'))`),
    'the canvas never typeset the labels');
    await shoot('math-canvas', '#canvas');
    await shoot('math-panel', '#side');

    // Export Diagram as… PNG, from the Save As menu.
    await cdp.evaluate(`document.body.click()`);
    // The toolbar shows Save As… when wide, else the compact File menu.
    await cdp.evaluate(`(() => {
      const trigger = [...document.querySelectorAll('.shape-menu-trigger')]
        .find((b) => b.offsetWidth > 0 && /^(Save As…|File)$/.test(b.textContent.trim()));
      trigger.click();
    })()`);
    await eventually(async () => cdp.evaluate<boolean>(`(() => {
      const item = [...document.querySelectorAll('.shape-menu-item')]
        .find((b) => /^(Diagram as SVG, PNG or PDF…|Export Diagram as…)$/.test(b.textContent.trim()));
      if (item) item.click();
      return Boolean(item);
    })()`), 'no Export Diagram menu entry');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('[data-figure-export="dialog"]'))`), 'no export dialog');
    await cdp.evaluate(`(() => { const s = document.querySelector('[data-figure-export="format"]'); s.value = 'png'; s.dispatchEvent(new Event('change')); })()`);
    await cdp.evaluate(`(() => { const s = document.querySelector('[data-figure-export="selection"]'); if (s.checked) s.click(); })()`);
    await shoot('export-dialog', '[data-figure-export="dialog"]');
    await cdp.click('[data-figure-export="submit"]', 'Export');
    const file = await eventually(async () => (await readdir(downloads)).find((f) => f.endsWith('.png')), 'no PNG was downloaded', Boolean);
    const png = new Uint8Array(await readFile(join(downloads, file!)));
    const xml = drawioFromPng(png);
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('math="1"');
    expect(xml).toContain('Loss $$');
    // Cropped to the drawing: about (1300-300+border) x (500-300+border) slide px at 2x.
    const width = Buffer.from(png).readUInt32BE(16);
    const height = Buffer.from(png).readUInt32BE(20);
    expect(width).toBeGreaterThan(2 * 1000);
    expect(width).toBeLessThan(2 * 1100);
    expect(height).toBeGreaterThan(2 * 200);
    expect(height).toBeLessThan(2 * 300);
    if (shots) await writeFile(join(shots, 'exported-figure.png'), png);
  });
});
