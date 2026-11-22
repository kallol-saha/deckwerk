import { describe, expect, it } from 'vitest';
import { parseDeck, type ConnectorEl, type Deck, type VertexEl } from '../src/shared/deck.js';
import {
  expandReplacement, findMatches, labelSlots, positionBefore, positionOf, replaceAll, replaceMatch, searchableText,
  stepMatch, type FindScope,
} from '../src/shared/diagram/find.js';
import { EditorStore } from '../src/renderer/editor/store.js';

function vertex(id: string, label: string, dio = 'rounded=0;whiteSpace=wrap;html=1;', extra: Record<string, unknown> = {}) {
  return { id, type: 'vertex', x: 0, y: 0, w: 100, h: 40, cell: id, dio, label, ...extra };
}

function connector(id: string, label: string, labels: Array<{ cell: string; label: string; dio?: string }> = [], extra: Record<string, unknown> = {}) {
  return {
    id, type: 'connector', x: 0, y: 0, w: 10, h: 10, cell: id, dio: 'edgeStyle=orthogonalEdgeStyle;html=1;', label,
    sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 10, y: 10 }, route: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    labels: labels.map((l) => ({ dio: 'edgeLabel;html=1;', ...l })), ...extra,
  };
}

function deck(): Deck {
  return parseDeck({
    version: 1,
    title: 'Find',
    slides: [
      {
        id: 's1',
        elements: [
          // Paint order is z, then position: v2 paints before v1.
          vertex('v1', 'Encoder <b>block</b>', undefined, { z: 2 }),
          vertex('v2', 'encoder&nbsp;one<br>two', undefined, { z: 1 }),
          connector('e1', 'to encoder', [{ cell: 'l1', label: 'Encoder label' }], { z: 3 }),
        ],
      },
      { id: 's2', elements: [] },
      {
        id: 's3',
        elements: [
          vertex('p1', 'plain encoder\nencoded', 'text;whiteSpace=wrap;'),
          vertex('h1', 'hidden encoder', undefined, { hidden: true }),
          vertex('d1', 'Decoder', undefined, { object: { tag: 'object', attrs: { label: 'Decoder', owner: 'encoder team' } } }),
        ],
      },
    ],
  });
}

const slide1: FindScope = { scope: 'slide', slideId: 's1' };
const all: FindScope = { scope: 'deck', slideId: 's1' };

function labelOf(d: Deck, slideId: string, id: string): string {
  const el = d.slides.find((s) => s.id === slideId)!.elements.find((e) => e.id === id) as VertexEl | ConnectorEl;
  return el.label;
}

describe('the text searched', () => {
  it('is the text an HTML label shows, white space collapsed', () => {
    expect(searchableText('encoder&nbsp;one<br>two', true)).toBe('encoder one two');
    expect(searchableText('<div>a</div><div>b &amp; c</div>', true)).toBe(' a b & c ');
    expect(searchableText('a  <b>b</b>\n\tc', true)).toBe('a b c');
    // Plain labels are text: tags are characters.
    expect(searchableText('a <b> c\nd', false)).toBe('a <b> c d');
    expect(searchableText('x < y', true)).toBe('x < y');
  });

  it('covers vertices, connectors and their label cells in paint order, skipping hidden cells', () => {
    const slots = labelSlots(deck(), all);
    expect(slots.map((s) => `${s.slideId}:${s.elementId}${s.labelCell ? `/${s.labelCell}` : ''}`))
      .toEqual(['s1:v2', 's1:v1', 's1:e1', 's1:e1/l1', 's3:p1', 's3:d1']);
    expect(slots.find((s) => s.elementId === 'p1')?.html).toBe(false);
  });
});

