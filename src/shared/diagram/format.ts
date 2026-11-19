/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Format.js (StyleFormatPanel, TextFormatPanel, ArrangePanel,
 * Format.addLineMarkerItems and the marker and edge style images),
 * js/grapheditor/Menus.js (edgeStyleChange, applyEdgeStyleChange),
 * js/grapheditor/EditorUi.js (createSelectionState, getImageForEdgeStyle,
 * setDefaultStyle), js/grapheditor/Graph.js (cellStyles, textStyles,
 * edgeStyles, cellStyleGroups, copyCellStyles, pasteCellStyles, isFillState,
 * isGradientState, isLineJumpState, edgeSupportsCurved, isLabelOutsideOnSide,
 * flipCells, flipEdgePoints, distributeCells, removeTextStyleForCell),
 * js/grapheditor/Actions.js (formattedText), mxgraph/src/view/mxGraph.js
 * (alignCells, toggleCellStyleFlags), mxgraph/src/util/mxUtils.js
 * (setStyleFlag) and js/diagramly/Editor.js (the colour schemes, the shapes'
 * customProperties, commonVertexProperties, commonEdgeProperties).
 * Modified for DeckWerk: no DOM and no graph; everything works on DeckWerk's
 * `vertex` and `connector` elements and their `dio` style strings.
 */

/**
 * draw.io's Format panel, without the panel: what the selected diagram cells
 * share, and every change the panel makes, as plain functions over the cells'
 * style strings. src/renderer/editor/diagramFormat.ts draws the panel.
 *
 * Every change goes through `setStyleValue`, which keeps the order and the
 * spelling of every other key, so a style written by draw.io stays as it was
 * apart from the keys the person changed. A vertex's element rotation (`rot`)
 * follows its `rotation=` key wherever a change sets it.
 */

import type { ConnectorEl, DiagramEl, SlideElement, VertexEl } from '../deck.js';
import { DEFAULT_EDGE_STYLE, DEFAULT_VERTEX_STYLE } from './insert.js';
import { shapeInsideOutline } from './label/shapeInside.js';
import { MARKER_NAMES } from './paint.js';
import { getShapeClass } from './shapes/shape.js';
import { getStyleValue, parseStyleString, resolveStyle, serializeStyle, setStyleValue, styleNames } from './style.js';
import type { Point, Style } from './types.js';

export type { Point, Style } from './types.js';

// --- reading the selection -----------------------------------------------------

/** A value the selected cells do not share. */
export const MIXED: unique symbol = Symbol('mixed');
export type Mixed = typeof MIXED;

export type CellKind = 'vertex' | 'edge';

export function kindOf(el: Pick<DiagramEl, 'type'>): CellKind {
  return el.type === 'connector' ? 'edge' : 'vertex';
}

/** The style a cell is drawn with: its string over the defaults (mxGraph.getCellStyle). */
export function cellStyle(el: Pick<DiagramEl, 'type' | 'dio'> & { rot?: number }): Style {
  const style = resolveStyle(el.dio, kindOf(el));
  if (el.type === 'vertex') {
    if (el.rot) style.rotation = String(el.rot);
    else if (style.rotation != null && Number(style.rotation) === 0) delete style.rotation;
  }
  return style;
}

/**
 * Graph.mergeStyle over every cell: the keys whose value all cells share. A
 * key the cells disagree on is missing, so a control reading it shows its
 * default, as draw.io's panel does; `sharedValue` tells the two apart.
 */
export function commonStyle(cells: readonly DiagramEl[]): Style {
  let into: Style | null = null;
  for (const el of cells) {
    const style = cellStyle(el);
    if (into == null) {
      into = { ...style };
      continue;
    }
    for (const key of Object.keys(into)) if (style[key] !== into[key]) delete into[key];
  }
  return into ?? {};
}

/** The value of `key` all cells share (their drawn style, `fallback` where unset), or MIXED. */
export function sharedValue(cells: readonly DiagramEl[], key: string, fallback: string | null = null): string | null | Mixed {
  let found: string | null | undefined;
  for (const el of cells) {
    const value = cellStyle(el)[key] ?? fallback;
    if (found === undefined) found = value;
    else if (found !== value) return MIXED;
  }
  return found ?? fallback;
}

