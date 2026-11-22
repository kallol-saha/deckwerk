/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * shapes/mxElectrical.js — the electro-mechanical switches (two way
 * switch, pushbuttons, single switch, disconnector, fuse, actuated
 * switches, selector switches, contacts, DPST/DPDT, position switches,
 * time delay, isolator, changeover and reed switches) and their
 * connection points. mxElectrical.ts lists them with the rest of the
 * library.
 * Modified for DeckWerk: the customProperties tables are left out; the
 * painting code is unchanged.
 */

import type { SvgCanvas } from '../canvas.js';
import { Shape, constraint, type ConnectionConstraint, type ShapeClass } from './shape.js';
import { getValue, looseEq } from './util.js';

/** Perimeter connection points at the given relative x, y pairs. */
function points(...xy: number[]): readonly ConnectionConstraint[] {
  const out: ConnectionConstraint[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push(constraint(xy[i], xy[i + 1], true));
  return out;
}

// --- Two way switch -----------------------------------------------------------------------------

export class ElectricalTwoWaySwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(1, 0.12, 0, 0.5, 1, 0.88);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();

    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);

    c.moveTo(0.8 * w, 0.88 * h);
    c.lineTo(w, 0.88 * h);

    c.moveTo(0.8 * w, 0.12 * h);
    c.lineTo(w, 0.12 * h);

    if (looseEq(switchState, '2')) {
      c.moveTo(0.28 * w, 0.48 * h);
      c.lineTo(0.72 * w, 0.15 * h);
    } else {
      c.moveTo(0.28 * w, 0.52 * h);
      c.lineTo(0.72 * w, 0.85 * h);
    }

    c.stroke();

    c.ellipse(0.72 * w, 0.77 * h, 0.08 * w, 0.23 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0, 0.08 * w, 0.23 * h);
    c.fillAndStroke();
    c.ellipse(0.2 * w, 0.385 * h, 0.08 * w, 0.23 * h);
    c.fillAndStroke();
  }
}

// --- Pushbutton ---------------------------------------------------------------------------------

export class ElectricalPushbutton extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0, 0.8 * h);
    c.lineTo(0.2 * w, 0.8 * h);
    c.moveTo(0.8 * w, 0.8 * h);
    c.lineTo(w, 0.8 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.5 * w, 0.5 * h);
      c.lineTo(0.5 * w, 0);
      c.moveTo(0.46 * w, 0);
      c.lineTo(0.54 * w, 0);
      c.moveTo(0.2 * w, 0.5 * h);
      c.lineTo(0.8 * w, 0.5 * h);
    } else {
      c.moveTo(0.5 * w, h);
      c.lineTo(0.5 * w, 0.5 * h);
      c.moveTo(0.46 * w, 0.5 * h);
      c.lineTo(0.54 * w, 0.5 * h);
      c.moveTo(0.2 * w, h);
      c.lineTo(0.8 * w, h);
    }

    c.stroke();

    c.ellipse(0.72 * w, 0.65 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
    c.ellipse(0.2 * w, 0.65 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
  }
}

// --- Single switch ------------------------------------------------------------------------------

export class ElectricalSingleSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0, 0.8 * h);
    c.lineTo(0.2 * w, 0.8 * h);
    c.moveTo(0.8 * w, 0.8 * h);
    c.lineTo(w, 0.8 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.75 * h);
      c.lineTo(0.76 * w, 0);
    } else {
      c.moveTo(0.2 * w, 0.8 * h);
      c.lineTo(0.8 * w, 0.8 * h);
    }

    c.stroke();

    c.ellipse(0.72 * w, 0.65 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
    c.ellipse(0.2 * w, 0.65 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
  }
}

// --- Switch disconnector ------------------------------------------------------------------------

export class ElectricalSwitchDisconnector extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.84, 1, 0.84);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.84 * h);
    c.lineTo(w, 0.84 * h);
    c.moveTo(0.8 * w, 0.68 * h);
    c.lineTo(0.8 * w, h);
    c.moveTo(0, 0.84 * h);
    c.lineTo(0.24 * w, 0.84 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0);
    } else {
      c.lineTo(0.8 * w, 0.84 * h);
    }

    c.stroke();

    c.ellipse(0.72 * w, 0.68 * h, 0.08 * w, 0.32 * h);
    c.fillAndStroke();
  }
}

// --- Fuse 2 -------------------------------------------------------------------------------------

export class ElectricalFuse2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.8 * h);
    c.lineTo(w, 0.8 * h);
    c.moveTo(0, 0.8 * h);
    c.lineTo(0.25 * w, 0.8 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0);

      c.moveTo(0.348 * w, 0.47 * h);
      c.lineTo(0.563 * w, 0.13 * h);
      c.lineTo(0.603 * w, 0.46 * h);
      c.lineTo(0.387 * w, 0.78 * h);
      c.close();
    } else {
      c.lineTo(0.8 * w, 0.8 * h);

      c.moveTo(0.38 * w, 0.6 * h);
      c.lineTo(0.62 * w, 0.6 * h);
      c.lineTo(0.62 * w, h);
      c.lineTo(0.38 * w, h);
      c.close();
    }

    c.stroke();
  }
}

// --- Liquid Level Actuated Switch ---------------------------------------------------------------

export class ElectricalLiquidLevelActuatedSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.27, 1, 0.27);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.27 * h);
    c.lineTo(w, 0.27 * h);
    c.moveTo(0, 0.27 * h);
    c.lineTo(0.2 * w, 0.27 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.24 * w, 0);
      c.lineTo(0.76 * w, 0);
      c.moveTo(0.5 * w, 0);
      c.lineTo(0.5 * w, 0.47 * h);
      c.stroke();

      c.ellipse(0.45 * w, 0.47 * h, 0.1 * w, 0.26 * h);
      c.fillAndStroke();
    } else {
      c.moveTo(0.28 * w, 0.27 * h);
      c.lineTo(0.72 * w, 0.27 * h);
      c.moveTo(0.5 * w, 0.27 * h);
      c.lineTo(0.5 * w, 0.74 * h);
      c.stroke();

      c.ellipse(0.45 * w, 0.74 * h, 0.1 * w, 0.26 * h);
      c.fillAndStroke();
    }

    c.ellipse(0.2 * w, 0.17 * h, 0.08 * w, 0.2 * h);
    c.fillAndStroke();

    c.ellipse(0.72 * w, 0.17 * h, 0.08 * w, 0.2 * h);
    c.fillAndStroke();
  }
}

// --- Liquid Level Actuated Switch 2 -------------------------------------------------------------

export class ElectricalLiquidLevelActuatedSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.76 * w, h);
    c.lineTo(w, h);
    c.moveTo(0, h);
    c.lineTo(0.24 * w, h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0.5 * h);
      c.moveTo(0.42 * w, 0);
      c.lineTo(0.58 * w, 0);
      c.lineTo(0.58 * w, 0.4 * h);
      c.lineTo(0.42 * w, 0.4 * h);
      c.close();
      c.moveTo(0.46 * w, 0.22 * h);
      c.arcTo(0.05 * w, 0.1 * h, 0, 0, 1, 0.54 * w, 0.22 * h);
      c.arcTo(0.05 * w, 0.1 * h, 0, 0, 1, 0.46 * w, 0.22 * h);
      c.close();
      c.moveTo(0.5 * w, 0.1 * h);
      c.lineTo(0.5 * w, 0.17 * h);
      c.moveTo(0.5 * w, 0.4 * h);
      c.lineTo(0.5 * w, 0.55 * h);
      c.moveTo(0.5 * w, 0.63 * h);
      c.lineTo(0.5 * w, 0.75 * h);
      c.stroke();
    } else {
      c.lineTo(0.76 * w, h);
      c.moveTo(0.42 * w, 0.25 * h);
      c.lineTo(0.58 * w, 0.25 * h);
      c.lineTo(0.58 * w, 0.65 * h);
      c.lineTo(0.42 * w, 0.65 * h);
      c.close();
      c.moveTo(0.46 * w, 0.47 * h);
      c.arcTo(0.05 * w, 0.1 * h, 0, 0, 1, 0.54 * w, 0.47 * h);
      c.arcTo(0.05 * w, 0.1 * h, 0, 0, 1, 0.46 * w, 0.47 * h);
      c.close();
      c.moveTo(0.5 * w, 0.35 * h);
      c.lineTo(0.5 * w, 0.42 * h);
      c.moveTo(0.5 * w, 0.65 * h);
      c.lineTo(0.5 * w, 0.8 * h);
      c.moveTo(0.5 * w, 0.88 * h);
      c.lineTo(0.5 * w, h);
      c.stroke();
      c.stroke();
    }
  }
}

