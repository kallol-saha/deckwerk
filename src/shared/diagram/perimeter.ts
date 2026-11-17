/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/view/mxPerimeter.js (RectanglePerimeter, EllipsePerimeter,
 * RhombusPerimeter, TrianglePerimeter, HexagonPerimeter),
 * js/grapheditor/Shapes.js (CenterPerimeter, LifelinePerimeter,
 * OrthogonalPerimeter, BackbonePerimeter, CalloutPerimeter,
 * ParallelogramPerimeter, TrapezoidPerimeter, StepPerimeter,
 * HexagonPerimeter2, CloudPerimeter, OutlinePerimeter,
 * MermaidPersonPerimeter, getOutlinePerimeterPoint, getCalloutOutline) and
 * js/grapheditor/Graph.js (roundedRectanglePerimeter,
 * roundedPolygonPerimeter, the getPerimeterFunction override, isRoundedPerimeter,
 * isRoundedPolygonPerimeter, getOutlineBounds and the rounded-perimeter helpers),
 * mxgraph/src/view/mxStyleRegistry.js (the names).
 * Modified for DeckWerk: plain typed functions; the view is fixed at scale 1
 * and translate 0 (draw.io's model coordinates); the outlines draw.io gets by
 * painting the shape (Graph.getRoundedPolygonOutline, getPerimeterOutline)
 * come from optional hooks on the vertex, and without them those perimeters
 * fall back exactly as draw.io does when it has no outline.
 */

import type { Point, Rect, Style } from './types.js';
import {
  DIRECTION_EAST, DIRECTION_NORTH, DIRECTION_SOUTH, DIRECTION_WEST,
  centerX, centerY, getDirectedBounds, getPerimeterPoint, getRotatedPoint, getValue,
  intersection, jsParseFloat, jsParseInt, toRadians, unscale,
} from './geometry.js';

/**
 * The terminal a perimeter is computed for (mxCellState of a vertex): its
 * unrotated box in page space and its resolved style.
 */
export interface PerimeterVertex extends Rect {
  style: Style;
  /** True if the shape is a stencil (legacy stencilFlipH/V, not a plain rectangle). */
  stencil?: boolean;
  /**
   * Graph.getRoundedPolygonOutline: the outline as painted (first subpath,
   * curves flattened, closed), stretched to the given perimeter bounds. Used
   * by cloudPerimeter and by polygons with roundedPerimeter=1. Without it
   * those use the plain perimeter, as draw.io does without an outline.
   */
  outline?: ((bounds: Rect) => Point[] | null) | null;
  /** Graph.getPerimeterOutline: the hull of what the shape paints (outlinePerimeter). */
  perimeterOutline?: ((bounds: Rect) => Point[] | null) | null;
}

/**
 * A perimeter function (mxPerimeter.*): the point where the line from the
 * center of `bounds` towards `next` leaves the shape, or the orthogonal
 * projection of `next` onto it.
 */
export type PerimeterFunction = (bounds: Rect, vertex: PerimeterVertex | null, next: Point, orthogonal: boolean) => Point | null;

/**
 * Scale of the view. DeckWerk routes in page units, which is draw.io's
 * model coordinates at 100%: scale 1, translate 0, one pixel per unit.
 */
const SCALE = 1;
const PIXEL_SIZE = 1;

// Default sizes of the shapes that the perimeters read (Shapes.js)
const UML_LIFELINE_SIZE = 40;
const CALLOUT_SIZE = 30;
const CALLOUT_POSITION = 0.5;
const CALLOUT_POSITION2 = 0.5;
const CALLOUT_BASE = 20;
const PARALLELOGRAM_SIZE = 0.2;
const PARALLELOGRAM_FIXED_SIZE = 20;
const TRAPEZOID_SIZE = 0.2;
const TRAPEZOID_FIXED_SIZE = 20;
const STEP_SIZE = 0.2;
const STEP_FIXED_SIZE = 20;
const HEXAGON_SIZE = 0.25;
const HEXAGON_FIXED_SIZE = 20;

// mxConstants
const LINE_ARCSIZE = 20;
const RECTANGLE_ROUNDING_FACTOR = 0.15;

function pt(x: number, y: number): Point {
  return { x, y };
}

// --- mxPerimeter.js ------------------------------------------------------------

/**
 * Describes a rectangular perimeter for the given bounds.
 *
 * bounds - the absolute bounds of the vertex.
 * vertex - the vertex.
 * next - the nearest neighbour point on the given edge.
 * orthogonal - Boolean that specifies if the orthogonal projection onto
 * the perimeter should be returned. If this is false then the intersection
 * of the perimeter and the line between the next and the center point is
 * returned.
 */
export const RectanglePerimeter: PerimeterFunction = (bounds, _vertex, next, orthogonal) => {
  const cx = centerX(bounds);
  const cy = centerY(bounds);
  const dx = next.x - cx;
  const dy = next.y - cy;
  const alpha = Math.atan2(dy, dx);
  const p = pt(0, 0);
  const pi = Math.PI;
  const pi2 = Math.PI / 2;
  const beta = pi2 - alpha;
  const t = Math.atan2(bounds.height, bounds.width);

  if (alpha < -pi + t || alpha > pi - t) {
    // Left edge
    p.x = bounds.x;
    p.y = cy - bounds.width * Math.tan(alpha) / 2;
  } else if (alpha < -t) {
    // Top Edge
    p.y = bounds.y;
    p.x = cx - bounds.height * Math.tan(beta) / 2;
  } else if (alpha < t) {
    // Right Edge
    p.x = bounds.x + bounds.width;
    p.y = cy + bounds.width * Math.tan(alpha) / 2;
  } else {
    // Bottom Edge
    p.y = bounds.y + bounds.height;
    p.x = cx + bounds.height * Math.tan(beta) / 2;
  }

  if (orthogonal) {
    if (next.x >= bounds.x &&
      next.x <= bounds.x + bounds.width) {
      p.x = next.x;
    } else if (next.y >= bounds.y &&
      next.y <= bounds.y + bounds.height) {
      p.y = next.y;
    }
    if (next.x < bounds.x) {
      p.x = bounds.x;
    } else if (next.x > bounds.x + bounds.width) {
      p.x = bounds.x + bounds.width;
    }
    if (next.y < bounds.y) {
      p.y = bounds.y;
    } else if (next.y > bounds.y + bounds.height) {
      p.y = bounds.y + bounds.height;
    }
  }

  return p;
};

/** Describes an elliptic perimeter. See RectanglePerimeter for the parameters. */
export const EllipsePerimeter: PerimeterFunction = (bounds, _vertex, next, orthogonal) => {
  const x = bounds.x;
  const y = bounds.y;
  const a = bounds.width / 2;
  const b = bounds.height / 2;
  const cx = x + a;
  const cy = y + b;
  const px = next.x;
  const py = next.y;

  // Truncates the direction to whole model units, as the previous code
  // did with whole pixels at scale 1, so that the result does not
  // depend on the scale or translate of the view
  const s = SCALE;
  const dx = jsParseInt(unscale(px - cx, s));
  const dy = jsParseInt(unscale(py - cy, s));

  if (dx == 0 && dy != 0) {
    return pt(cx, cy + b * dy / Math.abs(dy));
  } else if (dx == 0 && dy == 0) {
    return pt(px, py);
  }

  if (orthogonal) {
    if (py >= y && py <= y + bounds.height) {
      const ty = py - cy;
      let tx = Math.sqrt(a * a * (1 - (ty * ty) / (b * b))) || 0;

      if (px <= x) {
        tx = -tx;
      }

      return pt(cx + tx, py);
    }

    if (px >= x && px <= x + bounds.width) {
      const tx = px - cx;
      let ty = Math.sqrt(b * b * (1 - (tx * tx) / (a * a))) || 0;

      if (py <= y) {
        ty = -ty;
      }

      return pt(px, cy + ty);
    }
  }

  // Calculates the intersection on the side of the point relative to
  // the center, which avoids the loss of precision of the line equation
  // in absolute coordinates for large coordinates or steep directions
  const t = a * b / Math.sqrt(b * b * dx * dx + a * a * dy * dy);

  return pt(cx + t * dx, cy + t * dy);
};

/** Describes a rhombus (aka diamond) perimeter. See RectanglePerimeter for the parameters. */
export const RhombusPerimeter: PerimeterFunction = (bounds, _vertex, next, orthogonal) => {
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const px = next.x;
  const py = next.y;

  // Special case for intersecting the diamond's corners
  if (cx == px) {
    if (cy > py) {
      return pt(cx, y); // top
    } else {
      return pt(cx, y + h); // bottom
    }
  } else if (cy == py) {
    if (cx > px) {
      return pt(x, cy); // left
    } else {
      return pt(x + w, cy); // right
    }
  }

  let tx = cx;
  let ty = cy;

  if (orthogonal) {
    if (px >= x && px <= x + w) {
      tx = px;
    } else if (py >= y && py <= y + h) {
      ty = py;
    }
  }

  // In which quadrant will the intersection be?
  // set the slope and offset of the border line accordingly
  if (px < cx) {
    if (py < cy) {
      return intersection(px, py, tx, ty, cx, y, x, cy);
    } else {
      return intersection(px, py, tx, ty, cx, y + h, x, cy);
    }
  } else if (py < cy) {
    return intersection(px, py, tx, ty, cx, y, x + w, cy);
  } else {
    return intersection(px, py, tx, ty, cx, y + h, x + w, cy);
  }
};

/** Describes a triangle perimeter. See RectanglePerimeter for the parameters. */
export const TrianglePerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const direction = vertex != null ? getValue(vertex.style, 'direction', null) : null;
  const vertical = direction == DIRECTION_NORTH ||
    direction == DIRECTION_SOUTH;

  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  let cx = x + w / 2;
  let cy = y + h / 2;

  let start = pt(x, y);
  let corner = pt(x + w, cy);
  let end = pt(x, y + h);

  if (direction == DIRECTION_NORTH) {
    start = end;
    corner = pt(cx, y);
    end = pt(x + w, y + h);
  } else if (direction == DIRECTION_SOUTH) {
    corner = pt(cx, y + h);
    end = pt(x + w, y);
  } else if (direction == DIRECTION_WEST) {
    start = pt(x + w, y);
    corner = pt(x, cy);
    end = pt(x + w, y + h);
  }

  let dx = next.x - cx;
  let dy = next.y - cy;

  const alpha = vertical ? Math.atan2(dx, dy) : Math.atan2(dy, dx);
  const t = vertical ? Math.atan2(w, h) : Math.atan2(h, w);

  let base = false;

  if (direction == DIRECTION_NORTH ||
    direction == DIRECTION_WEST) {
    base = alpha > -t && alpha < t;
  } else {
    base = alpha < -Math.PI + t || alpha > Math.PI - t;
  }

  let result: Point | null = null;

  if (base) {
    if (orthogonal && ((vertical && next.x >= start.x && next.x <= end.x) ||
      (!vertical && next.y >= start.y && next.y <= end.y))) {
      if (vertical) {
        result = pt(next.x, start.y);
      } else {
        result = pt(start.x, next.y);
      }
    } else {
      if (direction == DIRECTION_NORTH) {
        result = pt(x + w / 2 + h * Math.tan(alpha) / 2,
          y + h);
      } else if (direction == DIRECTION_SOUTH) {
        result = pt(x + w / 2 - h * Math.tan(alpha) / 2,
          y);
      } else if (direction == DIRECTION_WEST) {
        result = pt(x + w, y + h / 2 +
          w * Math.tan(alpha) / 2);
      } else {
        result = pt(x, y + h / 2 -
          w * Math.tan(alpha) / 2);
      }
    }
  } else {
    if (orthogonal) {
      const p = pt(cx, cy);

      if (next.y >= y && next.y <= y + h) {
        p.x = vertical ? cx : (
          direction == DIRECTION_WEST ?
            x + w : x);
        p.y = next.y;
      } else if (next.x >= x && next.x <= x + w) {
        p.x = next.x;
        p.y = !vertical ? cy : (
          direction == DIRECTION_NORTH ?
            y + h : y);
      }

      // Compute angle
      dx = next.x - p.x;
      dy = next.y - p.y;

      cx = p.x;
      cy = p.y;
    }

    if ((vertical && next.x <= x + w / 2) ||
      (!vertical && next.y <= y + h / 2)) {
      result = intersection(next.x, next.y, cx, cy,
        start.x, start.y, corner.x, corner.y);
    } else {
      result = intersection(next.x, next.y, cx, cy,
        corner.x, corner.y, end.x, end.y);
    }
  }

  if (result == null) {
    result = pt(cx, cy);
  }

  return result;
};

