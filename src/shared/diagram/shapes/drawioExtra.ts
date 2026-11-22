/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Shapes.js — the remaining shapes it registers: tableLine,
 * table, tableRow, tie, the sequence-diagram participant icons (seqBoundary,
 * seqControl, seqEntity, seqQueue, seqCollections, seqDatabase,
 * seqActorStick), curvedText, the gitgraph shapes (gitTag, gitMergeCommit,
 * gitCherryPick), mindmapBang, ishikawaHead and the mermaid shapes
 * (mermaidOdd, mermaidPerson, mermaidUsecaseActor, mermaidBlockArrow,
 * mermaidSankeyLink), and their connection points.
 * Modified for DeckWerk: the parts that read the graph are left out, so
 * shapes paint as draw.io paints them for a cell without children or
 * view state: tables paint no row/column lines, stripes or collapsed
 * borders (tableRender=collapsed), ties have no tie layout, and curvedText
 * paints no text along its arc (labels are drawn elsewhere). The
 * mix-blend-mode of the sankey band, label bounds and handles are left out;
 * the painting code is otherwise unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import type { Point, Rect } from '../types.js';
import { ELLIPSE_CONSTRAINTS, RECTANGLE_CONSTRAINTS, RectangleShape, Swimlane } from './basic.js';
import { Connector } from './edges.js';
import { PartialRectangleShape } from './flowchart.js';
import { Actor, Shape, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { UmlControlShape } from './uml.js';
import { NONE, getFloat, getNumber, getValue, looseEq, truthy } from './util.js';

// --- Table line -----------------------------------------------------------------------------

/** TableLineShape: a polyline of table grid points (null points break the line). */
export class TableLineShape extends Shape {
  line: Array<Point | null> | null;

  constructor(line?: Array<Point | null> | null, stroke?: string | null, strokewidth?: number | null) {
    super();
    this.line = line ?? null;
    if (stroke !== undefined) this.stroke = stroke;
    this.strokewidth = (strokewidth != null) ? strokewidth : 1;
    this.updateBoundsFromLine();
  }

  updateBoundsFromLine(): void {
    let box: Rect | null = null;

    if (this.line != null) {
      for (let i = 0; i < this.line.length; i++) {
        const curr = this.line[i];

        if (curr != null) {
          const temp = { x: curr.x, y: curr.y, width: this.strokewidth, height: this.strokewidth };

          if (box == null) {
            box = temp;
          } else {
            // mxRectangle.add
            const minX = Math.min(box.x, temp.x);
            const minY = Math.min(box.y, temp.y);
            const maxX = Math.max(box.x + box.width, temp.x + temp.width);
            const maxY = Math.max(box.y + box.height, temp.y + temp.height);
            box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
        }
      }
    }

    this.bounds = (box != null) ? box : { x: 0, y: 0, width: 0, height: 0 };
  }

  override paintVertexShape(c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void {
    this.paintTableLine(c, this.line, 0, 0);
  }

  paintTableLine(c: SvgCanvas, line: Array<Point | null> | null, dx: number, dy: number): void {
    if (line != null) {
      let last: Point | null = null;
      c.begin();

      for (let i = 0; i < line.length; i++) {
        const curr = line[i];

        if (curr != null) {
          if (last == null) {
            c.moveTo(curr.x + dx, curr.y + dy);
          } else if (last != null) {
            c.lineTo(curr.x + dx, curr.y + dy);
          }
        }

        last = curr;
      }

      c.end();
      c.stroke();
    }
  }
}

// --- Table and table row --------------------------------------------------------------------

/**
 * Table Shape. Without a graph the cell is neither collapsed nor rendered
 * with collapsed borders, and has no rows or cells, so the foreground (the
 * stripes and the row and column lines of the children) paints nothing.
 */
export class TableShape extends Swimlane {
  override fixedHeaderDefault = false;

  // Paints the glass effect on the title (see paintCollapsedTable)
  override isGlassable(): boolean {
    return this.getTitleSize() > 0;
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // graph.isCellCollapsed(this.state.cell) needs the graph
    const collapsed = false;

    if (!collapsed && this.isCollapsedRender()) {
      // paintCollapsedTable needs the rows and cells of the graph
      return;
    }

    const horizontal = this.isHorizontal();
    const start = this.getTitleSize();
    const fixedHeader = getValue(this.style, 'fixedHeader', this.fixedHeaderDefault);

    if (start === 0 && this.isRounded && !this.outline) {
      // Headerless rounded table: PartialRectangleShape has no arc
      // support and the swimlane path derives its arc from the title
      // size (0 here), so both paint square corners. Paint the
      // rounded background directly with the rectangle arc.
      const r = Shape.prototype.getArcSize.call(this, w, h);
      c.begin();
      c.roundrect(x, y, w, h, r, r);
      c.fillAndStroke();
    } else if ((start === 0 && !truthy(fixedHeader)) || this.outline) {
      // drawHidden is a field of PartialRectangleShape only, so it is
      // undefined (false) for tables, as in draw.io
      PartialRectangleShape.prototype.paintVertexShape.call(this, c, x, y, w, h);
    } else {
      super.paintVertexShape(c, x, y, w, h);
      c.translate(-x, -y);
    }

    if (!collapsed && !this.outline && ((horizontal && start < h) || (!horizontal && start < w))) {
      this.paintForeground(c, x, y, w, h);
    }
  }

  /**
   * Paints the stripes and the table lines of the rows and cells, which
   * need the graph (this.state is null here, so nothing is painted).
   */
  override paintForeground(_c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void {
    // this.state == null
  }

  /**
   * Returns true if the table has a color for the odd or even rows or
   * columns (evenRowColor, oddRowColor, evenColumnColor, oddColumnColor).
   */
  hasStripes(): boolean {
    const keys = ['evenRowColor', 'oddRowColor', 'evenColumnColor', 'oddColumnColor'];

    for (let i = 0; i < keys.length; i++) {
      if (!looseEq(getValue(this.style, keys[i], NONE), NONE)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns true if this table paints its rows and cells with collapsed
   * borders (tableRender=collapsed, see Graph.isCollapsedTable), which
   * needs the graph: false without one (this.state == null).
   */
  isCollapsedRender(): boolean {
    return false;
  }

  /**
   * Disables the shadow filter on the shape node of a collapsed table, which
   * would add shadows to all fills and borders of the rows and cells. The
   * shadow is added to the table background in paintCollapsedTable.
   */
  override isShadowEnabled(): boolean {
    return super.isShadowEnabled() && !this.isCollapsedRender();
  }
}

/** Table Row Shape. */
export class TableRowShape extends TableShape {
  override isGlassable(): boolean {
    return false;
  }

  override paintForeground(): void {
    // overridden to do nothing
  }
}

// --- Tie ------------------------------------------------------------------------------------

/** The tie layout of mxGraphView.updateTieLayout: the length and direction across the lanes. */
export interface TieLayout {
  length: number;
  direction: Point;
}

/**
 * Tie Shape, paints a line across the lanes of the tie (see
 * mxGraphView.updateTieLayout) with the stroke of the tie and a head at
 * one end that scales with the stroke width
 */
export class TieShape extends Shape {
  /** this.state.tieLayout: needs the view, so null here. */
  tieLayout: TieLayout | null = null;

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const layout = this.tieLayout;
    const length = (layout != null) ? layout.length : 12;
    const sw = Math.max(0, Math.min(100, this.strokewidth));
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (layout != null) {
      c.rotate(Math.atan2(layout.direction.y, layout.direction.x) * 180 / Math.PI,
        false, false, cx, cy);
    }

    c.setLineCap('round');
    c.begin();
    c.moveTo(cx, cy - length / 2);
    c.lineTo(cx, cy + length / 2);
    c.stroke();

    c.setFillColor(this.stroke);
    c.rect(cx - sw, cy + length / 2, 2 * sw, 1.5 * sw);
    c.fill();
  }
}

// --- Sequence-diagram participant icons -----------------------------------------------------

/**
 * makeSeqIcon: paints an icon shape at a fixed pixel size centered
 * horizontally at the top of the cell. The icon's painting runs with this
 * shape as `this` (a plain mxShape), as IconCtor.prototype.*.call(this) does.
 */
export class SeqIconShape extends Shape {
  iconSize = 44;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const size = Math.min(this.iconSize, w, h);
    const cx = x + (w - size) / 2;
    this.paintIcon(c, cx, y, size, size);
  }

  paintIcon(_c: SvgCanvas, _x: number, _y: number, _w: number, _h: number): void { /* hook */ }
}

/** makeSeqIcon(UmlControlShape, 44): the icon has paintBackground and paintForeground. */
export class SeqControlShape extends SeqIconShape {
  override paintIcon(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    UmlControlShape.prototype.paintBackground.call(this, c, x, y, w, h);
    UmlControlShape.prototype.paintForeground.call(this, c, x, y, w, h);
  }
}

/**
 * makeSeqIcon(UmlEntityShape, 44): UmlEntityShape.paintVertexShape with this
 * shape as `this`, so mxEllipse.paintVertexShape skips paintCenter (a plain
 * mxShape has none) and the glass effect is the one of mxShape.
 */
export class SeqEntityShape extends SeqIconShape {
  override paintIcon(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // mxEllipse.prototype.paintVertexShape (with the glass of Shapes.js)
    c.ellipse(x, y, w, h);
    c.fillAndStroke();

    if (this.glass && !this.outline && this.fill != null && this.fill !== NONE) {
      this.paintGlassEffect(c, x, y, w, h, 0);
    }

    c.begin();
    c.moveTo(x + w / 8, y + h);
    c.lineTo(x + w * 7 / 8, y + h);
    c.end();
    c.stroke();
  }
}

// Mermaid's drawActorTypeBoundary renders a wider non-square icon:
// a 20-px-tall vertical bar with a 40-px horizontal handler joining
// it to a 44-px-diameter circle on the right.
export class SeqBoundaryShape extends Shape {
  iconSize = 44;

  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const size = Math.min(this.iconSize, w, h);
    const circleR = size / 2;
    // Handler ~ size*0.9 — close to mermaid's 40 px on a 44 px icon.
    const handlerW = size * 0.9;
    // Bar ~ size*0.45 (mermaid: 20 on 44).
    const barH = size * 0.45;
    // Mermaid centers the CIRCLE on the lifeline (cx = actor.centerX).
    // The bar+handler extend to the LEFT of the circle.
    const circleCx = x + w / 2;
    const circleX = circleCx - circleR;
    const cy = y + size / 2;
    // Handler ends just inside the circle's left edge so the line
    // visually meets the circle.
    const handlerEndX = circleX + handlerW * 0.175;
    const leftX = handlerEndX - handlerW;

    // Vertical bar at the left
    c.begin();
    c.moveTo(leftX, cy - barH / 2);
    c.lineTo(leftX, cy + barH / 2);
    c.end();
    c.stroke();

    // Horizontal handler from bar to circle
    c.begin();
    c.moveTo(leftX, cy);
    c.lineTo(handlerEndX, cy);
    c.end();
    c.stroke();

    // Circle centered on the cell's horizontal center
    c.ellipse(circleX, y, size, size);
    c.fillAndStroke();
  }
}

// Mermaid sequence-diagram queue actor type — horizontal cylinder
// rendered as a stadium pill with an inner arc on the right showing
// depth. Mirrors drawActorTypeQueue in mermaid.js: rx = ry/(2.5+h/50)
// where ry = h/2.
export class SeqQueueShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const ry = h / 2;
    const rx = ry / (2.5 + h / 50);
    c.save();
    c.translate(x, y);

    c.begin();
    c.moveTo(rx, 0);
    c.lineTo(w - rx, 0);
    c.arcTo(rx, ry, 0, 0, 1, w - rx, h);
    c.lineTo(rx, h);
    c.arcTo(rx, ry, 0, 0, 1, rx, 0);
    c.close();
    c.fillAndStroke();
    c.restore();
  }

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    // Wrap in save/restore: mxShape.paintVertexShape does not
    // save/restore between background and foreground.
    const ry = h / 2;
    const rx = ry / (2.5 + h / 50);
    c.save();
    c.translate(x, y);

    c.begin();
    c.moveTo(w - rx, 0);
    c.arcTo(rx, ry, 0, 0, 0, w - rx, h);
    c.stroke();
    c.restore();
  }
}

// Mermaid sequence-diagram collections actor type — two stacked
// rectangles with the back rect offset by (+6, -6) px (top-right).
export class SeqCollectionsShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const off = 6;
    c.rect(x + off, y - off, w, h);
    c.fillAndStroke();
    c.rect(x, y, w, h);
    c.fillAndStroke();
  }
}

