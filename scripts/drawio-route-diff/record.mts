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


const cases: any[] = [
  { name: 'rounded', style: '', source: { id: 'a', x: 0, y: 0, w: 100, h: 60, s: 'rounded=1;roundedPerimeter=1', fake: 'label' }, target: null, targetPoint: { x: 300, y: 180 } },
  { name: 'rounded arcSize', style: 'edgeStyle=orthogonalEdgeStyle', source: { id: 'a', x: 0, y: 0, w: 100, h: 60, s: 'rounded=1;roundedPerimeter=1;absoluteArcSize=1;arcSize=40', fake: 'label' }, target: { id: 'b', x: 200, y: 200, w: 80, h: 40, s: '' } },
  { name: 'stencil', style: '', source: { id: 'a', x: 0, y: 0, w: 100, h: 60, s: '', fake: 'stencil' }, target: null, targetPoint: { x: 300, y: 180 } },
  { name: 'multiple', style: '', source: { id: 'a', x: 0, y: 0, w: 100, h: 60, s: 'multiple=1' }, target: null, targetPoint: { x: 300, y: -100 } },
  { name: 'selfcall', style: 'edgeStyle=sequenceEdgeStyle', source: { id: 'a', x: 0, y: 0, w: 10, h: 100, s: '', lifeline: 'L' }, target: { id: 'b', x: 0, y: 150, w: 10, h: 50, s: '', lifeline: 'L' } },
  { name: 'er relative', style: 'edgeStyle=entityRelationEdgeStyle', source: { id: 'a', x: 0, y: 0, w: 100, h: 20, s: '', relativeX: 0 }, target: { id: 'b', x: 300, y: 100, w: 100, h: 20, s: '' } },
  { name: 'orth rotated', style: 'edgeStyle=orthogonalEdgeStyle', source: { id: 'a', x: 0, y: 0, w: 100, h: 40, s: 'rotation=90' }, target: { id: 'b', x: 200, y: 150, w: 100, h: 40, s: '' } },
  { name: 'orth jetty auto', style: 'edgeStyle=orthogonalEdgeStyle;jettySize=auto;exitX=1;exitY=0.5;entryX=0;entryY=0.5', source: { id: 'a', x: 0, y: 0, w: 100, h: 40, s: '' }, target: { id: 'b', x: 120, y: 150, w: 100, h: 40, s: '' } },
  { name: 'orth loop', style: 'edgeStyle=orthogonalEdgeStyle;orthogonalLoop=1;exitX=1;exitY=0.5;entryX=0.5;entryY=0', source: { id: 'a', x: 100, y: 100, w: 100, h: 40, s: '' }, target: 'same' },
];
for (const c of cases) {
  const t = (x: any) => x == null ? null : ({ ...x, style: resolveStyle(x.s, 'vertex') });
  const source = t(c.source);
  const target = c.target == 'same' ? source : t(c.target);
  const spec = { style: resolveStyle(c.style, 'edge'), source, target, points: [], ports: [], sourcePoint: null, targetPoint: c.targetPoint ?? null };
  console.log(c.name, JSON.stringify(ctx.drawioRoute(JSON.parse(JSON.stringify(spec)))));
}
