# Diagrams: draw.io, natively

DeckWerk draws diagrams the way draw.io does, from draw.io's own file format
and style vocabulary. A diagram on a slide is made of ordinary DeckWerk
objects — `vertex` (a shape with its label) and `connector` (an arrow that
stays attached to the shapes it joins) — but their look is a **draw.io style
string**, verbatim, so you describe a diagram exactly as you would in draw.io
and the person can change it the same way (Edit Style in the inspector, or
the `.drawio` file in draw.io desktop).

Use diagrams for method figures, pipelines, architectures, flowcharts and
anything with boxes and arrows. Do not hand-place lines between boxes: a
connector re-routes itself whenever a shape moves.

`slide-agent docs diagrams` prints this guide and then a reference generated
from the engine: every style key with its values and default, every shape
name by library, the shape library's entries, every arrowhead, the edge
styles and the layouts. `--examples <dir>` also writes an SVG of each
library entry and arrowhead (open `index.html`).

## Build a figure from scratch (no XML)

```bash
# 1. Add shapes and connectors: one transaction, ids you choose.
slide-agent diagram add . --slide 5 \
  --vertex 'id=img   label="Image" shape=library:Cylinder' \
  --vertex 'id=enc   label="Encoder" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf"' \
  --vertex 'id=z     label="z" style="ellipse;fillColor=#fff2cc;strokeColor=#d6b656" w=60 h=60' \
  --vertex 'id=dec   label="Decoder" style="rounded=1;fillColor=#d5e8d4;strokeColor=#82b366"' \
  --edge   'id=e1 from=img to=enc style="endArrow=block;endFill=1"' \
  --edge   'id=e2 from=enc to=z   style="endArrow=block;endFill=1"' \
  --edge   'id=e3 from=z   to=dec label="sample" style="endArrow=block;endFill=1"'

# 2. Lay it out (draw.io's Arrange > Layout): flows, trees, radial, organic, circle.
slide-agent diagram layout . --slide 5 --algo layered --direction right --spacing 40 --at 40,60

# 3. Restyle: draw.io keys on cells by id (* = all); keys draw.io sets alongside follow.
slide-agent diagram style . --slide 5 --cells enc,dec --set "fontStyle=1;strokeWidth=2"
slide-agent diagram style . --slide 5 --cells '*' --set fontSize=16

# 4. Animate: reveal it in order, one click per cell, connectors drawn on.
slide-agent diagram build . --slide 5 --order flow

# 5. Check, then look.
slide-agent validate . --slide 5        # diagramProblems must be []
slide-agent render . --slide 5 --output /tmp/fig5
```

- **Specs.** A `--vertex` is `key=value` pairs: `id label style x y w h shape
  parent`; an `--edge` is `id from to label style points parent`. Quote
  values with spaces (`label="Two words"`). Positions and sizes are draw.io
  units relative to the diagram's origin (a new diagram is drawn at scale 2:
  120×60 units is 240×120 px; `--scale`, `--origin x,y` change that); shapes
  without `x y` go in a row and `diagram layout` places them anyway.
  `shape=ellipse` sets the shape; `shape=library:<title>` inserts an entry of
  draw.io's shape library (Cylinder, Document, Actor, Process, Terminator, …)
  with its own style and size — your `style` keys go on top. `--json spec.json`
  takes `{"vertices":[…],"edges":[…]}` with the same keys. `--layout <algo>`
  lays out in the same transaction. `html=1` (and `whiteSpace=wrap` on
  shapes) is added unless the style says otherwise, so labels are HTML.
- **Style.** `--set k=v` (repeatable, or `"k=v;k=v"`), `--unset k`,
  `--label <text>`, `--style "<whole string>"` (Edit Style). As draw.io's
  Format panel does, a change also sets the keys that go with it unless you
  set them yourself: `rotation` turns the element; `rounded` sets
  `roundedPerimeter` on shapes and excludes `curved` on connectors;
  `edgeStyle` clears the waypoints (`--keep-waypoints`) and `curved`;
  `labelPosition`/`verticalLabelPosition` set `align`/`verticalAlign`;
  `fontColor=none` hides the label; `sketch=1` adds draw.io's curve fitting
  and jiggle; `dashPattern` sets `dashed=1`; `html` converts the label.
  Unknown shapes, arrowheads and colours come back as `warnings`.
