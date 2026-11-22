/*
 * Ported from draw.io (jgraph/drawio 32.7.4), Copyright (c) 2006-2024,
 * JGraph Ltd and Copyright (c) 2006-2024, draw.io AG, Apache License 2.0:
 * js/grapheditor/Sidebar.js (addEntry, addEntryForTag, getNormalizedTag,
 * searchEntries, matchTermEntries, matchPartialEntries, splitCompoundToken,
 * isTagMatchBoundary) and Editor.soundex from js/grapheditor/Editor.js.
 * Modified for DeckWerk: the index is built over library items instead of
 * palette functions, and search terms are not translated.
 */

import type { LibraryItem } from './types.js';

/** Editor.soundex: Soundex, with `s` mapped to 0 so plurals match. */
export function soundex(name: string): string {
  if (name == null || name.length === 0) return '';
  const s: string[] = [];
  let si = 1;
  // ABCDEFGHIJKLMNOPQRSTUVWXYZ
  const mappings = '01230120022455012603010202';
  s[0] = name[0].toUpperCase();
  for (let i = 1; i < name.length; i++) {
    const c = name[i].toUpperCase().charCodeAt(0) - 65;
    if (c >= 0 && c <= 25) {
      if (mappings[c] !== '0') {
        if (mappings[c] !== s[si - 1]) {
          s[si] = mappings[c];
          si++;
        }
        if (si > 3) break;
      }
    }
  }
  if (si <= 3) {
    while (si <= 3) {
      s[si] = '0';
      si++;
    }
  }
  return s.join('');
}

/** Sidebar.getNormalizedTag: the Soundex of a tag without trailing numbers. */
function normalizedTag(tag: string): string {
  return soundex(tag.replace(/\.*\d*$/, ''));
}

/** Sidebar.splitCompoundToken: camelCase and letter-digit boundaries. */
export function splitCompoundToken(token: string): string[] {
  return token.replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 2);
}

/** Sidebar.isTagMatchBoundary. */
function isTagMatchBoundary(key: string, index: number): boolean {
  if (index === 0) return true;
  const prev = key.charCodeAt(index - 1);
  const curr = key.charCodeAt(index);
  const prevDigit = prev >= 48 && prev <= 57;
  const currDigit = curr >= 48 && curr <= 57;
  if (!prevDigit && !(prev >= 97 && prev <= 122)) return true;
  return prevDigit !== currDigit;
}

/** The tags an item is found by: draw.io's own, plus its title where draw.io left it out. */
export function itemTags(item: Pick<LibraryItem, 'tags' | 'title'>): string {
  const tags = item.tags ?? '';
  const title = item.title ?? '';
  return title && !tags.toLowerCase().includes(title.toLowerCase()) ? `${tags} ${title}` : tags;
}

export interface SearchResult<T> {
  items: T[];
  /** The terms searched for, after splitting (Sidebar.searchEntries' `tmp`). */
  terms: string[];
}

/**
 * Sidebar's search index (taglist) over a set of items: every tag, and the
 * Soundex of every tag, names the items that have it.
 */
export class ShapeSearchIndex<T extends Pick<LibraryItem, 'tags' | 'title'>> {
  private taglist = new Map<string, T[]>();

  constructor(items: Iterable<T>) {
    for (const item of items) this.add(item);
  }

  /** Sidebar.addEntry. */
  private add(item: T): void {
    const tokens = itemTags(item).toLowerCase().replace(/[/,()]/g, ' ').split(' ');
    for (const token of tokens) {
      this.addForTag(token, item);
      const normalized = normalizedTag(token);
      if (normalized !== token) this.addForTag(normalized, item);
    }
  }

  /** Sidebar.addEntryForTag: tags of two characters or more. */
  private addForTag(tag: string, item: T): void {
    if (tag == null || tag.length <= 1) return;
    let entries = this.taglist.get(tag);
    if (!entries) {
      entries = [];
      this.taglist.set(tag, entries);
    }
    if (entries[entries.length - 1] !== item) entries.push(item);
  }

