import { createRequire } from 'node:module';
import { resolveStyle } from '../../src/shared/diagram/style.ts';
import { routeEdge, edgeLabelPoint, relativePointOnRoute } from '../../src/shared/diagram/route.ts';
import type { TerminalView } from '../../src/shared/diagram/route.ts';

const require = createRequire(import.meta.url);
const { ctx, run } = require('./load.cjs');

run(`
function toStyle(s) { var r = {}; for (var k in s) { r[k] = mxUtils.isNumeric(s[k]) ? parseFloat(s[k]) : s[k]; } return r; }
function drawioRoute(spec) {
  view.states = new mxDictionary(); graph.model.cells = {};
  var made = {};
  function mk(t) {
    if (t == null) return null;
    if (made[t.id]) return made[t.id];
    var cell = { id: t.id, vertex: true, geometry: new mxGeometry(t.x, t.y, t.w, t.h), lifeline: t.lifeline };
    if (t.relativeX != null) { cell.geometry.relative = true; cell.geometry.x = t.relativeX; }
    graph.model.cells[t.id] = cell;
    var st = new mxCellState(view, cell, toStyle(t.style));
    st.x = t.x; st.y = t.y; st.width = t.w; st.height = t.h;
    if (t.fake == 'label') st.shape = new mxLabel();
    else if (t.fake == 'rect') st.shape = new mxRectangleShape();
    else if (t.fake == 'stencil') st.shape = { stencil: { aspect: 'fixed', w0: 30, h0: 20 } };
    if (t.labelBox) st.text = { boundingBox: new mxRectangle(t.labelBox.x, t.labelBox.y, t.labelBox.width, t.labelBox.height) };
    view.states.put(cell, st);
    made[t.id] = st;
    return st;
  }
  var src = mk(spec.source), trg = mk(spec.target);
  for (var i = 0; i < (spec.ports || []).length; i++) mk(spec.ports[i]);
  var geo = new mxGeometry(); geo.relative = true;
  geo.points = spec.points.map(function(p) { return new mxPoint(p.x, p.y); });
  if (spec.sourcePoint) geo.setTerminalPoint(new mxPoint(spec.sourcePoint.x, spec.sourcePoint.y), true);
  if (spec.targetPoint) geo.setTerminalPoint(new mxPoint(spec.targetPoint.x, spec.targetPoint.y), false);
  var edgeCell = { id: 'e', edge: true, geometry: geo, source: src ? src.cell : null, target: trg ? trg.cell : null };
  var state = new mxCellState(view, edgeCell, toStyle(spec.style));
  state.visibleSourceState = src; state.visibleTargetState = trg;
  view.clear = function() { state.cleared = true; };
  view.updateEdgeState(state, geo);
  if (state.cleared) return [];
  return state.absolutePoints.map(function(p) { return { x: p.x, y: p.y }; });
}
function drawioLabel(points, x, y, offset, style) {
  var state = new mxCellState(view, { id: 'l', edge: true }, toStyle(style || {}));
  state.absolutePoints = points.map(function(p) { return new mxPoint(p.x, p.y); });
  view.updateEdgeBounds(state);
  var g = new mxGeometry(x, y, 0, 0); g.relative = true; if (offset) g.offset = new mxPoint(offset.x, offset.y);
  var p = view.getPoint(state, g);
  return { x: p.x, y: p.y };
}
function drawioRelative(points, x, y, style) {
  var state = new mxCellState(view, { id: 'l', edge: true, geometry: { relative: true } }, toStyle(style || {}));
  state.absolutePoints = points.map(function(p) { return new mxPoint(p.x, p.y); });
  view.updateEdgeBounds(state);
  var p = view.getRelativePoint(state, x, y);
  return { x: p.x, y: p.y };
}
`, 'driver');