// Mermaid sequence-diagram database actor type — vertical cylinder
// painted at w/3 size (mirrors mermaid drawActorTypeDatabase: w4 = h3
// = w/3, rx = w4/2, ry = rx/(2.5+w4/50)). Cylinder centered horizontally.
export class SeqDatabaseShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, _h: number): void {
    const iconW = w / 3;
    const iconH = w / 3;
    const rx = iconW / 2;
    const ry = rx / (2.5 + iconW / 50);
    const cx = x + (w - iconW) / 2;

    // Mermaid path: M(0,ry) a(rx,ry,...,w,0) a(rx,ry,...,-w,0) l(0,h-2ry)
    // a(rx,ry,...,w,0) l(0,-(h-2ry)). First two arcs draw the top "lid"
    // (full ellipse), sides + bottom arc complete the cylinder.
    c.translate(cx, y);

    c.begin();
    c.moveTo(0, ry);
    c.arcTo(rx, ry, 0, 0, 0, iconW, ry);
    c.arcTo(rx, ry, 0, 0, 0, 0, ry);
    c.lineTo(0, iconH - ry);
    c.arcTo(rx, ry, 0, 0, 0, iconW, iconH - ry);
    c.lineTo(iconW, ry);
    c.fillAndStroke();
  }
}

