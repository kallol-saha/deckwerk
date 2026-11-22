/**
 * Export Diagram as… (draw.io's File ▸ Export as SVG / PNG / PDF): the
 * current slide's diagram, or the selected cells, as a figure for a paper.
 * The figure is built by src/shared/diagram/figureExport.ts and measured
 * and rasterised here, in the page (figureRender.ts). Saving: the desktop
 * app asks where through its save panel and prints PDFs in a hidden
 * window; the browser client downloads SVG and PNG and opens PDFs in a
 * print tab ("Save as PDF"), as its deck PDF export does.
 */

import type { Slide, SlideElement } from '@shared/deck.js';
import { diagramContentBounds } from '@shared/diagram/figure.js';
import {
  embedFontFaces, figureCells, figureDrawioXml, figureFontFamilies, figurePrintPage, figureSvg,
  figureUsesMath, figureViewBox, katexCssFor, measuringBounds, pngWithDiagram, type FigureFormat,
} from '@shared/diagram/figureExport.js';
import type { FigureSaveRequest } from '@shared/diagram/figureIpc.js';
import { measureFigure, rasterizeFigure } from '@shared/diagram/figureRender.js';
import type { Rect } from '@shared/diagram/types.js';
import type { EditorStore } from './store.js';

export interface FigureChoice {
  format: FigureFormat;
  /** Only the selected cells (and what is inside them). */
  selectionOnly: boolean;
  /** PNG: pixels per slide pixel (1 = 96 dpi); SVG and PDF are drawn at this size too. */
  scale: number;
  border: number;
  transparent: boolean;
  /** Carry the .drawio inside (SVG content, PNG chunk). */
  embedDiagram: boolean;
}

export interface FigureFile {
  name: string;
  format: FigureFormat;
  data: Uint8Array | string;
  /** The figure's size in px. */
  width: number;
  height: number;
  /** For PDF: the page to print. */
  printPage?: string;
}

interface DesktopFigureApi {
  saveFigure?: (request: FigureSaveRequest) => Promise<string | null>;
  printFigurePdf?: (html: string) => Promise<Uint8Array>;
}

function desktopApi(): DesktopFigureApi {
  return ((window as unknown as { api?: DesktopFigureApi }).api ?? {});
}

/** The CSS @font-face rules this page has, for the families the figure uses, with fonts inlined. */
async function pageFontCss(families: ReadonlySet<string>): Promise<string> {
  let css = '';
  const bases: Array<{ text: string; base: string }> = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) bases.push({ text: rule.cssText, base: sheet.href ?? document.baseURI });
    }
  }
  for (const { text, base } of bases) {
    css += `${await embedFontFaces(text, families, async (url) => {
      try {
        const response = await fetch(new URL(url, base).href);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })}\n`;
  }
  return css.trim();
}

/** Union of two rectangles. */
function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Builds the figure file for `slide` (no saving). */
export async function buildFigure(slide: Slide, choice: FigureChoice, selected: readonly string[] = []): Promise<FigureFile> {
  const cells = figureCells(slide, choice.selectionOnly ? selected : undefined);
  if (cells.length === 0) throw new Error(choice.selectionOnly ? 'Select diagram shapes or connectors to export.' : 'This slide has no diagram.');
  const drawio = choice.embedDiagram ? await figureDrawioXml(slide, cells) : null;
  // Fonts: KaTeX's for typeset math, and the page's own @font-face for the label families.
  const probe = figureSvg(slide, cells, { bounds: measuringBounds(cells), border: 0 });
  let css = await pageFontCss(figureFontFamilies(probe));
  if (figureUsesMath(slide, cells)) {
    const { KATEX_CSS } = await import('@shared/katexInline.js');
    css = `${katexCssFor(probe, KATEX_CSS)}\n${css}`;
  }
  // What labels cover is only known once the browser lays them out.
  const measured = await measureFigure(figureSvg(slide, cells, { bounds: measuringBounds(cells), border: 0, css }));
  const bounds = union(measured, diagramContentBounds(cells as SlideElement[])) ?? { x: 0, y: 0, width: 1, height: 1 };
  const scale = choice.scale > 0 ? choice.scale : 1;
  const background = choice.transparent && choice.format !== 'pdf' ? null : '#ffffff';
  const vb = figureViewBox(bounds, choice.border);
  const width = vb.width * scale;
  const height = vb.height * scale;
  const svg = figureSvg(slide, cells, { bounds, border: choice.border, scale, background, css, drawio });
  const name = `${(slide.name || 'diagram').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagram'}.${choice.format}`;
  if (choice.format === 'svg') return { name, format: 'svg', data: svg, width, height };
  if (choice.format === 'png') {
    const base64 = await rasterizeFigure(svg, width, height, background);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return { name, format: 'png', data: pngWithDiagram(bytes, drawio, Math.round(96 * scale)), width, height };
  }
  const page = figurePrintPage(svg, width, height, name);
  return { name, format: 'pdf', data: new Uint8Array(0), width, height, printPage: page };
}

