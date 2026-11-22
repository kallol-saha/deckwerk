/**
 * The browser half of figure export (figureExport.ts): measuring what a
 * figure's labels cover, and rasterising it to PNG. Both run in a page —
 * the editor, the collab client, and the CLI's Electron helper
 * (scripts/figure-export.cjs, which receives these functions' source via
 * `figureRenderScript`). So each function is self-contained: no imports,
 * no closures over module state.
 */

/** A rectangle in the SVG's user units (slide pixels). */
export interface MeasuredRect { x: number; y: number; width: number; height: number }

/**
 * What the drawing in `svgText` covers, in its viewBox units: shapes and
 * lines by their boxes, HTML labels by the text box inside each
 * foreignObject (the foreignObject itself is 20000 px wide), as draw.io's
 * view bounds include each label's bounding box. `ignore` lists boxes to
 * leave out (none by default). Returns null when nothing is drawn.
 */
export async function measureFigure(svgText: string): Promise<MeasuredRect | null> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout;';
  host.innerHTML = svgText.replace(/^<\?xml[^>]*\?>\s*/, '');
  document.body.appendChild(host);
  try {
    const svg = host.querySelector('svg');
    if (!svg) return null;
    const vb = svg.viewBox.baseVal;
    svg.setAttribute('width', String(vb.width));
    svg.setAttribute('height', String(vb.height));
    try {
      await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    } catch { /* fonts are best effort */ }
    const origin = svg.getBoundingClientRect();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (r: DOMRect) => {
      if (!(r.width > 0 || r.height > 0)) return;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    };
    const shapes = svg.querySelectorAll('path, rect, ellipse, circle, line, polyline, polygon, image, use, text');
    for (const node of Array.from(shapes)) {
      if (node.closest('defs, clipPath, mask, pattern, marker, switch > text')) continue;
      if (node.closest('foreignObject')) continue;
      add(node.getBoundingClientRect());
    }
    // The label text: the block inside flex > item > block.
    for (const fo of Array.from(svg.querySelectorAll('foreignObject'))) {
      for (const block of Array.from(fo.querySelectorAll(':scope > div > div > div'))) {
        add(block.getBoundingClientRect());
      }
    }
    if (!Number.isFinite(x0)) return null;
    const k = vb.width / (origin.width || vb.width);
    return {
      x: vb.x + (x0 - origin.left) * k,
      y: vb.y + (y0 - origin.top) * k,
      width: (x1 - x0) * k,
      height: (y1 - y0) * k,
    };
  } finally {
    host.remove();
  }
}

/**
 * The SVG as a PNG (bytes, base64), `width` × `height` px, over
 * `background` (null: transparent). Drawn from a data: URI, which keeps
 * the canvas exportable with foreignObject labels (a blob: URI would taint
 * it); the SVG must embed the fonts it needs that are not installed.
 */
export async function rasterizeFigure(svgText: string, width: number, height: number, background: string | null): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  // Fonts embedded in an SVG image can arrive after its load event: draw,
  // let them settle, and draw again.
  draw();
  await new Promise((resolve) => setTimeout(resolve, 150));
  draw();
  const url = canvas.toDataURL('image/png');
  return url.slice(url.indexOf(',') + 1);
}

/** Both functions as a script for a page that cannot import them (the CLI's Electron helper). */
export function figureRenderScript(): string {
  return `window.measureFigure = ${measureFigure.toString()};\nwindow.rasterizeFigure = ${rasterizeFigure.toString()};\n`;
}
