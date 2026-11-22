import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck, type Deck, type VertexEl } from '../src/shared/deck.js';
import { pageToElements } from '../src/shared/diagram/convert.js';
import { readDrawio } from '../src/shared/diagram/drawioFile.js';
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
 * Layers, groups and folding in the browser editor, with real keys and
 * clicks: the Layers panel (Ctrl+Shift+L) hides a layer's cells; Ctrl+G
 * groups two selected shapes into a draw.io group; a swimlane's folding
 * icon collapses it. Each step is checked in the deck the server saved.
 */
const DECK_ID = 'layers-panel';
const CTRL = 2;
const SHIFT = 8;

const MODEL = `<mxfile><diagram id="p" name="Figure"><mxGraphModel grid="1" gridSize="10" fold="1"><root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="a" value="Encoder" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="140" height="60" as="geometry"/></mxCell>
  <mxCell id="b" value="Decoder" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="260" y="40" width="140" height="60" as="geometry"/></mxCell>
  <mxCell id="ab" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
  <mxCell id="lane" value="Lane" style="swimlane;whiteSpace=wrap;html=1;startSize=30;" vertex="1" parent="1"><mxGeometry x="480" y="20" width="220" height="160" as="geometry"/></mxCell>
  <mxCell id="lane-a" value="Inside" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="lane"><mxGeometry x="40" y="60" width="120" height="60" as="geometry"/></mxCell>
  <mxCell id="top" value="Notes" parent="0"/>
  <mxCell id="note" value="On the top layer" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="top"><mxGeometry x="40" y="160" width="160" height="60" as="geometry"/></mxCell>
  <mxCell id="note-b" style="endArrow=classic;html=1;" edge="1" parent="top" source="note" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

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

async function shot(cdp: Cdp, name: string): Promise<void> {
  const dir = process.env.DECKWERK_TEST_SHOTS;
  if (!dir) return;
  const { data } = await cdp.call('Page.captureScreenshot', { format: 'png' }) as { data: string };
  await writeFile(join(dir, name), Buffer.from(data, 'base64'));
}

describe.skipIf(!electronBinary)('layers, groups and folding in the editor', () => {
  it('hides a layer from the Layers panel, groups with Ctrl+G and collapses a swimlane', { timeout: 180_000 }, async () => {
    workDir = await mkdtemp(join(tmpdir(), 'layers-panel-'));
    const decksRoot = join(workDir, 'decks');
    const deckDir = join(decksRoot, DECK_ID);
    const clientDir = await collabClientDir();
    const profileDir = join(workDir, 'electron-profile');
    await mkdir(deckDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });
    const deck = emptyDeck('Layers');
    const page = (await readDrawio(MODEL)).pages[0];
    let n = 0;
    const { elements, meta } = pageToElements(page, {
      diagramId: 'diagram-1',
      placement: { origin: { x: 200, y: 220 }, scale: 1.5 },
      makeId: (prefix) => `${prefix}-${++n}`,
    });
    deck.slides[0].elements = elements;
    deck.slides[0].diagrams = { 'diagram-1': meta };
    await saveDeck(deckDir, deck);
    await writeFile(join(deckDir, 'theme.css'), '.slide { background: #fff; }\n', 'utf8');
    const idOf = (cell: string) => elements.find((el) => (el as VertexEl).cell === cell)!.id;

    server = await startCollabServer({ rootDir: decksRoot, clientDir, host: '127.0.0.1', port: 0 });
    browser = await launchBrowser(`http://127.0.0.1:${server.port}/?deck=${DECK_ID}&name=Layers`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    editor = await Cdp.connect(target.webSocketDebuggerUrl!);
    const cdp = editor;
    const element = (cell: string) => `#canvas .slide-layer [data-element-id="${idOf(cell)}"]`;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(element('a'))}))`), 'the diagram was not drawn');
    const saved = async () => {
      const response = await fetch(`http://127.0.0.1:${server!.port}/api/deck?deck=${DECK_ID}`);
      return (await response.json() as Deck).slides[0];
    };
    const drawnChildren = (cell: string) => cdp.evaluate<number>(
      `document.querySelector(${JSON.stringify(`${element(cell)} svg.diagram-svg`)})?.childElementCount ?? -1`,
    );
    expect(await drawnChildren('note')).toBeGreaterThan(0);

    // Ctrl+Shift+L opens the Layers panel: top layer first, the current one highlighted.
    await cdp.chord('L', 'KeyL', 76, CTRL | SHIFT);
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector('.layers-panel:not([hidden])'))`), 'Ctrl+Shift+L did not open the Layers panel');
    expect(await cdp.evaluate<string[]>(`[...document.querySelectorAll('.layers-row .layers-name')].map((n) => n.textContent)`))
      .toEqual(['Notes', 'Background']);
    await shot(cdp, 'layers-panel-open.png');

    // The eye hides the layer: its cells and the connector on it are not drawn.
    await cdp.click('.layers-row[data-layer="top"] .layers-eye', 'eye of the Notes layer');
    const hidden = await eventually(saved, 'the layer was never hidden in the saved deck',
      (slide) => Boolean(slide.diagrams?.['diagram-1']?.layers.find((l) => l.cell === 'top')?.hidden));
    const concealed = (slide: typeof hidden, cell: string) => Boolean((slide!.elements.find((el) => el.id === idOf(cell)) as VertexEl).concealed);
    expect(concealed(hidden, 'note')).toBe(true);
    expect(concealed(hidden, 'note-b')).toBe(true);
    expect(concealed(hidden, 'a')).toBe(false);
    await eventually(async () => (await drawnChildren('note')) === 0, 'the hidden layer is still drawn');
    expect(await drawnChildren('a')).toBeGreaterThan(0);
    expect(await cdp.evaluate<boolean>(`document.querySelector('.layers-row[data-layer="top"]').classList.contains('hidden-layer')`)).toBe(true);
    await shot(cdp, 'layers-panel-hidden-layer.png');

    // …and shows it again.
    await cdp.click('.layers-row[data-layer="top"] .layers-eye', 'eye of the Notes layer');
    await eventually(saved, 'the layer was never shown again',
      (slide) => !slide.diagrams?.['diagram-1']?.layers.find((l) => l.cell === 'top')?.hidden
        && !(slide.elements.find((el) => el.id === idOf('note')) as VertexEl).concealed);
    await eventually(async () => (await drawnChildren('note')) > 0, 'the shown layer is not drawn');
    await cdp.click('.layers-panel .layers-close', 'close the Layers panel');

    // Select two shapes and press Ctrl+G: a draw.io group holds them and is selected.
    await cdp.click(element('a'), 'Encoder');
    await cdp.clickModified(element('b'), SHIFT, 'Decoder');
    await eventually(async () => cdp.evaluate<boolean>('document.querySelectorAll("#canvas .sel-box").length === 2'), 'the two shapes were not both selected');
    await cdp.chord('g', 'KeyG', 71, CTRL);
    const grouped = await eventually(saved, 'Ctrl+G made no group in the saved deck',
      (slide) => slide.elements.some((el) => el.type === 'vertex' && el.dio === 'group'));
    const group = grouped!.elements.find((el) => el.type === 'vertex' && el.dio === 'group') as VertexEl;
    const child = (cell: string) => grouped!.elements.find((el) => el.id === idOf(cell)) as VertexEl & { parent: string };
    expect(child('a').parent).toBe(group.cell);
    expect(child('b').parent).toBe(group.cell);
    expect(child('ab').parent).toBe(group.cell);
    expect(child('note').parent).toBe('top');
    // Bounds of the two shapes (draw.io units × 1.5, placed at 200,220).
    expect(group.x).toBeCloseTo(200 + 40 * 1.5);
    expect(group.y).toBeCloseTo(220 + 40 * 1.5);
    expect(group.w).toBeCloseTo(360 * 1.5);
    expect(group.h).toBeCloseTo(60 * 1.5);
    expect(group.z).toBeLessThan(child('a').z);
    await shot(cdp, 'layers-panel-grouped.png');

    // Dragging the selected group carries what is inside it.
    const stage = await cdp.evaluate<{ left: number; top: number; scale: number }>(`(() => {
      const r = document.querySelector('#canvas .slide').getBoundingClientRect();
      return { left: r.left, top: r.top, scale: r.width / 1920 };
    })()`);
    const encoder = child('a');
    const from = { x: stage.left + (encoder.x + encoder.w / 2) * stage.scale, y: stage.top + (encoder.y + encoder.h / 2) * stage.scale };
    const to = { x: from.x + 120 * stage.scale, y: from.y + 60 * stage.scale };
    const mouse = (type: string, p: { x: number; y: number }) => cdp.call('Input.dispatchMouseEvent', {
      type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });
    await mouse('mouseMoved', from);
    await mouse('mousePressed', from);
    for (let i = 1; i <= 4; i++) await mouse('mouseMoved', { x: from.x + (to.x - from.x) * i / 4, y: from.y + (to.y - from.y) * i / 4 });
    await mouse('mouseReleased', to);
    const dragged = await eventually(saved, 'the group was never moved',
      (slide) => Math.abs((slide.elements.find((el) => el.id === group.id) as VertexEl).x - group.x) > 50);
    const movedBy = (id: string) => {
      const after = dragged!.elements.find((el) => el.id === id) as VertexEl;
      const before = grouped!.elements.find((el) => el.id === id) as VertexEl;
      return [after.x - before.x, after.y - before.y];
    };
    const [dx, dy] = movedBy(group.id);
    for (const cell of ['a', 'b']) {
      const [cx, cy] = movedBy(idOf(cell));
      expect(cx).toBeCloseTo(dx, 1);
      expect(cy).toBeCloseTo(dy, 1);
    }
    expect(movedBy(idOf('note'))).toEqual([0, 0]);
    await shot(cdp, 'layers-panel-group-dragged.png');

    // The swimlane's folding icon collapses it to draw.io's size and hides what is inside.
    const icon = `.dg-folding-icon[data-element-id="${idOf('lane')}"]`;
    await eventually(async () => cdp.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(icon)}))`), 'no folding icon on the swimlane');
    await cdp.click(icon, 'folding icon');
    const folded = await eventually(saved, 'the swimlane never collapsed',
      (slide) => Boolean((slide.elements.find((el) => el.id === idOf('lane')) as VertexEl).collapsed));
    const lane = folded!.elements.find((el) => el.id === idOf('lane')) as VertexEl;
    expect(lane.w).toBeCloseTo(70 * 1.5);
    expect(lane.h).toBeCloseTo(30 * 1.5);
    expect((folded!.elements.find((el) => el.id === idOf('lane-a')) as VertexEl).concealed).toBe(true);
    await eventually(async () => (await drawnChildren('lane-a')) === 0, 'the collapsed lane still draws its contents');
    await shot(cdp, 'layers-panel-collapsed.png');
  });
});