  /** Sidebar.matchPartialEntries. */
  private matchPartial(term: string, seen: Set<T>, prefix: T[], substring: T[]): void {
    const minInnerLength = 4;
    if (term.length < 2) return;
    for (const [key, entries] of this.taglist) {
      const c = key.charCodeAt(0);
      // Soundex keys (upper case first letter) and the exact match are skipped.
      if ((c >= 65 && c <= 90) || key === term) continue;
      let idx = key.indexOf(term);
      if (idx < 0) continue;
      let boundary = false;
      while (idx >= 0 && !boundary) {
        boundary = isTagMatchBoundary(key, idx);
        idx = boundary ? idx : key.indexOf(term, idx + 1);
      }
      if (boundary || term.length >= minInnerLength) {
        const target = boundary ? prefix : substring;
        for (const entry of entries) {
          if (!seen.has(entry)) {
            seen.add(entry);
            target.push(entry);
          }
        }
      }
    }
  }

  /** Sidebar.matchTermEntries: exact, word-boundary, inner and Soundex matches of one term. */
  private matchTerm(term: string): { exact: T[]; prefix: T[]; substring: T[]; phonetic: T[] } {
    const exact = [...(this.taglist.get(term) ?? [])];
    const prefix: T[] = [];
    const substring: T[] = [];
    let phonetic: T[] = [];
    const seen = new Set<T>(exact);
    this.matchPartial(term, seen, prefix, substring);
    const normalized = normalizedTag(term);
    if (normalized.length > 0 && normalized !== term) {
      phonetic = [...(this.taglist.get(normalized) ?? [])].filter((e) => !seen.has(e));
    }
    return { exact, prefix, substring, phonetic };
  }

  /**
   * Sidebar.searchEntries: every term must match (an exact, word-boundary,
   * inner or Soundex match); results are ranked by how well they match
   * (1.0 exact, 0.8 at a word boundary, 0.6 inside a tag, 0.5 Soundex per
   * term), ties in library order. When no item matches every term, the
   * items matching any are ranked instead.
   */
  search(query: string): SearchResult<T> {
    let searchTerms = (query ?? '').trim();
    // Fully qualified names of the form mxgraph.foo.bar
    if (searchTerms.substring(0, 8) === 'mxgraph.' && !searchTerms.includes(' ') && searchTerms.lastIndexOf('.') > 8) {
      searchTerms = searchTerms.substring(8).replace(/\./g, ' ');
    }
    const terms: string[] = [];
    const seenTerms = new Set<string>();
    for (const raw of searchTerms.toLowerCase().split(' ')) {
      let sub = splitCompoundToken(raw);
      if (sub.length === 0 && raw.length >= 2) sub = [raw];
      for (const t of sub) {
        if (!seenTerms.has(t)) {
          seenTerms.add(t);
          terms.push(t);
        }
      }
    }
    if (terms.length === 0) return { items: [], terms };

    const termMatches = terms.map((t) => this.matchTerm(t));

    // Strict AND for the candidate set.
    let candidates: Set<T> | null = null;
    let andFailed = false;
    let previous = new Set<T>();
    for (let i = 0; i < termMatches.length; i++) {
      const m = termMatches[i];
      const all = [...m.exact, ...m.prefix, ...m.substring, ...m.phonetic];
      const next = new Set<T>();
      for (const entry of all) if (i === 0 || previous.has(entry)) next.add(entry);
      previous = next;
      if (next.size === 0 && i < termMatches.length - 1) {
        andFailed = true;
        break;
      }
    }
    if (!andFailed && previous.size > 0) candidates = previous;

    const tierScores = [1.0, 0.8, 0.6, 0.5];
    const scores = new Map<T, number>();
    for (const m of termMatches) {
      const matchedForTerm = new Set<T>();
      const tiers = [m.exact, m.prefix, m.substring, m.phonetic];
      tiers.forEach((tier, t) => {
        for (const entry of tier) {
          if ((candidates == null || candidates.has(entry)) && !matchedForTerm.has(entry)) {
            matchedForTerm.add(entry);
            scores.set(entry, (scores.get(entry) ?? 0) + tierScores[t]);
          }
        }
      });
    }
    // Map iteration is insertion order: ties stay in the order they were found (Array.sort is stable).
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([entry]) => entry);
    return { items: ranked, terms };
  }
}