// --- Gas Flow Actuated Switch -------------------------------------------------------------------

export class ElectricalGasFlowActuatedSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.76 * w, h);
    c.lineTo(w, h);
    c.moveTo(0, h);
    c.lineTo(0.24 * w, h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0.5 * h);
      c.moveTo(0.42 * w, 0);
      c.lineTo(0.58 * w, 0);
      c.lineTo(0.58 * w, 0.4 * h);
      c.lineTo(0.42 * w, 0.4 * h);
      c.close();

      c.moveTo(0.54 * w, 0.34 * h);
      c.lineTo(0.54 * w, 0.09 * h);
      c.lineTo(0.46 * w, 0.09 * h);
      c.lineTo(0.46 * w, 0.26 * h);
      c.lineTo(0.54 * w, 0.26 * h);
      c.moveTo(0.5 * w, 0.4 * h);
      c.lineTo(0.5 * w, 0.55 * h);
      c.moveTo(0.5 * w, 0.63 * h);
      c.lineTo(0.5 * w, 0.75 * h);
      c.stroke();

      c.ellipse(0.475 * w, 0.165 * h, 0.025 * w, 0.06 * h);
      c.stroke();
    } else {
      c.lineTo(0.76 * w, h);
      c.moveTo(0.42 * w, 0.25 * h);
      c.lineTo(0.58 * w, 0.25 * h);
      c.lineTo(0.58 * w, 0.65 * h);
      c.lineTo(0.42 * w, 0.65 * h);
      c.close();

      c.moveTo(0.54 * w, 0.59 * h);
      c.lineTo(0.54 * w, 0.34 * h);
      c.lineTo(0.46 * w, 0.34 * h);
      c.lineTo(0.46 * w, 0.51 * h);
      c.lineTo(0.54 * w, 0.51 * h);
      c.moveTo(0.5 * w, 0.65 * h);
      c.lineTo(0.5 * w, 0.80 * h);
      c.moveTo(0.5 * w, 0.88 * h);
      c.lineTo(0.5 * w, h);
      c.stroke();

      c.ellipse(0.475 * w, 0.415 * h, 0.025 * w, 0.06 * h);
      c.stroke();
    }
  }
}

// --- Flow Actuated Switch -----------------------------------------------------------------------

export class ElectricalFlowActuatedSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.1, 1, 0.1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.1 * h);
    c.lineTo(w, 0.1 * h);
    c.moveTo(0, 0.1 * h);
    c.lineTo(0.2 * w, 0.1 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.13 * h);
      c.lineTo(0.76 * w, 0.61 * h);
      c.moveTo(0.5 * w, 0.35 * h);
      c.lineTo(0.5 * w, h);
      c.lineTo(0.6 * w, h);
      c.lineTo(0.5 * w, 0.68 * h);
    } else {
      c.moveTo(0.28 * w, 0.1 * h);
      c.lineTo(0.72 * w, 0.1 * h);
      c.moveTo(0.5 * w, 0.1 * h);
      c.lineTo(0.5 * w, 0.85 * h);
      c.lineTo(0.6 * w, 0.85 * h);
      c.lineTo(0.5 * w, 0.53 * h);
    }

    c.stroke();

    c.ellipse(0.2 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();

    c.ellipse(0.72 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();
  }
}

// --- Pressure Actuated Switch -------------------------------------------------------------------

export class ElectricalPressureActuatedSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.1, 1, 0.1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.1 * h);
    c.lineTo(w, 0.1 * h);
    c.moveTo(0, 0.1 * h);
    c.lineTo(0.2 * w, 0.1 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.13 * h);
      c.lineTo(0.76 * w, 0.61 * h);
      c.moveTo(0.5 * w, 0.35 * h);
      c.lineTo(0.5 * w, 0.74 * h);
      c.moveTo(0.39 * w, h);
      c.arcTo(0.11 * w, 0.26 * h, 0, 0, 1, 0.5 * w, 0.74 * h);
      c.arcTo(0.11 * w, 0.26 * h, 0, 0, 1, 0.61 * w, h);
      c.close();
    } else {
      c.moveTo(0.28 * w, 0.1 * h);
      c.lineTo(0.72 * w, 0.1 * h);
      c.moveTo(0.5 * w, 0.1 * h);
      c.lineTo(0.5 * w, 0.49 * h);
      c.moveTo(0.39 * w, 0.75 * h);
      c.arcTo(0.11 * w, 0.26 * h, 0, 0, 1, 0.5 * w, 0.49 * h);
      c.arcTo(0.11 * w, 0.26 * h, 0, 0, 1, 0.61 * w, 0.75 * h);
      c.close();
    }

    c.stroke();

    c.ellipse(0.2 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();

    c.ellipse(0.72 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();
  }
}

// --- Temperature Actuated Switch ----------------------------------------------------------------

export class ElectricalTemperatureActuatedSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.1, 1, 0.1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.1 * h);
    c.lineTo(w, 0.1 * h);
    c.moveTo(0, 0.1 * h);
    c.lineTo(0.2 * w, 0.1 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.13 * h);
      c.lineTo(0.76 * w, 0.61 * h);
      c.moveTo(0.5 * w, 0.35 * h);
      c.lineTo(0.5 * w, 0.64 * h);
      c.lineTo(0.57 * w, 0.64 * h);
      c.lineTo(0.57 * w, 0.81 * h);
      c.lineTo(0.5 * w, 0.81 * h);
      c.lineTo(0.5 * w, h);
    } else {
      c.moveTo(0.28 * w, 0.1 * h);
      c.lineTo(0.72 * w, 0.1 * h);
      c.moveTo(0.5 * w, 0.1 * h);
      c.lineTo(0.5 * w, 0.39 * h);
      c.lineTo(0.57 * w, 0.39 * h);
      c.lineTo(0.57 * w, 0.56 * h);
      c.lineTo(0.5 * w, 0.56 * h);
      c.lineTo(0.5 * w, 0.75 * h);
    }

    c.stroke();

    c.ellipse(0.2 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();

    c.ellipse(0.72 * w, 0, 0.08 * w, 0.2 * h);
    c.stroke();
  }
}

// --- Safety Interlock Switch --------------------------------------------------------------------

export class ElectricalSafetyInterlockSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.35, 1, 0.35);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();

    c.moveTo(0.8 * w, 0.34 * h);
    c.lineTo(w, 0.34 * h);
    c.moveTo(0, 0.34 * h);
    c.lineTo(0.2 * w, 0.34 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.25 * w, 0);
      c.lineTo(0.75 * w, 0);
      c.lineTo(0.5 * w, 0.81 * h);
      c.close();
    } else {
      c.moveTo(0.25 * w, 0.19 * h);
      c.lineTo(0.75 * w, 0.19 * h);
      c.lineTo(0.5 * w, h);
      c.close();
    }

    c.stroke();

    c.ellipse(0.2 * w, 0.27 * h, 0.08 * w, 0.14 * h);
    c.stroke();

    c.ellipse(0.72 * w, 0.27 * h, 0.08 * w, 0.14 * h);
    c.stroke();
  }
}

// --- Temperature Switch -------------------------------------------------------------------------

export class ElectricalTemperatureSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0.76 * w, h);
    c.lineTo(w, h);
    c.moveTo(0, h);
    c.lineTo(0.24 * w, h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0.1 * h);
    } else {
      c.lineTo(0.76 * w, h);
    }

    c.stroke();

    c.ellipse(0.43 * w, 0, 0.1 * w, 0.22 * h);
    c.fillAndStroke();
    c.begin();
    c.moveTo(0.48 * w, 0);
    c.lineTo(0.48 * w, 0.22 * h);
    c.stroke();
  }
}

