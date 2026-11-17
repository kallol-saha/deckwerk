/**
 * Approximate text metrics for plain (non-HTML) labels, which draw.io sizes
 * with the browser (SVGGraphicsElement.getBBox) when it paints a label
 * background or border. Without a DOM the widths come from Helvetica's
 * advance widths (Adobe AFM, 1/1000 em; Arial matches them), which is what
 * draw.io's default fonts resolve to. Other families use the same table,
 * so their backgrounds are approximate.
 */

/** Helvetica advance widths for U+0020..U+007E. */
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Helvetica-Bold advance widths for U+0020..U+007E. */
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Arial's ascent and descent (hhea, units of the em). */
export const FONT_ASCENT = 0.905;
export const FONT_DESCENT = 0.212;

function isWide(code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1f300 && code <= 0x1faff)
    || (code >= 0x20000 && code <= 0x3fffd);
}

/** Width of one line of text in px at `size`, without kerning. */
export function textWidth(line: string, size: number, bold: boolean): number {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code <= 0x7e) units += table[code - 0x20];
    else if (code === 0xa0) units += 278;
    else if (code < 0x20 || (code >= 0x200b && code <= 0x200f) || code === 0xad) units += 0;
    else if (isWide(code)) units += 1000;
    else units += bold ? 611 : 556;
  }
  return units * size / 1000;
}