// Mermaid sequence-diagram actor (`actor Foo` — stick figure): a fixed
// ~50 x 60 px stick figure anchored to the top of the cell.
export class SeqActorStickShape extends Shape {
  override paintBackground(c: SvgCanvas, x: number, y: number, w: number, _h: number): void {
    const headR = 15;
    const torsoH = 20;
    const armsW = 36;
    const legsH = 15;
    const legsW = 32;
    const cx = x + w / 2;
    const topY = y;
    const headCY = topY + headR;
    const torsoTop = headCY + headR;
    const torsoBot = torsoTop + torsoH;
    const armsY = torsoTop + torsoH / 2;
    const legsBot = torsoBot + legsH;

    c.ellipse(cx - headR, headCY - headR, headR * 2, headR * 2);
    c.fillAndStroke();

    c.begin();
    c.moveTo(cx, torsoTop);
    c.lineTo(cx, torsoBot);
    c.moveTo(cx - armsW / 2, armsY);
    c.lineTo(cx + armsW / 2, armsY);
    c.moveTo(cx, torsoBot);
    c.lineTo(cx - legsW / 2, legsBot);
    c.moveTo(cx, torsoBot);
    c.lineTo(cx + legsW / 2, legsBot);
    c.stroke();
  }
}

// --- Curved text ----------------------------------------------------------------------------

