/** Figure export's desktop channels (src/main/figureExport.ts). */
export const FIGURE_IPC = {
  /** Save bytes the editor made where the author picks; the path, or null when cancelled. */
  save: 'figure:save',
  /** Print a figure page (figureExport.ts figurePrintPage) to PDF; the bytes. */
  pdf: 'figure:pdf',
} as const;

export interface FigureSaveRequest {
  /** Suggested file name. */
  name: string;
  format: 'svg' | 'png' | 'pdf';
  /** The file: text for SVG, bytes otherwise. */
  data: Uint8Array | string;
  title?: string;
}
