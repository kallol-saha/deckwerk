/*
 * The panel follows draw.io's Find window (jgraph/drawio 32.7.4,
 * js/diagramly/Dialogs.js: FindWindow; Copyright (c) 2006-2024, JGraph Ltd /
 * draw.io AG, Apache License 2.0). Modified for DeckWerk: one window for
 * Find and Replace, Match case and Whole word beside Regular expression,
 * every replacement one undoable store edit; the logic is in
 * shared/diagram/find.ts.
 */

/**
 * Find / Replace in diagram labels (Ctrl/Cmd+F, Ctrl/Cmd+H for Replace): a
 * small floating window over the canvas, in both editor shells. It searches
 * the labels of the diagram cells on this slide, or on every slide, selects
 * each match in turn (going to its slide) and replaces one match or all of
 * them, each as one undo step.
 */

import './diagramFind.css';
import { isDiagramElement } from '@shared/deck.js';
import {
  findMatches, positionBefore, positionOf, replaceAll, replaceMatch, sameMatch, stepMatch,
  type FindMatch, type FindOptions, type FindPosition, type FindScope,
} from '@shared/diagram/find.js';
import { DiagramTree, isCellSelectable } from '@shared/diagram/structure.js';
import type { DiagramExtrasDeps } from './diagramExtras.js';
import type { EditorStore } from './store.js';

let panel: DiagramFindPanel | null = null;

/** Opens the Find window (with the Replace field focused when `replace`). */
export function openDiagramFind(replace = false): void {
  panel?.open(replace);
}

export function installDiagramFind(deps: DiagramExtrasDeps): DiagramFindPanel {
  if (panel) return panel;
  const created = new DiagramFindPanel(deps.store);
  panel = created;
  window.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'f' && key !== 'h') return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const inPanel = target != null && created.root.contains(target);
    if (inPanel) {
      // Ctrl/Cmd+F in the window closes it, as in draw.io; Ctrl/Cmd+H goes to Replace.
      event.preventDefault();
      event.stopPropagation();
      if (key === 'f') created.close();
      else created.open(true);
      return;
    }
    // A dialog owns the keyboard; text being typed keeps the browser's own keys.
    if (document.querySelector('[aria-modal="true"]')) return;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest('.cm-editor'))) return;
    if (deps.canvas.isEditing()) return;
    event.preventDefault();
    event.stopPropagation();
    created.open(key === 'h');
  }, true);
  return created;
}

const DEBOUNCE_MS = 150;

class DiagramFindPanel {
  readonly root: HTMLElement;
  private readonly findInput: HTMLInputElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly matchCase: HTMLInputElement;
  private readonly wholeWord: HTMLInputElement;
  private readonly regex: HTMLInputElement;
  private readonly allSlides: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly buttons: Record<'prev' | 'next' | 'replace' | 'replaceAll', HTMLButtonElement>;
  /** The match last selected, or null. */
  private current: FindMatch | null = null;
  private typing = 0;
  private statusFrame = 0;
  /** A message that stays until the search changes (Replaced 4, Invalid …). */
  private note: string | null = null;

