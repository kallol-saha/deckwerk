/**
 * Math in draw.io labels, typeset with DeckWerk's KaTeX.
 *
 * draw.io typesets labels when the page has math="1" (Extras ▸
 * Mathematical Typesetting): MathJax runs over the label HTML (the
 * foreignObject of each HTML label; plain SVG `<text>` labels are skipped)
 * with its default TeX delimiters, as js/diagramly/Editor.js
 * (Editor.initMath, Editor.containsMath) configures it (jgraph/drawio
 * 32.7.4, Apache-2.0):
 *
 * - `$$…$$` and `\[…\]`: display math;
 * - `\(…\)`: inline math;
 * - `\begin{env}…\end{env}`: display math;
 * - `\$` is a literal dollar, `\\` a literal backslash.
 *
 * The search follows MathJax's FindTeX: math does not cross element
 * boundaries other than `<br>`, a closing delimiter only counts outside
 * braces, and text inside pre, code, textarea, script and style or under
 * class="geDisableMathJax" is left alone. AsciiMath (`` `…` ``, MathJax's
 * AsciiMath input) is converted to TeX (asciimath2tex) and typeset the same way.
 *
 * Everything here is DOM-free: the typeset label is KaTeX's HTML, so the
 * editor, the player, thumbnails, PDF, the CLI and figure export all draw
 * the same markup (they need KaTeX's stylesheet, which the player loads and
 * figure export embeds).
 */

import AsciiMathParser from 'asciimath2tex';
import katex from 'katex';
import { decodeEntities } from './label/html.js';
import { textWidth } from './label/metrics.js';

/** Editor.containsMath: the label has something MathJax would look at. */
export function containsMath(text: string | null | undefined): boolean {
  return text != null && (text.includes('$') || text.includes('\\(') || text.includes('\\[')
    || text.includes('\\begin{') || text.includes('`'));
}

/** One piece of math (or an escaped character) found in a string. */
export interface TexItem {
  /** Offsets in the searched string, delimiters included. */
  start: number;
  end: number;
  /** The TeX without its delimiters (an environment keeps its \begin and \end). */
  tex: string;
  display: boolean;
  /** A `\$` or `\\` escape: `tex` is the character to show. */
  escape?: boolean;
}

function quote(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/** MathJax's tex delimiters as draw.io leaves them (the defaults). */
const INLINE: Array<[string, string]> = [['\\(', '\\)']];
const DISPLAY: Array<[string, string]> = [['$$', '$$'], ['\\[', '\\]']];

interface End { close: string; display: boolean; pattern: () => RegExp }

const ENDS = new Map<string, End>();
for (const [open, close] of INLINE) ENDS.set(open, { close, display: false, pattern: () => endPattern(quote(close)) });
for (const [open, close] of DISPLAY) ENDS.set(open, { close, display: true, pattern: () => endPattern(quote(close)) });

/** FindTeX.endPattern: the close delimiter, a control sequence or a brace. */
function endPattern(close: string): RegExp {
  return new RegExp(`${close}|\\\\(?:[a-zA-Z]|.)|[{}]`, 'g');
}

const STARTS = [...ENDS.keys()].sort((a, b) => b.length - a.length).map(quote).join('|');
/** FindTeX.getPatterns: delimiters | \begin{env} | escapes (refs are not processed). */
const START = new RegExp(`${STARTS}|\\\\begin\\s*\\{([^}]*)\\}|(\\\\[\\\\$])`, 'g');

/** FindTeX.findEnd. */
function findEnd(text: string, start: RegExpExecArray, close: string, pattern: RegExp, display: boolean): TexItem | null {
  const from = start.index + start[0].length;
  pattern.lastIndex = from;
  let braces = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if ((match[1] ?? match[0]) === close && braces === 0) {
      return { start: start.index, end: match.index + match[0].length, tex: text.slice(from, match.index), display };
    }
    if (match[0] === '{') braces++;
    else if (match[0] === '}' && braces) braces--;
  }
  return null;
}

