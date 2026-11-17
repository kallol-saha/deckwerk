/**
 * Geometry and style types shared by every part of the diagram engine
 * (src/shared/diagram). Everything here is DOM-free so the player, the
 * editor, the CLI and the collab server can all use it.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A resolved draw.io style: every key of the cell's style string after named
 * styles and defaults were merged in and `key=none` removed the key. Values
 * stay strings, as written; read them through the accessors in style.ts,
 * which apply draw.io's defaults.
 */
export type Style = Record<string, string>;

export function point(x: number, y: number): Point {
  return { x, y };
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
