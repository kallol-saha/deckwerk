import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAgentCli } from '../src/cli/agentCli.js';
import { emptyDeck, parseDeck, type ConnectorEl, type Deck, type DiagramEl, type VertexEl } from '../src/shared/deck.js';
import { cellSpec, parseSpecLine, restyleCell } from '../src/shared/diagram/agentEdit.js';
import { MARKER_NAMES, SHAPE_NAMES } from '../src/shared/diagram/paint.js';
import { getStyleValue } from '../src/shared/diagram/style.js';

describe('diagram add / style / layout from the CLI', { timeout: 120_000 }, () => {
  let dir: string;
  let stateDir: string;
  let out: string[];
  let err: string[];

  const cli = async (...argv: string[]) => {
    out = [];
    err = [];
    const code = await runAgentCli(argv, { out: (t) => out.push(t), err: (t) => err.push(t), cwd: dir });
    return { code, stdout: out.join(''), stderr: err.join('') };
  };
  const json = async (...argv: string[]) => {
    const r = await cli(...argv);
    if (r.code !== 0) throw new Error(`${argv.join(' ')} → ${r.code}: ${r.stderr || r.stdout}`);
    return JSON.parse(r.stdout);
  };
  const deck = async (): Promise<Deck> => parseDeck(JSON.parse(await readFile(join(dir, 'deck.json'), 'utf8')));
  const cell = async (id: string) => (await deck()).slides[0].elements.find((el) => (el as DiagramEl).cell === id) as DiagramEl;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagram-cli-'));
    stateDir = await mkdtemp(join(tmpdir(), 'diagram-cli-state-'));
    process.env.DECKWERK_STATE_DIR = stateDir;
    await mkdir(join(dir, 'assets'), { recursive: true });
    const d = emptyDeck('Diagram CLI');
    d.slides = [parseDeck({ version: 1, slides: [{ id: 'slide-1', elements: [] }] }).slides[0]];
    await writeFile(join(dir, 'deck.json'), `${JSON.stringify(parseDeck(d), null, 2)}\n`, 'utf8');
    await writeFile(join(dir, 'theme.css'), '.slide{background:#fff}\n', 'utf8');
  });

  afterEach(async () => {
    delete process.env.DECKWERK_STATE_DIR;
    await rm(dir, { recursive: true, force: true });
    await rm(stateDir, { recursive: true, force: true });
  });

  it('parses the line syntax', () => {
    expect(parseSpecLine('id=enc label="Encoder \\"x\\"" style=\'rounded=1;fillColor=#dae8fc\' x=100')).toEqual({
      id: 'enc', label: 'Encoder "x"', style: 'rounded=1;fillColor=#dae8fc', x: '100',
    });
    expect(() => cellSpec('vertex', { bogus: '1' })).toThrow(/Unknown vertex key/);
    expect(cellSpec('edge', { from: 'a', to: 'b', points: '10,20 30,40' }).points).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  });

  it('adds shapes, library entries and connectors in draw.io units, then lays them out and restyles them', async () => {
    const added = await json('diagram', 'add', '.', '--slide', '1',
      '--vertex', 'id=enc label="Encoder" style="rounded=1;fillColor=#dae8fc" x=10 y=20 w=100 h=50',
      '--vertex', 'id=db label="Store" shape=library:Cylinder',
      '--vertex', 'id=dec label="Decoder" shape=ellipse',
      '--edge', 'id=e1 from=enc to=db style="edgeStyle=orthogonalEdgeStyle;endArrow=block"',
      '--edge', 'id=e2 from=db to=dec label="read"');
    expect(added.changes.inserted.map((c: { cell: string }) => c.cell)).toEqual(['enc', 'db', 'dec', 'e1', 'e2']);
    const d = await deck();
    const meta = d.slides[0].diagrams!['diagram-1'];
    const enc = await cell('enc') as VertexEl;
    expect(enc.x).toBeCloseTo(meta.origin.x + 10 * meta.scale);
    expect(enc.w).toBeCloseTo(100 * meta.scale);
    expect(getStyleValue(enc.dio, 'html')).toBe('1');
    expect(getStyleValue((await cell('db')).dio, 'shape')).toBe('cylinder3');
    expect(getStyleValue((await cell('dec')).dio, 'shape')).toBe('ellipse');
    const e1 = await cell('e1') as ConnectorEl;
    expect(e1.source).toBe(enc.id);
    expect(e1.route.length).toBeGreaterThanOrEqual(2);

    const laid = await json('diagram', 'layout', '.', '--slide', '1', '--algo', 'layered', '--direction', 'right', '--at', '150,150');
    expect(laid.changes.shapes).toBe(3);
    const after = await deck();
    const xs = ['enc', 'db', 'dec'].map((id) => (after.slides[0].elements.find((el) => (el as DiagramEl).cell === id) as VertexEl).x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);

    const styled = await json('diagram', 'style', '.', '--slide', '1', '--cells', 'enc,dec',
      '--set', 'fillColor=#d5e8d4;strokeColor=#82b366', '--set', 'rotation=90', '--label', 'Hi');
    expect(styled.changes.updated).toHaveLength(2);
    const restyled = await cell('enc') as VertexEl;
    expect(getStyleValue(restyled.dio, 'fillColor')).toBe('#d5e8d4');
    expect(restyled.rot).toBe(90);
    expect(restyled.label).toBe('Hi');

    const validate = await cli('validate', '.');
    expect(JSON.parse(validate.stdout).diagramProblems.map((p: { message: string }) => p.message)).toEqual([]);
  });

  it('reports unknown cells, flags and shapes', async () => {
    await json('diagram', 'add', '.', '--slide', '1', '--vertex', 'id=a', '--vertex', 'id=b');
    expect((await cli('diagram', 'style', '.', '--slide', '1', '--cells', 'zz', '--set', 'fillColor=#fff')).stderr).toMatch(/No diagram cell zz/);
    expect((await cli('diagram', 'layout', '.', '--slide', '1', '--algo', 'spiral')).stderr).toMatch(/Unknown layout/);
    const warned = await json('diagram', 'style', '.', '--slide', '1', '--cells', 'a', '--set', 'shape=wobbly');
    expect(warned.warnings[0]).toMatch(/wobbly/);
    expect((await cli('diagram', 'add', '.', '--slide', '1', '--vertex', 'id=a')).stderr).toMatch(/already used/);
  });

  it('prints a reference with every shape class and arrowhead', async () => {
    const docs = await cli('docs', 'diagrams');
    for (const name of SHAPE_NAMES) expect(docs.stdout).toContain(name.split('.').pop()!);
    for (const marker of MARKER_NAMES) expect(docs.stdout).toContain(`\`${marker}\``);
    expect(docs.stdout).toContain('mxCircleLayout');
  });
});