/** A numeric key all cells share, or MIXED; `fallback` where unset or unreadable. */
export function sharedNumber(cells: readonly DiagramEl[], key: string, fallback: number): number | Mixed {
  const value = sharedValue(cells, key, null);
  if (value === MIXED) return MIXED;
  if (value == null) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** A flag all cells share (`1`/`true` on), or MIXED. */
export function sharedFlag(cells: readonly DiagramEl[], key: string, fallback = false): boolean | Mixed {
  let found: boolean | undefined;
  for (const el of cells) {
    const raw = cellStyle(el)[key];
    const on = raw == null ? fallback : raw === '1' || raw === 'true';
    if (found === undefined) found = on;
    else if (found !== on) return MIXED;
  }
  return found ?? fallback;
}

function isOn(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Colours that name another colour (Graph.isSpecialColor). */
export function isSpecialColor(color: string | null | undefined): boolean {
  return color != null && ['strokeColor', 'fillColor', 'parentFillColor', 'parentStrokeColor', 'inherit', 'swimlane', 'indicated'].includes(color);
}

const FILLED_EDGE_SHAPES = ['arrow', 'pipe', 'wire', 'filledEdge', 'flexArrow', 'taperedArrow', 'mermaidSankeyLink', 'mxgraph.arrows2.wedgeArrow'];

/** Graph.isFillState. */
export function isFillState(style: Style, kind: CellKind): boolean {
  const shape = style.shape ?? null;
  return !isSpecialColor(style.fillColor) && style.lineShape !== '1' && shape !== 'mxgraph.basic.arc'
    && shape !== 'line' && (kind === 'vertex' || (shape != null && FILLED_EDGE_SHAPES.includes(shape)));
}

/** Graph.isGradientState. */
export function isGradientState(style: Style, kind: CellKind): boolean {
  return isFillState(style, kind) && style.shape !== 'wire' && style.shape !== 'pipe';
}

/** Graph.isLineJumpState. */
export function isLineJumpState(style: Style): boolean {
  const shape = style.shape ?? null;
  return (style.curved !== '1' || style.curveGeometry === '1')
    && (shape === 'connector' || shape === 'filledEdge' || shape === 'wire');
}

/** Graph.edgeSupportsCurved: the edge shape paints the curved style. */
export function edgeSupportsCurved(style: Style): boolean {
  const shape = style.shape ?? null;
  return shape == null || ['connector', 'filledEdge', 'wire', 'pipe', 'link', 'flexArrow', 'taperedArrow'].includes(shape);
}

function shapeInstance(style: Style, kind: CellKind): { isRoundable(): boolean; isGlassable(): boolean } | null {
  const Ctor = getShapeClass(style.shape) ?? getShapeClass(kind === 'edge' ? 'connector' : 'rectangle');
  if (!Ctor) return null;
  const shape = new Ctor();
  try {
    shape.configure(style);
  } catch {
    // A shape that cannot configure from this style still answers the questions below.
  }
  return shape;
}

/** Graph.isRoundedState: the shape can have rounded corners. */
export function isRoundable(style: Style, kind: CellKind): boolean {
  return shapeInstance(style, kind)?.isRoundable() ?? false;
}

/** Graph.isGlassState. */
export function isGlassable(style: Style, kind: CellKind): boolean {
  return shapeInstance(style, kind)?.isGlassable() ?? false;
}

/** EditorUi.createSelectionState, for what the panel needs. */
export interface SelectionState {
  cells: DiagramEl[];
  vertices: VertexEl[];
  edges: ConnectorEl[];
  /** The shared style (Graph.mergeStyle). */
  style: Style;
  fill: boolean;
  gradient: boolean;
  stroke: boolean;
  rounded: boolean;
  glass: boolean;
  lineJumps: boolean;
  html: boolean;
  containsImage: boolean;
}

export function selectionState(cells: readonly DiagramEl[]): SelectionState {
  const vertices = cells.filter((el): el is VertexEl => el.type === 'vertex');
  const edges = cells.filter((el): el is ConnectorEl => el.type === 'connector');
  const state: SelectionState = {
    cells: [...cells], vertices, edges, style: commonStyle(cells),
    fill: true, gradient: false, stroke: true, rounded: true, glass: true, lineJumps: true, html: true, containsImage: false,
  };
  for (const el of cells) {
    const kind = kindOf(el);
    const style = cellStyle(el);
    state.html = state.html && style.html === '1';
    state.glass = state.glass && isGlassable(style, kind);
    state.rounded = state.rounded && isRoundable(style, kind);
    state.lineJumps = state.lineJumps && kind === 'edge' && isLineJumpState(style);
    state.fill = state.fill && isFillState(style, kind);
    state.gradient = state.fill && isGradientState(style, kind);
    state.containsImage = state.containsImage || style.shape === 'image';
  }
  if (cells.length === 0) Object.assign(state, { fill: false, rounded: false, glass: false, lineJumps: false, html: false });
  return state;
}

// --- writing --------------------------------------------------------------------

/** Keys to set, in order; `null` removes a key (mxUtils.setStyle). */
export type StyleChanges = ReadonlyArray<readonly [string, string | number | null]>;

/** The style string with each change applied in order, every other entry kept as written. */
export function withStyle(dio: string, changes: StyleChanges): string {
  let next = dio;
  for (const [key, value] of changes) next = setStyleValue(next, key, value);
  return next;
}

/** Applies style changes to a cell; a vertex's `rot` follows a `rotation` change. */
export function applyStyleChanges(el: DiagramEl, changes: StyleChanges): void {
  el.dio = withStyle(el.dio, changes);
  if (el.type === 'vertex' && changes.some(([key]) => key === 'rotation')) syncRotation(el);
}

/** el.rot from the style's `rotation=` (the element box turns with it, as draw.io's does). */
export function syncRotation(el: VertexEl): void {
  const written = Number(getStyleValue(el.dio, 'rotation') ?? 0);
  el.rot = Number.isFinite(written) ? written : 0;
}

/** The raw style a person typed into Edit Style: one line, rotation followed. */
export function editStyleText(el: DiagramEl, text: string): void {
  el.dio = text.trim().replace(/\s*\n\s*/g, '');
  if (el.type === 'vertex') syncRotation(el);
}

/** Graph.setCellStyles over one key. */
export function setKey(key: string, value: string | number | null): StyleChanges {
  return [[key, value]];
}

// --- Style tab ------------------------------------------------------------------

/** draw.io's predefined colour schemes (StyleFormatPanel.defaultColorSchemes). */
export interface ColorScheme {
  fill?: string;
  stroke?: string;
  font?: string;
  gradient?: string;
}

export const COLOR_SCHEMES: ReadonlyArray<ReadonlyArray<ColorScheme>> = [
  [{ fill: '', stroke: '' }, { fill: '#f5f5f5', stroke: '#666666', font: '#333333' },
    { fill: '#dae8fc', stroke: '#6c8ebf' }, { fill: '#d5e8d4', stroke: '#82b366' },
    { fill: '#ffe6cc', stroke: '#d79b00' }, { fill: '#fff2cc', stroke: '#d6b656' },
    { fill: '#f8cecc', stroke: '#b85450' }, { fill: '#e1d5e7', stroke: '#9673a6' }],
  [{ fill: '', stroke: '' }, { fill: '#60a917', stroke: '#2D7600', font: '#ffffff' },
    { fill: '#008a00', stroke: '#005700', font: '#ffffff' }, { fill: '#1ba1e2', stroke: '#006EAF', font: '#ffffff' },
    { fill: '#0050ef', stroke: '#001DBC', font: '#ffffff' }, { fill: '#6a00ff', stroke: '#3700CC', font: '#ffffff' },
    { fill: '#d80073', stroke: '#A50040', font: '#ffffff' }, { fill: '#a20025', stroke: '#6F0000', font: '#ffffff' }],
  [{ fill: '#e51400', stroke: '#B20000', font: '#ffffff' }, { fill: '#fa6800', stroke: '#C73500', font: '#000000' },
    { fill: '#f0a30a', stroke: '#BD7000', font: '#000000' }, { fill: '#e3c800', stroke: '#B09500', font: '#000000' },
    { fill: '#6d8764', stroke: '#3A5431', font: '#ffffff' }, { fill: '#647687', stroke: '#314354', font: '#ffffff' },
    { fill: '#76608a', stroke: '#432D57', font: '#ffffff' }, { fill: '#a0522d', stroke: '#6D1F00', font: '#ffffff' }],
  [{ fill: '', stroke: '' }, { fill: 'none', stroke: '' },
    { fill: '#fad7ac', stroke: '#b46504' }, { fill: '#fad9d5', stroke: '#ae4132' },
    { fill: '#b0e3e6', stroke: '#0e8088' }, { fill: '#b1ddf0', stroke: '#10739e' },
    { fill: '#d0cee2', stroke: '#56517e' }, { fill: '#bac8d3', stroke: '#23445d' }],
  [{ fill: '', stroke: '' },
    { fill: '#f5f5f5', stroke: '#666666', gradient: '#b3b3b3' },
    { fill: '#dae8fc', stroke: '#6c8ebf', gradient: '#7ea6e0' },
    { fill: '#d5e8d4', stroke: '#82b366', gradient: '#97d077' },
    { fill: '#ffcd28', stroke: '#d79b00', gradient: '#ffa500' },
    { fill: '#fff2cc', stroke: '#d6b656', gradient: '#ffd966' },
    { fill: '#f8cecc', stroke: '#b85450', gradient: '#ea6b66' },
    { fill: '#e6d0de', stroke: '#996185', gradient: '#d5739d' }],
  [{ fill: '', stroke: '' }, { fill: '#eeeeee', stroke: '#36393d' },
    { fill: '#f9f7ed', stroke: '#36393d' }, { fill: '#ffcc99', stroke: '#36393d' },
    { fill: '#cce5ff', stroke: '#36393d' }, { fill: '#ffff88', stroke: '#36393d' },
    { fill: '#cdeb8b', stroke: '#36393d' }, { fill: '#ffcccc', stroke: '#36393d' }],
];

/** Which colours a click on a scheme swatch leaves alone (draw.io's Shift, Ctrl/Cmd and Alt). */
export interface SchemeModifiers {
  /** Shift: keep fill, gradient and font. */
  keepFill?: boolean;
  /** Ctrl/Cmd: keep the font colour. */
  keepFont?: boolean;
  /** Alt: keep the stroke. */
  keepStroke?: boolean;
}

/**
 * StyleFormatPanel.getColorSchemeStyles for one cell: fill, gradient, stroke
 * and (vertices) font colour from the swatch; an empty value removes the key,
 * so the first swatch of a row puts the cell back on the default colours.
 * Image cells colour their label background and border instead.
 */
export function colorSchemeChanges(el: DiagramEl, scheme: ColorScheme | null, mods: SchemeModifiers = {}): StyleChanges {
  const style = cellStyle(el);
  const isLabel = style.shape === 'image';
  const fillKey = isLabel ? 'labelBackgroundColor' : 'fillColor';
  const strokeKey = isLabel ? 'labelBorderColor' : 'strokeColor';
  const changes: Array<[string, string | null]> = [];
  const own = (value: string | undefined) => (value == null || value === '' ? null : value);
  let fontUpdated = false;
  if (scheme != null) {
    if (!mods.keepFill) {
      changes.push([fillKey, own(scheme.fill)]);
      if (!isLabel) changes.push(['gradientColor', own(scheme.gradient)]);
      if (!mods.keepFont && el.type === 'vertex') {
        fontUpdated = true;
        changes.push(['fontColor', own(scheme.font)]);
      }
    }
    if (!mods.keepStroke) changes.push([strokeKey, own(scheme.stroke)]);
  } else {
    changes.push([fillKey, null], [strokeKey, null]);
    if (!isLabel) changes.push(['gradientColor', null]);
    if (el.type === 'vertex') {
      fontUpdated = true;
      changes.push(['fontColor', null]);
    }
  }
  // A font colour of none had hidden the label (noLabel=1, see fontColorChanges).
  if (fontUpdated && getStyleValue(el.dio, 'fontColor') === 'none' && (scheme == null || scheme.font !== 'none')) {
    changes.push(['noLabel', null]);
  }
  return changes;
}

/** Fill, gradient and the gradient's direction. */
export const GRADIENT_DIRECTIONS = ['north', 'east', 'south', 'west', 'radial'] as const;

/** The key a colour row edits: images have a background and a border instead of fill and line. */
export function fillKeyOf(style: Style): string {
  return style.shape === 'image' ? 'imageBackground' : 'fillColor';
}

export function strokeKeyOf(style: Style): string {
  return style.shape === 'image' ? 'imageBorder' : 'strokeColor';
}

/** Dash patterns of the Pattern menu (StyleFormatPanel.addStroke). */
export interface DashPattern {
  id: string;
  title: string;
  /** `dashed`, `dashPattern`; null removes. */
  dashed: string | null;
  pattern: string | null;
  /** What the preview draws (a CSS border style or an SVG dash array). */
  preview: string;
}

export const DASH_PATTERNS: readonly DashPattern[] = [
  { id: 'solid', title: 'Solid', dashed: null, pattern: null, preview: 'solid' },
  { id: 'dashed', title: 'Dashed (1)', dashed: '1', pattern: null, preview: 'dashed' },
  { id: '8 8', title: 'Dashed (2)', dashed: '1', pattern: '8 8', preview: '8 8' },
  { id: '12 12', title: 'Dashed (3)', dashed: '1', pattern: '12 12', preview: '12 12' },
  { id: '8 4 1 4', title: 'Dashed (4)', dashed: '1', pattern: '8 4 1 4', preview: '8 4 1 4' },
  { id: 'dotted', title: 'Dotted (1)', dashed: '1', pattern: '1 1', preview: '1 1' },
  { id: '1 2', title: 'Dotted (2)', dashed: '1', pattern: '1 2', preview: '1 2' },
  { id: '1 4', title: 'Dotted (3)', dashed: '1', pattern: '1 4', preview: '1 4' },
];

export function dashChanges(dashed: string | null, pattern: string | null): StyleChanges {
  return [['dashed', dashed], ['dashPattern', pattern]];
}

/** Which Pattern menu entry a style shows; `custom` for a pattern not in the menu. */
export function dashPatternOf(style: Style): string {
  if (style.dashed !== '1') return 'solid';
  const pattern = style.dashPattern ?? null;
  if (pattern == null || pattern.trim() === '') return 'dashed';
  const found = DASH_PATTERNS.find((p) => p.pattern === pattern);
  return found ? found.id : 'custom';
}

/** Line style of edges: sharp, rounded or curved (rounded and curved exclude each other). */
export type LineShapeStyle = 'sharp' | 'rounded' | 'curved';

export function lineShapeChanges(value: LineShapeStyle): StyleChanges {
  if (value === 'rounded') return [['rounded', '1'], ['curved', '0']];
  if (value === 'curved') return [['rounded', '0'], ['curved', '1']];
  return [['rounded', '0'], ['curved', '0']];
}

export function lineShapeOf(style: Style): LineShapeStyle {
  if (style.curved === '1') return 'curved';
  if (style.rounded === '1') return 'rounded';
  return 'sharp';
}

/** The Waypoints menu (StyleFormatPanel.addStroke): each choice also clears the waypoints. */
export interface EdgeStyleChoice {
  id: string;
  title: string;
  changes: StyleChanges;
  /** draw.io's menu icon (Format.*Image): an SVG body in a 36×36 box. */
  icon: string;
}

const ICON = (d: string, transform = 'translate(3,4)') =>
  `<path transform="${transform}" stroke-width="2.5" d="${d}" stroke="currentColor" fill="none"/>`;

export const EDGE_STYLES: readonly EdgeStyleChoice[] = [
  {
    id: 'straight', title: 'Straight',
    changes: [['edgeStyle', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 4 26 L 26 4 M 26 0 L 30 0 L 30 4 L 26 4 Z'),
  },
  {
    id: 'orthogonal', title: 'Orthogonal',
    changes: [['edgeStyle', 'orthogonalEdgeStyle'], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 2 26 L 2 14 L 28 14 L 28 4 M 26 0 L 30 0 L 30 4 L 26 4 Z'),
  },
  {
    id: 'verticalElbow', title: 'Horizontal',
    changes: [['edgeStyle', 'elbowEdgeStyle'], ['elbow', 'vertical'], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 13 L 4 13 L 4 17 L 0 17 Z M 4 15 L 26 15 M 26 13 L 30 13 L 30 17 L 26 17 Z M 15 12 L 15 6 M 15 4 L 17 6 L 13 6 Z M 15 18 L 15 24 M 15 26 L 17 24 L 13 24 Z'),
  },
  {
    id: 'horizontalElbow', title: 'Vertical',
    changes: [['edgeStyle', 'elbowEdgeStyle'], ['elbow', null], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 13 0 L 17 0 L 17 4 L 13 4 Z M 15 4 L 15 26 M 13 26 L 17 26 L 17 30 L 13 30 Z M 12 15 L 6 15 M 4 15 L 6 13 L 6 17 Z M 18 15 L 24 15 M 26 15 L 24 13 L 24 17 Z'),
  },
  {
    id: 'horizontalIsometric', title: 'Isometric',
    changes: [['edgeStyle', 'isometricEdgeStyle'], ['elbow', null], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 4 26 L 19 17 L 10 12 L 26 4 M 26 0 L 30 0 L 30 4 L 26 4 Z'),
  },
  {
    id: 'verticalIsometric', title: 'Isometric (vertical)',
    changes: [['edgeStyle', 'isometricEdgeStyle'], ['elbow', 'vertical'], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 4 26 L 19 17 L 10 12 L 26 4 M 26 0 L 30 0 L 30 4 L 26 4 Z', 'translate(32,4)scale(-1,1)'),
  },
  {
    id: 'curved', title: 'Curved',
    changes: [['edgeStyle', 'orthogonalEdgeStyle'], ['curved', '1'], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 2 26 Q 2 14 14 14 Q 28 14 28 4 M 26 0 L 30 0 L 30 4 L 26 4 Z'),
  },
  {
    id: 'entityRelation', title: 'Entity Relation',
    changes: [['edgeStyle', 'entityRelationEdgeStyle'], ['curved', null], ['noEdgeStyle', null], ['libavoidRouting', null]],
    icon: ICON('M 0 26 L 4 26 L 4 30 L 0 30 Z M 4 28 L 10 28 L 20 2 L 26 2 M 26 0 L 30 0 L 30 4 L 26 4 Z'),
  },
];

/** The Waypoints entries a style can take (curved only where the edge shape paints it). */
export function edgeStyleChoices(style: Style): EdgeStyleChoice[] {
  if (style.shape === 'arrow') return [];
  return EDGE_STYLES.filter((choice) => choice.id !== 'curved' || edgeSupportsCurved(style));
}

/** EditorUi.getImageForEdgeStyle: which Waypoints entry a style shows. */
export function edgeStyleOf(style: Style): string {
  let es: string | null = style.edgeStyle ?? null;
  if (style.noEdgeStyle === '1') es = null;
  if (es === 'orthogonalEdgeStyle' && style.curved === '1') return 'curved';
  if (es === 'straight' || es === 'none' || es == null) return 'straight';
  if (es === 'entityRelationEdgeStyle') return 'entityRelation';
  if (es === 'elbowEdgeStyle') return style.elbow === 'vertical' ? 'verticalElbow' : 'horizontalElbow';
  if (es === 'isometricEdgeStyle') return style.elbow === 'vertical' ? 'verticalIsometric' : 'horizontalIsometric';
  return 'orthogonal';
}

/**
 * Menus.applyEdgeStyleChange with reset: the edge style keys, and the
 * waypoints cleared (with the inner-loop flag that describes them).
 */
export function applyEdgeStyleChoice(el: ConnectorEl, choice: EdgeStyleChoice): void {
  el.points = [];
  applyStyleChanges(el, [['innerLoopWaypoints', null], ...choice.changes]);
}

/** The connector shapes of the Connection menu (StyleFormatPanel.addStroke). */
export interface EdgeShapeChoice {
  id: string;
  title: string;
  shape: string | null;
  dashed: string | null;
  icon: string;
}

const EDGE_SHAPE_KEYS = ['shape', 'startSize', 'endSize', 'dashed', 'width', 'startWidth', 'endWidth', 'defaultFillColor', 'defaultGradientColor'];

export const EDGE_SHAPES: readonly EdgeShapeChoice[] = [
  { id: 'connector', title: 'Line', shape: null, dashed: null, icon: '<path transform="translate(4,3)" stroke-width="2.5" d="M 0 8 L 26 8 L 26 4 L 32 8 L 26 12 L 26 8 Z" stroke="currentColor" fill="currentColor"/>' },
  { id: 'link', title: 'Link', shape: 'link', dashed: null, icon: '<path transform="translate(4,3)" stroke-width="2.5" d="M 0 6 L 32 6 M 0 10 L 32 10" stroke="currentColor" fill="currentColor"/>' },
  { id: 'flexArrow', title: 'Arrow', shape: 'flexArrow', dashed: null, icon: '<path transform="translate(4,3)" stroke-width="2.5" d="M 0 6 L 24 6 L 24 2 L 32 8 L 24 14 L 24 10 L 0 10 Z" stroke="currentColor" fill="none"/>' },
  { id: 'arrow', title: 'Simple Arrow', shape: 'arrow', dashed: null, icon: '<path transform="translate(4,3)" stroke-width="2.5" d="M 0 6 L 4 6 L 4 10 L 0 10 Z M 7 6 L 18 6 L 18 2 L 25 8 L 18 14 L 18 10 L 7 10 Z M 28 6 L 28 6 L 32 6 L 32 10 L 28 10 Z" stroke="currentColor" fill="none"/>' },
  { id: 'taperedArrow', title: 'Tapered Arrow', shape: 'taperedArrow', dashed: null, icon: '<path transform="translate(4,3)" stroke-width="2" stroke-linejoin="round" d="M 0 3 L 23 7 L 23 3 L 32 8 L 23 13 L 23 9 L 0 13 Z" stroke="currentColor" fill="none"/>' },
  { id: 'filledEdge', title: 'Filled Edge', shape: 'filledEdge', dashed: null, icon: '<path transform="translate(4,0)" stroke-width="8.5" d="M 0 10 L 34 10" stroke="currentColor" fill="currentColor"/><path transform="translate(4,0)" stroke-width="6" d="M 0 10 L 34 10" stroke="var(--panel-2, #fff)" fill="none"/>' },
  { id: 'pipe', title: 'Pipe', shape: 'pipe', dashed: null, icon: '<path transform="translate(4,0)" stroke-width="10.5" d="M 0 10 L 34 10" stroke="currentColor" fill="currentColor"/><path transform="translate(4,0)" stroke-width="8" d="M 0 10 L 34 10" stroke="var(--panel-2, #fff)" fill="none"/>' },
  { id: 'wire', title: 'Wire', shape: 'wire', dashed: '1', icon: '<path transform="translate(4,0)" stroke-width="6" d="M 0 10 L 34 10" stroke="currentColor" fill="none"/><path transform="translate(4,0)" stroke-dasharray="8 8" stroke-width="3.5" d="M 0 10 L 34 10" stroke="#e5484d" fill="none"/>' },
];

/** Menus.styleChange for a Connection entry: the shape and the keys that belong to the previous one. */
export function edgeShapeChanges(choice: EdgeShapeChoice): StyleChanges {
  return EDGE_SHAPE_KEYS.map((key) => [key, key === 'shape' ? choice.shape : key === 'dashed' ? choice.dashed : null] as const);
}

export function edgeShapeOf(style: Style): string {
  const shape = style.shape ?? 'connector';
  return EDGE_SHAPES.some((s) => s.id === shape) ? shape : 'connector';
}

// --- line markers ---------------------------------------------------------------

/** A Line start / Line end menu entry: the marker, its fill and draw.io's own icon. */
export interface MarkerChoice {
  marker: string;
  /** startFill/endFill; null leaves it alone (markers draw.io's menu does not list). */
  fill: 0 | 1 | null;
  title: string;
  /** draw.io's icon path (Format.*MarkerImage), drawn in a 32×20 box; null to paint the marker itself. */
  path: string | null;
  filled: boolean;
}

const MARKER_ICONS: Record<string, [string, string]> = {
  // marker-fill: [path, title]
  'classic-1': ['M 0 8 L 10 2 L 5 8 L 10 14 Z M 0 8 L 24 8', 'Classic'],
  'classicThin-1': ['M 0 8 L 8 4 L 3 8 L 8 12 Z M 0 8 L 24 8', 'Classic Thin'],
  'open-0': ['M 8 0 L 0 8 L 8 16 M 0 8 L 24 8', 'Open'],
  'openThin-0': ['M 8 4 L 0 8 L 8 12 M 0 8 L 24 8', 'Open Thin'],
  'openAsync-0': ['M 8 4 L 0 8 L 24 8', 'Open Async'],
  'block-1': ['M 0 8 L 8 2 L 8 14 Z M 0 8 L 24 8', 'Block'],
  'blockThin-1': ['M 0 8 L 8 4 L 8 12 Z M 0 8 L 24 8', 'Block Thin'],
  'async-1': ['M 6 8 L 6 4 L 0 8 L 24 8', 'Async'],
  'oval-1': ['M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 11 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z M 10 8 L 24 8', 'Oval'],
  'diamond-1': ['M 0 8 L 6 2 L 12 8 L 6 14 Z M 0 8 L 24 8', 'Diamond'],
  'diamondThin-1': ['M 0 8 L 8 3 L 16 8 L 8 13 Z M 0 8 L 24 8', 'Diamond Thin'],
  'classic-0': ['M 0 8 L 10 2 L 5 8 L 10 14 Z M 5 8 L 24 8', 'Classic (open)'],
  'classicThin-0': ['M 0 8 L 8 4 L 5 8 L 8 12 Z M 5 8 L 24 8', 'Classic Thin (open)'],
  'block-0': ['M 0 8 L 8 2 L 8 14 Z M 8 8 L 24 8', 'Block (open)'],
  'blockThin-0': ['M 0 8 L 8 4 L 8 12 Z M 8 8 L 24 8', 'Block Thin (open)'],
  'async-0': ['M 6 8 L 6 4 L 0 8 L 24 8', 'Async (open)'],
  'oval-0': ['M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 11 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z M 10 8 L 24 8', 'Oval (open)'],
  'diamond-0': ['M 0 8 L 6 2 L 12 8 L 6 14 Z M 12 8 L 24 8', 'Diamond (open)'],
  'diamondThin-0': ['M 0 8 L 8 3 L 16 8 L 8 13 Z M 16 8 L 24 8', 'Diamond Thin (open)'],
  'box-0': ['M 0 3 L 10 3 L 10 13 L 0 13 Z M 10 8 L 24 8', 'Box'],
  'halfCircle-0': ['M 0 3 A 5 5 0 0 1 5 8 A 5 5 0 0 1 0 13 M 5 8 L 24 8', 'Half Circle'],
  'dash-0': ['M 0 2 L 12 14 M 0 8 L 24 8', 'Dash'],
  'cross-0': ['M 0 2 L 12 14 M 12 2 L 0 14 M 0 8 L 24 8', 'Cross'],
  'circlePlus-0': ['M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 6 2 L 6 14 M 0 8 L 24 8', 'Circle Plus'],
  'circle-0': ['M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 12 8 L 24 8', 'Circle'],
  'circle-1': ['M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 12 8 L 24 8', 'Circle'],
  'baseDash-0': ['M 0 2 L 0 14 M 0 8 L 24 8', 'Base Dash'],
  'ERone-0': ['M 5 2 L 5 14 M 0 8 L 24 8', 'ER One'],
  'ERmandOne-0': ['M 6 2 L 6 14 M 9 2 L 9 14 M 0 8 L 24 8', 'ER Mandatory One'],
  'ERmany-0': ['M 0 2 L 12 8 L 0 14 M 0 8 L 24 8', 'ER Many'],
  'ERoneToMany-0': ['M 0 2 L 12 8 L 0 14 M 15 2 L 15 14 M 0 8 L 24 8', 'ER One to Many'],
  'ERzeroToOne-0': ['M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 0 8 L 8 8 M 18 8 L 24 8 M 4 3 L 4 13', 'ER Zero to One'],
  'ERzeroToMany-0': ['M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 0 8 L 8 8 M 18 8 L 24 8 M 0 3 L 8 8 L 0 13', 'ER Zero to Many'],
  'doubleBlock-0': ['M 0 8 L 8 2 L 8 14 Z M 8 8 L 16 2 L 16 14 Z M 16 8 L 24 8', 'Double Block (open)'],
  'doubleBlock-1': ['M 0 8 L 8 2 L 8 14 Z M 8 8 L 16 2 L 16 14 Z M 16 8 L 24 8', 'Double Block'],
};

/** The order of Format.addLineMarkerItems (circle is filled at the start, open at the end). */
function drawioMarkerOrder(start: boolean): Array<[string, 0 | 1]> {
  return [
    ['classic', 1], ['classicThin', 1], ['open', 0], ['openThin', 0], ['openAsync', 0], ['block', 1], ['blockThin', 1],
    ['async', 1], ['oval', 1], ['diamond', 1], ['diamondThin', 1], ['classic', 0], ['classicThin', 0], ['block', 0],
    ['blockThin', 0], ['async', 0], ['oval', 0], ['diamond', 0], ['diamondThin', 0], ['box', 0], ['halfCircle', 0],
    ['dash', 0], ['cross', 0], ['circlePlus', 0], ['circle', start ? 1 : 0], ['baseDash', 0], ['ERone', 0],
    ['ERmandOne', 0], ['ERmany', 0], ['ERoneToMany', 0], ['ERzeroToOne', 0], ['ERzeroToMany', 0],
    ['doubleBlock', 0], ['doubleBlock', 1],
  ];
}

const MARKER_EDGE_SHAPES = ['connector', 'flexArrow', 'filledEdge', 'wire', 'pipe', 'mxgraph.basic.arc', 'taperedArrow'];

/** True if the edge shape has line ends to choose (Format.addLineMarkerItems). */
export function hasLineMarkers(style: Style): boolean {
  return MARKER_EDGE_SHAPES.includes(style.shape ?? 'connector');
}

/**
 * The Line start / Line end menu for a style: draw.io's entries in its order
 * (a flexArrow only offers None and Block), then every other marker DeckWerk
 * can paint, so all of MARKER_NAMES can be picked.
 */
export function markerChoices(style: Style, start: boolean): MarkerChoice[] {
  const shape = style.shape ?? 'connector';
  if (shape === 'flexArrow') {
    return [
      { marker: 'none', fill: 0, title: 'None', path: null, filled: false },
      { marker: 'block', fill: null, title: 'Block', path: MARKER_ICONS['block-0'][0], filled: false },
    ];
  }
  const out: MarkerChoice[] = [{ marker: 'none', fill: 0, title: 'None', path: null, filled: false }];
  const listed = new Set<string>();
  for (const [marker, fill] of drawioMarkerOrder(start)) {
    const icon = MARKER_ICONS[`${marker}-${fill}`];
    listed.add(marker);
    // draw.io draws the circle entry hollow even where it sets startFill=1.
    out.push({ marker, fill, title: icon[1], path: icon[0], filled: fill === 1 && marker !== 'circle' });
  }
  for (const marker of MARKER_NAMES) {
    if (listed.has(marker)) continue;
    out.push({ marker, fill: null, title: markerTitle(marker), path: null, filled: false });
  }
  return out;
}

function markerTitle(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** The keys a Line start / Line end entry sets. */
export function markerChanges(start: boolean, choice: Pick<MarkerChoice, 'marker' | 'fill'>): StyleChanges {
  const prefix = start ? 'start' : 'end';
  const changes: Array<[string, string | number | null]> = [[`${prefix}Arrow`, choice.marker]];
  if (choice.fill != null) changes.push([`${prefix}Fill`, choice.fill]);
  return changes;
}

/**
 * The "copy the other end" entry of Format.addLineMarkerItems: offered when
 * the other end has a marker and this end differs from it in marker, size or fill.
 */
export function copyOtherMarker(style: Style, start: boolean): StyleChanges | null {
  const prefix = start ? 'start' : 'end';
  const other = start ? 'end' : 'start';
  const otherMarker = style[`${other}Arrow`] ?? 'none';
  const otherFill = style[`${other}Fill`] ?? '1';
  if (otherMarker === 'none') return null;
  if ((style[`${prefix}Arrow`] ?? 'none') === otherMarker
    && (style[`${prefix}Size`] ?? '1') === (style[`${other}Size`] ?? '1')
    && (style[`${prefix}Fill`] ?? '1') === otherFill) return null;
  return [[`${prefix}Arrow`, otherMarker], [`${prefix}Fill`, otherFill], [`${prefix}Size`, style[`${other}Size`] ?? null]];
}

/** The marker and fill an end shows. */
export function markerOf(style: Style, start: boolean): { marker: string; fill: 0 | 1 } {
  const prefix = start ? 'start' : 'end';
  return {
    marker: style[`${prefix}Arrow`] ?? 'none',
    fill: (style[`${prefix}Fill`] ?? '1') === '0' ? 0 : 1,
  };
}

/** Line jumps (StyleFormatPanel.addLineJumps). */
export const JUMP_STYLES = ['none', 'arc', 'gap', 'sharp', 'line'] as const;
export const DEFAULT_JUMP_SIZE = 6;

/**
 * BaseFormatPanel.installInputHandler for the line start/end spacing: on an
 * edge it also sets fixedPointSpacing, so the spacing applies to fixed
 * connection points too.
 */
export function perimeterSpacingChanges(el: DiagramEl, key: string, value: number): StyleChanges {
  const changes: Array<[string, string | number | null]> = [[key, value]];
  if (el.type === 'connector' && (key === 'sourcePerimeterSpacing' || key === 'targetPerimeterSpacing')) {
    changes.push(['fixedPointSpacing', '1']);
  }
  return changes;
}

/** Effects: Rounded (vertices also follow the rounded outline for their connection points). */
export function roundedChanges(el: DiagramEl, on: boolean): StyleChanges {
  const changes: Array<[string, string | number | null]> = [['rounded', on ? 1 : 0]];
  if (el.type === 'vertex') changes.push(['roundedPerimeter', on ? '1' : null]);
  return changes;
}

/** Effects: Sketch, with draw.io's default curve fitting and jiggle. */
export function sketchChanges(on: boolean): StyleChanges {
  return [['sketch', on ? '1' : null], ['curveFitting', on ? '1' : null], ['jiggle', on ? '2' : null]];
}

/** A checkbox option (BaseFormatPanel.createCellOption): `null` in a value removes the key. */
export function optionChanges(key: string, on: boolean, enabledValue: string | number | null = 1, disabledValue: string | number | null = 0): StyleChanges {
  return [[key, on ? enabledValue : disabledValue]];
}

// --- Text tab --------------------------------------------------------------------

export const FONT_BOLD = 1;
export const FONT_ITALIC = 2;
export const FONT_UNDERLINE = 4;
export const FONT_STRIKETHROUGH = 8;

/** Menus.prototype.defaultFonts. */
export const DEFAULT_FONTS = ['Helvetica', 'Verdana', 'Times New Roman', 'Garamond', 'Comic Sans MS',
  'Courier New', 'Georgia', 'Lucida Console', 'Tahoma'];
export const DEFAULT_FONT = 'Helvetica';
export const DEFAULT_FONT_SIZE = 12;

/**
 * mxUtils.setStyleFlag: sets or clears one bit of a flag key in the string
 * itself (a missing key counts as 0, as in draw.io).
 */
export function setStyleFlag(dio: string, key: string, flag: number, on: boolean | null): string {
  const written = getStyleValue(dio, key);
  if (written == null) return setStyleValue(dio, key, on || on == null ? flag : 0);
  let value = parseInt(written, 10);
  if (!Number.isFinite(value)) value = 0;
  if (on == null) value ^= flag;
  else if (on) value |= flag;
  else value &= ~flag;
  return setStyleValue(dio, key, value);
}

/**
 * mxGraph.toggleCellStyleFlags: whether the bit goes on or off follows the
 * first cell's drawn style; every cell then gets that.
 */
export function fontStyleToggleTarget(cells: readonly DiagramEl[], flag: number): boolean {
  if (cells.length === 0) return true;
  const current = parseInt(cellStyle(cells[0]).fontStyle ?? '0', 10) || 0;
  return (current & flag) !== flag;
}

/** Whether every cell has a fontStyle bit (or MIXED). */
export function sharedFontFlag(cells: readonly DiagramEl[], flag: number): boolean | Mixed {
  let found: boolean | undefined;
  for (const el of cells) {
    const on = ((parseInt(cellStyle(el).fontStyle ?? '0', 10) || 0) & flag) === flag;
    if (found === undefined) found = on;
    else if (found !== on) return MIXED;
  }
  return found ?? false;
}

/** The Position menu: labelPosition, verticalLabelPosition, align, verticalAlign. */
export const LABEL_POSITIONS = {
  topLeft: ['left', 'top', 'right', 'bottom'],
  top: ['center', 'top', 'center', 'bottom'],
  topRight: ['right', 'top', 'left', 'bottom'],
  left: ['left', 'middle', 'right', 'middle'],
  center: ['center', 'middle', 'center', 'middle'],
  right: ['right', 'middle', 'left', 'middle'],
  bottomLeft: ['left', 'bottom', 'right', 'top'],
  bottom: ['center', 'bottom', 'center', 'top'],
  bottomRight: ['right', 'bottom', 'left', 'top'],
} as const;
export type LabelPosition = keyof typeof LABEL_POSITIONS;

export const LABEL_POSITION_TITLES: Record<LabelPosition, string> = {
  topLeft: 'Top Left', top: 'Top', topRight: 'Top Right', left: 'Left', center: 'Center',
  right: 'Right', bottomLeft: 'Bottom Left', bottom: 'Bottom', bottomRight: 'Bottom Right',
};

/** Which Position entry a style shows. */
export function labelPositionOf(style: Style): LabelPosition {
  const pos = style.labelPosition ?? 'center';
  const vpos = style.verticalLabelPosition ?? 'middle';
  if (vpos === 'top' && pos === 'left') return 'topLeft';
  if (vpos === 'top' && pos === 'center') return 'top';
  if (vpos === 'top' && pos === 'right') return 'topRight';
  if (vpos === 'bottom' && pos === 'left') return 'bottomLeft';
  if (vpos === 'bottom' && pos === 'center') return 'bottom';
  if (vpos === 'bottom' && pos === 'right') return 'bottomRight';
  if (pos === 'left') return 'left';
  if (pos === 'right') return 'right';
  return 'center';
}

/** Graph.isLabelOutsideOnSide. */
export function isLabelOutsideOnSide(labelPosition: string, verticalLabelPosition: string): boolean {
  return (labelPosition === 'center' && (verticalLabelPosition === 'top' || verticalLabelPosition === 'bottom'))
    || (verticalLabelPosition === 'middle' && (labelPosition === 'left' || labelPosition === 'right'));
}

/**
 * The Position menu's change for one cell: the four keys, and for a vertex
 * the label perimeter edges end at when the label is outside on one side
 * (kept off where Label Perimeter was switched off in the properties).
 */
export function labelPositionChanges(el: DiagramEl, position: LabelPosition): StyleChanges {
  const [lp, vlp, align, valign] = LABEL_POSITIONS[position];
  const changes: Array<[string, string | number | null]> = [
    ['labelPosition', lp], ['verticalLabelPosition', vlp], ['align', align], ['verticalAlign', valign],
  ];
  if (el.type === 'vertex') {
    const outside = isLabelOutsideOnSide(lp, vlp);
    const current = cellStyle(el).labelPerimeter ?? null;
    if (outside ? current !== '0' : current === '1') changes.push(['labelPerimeter', outside ? '1' : null]);
  }
  return changes;
}

/** Writing direction: automatic removes the key; vertical directions need formatted text. */
export const WRITING_DIRECTIONS: ReadonlyArray<{ id: string; title: string; value: string | null; html: boolean }> = [
  { id: 'automatic', title: 'Automatic', value: null, html: false },
  { id: 'leftToRight', title: 'Left to Right', value: 'ltr', html: false },
  { id: 'rightToLeft', title: 'Right to Left', value: 'rtl', html: false },
  { id: 'vertical-leftToRight', title: 'Vertical (Left to Right)', value: 'vertical-lr', html: true },
  { id: 'vertical-rightToLeft', title: 'Vertical (Right to Left)', value: 'vertical-rl', html: true },
];

export function writingDirectionOf(style: Style, html: boolean): string {
  const dir = style.textDirection ?? '';
  if (dir === 'rtl') return 'rightToLeft';
  if (dir === 'ltr') return 'leftToRight';
  if (dir === 'auto' || !html) return 'automatic';
  if (dir === 'vertical-lr') return 'vertical-leftToRight';
  if (dir === 'vertical-rl') return 'vertical-rightToLeft';
  return 'automatic';
}

/**
 * The font colour row: none also hides the label (noLabel=1), any colour
 * shows it again.
 */
export function fontColorChanges(color: string | null): StyleChanges {
  return [['fontColor', color], ['noLabel', color === 'none' ? '1' : null]];
}

/**
 * Fit Text to Shape is offered when every selected cell is a vertex whose
 * shape has a text flow outline (Graph.getShapeInsideOutline).
 */
export function supportsShapeInside(cells: readonly DiagramEl[]): boolean {
  return cells.length > 0 && cells.every((el) => el.type === 'vertex'
    && shapeInsideOutline(cellStyle(el), el.w / (el.scale || 1), el.h / (el.scale || 1)) != null);
}

/** The label background list: none, solid, or (edges) transparent, which cuts the label out of the line. */
export type LabelBackground = 'none' | 'solid' | 'transparent';

export function labelBackgroundOf(style: Style): LabelBackground {
  const color = style.labelBackgroundColor ?? 'none';
  const page = style.defaultLabelBackgroundColor === 'page' || style.defaultLabelBackgroundColor === 'gap';
  if (color === 'none') return 'none';
  return color === 'default' && page ? 'transparent' : 'solid';
}

export function labelBackgroundChanges(value: LabelBackground, current: string | null): StyleChanges {
  const bg = value === 'none' ? 'none' : value === 'solid' && current != null && current !== 'none' ? current : 'default';
  return [['labelBackgroundColor', bg], ['defaultLabelBackgroundColor', value === 'transparent' ? 'page' : null]];
}

/** A label colour picked from the swatch: solid, so the page gap is dropped. */
export function labelBackgroundColorChanges(color: string): StyleChanges {
  return [['labelBackgroundColor', color], ['defaultLabelBackgroundColor', null]];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Editor.convertHtmlToText, without a DOM: tags dropped, entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(div|p|li|h[1-6])>\s*/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\n+$/, '');
}

/** mxUtils.htmlEntities(text, false) with newlines as breaks, as draw.io's Formatted Text does. */
export function textToHtml(text: string, nl2Br = true): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return nl2Br ? escaped.replace(/\n/g, '<br/>') : escaped;
}

/**
 * The formattedText action for one cell: switching html on escapes the
 * plain label (newlines become breaks); switching it off turns the HTML into
 * the text it showed (breaks become newlines).
 */
export function setFormattedText(el: DiagramEl, on: boolean): void {
  const style = cellStyle(el);
  const html = style.html === '1';
  const nl2Br = style.nl2Br !== '0';
  if (html && !on) {
    let label = el.label;
    if (nl2Br) label = label.replace(/\n/g, '').replace(/<br\s*.?>/g, '\n');
    el.label = htmlToText(label);
    el.dio = setStyleValue(el.dio, 'html', null);
  } else if (!html && on) {
    el.label = textToHtml(el.label, nl2Br);
    el.dio = setStyleValue(el.dio, 'html', '1');
  }
}

// --- Copy Style / Paste Style / Set as Default Style ------------------------------

/** Graph.textStyles. */
export const TEXT_STYLES = ['fontFamily', 'fontSource', 'fontSize', 'fontColor', 'fontStyle',
  'textOpacity', 'labelBorderColor', 'labelBorderWidth', 'labelBackgroundColor',
  'defaultLabelBackgroundColor', 'labelPadding', 'autosize', 'resizable', 'horizontal',
  'textDirection', 'autosizeText'];

/** Graph.sharedTextStyles. */
export const SHARED_TEXT_STYLES = ['fontFamily', 'fontSource', 'fontSize', 'fontColor'];

/** Graph.edgeStyles: never pasted onto vertices. */
export const EDGE_STYLE_KEYS = ['edgeStyle', 'elbow', 'jumpStyle', 'jumpSize', 'startArrow',
  'startFill', 'startSize', 'endArrow', 'endFill', 'endSize', 'flowAnimation',
  'flowAnimationDirection', 'flowAnimationTimingFunction', 'flowAnimationDuration',
  'flowAnimationType', 'flowAnimationSize', 'flowAnimationCount', 'flowAnimationLoop',
  'sourcePerimeterSpacing', 'targetPerimeterSpacing', 'fixedPointSpacing', 'curved',
  'curveGeometry', 'trimCurve', 'linecap', 'linejoin', 'libavoidRouting', 'libavoidSpacing',
  'followTerminals', 'labelPlacement'];

/** Graph.cellStyleGroups: keys a cell's own style keeps together. */
export const CELL_STYLE_GROUPS = [
  ['startArrow', 'startFill', 'endArrow', 'endFill'],
  ['startSize', 'endSize'],
  ['sourcePerimeterSpacing', 'targetPerimeterSpacing', 'fixedPointSpacing'],
  ['fillColor', 'gradientColor', 'gradientDirection'],
  ['rounded', 'roundedPerimeter'],
  ['opacity', 'opacityGroup'],
];

/** Graph.cellStyles: the keys Copy Style, Paste Style and the default styles carry. */
export const CELL_STYLES: readonly string[] = (() => {
  const out: string[] = [];
  const add = (keys: readonly string[]) => { for (const k of keys) if (!out.includes(k)) out.push(k); };
  add(['rounded', 'shadow', 'glass', 'dashed', 'dashPattern', 'comic', 'sketch', 'fillWeight',
    'hachureGap', 'hachureAngle', 'jiggle', 'disableMultiStroke', 'disableMultiStrokeFill',
    'fillStyle', 'curveFitting', 'simplification', 'sketchStyle', 'pointerEvents', 'opacity',
    'strokeColor', 'strokeWidth', 'align', 'verticalAlign', 'spacingLeft', 'spacingRight',
    'spacingTop', 'spacingBottom', 'spacing', 'arcSize', 'absoluteArcSize', 'comicStyle',
    'swimlaneFillColor', 'shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowColor',
    'shadowOpacity', 'multiple', 'multipleCount', 'multipleDx', 'multipleDy']);
  add(TEXT_STYLES);
  add(EDGE_STYLE_KEYS);
  for (const group of CELL_STYLE_GROUPS) add(group);
  return Object.freeze(out);
})();

/** A copied style: draw.io's style object, the keys Graph.cellStyles names (and an edge's shape). */
export type CopiedStyle = Record<string, string>;

/**
 * Copy Style (Graph.copyCellStyles into one object): every Graph.cellStyles
 * key of the cell's drawn style, an edge's shape too; a stroke of none is
 * not copied.
 */
export function copyCellStyle(el: DiagramEl): CopiedStyle {
  const style = cellStyle(el);
  const out: CopiedStyle = {};
  for (const [key, value] of Object.entries(style)) {
    if (key === 'strokeColor' && (value == null || value === 'none')) continue;
    if (CELL_STYLES.includes(key) || (key === 'shape' && el.type === 'connector')) out[key] = value;
  }
  return out;
}

function isTextCell(dio: string): boolean {
  const names = styleNames(dio);
  return names.includes('text');
}

/**
 * Graph.pasteCellStyles for one cell. `force` (Paste Style) writes every key
 * the copy has and removes the ones it lacks; without it (a new cell taking
 * the default style) the keys the cell's own style already sets, and the
 * keys grouped with them, are left alone. Edge styles never go onto
 * vertices; `edgeStyle` itself only with `pasteEdgeStyle` (a default style
 * set from an edge). Text cells (`text`) only take the text styles.
 */
export function pasteCellStyle(
  dio: string,
  kind: CellKind,
  copied: CopiedStyle,
  options: { force?: boolean; pasteEdgeStyle?: boolean } = {},
): string {
  const force = options.force === true;
  let applied: string[] = isTextCell(dio) ? [...TEXT_STYLES] : [...CELL_STYLES];
  if (!force && !isTextCell(dio)) {
    for (const entry of parseStyleString(dio)) {
      if (entry.key == null) continue;
      const key = entry.key;
      applied = applied.filter((k) => k !== key);
      for (const group of CELL_STYLE_GROUPS) {
        if (group.includes(key)) applied = applied.filter((k) => !group.includes(k));
      }
    }
  }
  const edge = kind === 'edge';
  let next = dio;
  for (const key of applied) {
    if (key === 'edgeStyle' && !options.pasteEdgeStyle) continue;
    if (!edge && EDGE_STYLE_KEYS.includes(key)) continue;
    const value = Object.prototype.hasOwnProperty.call(copied, key) ? copied[key] : undefined;
    if (value != null) {
      next = setStyleValue(next, key, value);
      if (key === 'fontFamily' && copied.fontSource == null) next = setStyleValue(next, 'fontSource', null);
      if (edge && key === 'rounded' && value === '1' && copied.curved == null) next = setStyleValue(next, 'curved', null);
    } else if (force) {
      next = setStyleValue(next, key, null);
    }
  }
  return next;
}

/** Paste Style onto a cell (one undo step is the caller's). */
export function pasteStyleInto(el: DiagramEl, copied: CopiedStyle): void {
  el.dio = pasteCellStyle(el.dio, kindOf(el), copied, { force: true });
  if (el.type === 'vertex') syncRotation(el);
}

/** What Set as Default Style keeps for the cell's kind (EditorUi.setDefaultStyle). */
export interface DefaultStyleRecord {
  kind: CellKind;
  style: CopiedStyle;
}

export function defaultStyleRecord(el: DiagramEl): DefaultStyleRecord {
  const style = copyCellStyle(el);
  if (el.type === 'vertex') delete style.shape;
  return { kind: kindOf(el), style };
}

/**
 * A new cell's style with the default style pasted on (Graph.pasteCellStyles
 * without force): keys the new cell already sets win. A default set from an
 * edge carries its edge style too (pasteEdgeStyle).
 */
export function applyDefaultStyle(base: string, kind: CellKind, record: DefaultStyleRecord | null): string {
  if (!record || record.kind !== kind) return base;
  return pasteCellStyle(base, kind, record.style, { pasteEdgeStyle: kind === 'edge' });
}

/**
 * Graph.createCurrentEdgeStyle: the style a new connector starts from when a
 * default edge style was set (its routing, shape, line style and sketch
 * keys), before the rest of the default is pasted on.
 */
export function currentEdgeStyle(record: DefaultStyleRecord): string {
  const cur = record.style;
  let style = `edgeStyle=${cur.edgeStyle ?? 'none'};`;
  for (const key of ['shape', 'curved', 'rounded', 'comic', 'sketch', 'fillWeight', 'hachureGap',
    'hachureAngle', 'jiggle', 'disableMultiStroke', 'disableMultiStrokeFill', 'fillStyle',
    'curveFitting', 'simplification', 'comicStyle', 'jumpStyle', 'jumpSize', 'libavoidRouting', 'libavoidSpacing']) {
    if (cur[key] != null) style += `${key}=${cur[key]};`;
  }
  if (cur.curved === '1') style += 'curveGeometry=1;';
  style += `orthogonalLoop=${cur.orthogonalLoop ?? '1'};`;
  style += `jettySize=${cur.jettySize ?? 'auto'};`;
  if (cur.edgeStyle === 'elbowEdgeStyle' && cur.elbow != null) style += `elbow=${cur.elbow};`;
  style += `html=${cur.html ?? '1'};`;
  return style;
}

/** Where Set as Default Style is remembered between sessions. */
export const DEFAULT_STYLE_STORAGE_KEY = 'deckwerk.diagram.defaultStyles';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function readDefaults(): Partial<Record<CellKind, DefaultStyleRecord>> {
  try {
    const raw = storage()?.getItem(DEFAULT_STYLE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<CellKind, DefaultStyleRecord>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDefaults(value: Partial<Record<CellKind, DefaultStyleRecord>>): void {
  try {
    const s = storage();
    if (!s) return;
    if (!value.vertex && !value.edge) s.removeItem(DEFAULT_STYLE_STORAGE_KEY);
    else s.setItem(DEFAULT_STYLE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private windows and full storage: the default simply is not kept.
  }
}

/** Set as Default Style: new shapes (or connectors) of the cell's kind take its style. */
export function storeDefaultStyle(el: DiagramEl): DefaultStyleRecord {
  const record = defaultStyleRecord(el);
  writeDefaults({ ...readDefaults(), [record.kind]: record });
  return record;
}

/** Clear Default Style for one kind, or both. */
export function clearDefaultStyle(kind?: CellKind): void {
  if (!kind) {
    writeDefaults({});
    return;
  }
  const current = readDefaults();
  delete current[kind];
  writeDefaults(current);
}

export function storedDefaultStyle(kind: CellKind): DefaultStyleRecord | null {
  const record = readDefaults()[kind];
  return record && typeof record.style === 'object' ? record : null;
}

/** The style for a new rectangle: insert.ts's default with Set as Default Style applied. */
export function defaultVertexStyle(base: string = DEFAULT_VERTEX_STYLE): string {
  return applyDefaultStyle(base, 'vertex', storedDefaultStyle('vertex'));
}

/**
 * The style for a new connector: insert.ts's default, or with Set as Default
 * Style the stored edge's routing and look (Graph.createCurrentEdgeStyle and
 * pasteCellStyles). A `base` (a library connector) keeps its own keys.
 */
export function defaultEdgeStyle(base?: string): string {
  const record = storedDefaultStyle('edge');
  if (!record) return base ?? DEFAULT_EDGE_STYLE;
  return applyDefaultStyle(base ?? currentEdgeStyle(record), 'edge', record);
}

// --- Property list -------------------------------------------------------------

export type PropertyType = 'bool' | 'int' | 'float' | 'enum' | 'color' | 'string' | 'numbers' | 'separator';

export interface PropertyContext {
  style: Style;
  vertices: number;
  edges: number;
}

/** One row of draw.io's Property list (a shape's customProperties or the common ones). */
export interface PropertyDef {
  name: string;
  dispName: string;
  type: PropertyType;
  defVal?: string | number | boolean | null;
  min?: number;
  max?: number;
  /** `val` null removes the key. */
  enumList?: ReadonlyArray<{ val: string | null; dispName: string }>;
  /** jettySize: an empty value means auto. */
  allowAuto?: boolean;
  /** Shown in the Fill/Effects rows instead of the list (draw.io's `primary`). */
  primary?: boolean;
  isVisible?: (ctx: PropertyContext) => boolean;
  getDefaultValue?: (ctx: PropertyContext) => string | number | boolean | null;
}

const LINE_ARCSIZE = 20;
const sketchOn = (c: PropertyContext) => c.style.sketch === '1';
const roundedPerimeter: PropertyDef = {
  name: 'roundedPerimeter', dispName: 'Rounded Perimeter', type: 'bool', defVal: false,
  isVisible: (c) => c.style.rounded === '1',
};
const DIRECTIONS = [{ val: 'none', dispName: 'None' }, { val: 'north', dispName: 'North' }, { val: 'east', dispName: 'East' },
  { val: 'south', dispName: 'South' }, { val: 'west', dispName: 'West' }, { val: 'northsouth', dispName: 'North + South' },
  { val: 'eastwest', dispName: 'East + West' }];
const shadowOn = (c: PropertyContext) => c.style.shadow === '1' || c.style.textShadow === '1';
const flowOn = (c: PropertyContext) => c.style.flowAnimation === '1';
const flowRings = (c: PropertyContext) => flowOn(c) && (c.style.flowAnimationType === 'ring' || c.style.flowAnimationType === 'dot');

/** Editor.commonProperties. */
const COMMON_PROPERTIES: PropertyDef[] = [
  { name: 'enumerate', dispName: 'Enumerate', type: 'bool', defVal: false },
  { name: 'enumerateValue', dispName: 'Enumerate Value', type: 'string', defVal: '', isVisible: (c) => c.style.enumerate === '1' },
  { name: 'comic', dispName: 'Comic', type: 'bool', defVal: false, isVisible: (c) => c.style.sketch !== '1' },
  { name: 'jiggle', dispName: 'Jiggle', type: 'float', min: 0, defVal: 1, isVisible: (c) => c.style.comic === '1' || sketchOn(c) },
  { name: 'fillWeight', dispName: 'Fill Weight', type: 'int', defVal: -1, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'hachureGap', dispName: 'Hachure Gap', type: 'int', defVal: -1, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'hachureAngle', dispName: 'Hachure Angle', type: 'int', defVal: -41, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'curveFitting', dispName: 'Curve Fitting', type: 'float', defVal: 0.95, isVisible: sketchOn },
  { name: 'simplification', dispName: 'Simplification', type: 'float', defVal: 0, min: 0, max: 1, isVisible: sketchOn },
  { name: 'disableMultiStroke', dispName: 'Disable Multi Stroke', type: 'bool', defVal: false, isVisible: sketchOn },
  { name: 'disableMultiStrokeFill', dispName: 'Disable Multi Stroke Fill', type: 'bool', defVal: false, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'dashOffset', dispName: 'Dash Offset', type: 'int', defVal: -1, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'dashGap', dispName: 'Dash Gap', type: 'int', defVal: -1, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'zigzagOffset', dispName: 'Zigzag Offset', type: 'int', defVal: -1, isVisible: (c) => sketchOn(c) && c.vertices > 0 },
  { name: 'sketchStyle', dispName: 'Sketch Style', type: 'enum', defVal: 'rough', enumList: [{ val: 'rough', dispName: 'Rough' }, { val: 'comic', dispName: 'Comic' }], isVisible: sketchOn },
  { name: 'shadowColor', dispName: 'Shadow Color', type: 'color', getDefaultValue: () => '#000000', isVisible: shadowOn },
  { name: 'shadowOpacity', dispName: 'Shadow Opacity', type: 'int', min: 0, max: 100, getDefaultValue: () => 25, isVisible: shadowOn },
  { name: 'shadowOffsetX', dispName: 'Shadow Offset X', type: 'int', getDefaultValue: () => 2, isVisible: shadowOn },
  { name: 'shadowOffsetY', dispName: 'Shadow Offset Y', type: 'int', getDefaultValue: () => 3, isVisible: shadowOn },
  { name: 'shadowBlur', dispName: 'Shadow Blur', type: 'int', min: 0, getDefaultValue: () => 2, isVisible: shadowOn },
  { name: 'linecap', dispName: 'Line Cap', type: 'enum', defVal: null, enumList: [{ val: null, dispName: 'Flat' }, { val: 'round', dispName: 'Round' }, { val: 'square', dispName: 'Square' }] },
  { name: 'linejoin', dispName: 'Line Join', type: 'enum', defVal: null, enumList: [{ val: null, dispName: 'Miter' }, { val: 'arcs', dispName: 'Arcs' }, { val: 'bevel', dispName: 'Bevel' }, { val: 'miter-clip', dispName: 'Miter-Clip' }, { val: 'round', dispName: 'Round' }] },
  { name: 'miterlimit', dispName: 'Miter Limit', type: 'int', min: 1, defVal: 4, isVisible: (c) => (c.style.linejoin ?? 'miter') === 'miter' || c.style.linejoin === 'miter-clip' },
];

/** Editor.commonEdgeProperties (the ones that do not need draw.io's graph). */
const COMMON_EDGE_PROPERTIES: PropertyDef[] = [
  { name: 'arcSize', dispName: 'Arc Size', type: 'float', min: 0, defVal: LINE_ARCSIZE },
  { name: 'bezier', dispName: 'Bezier', type: 'bool', defVal: false, isVisible: (c) => c.style.curved === '1' },
  { name: 'trimCurve', dispName: 'Trim Curve', type: 'bool', defVal: false, isVisible: (c) => (c.style.curved === '1' || c.style.bezier === '1') && ['connector', 'filledEdge', 'wire', 'pipe'].includes(c.style.shape ?? 'connector') },
  { name: 'sourcePortConstraint', dispName: 'Source Constraint', type: 'enum', defVal: 'none', enumList: DIRECTIONS },
  { name: 'targetPortConstraint', dispName: 'Target Constraint', type: 'enum', defVal: 'none', enumList: DIRECTIONS },
  { name: 'jettySize', dispName: 'Jetty Size', type: 'int', min: 0, defVal: 'auto', allowAuto: true, isVisible: (c) => c.style.edgeStyle === 'orthogonalEdgeStyle' },
  { name: 'segment', dispName: 'Segment Size', type: 'int', min: 0, defVal: 30, isVisible: (c) => c.style.edgeStyle === 'entityRelationEdgeStyle' },
  { name: 'fillOpacity', dispName: 'Fill Opacity', type: 'int', min: 0, max: 100, defVal: 100 },
  { name: 'strokeOpacity', dispName: 'Stroke Opacity', type: 'int', min: 0, max: 100, defVal: 100 },
  { name: 'startFill', dispName: 'Start Fill', type: 'bool', defVal: true },
  { name: 'startFillColor', dispName: 'Start Fill Color', type: 'color', defVal: null },
  { name: 'startStrokeColor', dispName: 'Start Stroke Color', type: 'color', defVal: null },
  { name: 'endFill', dispName: 'End Fill', type: 'bool', defVal: true },
  { name: 'endFillColor', dispName: 'End Fill Color', type: 'color', defVal: null },
  { name: 'endStrokeColor', dispName: 'End Stroke Color', type: 'color', defVal: null },
  { name: 'perimeterSpacing', dispName: 'Terminal Spacing', type: 'float', defVal: 0 },
  { name: 'anchorPointDirection', dispName: 'Anchor Direction', type: 'bool', defVal: true },
  { name: 'snapToPoint', dispName: 'Snap to Point', type: 'bool', defVal: false },
  { name: 'fixedPointSpacing', dispName: 'Fixed Point Spacing', type: 'bool', defVal: false },
  { name: 'dashPattern', dispName: 'Dash Pattern', type: 'numbers', defVal: '' },
  { name: 'fixDash', dispName: 'Fixed Dash', type: 'bool', defVal: false },
  { name: 'flowAnimationType', dispName: 'Flow Type', type: 'enum', defVal: 'dash', enumList: [{ val: 'dash', dispName: 'Dashes' }, { val: 'ring', dispName: 'Ring' }, { val: 'dot', dispName: 'Dot' }], isVisible: flowOn },
  { name: 'flowAnimationDuration', dispName: 'Flow Duration', type: 'int', getDefaultValue: (c) => (flowRings(c) ? 1500 : 500), isVisible: flowOn },
  { name: 'flowAnimationSize', dispName: 'Flow Size', type: 'float', min: 0, getDefaultValue: (c) => { const sw = parseFloat(c.style.strokeWidth ?? '1') || 1; return c.style.flowAnimationType === 'dot' ? Math.max(4, 3 * sw) : Math.max(6, 4 * sw); }, isVisible: flowRings },
  { name: 'flowAnimationCount', dispName: 'Flow Count', type: 'int', min: 1, max: 100, defVal: 1, isVisible: flowRings },
  { name: 'flowAnimationLoop', dispName: 'Flow Loop', type: 'bool', defVal: true, isVisible: flowRings },
  { name: 'flowAnimationTimingFunction', dispName: 'Flow Timing', type: 'enum', defVal: 'linear', enumList: [{ val: 'linear', dispName: 'Linear' }, { val: 'ease', dispName: 'Ease' }, { val: 'ease-in', dispName: 'Ease-in' }, { val: 'ease-out', dispName: 'Ease-out' }, { val: 'ease-in-out', dispName: 'Ease-in-out' }], isVisible: flowOn },
  { name: 'flowAnimationDirection', dispName: 'Flow Direction', type: 'enum', defVal: 'normal', enumList: [{ val: 'normal', dispName: 'Normal' }, { val: 'reverse', dispName: 'Reverse' }, { val: 'alternate', dispName: 'Alternate' }, { val: 'alternate-reverse', dispName: 'Alternate-Reverse' }], isVisible: flowOn },
  { name: 'editable', dispName: 'Editable', type: 'bool', defVal: true },
  { name: 'backgroundOutline', dispName: 'Background Outline', type: 'bool', defVal: false },
  { name: 'bendable', dispName: 'Bendable', type: 'bool', defVal: true },
  { name: 'movable', dispName: 'Movable', type: 'bool', defVal: true },
  { name: 'cloneable', dispName: 'Cloneable', type: 'bool', defVal: true },
  { name: 'deletable', dispName: 'Deletable', type: 'bool', defVal: true },
  { name: 'noJump', dispName: 'No Jumps', type: 'bool', defVal: false },
  { name: 'jumpLayers', dispName: 'Jump Other Layers', type: 'bool', defVal: true },
  { name: 'ignoreEdge', dispName: 'Ignore Edge', type: 'bool', defVal: false },
  { name: 'orthogonalLoop', dispName: 'Loop Routing', type: 'bool', defVal: false },
  {
    name: 'orthogonal', dispName: 'Orthogonal Ends', type: 'bool', defVal: false,
    isVisible: (c) => !['orthogonalEdgeStyle', 'elbowEdgeStyle', 'segmentEdgeStyle', 'sideToSideEdgeStyle', 'topToBottomEdgeStyle', 'isometricEdgeStyle'].includes(c.style.edgeStyle ?? ''),
  },
  ...COMMON_PROPERTIES,
];

/** Editor.commonVertexProperties (the ones that do not need draw.io's graph). */
const COMMON_VERTEX_PROPERTIES: PropertyDef[] = [
  { name: 'fillOpacity', dispName: 'Fill Opacity', type: 'int', min: 0, max: 100, defVal: 100 },
  { name: 'strokeOpacity', dispName: 'Stroke Opacity', type: 'int', min: 0, max: 100, defVal: 100 },
  { name: 'multipleCount', dispName: 'Multiple Count', type: 'int', min: 1, max: 100, getDefaultValue: () => 3, isVisible: (c) => c.style.multiple === '1' },
  { name: 'multipleDx', dispName: 'Multiple Offset X', type: 'float', getDefaultValue: () => 10, isVisible: (c) => c.style.multiple === '1' },
  { name: 'multipleDy', dispName: 'Multiple Offset Y', type: 'float', getDefaultValue: () => -10, isVisible: (c) => c.style.multiple === '1' },
  { name: 'overflow', dispName: 'Text Overflow', defVal: 'visible', type: 'enum', enumList: [{ val: 'visible', dispName: 'Visible' }, { val: 'hidden', dispName: 'Hidden' }, { val: 'block', dispName: 'Block' }, { val: 'fill', dispName: 'Fill' }, { val: 'width', dispName: 'Width' }] },
  {
    name: 'shapeInsideShape', dispName: 'Text Flow Shape', type: 'enum', defVal: null,
    enumList: [{ val: null, dispName: 'Automatic' }, { val: 'dataStorage', dispName: 'Data Storage' }, { val: 'ellipse', dispName: 'Ellipse' }, { val: 'hexagon', dispName: 'Hexagon' }, { val: 'or', dispName: 'Or' }, { val: 'parallelogram', dispName: 'Parallelogram' }, { val: 'rhombus', dispName: 'Rhombus' }, { val: 'step', dispName: 'Step' }, { val: 'trapezoid', dispName: 'Trapezoid' }, { val: 'triangle', dispName: 'Triangle' }, { val: 'xor', dispName: 'Xor' }],
  },
  { name: 'shapeInsidePadding', dispName: 'Text Flow Padding', type: 'float', min: 0, defVal: 2 },
  { name: 'noLabel', dispName: 'Hide Label', type: 'bool', defVal: false },
  { name: 'direction', dispName: 'Direction', type: 'enum', defVal: 'east', enumList: [{ val: 'north', dispName: 'North' }, { val: 'east', dispName: 'East' }, { val: 'south', dispName: 'South' }, { val: 'west', dispName: 'West' }] },
  { name: 'portConstraint', dispName: 'Constraint', type: 'enum', defVal: 'none', enumList: DIRECTIONS },
  { name: 'portConstraintRotation', dispName: 'Rotate Constraint', type: 'bool', defVal: false },
  { name: 'connectable', dispName: 'Connectable', type: 'bool', defVal: true, isVisible: (c) => c.vertices > 0 && c.edges === 0 },
  { name: 'allowArrows', dispName: 'Allow Arrows', type: 'bool', defVal: true },
  { name: 'snapToPoint', dispName: 'Snap to Point', type: 'bool', defVal: false },
  { name: 'outlineConnect', dispName: 'Outline Connect', defVal: '1', type: 'enum', enumList: [{ val: '1', dispName: 'Default' }, { val: '0', dispName: 'Delayed' }, { val: '2', dispName: 'Always' }, { val: '3', dispName: 'Never' }] },
  {
    name: 'perimeter', dispName: 'Perimeter', defVal: 'none', type: 'enum',
    enumList: [{ val: 'none', dispName: 'None' }, { val: 'rectanglePerimeter', dispName: 'Rectangle' }, { val: 'ellipsePerimeter', dispName: 'Ellipse' },
      { val: 'rhombusPerimeter', dispName: 'Rhombus' }, { val: 'trianglePerimeter', dispName: 'Triangle' }, { val: 'hexagonPerimeter2', dispName: 'Hexagon' },
      { val: 'lifelinePerimeter', dispName: 'Lifeline' }, { val: 'orthogonalPerimeter', dispName: 'Orthogonal' }, { val: 'backbonePerimeter', dispName: 'Backbone' },
      { val: 'calloutPerimeter', dispName: 'Callout' }, { val: 'parallelogramPerimeter', dispName: 'Parallelogram' }, { val: 'trapezoidPerimeter', dispName: 'Trapezoid' },
      { val: 'stepPerimeter', dispName: 'Step' }, { val: 'centerPerimeter', dispName: 'Center' }, { val: 'cloudPerimeter', dispName: 'Cloud' }, { val: 'outlinePerimeter', dispName: 'Outline' }],
  },
  {
    name: 'labelPerimeter', dispName: 'Label Perimeter', type: 'bool', defVal: false,
    isVisible: (c) => c.vertices > 0 && c.edges === 0 && isLabelOutsideOnSide(c.style.labelPosition ?? 'center', c.style.verticalLabelPosition ?? 'middle'),
  },
  { name: 'fixDash', dispName: 'Fixed Dash', type: 'bool', defVal: false },
  { name: 'container', dispName: 'Container', type: 'bool', defVal: false, isVisible: (c) => c.vertices > 0 && c.edges === 0 },
  { name: 'expand', dispName: 'Expand', type: 'bool', defVal: true },
  { name: 'contract', dispName: 'Contract', type: 'bool', defVal: false },
  { name: 'editable', dispName: 'Editable', type: 'bool', defVal: true },
  { name: 'backgroundOutline', dispName: 'Background Outline', type: 'bool', defVal: false },
  { name: 'movable', dispName: 'Movable', type: 'bool', defVal: true },
  { name: 'autosize', dispName: 'Autosize', type: 'bool', defVal: false },
  { name: 'fixedWidth', dispName: 'Fixed Width', type: 'bool', defVal: false },
  { name: 'resizable', dispName: 'Resizable', type: 'bool', defVal: true },
  { name: 'resizeWidth', dispName: 'Resize Width', type: 'bool', defVal: false },
  { name: 'resizeHeight', dispName: 'Resize Height', type: 'bool', defVal: false },
  { name: 'resizeCentered', dispName: 'Resize Centered', type: 'bool', defVal: false },
  { name: 'rotatable', dispName: 'Rotatable', type: 'bool', defVal: true },
  { name: 'cloneable', dispName: 'Cloneable', type: 'bool', defVal: true },
  { name: 'deletable', dispName: 'Deletable', type: 'bool', defVal: true },
  { name: 'pointerEvents', dispName: 'Pointer Events', type: 'bool', defVal: true },
  ...COMMON_PROPERTIES,
];

const footerColor: PropertyDef = { name: 'footerColor', dispName: 'Footer Color', type: 'color', defVal: null, primary: true, isVisible: (c) => parseFloat(c.style.footerSize ?? '0') > 0 };
const slopeAngle = (fraction: number, absolute: number): PropertyDef[] => [
  { name: 'size', dispName: 'Slope Angle', type: 'float', min: 0, max: 1, defVal: fraction, isVisible: (c) => (c.style.fixedSize ?? '0') === '0' },
  { name: 'size', dispName: 'Slope Angle', type: 'float', min: 0, defVal: absolute, isVisible: (c) => (c.style.fixedSize ?? '0') === '1' },
];
const arcSize = (defVal = LINE_ARCSIZE, max?: number): PropertyDef => ({ name: 'arcSize', dispName: 'Arc Size', type: 'float', min: 0, defVal, ...(max != null ? { max } : {}) });
const bounded: PropertyDef = { name: 'boundedLbl', dispName: 'Bounded Label', type: 'bool', defVal: false };
const partialRectangle: PropertyDef[] = [
  { name: 'top', dispName: 'Top Line', type: 'bool', defVal: true },
  { name: 'bottom', dispName: 'Bottom Line', type: 'bool', defVal: true },
  { name: 'left', dispName: 'Left Line', type: 'bool', defVal: true },
  { name: 'right', dispName: 'Right Line', type: 'bool', defVal: true },
];
const swimlane: PropertyDef[] = [
  arcSize(15),
  { name: 'absoluteArcSize', dispName: 'Abs. Arc Size', type: 'bool', defVal: false },
  { name: 'startSize', dispName: 'Header Size', type: 'float' },
  { name: 'footerSize', dispName: 'Footer Size', type: 'float', min: 0, defVal: 0 },
  { name: 'swimlaneHead', dispName: 'Head Border', type: 'bool', defVal: true },
  { name: 'swimlaneBody', dispName: 'Body Border', type: 'bool', defVal: true },
  { name: 'horizontal', dispName: 'Horizontal', type: 'bool', defVal: true },
  { name: 'separatorColor', dispName: 'Separator Color', type: 'color', defVal: null },
  { name: 'fixedHeader', dispName: 'Fixed Header', type: 'bool', defVal: true },
];
const twoWidths: PropertyDef[] = [
  { name: 'dx', dispName: 'Width1', type: 'float', min: 0, defVal: 20 },
  { name: 'dy', dispName: 'Width2', type: 'float', min: 0, defVal: 20 },
];
const arrowShape: PropertyDef[] = [
  { name: 'arrowWidth', dispName: 'Arrow Width', type: 'float', min: 0, max: 1, defVal: 0.3 },
  { name: 'arrowSize', dispName: 'Arrowhead Length', type: 'float', min: 0, max: 1, defVal: 0.2 },
];

/** The shapes' customProperties (Editor.js and Shapes.js), by shape name. */
export const SHAPE_PROPERTIES: Readonly<Record<string, readonly PropertyDef[]>> = {
  rectangle: [arcSize(), { name: 'absoluteArcSize', dispName: 'Abs. Arc Size', type: 'bool', defVal: false }, roundedPerimeter, { name: 'footerSize', dispName: 'Footer Size', type: 'float', min: 0, defVal: 0 }, footerColor],
  ellipse: [{ name: 'centerRadius', dispName: 'Center Radius', type: 'float', min: 0, defVal: 0 }, { name: 'centerColor', dispName: 'Center Color', type: 'color', defVal: null, primary: true, isVisible: (c) => parseFloat(c.style.centerRadius ?? '0') > 0 }],
  link: [{ name: 'width', dispName: 'Width', type: 'float', min: 0, defVal: 4 }],
  zigzag: [{ name: 'size', dispName: 'Size', type: 'float', min: 5, defVal: 20 }],
  flexArrow: [{ name: 'width', dispName: 'Width', type: 'float', min: 0, defVal: 10 }, { name: 'startWidth', dispName: 'Start Width', type: 'float', min: 0, defVal: 20 }, { name: 'endWidth', dispName: 'End Width', type: 'float', min: 0, defVal: 20 }],
  taperedArrow: [{ name: 'startWidth', dispName: 'Start Width', type: 'float', min: 0, defVal: 20 }, { name: 'endWidth', dispName: 'End Width', type: 'float', min: 0, defVal: 2 }],
  process: [{ name: 'size', dispName: 'Indent', type: 'float', min: 0, max: 0.5, defVal: 0.1 }, roundedPerimeter],
  rhombus: [arcSize(LINE_ARCSIZE, 50), roundedPerimeter, { name: 'double', dispName: 'Double', type: 'bool', defVal: false }],
  partialRectangle,
  parallelogram: [arcSize(), roundedPerimeter, ...slopeAngle(0.2, 20)],
  hexagon: [arcSize(), roundedPerimeter, ...slopeAngle(0.25, 25)],
  triangle: [arcSize(), roundedPerimeter],
  document: [{ name: 'size', dispName: 'Size', type: 'float', defVal: 0.3, min: 0, max: 1 }, arcSize(), bounded],
  internalStorage: [arcSize(), roundedPerimeter, { name: 'dx', dispName: 'Left Line', type: 'float', min: 0, defVal: 20 }, { name: 'dy', dispName: 'Top Line', type: 'float', min: 0, defVal: 20 }],
  cube: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, defVal: 20 }, { name: 'darkOpacity', dispName: 'Dark Opacity', type: 'float', min: -1, max: 1, defVal: 0 }, { name: 'darkOpacity2', dispName: 'Dark Opacity 2', type: 'float', min: -1, max: 1, defVal: 0 }, bounded],
  cylinder: [bounded],
  cylinder3: [bounded],
  umlState: [bounded],
  step: [arcSize(), roundedPerimeter, { name: 'size', dispName: 'Notch Size', type: 'float', min: 0, defVal: 20 }, { name: 'fixedSize', dispName: 'Fixed Size', type: 'bool', defVal: true }],
  trapezoid: [arcSize(), roundedPerimeter, { name: 'size', dispName: 'Slope Angle', type: 'float', min: 0, max: 1, defVal: 0.2 }],
  tape: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, max: 1, defVal: 0.4 }, arcSize(), bounded],
  note: [{ name: 'size', dispName: 'Fold Size', type: 'float', min: 0, defVal: 30 }, { name: 'darkOpacity', dispName: 'Dark Opacity', type: 'float', min: -1, max: 1, defVal: 0 }],
  note2: [bounded],
  card: [arcSize(), { name: 'size', dispName: 'Cutoff Size', type: 'float', min: 0, defVal: 30 }],
  callout: [arcSize(), { name: 'base', dispName: 'Callout Width', type: 'float', min: 0, defVal: 20 }, { name: 'size', dispName: 'Callout Length', type: 'float', min: 0, defVal: 30 }, { name: 'position', dispName: 'Callout Position', type: 'float', min: 0, max: 1, defVal: 0.5 }, { name: 'position2', dispName: 'Callout Tip Position', type: 'float', min: 0, max: 1, defVal: 0.5 }],
  wedgeCallout: [arcSize(), { name: 'tipX', dispName: 'Tip X', type: 'float', min: -100, max: 100, defVal: -0.25 }, { name: 'tipY', dispName: 'Tip Y', type: 'float', min: -100, max: 100, defVal: 1 }, { name: 'base', dispName: 'Callout Width', type: 'float', min: 0, defVal: 20 }],
  folder: [{ name: 'tabWidth', dispName: 'Tab Width', type: 'float' }, { name: 'tabHeight', dispName: 'Tab Height', type: 'float' }, { name: 'tabPosition', dispName: 'Tap Position', type: 'enum', enumList: [{ val: 'left', dispName: 'Left' }, { val: 'right', dispName: 'Right' }] }, bounded],
  swimlane,
  table: [
    { name: 'rowLines', dispName: 'Row Lines', type: 'bool', defVal: true }, { name: 'columnLines', dispName: 'Column Lines', type: 'bool', defVal: true },
    { name: 'fixedRows', dispName: 'Fixed Rows', type: 'bool', defVal: false }, { name: 'resizeLast', dispName: 'Resize Last Column', type: 'bool', defVal: false },
    { name: 'resizeLastRow', dispName: 'Resize Last Row', type: 'bool', defVal: false },
    { name: 'tableRender', dispName: 'Borders', type: 'enum', defVal: 'separate', enumList: [{ val: 'separate', dispName: 'Separate' }, { val: 'collapsed', dispName: 'Collapsed' }] },
    ...swimlane, ...partialRectangle],
  tableRow: [...swimlane, ...partialRectangle],
  doubleEllipse: [{ name: 'margin', dispName: 'Indent', type: 'float', min: 0, defVal: 4 }],
  ext: [arcSize(15), { name: 'double', dispName: 'Double', type: 'bool', defVal: false }, { name: 'margin', dispName: 'Indent', type: 'float', min: 0, defVal: 0 }],
  curlyBracket: [{ name: 'rounded', dispName: 'Rounded', type: 'bool', defVal: true }, { name: 'size', dispName: 'Size', type: 'float', min: 0, max: 1, defVal: 0.5 }],
  image: [{ name: 'imageAspect', dispName: 'Fixed Image Aspect', type: 'bool', defVal: true }],
  label: [
    { name: 'imageAspect', dispName: 'Fixed Image Aspect', type: 'bool', defVal: true },
    { name: 'imageAlign', dispName: 'Image Align', type: 'enum', enumList: [{ val: 'left', dispName: 'Left' }, { val: 'center', dispName: 'Center' }, { val: 'right', dispName: 'Right' }], defVal: 'left' },
    { name: 'imageVerticalAlign', dispName: 'Image Vertical Align', type: 'enum', enumList: [{ val: 'top', dispName: 'Top' }, { val: 'middle', dispName: 'Middle' }, { val: 'bottom', dispName: 'Bottom' }], defVal: 'middle' },
    { name: 'imageWidth', dispName: 'Image Width', type: 'float', min: 0, defVal: 24 },
    { name: 'imageHeight', dispName: 'Image Height', type: 'float', min: 0, defVal: 24 },
    arcSize(12),
    { name: 'absoluteArcSize', dispName: 'Abs. Arc Size', type: 'bool', defVal: false },
    roundedPerimeter,
    { name: 'footerSize', dispName: 'Footer Size', type: 'float', min: 0, defVal: 0 },
    footerColor,
  ],
  dataStorage: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, max: 1, defVal: 0.1 }, arcSize()],
  or: [arcSize()],
  xor: [arcSize()],
  manualInput: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, defVal: 30 }, arcSize(20), bounded],
  loopLimit: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, defVal: 20 }, arcSize(20)],
  offPageConnector: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, defVal: 38 }, arcSize(20)],
  display: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, max: 1, defVal: 0.25 }],
  singleArrow: arrowShape,
  doubleArrow: arrowShape,
  cross: [{ name: 'size', dispName: 'Size', type: 'float', min: 0, max: 1, defVal: 0.2 }],
  corner: twoWidths,
  tee: twoWidths,
  umlLifeline: [
    { name: 'participant', dispName: 'Participant', type: 'enum', defVal: 'none', enumList: [{ val: 'none', dispName: 'Default' }, { val: 'umlActor', dispName: 'Actor' }, { val: 'umlBoundary', dispName: 'Boundary' }, { val: 'umlEntity', dispName: 'Entity' }, { val: 'umlControl', dispName: 'Control' }] },
    { name: 'size', dispName: 'Height', type: 'float', defVal: 40, min: 0 },
    { name: 'lifelineMirror', dispName: 'Mirror Head', type: 'bool', defVal: false },
  ],
  umlFrame: [{ name: 'width', dispName: 'Title Width', type: 'float', defVal: 60, min: 0 }, { name: 'height', dispName: 'Title Height', type: 'float', defVal: 30, min: 0 }],
  'mxgraph.basic.rect': [
    { name: 'rectStyle', dispName: 'Style', type: 'enum', defVal: 'square', enumList: [{ val: 'square', dispName: 'Square' }, { val: 'rounded', dispName: 'Round' }, { val: 'snip', dispName: 'Snip' }, { val: 'invRound', dispName: 'Inv. Round' }, { val: 'fold', dispName: 'Fold' }] },
    { name: 'size', dispName: 'Corner Size', type: 'float', defVal: 10 },
    { name: 'absoluteCornerSize', dispName: 'Abs. Corner Size', type: 'bool', defVal: true },
    { name: 'indent', dispName: 'Indent', type: 'float', defVal: 2 },
    { name: 'rectOutline', dispName: 'Outline', type: 'enum', defVal: 'single', enumList: [{ val: 'single', dispName: 'Single' }, { val: 'double', dispName: 'Double' }, { val: 'frame', dispName: 'Frame' }] },
    { name: 'fillColor2', dispName: 'Inside Fill Color', type: 'color', defVal: 'none' },
    { name: 'gradientColor2', dispName: 'Inside Gradient Color', type: 'color', defVal: 'none' },
    { name: 'gradientDirection2', dispName: 'Inside Gradient Direction', type: 'enum', defVal: 'south', enumList: [{ val: 'south', dispName: 'South' }, { val: 'west', dispName: 'West' }, { val: 'north', dispName: 'North' }, { val: 'east', dispName: 'East' }] },
  ],
};