// --- Thermostat2 --------------------------------------------------------------------------------

export class ElectricalThermostat2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0.8 * w, 0.86 * h);
    c.lineTo(w, 0.86 * h);
    c.moveTo(0, 0.86 * h);
    c.lineTo(0.2 * w, 0.86 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.82 * h);
      c.lineTo(0.76 * w, 0.2 * h);
    } else {
      c.moveTo(0.28 * w, 0.86 * h);
      c.lineTo(0.72 * w, 0.85 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.72 * h, 0.08 * w, 0.28 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.72 * h, 0.08 * w, 0.28 * h);
    c.fillAndStroke();
    c.text(0.5 * w, 0.2 * h, 0, 0, 'tº', 'center', 'middle', false, undefined, null, false, 0);
  }
}

// --- Limit Switch 2 -----------------------------------------------------------------------------

export class ElectricalLimitSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0.8 * w, 0.84 * h);
    c.lineTo(w, 0.84 * h);
    c.moveTo(0, 0.84 * h);
    c.lineTo(0.2 * w, 0.84 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.8 * h);
      c.lineTo(0.76 * w, 0);
      c.moveTo(0.46 * w, 0.5 * h);
      c.lineTo(0.545 * w, 0.07 * h);
      c.lineTo(0.57 * w, 0.3 * h);
    } else {
      c.moveTo(0.28 * w, 0.84 * h);
      c.lineTo(0.72 * w, 0.84 * h);
      c.moveTo(0.47 * w, 0.84 * h);
      c.lineTo(0.58 * w, 0.57 * h);
      c.lineTo(0.58 * w, 0.84 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.68 * h, 0.08 * w, 0.32 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.68 * h, 0.08 * w, 0.32 * h);
    c.fillAndStroke();
  }
}

// --- Circuit Breaker 2 --------------------------------------------------------------------------

export class ElectricalCircuitBreaker2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0.8 * w, 0.8 * h);
    c.lineTo(w, 0.8 * h);
    c.moveTo(0.75 * w, 0.6 * h);
    c.lineTo(0.85 * w, h);
    c.moveTo(0.85 * w, 0.6 * h);
    c.lineTo(0.75 * w, h);
    c.moveTo(0, 0.8 * h);
    c.lineTo(0.24 * w, 0.8 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0);
    } else {
      c.lineTo(0.8 * w, 0.8 * h);
    }

    c.stroke();
  }
}

// --- Selector Switch - 3 Position 2 -------------------------------------------------------------

export class ElectricalSelectorSwitch3Position2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.06, 1, 0.5, 1, 0.94);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.68 * w, 0.06 * h);
    c.lineTo(w, 0.06 * h);
    c.moveTo(0.75 * w, 0.5 * h);
    c.lineTo(w, 0.5 * h);
    c.moveTo(0.68 * w, 0.94 * h);
    c.lineTo(w, 0.94 * h);
    c.stroke();
    c.ellipse(0.2 * w, 0.435 * h, 0.08 * w, 0.13 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0, 0.08 * w, 0.13 * h);
    c.fillAndStroke();
    c.ellipse(0.67 * w, 0.435 * h, 0.08 * w, 0.13 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0.87 * h, 0.08 * w, 0.13 * h);
    c.fillAndStroke();
    c.setFillColor(String(strokeColor));

    if (looseEq(switchState, '1')) {
      c.begin();
      c.moveTo(0.27 * w, 0.47 * h);
      c.lineTo(0.59 * w, 0.12 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.52 * w, 0.12 * h);
      c.lineTo(0.61 * w, 0.095 * h);
      c.lineTo(0.565 * w, 0.22 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '2')) {
      c.begin();
      c.moveTo(0.28 * w, 0.5 * h);
      c.lineTo(0.64 * w, 0.5 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.59 * w, 0.44 * h);
      c.lineTo(0.67 * w, 0.5 * h);
      c.lineTo(0.59 * w, 0.56 * h);
      c.close();
      c.fill();
    } else {
      c.begin();
      c.moveTo(0.27 * w, 0.53 * h);
      c.lineTo(0.59 * w, 0.88 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.52 * w, 0.88 * h);
      c.lineTo(0.61 * w, 0.905 * h);
      c.lineTo(0.565 * w, 0.78 * h);
      c.close();
      c.fill();
    }
  }
}

// --- Selector Switch - 4 Position 2 -------------------------------------------------------------

export class ElectricalSelectorSwitch4Position2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.045, 1, 0.35, 1, 0.65, 1, 0.955);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.68 * w, 0.045 * h);
    c.lineTo(w, 0.045 * h);
    c.moveTo(0.8 * w, 0.35 * h);
    c.lineTo(w, 0.35 * h);
    c.moveTo(0.8 * w, 0.65 * h);
    c.lineTo(w, 0.65 * h);
    c.moveTo(0.68 * w, 0.955 * h);
    c.lineTo(w, 0.955 * h);
    c.stroke();
    c.ellipse(0.2 * w, 0.455 * h, 0.08 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0, 0.08 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.305 * h, 0.08 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.605 * h, 0.08 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0.91 * h, 0.08 * w, 0.09 * h);
    c.fillAndStroke();
    c.setFillColor(String(strokeColor));

    if (looseEq(switchState, '1')) {
      c.begin();
      c.moveTo(0.27 * w, 0.47 * h);
      c.lineTo(0.58 * w, 0.11 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.515 * w, 0.115 * h);
      c.lineTo(0.61 * w, 0.08 * h);
      c.lineTo(0.58 * w, 0.18 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '2')) {
      c.begin();
      c.moveTo(0.28 * w, 0.485 * h);
      c.lineTo(0.69 * w, 0.37 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.62 * w, 0.34 * h);
      c.lineTo(0.72 * w, 0.36 * h);
      c.lineTo(0.64 * w, 0.43 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '3')) {
      c.begin();
      c.moveTo(0.28 * w, 0.515 * h);
      c.lineTo(0.69 * w, 0.63 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.62 * w, 0.66 * h);
      c.lineTo(0.72 * w, 0.64 * h);
      c.lineTo(0.64 * w, 0.57 * h);
      c.close();
      c.fill();
    } else {
      c.begin();
      c.moveTo(0.27 * w, 0.53 * h);
      c.lineTo(0.58 * w, 0.89 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.515 * w, 0.885 * h);
      c.lineTo(0.61 * w, 0.92 * h);
      c.lineTo(0.58 * w, 0.82 * h);
      c.close();
      c.fill();
    }
  }
}

// --- Selector Switch - 6 Position 2 -------------------------------------------------------------

