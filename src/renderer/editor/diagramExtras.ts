/**
 * Diagram features that plug into both editor shells (the desktop editor and
 * the browser collab client) from their own modules: figure export, math
 * typesetting, tables, find/replace. `bindEditorKeys` (shellWiring.ts) calls
 * `installDiagramExtras` once; each feature's installer registers its panel
 * sections, keys and commands, so the shells need only that one line.
 */

import type { EditorCanvas } from './canvas.js';
import { installDiagramFind } from './diagramFind.js';
import { installDiagramLayout } from './diagramLayoutMenu.js';
import { installDiagramMath } from './diagramMath.js';
import { installDiagramTables } from './diagramTable.js';
import type { EditorStore } from './store.js';

/** What a diagram feature gets to install itself with. */
export interface DiagramExtrasDeps {
  store: EditorStore;
  canvas: EditorCanvas;
  setStatusMessage: (text: string) => void;
}

let installed = false;

export function installDiagramExtras(deps: DiagramExtrasDeps): void {
  if (installed) return;
  installed = true;
  // One line per feature: installX(deps);
  void deps;
  installDiagramFind(deps);
  installDiagramTables(deps);
  installDiagramMath(deps);
  installDiagramLayout(deps);
}