/**
 * The shape whose customProperties a style takes: its own name when it has a
 * list, the default vertex shape (a rectangle) for names DeckWerk cannot
 * paint, else none.
 */
function propertyShape(style: Style, kind: CellKind): string | null {
  const shape = style.shape ?? (kind === 'edge' ? 'connector' : 'label');
  if (Object.prototype.hasOwnProperty.call(SHAPE_PROPERTIES, shape)) return shape;
  if (kind === 'vertex' && getShapeClass(shape) == null) return 'rectangle';
  return null;
}

function cellPropertyList(el: DiagramEl): PropertyDef[] {
  const kind = kindOf(el);
  const shape = propertyShape(cellStyle(el), kind);
  const own = shape ? SHAPE_PROPERTIES[shape] : [];
  return [...own, ...(kind === 'vertex' ? COMMON_VERTEX_PROPERTIES : COMMON_EDGE_PROPERTIES)];
}

/**
 * EditorUi.findCommonProperties: the properties every selected cell has
 * (by name and type), a later entry of the same name replacing an earlier
 * one; then only the rows draw.io would show for the shared style.
 */
export function cellProperties(cells: readonly DiagramEl[]): PropertyDef[] {
  if (cells.length === 0) return [];
  const vertices = cells.filter((el) => el.type === 'vertex');
  const edges = cells.filter((el) => el.type === 'connector');
  const ordered = [...vertices, ...edges];
  const props = new Map<string, PropertyDef>();
  for (const prop of cellPropertyList(ordered[0])) props.set(prop.name, prop);
  for (const el of ordered.slice(1)) {
    const list = cellPropertyList(el);
    for (const [name, prop] of props) {
      if (!list.some((p) => p.name === name && p.type === prop.type)) props.delete(name);
    }
  }
  const ctx: PropertyContext = { style: commonStyle(cells), vertices: vertices.length, edges: edges.length };
  return [...props.values()].filter((p) => p.type !== 'separator' && (p.isVisible == null || p.isVisible(ctx)));
}