/** FindTeX.findMathInString: the math and escapes in one string, in order. */
export function findTex(text: string): TexItem[] {
  const items: TexItem[] = [];
  const start = new RegExp(START.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = start.exec(text))) {
    let item: TexItem | null;
    if (m[1] !== undefined) {
      const env = m[1];
      const end = new RegExp(`\\\\end\\s*(\\{${quote(env)}\\})|\\\\(?:[a-zA-Z]|.)|[{}]`, 'g');
      item = findEnd(text, m, `{${env}}`, end, true);
      // The environment is the math, \begin and \end included.
      if (item) item = { ...item, tex: text.slice(item.start, item.end) };
    } else if (m[2] !== undefined) {
      item = { start: m.index, end: m.index + 2, tex: m[2].charAt(1), display: false, escape: true };
    } else {
      const end = ENDS.get(m[0])!;
      item = findEnd(text, m, end.close, end.pattern(), end.display);
    }
    if (item) {
      items.push(item);
      start.lastIndex = item.end;
    }
  }
  return items;
}

// --- AsciiMath ------------------------------------------------------------------------

let asciiParser: AsciiMathParser | null = null;

/**
 * AsciiMath as TeX, for KaTeX (asciimath2tex 1.5.0, Apache-2.0, by
 * Christian Lawson-Perfect). MathJax's AsciiMath input sets its formulas in
 * display style (displaystyle: true), so sums and fractions are full size.
 */
export function asciiMathToTex(ascii: string): string {
  asciiParser ??= new AsciiMathParser();
  let tex: string;
  try {
    tex = asciiParser.parse(ascii);
  } catch {
    tex = `\\text{${ascii.replace(/[\\{}]/g, '')}}`;
  }
  return `\\displaystyle ${ordinaryFences(tex)}`;
}

/**
 * Each `\left … \right …` group in braces. asciimath2tex writes every
 * bracket pair as \left/\right, which TeX spaces as an inner atom
 * (`n \left( … \right)` gets a thin space after the n); MathJax's AsciiMath
 * sets them as plain stretchy fences, which the braces (an ordinary atom)
 * match.
 */
function ordinaryFences(tex: string): string {
  const inserts: Array<{ at: number; text: string }> = [];
  const open: number[] = [];
  const token = /\\left(?![a-zA-Z])|\\right(?![a-zA-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(tex))) {
    if (m[0] === '\\left') {
      open.push(m.index);
      continue;
    }
    // The delimiter after \right: a control word, a control symbol or a character.
    const rest = /^\s*(\\[a-zA-Z]+|\\.|.)/.exec(tex.slice(m.index + m[0].length));
    const end = m.index + m[0].length + (rest ? rest[0].length : 0);
    const start = open.pop();
    if (start != null) {
      inserts.push({ at: start, text: '{' }, { at: end, text: '}' });
    }
    token.lastIndex = end;
  }
  let out = tex;
  // From the end; at one place a '}' closing a group comes before a '{' opening the next.
  for (const { at, text } of inserts.sort((a, b) => b.at - a.at || (a.text === '{' ? -1 : 1))) {
    out = out.slice(0, at) + text + out.slice(at);
  }
  return out;
}

/**
 * MathJax's FindAsciiMath with its default delimiters (`` `…` ``), in the
 * stretches of `text` the TeX search left alone (MathJax runs TeX first):
 * each pair of backticks is an inline formula, converted to TeX.
 */
function findAsciiMath(text: string, tex: readonly TexItem[]): TexItem[] {
  const items: TexItem[] = [];
  let from = 0;
  const free = (at: number) => !tex.some((t) => at >= t.start && at < t.end);
  while (from < text.length) {
    const open = text.indexOf('`', from);
    if (open < 0) break;
    if (!free(open)) {
      from = open + 1;
      continue;
    }
    const close = text.indexOf('`', open + 1);
    if (close < 0 || !free(close) || tex.some((t) => t.start > open && t.start < close)) break;
    const source = text.slice(open + 1, close);
    if (source.trim().length > 0) {
      items.push({ start: open, end: close + 1, tex: asciiMathToTex(source), display: false });
    }
    from = close + 1;
  }
  return items;
}

/** All the math in a string: TeX (findTex) and AsciiMath, in order. */
export function findMath(text: string): TexItem[] {
  const tex = findTex(text);
  if (!text.includes('`')) return tex;
  return [...tex, ...findAsciiMath(text, tex)].sort((a, b) => a.start - b.start);
}

// --- typesetting -----------------------------------------------------------------

const cache = new Map<string, string>();
const CACHE_LIMIT = 1000;