/**
 * CurvedTextShape - renders cell label along a curved path. The text needs
 * the cell's label (this.state), so only the rectangle is painted here.
 */
export class CurvedTextShape extends RectangleShape {
  arcStartY = 25;
  arcMidY = -25;
  arcEndY = 25;

  override paintForeground(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintForeground(c, x, y, w, h);
    // this.state == null: the label along the arc is not painted here
  }
}

// --- Gitgraph shapes ------------------------------------------------------------------------

// Gitgraph commit tag shape — a paper-tag silhouette with a pointed
// left tab and a pierce-hole circle. Params:
//   tabSize    — horizontal extent of the pointed tab (default 8)
//   tabInset   — height of the flat tip of the tab (default 4)
//   holeSize   — radius of the pierce hole (default 1.5)
//   holeColor  — fill color of the pierce hole (default #333)
export class GitTagShape extends Actor {
  tabSize = 8;
  tabInset = 4;
  holeSize = 1.0;
  override constraints: readonly ConnectionConstraint[] | null = RECTANGLE_CONSTRAINTS;

  override isRoundable(): boolean {
    return false;
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const tabSize = Math.max(0, Math.min(w, getFloat(this.style, 'tabSize', this.tabSize)));
    const tabInset = Math.max(0, Math.min(h, getFloat(this.style, 'tabInset', this.tabInset)));
    const tabY1 = (h - tabInset) / 2;
    const tabY2 = tabY1 + tabInset;

    c.moveTo(0, tabY1);
    c.lineTo(0, tabY2);
    c.lineTo(tabSize, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.lineTo(tabSize, 0);
    c.close();
    c.end();
  }

  // mxActor's paintVertexShape applies c.translate(x, y) then calls
  // redrawPath + fillAndStroke, and does not invoke paintForeground. So
  // we override paintVertexShape to call super and then draw the hole in
  // the same translated frame (local coords starting at 0, 0).
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    super.paintVertexShape(c, x, y, w, h);

    const holeSize = Math.max(0, getFloat(this.style, 'holeSize', this.holeSize));

    if (holeSize <= 0) {
      return;
    }

    const tabSize = getFloat(this.style, 'tabSize', this.tabSize);
    const holeColor = String(getValue(this.style, 'holeColor', getValue(this.style, 'fontColor', '#333333')));

    c.setFillColor(holeColor);
    c.setStrokeColor(holeColor);
    c.begin();
    c.ellipse(tabSize / 2 - holeSize, h / 2 - holeSize, holeSize * 2, holeSize * 2);
    c.fillAndStroke();
  }
}

// Gitgraph merge-commit shape — outer branch-colored circle with an
// inner lavender circle, rendered as a single cell (no group/children).
export class GitMergeCommitShape extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const innerColor = String(getValue(this.style, 'innerColor', '#ECECFF'));

    c.translate(x, y);

    c.ellipse(0, 0, w, h);
    c.fillAndStroke();

    const innerD = Math.min(w, h) * 0.6;
    const ix = (w - innerD) / 2;
    const iy = (h - innerD) / 2;

    c.setFillColor(innerColor);
    c.setStrokeColor(innerColor);
    c.ellipse(ix, iy, innerD, innerD);
    c.fillAndStroke();
  }
}

// Gitgraph cherry-pick shape — dark circle with two white "eye"
// circles and two white stem lines forming an inverted V.
export class GitCherryPickShape extends Shape {
  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const featureColor = String(getValue(this.style, 'featureColor', '#fff'));

    c.translate(x, y);

    const cx = w / 2;
    const cy = h / 2;
    const s = Math.min(w, h) / 20;

    c.ellipse(0, 0, w, h);
    c.fillAndStroke();

    c.setFillColor(featureColor);
    c.setStrokeColor(featureColor);
    c.setStrokeWidth(0);

    const eyeR = 2.75 * s;

    c.ellipse(cx - 3 * s - eyeR, cy + 2 * s - eyeR, eyeR * 2, eyeR * 2);
    c.fillAndStroke();
    c.ellipse(cx + 3 * s - eyeR, cy + 2 * s - eyeR, eyeR * 2, eyeR * 2);
    c.fillAndStroke();