export function propertyContext(cells: readonly DiagramEl[]): PropertyContext {
  return {
    style: commonStyle(cells),
    vertices: cells.filter((el) => el.type === 'vertex').length,
    edges: cells.filter((el) => el.type === 'connector').length,
  };
}

/** What a property row shows: the style's value, else its default. */
export function propertyValue(prop: PropertyDef, cells: readonly DiagramEl[]): string | number | boolean | null | Mixed {
  const raw = sharedValue(cells, prop.name, null);
  if (raw === MIXED) return MIXED;
  if (raw != null) {
    if (prop.type === 'bool') return raw === '1' || raw === 'true';
    return raw;
  }
  const ctx = propertyContext(cells);
  const fallback = prop.getDefaultValue ? prop.getDefaultValue(ctx) : prop.defVal ?? null;
  if (prop.type === 'bool') return fallback === true || fallback === '1' || fallback === 1;
  return fallback;
}

/** The style change a property row makes for a typed or picked value. */
export function propertyChange(prop: PropertyDef, value: string | number | boolean | null): StyleChanges {
  if (prop.type === 'bool') return [[prop.name, value ? '1' : '0']];
  if (prop.type === 'int' || prop.type === 'float') {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return [[prop.name, prop.allowAuto ? 'auto' : 0]];
    if (prop.allowAuto && typeof value === 'string' && value.trim().toLowerCase() === 'auto') return [[prop.name, 'auto']];
    let n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n)) return [];
    if (prop.type === 'int') n = Math.round(n);
    if (prop.min != null) n = Math.max(prop.min, n);
    if (prop.max != null) n = Math.min(prop.max, n);
    return [[prop.name, n]];
  }
  if (prop.type === 'enum') return [[prop.name, value == null || value === '' ? null : String(value)]];
  if (value == null || value === '') return [[prop.name, null]];
  return [[prop.name, String(value)]];
}

