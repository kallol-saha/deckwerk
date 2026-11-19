/*
 * The table commands of draw.io's Arrange tab (jgraph/drawio 32.7.4,
 * Copyright (c) 2006-2024, JGraph Ltd and draw.io AG, Apache License 2.0:
 * js/grapheditor/Format.js ArrangePanel.addTable). Modified for DeckWerk:
 * each command is one undoable store edit; the table logic lives in
 * shared/diagram/table.ts.
 */

import { isDiagramElement, type DiagramEl, type Slide } from '@shared/deck.js';
import { makeId } from '@shared/geometry.js';
import { DiagramTree } from '@shared/diagram/structure.js';
import {
  deleteTableColumn, deleteTableRow, insertTableColumn, insertTableRow, isTableCellEl, isTableEl, isTableRowEl, tableOf,
  type TableEdit,
} from '@shared/diagram/table.js';
import type { DiagramExtrasDeps } from './diagramExtras.js';
import { formatControls, registerDiagramPanelSection } from './diagramFormat.js';
import type { EditorStore } from './store.js';

type Command = (slide: Slide, cellId: string) => TableEdit;

const COMMANDS: Array<{ key: string; label: string; run: Command; column: boolean }> = [
  { key: 'insertColumnBefore', label: 'Insert Column Before', column: true, run: (s, id) => insertTableColumn(s, id, true, makeId) },
  { key: 'insertColumnAfter', label: 'Insert Column After', column: true, run: (s, id) => insertTableColumn(s, id, false, makeId) },
  { key: 'deleteColumn', label: 'Delete Column', column: true, run: (s, id) => deleteTableColumn(s, id) },
  { key: 'insertRowBefore', label: 'Insert Row Before', column: false, run: (s, id) => insertTableRow(s, id, true, makeId) },
  { key: 'insertRowAfter', label: 'Insert Row After', column: false, run: (s, id) => insertTableRow(s, id, false, makeId) },
  { key: 'deleteRow', label: 'Delete Row', column: false, run: (s, id) => deleteTableRow(s, id) },
];

/**
 * The cell a command acts on (ArrangePanel.addTable): the one selected
 * table, row or cell; with several selected, their table.
 */
function commandCell(slide: Slide, cells: readonly DiagramEl[]): string | null {
  const tree = new DiagramTree(slide);
  const live = cells.map((c) => tree.byId.get(c.id)).filter((c): c is DiagramEl => c != null && isDiagramElement(c));
  const tableish = live.filter((c) => isTableEl(c) || isTableRowEl(tree, c) || isTableCellEl(tree, c));
  if (tableish.length === 0) return null;
  if (live.length === 1) return tableish[0].id;
  return tableOf(tree, tableish[0])?.id ?? null;
}

/** Runs a table command on the selection as one undoable edit; returns whether it did anything. */
export function runTableCommand(store: EditorStore, key: string): boolean {
  const command = COMMANDS.find((c) => c.key === key);
  const { deck, slideIndex, selection } = store.get();
  const slide = deck.slides[slideIndex];
  if (!command || !slide) return false;
  const cells = slide.elements.filter((e): e is DiagramEl => selection.has(e.id) && isDiagramElement(e));
  const target = commandCell(slide, cells);
  if (!target) return false;
  let done = false;
  store.commit((draft) => {
    const s = draft.slides[slideIndex];
    if (!s) return;
    const edit = command.run(s, target);
    done = edit.inserted.length > 0 || edit.removed.length > 0 || edit.changed.length > 0;
  }, { label: command.label });
  return done;
}

function tableSection(store: EditorStore, cells: DiagramEl[]): HTMLElement | null {
  const { deck, slideIndex } = store.get();
  const slide = deck.slides[slideIndex];
  if (!slide || !commandCell(slide, cells)) return null;
  const { root, body } = formatControls.section('Table', 'table');
  const grid = document.createElement('div');
  grid.className = 'dfmt-button-grid';
  for (const command of COMMANDS) {
    grid.appendChild(formatControls.button(command.label, () => runTableCommand(store, command.key), command.label, `table-${command.key}`));
  }
  body.appendChild(grid);
  return root;
}

let installed = false;

/** Adds the Table section to the Arrange tab of the format panel. */
export function installDiagramTables(_deps: DiagramExtrasDeps): void {
  if (installed) return;
  installed = true;
  registerDiagramPanelSection('arrange', tableSection);
}