/** Describes a hexagon perimeter. See RectanglePerimeter for the parameters. */
export const HexagonPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  // Computes the point in model units so that the result does
  // not depend on the scale or translate of the view
  const s = SCALE;
  const tr = pt(0, 0);

  const p = getHexagonPerimeterPoint({
    x: unscale(bounds.x, s, tr.x), y: unscale(bounds.y, s, tr.y),
    width: unscale(bounds.width, s), height: unscale(bounds.height, s),
  }, vertex, pt(unscale(next.x, s, tr.x), unscale(next.y, s, tr.y)), orthogonal);

  return pt((p.x + tr.x) * s, (p.y + tr.y) * s);
};

/** Implements HexagonPerimeter for the given bounds and next point in model units. */
export function getHexagonPerimeterPoint(bounds: Rect, vertex: PerimeterVertex | null, next: Point, orthogonal: boolean): Point {
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const cx = centerX(bounds);
  const cy = centerY(bounds);
  const px = next.x;
  const py = next.y;
  const dx = px - cx;
  const dy = py - cy;
  const alpha = -Math.atan2(dy, dx);
  const pi = Math.PI;
  const pi2 = Math.PI / 2;

  let result: Point | null = pt(cx, cy);

  const direction = vertex != null ? getValue(vertex.style, 'direction', DIRECTION_EAST) : DIRECTION_EAST;
  const vertical = direction == DIRECTION_NORTH || direction == DIRECTION_SOUTH;
  let a = pt(0, 0);
  let b = pt(0, 0);

  // Only consider corrects quadrants for the orthogonal case.
  if ((px < x) && (py < y) || (px < x) && (py > y + h) ||
    (px > x + w) && (py < y) || (px > x + w) && (py > y + h)) {
    orthogonal = false;
  }

  if (orthogonal) {
    if (vertical) {
      // Special cases where intersects with hexagon corners
      if (px == cx) {
        if (py <= y) {
          return pt(cx, y);
        } else if (py >= y + h) {
          return pt(cx, y + h);
        }
      } else if (px < x) {
        if (py == y + h / 4) {
          return pt(x, y + h / 4);
        } else if (py == y + 3 * h / 4) {
          return pt(x, y + 3 * h / 4);
        }
      } else if (px > x + w) {
        if (py == y + h / 4) {
          return pt(x + w, y + h / 4);
        } else if (py == y + 3 * h / 4) {
          return pt(x + w, y + 3 * h / 4);
        }
      } else if (px == x) {
        if (py < cy) {
          return pt(x, y + h / 4);
        } else if (py > cy) {
          return pt(x, y + 3 * h / 4);
        }
      } else if (px == x + w) {
        if (py < cy) {
          return pt(x + w, y + h / 4);
        } else if (py > cy) {
          return pt(x + w, y + 3 * h / 4);
        }
      }
      if (py == y) {
        return pt(cx, y);
      } else if (py == y + h) {
        return pt(cx, y + h);
      }

      if (px < cx) {
        if ((py > y + h / 4) && (py < y + 3 * h / 4)) {
          a = pt(x, y);
          b = pt(x, y + h);
        } else if (py < y + h / 4) {
          a = pt(x - Math.floor(0.5 * w), y + Math.floor(0.5 * h));
          b = pt(x + w, y - Math.floor(0.25 * h));
        } else if (py > y + 3 * h / 4) {
          a = pt(x - Math.floor(0.5 * w), y + Math.floor(0.5 * h));
          b = pt(x + w, y + Math.floor(1.25 * h));
        }
      } else if (px > cx) {
        if ((py > y + h / 4) && (py < y + 3 * h / 4)) {
          a = pt(x + w, y);
          b = pt(x + w, y + h);
        } else if (py < y + h / 4) {
          a = pt(x, y - Math.floor(0.25 * h));
          b = pt(x + Math.floor(1.5 * w), y + Math.floor(0.5 * h));
        } else if (py > y + 3 * h / 4) {
          a = pt(x + Math.floor(1.5 * w), y + Math.floor(0.5 * h));
          b = pt(x, y + Math.floor(1.25 * h));
        }
      }
    } else {
      // Special cases where intersects with hexagon corners
      if (py == cy) {
        if (px <= x) {
          return pt(x, y + h / 2);
        } else if (px >= x + w) {
          return pt(x + w, y + h / 2);
        }
      } else if (py < y) {
        if (px == x + w / 4) {
          return pt(x + w / 4, y);
        } else if (px == x + 3 * w / 4) {
          return pt(x + 3 * w / 4, y);
        }
      } else if (py > y + h) {
        if (px == x + w / 4) {
          return pt(x + w / 4, y + h);
        } else if (px == x + 3 * w / 4) {
          return pt(x + 3 * w / 4, y + h);
        }
      } else if (py == y) {
        if (px < cx) {
          return pt(x + w / 4, y);
        } else if (px > cx) {
          return pt(x + 3 * w / 4, y);
        }
      } else if (py == y + h) {
        if (px < cx) {
          return pt(x + w / 4, y + h);
        } else if (py > cy) {
          return pt(x + 3 * w / 4, y + h);
        }
      }
      if (px == x) {
        return pt(x, cy);
      } else if (px == x + w) {
        return pt(x + w, cy);
      }

      if (py < cy) {
        if ((px > x + w / 4) && (px < x + 3 * w / 4)) {
          a = pt(x, y);
          b = pt(x + w, y);
        } else if (px < x + w / 4) {
          a = pt(x - Math.floor(0.25 * w), y + h);
          b = pt(x + Math.floor(0.5 * w), y - Math.floor(0.5 * h));
        } else if (px > x + 3 * w / 4) {
          a = pt(x + Math.floor(0.5 * w), y - Math.floor(0.5 * h));
          b = pt(x + Math.floor(1.25 * w), y + h);
        }
      } else if (py > cy) {
        if ((px > x + w / 4) && (px < x + 3 * w / 4)) {
          a = pt(x, y + h);
          b = pt(x + w, y + h);
        } else if (px < x + w / 4) {
          a = pt(x - Math.floor(0.25 * w), y);
          b = pt(x + Math.floor(0.5 * w), y + Math.floor(1.5 * h));
        } else if (px > x + 3 * w / 4) {
          a = pt(x + Math.floor(0.5 * w), y + Math.floor(1.5 * h));
          b = pt(x + Math.floor(1.25 * w), y);
        }
      }
    }

    let tx = cx;
    let ty = cy;

    if (px >= x && px <= x + w) {
      tx = px;

      if (py < cy) {
        ty = y + h;
      } else {
        ty = y;
      }
    } else if (py >= y && py <= y + h) {
      ty = py;

      if (px < cx) {
        tx = x + w;
      } else {
        tx = x;
      }
    }

    result = intersection(tx, ty, next.x, next.y, a.x, a.y, b.x, b.y);
  } else {
    if (vertical) {
      const beta = Math.atan2(h / 4, w / 2);

      // Special cases where intersects with hexagon corners
      if (alpha == beta) {
        return pt(x + w, y + Math.floor(0.25 * h));
      } else if (alpha == pi2) {
        return pt(x + Math.floor(0.5 * w), y);
      } else if (alpha == (pi - beta)) {
        return pt(x, y + Math.floor(0.25 * h));
      } else if (alpha == -beta) {
        return pt(x + w, y + Math.floor(0.75 * h));
      } else if (alpha == (-pi2)) {
        return pt(x + Math.floor(0.5 * w), y + h);
      } else if (alpha == (-pi + beta)) {
        return pt(x, y + Math.floor(0.75 * h));
      }

      if ((alpha < beta) && (alpha > -beta)) {
        a = pt(x + w, y);
        b = pt(x + w, y + h);
      } else if ((alpha > beta) && (alpha < pi2)) {
        a = pt(x, y - Math.floor(0.25 * h));
        b = pt(x + Math.floor(1.5 * w), y + Math.floor(0.5 * h));
      } else if ((alpha > pi2) && (alpha < (pi - beta))) {
        a = pt(x - Math.floor(0.5 * w), y + Math.floor(0.5 * h));
        b = pt(x + w, y - Math.floor(0.25 * h));
      } else if (((alpha > (pi - beta)) && (alpha <= pi)) ||
        ((alpha < (-pi + beta)) && (alpha >= -pi))) {
        a = pt(x, y);
        b = pt(x, y + h);
      } else if ((alpha < -beta) && (alpha > -pi2)) {
        a = pt(x + Math.floor(1.5 * w), y + Math.floor(0.5 * h));
        b = pt(x, y + Math.floor(1.25 * h));
      } else if ((alpha < -pi2) && (alpha > (-pi + beta))) {
        a = pt(x - Math.floor(0.5 * w), y + Math.floor(0.5 * h));
        b = pt(x + w, y + Math.floor(1.25 * h));
      }
    } else {
      const beta = Math.atan2(h / 2, w / 4);

      // Special cases where intersects with hexagon corners
      if (alpha == beta) {
        return pt(x + Math.floor(0.75 * w), y);
      } else if (alpha == (pi - beta)) {
        return pt(x + Math.floor(0.25 * w), y);
      } else if ((alpha == pi) || (alpha == -pi)) {
        return pt(x, y + Math.floor(0.5 * h));
      } else if (alpha == 0) {
        return pt(x + w, y + Math.floor(0.5 * h));
      } else if (alpha == -beta) {
        return pt(x + Math.floor(0.75 * w), y + h);
      } else if (alpha == (-pi + beta)) {
        return pt(x + Math.floor(0.25 * w), y + h);
      }

      if ((alpha > 0) && (alpha < beta)) {
        a = pt(x + Math.floor(0.5 * w), y - Math.floor(0.5 * h));
        b = pt(x + Math.floor(1.25 * w), y + h);
      } else if ((alpha > beta) && (alpha < (pi - beta))) {
        a = pt(x, y);
        b = pt(x + w, y);
      } else if ((alpha > (pi - beta)) && (alpha < pi)) {
        a = pt(x - Math.floor(0.25 * w), y + h);
        b = pt(x + Math.floor(0.5 * w), y - Math.floor(0.5 * h));
      } else if ((alpha < 0) && (alpha > -beta)) {
        a = pt(x + Math.floor(0.5 * w), y + Math.floor(1.5 * h));
        b = pt(x + Math.floor(1.25 * w), y);
      } else if ((alpha < -beta) && (alpha > (-pi + beta))) {
        a = pt(x, y + h);
        b = pt(x + w, y + h);
      } else if ((alpha < (-pi + beta)) && (alpha > -pi)) {
        a = pt(x - Math.floor(0.25 * w), y);
        b = pt(x + Math.floor(0.5 * w), y + Math.floor(1.5 * h));
      }
    }

    result = intersection(cx, cy, next.x, next.y, a.x, a.y, b.x, b.y);
  }

  if (result == null) {
    return pt(cx, cy);
  }

  return result;
}