/** KaTeX's HTML for one formula (errors are shown in red, as MathJax shows them). */
export function renderTex(tex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${tex}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      output: 'html',
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch (error) {
    html = `<span class="katex-error" style="color:#cc0000">${escapeHtml(tex)}</span>`;
    void error;
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, html);
  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Elements whose text MathJax does not search (skipHtmlTags plus draw.io's own). */
const SKIP = new Set(['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation', 'annotation-xml', 'text']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

type Piece = { raw: string; text: string; br?: boolean };

/** The index after the tag that starts at `i` (a `>` outside quotes). */
function tagEnd(html: string, i: number): number {
  let quoteChar = '';
  for (let j = i + 1; j < html.length; j++) {
    const c = html.charAt(j);
    if (quoteChar) {
      if (c === quoteChar) quoteChar = '';
    } else if (c === '"' || c === '\'') {
      quoteChar = c;
    } else if (c === '>') {
      return j + 1;
    }
  }
  return html.length;
}

/**
 * Typesets the TeX in a label's HTML (already sanitised, line breaks as
 * `<br>`), as MathJax does in draw.io: each run of text between element
 * boundaries (`<br>` belongs to the run, as a line break) is searched, and
 * every formula is replaced by KaTeX's markup. Runs without math are kept
 * byte for byte.
 */
export function typesetLabelMath(html: string): string {
  if (!containsMath(html)) return html;
  const out: string[] = [];
  const stack: Array<{ name: string; skip: boolean }> = [];
  let run: Piece[] = [];
  const skipping = () => stack.length > 0 && stack[stack.length - 1].skip;
  const flush = () => {
    if (run.length === 0) return;
    out.push(skipping() ? run.map((p) => p.raw).join('') : typesetRun(run));
    run = [];
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const textEnd = lt < 0 ? html.length : lt;
    if (textEnd > i) {
      const raw = html.slice(i, textEnd);
      run.push({ raw, text: decodeEntities(raw) });
      i = textEnd;
      continue;
    }
    // A tag, a comment or a stray `<`.
    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      const end = close < 0 ? html.length : close + 3;
      run.push({ raw: html.slice(i, end), text: '' });
      i = end;
      continue;
    }
    const next = html.charAt(i + 1);
    if (!/[A-Za-z/!?]/.test(next)) {
      run.push({ raw: '<', text: '<' });
      i += 1;
      continue;
    }
    const end = tagEnd(html, i);
    const tag = html.slice(i, end);
    i = end;
    const name = (/^<\/?\s*([A-Za-z][^\s/>]*)/.exec(tag)?.[1] ?? '').toLowerCase();
    if (name === 'br' || name === 'wbr') {
      run.push({ raw: tag, text: name === 'br' ? '\n' : '', br: name === 'br' });
      continue;
    }
    flush();
    out.push(tag);
    if (tag.startsWith('</')) {
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
    } else if (!tag.startsWith('<!') && !tag.startsWith('<?') && !VOID.has(name) && !/\/\s*>$/.test(tag)) {
      const cls = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
      const classes = cls ? (cls[1] ?? cls[2] ?? cls[3] ?? '') : '';
      const parentSkip = skipping();
      const process = /(?:^|\s)tex2jax_process(?:\s|$)/.test(classes);
      const ignore = /(?:^|\s)(?:geDisableMathJax|tex2jax_ignore)(?:\s|$)/.test(classes);
      stack.push({ name, skip: SKIP.has(name) || ((parentSkip || ignore) && !process) });
    }
  }
  flush();
  return out.join('');
}

/** One run of text and line breaks, with its formulas typeset. */
function typesetRun(run: Piece[]): string {
  const text = run.map((p) => p.text).join('');
  const items = containsMath(text) ? findMath(text) : [];
  if (items.length === 0) return run.map((p) => p.raw).join('');
  let out = '';
  let at = 0;
  const plain = (s: string) => escapeHtml(s).replace(/\n/g, '<br/>');
  for (const item of items) {
    out += plain(text.slice(at, item.start));
    out += item.escape ? escapeHtml(item.tex) : renderTex(item.tex, item.display);
    at = item.end;
  }
  out += plain(text.slice(at));
  return out;
}

// --- measuring --------------------------------------------------------------------

/** KaTeX's font size relative to the text around it (.katex { font-size: 1.21em }). */
export const KATEX_SCALE = 1.21;

/** KaTeX's \tiny … \Huge size multipliers (size1 … size11). */
const SIZES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.44, 1.728, 2.074, 2.488];

interface TreeNode {
  children?: TreeNode[];
  classes?: string[];
  style?: Record<string, string | undefined>;
  height?: number;
  depth?: number;
  width?: number;
  text?: string;
}

function em(value: string | undefined): number {
  if (!value || !value.endsWith('em')) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Widths KaTeX's stylesheet gives some classes, in em. */
const CLASS_WIDTH: Record<string, number> = { nulldelimiter: 0.12 };

/** The laid-out width of a KaTeX HTML tree node, in em of its own font size. */
function nodeWidth(node: TreeNode, scale: number): number {
  const classes = node.classes ?? [];
  let s = scale;
  if (classes.includes('sizing') || classes.includes('fontsize-ensurer')) {
    const reset = classes.find((c) => c.startsWith('reset-size'));
    const size = classes.find((c) => /^size\d+$/.test(c));
    if (reset && size) s = scale * SIZES[Number(size.slice(4)) - 1] / SIZES[Number(reset.slice(10)) - 1];
  }
  const style = node.style ?? {};
  let width = (em(style.marginLeft) + em(style.marginRight)) * s;
  if (style.width && style.width.endsWith('em')) return width + em(style.width) * s;
  for (const c of classes) if (CLASS_WIDTH[c] != null) width += CLASS_WIDTH[c] * s;
  if (node.text != null && !node.children) return width + (node.width ?? 0) * s;
  const children = node.children ?? [];
  if (classes.includes('pstrut')) return 0;
  // A vlist stacks its rows: as wide as the widest.
  if (classes.some((c) => c === 'vlist-t' || c === 'vlist-r' || c === 'vlist')) {
    return width + Math.max(0, ...children.map((c) => nodeWidth(c, s)));
  }
  for (const child of children) width += nodeWidth(child, s);
  return width;
}

/** Size of one typeset formula in px, for text of `fontSize` px around it. */
export function texSize(tex: string, display: boolean, fontSize: number): { width: number; height: number } {
  const render = (katex as unknown as {
    __renderToHTMLTree?: (expression: string, options: object) => TreeNode;
  }).__renderToHTMLTree;
  let width = tex.length * 0.5;
  let height = 1.2;
  try {
    if (render) {
      const tree = render(tex, { displayMode: display, throwOnError: false, strict: 'ignore' });
      width = nodeWidth(tree, 1);
      height = (tree.height ?? 0.7) + (tree.depth ?? 0.2);
    }
  } catch {
    // An unparsable formula shows as its source.
  }
  const k = KATEX_SCALE * fontSize;
  // A display formula is a block with a 1em margin above and below.
  return { width: width * k, height: height * k + (display ? 2 * fontSize : 0) };
}

/**
 * The size an HTML label takes with its formulas typeset, unwrapped, in px:
 * draw.io measures labels with math after MathJax has typeset them
 * (Editor.js, Graph.getPreferredSizeForCell with Editor.mathOutputSize).
 * Text is measured with label/metrics.ts; lines are at least 1.2 em high.
 */
export function mathLabelSize(text: string, fontSize: number, bold: boolean): { width: number; height: number } {
  const lineHeight = Math.round(fontSize) * 1.2;
  let width = 0;
  let height = 0;
  let lineW = 0;
  let lineH = lineHeight;
  let lineEmpty = true;
  const endLine = (force: boolean) => {
    if (lineEmpty && !force) return;
    width = Math.max(width, lineW);
    height += lineH;
    lineW = 0;
    lineH = lineHeight;
    lineEmpty = true;
  };
  const addText = (s: string) => {
    const lines = s.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) endLine(true);
      if (line.length > 0) {
        lineW += textWidth(line, Math.round(fontSize), bold);
        lineEmpty = false;
      }
    });
  };
  let at = 0;
  for (const item of findMath(text)) {
    addText(text.slice(at, item.start));
    at = item.end;
    if (item.escape) {
      addText(item.tex);
      continue;
    }
    const size = texSize(item.tex, item.display, fontSize);
    if (item.display) {
      endLine(false);
      width = Math.max(width, size.width);
      height += size.height;
    } else {
      lineW += size.width;
      lineH = Math.max(lineH, size.height);
      lineEmpty = false;
    }
  }
  addText(text.slice(at));
  endLine(false);
  return { width, height };
}
