/**
 * draw.io's shape library: the default palettes as data, their search, and
 * turning an entry into cells on a slide. DOM-free; the Shapes panel
 * (src/renderer/editor/shapeLibrary.ts) draws and drives it.
 */

import { LIBRARY_DATA } from './palettes.generated.js';
import { ShapeSearchIndex } from './search.js';
import type { LibraryItem, LibraryPalette } from './types.js';

export type { LibraryCell, LibraryData, LibraryItem, LibraryPalette } from './types.js';
export { ShapeSearchIndex, itemTags, soundex } from './search.js';
export {
  isEdgeItem, itemSvg, paintedBounds, placeItem, previewElements, templateBounds, templateCells,
  type ItemSvgOptions, type PlacedCell, type PlaceOptions,
} from './template.js';
export {
  DEFAULT_EDGE_LENGTH, applyLibraryEdit, centerInsertPoint, clickItem, connectDirection,
  connectSelectedVertices, connectsSelectedVertices, diagramGrid, dropAndConnect, dropAndConnectGeometry,
  dropInsertPoint, dropItem, endLooseConnector, freeInsertPoint, insertItem, insertionFrame, replaceShapes,
  replacedStyle, snap, toSlide, toUnits,
  type ClickModifiers, type ClickView, type DiagramFrame, type Direction, type Grid, type LibraryEdit,
} from './actions.js';

/** draw.io's default palettes, in its order: General, Misc, Advanced, Basic, Arrows, Flowchart, Entity Relation, UML. */
export const PALETTES: readonly LibraryPalette[] = LIBRARY_DATA.palettes;

let byId: Map<string, LibraryItem> | null = null;

/** The entry with this id (`<palette>.<index>`). */
export function libraryItem(id: string): LibraryItem | undefined {
  byId ??= new Map(PALETTES.flatMap((p) => p.items.map((item) => [item.id, item] as const)));
  return byId.get(id);
}

/** Every entry, palette by palette. */
export function libraryItems(): LibraryItem[] {
  return PALETTES.flatMap((p) => p.items);
}

let index: ShapeSearchIndex<LibraryItem> | null = null;

/** Searches every palette's titles and tags, as draw.io's shape search does; best matches first. */
export function searchLibrary(query: string): LibraryItem[] {
  index ??= new ShapeSearchIndex(libraryItems());
  return index.search(query).items;
}