// --- Shapes.js ---------------------------------------------------------------------

export const CenterPerimeter: PerimeterFunction = (bounds) => {
  return pt(centerX(bounds), centerY(bounds));
};

export const LifelinePerimeter: PerimeterFunction = (bounds, vertex, next) => {
  let size = UML_LIFELINE_SIZE;
  let max = bounds.y + bounds.height;

  if (vertex != null) {
    size = Number(getValue(vertex.style, 'size', size)) * SCALE;

    // Connections stay on the body line, off the mirrored foot box
    if (getValue(vertex.style, 'lifelineMirror', '0') == '1') {
      max -= size;
    }
  }

  const px = PIXEL_SIZE;
  let sw = (jsParseFloat(getValue(vertex?.style, 'strokeWidth', null) || 1) * SCALE / 2) - px;

  if (next.x < centerX(bounds)) {
    sw += px;
    sw *= -1;
  }

  return pt(centerX(bounds) + sw, Math.min(max,
    Math.max(bounds.y + size, next.y)));
};

export const OrthogonalPerimeter: PerimeterFunction = (bounds, vertex, next) => {
  return RectanglePerimeter(bounds, vertex, next, true);
};

export const BackbonePerimeter: PerimeterFunction = (bounds, vertex, next) => {
  const style = vertex != null ? vertex.style : {};
  const px = PIXEL_SIZE;
  let sw = (jsParseFloat(getValue(style, 'strokeWidth', null) || 1) * SCALE / 2) - px;

  if (style['backboneSize'] != null) {
    sw += (jsParseFloat(getValue(style, 'backboneSize', null)) * SCALE / 2) - px;
  }

  const direction = getValue(style, 'direction', null);

  if (direction == 'south' ||
    direction == 'north') {
    if (next.x < centerX(bounds)) {
      sw += px;
      sw *= -1;
    }

    return pt(centerX(bounds) + sw, Math.min(bounds.y + bounds.height,
      Math.max(bounds.y, next.y)));
  } else {
    if (next.y < centerY(bounds)) {
      sw += px;
      sw *= -1;
    }

    return pt(Math.min(bounds.x + bounds.width, Math.max(bounds.x, next.x)),
      centerY(bounds) + sw);
  }
};

