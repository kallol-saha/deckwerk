# Diagrams: draw.io inside DeckWerk

Branch `drawio-diagrams` (fork `kallol-saha/deckwerk`). Goal: everything
draw.io does, built into DeckWerk as native objects, so diagrams for talks and
papers are made in DeckWerk — by hand or by an agent — with draw.io's own
parameters as the vocabulary. Nothing extra is installed: the draw.io code is
ported into this repository and ships in the normal installer. The draw.io
clone (`jgraph/drawio` 32.7.4, Apache-2.0) is a development reference only:
the source we port from and the renderer the tests compare against.

## Design

- Two new element types, beside the existing ones:
  - `vertex` — a diagram shape (draw.io's vertex).
  - `connector` — a diagram connector (draw.io's edge).
  Both are ordinary DeckWerk elements: select, move, builds, Morph, comments,
  undo, history, collaboration.
- Each stores draw.io's **style string verbatim** (`dio`, e.g.
  `ellipse;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf`). That
  string is the source of truth for the look; the inspector edits keys in it;
  an Edit Style box shows it raw. Keys DeckWerk does not draw yet are kept.
- A connector stores what it joins (`source`/`target` element ids), ports
  (via `exitX/entryX…` in its style), waypoints, terminal points when it is
  loose, and its edge labels. Its route is recomputed with draw.io's routing
  code whenever an end moves: editor, player, Morph.
- Groups, containers and layers keep draw.io's parent relationship (`parent`).
  Coordinates stay in slide space; conversion to draw.io's parent-relative
  geometry happens at the file boundary.
- `cell` keeps the draw.io cell id, unique per slide. `.drawio` apply/export
  matches by it, and Morph pairs by it.
- Existing DeckWerk `shape` elements are unchanged; a convert command maps a
  rect/ellipse/line to its draw.io equivalent.
- Why not extend `shape`: every draw.io vertex carries a label and one of
  ~500 shape names, and a connector's geometry comes from what it joins, not
  from a box plus rotation as DeckWerk lines are.

## The grounded loop (agent and person alike)

```
slide-agent diagram export . --slide 5 -o drafts/fig5.drawio
#   edit cells, styles, animation steps (or open the file in draw.io desktop)
slide-agent diagram apply . drafts/fig5.drawio --slide 5
slide-agent render . --slide 5
```

`apply` matches cells by draw.io id: a changed cell updates in place (its
builds and Morph pairing survive), new cells are inserted, removed cells are
deleted and listed in `changes`. One undoable change.

Animations use draw.io's own step grammar (`show n3 fade`, `show e7 wipe`,
`hide n2`, `flow e7 start`, `setOpacity n4 0.3`, `wait 500`), stored in the
model's `animation` attribute, converted both ways to DeckWerk builds. A
`wait` becomes a click, so every beat starts on a click.

## Code layout

- `src/shared/diagram/` — everything DOM-free, shared by player, editor, CLI
  and collab server:
  - `xml.ts` — a small XML reader/writer (no DOM, so the CLI and server can
    use it).
  - `style.ts` — style string parse/serialise, named styles from draw.io's
    `default.xml`, `none` semantics, typed accessors with draw.io defaults.
  - `drawioFile.ts` — mxfile ⇄ model: plain and compressed pages, `object`
    wrappers, geometry (relative, offset, points, terminal points), layers,
    groups, edge labels; unknown attributes kept.
  - `canvas.ts` — an SVG-string canvas with draw.io's drawing API
    (mxAbstractCanvas2D), so shape code ports line for line.
  - `shapes/`, `markers.ts`, `perimeter.ts`, `edgeStyle.ts`, `route.ts`,
    `label.ts` — ports of mxGraph/draw.io drawing and routing.
- Small hooks in existing files (`deck.ts`, `render.ts`, `store.ts`,
  `agent.ts`, `clipboard.ts`, `morph.ts`, `inspector.ts`, `agentCli.ts`), so
  merging upstream DeckWerk stays manageable.
- Ported code keeps its Apache-2.0 header plus a note that it was modified;
  `NOTICE` names the source.

## Verification

draw.io itself is the reference: a harness loads draw.io's viewer from the
clone, renders the same `.drawio` fixtures, and the tests compare connector
routes and label boxes numerically and rendered images by pixel difference.
DeckWerk's own suites run as usual.

## Phases

### Phase 1 — diagrams that look and route like draw.io; the agent can author them
- [x] XML reader/writer
- [x] Style parser, named styles, defaults
- [x] `.drawio` read/write (plain + compressed, pages, groups, layers, custom properties, edge labels)
- [x] SVG canvas with draw.io's drawing API
- [x] ~40 General/Misc/Advanced shapes; every arrowhead; fill, stroke, dash, gradient, shadow, rounding, opacity, flip, rotation, direction
- [x] Labels: wrap, alignment, inside/outside position, spacing, background/border, vertical text, rich text
- [x] `shapeInside=1` text flow (text wrapped inside diamonds, ellipses, …; matches draw.io byte for byte on the fixtures)
- [x] Page-wide `shadow=1` (drawn everywhere)
- [x] `%placeholders%` from ancestors and the page (date/page-number placeholders not yet)
- [x] Connectors: straight, orthogonal, elbow, entity-relation, curved, rounded; waypoints; ports and floating ends; edge labels
- [x] `vertex` / `connector` element types: schema, integrity, paste remap, delete cleanup
- [x] Drawn everywhere: editor, presenter, thumbnails, PDF, recorder, web export (one renderer path; checked with `slide-agent render`)
- [x] File → Import `.drawio` (each page → a slide)
- [x] `slide-agent diagram export` / `apply`
- [x] Editor basics: move/resize with connectors following; double-click to edit a label; Edit Style box (not yet tried by hand in the app)
- [x] Reference harness against draw.io; fixtures match
- [ ] Rebuild one real figure as a native diagram

