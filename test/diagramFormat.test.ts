import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConnectorEl, DiagramEl, Slide, VertexEl } from '../src/shared/deck.js';
import * as F from '../src/shared/diagram/format.js';
import { DEFAULT_EDGE_STYLE, DEFAULT_VERTEX_STYLE, newConnector, newVertex } from '../src/shared/diagram/insert.js';
import { MARKER_NAMES } from '../src/shared/diagram/paint.js';
import { getStyleValue, parseStyleString } from '../src/shared/diagram/style.js';

let next = 0;
const makeId = (prefix: string) => `${prefix}-${++next}`;

function slide(): Pick<Slide, 'elements' | 'diagrams'> {
  return { elements: [], diagrams: {} };
}

function vertex(dio: string, box: { x?: number; y?: number; w?: number; h?: number } = {}, s = slide()): VertexEl {
  const { element } = newVertex(s, { dio, x: box.x ?? 100, y: box.y ?? 100, w: box.w ?? 120, h: box.h ?? 60 }, makeId);
  s.elements.push(element);
  return element;
}

function connector(dio: string, s = slide(), ends: { source?: VertexEl; target?: VertexEl } = {}): ConnectorEl {
  const { element } = newConnector(s, {
    dio,
    source: ends.source?.id ?? null,
    target: ends.target?.id ?? null,
    sourcePoint: ends.source ? null : { x: 10, y: 10 },
    targetPoint: ends.target ? null : { x: 210, y: 110 },
  }, makeId);
  s.elements.push(element);
  return element;
}

const keys = (dio: string) => parseStyleString(dio).map((e) => e.key ?? e.value);

describe('reading the selection', () => {
  it('shares a value, falls back where unset and reports a mix', () => {
    const a = vertex('rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;');
    const b = vertex('rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeWidth=2;');
    expect(F.sharedValue([a, b], 'fillColor')).toBe('#dae8fc');
    expect(F.sharedValue([a, b], 'strokeWidth', '1')).toBe(F.MIXED);
    expect(F.sharedNumber([a], 'strokeWidth', 1)).toBe(1);
    expect(F.sharedNumber([b], 'strokeWidth', 1)).toBe(2);
    // The defaults draw.io resolves are part of the shared style.
    expect(F.sharedValue([a, b], 'fontSize')).toBe('12');
    const common = F.commonStyle([a, b]);
    expect(common.fillColor).toBe('#dae8fc');
    expect(common.strokeWidth).toBeUndefined();
    expect(F.sharedFlag([a, b], 'html')).toBe(true);
  });

  it('knows what a selection can have (fill, rounded, glass, line jumps)', () => {
    const rect = vertex('rounded=0;whiteSpace=wrap;html=1;');
    const ellipse = vertex('ellipse;whiteSpace=wrap;html=1;');
    const edge = connector(DEFAULT_EDGE_STYLE);
    const vs = F.selectionState([rect]);
    expect(vs.fill).toBe(true);
    expect(vs.rounded).toBe(true);
    expect(vs.glass).toBe(true);
    expect(vs.lineJumps).toBe(false);
    expect(F.selectionState([ellipse]).rounded).toBe(false);
    const es = F.selectionState([edge]);
    expect(es.fill).toBe(false);
    expect(es.lineJumps).toBe(true);
    expect(es.edges).toHaveLength(1);
    expect(F.selectionState([connector('curved=1;')]).lineJumps).toBe(false);
    expect(F.selectionState([connector('shape=flexArrow;')]).fill).toBe(true);
  });
});

describe('writing', () => {
  it('changes keys in place and keeps the rest of the string as written', () => {
    const el = vertex('ellipse;whiteSpace=wrap;fillColor=#fff;html=1;');
    F.applyStyleChanges(el, [['fillColor', '#dae8fc'], ['strokeColor', '#6c8ebf'], ['html', null]]);
    expect(el.dio).toBe('ellipse;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;');
  });

  it('keeps a vertex turned with its rotation key', () => {
    const el = vertex('rounded=0;');
    F.applyStyleChanges(el, [['rotation', 30]]);
    expect(el.rot).toBe(30);
    F.setRotation(el, -90);
    expect(el.rot).toBe(270);
    expect(getStyleValue(el.dio, 'rotation')).toBe('270');
    F.editStyleText(el, 'rounded=1;\n rotation=45;');
    expect(el.dio).toBe('rounded=1;rotation=45;');
    expect(el.rot).toBe(45);
    expect(F.normalizeAngle(360.004)).toBe(0);
    expect(F.normalizeAngle(-0.5)).toBe(359.5);
  });
});