- **Layout.** `--algo layered|tree|radial|organic|circle` or a draw.io menu
  name (`horizontalFlow`, `verticalFlow`, `horizontalTree`, `verticalTree`,
  `radialTree`, `organic`, `circle`). ELK (elkjs) runs with draw.io's own
  options; Circle is mxCircleLayout. `--direction right|down|left|up`,
  `--spacing` between shapes, `--layer-spacing` between flow layers,
  `--cells a,b,c` for some shapes only, `--parent <cell>` for a container's
  children, `--corners keep|straight|rounded|curved`, `--at x,y`,
  `--elk key=value`. A flow's connectors become live orthogonal connectors
  through ELK's route; a tree's share stems; radial, organic and circle
  draw straight connectors. Groups move as one with their contents. The
  output's `bounds` (slide px) and `warnings` say if it left the slide —
  then lower `--spacing`, shrink shapes, or re-apply with a smaller scale.
  In the editor: Format panel ▸ Arrange ▸ Layout, one undo step each.
- **Check.** `validate` reports `diagramProblems`: connectors whose end is
  missing, not a shape, or in another diagram; duplicate cell ids; parents
  that do not exist; unknown shapes and arrowheads; `rot` disagreeing with
  `rotation=`; cells reaching past the slide. Then render and look.

## The HTML loop