// --- random specs ---------------------------------------------------------------
let seed = Number(process.argv[2] ?? 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const coord = () => (rnd() < 0.7 ? Math.round(rnd() * 400) : Math.round(rnd() * 4000) / 10);
const size = () => (rnd() < 0.7 ? 20 + Math.round(rnd() * 120) : 10 + Math.round(rnd() * 1200) / 10);

const shapes = [
  '', 'ellipse', 'rhombus', 'triangle', 'triangle;direction=north', 'triangle;direction=south', 'triangle;direction=west',
  'shape=hexagon;perimeter=hexagonPerimeter', 'shape=hexagon;perimeter=hexagonPerimeter;direction=north',
  'shape=hexagon;perimeter=hexagonPerimeter2;size=0.3', 'shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;size=15;direction=south',
  'shape=parallelogram;perimeter=parallelogramPerimeter', 'shape=trapezoid;perimeter=trapezoidPerimeter;direction=west',
  'shape=step;perimeter=stepPerimeter;direction=north', 'shape=callout;perimeter=calloutPerimeter',
  'shape=umlLifeline;perimeter=lifelinePerimeter', 'perimeter=backbonePerimeter;direction=south',
  'perimeter=orthogonalPerimeter', 'perimeter=centerPerimeter', 'rounded=1', 'shape=cloud;perimeter=cloudPerimeter',
  'shape=mxgraph.mermaid.person;perimeter=mermaidPersonPerimeter', 'perimeter=none',
];
const extras = ['', '', '', 'rotation=90', 'rotation=45', 'rotation=-30', 'rotation=180', 'flipH=1', 'flipV=1', 'flipH=1;flipV=1',
  'perimeterSpacing=4', 'portConstraint=north', 'portConstraint=east;portConstraintRotation=1;rotation=90',
  'routingCenterX=0.25', 'direction=south', 'snapToPoint=1;points=[[0,0],[0.5,0],[1,0.5],[0,1,0]]', 'multiple=1',
  'legacyAnchorPoints=0;flipH=1;direction=north'];
const edgeStyles = ['', 'edgeStyle=orthogonalEdgeStyle', 'edgeStyle=orthogonalEdgeStyle', 'edgeStyle=orthogonalEdgeStyle;jettySize=auto',
  'edgeStyle=elbowEdgeStyle', 'edgeStyle=elbowEdgeStyle;elbow=vertical', 'edgeStyle=entityRelationEdgeStyle',
  'edgeStyle=segmentEdgeStyle', 'edgeStyle=isometricEdgeStyle', 'edgeStyle=sequenceEdgeStyle', 'edgeStyle=sideToSideEdgeStyle',
  'edgeStyle=topToBottomEdgeStyle', 'edgeStyle=orthogonalEdgeStyle;sourcePortConstraint=south;targetPortConstraint=west'];
const edgeExtras = ['', '', 'orthogonal=1', 'perimeterSpacing=3', 'sourcePerimeterSpacing=5;targetPerimeterSpacing=2',
  'exitX=1;exitY=0.5;exitDx=0;exitDy=0', 'entryX=0;entryY=0.25', 'exitX=0.5;exitY=1;exitPerimeter=0;entryX=0.5;entryY=0',
  'exitX=0.3;exitY=0;exitDx=4;exitDy=-2', 'noEdgeStyle=1', 'curved=1', 'fixedPointSpacing=1;exitX=1;exitY=0.5;sourcePerimeterSpacing=8',
  'jettySize=25', 'orthogonalLoop=1', 'segment=15', 'startArrow=classic;endSize=12;jettySize=auto', 'sourcePort=p',
  'loopStyle=orthogonalEdgeStyle', 'innerLoopWaypoints=1'];

function terminal(id: string) {
  const kind = pick(['plain', 'plain', 'plain', 'rounded', 'stencil', 'label', 'relative']);
  let style = [pick(shapes), pick(extras)].filter(Boolean).join(';');
  const t: any = { id, x: coord(), y: coord(), w: size(), h: size() };
  if (kind == 'rounded') {
    style = [pick(['', 'shape=rectangle', 'shape=label']), 'rounded=1;roundedPerimeter=1', pick(['', 'arcSize=30', 'absoluteArcSize=1;arcSize=24']), pick(extras)].filter(Boolean).join(';');
    t.fake = style.includes('shape=rectangle') ? 'rect' : 'label';
  } else if (kind == 'stencil') {
    style = [pick(['', 'ellipse', 'rhombus', 'shape=parallelogram;perimeter=parallelogramPerimeter']), pick(extras), pick(['', 'stencilFlipH=1', 'stencilFlipV=1'])].filter(Boolean).join(';');
    t.fake = 'stencil';
  } else if (kind == 'label') {
    const side = pick(['bottom', 'top', 'left', 'right']);
    style = [pick(['', 'ellipse', 'rhombus']), 'labelPerimeter=1', side == 'bottom' || side == 'top' ? 'verticalLabelPosition=' + side : 'labelPosition=' + side, pick(['', 'perimeterSpacing=3'])].filter(Boolean).join(';');
    const lw = 30 + Math.round(rnd() * 80), lh = 10 + Math.round(rnd() * 20);
    t.labelBox = side == 'bottom' ? { x: t.x + (t.w - lw) / 2, y: t.y + t.h, width: lw, height: lh }
      : side == 'top' ? { x: t.x + (t.w - lw) / 2, y: t.y - lh, width: lw, height: lh }
      : side == 'left' ? { x: t.x - lw, y: t.y + (t.h - lh) / 2, width: lw, height: lh }
      : { x: t.x + t.w, y: t.y + (t.h - lh) / 2, width: lw, height: lh };
  } else if (kind == 'relative') {
    t.relativeX = pick([0, 0.25, 0.5, 1]);
  }
  if (rnd() < 0.15) t.lifeline = 'L';
  t.style = resolveStyle(style, 'vertex');
  t.styleText = style;
  return t;
}

function spec() {
  const loop = rnd() < 0.1;
  const source = rnd() < 0.9 ? terminal('a') : null;
  const target = loop ? source : (rnd() < 0.9 ? terminal('b') : null);
  const nPoints = pick([0, 0, 0, 1, 1, 2, 3]);
  const points = Array.from({ length: nPoints }, () => ({ x: coord(), y: coord() }));
  const styleText = [pick(edgeStyles), pick(edgeExtras), pick(edgeExtras)].filter(Boolean).join(';');
  const port = source ? { id: 'p', x: source.x + source.w - 5, y: source.y + 5, w: 10, h: 10, style: resolveStyle('', 'vertex'), styleText: '' } : null;
  return {
    style: resolveStyle(styleText, 'edge'), styleText, source, target, points, ports: port ? [port] : [],
    sourcePoint: source ? null : { x: coord(), y: coord() }, targetPoint: target ? null : { x: coord(), y: coord() },
  };
}

const view = (t: any): TerminalView | null => t == null ? null : ({ id: t.id, bounds: { x: t.x, y: t.y, width: t.w, height: t.h }, style: t.style,
  stencil: t.fake == 'stencil', stencilAspect: t.fake == 'stencil' ? { width: 30, height: 20 } : null, labelBox: t.labelBox ?? null,
  relativeX: t.relativeX ?? null, lifeline: t.lifeline ?? null });

const N = Number(process.argv[3] ?? 2000);
let fails = 0, compared = 0, errors = 0, ourErrors = 0;
const errorKinds = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const s = spec();
  let expected: { x: number; y: number }[];
  try {
    expected = ctx.drawioRoute(JSON.parse(JSON.stringify(s)));
  } catch (e: any) {
    errors++;
    const key = String(e && e.message);
    errorKinds.set(key, (errorKinds.get(key) ?? 0) + 1);
    continue; // draw.io throws for this input
  }
  const ports = new Map(s.ports.map((p) => [p.id, view(p)!]));
  let actual: { x: number; y: number }[];
  try {
    actual = routeEdge({ id: 'e', style: s.style, source: view(s.source), target: view(s.target), points: s.points,
      sourcePoint: s.sourcePoint, targetPoint: s.targetPoint, resolvePort: (id) => ports.get(id) ?? null });
  } catch (e) {
    ourErrors++;
    if (ourErrors < 4) console.log('OUR ERROR', e, s.styleText);
    continue;
  }
  compared++;
  const ok = actual.length == expected.length && actual.every((p, j) => Math.abs(p.x - expected[j].x) <= 1e-9 && Math.abs(p.y - expected[j].y) <= 1e-9);
  if (!ok) {
    fails++;
    if (fails <= 8) {
      console.log('MISMATCH', JSON.stringify({ edge: s.styleText, src: s.source && [s.source.x, s.source.y, s.source.w, s.source.h, s.source.styleText],
        trg: s.target && [s.target.x, s.target.y, s.target.w, s.target.h, s.target.styleText], points: s.points, sp: s.sourcePoint, tp: s.targetPoint }));
      console.log('  drawio', JSON.stringify(expected));
      console.log('  ours  ', JSON.stringify(actual));
    }
  }
  // Labels along the route
  if (expected.length >= 2) {
    const x = Math.round((rnd() * 2 - 1) * 100) / 100, y = Math.round((rnd() - 0.5) * 40);
    const off = rnd() < 0.3 ? { x: 3, y: -4 } : null;
    const curve = rnd() < 0.5 ? resolveStyle(pick(['curved=1;curveGeometry=1', 'curved=1;curveGeometry=1;bezier=1', 'bezier=1;curveGeometry=1', 'curved=1;curveGeometry=1;shape=link', 'curved=1;curveGeometry=1;shape=flexArrow']), 'edge') : undefined;
    const le = ctx.drawioLabel(expected, x, y, off, curve);
    const la = edgeLabelPoint(expected, { x, y, offset: off }, curve);
    if (Math.abs(le.x - la.x) > 1e-9 || Math.abs(le.y - la.y) > 1e-9) {
      fails++;
      if (fails <= 8) console.log('LABEL MISMATCH', JSON.stringify({ expected, x, y, off, le, la }));
    }
    const q = { x: coord(), y: coord() };
    const re = ctx.drawioRelative(expected, q.x, q.y, curve);
    const ra = relativePointOnRoute(expected, q, curve);
    if (Math.abs(re.x - ra.x) > 1e-9 || Math.abs(re.y - ra.y) > 1e-9) {
      fails++;
      if (fails <= 8) console.log('RELATIVE MISMATCH', JSON.stringify({ expected, q, re, ra }));
    }
  }
}
console.log(errorKinds);
console.log(`compared ${compared}, draw.io threw ${errors}, we threw ${ourErrors}, mismatches ${fails}`);
