/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * the shape registrations of mxgraph/src/view/mxCellRenderer.js and
 * js/grapheditor/Shapes.js (later registrations replace earlier ones, as
 * draw.io's `hexagon` replaces mxHexagon).
 * Modified for DeckWerk: one explicit list instead of registrations spread
 * over the files.
 */

import {
  Cloud, DoubleEllipse, Ellipse, ImageShape, Label, Line, MxHexagon, RectangleShape, Rhombus, Swimlane, Triangle,
} from './basic.js';
import {
  CalloutShape, CardShape, CubeShape, CurlyBracketShape, CylinderShape2, CylinderShape3, DataStoreShape,
  DocumentShape, ExtendedShape, FolderShape, HexagonShape, InternalStorageShape, IsoCubeShape, IsoCubeShape2,
  IsoRectangleShape, NoteShape, NoteShape2, ParallelMarkerShape, ParallelogramShape, PlusShape, ProcessShape,
  StepShape, SwitchShape, TapeShape, TransparentShape, TrapezoidShape, WaypointShape, WedgeCalloutShape,
} from './drawio.js';
import {
  Arrow, ArrowConnector, Connector, FilledEdge, FlexArrowShape, LinkShape, PipeShape, TaperedArrowShape, WireShape,
} from './edges.js';
import {
  CollateShape, CornerShape, CrossShape, CrossbarShape, DataStorageShape, DelayShape, DimensionShape, DisplayShape,
  DoubleArrowShape, LineEllipseShape, LoopLimitShape, ManualInputShape, MessageShape, OffPageConnectorShape,
  OrEllipseShape, OrShape, PartialRectangleShape, SingleArrowShape, SortShape, SumEllipseShape, TapeDataShape,
  TeeShape, XorShape, ZigzagShape,
} from './flowchart.js';
import { Actor, Cylinder, registerShape, type ShapeClass } from './shape.js';
import {
  AssociativeEntity, ComponentShape, LollipopShape, ModuleShape, ProvidedRequiredInterfaceShape,
  RequiredInterfaceShape, RequiresShape, SmileyFaceShape, StartStateShape, StateShape, UmlActorShape,
  UmlBoundaryShape, UmlControlShape, UmlDestroyShape, UmlEntityShape, UmlFrame, UmlLifeline, UmlStateShape,
} from './uml.js';
// --- draw.io's shape libraries (shapes/*.js and the rest of Shapes.js), one import each ---
import { ELECTRICAL_SHAPES } from './mxElectrical.js';
import { INFOGRAPHIC_SHAPES } from './mxInfographic.js';
import { NETWORKS_SHAPES } from './mxNetworks.js';
import { LEAN_MAP_SHAPES } from './mxLeanMap.js';
import { BASIC_SHAPES } from './mxBasic.js';
import { ARROWS_SHAPES } from './mxArrows.js';
import { FLOWCHART_SHAPES } from './mxFlowchart.js';
import { DRAWIO_EXTRA_GRAPH_SHAPES, DRAWIO_EXTRA_SHAPES } from './drawioExtra.js';
import { UML25_SHAPES } from './mxUML25.js';
import { ER_SHAPES } from './mxER.js';

/** Shapes that paint along the route of an edge. */
export const EDGE_SHAPES: readonly string[] = [
  'connector', 'arrow', 'arrowConnector', 'link', 'flexArrow', 'wire', 'filledEdge', 'pipe', 'taperedArrow',
  // --- edge shapes of the libraries ---
  'mxgraph.networks.comm_link_edge',
  'mxgraph.lean_mapping.electronic_info_flow_edge', 'mxgraph.lean_mapping.manual_info_flow_edge',
  'mxgraph.arrows2.wedgeArrow', 'mxgraph.arrows2.wedgeArrowDashed', 'mxgraph.arrows2.wedgeArrowDashed2',
  'mermaidSankeyLink',
];

/**
 * draw.io's shape libraries, each a list of [shape name, class] in the
 * order the library registers them (registered after the core shapes, as
 * mxStencilRegistry loads libraries after Shapes.js).
 */
const LIBRARIES: ReadonlyArray<ReadonlyArray<[string, ShapeClass]>> = [
  // --- one entry per library ---
  ELECTRICAL_SHAPES,
  INFOGRAPHIC_SHAPES,
  NETWORKS_SHAPES,
  LEAN_MAP_SHAPES,
  BASIC_SHAPES,
  ARROWS_SHAPES,
  FLOWCHART_SHAPES,
  DRAWIO_EXTRA_SHAPES,
  DRAWIO_EXTRA_GRAPH_SHAPES,
  UML25_SHAPES,
  ER_SHAPES,
];

const SHAPES: Array<[string, ShapeClass]> = [
  // mxCellRenderer
  ['rectangle', RectangleShape],
  ['ellipse', Ellipse],
  ['rhombus', Rhombus],
  ['cylinder', Cylinder],
  ['connector', Connector],
  ['actor', Actor],
  ['triangle', Triangle],
  ['hexagon', MxHexagon],
  ['cloud', Cloud],
  ['line', Line],
  ['arrow', Arrow],
  ['arrowConnector', ArrowConnector],
  ['doubleEllipse', DoubleEllipse],
  ['swimlane', Swimlane],
  ['image', ImageShape],
  ['label', Label],
  // Shapes.js
  ['cube', CubeShape],
  ['isoRectangle', IsoRectangleShape],
  ['wire', WireShape],
  ['waypoint', WaypointShape],
  ['isoCube', IsoCubeShape],
  ['datastore', DataStoreShape],
  ['note', NoteShape],
  ['note2', NoteShape2],
  ['isoCube2', IsoCubeShape2],
  ['cylinder2', CylinderShape2],
  ['cylinder3', CylinderShape3],
  ['switch', SwitchShape],
  ['folder', FolderShape],
  ['umlState', UmlStateShape],
  ['smileyFace', SmileyFaceShape],
  ['card', CardShape],
  ['tape', TapeShape],
  ['document', DocumentShape],
  ['parallelogram', ParallelogramShape],
  ['trapezoid', TrapezoidShape],
  ['curlyBracket', CurlyBracketShape],
  ['parallelMarker', ParallelMarkerShape],
  ['process', ProcessShape],
  ['process2', ProcessShape],
  ['transparent', TransparentShape],
  ['callout', CalloutShape],
  ['wedgeCallout', WedgeCalloutShape],
  ['step', StepShape],
  ['hexagon', HexagonShape],
  ['plus', PlusShape],
  ['ext', ExtendedShape],
  ['message', MessageShape],
  ['umlActor', UmlActorShape],
  ['umlBoundary', UmlBoundaryShape],
  ['umlEntity', UmlEntityShape],
  ['umlDestroy', UmlDestroyShape],
  ['umlControl', UmlControlShape],
  ['umlLifeline', UmlLifeline],
  ['umlFrame', UmlFrame],
  ['lollipop', LollipopShape],
  ['requires', RequiresShape],
  ['requiredInterface', RequiredInterfaceShape],
  ['providedRequiredInterface', ProvidedRequiredInterfaceShape],
  ['module', ModuleShape],
  ['component', ComponentShape],
  ['associativeEntity', AssociativeEntity],
  ['endState', StateShape],
  ['startState', StartStateShape],
  ['link', LinkShape],
  ['flexArrow', FlexArrowShape],
  ['manualInput', ManualInputShape],
  ['internalStorage', InternalStorageShape],
  ['corner', CornerShape],
  ['crossbar', CrossbarShape],
  ['tee', TeeShape],
  ['singleArrow', SingleArrowShape],
  ['doubleArrow', DoubleArrowShape],
  ['dataStorage', DataStorageShape],
  ['or', OrShape],
  ['xor', XorShape],
  ['loopLimit', LoopLimitShape],
  ['offPageConnector', OffPageConnectorShape],
  ['tapeData', TapeDataShape],
  ['orEllipse', OrEllipseShape],
  ['sumEllipse', SumEllipseShape],
  ['sortShape', SortShape],
  ['collate', CollateShape],
  ['dimension', DimensionShape],
  ['partialRectangle', PartialRectangleShape],
  ['lineEllipse', LineEllipseShape],
  ['delay', DelayShape],
  ['cross', CrossShape],
  ['display', DisplayShape],
  ['filledEdge', FilledEdge],
  ['taperedArrow', TaperedArrowShape],
  ['pipe', PipeShape],
  ['zigzag', ZigzagShape],
];

for (const [name, ctor] of SHAPES) registerShape(name, ctor);
for (const library of LIBRARIES) for (const [name, ctor] of library) registerShape(name, ctor);

export { Connector, RectangleShape, WedgeCalloutShape, ImageShape };