export class ElectricalSelectorSwitch6Position2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null =
    points(0, 0.5, 1, 0.03, 1, 0.22, 1, 0.405, 1, 0.595, 1, 0.78, 1, 0.97);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.39 * w, 0.03 * h);
    c.lineTo(w, 0.03 * h);
    c.moveTo(0.68 * w, 0.22 * h);
    c.lineTo(w, 0.22 * h);
    c.moveTo(0.8 * w, 0.405 * h);
    c.lineTo(w, 0.405 * h);
    c.moveTo(0.8 * w, 0.595 * h);
    c.lineTo(w, 0.595 * h);
    c.moveTo(0.68 * w, 0.78 * h);
    c.lineTo(w, 0.78 * h);
    c.moveTo(0.39 * w, 0.97 * h);
    c.lineTo(w, 0.97 * h);
    c.stroke();
    c.ellipse(0.2 * w, 0.47 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.31 * w, 0, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0.19 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.375 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.565 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.6 * w, 0.75 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.ellipse(0.31 * w, 0.94 * h, 0.08 * w, 0.06 * h);
    c.fillAndStroke();
    c.setFillColor(String(strokeColor));

    if (looseEq(switchState, '1')) {
      c.begin();
      c.moveTo(0.25 * w, 0.47 * h);
      c.lineTo(0.34 * w, 0.08 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.29 * w, 0.115 * h);
      c.lineTo(0.34 * w, 0.06 * h);
      c.lineTo(0.37 * w, 0.12 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '2')) {
      c.begin();
      c.moveTo(0.27 * w, 0.48 * h);
      c.lineTo(0.595 * w, 0.25 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.52 * w, 0.265 * h);
      c.lineTo(0.61 * w, 0.24 * h);
      c.lineTo(0.58 * w, 0.302 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '3')) {
      c.begin();
      c.moveTo(0.28 * w, 0.495 * h);
      c.lineTo(0.69 * w, 0.42 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.63 * w, 0.405 * h);
      c.lineTo(0.72 * w, 0.415 * h);
      c.lineTo(0.65 * w, 0.455 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '4')) {
      c.begin();
      c.moveTo(0.28 * w, 0.505 * h);
      c.lineTo(0.69 * w, 0.58 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.63 * w, 0.595 * h);
      c.lineTo(0.72 * w, 0.585 * h);
      c.lineTo(0.65 * w, 0.545 * h);
      c.close();
      c.fill();
    } else if (looseEq(switchState, '5')) {
      c.begin();
      c.moveTo(0.27 * w, 0.52 * h);
      c.lineTo(0.595 * w, 0.75 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.52 * w, 0.735 * h);
      c.lineTo(0.61 * w, 0.76 * h);
      c.lineTo(0.58 * w, 0.698 * h);
      c.close();
      c.fill();
    } else {
      c.begin();
      c.moveTo(0.25 * w, 0.53 * h);
      c.lineTo(0.34 * w, 0.92 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.29 * w, 0.885 * h);
      c.lineTo(0.34 * w, 0.94 * h);
      c.lineTo(0.37 * w, 0.88 * h);
      c.close();
      c.fill();
    }
  }
}

// --- Shorting Selector Switch 2 -----------------------------------------------------------------

export class ElectricalShortingSelectorSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');
    // (draw.io also reads the unused strokeColor here)

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.25 * w, 0.5 * h);
    c.stroke();
    c.ellipse(0.25 * w, 0.455 * h, 0.1 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.75 * w, 0, 0.1 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.9 * w, 0.305 * h, 0.1 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.9 * w, 0.605 * h, 0.1 * w, 0.09 * h);
    c.fillAndStroke();
    c.ellipse(0.75 * w, 0.91 * h, 0.1 * w, 0.09 * h);
    c.fillAndStroke();

    if (looseEq(switchState, '1')) {
      c.begin();
      c.moveTo(0.33 * w, 0.47 * h);
      c.lineTo(0.72 * w, 0.12 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.617 * w, 0.044 * h);
      c.arcTo(0.21 * w, 0.17 * h, 0, 0, 1, 0.818 * w, 0.182 * h);
      c.lineTo(0.766 * w, 0.198 * h);
      c.arcTo(0.15 * w, 0.13 * h, 0, 0, 0, 0.617 * w, 0.092 * h);
      c.close();
      c.fillAndStroke();
    } else if (looseEq(switchState, '2')) {
      c.begin();
      c.moveTo(0.34 * w, 0.49 * h);
      c.lineTo(0.83 * w, 0.375 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.791 * w, 0.263 * h);
      c.arcTo(0.24 * w, 0.2 * h, 0, 0, 1, 0.889 * w, 0.474 * h);
      c.lineTo(0.837 * w, 0.465 * h);
      c.arcTo(0.16 * w, 0.14 * h, 0, 0, 0, 0.767 * w, 0.303 * h);
      c.close();
      c.fillAndStroke();
    } else if (looseEq(switchState, '3')) {
      c.begin();
      c.moveTo(0.34 * w, 0.51 * h);
      c.lineTo(0.83 * w, 0.625 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.791 * w, 0.737 * h);
      c.arcTo(0.24 * w, 0.2 * h, 0, 0, 0, 0.889 * w, 0.526 * h);
      c.lineTo(0.837 * w, 0.535 * h);
      c.arcTo(0.16 * w, 0.14 * h, 0, 0, 1, 0.767 * w, 0.697 * h);
      c.close();
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(0.33 * w, 0.53 * h);
      c.lineTo(0.72 * w, 0.88 * h);
      c.stroke();
      c.begin();
      c.moveTo(0.617 * w, 0.956 * h);
      c.arcTo(0.21 * w, 0.17 * h, 0, 0, 0, 0.818 * w, 0.818 * h);
      c.lineTo(0.766 * w, 0.802 * h);
      c.arcTo(0.15 * w, 0.13 * h, 0, 0, 1, 0.617 * w, 0.908 * h);
      c.close();
      c.fillAndStroke();
    }
  }
}

// --- Proximity Limit Switch 2 -------------------------------------------------------------------

export class ElectricalProximityLimitSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.5);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.8 * w, 0.5 * h);
    c.lineTo(w, 0.5 * h);
    c.moveTo(0.13 * w, 0.5 * h);
    c.lineTo(0.5 * w, 0);
    c.lineTo(0.87 * w, 0.5 * h);
    c.lineTo(0.5 * w, h);
    c.close();
    c.stroke();

    if (looseEq(switchState, 'off')) {
      c.begin();
      c.moveTo(0.755 * w, 0.355 * h);
      c.lineTo(0.22 * w, 0.5 * h);
      c.lineTo(0.625 * w, 0.61 * h);
      c.lineTo(0.72 * w, 0.36 * h);
      c.stroke();
    } else {
      c.begin();
      c.moveTo(0.76 * w, 0.43 * h);
      c.lineTo(0.235 * w, 0.5 * h);
      c.lineTo(0.615 * w, 0.66 * h);
      c.lineTo(0.72 * w, 0.44 * h);
      c.stroke();
    }

    c.ellipse(0.2 * w, 0.445 * h, 0.08 * w, 0.11 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.445 * h, 0.08 * w, 0.11 * h);
    c.fillAndStroke();
  }
}

// --- Inertia Switch 2 ---------------------------------------------------------------------------

export class ElectricalInertiaSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.85, 1, 0.85);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0, 0.85 * h);
    c.lineTo(0.2 * w, 0.85 * h);
    c.moveTo(0.8 * w, 0.85 * h);
    c.lineTo(w, 0.85 * h);
    c.stroke();

    if (looseEq(switchState, 'off')) {
      c.begin();
      c.moveTo(0.28 * w, 0.79 * h);
      c.lineTo(0.76 * w, 0);
      c.moveTo(0.493 * w, 0.45 * h);
      c.lineTo(0.493 * w, 0.26 * h);
      c.lineTo(0.43 * w, 0.26 * h);
      c.stroke();
      c.ellipse(0.35 * w, 0.1 * h, 0.08 * w, 0.3 * h);
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(0.28 * w, 0.85 * h);
      c.lineTo(0.76 * w, 0.85 * h);
      c.moveTo(0.51 * w, 0.85 * h);
      c.lineTo(0.51 * w, 0.26 * h);
      c.lineTo(0.43 * w, 0.26 * h);
      c.stroke();
      c.ellipse(0.35 * w, 0.1 * h, 0.08 * w, 0.3 * h);
      c.fillAndStroke();
    }

    c.ellipse(0.2 * w, 0.7 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.7 * h, 0.08 * w, 0.3 * h);
    c.fillAndStroke();
  }
}

// --- Pushbutton Break 2 -------------------------------------------------------------------------

export class ElectricalPushbuttonBreak2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0, 0.8 * h);
    c.lineTo(0.2 * w, 0.8 * h);
    c.moveTo(0.8 * w, 0.8 * h);
    c.lineTo(w, 0.8 * h);
    c.stroke();

    if (looseEq(switchState, 'off')) {
      c.begin();
      c.moveTo(0.24 * w, h);
      c.lineTo(0.76 * w, h);
      c.moveTo(0.5 * w, h);
      c.lineTo(0.5 * w, 0.1 * h);
      c.stroke();
    } else {
      c.begin();
      c.moveTo(0.24 * w, 0.9 * h);
      c.lineTo(0.76 * w, 0.9 * h);
      c.moveTo(0.5 * w, 0.9 * h);
      c.lineTo(0.5 * w, 0);
      c.stroke();
    }

    c.ellipse(0.2 * w, 0.725 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.725 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
  }
}