/**
 * Returns the outline of the given callout in the given bounds with sharp
 * corners and the pointer, as painted in CalloutShape.redrawPath and turned
 * for the direction of the shape.
 */
function getCalloutOutline(vertex: PerimeterVertex, bounds: Rect): Point[] {
  const s = SCALE;
  const direction = getValue(vertex.style, 'direction', DIRECTION_EAST);
  const vertical = direction == DIRECTION_NORTH || direction == DIRECTION_SOUTH;
  const w = vertical ? bounds.height : bounds.width;
  const h = vertical ? bounds.width : bounds.height;
  const size = Math.max(0, Math.min(h, jsParseFloat(getValue(vertex.style, 'size',
    CALLOUT_SIZE)) * s));
  const dx = w * Math.max(0, Math.min(1, jsParseFloat(getValue(vertex.style, 'position',
    CALLOUT_POSITION))));
  const dx2 = w * Math.max(0, Math.min(1, jsParseFloat(getValue(vertex.style, 'position2',
    CALLOUT_POSITION2))));
  const base = Math.max(0, Math.min(w, jsParseFloat(getValue(vertex.style, 'base',
    CALLOUT_BASE)) * s));
  const pts = [pt(0, 0), pt(w, 0), pt(w, h - size),
    pt(Math.min(w, dx + base), h - size), pt(dx2, h),
    pt(Math.max(0, dx), h - size), pt(0, h - size), pt(0, 0)];
  const rot = (direction == DIRECTION_NORTH) ? 270 :
    ((direction == DIRECTION_WEST) ? 180 :
      ((direction == DIRECTION_SOUTH) ? 90 : 0));
  const cos = Math.cos(toRadians(rot));
  const sin = Math.sin(toRadians(rot));
  const center = pt(centerX(bounds), centerY(bounds));

  for (let i = 0; i < pts.length; i++) {
    pts[i] = getRotatedPoint(pt(center.x + pts[i].x - w / 2,
      center.y + pts[i].y - h / 2), cos, sin, center);
  }

  return pts;
}