describe('restyleCell: draw.io\'s dependent keys', () => {
  const vertex = (dio: string): VertexEl => ({
    id: 'v', type: 'vertex', x: 0, y: 0, w: 100, h: 50, rot: 0, z: 0, opacity: 1, class: [], style: {},
    dio, label: 'a\nb', cell: 'v', diagram: 'diagram-1', parent: '1', scale: 1, origin: { x: 0, y: 0 },
  });
  const edge = (dio: string): ConnectorEl => ({
    ...vertex(dio), id: 'e', cell: 'e', type: 'connector', source: null, target: null,
    points: [{ x: 5, y: 5 }], sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 9, y: 9 }, labels: [], route: [],
  } as unknown as ConnectorEl);

  it('follows draw.io\'s Format panel', () => {
    const v = vertex('');
    restyleCell(v, [['rounded', '1'], ['labelPosition', 'right'], ['fontColor', 'none'], ['sketch', '1'], ['dashPattern', '4 4']]);
    expect(getStyleValue(v.dio, 'roundedPerimeter')).toBe('1');
    expect(getStyleValue(v.dio, 'align')).toBe('left');
    expect(getStyleValue(v.dio, 'verticalAlign')).toBe('middle');
    expect(getStyleValue(v.dio, 'labelPerimeter')).toBe('1');
    expect(getStyleValue(v.dio, 'noLabel')).toBe('1');
    expect(getStyleValue(v.dio, 'jiggle')).toBe('2');
    expect(getStyleValue(v.dio, 'dashed')).toBe('1');
    restyleCell(v, [['sketch', '0'], ['html', '1']]);
    expect(getStyleValue(v.dio, 'sketch')).toBeNull();
    expect(getStyleValue(v.dio, 'jiggle')).toBeNull();
    expect(v.label).toBe('a<br/>b');

    const e = edge('curved=1;');
    restyleCell(e, [['edgeStyle', 'elbowEdgeStyle'], ['rounded', '1'], ['targetPerimeterSpacing', '4']]);
    expect(e.points).toEqual([]);
    expect(getStyleValue(e.dio, 'curved')).toBe('0');
    expect(getStyleValue(e.dio, 'fixedPointSpacing')).toBe('1');
    const kept = edge('');
    restyleCell(kept, [['edgeStyle', 'orthogonalEdgeStyle']], { keepWaypoints: true });
    expect(kept.points).toHaveLength(1);
    const arrow = edge('shape=flexArrow;endWidth=20;width=10;');
    restyleCell(arrow, [['shape', 'connector']]);
    expect(getStyleValue(arrow.dio, 'endWidth')).toBeNull();
  });
});