// --- Manual Switch 2 ----------------------------------------------------------------------------

export class ElectricalManualSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'on');

    c.begin();
    c.moveTo(0.8 * w, h);
    c.lineTo(w, h);
    c.moveTo(0, h);
    c.lineTo(0.25 * w, h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0.1 * h);
      c.moveTo(0.49 * w, 0);
      c.lineTo(0.49 * w, 0.2 * h);
      c.moveTo(0.49 * w, 0.3 * h);
      c.lineTo(0.49 * w, 0.55 * h);
      c.moveTo(0.41 * w, 0);
      c.lineTo(0.57 * w, 0);
    } else {
      c.lineTo(0.8 * w, h);
      c.moveTo(0.49 * w, 0.45 * h);
      c.lineTo(0.49 * w, 0.65 * h);
      c.moveTo(0.49 * w, 0.75 * h);
      c.lineTo(0.49 * w, h);
      c.moveTo(0.41 * w, 0.45 * h);
      c.lineTo(0.57 * w, 0.45 * h);
    }

    c.stroke();
  }
}

// --- Two Way Contact 2 --------------------------------------------------------------------------

export class ElectricalTwoWayContact2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.21 * w, 0.5 * h);
    c.moveTo(0.67 * w, 0);
    c.lineTo(w, 0);
    c.moveTo(0.67 * w, h);
    c.lineTo(w, h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.28 * w, 0.46 * h);
      c.lineTo(0.67 * w, 0);
    } else if (looseEq(switchState, '2')) {
      c.moveTo(0.28 * w, 0.54 * h);
      c.lineTo(0.67 * w, h);
    } else {
      c.moveTo(0.28 * w, 0.5 * h);
      c.lineTo(0.67 * w, 0.5 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.4 * h, 0.08 * w, 0.2 * h);
    c.fillAndStroke();
  }
}

// --- Passing Make-Contact 2 ---------------------------------------------------------------------

export class ElectricalPassingMakeContact2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.7, 1, 0.7);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(w, 0.7 * h);
    c.lineTo(0.77 * w, 0.7 * h);
    c.lineTo(0.93 * w, h);
    c.moveTo(0, 0.7 * h);
    c.lineTo(0.25 * w, 0.7 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.76 * w, 0);
    } else {
      c.lineTo(0.76 * w, 0.7 * h);
    }

    c.stroke();
  }
}

// --- DPST 2 -------------------------------------------------------------------------------------

export class ElectricalDPST2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.4, 0, 0.92, 1, 0.4, 1, 0.92);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(0, 0.4 * h);
    c.lineTo(0.2 * w, 0.4 * h);
    c.moveTo(0.8 * w, 0.4 * h);
    c.lineTo(w, 0.4 * h);
    c.moveTo(0, 0.92 * h);
    c.lineTo(0.2 * w, 0.92 * h);
    c.moveTo(0.8 * w, 0.92 * h);
    c.lineTo(w, 0.92 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.28 * w, 0.38 * h);
      c.lineTo(0.76 * w, 0);
      c.moveTo(0.28 * w, 0.9 * h);
      c.lineTo(0.76 * w, 0.52 * h);
      c.moveTo(0.5 * w, 0.2 * h);
      c.lineTo(0.5 * w, 0.33 * h);
      c.moveTo(0.5 * w, 0.38 * h);
      c.lineTo(0.5 * w, 0.51 * h);
      c.moveTo(0.5 * w, 0.56 * h);
      c.lineTo(0.5 * w, 0.69 * h);
    } else {
      c.moveTo(0.28 * w, 0.4 * h);
      c.lineTo(0.72 * w, 0.4 * h);
      c.moveTo(0.28 * w, 0.92 * h);
      c.lineTo(0.72 * w, 0.92 * h);
      c.moveTo(0.5 * w, 0.4 * h);
      c.lineTo(0.5 * w, 0.53 * h);
      c.moveTo(0.5 * w, 0.58 * h);
      c.lineTo(0.5 * w, 0.71 * h);
      c.moveTo(0.5 * w, 0.76 * h);
      c.lineTo(0.5 * w, 0.89 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.325 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
    c.ellipse(0.2 * w, 0.845 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.325 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.845 * h, 0.08 * w, 0.15 * h);
    c.fillAndStroke();
  }
}

// --- Spring Return Switch 3 ---------------------------------------------------------------------

export class ElectricalSpringReturn3 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.62, 1, 0.62);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(0, 0.62 * h);
    c.lineTo(0.21 * w, 0.62 * h);
    c.stroke();

    if (looseEq(switchState, 'off')) {
      c.begin();
      c.moveTo(0.28 * w, 0.57 * h);
      c.lineTo(0.76 * w, 0);
      c.moveTo(w, 0.62 * h);
      c.lineTo(0.625 * w, 0.62 * h);
      c.lineTo(0.695 * w, 0.31 * h);
      c.lineTo(0.765 * w, 0.62 * h);
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(0.28 * w, 0.64 * h);
      c.lineTo(0.76 * w, h);
      c.moveTo(w, 0.62 * h);
      c.lineTo(0.625 * w, 0.62 * h);
      c.lineTo(0.695 * w, 0.93 * h);
      c.lineTo(0.765 * w, 0.62 * h);
      c.fillAndStroke();
    }

    c.ellipse(0.205 * w, 0.5 * h, 0.08 * w, 0.24 * h);
    c.fillAndStroke();
  }
}

// --- Limit Switch -------------------------------------------------------------------------------

export class ElectricalLimitSwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.16, 1, 0.16);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(0, 0.16 * h);
    c.lineTo(0.2 * w, 0.16 * h);
    c.moveTo(0.8 * w, 0.16 * h);
    c.lineTo(w, 0.16 * h);
    c.stroke();

    if (looseEq(switchState, 'off')) {
      c.begin();
      c.moveTo(0.725 * w, 0.75 * h);
      c.lineTo(0.24 * w, 0.16 * h);
      c.lineTo(0.515 * w, h);
      c.lineTo(0.69 * w, 0.72 * h);
      c.fillAndStroke();
    } else {
      c.begin();
      c.moveTo(0.76 * w, 0);
      c.lineTo(0.24 * w, 0.16 * h);
      c.lineTo(0.615 * w, 0.52 * h);
      c.lineTo(0.72 * w, 0.02 * h);
      c.fillAndStroke();
    }

    c.ellipse(0.2 * w, 0.04 * h, 0.08 * w, 0.24 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.04 * h, 0.08 * w, 0.24 * h);
    c.fillAndStroke();
  }
}

// --- DPDT 3 -------------------------------------------------------------------------------------

