// Loads draw.io's routing code (mxGraph core + Graph.js/Shapes.js overrides) into a vm context.
const fs = require('fs');
const vm = require('vm');
// The draw.io web app (jgraph/drawio src/main/webapp); DRAWIO_WEBAPP overrides.
const W = (process.env.DRAWIO_WEBAPP || 'C:/Users/kallo/tools/drawio/src/main/webapp').replace(/\\/g, '/').replace(/\/?$/, '/');
const read = (p) => fs.readFileSync(W + p, 'utf8');
const lines = (p, a, b) => read(p).split('\n').slice(a - 1, b).join('\n');

const ctx = {
  console, Math, JSON, Number, String, Object, Array, isFinite, isNaN, parseFloat, parseInt, Infinity, NaN,
  navigator: { userAgent: 'node', appVersion: '', platform: 'node' },
  urlParams: {},
};
ctx.window = ctx;
ctx.document = { documentMode: undefined, createElement: () => ({ style: {} }), location: { protocol: 'http:', href: '' } };
vm.createContext(ctx);
const run = (code, name) => vm.runInContext(code, ctx, { filename: name });

run(`var mxClient = { language: 'none', IS_SVG: true, IS_IE: false, IS_FF: false, IS_SF: false, IS_GC: true, IS_IOS: false, IS_TOUCH: false, IS_POINTER: false, IS_QUIRKS: false, IS_CHROMEAPP: false, imageBasePath: '', basePath: '', defaultBundles: [] };
function Element(){} var mxLog = { enter: function(){}, leave: function(){}, debug: function(){}, show: function(){} };
var mxResources = { get: function(k){ return k; }, add: function(){} }; var mxLoadResources = false;`, 'stubs');
for (const f of ['util/mxPoint.js', 'util/mxRectangle.js', 'util/mxConstants.js', 'util/mxUtils.js', 'util/mxEventSource.js',
  'util/mxEventObject.js', 'util/mxDictionary.js', 'util/mxObjectIdentity.js', 'util/mxImage.js', 'model/mxGeometry.js',
  'view/mxCellState.js', 'view/mxConnectionConstraint.js', 'view/mxPerimeter.js', 'view/mxEdgeStyle.js',
  'view/mxStyleRegistry.js', 'view/mxGraphView.js', 'view/mxGraph.js']) {
  run(read('mxgraph/src/' + f), f);
}

// Shape defaults read by the perimeters
run(`function UmlLifeline(){} UmlLifeline.prototype.size = 40;
function CalloutShape(){} CalloutShape.prototype.size = 30; CalloutShape.prototype.position = 0.5; CalloutShape.prototype.position2 = 0.5; CalloutShape.prototype.base = 20;
function ParallelogramShape(){} ParallelogramShape.prototype.size = 0.2; ParallelogramShape.prototype.fixedSize = 20;
function TrapezoidShape(){} TrapezoidShape.prototype.size = 0.2; TrapezoidShape.prototype.fixedSize = 20;
function StepShape(){} StepShape.prototype.size = 0.2; StepShape.prototype.fixedSize = 20;
function HexagonShape(){} HexagonShape.prototype.size = 0.25; HexagonShape.prototype.fixedSize = 20;
function MermaidPersonShape(){}
var mxCellRenderer = function(){}; mxCellRenderer.defaultShapes = {}; mxCellRenderer.registerShape = function(){}; mxCellRenderer.prototype.redraw = function(){};
function mxTriangle(){} function mxRhombus(){} function mxRectangleShape(){} function mxLabel(){}
mxRectangleShape.prototype.constraints = [];
`, 'shapes');

// The graph: mxGraph plus draw.io's overrides (Graph.prototype is the graph instance)
run(`
var graph = Object.create(mxGraph.prototype);
graph.gridSize = 10;
graph.model = {
  cells: {},
  isVertex: function(c) { return c != null && c.vertex == true; },
  isEdge: function(c) { return c != null && c.edge == true; },
  getTerminal: function(e, s) { return s ? e.source : e.target; },
  getGeometry: function(c) { return c.geometry; },
  getCell: function(id) { return this.cells[id]; },
  getParent: function(c) { return c.parent; },
  getRoot: function() { return null; },
  contains: function() { return true; },
};
graph.getModel = function() { return this.model; };
graph.getCellGeometry = function(c) { return c.geometry; };
var view = Object.create(mxGraphView.prototype);
view.graph = graph; view.scale = 1; view.translate = new mxPoint(0, 0); view.states = new mxDictionary();
view.modelCoordinates = true;
graph.view = view;
var Graph = function(){}; Graph.prototype = graph;
graph.sequenceSelfCallSize = 30;
graph.getSequenceLifeline = function(cell) { return (cell.lifeline != null) ? cell.lifeline : cell; };
`, 'graph');

const G = 'js/grapheditor/Graph.js';
const S = 'js/grapheditor/Shapes.js';
run(lines(G, 1871, 1959), 'Graph multiple');
run(lines(G, 10424, 10432), 'Graph selfcall');
run(lines(G, 30925, 31133), 'Graph multiple terminal');
run(lines(G, 32474, 32932), 'Graph terminal + elbows');
run(lines(G, 32939, 32996), 'Graph label curve');
run(lines(G, 8311, 8405), 'Graph curve points');
run(lines(G, 35826, 35894), 'Graph constraints');
run(lines(G, 42151, 42949), 'Graph connection point');
run(lines(G, 44554, 44678), 'Graph legacy point');
run(lines(S, 4142, 4881), 'Shapes perimeters');
run(lines(S, 9251, 9259), 'Mermaid geo');
run(lines(S, 9425, 9463), 'Mermaid perimeter');
run(lines(S, 11019, 11120), 'Isometric');
run(lines(S, 11138, 11151), 'Isometric orth');

module.exports = { ctx, run };