/** Builds and saves (desktop) or downloads (browser) the figure. Returns where it went, or null. */
export async function exportFigure(slide: Slide, choice: FigureChoice, selected: readonly string[] = []): Promise<string | null> {
  const file = await buildFigure(slide, choice, selected);
  const api = desktopApi();
  if (file.format === 'pdf') {
    if (api.printFigurePdf && api.saveFigure) {
      const pdf = await api.printFigurePdf(file.printPage!);
      return api.saveFigure({ name: file.name, format: 'pdf', data: pdf, title: 'Export Diagram as PDF' });
    }
    // The browser's print dialog: Save as PDF.
    const tab = window.open('', '_blank');
    if (!tab) throw new Error('PDF export needs a new tab: allow pop-ups for this site and try again.');
    tab.document.open();
    tab.document.write(file.printPage!.replace('</body>', '<script>addEventListener("load",()=>setTimeout(()=>print(),200))</script></body>'));
    tab.document.close();
    return 'a print tab';
  }
  if (api.saveFigure) {
    return api.saveFigure({ name: file.name, format: file.format, data: file.data, title: `Export Diagram as ${file.format.toUpperCase()}` });
  }
  const blob = new Blob([file.data as BlobPart], { type: file.format === 'svg' ? 'image/svg+xml' : 'image/png' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return file.name;
}

// --- the dialog ------------------------------------------------------------------------

/** draw.io's export dialog, cut down to what a figure needs. */
export function showFigureExportDialog(hasSelection: boolean): Promise<FigureChoice | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'workflow-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'workflow-dialog figure-export-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'figure-export-title');
    dialog.dataset.figureExport = 'dialog';
    const title = document.createElement('h2');
    title.id = 'figure-export-title';
    title.textContent = 'Export Diagram';

    const field = (label: string, control: HTMLElement): HTMLElement => {
      const row = document.createElement('label');
      row.className = 'field';
      const name = document.createElement('span');
      name.textContent = label;
      row.append(name, control);
      return row;
    };
    const check = (label: string, checked: boolean, data: string): [HTMLElement, HTMLInputElement] => {
      const row = document.createElement('label');
      row.className = 'field-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      box.dataset.figureExport = data;
      const text = document.createElement('span');
      text.textContent = label;
      row.append(box, text);
      return [row, box];
    };
    const format = document.createElement('select');
    format.dataset.figureExport = 'format';
    for (const [value, label] of [['svg', 'SVG (vector)'], ['png', 'PNG (image)'], ['pdf', 'PDF (vector)']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      format.appendChild(option);
    }
    const scale = document.createElement('select');
    scale.dataset.figureExport = 'scale';
    for (const [value, label] of [['1', '100% (96 dpi)'], ['2', '200% (192 dpi)'], ['3', '300% (288 dpi)'], ['3.125', '300 dpi'], ['4', '400% (384 dpi)'], ['6.25', '600 dpi']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      scale.appendChild(option);
    }
    scale.value = '2';
    const border = document.createElement('input');
    border.type = 'number';
    border.min = '0';
    border.max = '200';
    border.value = '10';
    border.dataset.figureExport = 'border';
    const [selectionRow, selection] = check('Selection only', hasSelection, 'selection');
    selection.disabled = !hasSelection;
    const [transparentRow, transparent] = check('Transparent background', true, 'transparent');
    const [embedRow, embed] = check('Include a copy of my diagram (reopens as a diagram)', true, 'embed');
    const scaleRow = field('Size', scale);
    const sync = () => {
      scaleRow.hidden = format.value !== 'png';
      transparentRow.hidden = format.value === 'pdf';
      embedRow.hidden = format.value === 'pdf';
    };
    format.addEventListener('change', sync);
    sync();

    const actions = document.createElement('div');
    actions.className = 'workflow-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'primary';
    submit.textContent = 'Export';
    submit.dataset.figureExport = 'submit';
    actions.append(cancel, submit);

    let finished = false;
    const finish = (choice: FigureChoice | null) => {
      if (finished) return;
      finished = true;
      overlay.remove();
      resolve(choice);
    };
    cancel.addEventListener('click', () => finish(null));
    submit.addEventListener('click', () => finish({
      format: format.value as FigureFormat,
      selectionOnly: selection.checked && hasSelection,
      scale: format.value === 'png' ? Number(scale.value) : 1,
      border: Math.max(0, Number(border.value) || 0),
      transparent: transparent.checked,
      embedDiagram: embed.checked && format.value !== 'pdf',
    }));
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
    });
    dialog.append(title, field('Format', format), scaleRow, field('Border width (px)', border), selectionRow, transparentRow, embedRow, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    format.focus();
  });
}

/** The command: ask, build, save. */
export async function exportDiagramFigure(store: EditorStore, setStatus: (text: string) => void): Promise<void> {
  const { deck, slideIndex, selection } = store.get();
  const slide = deck.slides[slideIndex];
  if (!slide || !slide.elements.some((el) => el.type === 'vertex' || el.type === 'connector')) {
    setStatus('This slide has no diagram to export.');
    return;
  }
  const selected = slide.elements.filter((el) => selection.has(el.id) && (el.type === 'vertex' || el.type === 'connector')).map((el) => el.id);
  const choice = await showFigureExportDialog(selected.length > 0);
  if (!choice) return;
  try {
    setStatus(`Exporting the diagram as ${choice.format.toUpperCase()}…`);
    const where = await exportFigure(slide, choice, selected);
    setStatus(where ? `Diagram exported to ${where}` : 'Export cancelled.');
  } catch (error) {
    setStatus(`Diagram export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
