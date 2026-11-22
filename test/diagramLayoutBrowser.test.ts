import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type Deck, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import {
  Cdp, electronBinary, eventually, findTarget, launchBrowser, stopBrowser, type RunningBrowser,
} from './support/browserSession.js';
import { collabClientDir } from './support/collabClient.js';

/**
 * Arrange → Layout in the Format panel: select a shape of a diagram whose
 * shapes sit in one row, choose Vertical Flow, and the saved deck has them
 * one below the other (one store commit, so one undo step).
 */
const DECK_ID = 'diagram-layout';
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

describe.skipIf(!electronBinary)('Arrange → Layout', () => {
  it('lays the diagram out from the Format panel', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'diagram-layout-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const clientDir = await collabClientDir();
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    const deck = emptyDeck('Diagram layout');
    const slide = deck.slides[0];
    const ids = ['vertex-a', 'vertex-b', 'vertex-c', 'connector-ab', 'connector-bc'];
    const makeId = () => ids.shift()!;
    const v = ['a', 'b', 'c'].map((cell, i) => {
      const made = newVertex(slide, { dio: 'rounded=0;whiteSpace=wrap;html=1;', label: cell, x: 200 + i * 400, y: 300, unitW: 100, unitH: 50, cell }, makeId);
      addCells(slide, [made]);
      return made.element;
    });
    addCells(slide, [newConnector(slide, { source: v[0].id, target: v[1].id }, makeId)]);
    addCells(slide, [newConnector(slide, { source: v[1].id, target: v[2].id }, makeId)]);
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; }\n', 'utf8');

    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Layout`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    const node = (id: string) => `#canvas [data-element-id="${id}"]`;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${node('vertex-a')}'))`), 'the diagram never drew');
    await cdp.click('#side-tabs button[data-panel="inspector"]', 'Props tab');
    const saved = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0].elements.filter((e): e is VertexEl => e.type === 'vertex');
    };

    await cdp.click(node('vertex-a'), 'shape a');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} .dfmt'))`), 'no Format panel');
    await cdp.click(`${PANEL} .dfmt-tab[data-tab="arrange"]`, 'Arrange tab');
    await cdp.evaluate(`(() => {
      for (const s of document.querySelectorAll('${PANEL} .dfmt-section.is-folded')) s.querySelector('.dfmt-section-toggle')?.click();
    })()`);
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('${PANEL} [data-dfmt="layout-verticalFlow"]'))`), 'no Layout section');
    await cdp.click(`${PANEL} [data-dfmt="layout-verticalFlow"]`, 'Vertical Flow');
    const laid = await eventually(async () => {
      const vs = await saved();
      const [a, b, c] = ['a', 'b', 'c'].map((cell) => vs.find((el) => el.cell === cell)!);
      return a.y < b.y && b.y < c.y ? vs : null;
    }, 'Vertical Flow never reached the saved deck');
    expect(laid).toBeTruthy();

  });
});
