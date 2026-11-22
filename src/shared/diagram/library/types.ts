/**
 * The shape library as data: draw.io's palettes (General, Misc, Advanced,
 * Basic, Arrows, Flowchart, Entity Relation, UML), each entry being the cells
 * draw.io's Sidebar would insert for it. Generated from draw.io's own palette
 * code by scripts/drawio-sidebar-extract.mts (palettes.generated.ts).
 */

import type { Point } from '../types.js';

/** A cell of a library template, in draw.io units, as Sidebar's template functions build it. */
export interface LibraryCell {
  /** Unique within its item only; cells get fresh ids when inserted. */
  id: string;
  /** The parent cell within the item (a container, a group, an edge for its labels); absent at the top. */
  parent?: string;
  /** An edge; otherwise a vertex. */
  edge?: boolean;
  style: string;
  value?: string;
  /** Custom properties (draw.io `UserObject`), with the label in `attrs.label`. */
  object?: { tag: string; attrs: Record<string, string> };
  /** Edge terminals among the item's cells. */
  source?: string;
  target?: string;
  connectable?: false;
  visible?: false;
  collapsed?: true;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
    relative?: boolean;
    points?: Point[];
    sourcePoint?: Point;
    targetPoint?: Point;
    offset?: Point;
  };
}

export interface LibraryItem {
  /** `<palette id>.<index>`, stable for one generated library. */
  id: string;
  title: string;
  /** The search tags draw.io gives the entry (as passed to Sidebar.addEntry). */
  tags: string;
  /** The template size draw.io gives the entry (its drag preview and drop bounds), in draw.io units. */
  width: number;
  height: number;
  /** false when draw.io draws the thumbnail without labels. */
  showLabel?: false;
  /** The cells, parents before children. */
  cells: LibraryCell[];
}

export interface LibraryPalette {
  /** draw.io's palette id (general, misc, advanced, basic, arrows2, flowchart, er, uml). */
  id: string;
  title: string;
  /** Open when the panel first shows (draw.io opens General only). */
  expanded: boolean;
  items: LibraryItem[];
}

export interface LibraryData {
  source: string;
  palettes: LibraryPalette[];
}