export class ElectricalDPDT3 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null =
    points(0, 0.23, 0, 0.79, 1, 0.05, 1, 0.39, 1, 0.61, 1, 0.95);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'neutral');

    c.begin();
    c.moveTo(0, 0.23 * h);
    c.lineTo(0.27 * w, 0.23 * h);
    c.moveTo(0, 0.79 * h);
    c.lineTo(0.27 * w, 0.79 * h);
    c.moveTo(0.74 * w, 0.05 * h);
    c.lineTo(w, 0.05 * h);
    c.moveTo(0.74 * w, 0.39 * h);
    c.lineTo(w, 0.39 * h);
    c.moveTo(0.74 * w, 0.61 * h);
    c.lineTo(w, 0.61 * h);
    c.moveTo(0.74 * w, 0.95 * h);
    c.lineTo(w, 0.95 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.37 * w, 0.215 * h);
      c.lineTo(0.69 * w, 0.105 * h);
      c.moveTo(0.37 * w, 0.775 * h);
      c.lineTo(0.69 * w, 0.665 * h);
      c.moveTo(0.515 * w, 0.17 * h);
      c.lineTo(0.515 * w, 0.245 * h);
      c.moveTo(0.515 * w, 0.28 * h);
      c.lineTo(0.515 * w, 0.355 * h);
      c.moveTo(0.515 * w, 0.39 * h);
      c.lineTo(0.515 * w, 0.465 * h);
      c.moveTo(0.515 * w, 0.5 * h);
      c.lineTo(0.515 * w, 0.575 * h);
      c.moveTo(0.515 * w, 0.61 * h);
      c.lineTo(0.515 * w, 0.685 * h);
    } else {
      c.moveTo(0.37 * w, 0.245 * h);
      c.lineTo(0.69 * w, 0.335 * h);
      c.moveTo(0.37 * w, 0.805 * h);
      c.lineTo(0.69 * w, 0.895 * h);
      c.moveTo(0.515 * w, 0.29 * h);
      c.lineTo(0.515 * w, 0.365 * h);
      c.moveTo(0.515 * w, 0.4 * h);
      c.lineTo(0.515 * w, 0.475 * h);
      c.moveTo(0.515 * w, 0.51 * h);
      c.lineTo(0.515 * w, 0.585 * h);
      c.moveTo(0.515 * w, 0.62 * h);
      c.lineTo(0.515 * w, 0.695 * h);
      c.moveTo(0.515 * w, 0.73 * h);
      c.lineTo(0.515 * w, 0.805 * h);
    }

    c.stroke();
    c.ellipse(0.265 * w, 0.18 * h, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
    c.ellipse(0.265 * w, 0.745 * h, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
    c.ellipse(0.635 * w, 0, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
    c.ellipse(0.635 * w, 0.345 * h, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
    c.ellipse(0.635 * w, 0.56 * h, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
    c.ellipse(0.635 * w, 0.905 * h, 0.105 * w, 0.095 * h);
    c.fillAndStroke();
  }
}

// --- Two Position Switch 2 ----------------------------------------------------------------------

export class ElectricalTwoPositionSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.5, 0.5, 0, 0.5, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.8 * w, 0.5 * h);
    c.lineTo(w, 0.5 * h);
    c.moveTo(0.5 * w, 0);
    c.lineTo(0.5 * w, 0.18 * h);
    c.moveTo(0.5 * w, 0.82 * h);
    c.lineTo(0.5 * w, h);
    c.moveTo(0.63 * w, 0.145 * h);
    c.arcTo(0.2 * w, 0.22 * h, 0, 0, 1, 0.835 * w, 0.36 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.24 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 1, 0.5 * w, 0.78 * h);
      c.moveTo(0.76 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 1, 0.5 * w, 0.22 * h);
      c.moveTo(0.39 * w, 0.56 * h);
      c.lineTo(0.55 * w, 0.39 * h);
      c.moveTo(0.39 * w, 0.56 * h);
      c.lineTo(0.55 * w, 0.39 * h);
      c.moveTo(0.61 * w, 0.44 * h);
      c.lineTo(0.45 * w, 0.61 * h);
      c.moveTo(0.61 * w, 0.44 * h);
      c.lineTo(0.45 * w, 0.61 * h);
    } else {
      c.moveTo(0.76 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 0, 0.5 * w, 0.78 * h);
      c.moveTo(0.24 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 0, 0.5 * w, 0.22 * h);
      c.moveTo(0.61 * w, 0.56 * h);
      c.lineTo(0.45 * w, 0.39 * h);
      c.moveTo(0.61 * w, 0.56 * h);
      c.lineTo(0.45 * w, 0.39 * h);
      c.moveTo(0.39 * w, 0.44 * h);
      c.lineTo(0.55 * w, 0.61 * h);
      c.moveTo(0.39 * w, 0.44 * h);
      c.lineTo(0.55 * w, 0.61 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.4575 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.4575 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.46 * w, 0.18 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.46 * w, 0.735 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');
    c.setFillColor(String(strokeColor));
    c.begin();
    c.moveTo(0.633 * w, 0.1 * h);
    c.lineTo(0.633 * w, 0.185 * h);
    c.lineTo(0.56 * w, 0.1425 * h);
    c.close();
    c.moveTo(0.795 * w, 0.355 * h);
    c.lineTo(0.875 * w, 0.355 * h);
    c.lineTo(0.835 * w, 0.435 * h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Three Position Switch 2 --------------------------------------------------------------------

export class ElectricalThreePositionSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0.5, 0, 0, 1, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0.5 * w, 0);
    c.lineTo(0.5 * w, 0.2 * h);
    c.moveTo(0, h);
    c.lineTo(0.215 * w, 0.825 * h);
    c.moveTo(w, h);
    c.lineTo(0.785 * w, 0.825 * h);
    c.moveTo(0.12 * w, 0.62 * h);
    c.arcTo(0.38 * w, 0.38 * h, 0, 0, 1, 0.31 * w, 0.26 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.5 * w, 0.26 * h);
      c.arcTo(0.65 * w, 0.65 * h, 0, 0, 1, 0.25 * w, 0.79 * h);
    } else if (looseEq(switchState, '2')) {
      c.moveTo(0.5 * w, 0.26 * h);
      c.arcTo(0.65 * w, 0.65 * h, 0, 0, 0, 0.75 * w, 0.79 * h);
    } else {
      c.moveTo(0.25 * w, 0.79 * h);
      c.arcTo(0.5 * w, 0.5 * h, 0, 0, 1, 0.75 * w, 0.79 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.74 * h, 0.1 * w, 0.1 * h);
    c.fillAndStroke();
    c.ellipse(0.45 * w, 0.21 * h, 0.1 * w, 0.1 * h);
    c.fillAndStroke();
    c.ellipse(0.7 * w, 0.74 * h, 0.1 * w, 0.1 * h);
    c.fillAndStroke();
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');
    c.setFillColor(String(strokeColor));
    c.begin();
    c.moveTo(0.285 * w, 0.215 * h);
    c.lineTo(0.39 * w, 0.2 * h);
    c.lineTo(0.345 * w, 0.295 * h);
    c.close();
    c.moveTo(0.07 * w, 0.63 * h);
    c.lineTo(0.18 * w, 0.61 * h);
    c.lineTo(0.14 * w, 0.71 * h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Four Position Switch 2 ---------------------------------------------------------------------

export class ElectricalFourPositionSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.5, 0.5, 0, 0.5, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.2 * w, 0.5 * h);
    c.moveTo(0.8 * w, 0.5 * h);
    c.lineTo(w, 0.5 * h);
    c.moveTo(0.5 * w, 0);
    c.lineTo(0.5 * w, 0.18 * h);
    c.moveTo(0.5 * w, 0.82 * h);
    c.lineTo(0.5 * w, h);
    c.moveTo(0.37 * w, 0.145 * h);
    c.arcTo(0.2 * w, 0.22 * h, 0, 0, 0, 0.165 * w, 0.36 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.32 * w, 0.7 * h);
      c.arcTo(0.25 * w, 0.25 * h, 0, 0, 1, 0.68 * w, 0.7 * h);
      c.moveTo(0.32 * w, 0.3 * h);
      c.arcTo(0.25 * w, 0.25 * h, 0, 0, 0, 0.68 * w, 0.3 * h);
      c.moveTo(0.46 * w, 0.37 * h);
      c.lineTo(0.46 * w, 0.63 * h);
      c.moveTo(0.54 * w, 0.37 * h);
      c.lineTo(0.54 * w, 0.63 * h);
      c.moveTo(0.28 * w, 0.5 * h);
      c.lineTo(0.72 * w, 0.5 * h);
    } else if (looseEq(switchState, '2')) {
      c.moveTo(0.24 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 1, 0.5 * w, 0.78 * h);
      c.moveTo(0.76 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 1, 0.5 * w, 0.22 * h);
      c.moveTo(0.39 * w, 0.56 * h);
      c.lineTo(0.55 * w, 0.39 * h);
      c.moveTo(0.39 * w, 0.56 * h);
      c.lineTo(0.55 * w, 0.39 * h);
      c.moveTo(0.61 * w, 0.44 * h);
      c.lineTo(0.45 * w, 0.61 * h);
      c.moveTo(0.61 * w, 0.44 * h);
      c.lineTo(0.45 * w, 0.61 * h);
      c.moveTo(0.32 * w, 0.32 * h);
      c.lineTo(0.68 * w, 0.68 * h);
    } else if (looseEq(switchState, '3')) {
      c.moveTo(0.7 * w, 0.32 * h);
      c.arcTo(0.25 * w, 0.25 * h, 0, 0, 0, 0.7 * w, 0.68 * h);
      c.moveTo(0.3 * w, 0.32 * h);
      c.arcTo(0.25 * w, 0.25 * h, 0, 0, 1, 0.3 * w, 0.68 * h);
      c.moveTo(0.37 * w, 0.46 * h);
      c.lineTo(0.63 * w, 0.46 * h);
      c.moveTo(0.37 * w, 0.54 * h);
      c.lineTo(0.63 * w, 0.54 * h);
      c.moveTo(0.5 * w, 0.26 * h);
      c.lineTo(0.5 * w, 0.74 * h);
    } else {
      c.moveTo(0.76 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 0, 0.5 * w, 0.78 * h);
      c.moveTo(0.24 * w, 0.5 * h);
      c.arcTo(0.27 * w, 0.27 * h, 0, 0, 0, 0.5 * w, 0.22 * h);
      c.moveTo(0.61 * w, 0.56 * h);
      c.lineTo(0.45 * w, 0.39 * h);
      c.moveTo(0.61 * w, 0.56 * h);
      c.lineTo(0.45 * w, 0.39 * h);
      c.moveTo(0.39 * w, 0.44 * h);
      c.lineTo(0.55 * w, 0.61 * h);
      c.moveTo(0.39 * w, 0.44 * h);
      c.lineTo(0.55 * w, 0.61 * h);
      c.moveTo(0.68 * w, 0.32 * h);
      c.lineTo(0.32 * w, 0.68 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.4575 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.4575 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.46 * w, 0.18 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    c.ellipse(0.46 * w, 0.735 * h, 0.08 * w, 0.085 * h);
    c.fillAndStroke();
    const strokeColor = getValue(this.style, 'strokeColor', '#000000');
    c.setFillColor(String(strokeColor));
    c.begin();
    c.moveTo(0.367 * w, 0.1 * h);
    c.lineTo(0.367 * w, 0.185 * h);
    c.lineTo(0.44 * w, 0.1425 * h);
    c.close();
    c.moveTo(0.205 * w, 0.355 * h);
    c.lineTo(0.125 * w, 0.355 * h);
    c.lineTo(0.165 * w, 0.435 * h);
    c.close();
    c.fillAndStroke();
  }
}

// --- Pushbutton Make Switch 2 -------------------------------------------------------------------

export class ElectricalPushbuttonMakeSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.94, 1, 0.94);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0, 0.94 * h);
    c.lineTo(0.2 * w, 0.94 * h);
    c.moveTo(0.8 * w, 0.94 * h);
    c.lineTo(w, 0.94 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.5 * w, 0);
      c.lineTo(0.5 * w, 0.8 * h);
      c.moveTo(0.24 * w, 0.8 * h);
      c.lineTo(0.76 * w, 0.8 * h);
    } else {
      c.moveTo(0.5 * w, 0.07 * h);
      c.lineTo(0.5 * w, 0.87 * h);
      c.moveTo(0.24 * w, 0.87 * h);
      c.lineTo(0.76 * w, 0.87 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.88 * h, 0.08 * w, 0.12 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.88 * h, 0.08 * w, 0.12 * h);
    c.fillAndStroke();
  }
}

