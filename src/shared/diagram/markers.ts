/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * mxgraph/src/shape/mxMarker.js, the markers registered in
 * js/grapheditor/Shapes.js (dash, box, cross, circle, circlePlus,
 * halfCircle, async, openAsync, mermaidExtension, mermaidDiamond),
 * shapes/er/mxER.js (ER markers) and shapes/mxSysML.js (SysML markers).
 * Modified for DeckWerk: typed; a marker reads the edge style through the
 * shape it is given; no other changes to the geometry.
 */

import type { SvgCanvas } from './canvas.js';
import type { Point } from './types.js';
import type { Shape } from './shapes/shape.js';
import { getString } from './shapes/util.js';

/** Paints a marker after the line was painted. */
export type MarkerPainter = () => void;

/**
 * Creates a marker for the end point `pe` of a line in direction
 * (unitX, unitY). It may move `pe` (in place) to shorten the line so that it
 * ends where the marker begins, and returns the function that paints it.
 */
export type MarkerFactory = (
  c: SvgCanvas, shape: Shape, type: string, pe: Point, unitX: number, unitY: number,
  size: number, source: boolean, sw: number, filled: boolean,
) => MarkerPainter;

const markers: Record<string, MarkerFactory> = Object.create(null) as Record<string, MarkerFactory>;

/** mxMarker.addMarker. */
export function addMarker(type: string, factory: MarkerFactory): void {
  markers[type] = factory;
}

/** mxMarker.createMarker: null for unknown types. */
export function createMarker(
  c: SvgCanvas, shape: Shape, type: string, pe: Point, unitX: number, unitY: number,
  size: number, source: boolean, sw: number, filled: boolean,
): MarkerPainter | null {
  const factory = Object.prototype.hasOwnProperty.call(markers, type) ? markers[type] : null;
  return factory != null ? factory(c, shape, type, pe, unitX, unitY, size, source, sw, filled) : null;
}

export function isKnownMarker(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(markers, type);
}

/** Every registered marker name (startArrow / endArrow values). */
export function markerNames(): string[] {
  return Object.keys(markers);
}

function paintFilled(c: SvgCanvas, filled: boolean): void {
  if (filled) c.fillAndStroke();
  else c.stroke();
}

// --- mxMarker.js ------------------------------------------------------------------

function createArrow(widthFactor = 2): MarkerFactory {
  return (canvas, _shape, type, pe, unitX, unitY, size, _source, sw, filled) => {
    // The angle of the forward facing arrow sides against the x axis is
    // 26.565 degrees, 1/sin(26.565) = 2.236 / 2 = 1.118 ( / 2 allows for
    // only half the strokewidth is processed ).
    const endOffsetX = unitX * sw * 1.118;
    const endOffsetY = unitY * sw * 1.118;
    unitX = unitX * (size + sw);
    unitY = unitY * (size + sw);
    const pt = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
    const f = (type !== 'classic' && type !== 'classicThin') ? 1 : 3 / 4;
    pe.x += -unitX * f - endOffsetX;
    pe.y += -unitY * f - endOffsetY;

    return () => {
      canvas.begin();
      canvas.moveTo(pt.x, pt.y);
      canvas.lineTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
      if (type === 'classic' || type === 'classicThin') {
        canvas.lineTo(pt.x - unitX * 3 / 4, pt.y - unitY * 3 / 4);
      }
      canvas.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
      canvas.close();
      paintFilled(canvas, filled);
    };
  };
}

addMarker('classic', createArrow(2));
addMarker('classicThin', createArrow(3));
addMarker('block', createArrow(2));
addMarker('blockThin', createArrow(3));

function createOpenArrow(widthFactor = 2): MarkerFactory {
  return (canvas, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
    // The angle of the forward facing arrow sides against the x axis is
    // 26.565 degrees, 1/sin(26.565) = 2.236 / 2 = 1.118 ( / 2 allows for
    // only half the strokewidth is processed ).
    const endOffsetX = unitX * sw * 1.118;
    const endOffsetY = unitY * sw * 1.118;
    unitX = unitX * (size + sw);
    unitY = unitY * (size + sw);
    const pt = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
    pe.x += -endOffsetX * 2;
    pe.y += -endOffsetY * 2;

    return () => {
      canvas.begin();
      canvas.moveTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
      canvas.lineTo(pt.x, pt.y);
      canvas.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
      canvas.stroke();
    };
  };
}