    c.setStrokeWidth(1 * s);
    c.begin();
    c.moveTo(cx + 3 * s, cy + 1 * s);
    c.lineTo(cx, cy - 5 * s);
    c.stroke();
    c.begin();
    c.moveTo(cx - 3 * s, cy + 1 * s);
    c.lineTo(cx, cy - 5 * s);
    c.stroke();
  }
}

// --- Mindmap and ishikawa shapes ------------------------------------------------------------

// Mermaid mindmap bang shape: starburst silhouette used for `id))label((`
// nodes. Drawn as a sequence of elliptical arcs forming 4 scallops on
// top, 3 on each side and 4 on bottom — direct port of mermaid's
// `bang.ts` shape.
export class MindmapBangShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override isRoundable(): boolean {
    return false;
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    // Path natural bbox = 1.25*W wide × 1.25*H tall (corner spikes
    // extend 0.10–0.15 in each direction). To fit the cell rect,
    // cap design dims at 0.8 of cell and offset M by `0.10*W` /
    // `0.10*H` so the outermost spike tips touch the cell edges
    // without clipping.
    const W = w * 0.8;
    const H = h * 0.8;
    const r = W * 0.15;
    const r80 = r * 0.8;
    const ox = W * 0.10;
    const oy = H * 0.10;

    // Start point — top-left of the design rectangle.
    let px = ox;
    let py = oy;
    c.moveTo(px, py);

    // Top: 4 arcs left→right; corners spike up by 0.1*H.
    px += W * 0.25; py += -H * 0.10; c.arcTo(r, r, 0, 0, 0, px, py);
    px += W * 0.25; py += 0; c.arcTo(r, r, 0, 0, 0, px, py);
    px += W * 0.25; py += 0; c.arcTo(r, r, 0, 0, 0, px, py);
    px += W * 0.25; py += H * 0.10; c.arcTo(r, r, 0, 0, 0, px, py);

    // Right: 3 arcs top→bottom; middle spike protrudes right.
    px += W * 0.15; py += H * 0.33; c.arcTo(r, r, 0, 0, 0, px, py);
    px += 0; py += H * 0.34; c.arcTo(r80, r80, 0, 0, 0, px, py);
    px += -W * 0.15; py += H * 0.33; c.arcTo(r, r, 0, 0, 0, px, py);

    // Bottom: 4 arcs right→left; corners spike down by 0.15*H.
    px += -W * 0.25; py += H * 0.15; c.arcTo(r, r, 0, 0, 0, px, py);
    px += -W * 0.25; py += 0; c.arcTo(r, r, 0, 0, 0, px, py);
    px += -W * 0.25; py += 0; c.arcTo(r, r, 0, 0, 0, px, py);
    px += -W * 0.25; py += -H * 0.15; c.arcTo(r, r, 0, 0, 0, px, py);

    // Left: 3 arcs bottom→top; middle spike protrudes left.
    px += -W * 0.10; py += -H * 0.33; c.arcTo(r, r, 0, 0, 0, px, py);
    px += 0; py += -H * 0.34; c.arcTo(r80, r80, 0, 0, 0, px, py);
    px += W * 0.10; py += -H * 0.33; c.arcTo(r, r, 0, 0, 0, px, py);

    c.close();
    c.end();
  }
}

// Ishikawa fish-head shape — flat left edge with a quadratic-curve
// right side forming a pointed teardrop, matching upstream mermaid's
// ishikawa-head path: M 0 -h/2 L 0 h/2 Q 2w 0 0 -h/2 Z
export class IshikawaHeadShape extends Actor {
  override isRoundable(): boolean {
    return false;
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    c.moveTo(0, 0);
    c.lineTo(0, h);
    c.quadTo(2 * w, h / 2, 0, 0);
    c.close();
    c.end();
  }
}

// --- Mermaid shapes -------------------------------------------------------------------------

// Mermaid "odd" / rect_left_inv_arrow shape: a rectangle with a
// left-pointing chevron on the left side.
export class OddShape extends Actor {
  override constraints: readonly ConnectionConstraint[] | null = ELLIPSE_CONSTRAINTS;

  override isRoundable(): boolean {
    return false;
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const notch = h / 4;

    c.moveTo(0, 0);
    c.lineTo(notch, h / 2);
    c.lineTo(0, h);
    c.lineTo(w, h);
    c.lineTo(w, 0);
    c.close();
    c.end();
  }
}

/** The head radius, the top and height of the body and the body corner radius. */
export interface MermaidPersonGeometry {
  headRadius: number;
  bodyTop: number;
  bodyHeight: number;
  bodyRadius: number;
}