// --- Pushbutton Two-Circuit Switch 2 ------------------------------------------------------------

export class ElectricalPushbuttonTwoCircuitSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.68, 1, 0.68, 0, 0.96, 1, 0.96);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0, 0.68 * h);
    c.lineTo(0.2 * w, 0.68 * h);
    c.moveTo(0.8 * w, 0.68 * h);
    c.lineTo(w, 0.68 * h);
    c.moveTo(0, 0.96 * h);
    c.lineTo(0.2 * w, 0.96 * h);
    c.moveTo(0.8 * w, 0.96 * h);
    c.lineTo(w, 0.96 * h);

    if (looseEq(switchState, '1')) {
      c.moveTo(0.5 * w, 0);
      c.lineTo(0.5 * w, 0.73 * h);
      c.moveTo(0.24 * w, 0.73 * h);
      c.lineTo(0.76 * w, 0.73 * h);
    } else {
      c.moveTo(0.5 * w, 0.18 * h);
      c.lineTo(0.5 * w, 0.91 * h);
      c.moveTo(0.24 * w, 0.91 * h);
      c.lineTo(0.76 * w, 0.91 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.92 * h, 0.08 * w, 0.08 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.92 * h, 0.08 * w, 0.08 * h);
    c.fillAndStroke();
    c.ellipse(0.2 * w, 0.64 * h, 0.08 * w, 0.08 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.64 * h, 0.08 * w, 0.08 * h);
    c.fillAndStroke();
  }
}

// --- Time Delay Switch --------------------------------------------------------------------------

export class ElectricalTimeDelaySwitch extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.13, 1, 0.13);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'off');

    c.begin();
    c.moveTo(0, 0.13 * h);
    c.lineTo(0.2 * w, 0.13 * h);
    c.moveTo(0.8 * w, 0.13 * h);
    c.lineTo(w, 0.13 * h);

    if (looseEq(switchState, 'off')) {
      c.moveTo(0.5 * w, 0.37 * h);
      c.lineTo(0.5 * w, 0.83 * h);
      c.moveTo(0.28 * w, 0.16 * h);
      c.lineTo(0.76 * w, 0.62 * h);
      c.moveTo(0.44 * w, h);
      c.lineTo(0.5 * w, 0.83 * h);
      c.lineTo(0.56 * w, h);
    } else {
      c.moveTo(0.5 * w, 0.04 * h);
      c.lineTo(0.5 * w, 0.5 * h);
      c.moveTo(0.28 * w, 0.09 * h);
      c.lineTo(0.76 * w, 0);
      c.moveTo(0.44 * w, 0.67 * h);
      c.lineTo(0.5 * w, 0.5 * h);
      c.lineTo(0.56 * w, 0.67 * h);
    }

    c.stroke();
    c.ellipse(0.2 * w, 0.03 * h, 0.08 * w, 0.19 * h);
    c.fillAndStroke();
    c.ellipse(0.72 * w, 0.03 * h, 0.08 * w, 0.19 * h);
    c.fillAndStroke();
  }
}

// --- Time Delay Switch 2 ------------------------------------------------------------------------

export class ElectricalTimeDelaySwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.45, 1, 0.45);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'off');

    c.begin();
    c.moveTo(0, 0.45 * h);
    c.lineTo(0.23 * w, 0.45 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.75 * w, 0);
      c.moveTo(w, 0.45 * h);
      c.lineTo(0.8 * w, 0.45 * h);
      c.moveTo(0.465 * w, 0.25 * h);
      c.lineTo(0.465 * w, 0.76 * h);
      c.moveTo(0.535 * w, 0.19 * h);
      c.lineTo(0.535 * w, 0.76 * h);
      c.moveTo(0.4 * w, 0.89 * h);
      c.arcTo(0.11 * w, 0.25 * h, 0, 0, 1, 0.6 * w, 0.89 * h);
    } else {
      c.lineTo(0.73 * w, 0.25 * h);
      c.moveTo(w, 0.45 * h);
      c.lineTo(0.67 * w, 0.45 * h);
      c.lineTo(0.67 * w, 0.16 * h);
      c.moveTo(0.465 * w, 0.36 * h);
      c.lineTo(0.465 * w, 0.87 * h);
      c.moveTo(0.535 * w, 0.33 * h);
      c.lineTo(0.535 * w, 0.87 * h);
      c.moveTo(0.4 * w, h);
      c.arcTo(0.11 * w, 0.25 * h, 0, 0, 1, 0.6 * w, h);
    }

    c.stroke();
  }
}

// --- Isolator Switch 2 --------------------------------------------------------------------------