### Phase 2 — edit like draw.io
- [x] Connection points on hover; drag from a shape's arrows to create a connected shape; drop a connector end on a shape/port to attach (`diagramEditing.ts`, `editing.ts`)
- [x] Waypoint and segment dragging; add/remove bends
- [x] Shape library panel (searchable): General, Misc, Advanced, Basic, Arrows, Flowchart, Entity Relation, UML — 388 entries extracted from draw.io's own Sidebar code (`shapeLibrary.ts`, `library/`)
- [x] Format panel: Style / Text / Arrange tabs after draw.io's Format.js; copy/paste style, default style, edit data (`diagramFormat.ts`, `format.ts`)
- [x] Group/ungroup; containers and swimlanes (collapse/expand, children follow); layers panel (show/hide/lock/current layer) (`structure.ts`, `diagramCommands.ts`, `layersPanel.ts`)
- [ ] Grid, guides, align/distribute for diagram objects
- [x] Copy/paste keeps connections between copied shapes (and a pasted group keeps its children)

### Phase 3 — agent toolkit
- [x] `diagram style` (patch keys on cells), `diagram layout` (ELK: layered, tree, radial; plus organic, circle), `diagram add` (compact spec, library shapes); Format panel ▸ Arrange ▸ Layout (`diagramAgentCli.ts`, `agentEdit.ts`, `layout.ts`, `diagramLayoutMenu.ts`)
- [x] Diagram objects in `inspect --html` so the HTML loop works too (cells, diagram records as `data-diagrams`, wipe builds; round trip exact)
- [x] `slide-agent docs diagrams`: style keys, shape names, arrowheads, routing styles, rendered examples (`--examples`; generated in `diagramDocs.ts`)
- [x] `validate` flags dangling connectors and unknown shapes (also duplicate ids, missing parents, rot vs rotation=, off-slide cells: `validate.ts`)

### Phase 4 — animation
- [x] draw.io animation steps ⇄ DeckWerk builds (`shared/diagram/animation.ts`; a `wait` is a click; unplayed steps kept verbatim)
- [x] Connector draw-on along its route with the arrowhead at the tip; wipe, pop, fade (player and Build preview; `motion.ts`, `player/diagramMotion.ts`)
- [x] `flowAnimation` in the player, presenter and editor; start/stop as builds — dashes checked in a recording; dot and ring ported but not yet checked on screen
- [x] Morph by cell id; connectors re-route every frame; labels cross-fade
- [x] "Build this diagram in order" helper (Build panel, `slide-agent diagram build`)

### Phase 5 — paper figures and the long tail
- [x] Figure export: slide or selection → SVG / PDF / PNG, cropped, vector, fonts embedded; SVG/PNG carry the `.drawio`
- [x] `slide-agent figure`
- [x] LaTeX in labels (draw.io's delimiters, DeckWerk's KaTeX; no AsciiMath)
- [x] Sketch style (draw.io's rough.js 4.6.6, seeded by cell id as draw.io does)
- [x] Stencil libraries: basic, flowchart, arrows, electrical, networks, infographic, lean mapping, ER, UML 2.5, BPMN stencils (293 shape classes, 738 XML stencils)
- [x] Line jumps (drawn everywhere); fill patterns
- [x] Tables (layout, insert/delete rows and columns), find/replace (Ctrl+F / Ctrl+H)

Not planned: draw.io's obstacle-avoiding router (LGPL libavoid) and vendor
icon sets (AWS, Azure, … are trademarked).

## Status log

- 2026-11-17 — Phase 1 core landed (uncommitted on `drawio-diagrams`):
  - Shapes: 92 shapes and 34 markers, element for element identical to draw.io's own painting code on ~6,500 cases (`test/diagramShapesDrawio.test.ts`).
  - Routing: identical to draw.io on 59,000 random edges (`scripts/drawio-route-diff/`).
  - Labels: boxes identical on 1,236 draw.io cases.
  - End to end: every vertex box and connector route of the 24 reference fixtures matches draw.io (`test/diagramConvert.test.ts`). Pixel comparison of full pages (`scripts/drawio-visual-compare.mts`): ≤0.2 % differing pixels except sketch style (not built) and page shadow.
  - CLI round trip (export → edit → apply) and the HTML loop keep every cell; re-applying an untouched file changes nothing.
  - 347 diagram tests pass. The 20 failures elsewhere in the touched suites fail identically on clean `main` (Windows/environment).