// Person shape of mermaid's C4 diagrams and flowchart `@{shape: person}`
// (mermaid 11.17, rendering-elements/shapes/person.ts): a circular head
// drawn over a rounded body with the c4model.com proportions. The head
// radius is 0.23 of the width, clamped to 16..56 so that a wide body keeps
// a person-sized head, the head overlaps the body by 0.27 of its radius,
// and the body corners are 0.177 of the width (at most 0.45 of the body
// height).
export class MermaidPersonShape extends Shape {
  /**
   * Returns the head radius, the top and height of the body and the body
   * corner radius for the given size.
   */
  static getGeometry(w: number, h: number): MermaidPersonGeometry {
    const headRadius = Math.min(Math.max(w * 0.23, 16), 56);
    const bodyTop = Math.min(h, 2 * headRadius - headRadius * 0.27);
    const bodyHeight = h - bodyTop;

    return {
      headRadius, bodyTop, bodyHeight,
      bodyRadius: Math.max(0, Math.min(w * 0.177, bodyHeight * 0.45)),
    };
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    const g = MermaidPersonShape.getGeometry(w, h);
    const r = g.headRadius;

    const head = () => {
      c.ellipse(x + w / 2 - r, y, 2 * r, 2 * r);
      c.fillAndStroke();
    };

    // The head is drawn over the body so the full circle stays visible.
    // With a shadow, the head is painted first as well so its shadow
    // falls behind the body instead of onto it.
    if (this.isShadow) {
      head();
    }

    c.roundrect(x, y + g.bodyTop, w, g.bodyHeight, g.bodyRadius, g.bodyRadius);
    c.fillAndStroke();
    c.setShadow(false);
    head();
  }
}

// Actor of Mermaid's use case diagrams (Mermaid 12, shapes/usecaseActor.ts,
// usecaseActorHollow.ts and usecaseActorAwesome.ts): the paths of the 56 x 72
// figure, scaled to the cell. actorType selects the figure: normal (stick
// figure with a filled head), hollow (unfilled head over a block outline
// body) or awesome (filled bust). business=1 adds the slash through the
// head of a business actor.
export class MermaidUsecaseActorShape extends Shape {
  /**
   * Width and height of the figure the paths are defined in, centered at 0,0.
   */
  figureWidth = 56;
  figureHeight = 72;

  /**
   * Head circle (center y and radius) of each figure. The business slash is
   * a chord through it.
   */
  heads: Record<string, [number, number]> = { normal: [-24, 12], hollow: [-23, 9], awesome: [-21, 13] };

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    let type = String(getValue(this.style, 'actorType', 'normal'));
    type = (Object.prototype.hasOwnProperty.call(this.heads, type) && this.heads[type] != null) ? type : 'normal';
    const sx = w / this.figureWidth;
    const sy = h / this.figureHeight;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const px = (value: number) => cx + value * sx;
    const py = (value: number) => cy + value * sy;

    // Closed circle of four cubic arcs, as Mermaid draws the heads
    const circle = (ccy: number, r: number) => {
      const k = r * 0.55228;
      c.moveTo(px(0), py(ccy + r));
      c.curveTo(px(k), py(ccy + r), px(r), py(ccy + k), px(r), py(ccy));
      c.curveTo(px(r), py(ccy - k), px(k), py(ccy - r), px(0), py(ccy - r));
      c.curveTo(px(-k), py(ccy - r), px(-r), py(ccy - k), px(-r), py(ccy));
      c.curveTo(px(-r), py(ccy + k), px(-k), py(ccy + r), px(0), py(ccy + r));
      c.close();
    };

    c.begin();

    if (type === 'hollow') {
      circle(-23, 9);
      c.moveTo(px(-22), py(-10));
      c.lineTo(px(22), py(-10));
      c.lineTo(px(22), py(0));
      c.lineTo(px(6), py(0));
      c.lineTo(px(22), py(17));
      c.lineTo(px(13), py(28));
      c.lineTo(px(0), py(13));
      c.lineTo(px(-13), py(28));
      c.lineTo(px(-22), py(17));
      c.lineTo(px(-6), py(0));
      c.lineTo(px(-22), py(0));
      c.close();
      c.stroke();
    } else if (type === 'awesome') {
      circle(-21, 13);
      c.moveTo(px(-24), py(25));
      c.curveTo(px(-24), py(7), px(-14), py(-3), px(0), py(-3));
      c.curveTo(px(14), py(-3), px(24), py(7), px(24), py(25));
      c.curveTo(px(24), py(28), px(21), py(30), px(18), py(30));
      c.lineTo(px(-18), py(30));
      c.curveTo(px(-21), py(30), px(-24), py(28), px(-24), py(25));
      c.close();
      c.fillAndStroke();
    } else {
      // The lines enclose no area, so only the head is filled
      circle(-24, 12);
      c.moveTo(px(0), py(-12));
      c.lineTo(px(0), py(8));
      c.moveTo(px(-17), py(-5));
      c.lineTo(px(17), py(-5));
      c.moveTo(px(0), py(8));
      c.lineTo(px(-15), py(28));
      c.moveTo(px(0), py(8));
      c.lineTo(px(15), py(28));
      c.fillAndStroke();
    }

