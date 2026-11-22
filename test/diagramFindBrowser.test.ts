import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type Deck, type VertexEl } from '../src/shared/deck.js';
import { addCells, newConnector, newVertex } from '../src/shared/diagram/insert.js';
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
 * draw.io's Find window over diagram labels, driven by the keyboard as a
 * person would: Ctrl+F opens it, typing finds and selects the first match,
 * Enter steps through the matches across slides, Replace All rewrites every
 * label in one undoable change, Ctrl+Z puts them all back.
 */
const DECK_ID = 'diagram-find';
const CTRL = 2;

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

describe.skipIf(!electronBinary)('Find / Replace in diagram labels', () => {
  it('finds across slides and replaces all as one undo step', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'diagram-find-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const clientDir = await collabClientDir();
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    const deck = emptyDeck('Diagram find');
    deck.slides.push({ ...structuredClone(deck.slides[0]), id: 'slide-2', name: 'Slide 2' });
    const ids = ['v-enc', 'v-dec', 'e-1', 'v-enc2'];
    const makeId = () => ids.shift()!;
    const [one, two] = deck.slides;
    const enc = newVertex(one, { dio: 'rounded=0;whiteSpace=wrap;html=1;', label: 'Encoder <b>stage</b>', x: 300, y: 400, w: 260, h: 120 }, makeId);
    addCells(one, [enc]);
    const dec = newVertex(one, { dio: 'ellipse;whiteSpace=wrap;html=1;', label: 'Decoder', x: 1000, y: 400, w: 240, h: 120 }, makeId);
    addCells(one, [dec]);
    addCells(one, [newConnector(one, { source: enc.element.id, target: dec.element.id, label: 'from the encoder' }, makeId)]);
    const enc2 = newVertex(two, { dio: 'rounded=1;whiteSpace=wrap;html=1;', label: 'Second encoder', x: 600, y: 400, w: 300, h: 120 }, makeId);
    addCells(two, [enc2]);
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; color: #111827; }\n', 'utf8');

    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Find`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('#canvas [data-element-id="v-enc"]'))`),
      'the diagram never loaded');

    const saved = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return await response.json() as Deck;
    };
    const label = (d: Deck, slide: number, id: string) => (d.slides[slide].elements.find((e) => e.id === id) as VertexEl).label;
    const status = () => cdp.evaluate<string>(`document.querySelector('.diagram-find [data-find="status"]').textContent`);
    // The Format panel's Edit Data shows the id of the one selected cell.
    const selectedCell = () => cdp.evaluate<string | null>(
      `document.querySelectorAll('#inspector .dfmt-cell-id').length === 1 ? document.querySelector('#inspector .dfmt-cell-id').textContent : null`);
    await cdp.click('#side-tabs button[data-panel="inspector"]', 'Props tab');
    const shots = process.env.DECKWERK_TEST_SHOTS;
    const shoot = async (name: string) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' }) as { data: string };
      await writeFile(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
    };

    // Ctrl+F opens the window with the Find field focused.
    await cdp.chord('f', 'KeyF', 70, CTRL);
    await eventually(async () => cdp.evaluate<boolean>(`(() => {
      const panel = document.querySelector('.diagram-find');
      return Boolean(panel && !panel.hidden && document.activeElement === panel.querySelector('[data-find="find"]'));
    })()`), 'Ctrl+F never opened the Find window');

    // Typing finds and selects the first match on this slide.
    await cdp.typeKeys('encoder');
    await eventually(status, 'typing never found the matches', (text) => text === '1 of 2');
    // The first in paint order (the shape or the connector, as they are stacked) is selected.
    const edge = one.elements.find((e) => e.type === 'connector') as unknown as VertexEl;
    await eventually(selectedCell, 'the first match was never selected',
      (cell) => cell === enc.element.cell || cell === edge.cell);
    await shoot('find-slide');

    // All slides: the encoder on slide 2 counts too; Enter steps to it.
    await cdp.click('.diagram-find [data-find="all-slides"]', 'All slides');
    await eventually(status, 'All slides never counted slide 2', (text) => /of 3$/.test(text));
    await cdp.click('.diagram-find [data-find="find"]', 'Find field');
    await cdp.key('Enter', 13);
    await eventually(status, 'Enter never went to the second match', (text) => text === '2 of 3');
    await cdp.key('Enter', 13);
    await eventually(status, 'Enter never went to the third match', (text) => text === '3 of 3');
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('#canvas [data-element-id="v-enc2"]'))`),
      'the third match never brought its slide up');
    await eventually(selectedCell, 'the match on slide 2 was never selected', (cell) => cell === enc2.element.cell);
    // Shift+Enter goes back, to the previous slide.
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', modifiers: 8, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', modifiers: 8, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await eventually(status, 'Shift+Enter never went back', (text) => text === '2 of 3');
    await cdp.key('Enter', 13);
    await eventually(status, 'Enter never came forward again', (text) => text === '3 of 3');
    await shoot('find-next-slide');

    // Replace All: every label, one change.
    await cdp.click('.diagram-find [data-find="replace"]', 'Replace field');
    await cdp.typeKeys('codec');
    await cdp.click('.diagram-find [data-find="replaceAll"]', 'Replace All');
    await eventually(status, 'Replace All never reported', (text) => text.startsWith('3 matches replaced'));
    const after = await eventually(saved, 'the replacements never reached the saved deck',
      (d) => label(d, 0, 'v-enc') === 'codec <b>stage</b>' && label(d, 1, 'v-enc2') === 'Second codec');
    expect(label(after!, 0, 'e-1')).toBe('from the codec');
    expect(label(after!, 0, 'v-dec')).toBe('Decoder');
    await shoot('replace-all');

    // Escape closes the window; one Ctrl+Z on the canvas undoes all three.
    await cdp.key('Escape', 27);
    await eventually(async () => cdp.evaluate<boolean>(`document.querySelector('.diagram-find').hidden`), 'Escape never closed the window');
    await cdp.chord('z', 'KeyZ', 90, CTRL);
    const undone = await eventually(saved, 'one undo never put every label back',
      (d) => label(d, 0, 'v-enc') === 'Encoder <b>stage</b>' && label(d, 1, 'v-enc2') === 'Second encoder');
    expect(label(undone!, 0, 'e-1')).toBe('from the encoder');
  });
});