// Callout Perimeter
export const CalloutPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  if (vertex == null) return RectanglePerimeter(bounds, vertex, next, orthogonal);
  const outline = bounds;
  const s = SCALE;
  const size = Math.max(0, Math.min(bounds.height, jsParseFloat(getValue(vertex.style, 'size',
    CALLOUT_SIZE)) * s));

  // Routes are kept in model units in model coordinates, so the margin,
  // which getDirectedBounds rounds, is rounded in model units instead
  // of screen pixels to not depend on the scale of the validation
  // (DeckWerk: always model coordinates, as draw.io's editor and viewer)
  const b = getDirectedBounds({ x: 0, y: 0, width: unscale(bounds.width, s), height: unscale(bounds.height, s) },
    { x: 0, y: 0, width: 0, height: unscale(size, s) }, vertex.style);
  bounds = { x: bounds.x + b.x * s, y: bounds.y + b.y * s, width: b.width * s, height: b.height * s };

  let p = RectanglePerimeter(bounds, vertex, next, orthogonal);

  // Orthogonal ends that are not horizontal or vertical on the body (eg.
  // level with the pointer) or that end in the base of the pointer use the
  // outline with the pointer. Other ends keep the point on the body. Callouts
  // whose body getDirectedBounds moves for a flip are not changed, as the next
  // point is already flipped (see mxGraphView.getPerimeterPoint).
  const direction = getValue(vertex.style, 'direction', DIRECTION_EAST);
  const flipped = getValue(vertex.style, (direction == DIRECTION_NORTH ||
    direction == DIRECTION_SOUTH) ? 'flipH' : 'flipV', 0) == 1;

  if (orthogonal && p != null && !flipped) {
    const q = getOutlinePerimeterPoint(outline, getCalloutOutline(vertex, outline), next, orthogonal);

    if (q != null && Math.min(Math.abs(q.x - next.x), Math.abs(q.y - next.y)) < 0.01 &&
      Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) > 0.5) {
      p = q;
    }
  }

  return p;
};

/**
 * Returns the point where an edge to the given next point leaves the given
 * outline in the given bounds. For orthogonal edges, the point is on the
 * vertical or horizontal line through the next point. If that line does not
 * reach the outline between the center and the next point (eg. beside the
 * slanted side of a parallelogram), the point of the outline on the line
 * that is nearest to the next point is used, and if the line misses the
 * outline, the point towards the center (the center was used before, which
 * started the edge inside the shape). The optional range is the extent in
 * which the vertical and horizontal lines are used (default is the bounds).
 */
export function getOutlinePerimeterPoint(bounds: Rect, points: readonly Point[], next: Point, orthogonal: boolean, range?: Rect | null): Point | null {
  const r = range != null ? range : bounds;
  const x = r.x;
  const y = r.y;
  const w = r.width;
  const h = r.height;
  const center = pt(centerX(bounds), centerY(bounds));
  let result: Point | null = null;

  if (orthogonal) {
    const p1 = pt(center.x, center.y);

    if (next.x < x || next.x > x + w) {
      p1.y = next.y;
      result = getPerimeterPoint(points, p1, next);

      if (result == null) {
        p1.x = (next.x > p1.x) ? x - 1 : x + w + 1;
        result = getPerimeterPoint(points, p1, next);
      }
    } else {
      p1.x = next.x;
      result = getPerimeterPoint(points, p1, next);

      if (result == null && (next.y < y || next.y > y + h)) {
        p1.y = (next.y > p1.y) ? y - 1 : y + h + 1;
        result = getPerimeterPoint(points, p1, next);
      }
    }
  }

  return result != null ? result : getPerimeterPoint(points, center, next);
}

// Parallelogram Perimeter
export const ParallelogramPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const style = vertex != null ? vertex.style : null;
  const fixed = getValue(style, 'fixedSize', '0') != '0';
  let size = fixed ? PARALLELOGRAM_FIXED_SIZE : PARALLELOGRAM_SIZE;

  if (vertex != null) {
    size = Number(getValue(vertex.style, 'size', size));
  }

  if (fixed) {
    size *= SCALE;
  }

  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const direction = vertex != null ? getValue(vertex.style, 'direction', DIRECTION_EAST) : DIRECTION_EAST;
  const vertical = direction == DIRECTION_NORTH ||
    direction == DIRECTION_SOUTH;
  let points: Point[];

  if (vertical) {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(x, y), pt(x + w, y + dy),
      pt(x + w, y + h), pt(x, y + h - dy), pt(x, y)];
  } else {
    const dx = fixed ? Math.max(0, Math.min(w * 0.5, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x + dx, y), pt(x + w, y),
      pt(x + w - dx, y + h), pt(x, y + h), pt(x + dx, y)];
  }

  return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
};

