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