describe('Style tab rules', () => {
  it('rounded and curved exclude each other on edges (line style)', () => {
    expect(F.lineShapeChanges('curved')).toEqual([['rounded', '0'], ['curved', '1']]);
    expect(F.lineShapeChanges('rounded')).toEqual([['rounded', '1'], ['curved', '0']]);
    expect(F.lineShapeChanges('sharp')).toEqual([['rounded', '0'], ['curved', '0']]);
    expect(F.lineShapeOf({ rounded: '1', curved: '1' })).toBe('curved');
    expect(F.lineShapeOf({ rounded: '1' })).toBe('rounded');
  });

  it('Rounded on a vertex also rounds its perimeter, on an edge only the line', () => {
    const v = vertex('rounded=0;');
    const e = connector(DEFAULT_EDGE_STYLE);
    expect(F.roundedChanges(v, true)).toEqual([['rounded', 1], ['roundedPerimeter', '1']]);
    expect(F.roundedChanges(v, false)).toEqual([['rounded', 0], ['roundedPerimeter', null]]);
    expect(F.roundedChanges(e, true)).toEqual([['rounded', 1]]);
  });

  it('Sketch sets draw.io’s default curve fitting and jiggle', () => {
    expect(F.sketchChanges(true)).toEqual([['sketch', '1'], ['curveFitting', '1'], ['jiggle', '2']]);
    expect(F.sketchChanges(false)).toEqual([['sketch', null], ['curveFitting', null], ['jiggle', null]]);
  });

  it('a line start/end offset also fixes the point spacing on edges', () => {
    const e = connector(DEFAULT_EDGE_STYLE);
    const v = vertex('');
    expect(F.perimeterSpacingChanges(e, 'sourcePerimeterSpacing', 4)).toEqual([['sourcePerimeterSpacing', 4], ['fixedPointSpacing', '1']]);
    expect(F.perimeterSpacingChanges(v, 'perimeterSpacing', 4)).toEqual([['perimeterSpacing', 4]]);
  });

  it('the Waypoints menu has draw.io’s entries and clears the waypoints', () => {
    expect(F.EDGE_STYLES.map((s) => s.id)).toEqual(['straight', 'orthogonal', 'verticalElbow', 'horizontalElbow',
      'horizontalIsometric', 'verticalIsometric', 'curved', 'entityRelation']);
    const e = connector('edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;innerLoopWaypoints=1;');
    e.points = [{ x: 50, y: 50 }];
    const elbow = F.EDGE_STYLES.find((s) => s.id === 'verticalElbow')!;
    F.applyEdgeStyleChoice(e, elbow);
    expect(e.points).toEqual([]);
    expect(getStyleValue(e.dio, 'edgeStyle')).toBe('elbowEdgeStyle');
    expect(getStyleValue(e.dio, 'elbow')).toBe('vertical');
    expect(getStyleValue(e.dio, 'innerLoopWaypoints')).toBeNull();
    for (const choice of F.EDGE_STYLES) {
      const c = connector('html=1;');
      F.applyEdgeStyleChoice(c, choice);
      expect(F.edgeStyleOf(F.cellStyle(c))).toBe(choice.id);
    }
    // Straight keeps curved; curved needs a shape that paints it.
    const curved = connector('edgeStyle=orthogonalEdgeStyle;curved=1;');
    F.applyEdgeStyleChoice(curved, F.EDGE_STYLES[0]);
    expect(getStyleValue(curved.dio, 'curved')).toBe('1');
    expect(F.edgeStyleChoices({ shape: 'arrow' })).toEqual([]);
    expect(F.edgeStyleChoices({}).some((c) => c.id === 'curved')).toBe(true);
  });

  it('the Line start / end menus list every marker, draw.io’s first', () => {
    const choices = F.markerChoices({}, false);
    expect(choices[0]).toMatchObject({ marker: 'none', fill: 0 });
    expect(choices[1]).toMatchObject({ marker: 'classic', fill: 1 });
    for (const name of MARKER_NAMES) expect(choices.some((c) => c.marker === name)).toBe(true);
    // circle is filled at the start and hollow at the end, as in draw.io.
    expect(F.markerChoices({}, true).find((c) => c.marker === 'circle')!.fill).toBe(1);
    expect(choices.find((c) => c.marker === 'circle')!.fill).toBe(0);
    expect(F.markerChanges(false, { marker: 'block', fill: 1 })).toEqual([['endArrow', 'block'], ['endFill', 1]]);
    expect(F.markerChanges(true, { marker: 'sysMLx', fill: null })).toEqual([['startArrow', 'sysMLx']]);
    expect(F.markerChoices({ shape: 'flexArrow' }, true).map((c) => c.marker)).toEqual(['none', 'block']);
    expect(F.hasLineMarkers({ shape: 'link' })).toBe(false);
  });

  it('offers to copy the other end’s marker when they differ', () => {
    expect(F.copyOtherMarker({ endArrow: 'block', endFill: '0', startArrow: 'none' }, true))
      .toEqual([['startArrow', 'block'], ['startFill', '0'], ['startSize', null]]);
    expect(F.copyOtherMarker({ endArrow: 'block', startArrow: 'block' }, true)).toBeNull();
    expect(F.copyOtherMarker({ endArrow: 'none' }, true)).toBeNull();
  });

  it('a pattern sets dashed and the dash pattern together', () => {
    expect(F.dashChanges('1', '1 2')).toEqual([['dashed', '1'], ['dashPattern', '1 2']]);
    expect(F.dashPatternOf({})).toBe('solid');
    expect(F.dashPatternOf({ dashed: '1' })).toBe('dashed');
    expect(F.dashPatternOf({ dashed: '1', dashPattern: '1 1' })).toBe('dotted');
    expect(F.dashPatternOf({ dashed: '1', dashPattern: '3 7' })).toBe('custom');
  });

  it('a colour scheme sets fill, gradient, stroke and font, or puts them back', () => {
    const v = vertex('rounded=0;fontColor=none;noLabel=1;');
    expect(F.colorSchemeChanges(v, { fill: '#60a917', stroke: '#2D7600', font: '#ffffff' })).toEqual([
      ['fillColor', '#60a917'], ['gradientColor', null], ['fontColor', '#ffffff'], ['strokeColor', '#2D7600'], ['noLabel', null],
    ]);
    expect(F.colorSchemeChanges(v, { fill: '', stroke: '' }, { keepStroke: true }).map(([k]) => k))
      .toEqual(['fillColor', 'gradientColor', 'fontColor', 'noLabel']);
    const e = connector(DEFAULT_EDGE_STYLE);
    expect(F.colorSchemeChanges(e, { fill: '#dae8fc', stroke: '#6c8ebf' }).map(([k]) => k)).toEqual(['fillColor', 'gradientColor', 'strokeColor']);
    expect(F.COLOR_SCHEMES).toHaveLength(6);
    expect(F.COLOR_SCHEMES[0][2]).toEqual({ fill: '#dae8fc', stroke: '#6c8ebf' });
  });
});

