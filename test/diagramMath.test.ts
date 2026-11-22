import { describe, expect, it } from 'vitest';
import type { VertexEl } from '../src/shared/deck.js';
import { vertexMarkup } from '../src/shared/diagram/element.js';
import { asciiMathToTex, containsMath, findMath, findTex, mathLabelSize, texSize, typesetLabelMath } from '../src/shared/diagram/mathLabel.js';
import { textWidth } from '../src/shared/diagram/label/metrics.js';

function vertex(label: string, dio = 'rounded=0;whiteSpace=wrap;html=1;'): VertexEl {
  return {
    id: 'v1', type: 'vertex', x: 0, y: 0, w: 200, h: 80, rot: 0, z: 0, opacity: 1, class: [], style: {},
    dio, label, cell: 'c1', diagram: 'd', parent: '1', scale: 1, origin: { x: 0, y: 0 },
  } as unknown as VertexEl;
}

describe('findTex (MathJax FindTeX with draw.io\'s delimiters)', () => {
  it('finds display and inline math, not single dollars', () => {
    expect(findTex('a $$x^2$$ b').map((i) => [i.tex, i.display])).toEqual([['x^2', true]]);
    expect(findTex('a \\(y\\) b').map((i) => [i.tex, i.display])).toEqual([['y', false]]);
    expect(findTex('\\[z\\]').map((i) => i.display)).toEqual([true]);
    expect(findTex('costs $5 and $6')).toEqual([]);
  });
  it('treats environments as display math, keeping \\begin and \\end', () => {
    const [item] = findTex('\\begin{aligned} a &= b \\end{aligned}');
    expect(item.display).toBe(true);
    expect(item.tex).toBe('\\begin{aligned} a &= b \\end{aligned}');
  });
  it('only closes outside braces', () => {
    expect(findTex('\\(\\text{a \\) b}\\)')[0].tex).toBe('\\text{a \\) b}');
    expect(findTex('$${a$$}$$')[0].tex).toBe('{a$$}');
  });
  it('reads \\$ as an escaped dollar', () => {
    expect(findTex('costs \\$5')).toEqual([{ start: 6, end: 8, tex: '$', display: false, escape: true }]);
  });
  it('skips an opening delimiter with no close', () => {
    expect(findTex('$$ a \\(b\\)').map((i) => i.tex)).toEqual(['b']);
  });
  it('containsMath matches Editor.containsMath', () => {
    expect(containsMath('a $')).toBe(true);
    expect(containsMath('\\(')).toBe(true);
    expect(containsMath('`x`')).toBe(true);
    expect(containsMath('plain')).toBe(false);
  });
});

describe('typesetLabelMath', () => {
  it('replaces formulas with KaTeX and keeps the rest byte for byte', () => {
    const html = '<b>Loss</b> $$x^2$$ <i>keep &amp; this</i>';
    const out = typesetLabelMath(html);
    expect(out.startsWith('<b>Loss</b>')).toBe(true);
    expect(out).toContain('class="katex-display"');
    expect(out.endsWith('<i>keep &amp; this</i>')).toBe(true);
  });
  it('lets math cross <br> but not other elements', () => {
    expect(typesetLabelMath('$$a<br>b$$')).toContain('class="katex');
    expect(typesetLabelMath('$$a <b>b</b> c$$')).not.toContain('katex');
  });
  it('leaves code, pre and geDisableMathJax alone', () => {
    expect(typesetLabelMath('<code>$$x$$</code>')).toBe('<code>$$x$$</code>');
    expect(typesetLabelMath('<span class="geDisableMathJax">\\(x\\)</span>')).toBe('<span class="geDisableMathJax">\\(x\\)</span>');
  });
  it('writes escaped dollars as dollars', () => {
    expect(typesetLabelMath('costs \\$5')).toBe('costs $5');
  });
  it('decodes entities inside formulas', () => {
    expect(typesetLabelMath('\\(a &lt; b\\)')).toContain('katex');
    expect(typesetLabelMath('\\(a &lt; b\\)')).not.toContain('katex-error');
  });
  it('shows a broken formula as an error, not an exception', () => {
    expect(typesetLabelMath('\\(\\frac{a}\\)')).toContain('katex-error');
  });
});

describe('math in cell markup', () => {
  it('typesets HTML labels only when the page has math', () => {
    const el = vertex('Value \\(V(s)\\)');
    expect(vertexMarkup(el)).not.toContain('katex');
    expect(vertexMarkup(el, { math: true })).toContain('class="katex"');
  });
  it('does not typeset plain (SVG text) labels, as draw.io does not', () => {
    expect(vertexMarkup(vertex('$$x$$', 'rounded=0;'), { math: true })).not.toContain('katex');
  });
});

describe('math label size', () => {
  it('is the typeset size, not the TeX source', () => {
    const source = textWidth('\\(\\alpha\\)', 12, false);
    const size = mathLabelSize('\\(\\alpha\\)', 12, false);
    expect(size.width).toBeLessThan(source);
    expect(size.width).toBeGreaterThan(4);
    expect(size.height).toBeGreaterThanOrEqual(12 * 1.2 - 0.01);
  });
  it('makes a fraction taller than a line and a display formula a block', () => {
    expect(texSize('\\frac{a}{b}', false, 12).height).toBeGreaterThan(texSize('a', false, 12).height);
    const display = mathLabelSize('top $$x$$', 12, false);
    expect(display.height).toBeGreaterThan(2 * 12 * 1.2);
  });
});

describe('AsciiMath (backticks, as MathJax\'s AsciiMath input reads them)', () => {
  it('converts to TeX in display style, fences as ordinary atoms', () => {
    expect(asciiMathToTex('a/b')).toBe(String.raw`\displaystyle \frac{a}{b}`);
    expect(asciiMathToTex('sqrt x')).toContain(String.raw`\sqrt{x}`);
    // n(n+1): no inner-atom space before the fence.
    expect(asciiMathToTex('n(n+1)')).toBe(String.raw`\displaystyle n {\left ( n + 1 \right )}`);
    expect(asciiMathToTex('(a)(b)')).toBe(String.raw`\displaystyle {\left ( a \right )} {\left ( b \right )}`);
  });
  it('finds backtick pairs beside TeX, not inside it', () => {
    const items = findMath(String.raw`TeX \(x^2\) next to ` + '`y^2` and `a/b`');
    expect(items.map((i) => i.tex)).toEqual(['x^2', String.raw`\displaystyle y^{2}`, String.raw`\displaystyle \frac{a}{b}`]);
    expect(findMath('$$a `b` c$$').map((i) => i.tex)).toEqual(['a `b` c']);
    expect(findMath('one ` only')).toEqual([]);
  });
  it('typesets AsciiMath in labels and sizes it', () => {
    const out = typesetLabelMath('Sum `sum_(i=1)^n i`');
    expect(out.startsWith('Sum ')).toBe(true);
    expect(out).toContain('class="katex"');
    expect(out).not.toContain('`');
    expect(vertexMarkup(vertex('`alpha/beta`'), { math: true })).toContain('class="katex"');
    const size = mathLabelSize('`sum_(i=1)^n i`', 12, false);
    expect(size.height).toBeGreaterThan(12 * 1.2 * 1.5);
    expect(size.width).toBeLessThan(textWidth('`sum_(i=1)^n i`', 12, false));
  });
});