describe('finding', () => {
  it('matches case-insensitively by default, every occurrence in order', () => {
    const m = findMatches(deck(), slide1, { query: 'encoder' });
    expect(m.map((x) => `${x.elementId}${x.labelCell ? `/${x.labelCell}` : ''}@${x.start}`))
      .toEqual(['v2@0', 'v1@0', 'e1@3', 'e1/l1@0']);
    expect(m.every((x) => x.kind === 'label')).toBe(true);
  });

  it('honours match case, whole word and regular expressions', () => {
    expect(findMatches(deck(), slide1, { query: 'Encoder', matchCase: true }).map((x) => x.elementId)).toEqual(['v1', 'e1']);
    const words = findMatches(deck(), all, { query: 'encode', wholeWord: true });
    expect(words).toEqual([]);
    expect(findMatches(deck(), all, { query: 'encode' }).map((x) => x.elementId)).toContain('p1');
    const re = findMatches(deck(), all, { query: 'encod(er|ed)\\b', regex: true });
    expect(re.filter((x) => x.elementId === 'p1').map((x) => [x.text, x.groups[0]])).toEqual([['encoder', 'er'], ['encoded', 'ed']]);
    // White space in the query matches any white space (a <br>, &nbsp;, a newline).
    expect(findMatches(deck(), slide1, { query: 'one two' }).map((x) => x.elementId)).toEqual(['v2']);
    expect(findMatches(deck(), all, { query: 'encoder encoded' }).map((x) => x.elementId)).toEqual(['p1']);
    expect(() => findMatches(deck(), all, { query: '(', regex: true })).toThrow();
    expect(findMatches(deck(), all, { query: '' })).toEqual([]);
  });

  it('maps a match back to the stored label', () => {
    const [m] = findMatches(deck(), slide1, { query: 'one two' });
    expect('encoder&nbsp;one<br>two'.slice(m.from, m.to)).toBe('one<br>two');
    const [nbsp] = findMatches(deck(), slide1, { query: 'encoder one' });
    expect('encoder&nbsp;one<br>two'.slice(nbsp.from, nbsp.to)).toBe('encoder&nbsp;one');
  });

  it('finds cells by id and custom properties while nothing replaces them (draw.io testMeta)', () => {
    expect(findMatches(deck(), all, { query: 'team' })).toEqual([]);
    const data = findMatches(deck(), all, { query: 'team', data: true });
    expect(data.map((x) => [x.elementId, x.kind, x.text])).toEqual([['d1', 'data', 'owner: encoder team']]);
    expect(findMatches(deck(), all, { query: 'D1', data: true }).map((x) => x.elementId)).toEqual(['d1']);
    // A cell id matches whole, not in part.
    expect(findMatches(deck(), all, { query: 'd', data: true }).filter((x) => x.kind === 'data')).toEqual([]);
  });
});

describe('stepping', () => {
  it('goes to the next and previous match and wraps around', () => {
    const d = deck();
    const m = findMatches(d, all, { query: 'encoder' });
    const key = (i: number) => `${m[i].elementId}${m[i].labelCell ? `/${m[i].labelCell}` : ''}@${m[i].start}`;
    expect(m.map((_, i) => key(i))).toEqual(['v2@0', 'v1@0', 'e1@3', 'e1/l1@0', 'p1@6']);
    let i = stepMatch(d, all, m, positionBefore('s1', null));
    expect(key(i)).toBe('v2@0');
    i = stepMatch(d, all, m, positionOf(m[i]));
    expect(key(i)).toBe('v1@0');
    i = stepMatch(d, all, m, positionOf(m[4]));
    expect(key(i)).toBe('v2@0');
    i = stepMatch(d, all, m, positionOf(m[0]), true);
    expect(key(i)).toBe('p1@6');
    i = stepMatch(d, all, m, positionOf(m[2]), true);
    expect(key(i)).toBe('v1@0');
    // From a selected cell: its own matches first.
    expect(key(stepMatch(d, all, m, positionBefore('s1', 'e1')))).toBe('e1@3');
    // From an empty slide: on to the next slide with a match, or back to the one before.
    expect(key(stepMatch(d, all, m, positionBefore('s2', null)))).toBe('p1@6');
    expect(key(stepMatch(d, all, m, positionBefore('s2', null), true))).toBe('e1/l1@0');
  });

  it('steps through several matches in one label', () => {
    const d = deck();
    const m = findMatches(d, all, { query: 'enco' });
    const inP1 = m.filter((x) => x.elementId === 'p1');
    expect(inP1.map((x) => x.start)).toEqual([6, 14]);
    const at = m.indexOf(inP1[0]);
    expect(stepMatch(d, all, m, positionOf(inP1[0]))).toBe(at + 1);
  });
});