    if (looseEq(getValue(this.style, 'business', '0'), '1')) {
      // Mermaid's businessMarkerPathForCircle: a chord at 60 degrees,
      // offset from the center of the head by 0.6 of its radius
      const head = this.heads[type];
      const r = head[1];
      const offset = r * 0.6;
      const half = r * Math.sqrt(1 - 0.36);
      const dx = Math.cos(Math.PI / 3);
      const dy = -Math.sin(Math.PI / 3);
      const mx = offset * -dy;
      const my = head[0] + offset * dx;

      c.setShadow(false);
      c.begin();
      c.moveTo(px(mx - half * dx), py(my - half * dy));
      c.lineTo(px(mx + half * dx), py(my + half * dy));
      c.stroke();
    }
  }
}

// Block-arrow shape used by the mermaid block diagram. Verbatim port
// of mermaid's blockArrowHelper getArrowPoints — every direction
// combination renders as one closed polygon.
export class MermaidBlockArrowShape extends Actor {
  override isRoundable(): boolean {
    return false;
  }

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.setLineJoin('round');
    super.paintVertexShape(c, x, y, w, h);
  }

  override redrawPath(c: SvgCanvas, _x: number, _y: number, w: number, h: number): void {
    const dirsStr = String(getValue(this.style, 'dirs', 'right'));
    const directions = new Set<string>();
    dirsStr.split(/[,| ]+/).forEach((d) => {
      d = d.trim().toLowerCase();
      if (d === 'x') { directions.add('right'); directions.add('left'); }
      else if (d === 'y') { directions.add('up'); directions.add('down'); }
      else if (d) { directions.add(d); }
    });
    const right = directions.has('right');
    const left = directions.has('left');
    const up = directions.has('up');
    const down = directions.has('down');

    const nodePad = getFloat(this.style, 'nodePadding', '8');
    const midpoint = h / 2;
    const pad = nodePad / 2;
    let pts: number[][];

    if (right && left && up && down) {
      pts = [
        [0, 0], [midpoint, 0],
        [w / 2, 2 * pad],
        [w - midpoint, 0], [w, 0],
        [w, -h / 3], [w + 2 * pad, -h / 2], [w, -2 * h / 3], [w, -h],
        [w - midpoint, -h], [w / 2, -h - 2 * pad], [midpoint, -h],
        [0, -h], [0, -2 * h / 3], [-2 * pad, -h / 2], [0, -h / 3],
      ];
    } else if (right && left && up) {
      pts = [
        [midpoint, 0], [w - midpoint, 0],
        [w, -h / 2],
        [w - midpoint, -h], [midpoint, -h],
        [0, -h / 2],
      ];
    } else if (right && left && down) {
      pts = [
        [0, 0], [midpoint, -h], [w - midpoint, -h], [w, 0],
      ];
    } else if (right && up && down) {
      pts = [
        [0, 0], [w, -midpoint], [w, -h + midpoint], [0, -h],
      ];
    } else if (left && up && down) {
      pts = [
        [w, 0], [0, -midpoint], [0, -h + midpoint], [w, -h],
      ];
    } else if (right && left) {
      pts = [
        [midpoint, 0], [midpoint, -pad],
        [w - midpoint, -pad], [w - midpoint, 0],
        [w, -h / 2],
        [w - midpoint, -h], [w - midpoint, -h + pad],
        [midpoint, -h + pad], [midpoint, -h],
        [0, -h / 2],
      ];
    } else if (up && down) {
      pts = [
        [w / 2, 0],
        [0, -pad], [midpoint, -pad],
        [midpoint, -h + pad], [0, -h + pad],
        [w / 2, -h],
        [w, -h + pad],
        [w - midpoint, -h + pad], [w - midpoint, -pad],
        [w, -pad],
      ];
    } else if (right && up) {
      pts = [[0, 0], [w, -midpoint], [0, -h]];
    } else if (right && down) {
      pts = [[0, 0], [w, 0], [0, -h]];
    } else if (left && up) {
      pts = [[w, 0], [0, -midpoint], [w, -h]];
    } else if (left && down) {
      pts = [[w, 0], [0, 0], [w, -h]];
    } else if (right) {
      pts = [
        [midpoint, -pad], [w - midpoint, -pad], [w - midpoint, 0],
        [w, -h / 2],
        [w - midpoint, -h], [w - midpoint, -h + pad],
        [midpoint, -h + pad],
      ];
    } else if (left) {
      pts = [
        [midpoint, 0], [midpoint, -pad],
        [w - midpoint, -pad], [w - midpoint, -h + pad],
        [midpoint, -h + pad], [midpoint, -h],
        [0, -h / 2],
      ];
    } else if (up) {
      pts = [
        [midpoint, -pad],
        [midpoint, -h + pad], [0, -h + pad],
        [w / 2, -h],
        [w, -h + pad],
        [w - midpoint, -h + pad], [w - midpoint, -pad],
      ];
    } else if (down) {
      pts = [
        [w / 2, 0],
        [0, -pad], [midpoint, -pad],
        [midpoint, -h + pad],
        [w - midpoint, -h + pad], [w - midpoint, -pad],
        [w, -pad],
      ];
    } else {
      pts = [[0, 0], [w, 0], [w, -h], [0, -h]];
    }

    c.moveTo(pts[0][0], h + pts[0][1]);

    for (let i = 1; i < pts.length; i++) {
      c.lineTo(pts[i][0], h + pts[i][1]);
    }

    c.close();
    c.end();
  }
}

