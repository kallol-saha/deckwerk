import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { FIGURE_IPC, type FigureSaveRequest } from '@shared/diagram/figureIpc.js';
import { showSaveDialog } from './dialogs.js';

/**
 * Figure export's desktop channels (src/renderer/editor/diagramExport.ts):
 * saving the bytes the editor made where the author picks, and printing a
 * figure page to PDF in a hidden window — Chromium's PDF keeps the labels'
 * foreignObject text as text, as draw.io desktop's PDF export does.
 */
export function registerFigureExportIpc(): void {
  ipcMain.handle(FIGURE_IPC.save, async (_event, request: FigureSaveRequest): Promise<string | null> => {
    const target = await showSaveDialog({
      title: request.title ?? 'Export Diagram',
      buttonLabel: 'Export',
      defaultPath: request.name,
      filters: [{ name: request.format.toUpperCase(), extensions: [request.format] }],
    });
    if (target.canceled || !target.filePath) return null;
    await writeFile(target.filePath, request.data instanceof Uint8Array ? request.data : Buffer.from(request.data, 'utf8'));
    return target.filePath;
  });

  ipcMain.handle(FIGURE_IPC.pdf, async (_event, html: string): Promise<Uint8Array> => printFigurePdf(html));
}

/** The page printed to PDF, its size taken from its own @page rule. */
export async function printFigurePdf(html: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'deckwerk-figure-'));
  const page = join(dir, 'figure.html');
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  try {
    await writeFile(page, html, 'utf8');
    await win.loadFile(page);
    await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true').catch(() => true);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    await rm(dir, { recursive: true, force: true });
  }
}