// Trapezoid Perimeter
export const TrapezoidPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const style = vertex != null ? vertex.style : null;
  const fixed = getValue(style, 'fixedSize', '0') != '0';
  let size = fixed ? TRAPEZOID_FIXED_SIZE : TRAPEZOID_SIZE;

  if (vertex != null) {
    size = Number(getValue(vertex.style, 'size', size));
  }

  if (fixed) {
    size *= SCALE;
  }

  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const direction = vertex != null ? getValue(vertex.style, 'direction', DIRECTION_EAST) : DIRECTION_EAST;
  let points: Point[] = [];

  if (direction == DIRECTION_EAST) {
    const dx = fixed ? Math.max(0, Math.min(w * 0.5, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x + dx, y), pt(x + w - dx, y),
      pt(x + w, y + h), pt(x, y + h), pt(x + dx, y)];
  } else if (direction == DIRECTION_WEST) {
    const dx = fixed ? Math.max(0, Math.min(w, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x, y), pt(x + w, y),
      pt(x + w - dx, y + h), pt(x + dx, y + h), pt(x, y)];
  } else if (direction == DIRECTION_NORTH) {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(x, y + dy), pt(x + w, y),
      pt(x + w, y + h), pt(x, y + h - dy), pt(x, y + dy)];
  } else {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(x, y), pt(x + w, y + dy),
      pt(x + w, y + h - dy), pt(x, y + h), pt(x, y)];
  }

  return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
};

// Step Perimeter
export const StepPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const style = vertex != null ? vertex.style : null;
  const fixed = getValue(style, 'fixedSize', '0') != '0';
  let size = fixed ? STEP_FIXED_SIZE : STEP_SIZE;

  if (vertex != null) {
    size = Number(getValue(vertex.style, 'size', size));
  }

  if (fixed) {
    size *= SCALE;
  }

  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const cx = centerX(bounds);
  const cy = centerY(bounds);

  const direction = vertex != null ? getValue(vertex.style, 'direction', DIRECTION_EAST) : DIRECTION_EAST;
  let points: Point[];

  if (direction == DIRECTION_EAST) {
    const dx = fixed ? Math.max(0, Math.min(w, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x, y), pt(x + w - dx, y), pt(x + w, cy),
      pt(x + w - dx, y + h), pt(x, y + h),
      pt(x + dx, cy), pt(x, y)];
  } else if (direction == DIRECTION_WEST) {
    const dx = fixed ? Math.max(0, Math.min(w, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x + dx, y), pt(x + w, y), pt(x + w - dx, cy),
      pt(x + w, y + h), pt(x + dx, y + h),
      pt(x, cy), pt(x + dx, y)];
  } else if (direction == DIRECTION_NORTH) {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(x, y + dy), pt(cx, y), pt(x + w, y + dy),
      pt(x + w, y + h), pt(cx, y + h - dy),
      pt(x, y + h), pt(x, y + dy)];
  } else {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(x, y), pt(cx, y + dy), pt(x + w, y),
      pt(x + w, y + h - dy), pt(cx, y + h),
      pt(x, y + h - dy), pt(x, y)];
  }

  return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
};

// Hexagon Perimeter 2 (keep existing one)
export const HexagonPerimeter2: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const style = vertex != null ? vertex.style : null;
  const fixed = getValue(style, 'fixedSize', '0') != '0';
  let size = fixed ? HEXAGON_FIXED_SIZE : HEXAGON_SIZE;

  if (vertex != null) {
    size = Number(getValue(vertex.style, 'size', size));
  }

  if (fixed) {
    size *= SCALE;
  }

  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;

  const cx = centerX(bounds);
  const cy = centerY(bounds);

  const direction = vertex != null ? getValue(vertex.style, 'direction', DIRECTION_EAST) : DIRECTION_EAST;
  const vertical = direction == DIRECTION_NORTH ||
    direction == DIRECTION_SOUTH;
  let points: Point[];

  if (vertical) {
    const dy = fixed ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
    points = [pt(cx, y), pt(x + w, y + dy), pt(x + w, y + h - dy),
      pt(cx, y + h), pt(x, y + h - dy),
      pt(x, y + dy), pt(cx, y)];
  } else {
    const dx = fixed ? Math.max(0, Math.min(w, size)) : w * Math.max(0, Math.min(1, size));
    points = [pt(x + dx, y), pt(x + w - dx, y), pt(x + w, cy),
      pt(x + w - dx, y + h), pt(x + dx, y + h),
      pt(x, cy), pt(x + dx, y)];
  }

  return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
};

// Cloud Perimeter
export const CloudPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  // Ends on the outline as painted (perimeter=cloudPerimeter), as the ellipse
  // of ellipse;shape=cloud is far from the bumps of the cloud near its bounds.
  // The orthogonal ranges are the extent of the bumps (see getChannelBounds).
  const points = (vertex != null && vertex.outline != null) ? vertex.outline(bounds) : null;
  const p = (points != null) ? getOutlinePerimeterPoint(bounds, points, next, orthogonal,
    getOutlineBounds(points)) : null;

  return (p != null) ? p : EllipsePerimeter(bounds, vertex, next, orthogonal);
};

// Outline Perimeter
export const OutlinePerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  // Ends on the convex hull of what the shape paints (perimeter=outlinePerimeter,
  // see Graph.getPerimeterOutline), or on the bounds if it paints nothing
  const pts = (vertex != null && vertex.perimeterOutline != null) ? vertex.perimeterOutline(bounds) : null;
  let p: Point | null = null;

  if (pts != null) {
    const c = pt(centerX(bounds), centerY(bounds));
    const b = getOutlineBounds(pts);

    if (b != null) {
      if (orthogonal) {
        // Uses the extent of the outline as it may not reach the bounds
        // (see getChannelBounds), and the axis from beyond the far side
        // of the outline as the centre may not be inside it on the axis
        let p1: Point;

        if (next.x < b.x || next.x > b.x + b.width) {
          p1 = pt((next.x < c.x) ? b.x + b.width + 1 : b.x - 1, next.y);
        } else {
          p1 = pt(next.x, (next.y < c.y) ? b.y + b.height + 1 : b.y - 1);
        }

        p = getPerimeterPoint(pts, p1, next);
      }

      // Probes with a point on the ray from the centre beyond the outline,
      // which may reach far beyond the bounds (eg. the tail of a callout),
      // as the next point may be on or inside the outline
      const dx = next.x - c.x;
      const dy = next.y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (p == null && d > 0) {
        const f = Math.max(2 * (bounds.width + bounds.height),
          Math.max(Math.abs(b.x - c.x), Math.abs(b.x + b.width - c.x)) +
          Math.max(Math.abs(b.y - c.y), Math.abs(b.y + b.height - c.y)) + 1) / d;
        p = getPerimeterPoint(pts, c, pt(c.x + dx * f, c.y + dy * f));
      }
    }
  }

  return (p != null) ? p : RectanglePerimeter(bounds, vertex, next, orthogonal);
};