export class ElectricalIsolatorSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.8, 1, 0.8);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'off');

    c.begin();
    c.moveTo(w, 0.8 * h);
    c.lineTo(0.8 * w, 0.8 * h);
    c.moveTo(0.8 * w, 0.6 * h);
    c.lineTo(0.8 * w, h);
    c.moveTo(0, 0.8 * h);
    c.lineTo(0.23 * w, 0.8 * h);

    if (looseEq(switchState, 'off')) {
      c.lineTo(0.75 * w, 0);
    } else {
      c.lineTo(0.8 * w, 0.8 * h);
    }

    c.stroke();
  }
}

// --- Changeover Contact Switch 2 ----------------------------------------------------------------

export class ElectricalChangeoverContactSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 1, 1, 0, 1, 1);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', '1');

    c.begin();
    c.moveTo(0, h);
    c.lineTo(0.25 * w, h);

    if (looseEq(switchState, '1')) {
      c.lineTo(0.76 * w, 0.2 * h);
      c.moveTo(w, 0);
      c.lineTo(0.67 * w, 0);
      c.lineTo(0.67 * w, 0.5 * h);
      c.moveTo(w, h);
      c.lineTo(0.8 * w, h);
    } else {
      c.lineTo(0.77 * w, 0.6 * h);
      c.moveTo(w, h);
      c.lineTo(0.67 * w, h);
      c.lineTo(0.67 * w, 0.5 * h);
      c.moveTo(w, 0);
      c.lineTo(0.8 * w, 0);
    }

    c.stroke();
  }
}

// --- Reed Switch 2 ------------------------------------------------------------------------------

export class ElectricalReedSwitch2 extends Shape {
  override constraints: readonly ConnectionConstraint[] | null = points(0, 0.5, 1, 0.5);

  override paintVertexShape(c: SvgCanvas, x: number, y: number, w: number, h: number): void {
    c.translate(x, y);
    const switchState = getValue(this.style, 'elSwitchState', 'off');

    c.begin();
    c.moveTo(0.69 * w, 0);
    c.arcTo(0.13 * w, 0.5 * h, 0, 0, 1, 0.82 * w, 0.5 * h);
    c.arcTo(0.13 * w, 0.5 * h, 0, 0, 1, 0.69 * w, h);
    c.lineTo(0.31 * w, h);
    c.arcTo(0.13 * w, 0.5 * h, 0, 0, 1, 0.18 * w, 0.5 * h);
    c.arcTo(0.13 * w, 0.5 * h, 0, 0, 1, 0.31 * w, 0);
    c.close();
    c.fillAndStroke();

    c.begin();
    c.moveTo(w, 0.5 * h);
    c.lineTo(0.65 * w, 0.5 * h);
    c.moveTo(0, 0.5 * h);
    c.lineTo(0.35 * w, 0.5 * h);

    if (looseEq(switchState, 'on')) {
      c.lineTo(0.65 * w, 0.5 * h);
    } else {
      c.lineTo(0.65 * w, 0.25 * h);
    }

    c.stroke();
  }
}

// --- Registration -------------------------------------------------------------------------------

/** The electro-mechanical switches of mxElectrical.js, in the order the file registers them. */
export const ELECTRICAL_SWITCH_SHAPES: Array<[string, ShapeClass]> = [
  ['mxgraph.electrical.electro-mechanical.twoWaySwitch', ElectricalTwoWaySwitch],
  ['mxgraph.electrical.electro-mechanical.pushbutton', ElectricalPushbutton],
  ['mxgraph.electrical.electro-mechanical.singleSwitch', ElectricalSingleSwitch],
  ['mxgraph.electrical.electro-mechanical.switchDisconnector', ElectricalSwitchDisconnector],
  ['mxgraph.electrical.electro-mechanical.fuse2', ElectricalFuse2],
  ['mxgraph.electrical.electro-mechanical.liquidLevelActuatedSwitch', ElectricalLiquidLevelActuatedSwitch],
  ['mxgraph.electrical.electro-mechanical.liquidLevelActuatedSwitch2', ElectricalLiquidLevelActuatedSwitch2],
  ['mxgraph.electrical.electro-mechanical.gasFlowActuatedSwitch', ElectricalGasFlowActuatedSwitch],
  ['mxgraph.electrical.electro-mechanical.flowActuatedSwitch', ElectricalFlowActuatedSwitch],
  ['mxgraph.electrical.electro-mechanical.pressureActuatedSwitch', ElectricalPressureActuatedSwitch],
  ['mxgraph.electrical.electro-mechanical.temperatureActuatedSwitch', ElectricalTemperatureActuatedSwitch],
  ['mxgraph.electrical.electro-mechanical.safetyInterlockSwitch', ElectricalSafetyInterlockSwitch],
  ['mxgraph.electrical.electro-mechanical.temperatureSwitch', ElectricalTemperatureSwitch],
  ['mxgraph.electrical.electro-mechanical.thermostat2', ElectricalThermostat2],
  ['mxgraph.electrical.electro-mechanical.limitSwitch2', ElectricalLimitSwitch2],
  ['mxgraph.electrical.electro-mechanical.circuitBreaker2', ElectricalCircuitBreaker2],
  ['mxgraph.electrical.electro-mechanical.selectorSwitch3Position2', ElectricalSelectorSwitch3Position2],
  ['mxgraph.electrical.electro-mechanical.selectorSwitch4Position2', ElectricalSelectorSwitch4Position2],
  ['mxgraph.electrical.electro-mechanical.selectorSwitch6Position2', ElectricalSelectorSwitch6Position2],
  ['mxgraph.electrical.electro-mechanical.shortingSelectorSwitch2', ElectricalShortingSelectorSwitch2],
  ['mxgraph.electrical.electro-mechanical.proximityLimitSwitch2', ElectricalProximityLimitSwitch2],
  ['mxgraph.electrical.electro-mechanical.inertiaSwitch2', ElectricalInertiaSwitch2],
  ['mxgraph.electrical.electro-mechanical.pushbuttonBreak2', ElectricalPushbuttonBreak2],
  ['mxgraph.electrical.electro-mechanical.manualSwitch2', ElectricalManualSwitch2],
  ['mxgraph.electrical.electro-mechanical.twoWayContact2', ElectricalTwoWayContact2],
  ['mxgraph.electrical.electro-mechanical.passingMakeContact2', ElectricalPassingMakeContact2],
  ['mxgraph.electrical.electro-mechanical.dpst2', ElectricalDPST2],
  ['mxgraph.electrical.electro-mechanical.springReturn3', ElectricalSpringReturn3],
  ['mxgraph.electrical.electro-mechanical.limitSwitch', ElectricalLimitSwitch],
  ['mxgraph.electrical.electro-mechanical.dpdt3', ElectricalDPDT3],
  ['mxgraph.electrical.electro-mechanical.twoPositionSwitch2', ElectricalTwoPositionSwitch2],
  ['mxgraph.electrical.electro-mechanical.threePositionSwitch2', ElectricalThreePositionSwitch2],
  ['mxgraph.electrical.electro-mechanical.fourPositionSwitch2', ElectricalFourPositionSwitch2],
  ['mxgraph.electrical.electro-mechanical.pushbuttonMakeSwitch2', ElectricalPushbuttonMakeSwitch2],
  ['mxgraph.electrical.electro-mechanical.pushbuttonTwoCircuitSwitch2', ElectricalPushbuttonTwoCircuitSwitch2],
  ['mxgraph.electrical.electro-mechanical.timeDelaySwitch', ElectricalTimeDelaySwitch],
  ['mxgraph.electrical.electro-mechanical.timeDelaySwitch2', ElectricalTimeDelaySwitch2],
  ['mxgraph.electrical.electro-mechanical.isolatorSwitch2', ElectricalIsolatorSwitch2],
  ['mxgraph.electrical.electro-mechanical.changeoverContactSwitch2', ElectricalChangeoverContactSwitch2],
  ['mxgraph.electrical.electro-mechanical.reedSwitch2', ElectricalReedSwitch2],
];
