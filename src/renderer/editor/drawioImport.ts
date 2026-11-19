import { drawioToSlides } from '@shared/diagram/apply.js';
import { readDiagramFile } from '@shared/diagram/figureExport.js';
import { inflateDiagramChunk } from '@shared/diagram/figureInflate.js';
import { makeId } from '@shared/geometry.js';
import type { EditorStore } from './store.js';

/**
 * Import → draw.io Diagram…: each page of a `.drawio` file (or draw.io's
 * editable `.svg` or `.png`, or a bare mxGraphModel `.xml`) becomes a new slide after
 * the current one, drawn with native diagram shapes and connectors that
 * keep the file's draw.io styles. Works the same in the desktop app and the
 * browser editor, since the file is read in the page.
 */
export async function importDrawioDiagram(store: EditorStore, setStatus: (text: string) => void): Promise<void> {
  const file = await pickFile('.drawio,.xml,.svg,.dio,.png');
  if (!file) return;
  setStatus(`Reading ${file.name}`);
  let slides;
  try {
    const doc = await readDiagramFile(new Uint8Array(await file.arrayBuffer()), inflateDiagramChunk);
    slides = drawioToSlides(doc, store.get().deck.canvas, makeId);
  } catch (error) {
    setStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (slides.length === 0) {
    setStatus(`${file.name} has no diagram pages`);
    return;
  }
  const at = store.get().slideIndex + 1;
  store.commit((deck) => {
    deck.slides.splice(at, 0, ...slides);
  }, { label: slides.length === 1 ? 'Import draw.io diagram' : `Import ${slides.length} draw.io pages` });
  store.selectSlide(at);
  setStatus(`Imported ${slides.length === 1 ? `“${slides[0].name}”` : `${slides.length} pages`} from ${file.name}`);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}