// --- Arrange tab ---------------------------------------------------------------

/** A vertex's box in draw.io units: (slide px − origin) ÷ scale. */
export interface UnitBox { x: number; y: number; w: number; h: number }

export function unitBox(el: Pick<VertexEl, 'x' | 'y' | 'w' | 'h' | 'origin' | 'scale'>): UnitBox {
  const s = el.scale || 1;
  const o = el.origin ?? { x: 0, y: 0 };
  return { x: (el.x - o.x) / s, y: (el.y - o.y) / s, w: el.w / s, h: el.h / s };
}

/** Rounds to draw.io's two decimals for display. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * ArrangePanel.addGeometry: a new width or height in draw.io units, the
 * other side following when Constrain Proportions (aspect=fixed) is on.
 */
export function resizedBox(box: UnitBox, side: 'w' | 'h', value: number, constrain: boolean): UnitBox {
  const v = Math.max(1, value);
  const next = { ...box };
  if (side === 'w' && box.w > 0) {
    if (constrain) next.h = Math.round((box.h * v * 100) / box.w) / 100;
    next.w = v;
  } else if (side === 'h' && box.h > 0) {
    if (constrain) next.w = Math.round((box.w * v * 100) / box.h) / 100;
    next.h = v;
  }
  return next;
}

/** Writes a box in draw.io units back to slide pixels; returns how far the cell moved. */
export function setUnitBox(el: VertexEl, box: UnitBox): Point {
  const s = el.scale || 1;
  const o = el.origin ?? { x: 0, y: 0 };
  const x = o.x + box.x * s;
  const y = o.y + box.y * s;
  const moved = { x: x - el.x, y: y - el.y };
  el.x = x;
  el.y = y;
  el.w = Math.max(1, box.w * s);
  el.h = Math.max(1, box.h * s);
  return moved;
}