describe('replacing', () => {
  it('replaces one match in plain and HTML labels, keeping the markup', () => {
    const d = deck();
    const m = findMatches(d, slide1, { query: 'block' });
    expect(replaceMatch(d, m[0], 'stage <1>', { query: 'block' })).not.toBeNull();
    expect(labelOf(d, 's1', 'v1')).toBe('Encoder <b>stage &lt;1&gt;</b>');

    const p = findMatches(d, all, { query: 'encoded' });
    const result = replaceMatch(d, p[0], 'decoded', { query: 'encoded' });
    expect(labelOf(d, 's3', 'p1')).toBe('plain encoder\ndecoded');
    expect(result?.next).toEqual({ slideId: 's3', elementId: 'p1', labelCell: null, offset: 14 + 7 - 1 });
  });

  it('keeps the tags inside a replaced range and the formatting of its first character', () => {
    const d = parseDeck({
      version: 1,
      slides: [{ id: 's', elements: [vertex('a', '<b>foo</b>bar baz<br>qux')] }],
    });
    const where: FindScope = { scope: 'slide', slideId: 's' };
    const [m] = findMatches(d, where, { query: 'foobar' });
    replaceMatch(d, m, 'X&Y', { query: 'foobar' });
    expect(labelOf(d, 's', 'a')).toBe('<b>X&amp;Y</b> baz<br>qux');
    const [n] = findMatches(d, where, { query: 'baz qux' });
    replaceMatch(d, n, 'Z', { query: 'baz qux' });
    expect(labelOf(d, 's', 'a')).toBe('<b>X&amp;Y</b> Z<br>');
  });

  it('replaces a label cell on a connector', () => {
    const d = deck();
    const m = findMatches(d, slide1, { query: 'label' });
    expect(m.map((x) => x.labelCell)).toEqual(['l1']);
    replaceMatch(d, m[0], 'tag', { query: 'label' });
    const e1 = d.slides[0].elements.find((e) => e.id === 'e1') as ConnectorEl;
    expect(e1.labels[0].label).toBe('Encoder tag');
  });

  it('refuses a match that is gone, a data match and a locked cell', () => {
    const d = deck();
    const [m] = findMatches(d, slide1, { query: 'block' });
    const v1 = d.slides[0].elements.find((e) => e.id === 'v1') as VertexEl;
    v1.label = 'changed';
    expect(replaceMatch(d, m, 'x', { query: 'block' })).toBeNull();
    const [data] = findMatches(d, all, { query: 'team', data: true });
    expect(replaceMatch(d, data, 'x', { query: 'team' })).toBeNull();
    v1.label = 'Encoder block';
    v1.dio += 'locked=1;';
    const [again] = findMatches(d, slide1, { query: 'block' });
    expect(replaceMatch(d, again, 'x', { query: 'block' })).toBeNull();
    expect(replaceAll(d, slide1, 'x', { query: 'block' })).toBe(0);
  });

  it('expands $1, $& and $$ in a regular expression replacement', () => {
    expect(expandReplacement('<$1|$&|$$>', { text: 'encoder', groups: ['er'] }, true)).toBe('<er|encoder|$>');
    expect(expandReplacement('$1', { text: 'x', groups: [] }, false)).toBe('$1');
    const d = deck();
    replaceAll(d, all, '[$1]', { query: 'encod(er|ed)', regex: true });
    expect(labelOf(d, 's3', 'p1')).toBe('plain [er]\n[ed]');
  });

  it('replaces all in the scope, and only there', () => {
    const d = deck();
    expect(replaceAll(d, slide1, 'ENC', { query: 'encoder' })).toBe(4);
    expect(labelOf(d, 's1', 'v1')).toBe('ENC <b>block</b>');
    expect(labelOf(d, 's1', 'v2')).toBe('ENC&nbsp;one<br>two');
    expect(labelOf(d, 's1', 'e1')).toBe('to ENC');
    expect((d.slides[0].elements.find((e) => e.id === 'e1') as ConnectorEl).labels[0].label).toBe('ENC label');
    expect(labelOf(d, 's3', 'p1')).toBe('plain encoder\nencoded');
    // A replacement that contains the query does not loop.
    expect(replaceAll(d, all, 'encoder encoder', { query: 'encoder' })).toBe(1);
    expect(labelOf(d, 's3', 'p1')).toBe('plain encoder encoder\nencoded');
    // Hidden cells are not searched, so not replaced.
    expect(labelOf(d, 's3', 'h1')).toBe('hidden encoder');
  });

  it('is one undoable change in the editor', () => {
    const store = new EditorStore(deck(), null);
    store.commit((draft) => {
      replaceAll(draft, all, 'X', { query: 'encoder' });
    }, { label: 'Replace all' });
    const after = store.get().deck;
    expect(labelOf(after, 's1', 'v1')).toBe('X <b>block</b>');
    expect(labelOf(after, 's3', 'p1')).toBe('plain X\nencoded');
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(labelOf(store.get().deck, 's1', 'v1')).toBe('Encoder <b>block</b>');
    expect(labelOf(store.get().deck, 's3', 'p1')).toBe('plain encoder\nencoded');
    expect(store.canUndo()).toBe(false);
  });
});