/** MermaidPersonShape.getGeometry */
function mermaidPersonGeometry(w: number, h: number): { headRadius: number; bodyTop: number; bodyHeight: number; bodyRadius: number } {
  const headRadius = Math.min(Math.max(w * 0.23, 16), 56);
  const bodyTop = Math.min(h, 2 * headRadius - headRadius * 0.27);
  const bodyHeight = h - bodyTop;

  return {
    headRadius, bodyTop, bodyHeight,
    bodyRadius: Math.max(0, Math.min(w * 0.177, bodyHeight * 0.45)),
  };
}

// Person perimeter: the head's exposed arc joined to the body's rounded
// outline, like the intersection outline of mermaid's person shape
export const MermaidPersonPerimeter: PerimeterFunction = (bounds, _vertex, next, orthogonal) => {
  const s = SCALE;
  const g = mermaidPersonGeometry(bounds.width / s, bounds.height / s);
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;
  const r = g.headRadius * s;
  const top = y + g.bodyTop * s;
  const br = g.bodyRadius * s;
  const cx = x + w / 2;
  const cy = y + r;
  const points: Point[] = [];

  // Angles in degrees, clockwise from the positive x-axis as y points down
  const arc = (acx: number, acy: number, ar: number, from: number, to: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = (from + (to - from) * i / n) * Math.PI / 180;
      points.push(pt(acx + ar * Math.cos(a), acy + ar * Math.sin(a)));
    }
  };

  // Where the head meets the top of the body
  const join = Math.asin(Math.max(-1, Math.min(1, (top - cy) / r))) * 180 / Math.PI;

  arc(cx, cy, r, 180 - join, 360 + join, 24);
  arc(x + w - br, top + br, br, 270, 360, 6);
  arc(x + w - br, y + h - br, br, 0, 90, 6);
  arc(x + br, y + h - br, br, 90, 180, 6);
  arc(x + br, top + br, br, 180, 270, 6);
  points.push(points[0]);

  return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
};

// --- Graph.js: rounded perimeters --------------------------------------------------

/**
 * Returns the bounding box of the given outline points (see
 * getRoundedPolygonOutline), or null if there are no points.
 */
export function getOutlineBounds(pts: readonly Point[] | null): Rect | null {
  if (pts == null || pts.length == 0) {
    return null;
  }

  let x0 = pts[0].x;
  let y0 = pts[0].y;
  let x1 = x0;
  let y1 = y0;

  for (let i = 1; i < pts.length; i++) {
    x0 = Math.min(x0, pts[i].x);
    y0 = Math.min(y0, pts[i].y);
    x1 = Math.max(x1, pts[i].x);
    y1 = Math.max(y1, pts[i].y);
  }

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Returns true if the given vertex has perimeter=outlinePerimeter. Floating
 * edges and perimeter connection points of such vertices end on the outline
 * of what their shape paints.
 */
export function isOutlinePerimeter(vertex: PerimeterVertex | null): boolean {
  return vertex != null && vertex.style != null && vertex.style['perimeter'] === 'outlinePerimeter';
}

/**
 * The shapes whose constructor draw.io's isRoundedPerimeter accepts:
 * mxRectangleShape (also the default for unregistered names), mxLabel,
 * process and internalStorage.
 */
const ROUNDED_RECTANGLE_SHAPES = new Set(['rectangle', 'rect', 'label', 'process', 'internalStorage']);

/**
 * Returns true if the given vertex has rounded=1 and roundedPerimeter=1
 * and is a plain rectangle or label (other shapes have their own outline). For
 * such vertices, perimeter connection points and floating edges end on the
 * rounded outline. Cells without the style are not affected. The outline
 * perimeter takes precedence (see isOutlinePerimeter).
 */
export function isRoundedPerimeter(vertex: PerimeterVertex | null): boolean {
  if (vertex == null || vertex.style == null || vertex.stencil) return false;
  const shape = vertex.style['shape'];

  return (shape == null || ROUNDED_RECTANGLE_SHAPES.has(shape)) &&
    getValue(vertex.style, 'roundedPerimeter', '0') == '1' &&
    getValue(vertex.style, 'rounded', '0') == '1' &&
    !isOutlinePerimeter(vertex);
}

/**
 * Returns true if the given vertex has rounded=1 and roundedPerimeter=1 and
 * is a triangle, rhombus, hexagon, parallelogram, trapezoid or step with the
 * given perimeter of its shape. For such vertices, perimeter connection
 * points and floating edges end on the rounded outline as painted (see
 * roundedPolygonPerimeter).
 */
export function isRoundedPolygonPerimeter(vertex: PerimeterVertex | null, perimeter: PerimeterFunction | null): boolean {
  if (vertex != null && !vertex.stencil && vertex.style != null &&
    getValue(vertex.style, 'roundedPerimeter', '0') == '1' &&
    getValue(vertex.style, 'rounded', '0') == '1') {
    const shape = vertex.style['shape'];

    return (perimeter == TrianglePerimeter && shape == 'triangle') ||
      (perimeter == RhombusPerimeter && shape == 'rhombus') ||
      (perimeter == HexagonPerimeter2 && shape == 'hexagon') ||
      (perimeter == ParallelogramPerimeter && shape == 'parallelogram') ||
      (perimeter == TrapezoidPerimeter && shape == 'trapezoid') ||
      (perimeter == StepPerimeter && shape == 'step');
  }

  return false;
}

/**
 * Returns the corner radius of the given rounded vertex for the given unscaled
 * size, as computed in mxRectangleShape.paintBackground.
 */
export function getRoundedPerimeterRadius(vertex: PerimeterVertex, w: number, h: number): number {
  if (getValue(vertex.style, 'absoluteArcSize', 0) == '1') {
    return Math.min(w / 2, h / 2, Number(getValue(vertex.style,
      'arcSize', LINE_ARCSIZE)) / 2);
  } else {
    const f = Number(getValue(vertex.style, 'arcSize',
      RECTANGLE_ROUNDING_FACTOR * 100)) / 100;

    return Math.min(w * f, h * f, w / 2, h / 2);
  }
}

/**
 * Returns the radius of the corner arcs of the rounded outline of the given
 * vertex for the given perimeter bounds in view coordinates, ie. the corner
 * radius plus the perimeter spacing, or 0 if the corners are not rounded.
 */
export function getRoundedPerimeterArcSize(vertex: PerimeterVertex, bounds: Rect): number {
  const s = SCALE;
  const r = getRoundedPerimeterRadius(vertex, vertex.width / s, vertex.height / s);

  return (r > 0) ? Math.max(0, r * s + (bounds.width - vertex.width) / 2) : 0;
}

/**
 * Returns the centre of the corner arc with the given radius for the given
 * unrotated point if the point is in a corner of the given bounds, where the
 * rounded outline differs from the bounds, or null otherwise.
 */
export function getRoundedPerimeterArcCenter(bounds: Rect, radius: number, p: Point): Point | null {
  const x0 = bounds.x + radius;
  const x1 = bounds.x + bounds.width - radius;
  const y0 = bounds.y + radius;
  const y1 = bounds.y + bounds.height - radius;

  return (radius > 0 && (p.x < x0 || p.x > x1) && (p.y < y0 || p.y > y1)) ?
    pt((p.x < x0) ? x0 : x1, (p.y < y0) ? y0 : y1) : null;
}

/**
 * Perimeter for floating edges on vertices with a rounded perimeter (see
 * isRoundedPerimeter). Points in the corners move onto the arc along the
 * ray from the centre, or along the axis of the next point for orthogonal
 * edges so that the last segment stays orthogonal.
 */
export const roundedRectanglePerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  let p = RectanglePerimeter(bounds, vertex, next, orthogonal) as Point;

  if (vertex == null) return p;
  const radius = getRoundedPerimeterArcSize(vertex, bounds);
  const arc = getRoundedPerimeterArcCenter(bounds, radius, p);

  if (arc != null) {
    const dx = p.x - arc.x;
    const dy = p.y - arc.y;

    if (orthogonal && next.x >= bounds.x && next.x <= bounds.x + bounds.width) {
      p.y = arc.y + ((dy < 0) ? -1 : 1) * Math.sqrt(Math.max(0, radius * radius - dx * dx));
    } else if (orthogonal && next.y >= bounds.y && next.y <= bounds.y + bounds.height) {
      p.x = arc.x + ((dx < 0) ? -1 : 1) * Math.sqrt(Math.max(0, radius * radius - dy * dy));
    } else {
      // Exit point of the ray from the centre through pt on the arc circle
      const cx = centerX(bounds);
      const cy = centerY(bounds);
      const ux = p.x - cx;
      const uy = p.y - cy;
      const fx = cx - arc.x;
      const fy = cy - arc.y;
      const a = ux * ux + uy * uy;
      const b = fx * ux + fy * uy;
      const c = fx * fx + fy * fy - radius * radius;
      const t = (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a;

      p = pt(cx + ux * t, cy + uy * t);
    }
  }

  return p;
};

/**
 * Perimeter for floating edges on polygon vertices with a rounded perimeter
 * (see isRoundedPolygonPerimeter). Intersects the ray from the centre, or
 * the axis of the next point for orthogonal edges, with the outline as
 * painted (see getRoundedPolygonOutline) and uses the perimeter of the
 * shape if there is no outline or intersection.
 */
export const roundedPolygonPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const pts = (vertex != null && vertex.outline != null) ? vertex.outline(bounds) : null;
  let p: Point | null = null;

  if (pts != null) {
    const p1 = pt(centerX(bounds), centerY(bounds));

    if (orthogonal) {
      // Uses the extent of the outline as the rounded corners do not
      // reach the bounds (see getChannelBounds)
      const b = getOutlineBounds(pts);

      if (b != null && (next.x < b.x || next.x > b.x + b.width)) {
        p1.y = next.y;
      } else {
        p1.x = next.x;
      }
    }

    p = getPerimeterPoint(pts, p1, next);
  }

  if (p == null) {
    const perimeter = vertex != null ? getStylePerimeter(vertex.style) : null;
    p = (perimeter != null) ? perimeter(bounds, vertex, next, orthogonal) : null;

    // Orthogonal ends that cannot be horizontal or vertical (eg. the next
    // point is beside both ranges) use the ray from the centre to the rounded
    // outline instead of the ray to the sharp corners of the perimeter
    if (pts != null && orthogonal && p != null &&
      Math.min(Math.abs(p.x - next.x), Math.abs(p.y - next.y)) >= 0.01) {
      p = getPerimeterPoint(pts, pt(centerX(bounds), centerY(bounds)), next) || p;
    }
  }

  return p;
};