addMarker('open', createOpenArrow(2));
addMarker('openThin', createOpenArrow(3));

addMarker('oval', (canvas, _shape, _type, pe, unitX, unitY, size, _source, _sw, filled) => {
  const a = size / 2;
  const pt = { x: pe.x, y: pe.y };
  pe.x -= unitX * a;
  pe.y -= unitY * a;
  return () => {
    canvas.ellipse(pt.x - a, pt.y - a, size, size);
    paintFilled(canvas, filled);
  };
});

addMarker('baseDash', (canvas, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    canvas.begin();
    canvas.moveTo(pe.x - ny / 2, pe.y + nx / 2);
    canvas.lineTo(pe.x + ny / 2, pe.y - nx / 2);
    canvas.stroke();
  };
});

addMarker('doubleBlock', (canvas, _shape, type, pe, unitX, unitY, size, _source, sw, filled) => {
  const widthFactor = 2;
  const endOffsetX = unitX * sw * 1.118;
  const endOffsetY = unitY * sw * 1.118;
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  const pt = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
  const f = (type !== 'classic' && type !== 'classicThin') ? 1 : 3 / 4;
  pe.x += -unitX * f * 2 - endOffsetX;
  pe.y += -unitY * f * 2 - endOffsetY;

  return () => {
    canvas.begin();
    canvas.moveTo(pt.x, pt.y);
    canvas.lineTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
    canvas.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
    canvas.close();
    canvas.moveTo(pt.x - unitX, pt.y - unitY);
    canvas.lineTo(pt.x - 2 * unitX - 0.5 * unitY, pt.y + 0.5 * unitX - 2 * unitY);
    canvas.lineTo(pt.x - 2 * unitX + 0.5 * unitY, pt.y - 0.5 * unitX - 2 * unitY);
    canvas.close();
    paintFilled(canvas, filled);
  };
});

const diamond: MarkerFactory = (canvas, _shape, type, pe, unitX, unitY, size, _source, sw, filled) => {
  // The angle of the forward facing arrow sides against the x axis is
  // 45 degrees, 1/sin(45) = 1.4142 / 2 = 0.7071 ( / 2 allows for
  // only half the strokewidth is processed ). Or 0.9862 for thin diamond.
  // Note these values and the tk variable below are dependent, update
  // both together (saves trig hard coding it).
  const swFactor = type === 'diamond' ? 0.7071 : 0.9862;
  const endOffsetX = unitX * sw * swFactor;
  const endOffsetY = unitY * sw * swFactor;
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  const pt = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
  pe.x += -unitX - endOffsetX;
  pe.y += -unitY - endOffsetY;

  // thickness factor for diamond
  const tk = type === 'diamond' ? 2 : 3.4;

  return () => {
    canvas.begin();
    canvas.moveTo(pt.x, pt.y);
    canvas.lineTo(pt.x - unitX / 2 - unitY / tk, pt.y + unitX / tk - unitY / 2);
    canvas.lineTo(pt.x - unitX, pt.y - unitY);
    canvas.lineTo(pt.x - unitX / 2 + unitY / tk, pt.y - unitY / 2 - unitX / tk);
    canvas.close();
    paintFilled(canvas, filled);
  };
};

addMarker('diamond', diamond);
addMarker('diamondThin', diamond);

addMarker('manyOptional', (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  const px = pe.x;
  const py = pe.y;
  pe.x -= 2 * nx - unitX * sw / 2;
  pe.y -= 2 * ny - unitY * sw / 2;

  return () => {
    c.begin();
    c.ellipse(px - 1.5 * nx - a, py - 1.5 * ny - a, 2 * a, 2 * a);
    paintFilled(c, filled);
    c.begin();
    c.moveTo(px, py);
    c.lineTo(px - nx, py - ny);
    c.moveTo(px + ny / 2, py - nx / 2);
    c.lineTo(px - nx, py - ny);
    c.lineTo(px - ny / 2, py + nx / 2);
    c.stroke();
  };
});