/**
 * The cells inside the given ones (by draw.io parent), which move with them
 * as children move with their parent in draw.io.
 */
export function descendantCells(all: readonly SlideElement[], roots: readonly DiagramEl[]): DiagramEl[] {
  const cells = all.filter((el): el is DiagramEl => el.type === 'vertex' || el.type === 'connector');
  const byParent = new Map<string, DiagramEl[]>();
  for (const el of cells) {
    if (el.parent == null) continue;
    const key = `${el.diagram}\u0000${el.parent}`;
    const list = byParent.get(key) ?? [];
    list.push(el);
    byParent.set(key, list);
  }
  const rootIds = new Set(roots.map((el) => el.id));
  const out: DiagramEl[] = [];
  const seen = new Set<string>();
  const visit = (el: DiagramEl) => {
    for (const child of byParent.get(`${el.diagram}\u0000${el.cell}`) ?? []) {
      if (seen.has(child.id) || rootIds.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      visit(child);
    }
  };
  for (const root of roots) if (root.type === 'vertex') visit(root);
  return out;
}

/** Moves a cell by a slide-pixel delta (a connector's waypoints and loose ends with it). */
export function translateCell(el: DiagramEl, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  el.x += dx;
  el.y += dy;
  if (el.type === 'connector') {
    const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
    el.points = el.points.map(shift);
    el.route = el.route.map(shift);
    if (el.sourcePoint) el.sourcePoint = shift(el.sourcePoint);
    if (el.targetPoint) el.targetPoint = shift(el.targetPoint);
  }
}

/**
 * The Angle input (installInputHandler for rotation): taken mod 360 to two
 * decimals, written to `rotation=` and to the element.
 */
export function normalizeAngle(value: number): number {
  const v = Math.round(value * 100);
  return (((v % 36000) + 36000) % 36000) / 100;
}

export function setRotation(el: VertexEl, degrees: number): void {
  const value = normalizeAngle(degrees);
  el.dio = setStyleValue(el.dio, 'rotation', value);
  el.rot = value;
}

/**
 * Flip (Graph.flipCells): vertices toggle flipH/flipV, all to the opposite of
 * the first vertex; connectors mirror their waypoints and loose ends about
 * their middle.
 */
export function flipTarget(cells: readonly DiagramEl[], horizontal: boolean): number {
  const first = cells.find((el) => el.type === 'vertex');
  if (!first) return 1;
  return isOn(cellStyle(first)[horizontal ? 'flipH' : 'flipV']) ? 0 : 1;
}

export function flipCell(el: DiagramEl, horizontal: boolean, value: number): void {
  if (el.type === 'vertex') {
    el.dio = setStyleValue(el.dio, horizontal ? 'flipH' : 'flipV', value);
    return;
  }
  const route = el.route.length > 0 ? el.route : el.points;
  if (route.length === 0) return;
  const xs = route.map((p) => p.x);
  const ys = route.map((p) => p.y);
  const c = horizontal ? (Math.min(...xs) + Math.max(...xs)) / 2 : (Math.min(...ys) + Math.max(...ys)) / 2;
  const mirror = (p: Point): Point => (horizontal ? { x: c + (c - p.x), y: p.y } : { x: p.x, y: c + (c - p.y) });
  el.points = el.points.map(mirror);
  if (el.sourcePoint) el.sourcePoint = mirror(el.sourcePoint);
  if (el.targetPoint) el.targetPoint = mirror(el.targetPoint);
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * mxGraph.alignCells over vertices (edges and relative cells are skipped),
 * in slide pixels: left/top/right/bottom align to the extreme, center and
 * middle to the first vertex. Returns the new position per id.
 */
export function alignCells(cells: readonly DiagramEl[], align: AlignMode): Map<string, Point> {
  const boxes = cells.filter((el): el is VertexEl => el.type === 'vertex' && !el.relative);
  const out = new Map<string, Point>();
  if (boxes.length < 2) return out;
  let param: number | null = null;
  for (const el of boxes) {
    if (param == null) {
      if (align === 'center') { param = el.x + el.w / 2; break; }
      if (align === 'middle') { param = el.y + el.h / 2; break; }
      param = align === 'right' ? el.x + el.w : align === 'top' ? el.y : align === 'bottom' ? el.y + el.h : el.x;
    } else if (align === 'right') param = Math.max(param, el.x + el.w);
    else if (align === 'top') param = Math.min(param, el.y);
    else if (align === 'bottom') param = Math.max(param, el.y + el.h);
    else param = Math.min(param, el.x);
  }
  if (param == null) return out;
  for (const el of boxes) {
    let { x, y } = el;
    if (align === 'center') x = param - el.w / 2;
    else if (align === 'right') x = param - el.w;
    else if (align === 'top') y = param;
    else if (align === 'middle') y = param - el.h / 2;
    else if (align === 'bottom') y = param - el.h;
    else x = param;
    out.set(el.id, { x, y });
  }
  return out;
}

/**
 * Graph.distributeCells over vertices: the outer two stay, the rest get
 * evenly spaced centres, or with `spacing` even gaps, rounded in draw.io
 * units. Returns the new position per id.
 */
export function distributeCells(cells: readonly DiagramEl[], horizontal: boolean, spacing: boolean): Map<string, Point> {
  const vertices = cells.filter((el): el is VertexEl => el.type === 'vertex');
  const out = new Map<string, Point>();
  if (vertices.length <= 2) return out;
  const center = (el: VertexEl) => (horizontal ? el.x + el.w / 2 : el.y + el.h / 2);
  const size = (el: VertexEl) => (horizontal ? el.w : el.h);
  let min = Infinity;
  let max = -Infinity;
  let cellsSize = 0;
  for (const el of vertices) {
    min = Math.min(min, center(el));
    max = Math.max(max, center(el));
    if (spacing) cellsSize += size(el);
  }
  const sorted = [...vertices].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  if (spacing) cellsSize -= size(sorted[0]) / 2 + size(sorted[sorted.length - 1]) / 2;
  const dt = (max - min - cellsSize) / (sorted.length - 1);
  let t0 = min + (spacing ? size(sorted[0]) / 2 : 0);
  for (let i = 1; i < sorted.length - 1; i++) {
    const el = sorted[i];
    t0 += dt;
    const s = el.scale || 1;
    const o = horizontal ? el.origin.x : el.origin.y;
    // Rounded in draw.io units, as draw.io rounds the geometry.
    const start = Math.round((t0 - (spacing ? 0 : size(el) / 2) - o) / s) * s + o;
    out.set(el.id, horizontal ? { x: start, y: el.y } : { x: el.x, y: start });
    if (spacing) t0 += size(el);
  }
  return out;
}

// --- Edit Data ------------------------------------------------------------------

/** The cell's custom properties as EditDataDialog lists them (no label, no placeholders flag). */
export function cellData(el: Pick<DiagramEl, 'object'>): { attrs: Array<[string, string]>; placeholders: boolean } {
  const attrs = el.object?.attrs ?? {};
  const rows = Object.entries(attrs).filter(([name]) => name !== 'label' && name !== 'placeholders');
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return { attrs: rows, placeholders: attrs.placeholders === '1' };
}

/** A property name draw.io accepts (an XML attribute name that is not the id). */
export function isValidDataName(name: string): boolean {
  return /^[A-Za-z_][\w.-]*$/.test(name) && name !== 'id' && name !== 'label' && name !== 'placeholders';
}

/**
 * Writes the custom properties: the cell becomes an `<object>` when it gets
 * its first one, and plain again when the last one goes.
 */
export function setCellData(el: DiagramEl, attrs: ReadonlyArray<readonly [string, string]>, placeholders: boolean): void {
  const next: Record<string, string> = {};
  for (const [name, value] of attrs) if (isValidDataName(name)) next[name] = value;
  if (placeholders) next.placeholders = '1';
  if (Object.keys(next).length === 0) {
    el.object = null;
    return;
  }
  el.object = { tag: el.object?.tag ?? 'object', attrs: next };
}

// --- misc -----------------------------------------------------------------------

/** Every key of the shared style, for the "Edit Style" box of a multi-selection. */
export function styleText(dio: string): string {
  return serializeStyle(parseStyleString(dio));
}