  constructor(private readonly store: EditorStore) {
    this.root = document.createElement('div');
    this.root.className = 'diagram-find';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Find and replace in diagrams');
    this.root.hidden = true;

    const head = document.createElement('div');
    head.className = 'diagram-find-head';
    const title = document.createElement('span');
    title.className = 'diagram-find-title';
    title.textContent = 'Find / Replace';
    const close = this.button('×', 'Close (Esc)', () => this.close());
    close.classList.add('diagram-find-close');
    close.setAttribute('aria-label', 'Close');
    close.dataset.find = 'close';
    head.append(title, close);
    this.makeDraggable(head);

    this.findInput = this.input('Find', 'find');
    this.replaceInput = this.input('Replace with', 'replace');

    const options = document.createElement('div');
    options.className = 'diagram-find-options';
    this.matchCase = this.check(options, 'Match case', 'match-case');
    this.wholeWord = this.check(options, 'Whole word', 'whole-word');
    this.regex = this.check(options, 'Regular expression', 'regex');
    this.allSlides = this.check(options, 'All slides', 'all-slides');

    this.status = document.createElement('div');
    this.status.className = 'diagram-find-status';
    this.status.setAttribute('aria-live', 'polite');
    this.status.dataset.find = 'status';

    const row = document.createElement('div');
    row.className = 'diagram-find-buttons';
    this.buttons = {
      prev: this.button('Previous', 'Previous match (Shift+Enter)', () => this.find(true)),
      next: this.button('Next', 'Next match (Enter)', () => this.find(false)),
      replace: this.button('Replace', 'Replace this match and find the next', () => this.replace()),
      replaceAll: this.button('Replace All', 'Replace every match', () => this.replaceEvery()),
    };
    this.buttons.next.classList.add('primary');
    for (const [key, b] of Object.entries(this.buttons)) {
      b.dataset.find = key;
      row.appendChild(b);
    }

    this.root.append(head, this.findInput, this.replaceInput, options, this.status, row);
    document.body.appendChild(this.root);

    this.findInput.addEventListener('input', () => this.searchChanged(true));
    this.replaceInput.addEventListener('input', () => this.searchChanged(false));
    for (const box of [this.matchCase, this.wholeWord, this.regex, this.allSlides]) {
      box.addEventListener('change', () => this.searchChanged(box !== this.allSlides));
    }
    this.findInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.find(event.shiftKey);
    });
    this.replaceInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.replace();
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    });
    // Whatever changes the deck or the slide changes the count.
    store.subscribe(() => this.scheduleStatus());
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  open(replace: boolean): void {
    const wasOpen = this.isOpen();
    this.root.hidden = false;
    if (!wasOpen) this.note = null;
    const field = replace ? this.replaceInput : this.findInput;
    field.focus();
    field.select();
    this.updateStatus();
  }

  close(): void {
    if (!this.isOpen()) return;
    this.root.hidden = true;
    window.clearTimeout(this.typing);
    // Back to the canvas, so the editor's keys work again.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.root.contains(focused)) focused.blur();
  }

  // -- the search ----------------------------------------------------------------------

  private options(): FindOptions {
    return {
      query: this.findInput.value,
      matchCase: this.matchCase.checked,
      wholeWord: this.wholeWord.checked,
      regex: this.regex.checked,
      // draw.io finds cells by id and data while nothing is to be written in their place.
      data: this.replaceInput.value === '',
    };
  }

  private scope(): FindScope | null {
    const slide = this.store.slide;
    if (!slide) return null;
    return { scope: this.allSlides.checked ? 'deck' : 'slide', slideId: slide.id };
  }

  /** The matches now, or an error message for an invalid regular expression. */
  private matches(): { matches: FindMatch[]; scope: FindScope } | { error: string } | null {
    const scope = this.scope();
    if (!scope) return null;
    const deck = this.store.get().deck;
    const options = this.options();
    // The status line asks after every store change (each frame of a drag):
    // the same deck and search give the same matches.
    const key = JSON.stringify([scope, options]);
    if (this.memo && this.memo.deck === deck && this.memo.key === key) return this.memo.result;
    let result: { matches: FindMatch[]; scope: FindScope } | { error: string };
    try {
      result = { matches: findMatches(deck, scope, options), scope };
    } catch (error) {
      result = { error: error instanceof Error ? `Invalid regular expression: ${error.message.replace(/^Invalid regular expression: /, '')}` : 'Invalid regular expression' };
    }
    this.memo = { deck, key, result };
    return result;
  }

  private memo: { deck: unknown; key: string; result: { matches: FindMatch[]; scope: FindScope } | { error: string } } | null = null;

  /** Where the next search starts: the current match while it is what is selected, else the selection. */
  private position(): FindPosition | null {
    const { deck, slideIndex, selection } = this.store.get();
    const slide = deck.slides[slideIndex];
    if (!slide) return null;
    const current = this.current;
    if (current && selection.size === 1 && selection.has(current.elementId)
      && deck.slides.some((s) => s.id === current.slideId) && current.slideId === slide.id) {
      return positionOf(current);
    }
    const selected = slide.elements.find((el) => selection.has(el.id) && isDiagramElement(el));
    return positionBefore(slide.id, selected?.id ?? null);
  }

  private searchChanged(resetPosition: boolean): void {
    this.note = null;
    window.clearTimeout(this.typing);
    if (!resetPosition) {
      this.updateStatus();
      return;
    }
    // Typing searches as draw.io does: from where the last match was, inclusive.
    this.typing = window.setTimeout(() => {
      const from = this.current ? { ...positionOf(this.current), offset: this.current.start - 1 } : this.position();
      this.current = null;
      this.find(false, from);
    }, DEBOUNCE_MS);
  }

  /** Select the next (or previous) match. */
  find(backwards: boolean, from: FindPosition | null = this.position()): void {
    window.clearTimeout(this.typing);
    const found = this.matches();
    if (!found || 'error' in found) {
      this.current = null;
      this.note = found && 'error' in found ? found.error : null;
      this.updateStatus();
      return;
    }
    const { matches, scope } = found;
    const index = stepMatch(this.store.get().deck, scope, matches, from, backwards);
    this.current = index >= 0 ? matches[index] : null;
    this.note = null;
    if (this.current) this.reveal(this.current);
    this.updateStatus();
  }

  /** Go to the match's slide and select its cell (a label cell selects its connector). */
  private reveal(match: FindMatch): void {
    const { deck, slideIndex } = this.store.get();
    const index = deck.slides.findIndex((s) => s.id === match.slideId);
    if (index < 0) return;
    if (index !== slideIndex) this.store.selectSlide(index);
    const slide = deck.slides[index];
    const el = slide.elements.find((e) => e.id === match.elementId);
    if (!el || !isDiagramElement(el)) return;
    if (!isCellSelectable(slide, el, new DiagramTree(slide))) return;
    const { selection } = this.store.get();
    if (selection.size !== 1 || !selection.has(el.id)) this.store.select([el.id]);
  }

  /** Replace the current match, then find the next one. */
  private replace(): void {
    const found = this.matches();
    if (!found || 'error' in found) {
      this.find(false);
      return;
    }
    const current = found.matches.find((m) => sameMatch(m, this.current));
    if (!current || current.kind !== 'label') {
      this.find(false);
      return;
    }
    const replacement = this.replaceInput.value;
    const options = this.options();
    const result: { next: FindPosition | null } = { next: null };
    this.store.commit((deck) => {
      result.next = replaceMatch(deck, current, replacement, options)?.next ?? null;
    }, { label: 'Replace' });
    if (result.next == null) {
      this.note = 'This label cannot be changed (locked or not editable).';
      this.updateStatus();
      return;
    }
    this.current = null;
    this.find(false, result.next);
  }

  /** draw.io's Replace All: every match in the scope, one undo step. */
  private replaceEvery(): void {
    const scope = this.scope();
    if (!scope || this.findInput.value === '') return;
    const options = this.options();
    let count = 0;
    try {
      this.store.commit((deck) => {
        count = replaceAll(deck, scope, this.replaceInput.value, options);
      }, { label: 'Replace all' });
    } catch (error) {
      this.note = error instanceof Error ? error.message : String(error);
      this.updateStatus();
      return;
    }
    this.current = null;
    this.note = count === 1 ? '1 match replaced' : `${count} matches replaced`;
    this.updateStatus();
    // The buttons disable with nothing left to find: keep the keyboard in the window.
    this.findInput.focus();
  }

  // -- the status line --------------------------------------------------------------------

  private scheduleStatus(): void {
    if (!this.isOpen() || this.statusFrame) return;
    this.statusFrame = requestAnimationFrame(() => {
      this.statusFrame = 0;
      this.updateStatus();
    });
  }

  private updateStatus(): void {
    if (!this.isOpen()) return;
    const query = this.findInput.value;
    const found = query ? this.matches() : null;
    let text = '';
    let total = 0;
    let invalid = false;
    if (found && 'error' in found) {
      text = found.error;
      invalid = true;
    } else if (found) {
      total = found.matches.length;
      const at = found.matches.findIndex((m) => sameMatch(m, this.current));
      if (total === 0) text = 'No matches';
      else text = `${at >= 0 ? at + 1 : '–'} of ${total}`;
    }
    if (this.note) text = text && !invalid ? `${this.note} · ${text}` : this.note;
    this.status.textContent = text;
    this.findInput.classList.toggle('not-found', query !== '' && (invalid || total === 0) && this.note == null);
    const none = !found || 'error' in found || total === 0;
    this.buttons.prev.disabled = none;
    this.buttons.next.disabled = none;
    this.buttons.replace.disabled = none || this.current == null || this.current.kind !== 'label';
    this.buttons.replaceAll.disabled = none;
  }

  // -- controls ------------------------------------------------------------------------------

  private input(placeholder: string, data: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'diagram-find-input';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.dataset.find = data;
    return input;
  }

  private check(parent: HTMLElement, label: string, data: string): HTMLInputElement {
    const wrap = document.createElement('label');
    wrap.className = 'diagram-find-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.find = data;
    wrap.append(box, document.createTextNode(label));
    parent.appendChild(wrap);
    return box;
  }

  private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      event.preventDefault();
      const start = { x: event.clientX, y: event.clientY };
      const box = this.root.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const left = Math.max(0, Math.min(window.innerWidth - box.width, box.left + ev.clientX - start.x));
        const top = Math.max(0, Math.min(window.innerHeight - 40, box.top + ev.clientY - start.y));
        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
        this.root.style.right = 'auto';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}

export type { DiagramFindPanel };