// --- Shapes.js ----------------------------------------------------------------------

addMarker('dash', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x + ny / 2 - 3 * nx / 2, pe.y - 3 * ny / 2 - nx / 2);
    c.stroke();
  };
});

addMarker('box', (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const px = pe.x + nx / 2;
  const py = pe.y + ny / 2;
  pe.x -= nx;
  pe.y -= ny;
  return () => {
    c.begin();
    c.moveTo(px - nx / 2 - ny / 2, py - ny / 2 + nx / 2);
    c.lineTo(px - nx / 2 + ny / 2, py - ny / 2 - nx / 2);
    c.lineTo(px + ny / 2 - 3 * nx / 2, py - 3 * ny / 2 - nx / 2);
    c.lineTo(px - ny / 2 - 3 * nx / 2, py - 3 * ny / 2 + nx / 2);
    c.close();
    paintFilled(c, filled);
  };
});

addMarker('cross', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x + ny / 2 - 3 * nx / 2, pe.y - 3 * ny / 2 - nx / 2);
    c.moveTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2);
    c.lineTo(pe.x - ny / 2 - 3 * nx / 2, pe.y - 3 * ny / 2 + nx / 2);
    c.stroke();
  };
});

const circleMarker: MarkerFactory = (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  size = size + sw;
  const pt = { x: pe.x, y: pe.y };
  pe.x -= unitX * (2 * size + sw);
  pe.y -= unitY * (2 * size + sw);
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  return () => {
    c.ellipse(pt.x - unitX - size, pt.y - unitY - size, 2 * size, 2 * size);
    paintFilled(c, filled);
  };
};

addMarker('circle', circleMarker);

addMarker('circlePlus', (c, shape, type, pe, unitX, unitY, size, source, sw, filled) => {
  const pt = { x: pe.x, y: pe.y };
  const fn = circleMarker(c, shape, type, pe, unitX, unitY, size, source, sw, filled);
  const nx = unitX * (size + 2 * sw); // (size + sw + 1);
  const ny = unitY * (size + 2 * sw); //(size + sw + 1);
  return () => {
    fn();
    c.begin();
    c.moveTo(pt.x - unitX * sw, pt.y - unitY * sw);
    c.lineTo(pt.x - 2 * nx + unitX * sw, pt.y - 2 * ny + unitY * sw);
    c.moveTo(pt.x - nx - ny + unitY * sw, pt.y - ny + nx - unitX * sw);
    c.lineTo(pt.x + ny - nx - unitY * sw, pt.y - ny - nx + unitX * sw);
    c.stroke();
  };
});

addMarker('halfCircle', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const pt = { x: pe.x, y: pe.y };
  pe.x -= nx;
  pe.y -= ny;
  return () => {
    c.begin();
    c.moveTo(pt.x - ny, pt.y + nx);
    c.quadTo(pe.x - ny, pe.y + nx, pe.x, pe.y);
    c.quadTo(pe.x + ny, pe.y - nx, pt.x + ny, pt.y - nx);
    c.stroke();
  };
});

addMarker('async', (c, _shape, _type, pe, unitX, unitY, size, source, sw, filled) => {
  // The angle of the forward facing arrow sides against the x axis is
  // 26.565 degrees, 1/sin(26.565) = 2.236 / 2 = 1.118 ( / 2 allows for
  // only half the strokewidth is processed ).
  const endOffsetX = unitX * sw * 1.118;
  const endOffsetY = unitY * sw * 1.118;
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  const pt = { x: pe.x - endOffsetX, y: pe.y - endOffsetY };
  const f = 1;
  pe.x += -unitX * f - endOffsetX;
  pe.y += -unitY * f - endOffsetY;
  return () => {
    c.begin();
    c.moveTo(pt.x, pt.y);
    if (source) c.lineTo(pt.x - unitX - unitY / 2, pt.y - unitY + unitX / 2);
    else c.lineTo(pt.x + unitY / 2 - unitX, pt.y - unitY - unitX / 2);
    c.lineTo(pt.x - unitX, pt.y - unitY);
    c.close();
    paintFilled(c, filled);
  };
});