describe('Text tab rules', () => {
  it('sets a fontStyle bit like mxUtils.setStyleFlag', () => {
    expect(F.setStyleFlag('html=1;', 'fontStyle', F.FONT_BOLD, true)).toBe('html=1;fontStyle=1;');
    expect(F.setStyleFlag('html=1;', 'fontStyle', F.FONT_BOLD, false)).toBe('html=1;fontStyle=0;');
    expect(F.setStyleFlag('fontStyle=3;', 'fontStyle', F.FONT_BOLD, false)).toBe('fontStyle=2;');
    expect(F.setStyleFlag('fontStyle=3;', 'fontStyle', F.FONT_STRIKETHROUGH, true)).toBe('fontStyle=11;');
    expect(F.setStyleFlag('fontStyle=4;', 'fontStyle', F.FONT_UNDERLINE, null)).toBe('fontStyle=0;');
  });

  it('toggles bold for all cells from the first one', () => {
    const a = vertex('fontStyle=1;');
    const b = vertex('');
    expect(F.fontStyleToggleTarget([a, b], F.FONT_BOLD)).toBe(false);
    expect(F.fontStyleToggleTarget([b, a], F.FONT_BOLD)).toBe(true);
    expect(F.sharedFontFlag([a, b], F.FONT_BOLD)).toBe(F.MIXED);
  });

  it('the Position menu sets the four keys and the label perimeter', () => {
    const v = vertex('rounded=0;');
    const changes = F.labelPositionChanges(v, 'bottom');
    expect(changes).toEqual([['labelPosition', 'center'], ['verticalLabelPosition', 'bottom'], ['align', 'center'],
      ['verticalAlign', 'top'], ['labelPerimeter', '1']]);
    F.applyStyleChanges(v, changes);
    expect(F.labelPositionOf(F.cellStyle(v))).toBe('bottom');
    // Back inside: the perimeter flag goes; switched off by hand, it stays off.
    expect(F.labelPositionChanges(v, 'center').at(-1)).toEqual(['labelPerimeter', null]);
    const off = vertex('labelPerimeter=0;');
    expect(F.labelPositionChanges(off, 'left').some(([k]) => k === 'labelPerimeter')).toBe(false);
    for (const pos of Object.keys(F.LABEL_POSITIONS) as F.LabelPosition[]) {
      const c = vertex('');
      F.applyStyleChanges(c, F.labelPositionChanges(c, pos));
      expect(F.labelPositionOf(F.cellStyle(c))).toBe(pos);
    }
    // Edges have no label perimeter.
    expect(F.labelPositionChanges(connector(''), 'top')).toHaveLength(4);
  });

  it('a font colour of none hides the label', () => {
    expect(F.fontColorChanges('none')).toEqual([['fontColor', 'none'], ['noLabel', '1']]);
    expect(F.fontColorChanges('#ff0000')).toEqual([['fontColor', '#ff0000'], ['noLabel', null]]);
  });

  it('the label background list: none, solid, transparent', () => {
    expect(F.labelBackgroundOf({})).toBe('none');
    expect(F.labelBackgroundOf({ labelBackgroundColor: '#ff0' })).toBe('solid');
    expect(F.labelBackgroundOf({ labelBackgroundColor: 'default', defaultLabelBackgroundColor: 'page' })).toBe('transparent');
    expect(F.labelBackgroundChanges('transparent', null)).toEqual([['labelBackgroundColor', 'default'], ['defaultLabelBackgroundColor', 'page']]);
    expect(F.labelBackgroundChanges('solid', '#ff0000')).toEqual([['labelBackgroundColor', '#ff0000'], ['defaultLabelBackgroundColor', null]]);
    expect(F.labelBackgroundChanges('none', '#ff0000')[0]).toEqual(['labelBackgroundColor', 'none']);
  });

  it('offers Fit Text to Shape only for shapes with a text flow outline', () => {
    expect(F.supportsShapeInside([vertex('ellipse;whiteSpace=wrap;')])).toBe(true);
    expect(F.supportsShapeInside([vertex('rhombus;'), vertex('ellipse;')])).toBe(true);
    expect(F.supportsShapeInside([vertex('rounded=0;')])).toBe(false);
    expect(F.supportsShapeInside([vertex('ellipse;'), connector('')])).toBe(false);
  });

  it('writing direction follows draw.io’s list', () => {
    expect(F.writingDirectionOf({ textDirection: 'rtl' }, true)).toBe('rightToLeft');
    expect(F.writingDirectionOf({ textDirection: 'vertical-lr' }, true)).toBe('vertical-leftToRight');
    expect(F.writingDirectionOf({ textDirection: 'vertical-lr' }, false)).toBe('automatic');
  });

  it('Formatted Text converts the label both ways', () => {
    const v = vertex('whiteSpace=wrap;');
    v.label = 'a < b\nc & d';
    F.setFormattedText(v, true);
    expect(v.label).toBe('a &lt; b<br/>c &amp; d');
    expect(getStyleValue(v.dio, 'html')).toBe('1');
    F.setFormattedText(v, false);
    expect(v.label).toBe('a < b\nc & d');
    expect(getStyleValue(v.dio, 'html')).toBeNull();
    const h = vertex('html=1;');
    h.label = '<b>Encoder</b><br>z &gt; 0';
    F.setFormattedText(h, false);
    expect(h.label).toBe('Encoder\nz > 0');
  });
});