// --- mxStyleRegistry ------------------------------------------------------------------

/**
 * Perimeters by their style name (`perimeter=…`), as registered with
 * mxStyleRegistry by mxGraph and draw.io. No prototype, so names from a
 * style cannot resolve inherited members.
 */
export const PERIMETERS: Readonly<Record<string, PerimeterFunction>> = Object.assign(Object.create(null) as Record<string, PerimeterFunction>, {
  ellipsePerimeter: EllipsePerimeter,
  rectanglePerimeter: RectanglePerimeter,
  rhombusPerimeter: RhombusPerimeter,
  trianglePerimeter: TrianglePerimeter,
  hexagonPerimeter: HexagonPerimeter,
  centerPerimeter: CenterPerimeter,
  lifelinePerimeter: LifelinePerimeter,
  orthogonalPerimeter: OrthogonalPerimeter,
  backbonePerimeter: BackbonePerimeter,
  calloutPerimeter: CalloutPerimeter,
  parallelogramPerimeter: ParallelogramPerimeter,
  trapezoidPerimeter: TrapezoidPerimeter,
  stepPerimeter: StepPerimeter,
  hexagonPerimeter2: HexagonPerimeter2,
  cloudPerimeter: CloudPerimeter,
  outlinePerimeter: OutlinePerimeter,
  mermaidPersonPerimeter: MermaidPersonPerimeter,
});

/** The perimeter a style names (mxGraphView.getPerimeterFunction before draw.io's override), or null. */
export function getStylePerimeter(style: Style | null | undefined): PerimeterFunction | null {
  const name = style != null ? style['perimeter'] : undefined;
  return name != null ? PERIMETERS[name] ?? null : null;
}

/**
 * mxGraphView.getPerimeterFunction with draw.io's override: uses
 * roundedRectanglePerimeter and roundedPolygonPerimeter for vertices with a
 * rounded perimeter.
 */
export function getPerimeterFunction(vertex: PerimeterVertex): PerimeterFunction | null {
  let perimeter = getStylePerimeter(vertex.style);

  if (perimeter == RectanglePerimeter && isRoundedPerimeter(vertex)) {
    perimeter = roundedRectanglePerimeter;
  } else if (perimeter != null && isRoundedPolygonPerimeter(vertex, perimeter)) {
    perimeter = roundedPolygonPerimeter;
  }

  return perimeter;
}