function createOpenAsyncArrow(widthFactor = 2): MarkerFactory {
  return (c, _shape, _type, pe, unitX, unitY, size, source, sw) => {
    unitX = unitX * (size + sw);
    unitY = unitY * (size + sw);
    const pt = { x: pe.x, y: pe.y };
    return () => {
      c.begin();
      c.moveTo(pt.x, pt.y);
      if (source) c.lineTo(pt.x - unitX - unitY / widthFactor, pt.y - unitY + unitX / widthFactor);
      else c.lineTo(pt.x + unitY / widthFactor - unitX, pt.y - unitY - unitX / widthFactor);
      c.stroke();
    };
  };
}

addMarker('openAsync', createOpenAsyncArrow(2));

// Mermaid class-diagram relation markers. The upstream mermaid markers
// are 17 units long and 12 wide (extension triangle path
// `M 1,7 L18,13 V 1`, composition/aggregation diamond
// `M 18,7 L9,13 L1,7 L9,1`) — a 17:6 length to half-width ratio that
// no stock marker matches (block/diamond are 1:1, diamondThin 1.7:1).
// Both scale with Size, so endSize=17 reproduces mermaid's dimensions
// exactly. The tip sits on the raw edge endpoint (no strokewidth
// pull-back) so the marker touches the node border like mermaid's
// refX=1 marker anchoring does.
addMarker('mermaidExtension', (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const wf = 17 / 6;
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  const pt = { x: pe.x, y: pe.y };
  pe.x -= unitX;
  pe.y -= unitY;
  return () => {
    c.begin();
    c.moveTo(pt.x, pt.y);
    c.lineTo(pt.x - unitX - unitY / wf, pt.y - unitY + unitX / wf);
    c.lineTo(pt.x - unitX + unitY / wf, pt.y - unitY - unitX / wf);
    c.close();
    paintFilled(c, filled);
  };
});

addMarker('mermaidDiamond', (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const wf = 17 / 6;
  unitX = unitX * (size + sw);
  unitY = unitY * (size + sw);
  const pt = { x: pe.x, y: pe.y };
  pe.x -= unitX;
  pe.y -= unitY;
  return () => {
    c.begin();
    c.moveTo(pt.x, pt.y);
    c.lineTo(pt.x - unitX / 2 - unitY / wf, pt.y - unitY / 2 + unitX / wf);
    c.lineTo(pt.x - unitX, pt.y - unitY);
    c.lineTo(pt.x - unitX / 2 + unitY / wf, pt.y - unitY / 2 - unitX / wf);
    c.close();
    paintFilled(c, filled);
  };
});

// --- shapes/er/mxER.js ----------------------------------------------------------------

addMarker('ERone', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2);
    c.stroke();
  };
});

addMarker('ERmandOne', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2);
    c.moveTo(pe.x - nx - ny / 2, pe.y - ny + nx / 2);
    c.lineTo(pe.x - nx + ny / 2, pe.y - ny - nx / 2);
    c.stroke();
  };
});

addMarker('ERmany', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x + ny / 2, pe.y - nx / 2);
    c.lineTo(pe.x - nx, pe.y - ny);
    c.lineTo(pe.x - ny / 2, pe.y + nx / 2);
    c.stroke();
  };
});

addMarker('ERoneToMany', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx - ny / 2, pe.y - ny + nx / 2);
    c.lineTo(pe.x - nx + ny / 2, pe.y - ny - nx / 2);
    c.moveTo(pe.x + ny / 2, pe.y - nx / 2);
    c.lineTo(pe.x - nx, pe.y - ny);
    c.lineTo(pe.x - ny / 2, pe.y + nx / 2);
    c.stroke();
  };
});

/** The circle of ERzeroToMany / ERzeroToOne: white with filled=1 (the markers use the stroke colour otherwise). */
function erCircle(c: SvgCanvas, shape: Shape, px: number, py: number, nx: number, ny: number, a: number, filled: boolean): void {
  c.begin();
  c.ellipse(px - 1.5 * nx - a, py - 1.5 * ny - a, 2 * a, 2 * a);
  if (filled) {
    // TODO not sure if this is ok, because by default, markers use strokeColor for filling
    const oldColor = getString(shape.style, 'strokeColor', '#666666');
    c.setFillColor('#ffffff');
    c.fillAndStroke();
    c.setFillColor(oldColor);
  } else {
    c.stroke();
  }
}