describe('Copy Style / Paste Style / Set as Default Style', () => {
  it('copies Graph.cellStyles keys, never a stroke of none', () => {
    const v = vertex('ellipse;fillColor=#dae8fc;strokeColor=none;fontSize=16;html=1;myKey=1;');
    const copied = F.copyCellStyle(v);
    expect(copied.fillColor).toBe('#dae8fc');
    expect(copied.fontSize).toBe('16');
    expect(copied.strokeColor).toBeUndefined();
    expect(copied.shape).toBeUndefined();
    expect(copied.myKey).toBeUndefined();
    expect(copied.html).toBeUndefined();
    expect(F.copyCellStyle(connector('shape=link;')).shape).toBe('link');
  });

  it('pastes onto a vertex without edge keys, removing what the copy lacks', () => {
    const edge = connector('edgeStyle=orthogonalEdgeStyle;endArrow=block;strokeColor=#ff0000;strokeWidth=3;');
    const copied = F.copyCellStyle(edge);
    const v = vertex('ellipse;whiteSpace=wrap;html=1;shadow=1;');
    F.pasteStyleInto(v, copied);
    expect(getStyleValue(v.dio, 'strokeColor')).toBe('#ff0000');
    expect(getStyleValue(v.dio, 'strokeWidth')).toBe('3');
    expect(getStyleValue(v.dio, 'endArrow')).toBeNull();
    expect(getStyleValue(v.dio, 'shadow')).toBeNull();
    // Keys outside Graph.cellStyles (shape name, html) stay.
    expect(keys(v.dio).slice(0, 3)).toEqual(['ellipse', 'whiteSpace', 'html']);
    const other = connector('endArrow=classic;html=1;');
    F.pasteStyleInto(other, copied);
    expect(getStyleValue(other.dio, 'endArrow')).toBe('block');
    // edgeStyle itself is only pasted from a default style.
    expect(getStyleValue(other.dio, 'edgeStyle')).toBeNull();
  });

  it('pastes only text styles onto text cells', () => {
    const copied = F.copyCellStyle(vertex('fillColor=#f00;fontSize=20;'));
    const next = F.pasteCellStyle('text;html=1;', 'vertex', copied, { force: true });
    expect(getStyleValue(next, 'fontSize')).toBe('20');
    expect(getStyleValue(next, 'fillColor')).toBeNull();
  });

  it('a default style leaves the keys a new cell sets (and their groups)', () => {
    const record = F.defaultStyleRecord(vertex('rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;'));
    const next = F.applyDefaultStyle(DEFAULT_VERTEX_STYLE, 'vertex', record);
    expect(getStyleValue(next, 'rounded')).toBe('0');
    expect(getStyleValue(next, 'roundedPerimeter')).toBeNull();
    expect(getStyleValue(next, 'fillColor')).toBe('#dae8fc');
    expect(getStyleValue(next, 'fontSize')).toBe('14');
    expect(next.startsWith(DEFAULT_VERTEX_STYLE)).toBe(true);
    expect(F.applyDefaultStyle(DEFAULT_EDGE_STYLE, 'edge', record)).toBe(DEFAULT_EDGE_STYLE);
  });

  describe('stored in localStorage', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    let had: PropertyDescriptor | undefined;
    beforeEach(() => {
      had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
      store.clear();
    });
    afterEach(() => {
      if (had) Object.defineProperty(globalThis, 'localStorage', had);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it('falls back to insert.ts’s defaults, then follows Set as Default Style', () => {
      expect(F.defaultVertexStyle()).toBe(DEFAULT_VERTEX_STYLE);
      expect(F.defaultEdgeStyle()).toBe(DEFAULT_EDGE_STYLE);
      F.storeDefaultStyle(vertex('fillColor=#d5e8d4;strokeColor=#82b366;'));
      expect(getStyleValue(F.defaultVertexStyle(), 'fillColor')).toBe('#d5e8d4');
      expect(F.defaultEdgeStyle()).toBe(DEFAULT_EDGE_STYLE);
      F.storeDefaultStyle(connector('edgeStyle=entityRelationEdgeStyle;curved=1;endArrow=open;strokeWidth=2;'));
      const edge = F.defaultEdgeStyle();
      expect(edge.startsWith('edgeStyle=entityRelationEdgeStyle;')).toBe(true);
      expect(getStyleValue(edge, 'curveGeometry')).toBe('1');
      expect(getStyleValue(edge, 'endArrow')).toBe('open');
      expect(getStyleValue(edge, 'strokeWidth')).toBe('2');
      expect(getStyleValue(edge, 'html')).toBe('1');
      F.clearDefaultStyle('vertex');
      expect(F.defaultVertexStyle()).toBe(DEFAULT_VERTEX_STYLE);
      expect(F.storedDefaultStyle('edge')).not.toBeNull();
      F.clearDefaultStyle();
      expect(store.size).toBe(0);
    });
  });
});

describe('Property list', () => {
  it('a plain rectangle shows the label shape’s properties and the common ones', () => {
    const names = F.cellProperties([vertex('rounded=0;whiteSpace=wrap;html=1;')]).map((p) => p.name);
    expect(names).toContain('arcSize');
    expect(names).toContain('imageAlign');
    expect(names).toContain('fillOpacity');
    expect(names).toContain('perimeter');
    // Only when rounded.
    expect(names).not.toContain('roundedPerimeter');
    expect(F.cellProperties([vertex('rounded=1;')]).map((p) => p.name)).toContain('roundedPerimeter');
    // Primary colours are listed (the panel shows them in the Fill section).
    expect(names).not.toContain('footerColor');
    expect(F.cellProperties([vertex('footerSize=10;')]).find((p) => p.name === 'footerColor')?.primary).toBe(true);
  });

  it('keeps the shape’s own list and its later duplicates (parallelogram size)', () => {
    const fixed = F.cellProperties([vertex('shape=parallelogram;fixedSize=1;')]).find((p) => p.name === 'size')!;
    expect(fixed.defVal).toBe(20);
    expect(F.cellProperties([vertex('shape=parallelogram;')]).some((p) => p.name === 'size')).toBe(false);
    expect(F.cellProperties([vertex('shape=step;')]).find((p) => p.name === 'size')!.dispName).toBe('Notch Size');
  });

  it('a mixed selection only keeps what every cell has', () => {
    const names = F.cellProperties([vertex('shape=cube;'), vertex('shape=note;')]).map((p) => p.name);
    expect(names).toContain('size');
    expect(names).toContain('darkOpacity');
    expect(names).not.toContain('darkOpacity2');
    const both = F.cellProperties([vertex(''), connector(DEFAULT_EDGE_STYLE)]).map((p) => p.name);
    expect(both).toContain('fillOpacity');
    expect(both).not.toContain('jettySize');
  });

  it('edges show their own properties when they apply', () => {
    const orth = F.cellProperties([connector(DEFAULT_EDGE_STYLE)]).map((p) => p.name);
    expect(orth).toContain('jettySize');
    expect(orth).not.toContain('orthogonal');
    expect(orth).not.toContain('flowAnimationType');
    const flow = F.cellProperties([connector('flowAnimation=1;')]).map((p) => p.name);
    expect(flow).toContain('flowAnimationType');
    expect(flow).toContain('orthogonal');
  });

  it('reads values and writes them with draw.io’s rules', () => {
    const v = vertex('shape=cube;size=15;');
    const props = F.cellProperties([v]);
    const size = props.find((p) => p.name === 'size')!;
    expect(F.propertyValue(size, [v])).toBe('15');
    expect(F.propertyValue(props.find((p) => p.name === 'boundedLbl')!, [v])).toBe(false);
    expect(F.propertyChange(size, '-3')).toEqual([['size', 0]]);
    const bool = props.find((p) => p.name === 'boundedLbl')!;
    expect(F.propertyChange(bool, true)).toEqual([['boundedLbl', '1']]);
    const jetty = F.cellProperties([connector(DEFAULT_EDGE_STYLE)]).find((p) => p.name === 'jettySize')!;
    expect(F.propertyChange(jetty, '')).toEqual([['jettySize', 'auto']]);
    expect(F.propertyChange(jetty, '12.6')).toEqual([['jettySize', 13]]);
    const linecap = F.cellProperties([v]).find((p) => p.name === 'linecap')!;
    expect(F.propertyChange(linecap, '')).toEqual([['linecap', null]]);
  });
});

describe('Arrange tab', () => {
  it('works in draw.io units: (slide px − origin) ÷ scale', () => {
    const v = vertex('aspect=fixed;', { x: 140, y: 70, w: 240, h: 120 });
    v.origin = { x: 40, y: 10 };
    v.scale = 2;
    expect(F.unitBox(v)).toEqual({ x: 50, y: 30, w: 120, h: 60 });
    const box = F.resizedBox(F.unitBox(v), 'w', 60, true);
    expect(box).toEqual({ x: 50, y: 30, w: 60, h: 30 });
    expect(F.resizedBox(F.unitBox(v), 'h', 30, false)).toEqual({ x: 50, y: 30, w: 120, h: 30 });
    const moved = F.setUnitBox(v, { ...box, x: 60 });
    expect(moved).toEqual({ x: 20, y: 0 });
    expect([v.x, v.y, v.w, v.h]).toEqual([160, 70, 120, 60]);
  });

  it('children move with their container', () => {
    const s = slide();
    const group = vertex('group;', {}, s);
    const child = vertex('', {}, s);
    child.parent = group.cell;
    const grandchild = vertex('', {}, s);
    grandchild.parent = child.cell;
    const other = vertex('', {}, s);
    const inside = F.descendantCells(s.elements as DiagramEl[], [group]);
    expect(inside.map((c) => c.id)).toEqual([child.id, grandchild.id]);
    expect(inside).not.toContain(other);
    const edge = connector('', s);
    F.translateCell(edge, 5, -5);
    expect(edge.sourcePoint).toEqual({ x: 15, y: 5 });
  });

  it('flips vertices by style key and connectors by their points', () => {
    const a = vertex('flipH=1;');
    const b = vertex('');
    const value = F.flipTarget([a, b], true);
    expect(value).toBe(0);
    F.flipCell(a, true, value);
    F.flipCell(b, true, value);
    expect(getStyleValue(a.dio, 'flipH')).toBe('0');
    expect(getStyleValue(b.dio, 'flipH')).toBe('0');
    expect(F.flipTarget([b], false)).toBe(1);
    const e = connector('');
    e.route = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    e.points = [{ x: 20, y: 30 }];
    e.sourcePoint = { x: 0, y: 0 };
    e.targetPoint = { x: 100, y: 0 };
    F.flipCell(e, true, 1);
    expect(e.points).toEqual([{ x: 80, y: 30 }]);
    expect(e.sourcePoint).toEqual({ x: 100, y: 0 });
    expect(e.targetPoint).toEqual({ x: 0, y: 0 });
  });

  it('aligns like mxGraph.alignCells (centre on the first cell)', () => {
    const a = vertex('', { x: 0, y: 0, w: 100, h: 50 });
    const b = vertex('', { x: 300, y: 200, w: 40, h: 40 });
    const c = connector('');
    expect(F.alignCells([a, b, c], 'left').get(b.id)).toEqual({ x: 0, y: 200 });
    expect(F.alignCells([a, b], 'right').get(a.id)).toEqual({ x: 240, y: 0 });
    expect(F.alignCells([a, b], 'center').get(b.id)).toEqual({ x: 30, y: 200 });
    expect(F.alignCells([b, a], 'center').get(a.id)).toEqual({ x: 270, y: 0 });
    expect(F.alignCells([a, b], 'bottom').get(a.id)).toEqual({ x: 0, y: 190 });
    expect(F.alignCells([a, c], 'left').size).toBe(0);
  });

  it('distributes centres, or gaps with Spacing', () => {
    const a = vertex('', { x: 0, y: 0, w: 20, h: 20 });
    const b = vertex('', { x: 30, y: 0, w: 60, h: 20 });
    const c = vertex('', { x: 200, y: 0, w: 40, h: 20 });
    // Centres 10 and 220: the middle centre goes to 115, so its left edge to
    // 85 slide px — 42.5 draw.io units at a new diagram's scale 2, which
    // draw.io rounds to 43 units: 86 px.
    expect(F.distributeCells([a, b, c], true, false).get(b.id)).toEqual({ x: 86, y: 0 });
    // Gaps: 20…80 and 140…200.
    expect(F.distributeCells([a, b, c], true, true).get(b.id)).toEqual({ x: 80, y: 0 });
    expect(F.distributeCells([a, b], true, false).size).toBe(0);
  });

  it('edits the cell’s data, wrapping it in an object when needed', () => {
    const v = vertex('');
    expect(F.cellData(v)).toEqual({ attrs: [], placeholders: false });
    F.setCellData(v, [['owner', 'Kim'], ['bad name', 'x'], ['id', 'no']], true);
    expect(v.object).toEqual({ tag: 'object', attrs: { owner: 'Kim', placeholders: '1' } });
    v.object!.attrs.label = 'kept on export';
    expect(F.cellData(v)).toEqual({ attrs: [['owner', 'Kim']], placeholders: true });
    F.setCellData(v, [], false);
    expect(v.object).toBeNull();
    const u = vertex('');
    u.object = { tag: 'UserObject', attrs: { a: '1' } };
    F.setCellData(u, [['a', '2']], false);
    expect(u.object).toEqual({ tag: 'UserObject', attrs: { a: '2' } });
  });
});