`inspect --html` writes each cell as `<div data-element="vertex|connector"
data-dio="…" data-label="…" data-cell="…">`, and the slide's diagram records
(layers, page, origin, scale, animation) as `data-diagrams` on the section.
Change `data-dio` or `data-label`, or a vertex's CSS box, and apply the page:
connectors re-route. Builds on cells ride as usual (`data-build`,
`data-build-effect="wipe"` for draw.io's draw-on). For structure — new
cells, new connections — use `diagram add` or the `.drawio` loop below.

## The loop

```bash
# Start from a file you write, or from what is on the slide already:
slide-agent diagram export . --slide 5 --output drafts/fig5.drawio
#   …edit drafts/fig5.drawio (it is plain XML, below)…
slide-agent diagram apply . drafts/fig5.drawio --slide 5
slide-agent render . --slide 5 --output /tmp/fig5        # look at it
```

- `apply` matches cells by their draw.io `id`. A cell you leave alone keeps
  its DeckWerk object (and so its builds and Morph pairing); a cell you
  change is updated in place; a new id is a new object; a removed id is
  deleted — check `changes.deleted` in the output.
- A diagram keeps its placement on the slide (`origin`, `scale`) from the
  first apply, so coordinates in the file are draw.io page coordinates.
  `--scale 1.5` draws it larger (draw.io's zoom: styles keep their values).
- `diagram import . file.drawio --after 4` adds one slide per page.
- `diagram list . --slide 5` prints every cell: id, shape, label, box,
  and which cells each connector joins.

Keep ids meaningful (`enc`, `dec`, `e-enc-dec`): they are how later edits,
builds and Morph find the same piece.

## The file

```xml
<mxfile>
  <diagram name="Method">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="enc" value="Encoder" vertex="1" parent="1"
          style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;">
          <mxGeometry x="40" y="80" width="140" height="60" as="geometry" />
        </mxCell>
        <mxCell id="z" value="z" vertex="1" parent="1"
          style="ellipse;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;">
          <mxGeometry x="250" y="85" width="50" height="50" as="geometry" />
        </mxCell>
        <mxCell id="e1" edge="1" parent="1" source="enc" target="z"
          style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- Cells `0` (root) and `1` (the default layer) are required; shapes and
  connectors have `parent="1"` (or a group/container id).
- A vertex has `vertex="1"` and an `mxGeometry` box (x, y, width, height).
- A connector has `edge="1"`, `source` and `target` (vertex ids), and
  `<mxGeometry relative="1" as="geometry"/>`. Waypoints:
  `<Array as="points"><mxPoint x="200" y="40"/></Array>` inside the geometry.
  A loose end: `<mxPoint x=".." y=".." as="sourcePoint"/>` / `targetPoint`.
- A label on a connector: its own `value`, or a child cell
  `style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e1"` with
  `<mxGeometry x="-0.5" y="10" relative="1" as="geometry"/>` (x from -1 at
  the source to 1 at the target, y the offset across it).
- Group: a vertex with `style="group"`; children use it as `parent` and
  their geometry is relative to it.
- Labels with `html=1` are HTML (`<b>`, `<i>`, `<br>`, `<sub>`, `<sup>`,
  `<font color>`); without it, plain text. Escape `<` as `&lt;` in XML.

## Style keys

A style is `name;key=value;key=value;` — the leading name is optional
(`ellipse`, `rhombus`, `triangle`, `text`, `group`, `swimlane`, `edgeLabel`,
`line`, `image`). `key=none` removes a key; colours are `#rrggbb` or `none`.

**Shape** — `shape=` rectangle (default), ellipse, rhombus, triangle,
hexagon, cylinder3, cloud, process, document, card, note, step,
parallelogram, trapezoid, callout, cube, tape, internalStorage, dataStorage,
manualInput, delay, display, offPageConnector, loopLimit, curlyBracket,
singleArrow, doubleArrow, cross, plus, corner, tee, or, xor, sumEllipse,
lineEllipse, folder, component, module, umlActor, partialRectangle,
swimlane, line, image, … · `direction=` north|south|east|west ·
`rotation=` degrees · `flipH=1` `flipV=1` · `size=` (step, process, card,
note, document wave, …) · `aspect=fixed`.

**Fill and line** — `fillColor`, `gradientColor`, `gradientDirection=`
south|north|east|west|radial, `strokeColor`, `strokeWidth`, `dashed=1`,
`dashPattern=8 8`, `rounded=1`, `arcSize=` (percent), `absoluteArcSize=1`,
`opacity`, `fillOpacity`, `strokeOpacity` (0–100), `shadow=1`, `glass=1`.

**Text** — `fontSize`, `fontFamily`, `fontColor`, `fontStyle=` bits (1 bold,
2 italic, 4 underline, 8 strike — add them), `align=` left|center|right,
`verticalAlign=` top|middle|bottom, `labelPosition=` left|center|right and
`verticalLabelPosition=` top|middle|bottom (to put the label outside the
shape), `spacing`, `spacingTop/Left/Bottom/Right`, `whiteSpace=wrap`,
`html=1`, `labelBackgroundColor`, `labelBorderColor`, `horizontal=0`
(vertical text), `textOpacity`.

**Connectors** — `edgeStyle=` (absent: straight) orthogonalEdgeStyle |
elbowEdgeStyle (`elbow=vertical|horizontal`) | entityRelationEdgeStyle |
segmentEdgeStyle | loopEdgeStyle; `rounded=1`, `curved=1`; `endArrow`,
`startArrow`: classic, classicThin, block, blockThin, open, openThin,
openAsync, async, oval, diamond, diamondThin, box, halfCircle, dash, cross,
circle, circlePlus, baseDash, doubleBlock, ERone, ERmandOne, ERmany,
ERoneToMany, ERzeroToOne, ERzeroToMany, none; `endFill=0|1`,
`endSize`, `startSize`; ports: `exitX`, `exitY`, `entryX`, `entryY` (0–1 on
the shape's box, e.g. `exitX=1;exitY=0.5` leaves from the right middle),
`exitDx/exitDy`, `exitPerimeter=0`; `jettySize=auto|<px>`;
`perimeterSpacing`, `sourcePerimeterSpacing`, `targetPerimeterSpacing`;
`shape=flexArrow` (a fat arrow), `shape=link`, `shape=pipe`.

## Good defaults for paper figures

- One font for the whole figure (`fontFamily=Helvetica` or the deck's),
  `fontSize=14`–`18` at scale 1, `strokeWidth=1.5`–`2`.
- A small palette: draw.io's pastel pairs read well and print well —
  `fillColor=#dae8fc;strokeColor=#6c8ebf` (blue), `#d5e8d4/#82b366` (green),
  `#ffe6cc/#d79b00` (orange), `#f8cecc/#b85450` (red), `#e1d5e7/#9673a6`
  (purple), `#fff2cc/#d6b656` (yellow), `#f5f5f5/#666666` (grey).
- Orthogonal connectors (`edgeStyle=orthogonalEdgeStyle;rounded=0`) with
  `endArrow=block;endFill=1` for pipelines; straight ones for graphs.
- Align on a 10 px grid; equal gaps; equal sizes for peers.

## Animation

A diagram's builds are draw.io's animation steps. `diagram export` writes
the slide's builds on the diagram's cells into the file (the `animation`
attribute of the root cell, `<UserObject id="0" animation="…">`, as draw.io
keeps it), `diagram apply` and `diagram import` read them back as builds,
and draw.io desktop opens the file animated (Extras ▸ Animation).

```json
{"animation":{"steps":[
  {"opacity":{"cells":["*"],"value":0}},
  {"fadeIn":{"cells":["enc"],"delay":400}},
  {"wait":800},
  {"wipeIn":{"cells":["e-enc-z"]}},
  {"popIn":{"cells":["z"],"delay":600},"immediate":true},
  {"wait":500},
  {"wipeIn":{"cells":["e-z-dec"],"delay":700}},
  {"fadeIn":{"cells":["dec"]}},
  {"flow":{"cells":["e-z-dec"],"start":true},"immediate":true}
],"loop":false}}
```

**Every beat starts on a click.** draw.io plays its steps by itself; DeckWerk
waits for the presenter:

- each `wait` becomes the click that starts the next beat (its length is
  kept for writing back);
- the first beat is on a click too;
- the actions of one step, and steps marked `"immediate": true`, run
  together (*with previous*);
- steps without a `wait` between them run one after another inside the
  beat (*after previous*, no delay); nothing ever starts on a timer;
- an opening step that hides cells (`opacity` 0 on `*`) is how the diagram
  starts: cells a later step reveals start hidden; cells nothing reveals stay
  hidden.

| draw.io step | build |
|---|---|
| `fadeIn` / `fadeOut` (`delay` ms, default 1000) | appear / disappear, dissolve |
| `wipeIn` / `wipeOut` (default 900 ms) | appear / disappear, wipe: a connector draws on along its route with its arrowhead at the tip, a vertex grows from its left edge |
| `popIn` / `popOut` (default 900 ms) | appear / disappear, pop: draw.io's spring (connectors wipe) |
| `show` / `hide` / `toggle` | appear / disappear at once |
| `fadeTo` (`value` 0–1) / `opacity` | `opacity` build (animated / at once) |
| `flow` (`start` true, false or absent to toggle) | `flow` build: start / stop / toggle |
| `highlight` (`color`, `duration`, `opacity`) | `highlight` build: the outline, then a 1.2 s fade |
| anything else (`viewbox`, `scroll`, `style`, `tags`, …) | kept as a `drawio` build: not played, written back unchanged |

Selectors work as in draw.io: `cells` (`"*"` for all), `tags`
(`"tagsMatch":"or"` for any), `layers`, `descendants`, `excludeCells`. Old
text scripts (`show enc fade`, `wait 500`, …) are read too.

Writing back: if the slide's builds on the diagram are still exactly the
ones the stored animation reads as, the stored text is written verbatim;
otherwise the steps are written from the builds (a click is a `wait` of the
length the file had there, else 1000 ms; a build's delay is a `wait` too).
Applying a file without an `animation` leaves the slide's builds alone.

A connector with `flowAnimation=1` shows draw.io's moving dashes (or
`flowAnimationType=dot|ring`, with `flowAnimationDuration`, `…Direction`,
`…TimingFunction`, `…Count`, `…Loop`, `…Size`) in the player, the presenter
and the editor; PDF and the slide rail show it still.

**Build in order.** `slide-agent diagram build . --slide 5` makes one appear
build per cell, each on its own click: vertices along the connectors from
their sources (or `--order reading`: top to bottom, left to right), each
connector drawn once both its ends are in. `--cells enc,z,dec` limits it;
`--vertex-effect`, `--connector-effect` and their `--…-duration` change the
effects (defaults: dissolve 400 ms, wipe 900 ms). Earlier builds of those
cells are replaced. The Build panel's *Build diagram in order* does the same
for the selected cells (or the whole diagram), as one undo step.

**Morph.** With Morph on for a slide, cells pair with the previous slide's by
draw.io id: vertices slide between their boxes, connectors are re-routed by
draw.io's router every frame (not morphed path to path), and changed labels
and styles cross-fade.