addMarker('ERzeroToMany', (c, shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  const px = pe.x;
  const py = pe.y;
  if (!filled) {
    pe.x -= 2 * nx - unitX * sw / 2;
    pe.y -= 2 * ny - unitY * sw / 2;
  }
  return () => {
    erCircle(c, shape, px, py, nx, ny, a, filled);
    c.begin();
    c.moveTo(px + ny / 2, py - nx / 2);
    c.lineTo(px - nx, py - ny);
    c.lineTo(px - ny / 2, py + nx / 2);
    if (!filled) {
      c.moveTo(px - nx, py - ny);
      c.lineTo(px, py);
    }
    c.stroke();
  };
});

addMarker('ERzeroToOne', (c, shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  const px = pe.x;
  const py = pe.y;
  if (!filled) {
    pe.x -= 2 * nx - unitX * sw / 2;
    pe.y -= 2 * ny - unitY * sw / 2;
  }
  return () => {
    erCircle(c, shape, px, py, nx, ny, a, filled);
    c.begin();
    c.moveTo(px - nx / 2 - ny / 2, py - ny / 2 + nx / 2);
    c.lineTo(px - nx / 2 + ny / 2, py - ny / 2 - nx / 2);
    if (!filled) {
      c.moveTo(px - nx - unitX * sw / 2, py - ny - unitY * sw / 2);
      c.lineTo(px, py);
    }
    c.stroke();
  };
});

// --- shapes/mxSysML.js ----------------------------------------------------------------

addMarker('sysMLPackCont', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2);
    c.stroke();
    c.ellipse(pe.x - 0.5 * nx - a, pe.y - 0.5 * ny - a, 2 * a, 2 * a);
    c.stroke();
  };
});

addMarker('sysMLReqInt', (c, shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  return () => {
    c.setFillColor(getString(shape.style, 'fillColor', 'none'));
    c.ellipse(pe.x - 0.5 * nx - a, pe.y - 0.5 * ny - a, 2 * a, 2 * a);
    c.fillAndStroke();
  };
});

addMarker('sysMLProvInt', (c, shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  return () => {
    c.setFillColor(getString(shape.style, 'fillColor', 'none'));
    c.begin();
    c.moveTo(pe.x - ny / 2, pe.y + nx / 2);
    c.arcTo(a, a, 0, 0, 1, pe.x + ny / 2, pe.y - nx / 2);
    c.fillAndStroke();
  };
});

addMarker('sysMLx', (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  return () => {
    c.begin();
    c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2);
    c.lineTo(pe.x + nx / 2 + ny / 2, pe.y + ny / 2 - nx / 2);
    c.moveTo(pe.x + nx / 2 - ny / 2, pe.y + ny / 2 + nx / 2);
    c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2);
    c.stroke();
  };
});

addMarker('sysMLLost', (c, shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  return () => {
    c.begin();
    c.moveTo(pe.x - 1.5 * nx - ny / 2, pe.y - 1.5 * ny + nx / 2);
    c.lineTo(pe.x - nx / 2, pe.y - ny / 2);
    c.lineTo(pe.x - 1.5 * nx + ny / 2, pe.y - 1.5 * ny - nx / 2);
    c.stroke();
    c.ellipse(pe.x - 0.5 * nx - a, pe.y - 0.5 * ny - a, 2 * a, 2 * a);
    c.setFillColor(getString(shape.style, 'strokeColor', '#000000'));
    c.fillAndStroke();
  };
});

addMarker('sysMLFound', (c, shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1);
  const ny = unitY * (size + sw + 1);
  const a = size / 2;
  return () => {
    c.ellipse(pe.x - 0.5 * nx - a, pe.y - 0.5 * ny - a, 2 * a, 2 * a);
    c.setFillColor(getString(shape.style, 'strokeColor', '#000000'));
    c.fillAndStroke();
  };
});