// Sankey flow band used by the mermaid sankey renderer. d3-sankey
// draws each link as the cubic `M x0,y0 C mx,y0 mx,y1 x1,y1`
// (mx = horizontal midpoint between the terminals) stroked at the
// band thickness. This shape paints the equivalent ribbon outline
// instead: the curve is sampled and offset perpendicular to its
// tangent by ±width/2 (matching SVG stroke geometry), closed with
// the butt caps at the ends, and filled. Style `width` is the band
// thickness.
export class MermaidSankeyLinkShape extends Connector {
  defaultWidth = 10;

  getEdgeWidth(): number {
    return Math.max(1, getNumber(this.style, 'width', this.defaultWidth));
  }

  override paintEdgeShape(c: SvgCanvas, pts: Point[]): void {
    const p0 = pts[0];
    const pe = pts[pts.length - 1];

    if (p0 == null || pe == null) {
      return;
    }

    const x0 = p0.x;
    const y0 = p0.y;
    const x1 = pe.x;
    const y1 = pe.y;
    const mx = (x0 + x1) / 2;
    const hw = this.getEdgeWidth() / 2;

    // Control points are (mx, y0) and (mx, y1), so the derivative
    // reduces to x'(t) = 3u²(mx-x0) + 3t²(x1-mx), y'(t) = 6ut(y1-y0).
    const n = 32;
    const side1: Point[] = [];
    const side2: Point[] = [];

    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x1;
      const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
      let dx = 3 * u * u * (mx - x0) + 3 * t * t * (x1 - mx);
      let dy = 6 * u * t * (y1 - y0);
      let len = Math.sqrt(dx * dx + dy * dy);

      if (len === 0) {
        dx = 1;
        dy = 0;
        len = 1;
      }

      const nx = -dy / len * hw;
      const ny = dx / len * hw;

      side1.push({ x: x + nx, y: y + ny });
      side2.push({ x: x - nx, y: y - ny });
    }

    c.begin();
    c.moveTo(side1[0].x, side1[0].y);

    for (let i = 1; i <= n; i++) {
      c.lineTo(side1[i].x, side1[i].y);
    }

    for (let i = n; i >= 0; i--) {
      c.lineTo(side2[i].x, side2[i].y);
    }

    c.close();
    // draw.io also sets mix-blend-mode:multiply on the band and isolation
    // on the group of the cells, which the canvas here cannot express
    c.fillAndStroke();
  }
}

/**
 * The shapes in the order Shapes.js registers them, without table, tableRow
 * and curvedText (DRAWIO_EXTRA_GRAPH_SHAPES).
 */
export const DRAWIO_EXTRA_SHAPES: Array<[string, ShapeClass]> = [
  ['tableLine', TableLineShape],
  ['tie', TieShape],
  ['seqBoundary', SeqBoundaryShape],
  ['seqControl', SeqControlShape],
  ['seqEntity', SeqEntityShape],
  ['seqQueue', SeqQueueShape],
  ['seqCollections', SeqCollectionsShape],
  ['seqDatabase', SeqDatabaseShape],
  ['seqActorStick', SeqActorStickShape],
  ['gitTag', GitTagShape],
  ['gitMergeCommit', GitMergeCommitShape],
  ['gitCherryPick', GitCherryPickShape],
  ['mindmapBang', MindmapBangShape],
  ['ishikawaHead', IshikawaHeadShape],
  ['mermaidOdd', OddShape],
  ['mermaidPerson', MermaidPersonShape],
  ['mermaidUsecaseActor', MermaidUsecaseActorShape],
  ['mermaidBlockArrow', MermaidBlockArrowShape],
  ['mermaidSankeyLink', MermaidSankeyLinkShape],
];

/**
 * The shapes of Shapes.js whose draw.io code reads the graph when the shape
 * has a cell state (graph.isCellCollapsed, graph.convertValueToString). The
 * ports paint what draw.io paints for a cell without children or label;
 * they are kept apart because the stub graph of the differential test has
 * neither method, so draw.io's side throws for them there.
 */
export const DRAWIO_EXTRA_GRAPH_SHAPES: Array<[string, ShapeClass]> = [
  ['table', TableShape],
  ['tableRow', TableRowShape],
  ['curvedText', CurvedTextShape],
];
