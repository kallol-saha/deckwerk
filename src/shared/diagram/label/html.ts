/*
 * Label values for draw.io cells. The rules follow draw.io (jgraph/drawio
 * 32.7.4): js/grapheditor/Graph.js (cellRenderer.getLabelValue: html=1
 * values are sanitised markup, other HTML labels are escaped text;
 * Graph.sanitizeHtml / DOM_PURIFY_CONFIG), mxgraph/src/shape/mxText.js
 * (paint: trailing newlines and line feeds) and
 * mxgraph/src/util/mxUtils.js (htmlEntities, replaceTrailingNewlines).
 * Copyright (c) 2006-2024, JGraph Ltd / draw.io AG, Apache License 2.0.
 * Modified for DeckWerk: draw.io runs DOMPurify in the browser; this is a
 * DOM-free allowlist sanitiser that also writes well-formed XHTML (the
 * markup goes into an SVG string), drops <style>, <svg> and remote URLs,
 * and keeps the inline formatting draw.io's editor writes.
 */

/** mxUtils.htmlEntities(s, false): &, <, >, quotes; newlines kept. */
export function htmlEntities(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\t/g, '&#x9;');
}

/** Escapes text for an XML text node. */
export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes text for a double-quoted XML attribute. Line feeds and tabs are
 * written as references so that they survive XML attribute normalisation
 * and so that a label's line feeds (which become <br/>) only occur in text.
 */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;');
}

/** mxUtils.replaceTrailingNewlines. */
export function replaceTrailingNewlines(str: string, pattern: string): string {
  let postfix = '';
  while (str.length > 0 && str.charAt(str.length - 1) === '\n') {
    str = str.substring(0, str.length - 1);
    postfix += pattern;
  }
  return str + postfix;
}

// --- entities ------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00a0', ensp: '\u2002', emsp: '\u2003',
  thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d', lrm: '\u200e', rlm: '\u200f', shy: '\u00ad',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e',
  laquo: '\u00ab', raquo: '\u00bb', lsaquo: '\u2039', rsaquo: '\u203a', bull: '\u2022', middot: '\u00b7',
  deg: '\u00b0', plusmn: '\u00b1', times: '\u00d7', divide: '\u00f7', minus: '\u2212', micro: '\u00b5',
  para: '\u00b6', sect: '\u00a7', euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2',
  curren: '\u00a4', iexcl: '\u00a1', iquest: '\u00bf', ordf: '\u00aa', ordm: '\u00ba', not: '\u00ac',
  macr: '\u00af', acute: '\u00b4', cedil: '\u00b8', uml: '\u00a8', sup1: '\u00b9', sup2: '\u00b2',
  sup3: '\u00b3', frac14: '\u00bc', frac12: '\u00bd', frac34: '\u00be', dagger: '\u2020', Dagger: '\u2021',
  permil: '\u2030', prime: '\u2032', Prime: '\u2033', larr: '\u2190', uarr: '\u2191', rarr: '\u2192',
  darr: '\u2193', harr: '\u2194', lArr: '\u21d0', uArr: '\u21d1', rArr: '\u21d2', dArr: '\u21d3',
  hArr: '\u21d4', forall: '\u2200', part: '\u2202', exist: '\u2203', empty: '\u2205', nabla: '\u2207',
  isin: '\u2208', notin: '\u2209', ni: '\u220b', prod: '\u220f', sum: '\u2211', lowast: '\u2217',
  radic: '\u221a', prop: '\u221d', infin: '\u221e', ang: '\u2220', and: '\u2227', or: '\u2228',
  cap: '\u2229', cup: '\u222a', int: '\u222b', there4: '\u2234', sim: '\u223c', cong: '\u2245',
  asymp: '\u2248', ne: '\u2260', equiv: '\u2261', le: '\u2264', ge: '\u2265', sub: '\u2282', sup: '\u2283',
  nsub: '\u2284', sube: '\u2286', supe: '\u2287', oplus: '\u2295', otimes: '\u2297', perp: '\u22a5',
  sdot: '\u22c5', loz: '\u25ca', spades: '\u2660', clubs: '\u2663', hearts: '\u2665', diams: '\u2666',
  check: '\u2713', cross: '\u2717', star: '\u2606', starf: '\u2605',
  Agrave: '\u00c0', Aacute: '\u00c1', Acirc: '\u00c2', Atilde: '\u00c3', Auml: '\u00c4', Aring: '\u00c5',
  AElig: '\u00c6', Ccedil: '\u00c7', Egrave: '\u00c8', Eacute: '\u00c9', Ecirc: '\u00ca', Euml: '\u00cb',
  Igrave: '\u00cc', Iacute: '\u00cd', Icirc: '\u00ce', Iuml: '\u00cf', ETH: '\u00d0', Ntilde: '\u00d1',
  Ograve: '\u00d2', Oacute: '\u00d3', Ocirc: '\u00d4', Otilde: '\u00d5', Ouml: '\u00d6', Oslash: '\u00d8',
  Ugrave: '\u00d9', Uacute: '\u00da', Ucirc: '\u00db', Uuml: '\u00dc', Yacute: '\u00dd', THORN: '\u00de',
  szlig: '\u00df', agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2', atilde: '\u00e3', auml: '\u00e4',
  aring: '\u00e5', aelig: '\u00e6', ccedil: '\u00e7', egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea',
  euml: '\u00eb', igrave: '\u00ec', iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef', eth: '\u00f0',
  ntilde: '\u00f1', ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4', otilde: '\u00f5', ouml: '\u00f6',
  oslash: '\u00f8', ugrave: '\u00f9', uacute: '\u00fa', ucirc: '\u00fb', uuml: '\u00fc', yacute: '\u00fd',
  thorn: '\u00fe', yuml: '\u00ff', OElig: '\u0152', oelig: '\u0153', Scaron: '\u0160', scaron: '\u0161',
  Yuml: '\u0178', fnof: '\u0192', circ: '\u02c6', tilde: '\u02dc',
  Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393', Delta: '\u0394', Epsilon: '\u0395', Zeta: '\u0396',
  Eta: '\u0397', Theta: '\u0398', Iota: '\u0399', Kappa: '\u039a', Lambda: '\u039b', Mu: '\u039c',
  Nu: '\u039d', Xi: '\u039e', Omicron: '\u039f', Pi: '\u03a0', Rho: '\u03a1', Sigma: '\u03a3', Tau: '\u03a4',
  Upsilon: '\u03a5', Phi: '\u03a6', Chi: '\u03a7', Psi: '\u03a8', Omega: '\u03a9', alpha: '\u03b1',
  beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', epsilon: '\u03b5', zeta: '\u03b6', eta: '\u03b7',
  theta: '\u03b8', iota: '\u03b9', kappa: '\u03ba', lambda: '\u03bb', mu: '\u03bc', nu: '\u03bd',
  xi: '\u03be', omicron: '\u03bf', pi: '\u03c0', rho: '\u03c1', sigmaf: '\u03c2', sigma: '\u03c3',
  tau: '\u03c4', upsilon: '\u03c5', phi: '\u03c6', chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
  thetasym: '\u03d1', piv: '\u03d6',
};

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\ufffd';
  return String.fromCodePoint(n);
}

/**
 * Decodes character references the way an HTML parser does for the
 * common cases: numeric references and the named entities above (with or
 * without the semicolon for the classic ones). Unknown names stay as text.
 */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/g, (match, body: string) => {
    if (body.charAt(0) === '#') {
      const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
      return codePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const named = Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : null;
    if (named == null) return match;
    // Without `;` only the legacy entities are recognised (as HTML does).
    if (!match.endsWith(';') && !/^(amp|lt|gt|quot|nbsp|copy|reg)$/.test(body)) return match;
    return named;
  });
}

// --- tokenizer ---------------------------------------------------------------------

export interface StartTag {
  type: 'start';
  name: string;
  attrs: Array<[string, string]>;
  selfClosing: boolean;
}

export type Token =
  | { type: 'text'; text: string }
  | StartTag
  | { type: 'end'; name: string };

/** Elements whose content is raw text up to their end tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);

/**
 * A small HTML tokenizer: text, start tags with attributes, end tags.
 * Comments, doctypes and processing instructions are dropped. Raw-text
 * elements (script, style, …) run to their end tag as a browser reads them,
 * so markup inside them never becomes elements.
 */
export function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let text = '';
  const flush = () => {
    if (text) tokens.push({ type: 'text', text: decodeEntities(text) });
    text = '';
  };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    i = lt;
    const next = html.charAt(i + 1);
    if (html.startsWith('<!--', i)) {
      flush();
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      flush();
      const end = html.indexOf('>', i + 2);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    if (next === '/') {
      const m = /^<\/([A-Za-z][^\s/>]*)[^>]*>?/.exec(html.slice(i));
      if (m) {
        flush();
        tokens.push({ type: 'end', name: m[1].toLowerCase() });
        i += m[0].length;
      } else if (html.charAt(i + 2) === '>') {
        // `</>` is dropped.
        i += 3;
      } else if (i + 2 >= html.length) {
        text += '</';
        i = html.length;
      } else {
        // `</` and no name: a bogus comment up to `>`.
        flush();
        const end = html.indexOf('>', i + 2);
        i = end < 0 ? html.length : end + 1;
      }
      continue;
    }
    if (!/[A-Za-z]/.test(next)) {
      text += '<';
      i += 1;
      continue;
    }
    flush();
    const tag = readStartTag(html, i);
    i = tag.end;
    tokens.push(tag.token);
    if (RAW_TEXT.has(tag.token.name)) {
      // A browser ignores `/>` here: the content still runs to the end tag.
      tag.token.selfClosing = false;
      const close = new RegExp(`</${tag.token.name}(?=[\\s/>]|$)`, 'i');
      const rest = html.slice(i);
      const m = close.exec(rest);
      const content = m ? rest.slice(0, m.index) : rest;
      if (content) tokens.push({ type: 'text', text: content });
      if (m) {
        const gt = html.indexOf('>', i + m.index);
        i = gt < 0 ? html.length : gt + 1;
        tokens.push({ type: 'end', name: tag.token.name });
      } else {
        i = html.length;
      }
    }
  }
  flush();
  return tokens;
}

function readStartTag(html: string, start: number): { token: StartTag; end: number } {
  let i = start + 1;
  let name = '';
  while (i < html.length && !/[\s/>]/.test(html.charAt(i))) name += html.charAt(i++);
  const attrs: Array<[string, string]> = [];
  let selfClosing = false;
  while (i < html.length) {
    while (i < html.length && /\s/.test(html.charAt(i))) i++;
    const c = html.charAt(i);
    if (c === '>') { i++; break; }
    if (c === '/') {
      i++;
      if (html.charAt(i) === '>') { selfClosing = true; i++; break; }
      continue;
    }
    if (i >= html.length) break;
    let attrName = '';
    while (i < html.length && (attrName === '' || !/[\s/>=]/.test(html.charAt(i)))) attrName += html.charAt(i++);
    while (i < html.length && /\s/.test(html.charAt(i))) i++;
    let value = '';
    if (html.charAt(i) === '=') {
      i++;
      while (i < html.length && /\s/.test(html.charAt(i))) i++;
      const quote = html.charAt(i);
      if (quote === '"' || quote === '\'') {
        const end = html.indexOf(quote, i + 1);
        value = html.slice(i + 1, end < 0 ? html.length : end);
        i = end < 0 ? html.length : end + 1;
      } else {
        while (i < html.length && !/[\s>]/.test(html.charAt(i))) value += html.charAt(i++);
      }
    }
    const lower = attrName.toLowerCase();
    if (!attrs.some(([n]) => n === lower)) attrs.push([lower, decodeEntities(value)]);
  }
  return { token: { type: 'start', name: name.toLowerCase(), attrs, selfClosing }, end: i };
}

// --- sanitiser -----------------------------------------------------------------------

/** Elements kept (with allowed attributes). */
const ALLOWED = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col',
  'colgroup', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby',
  's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'tt', 'u', 'ul', 'var', 'wbr', 'section', 'article', 'header', 'footer', 'aside', 'nav',
  'main', 'address', 'label', 'details', 'summary', 'time', 'data',
]);

/** Elements removed together with their content. */
const DROPPED = new Set([
  'script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext',
  'object', 'embed', 'applet', 'template', 'svg', 'math', 'select', 'button', 'input', 'video', 'audio',
  'canvas', 'map', 'head', 'link', 'meta', 'base', 'frame', 'frameset', 'param', 'source', 'track',
  'option', 'optgroup', 'datalist', 'output', 'progress', 'meter', 'dialog', 'portal', 'slot',
]);

const VOID = new Set(['br', 'col', 'hr', 'img', 'wbr']);

const GLOBAL_ATTRS = new Set(['style', 'title', 'dir', 'lang', 'align', 'valign']);
const ELEMENT_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  font: new Set(['color', 'face', 'size']),
  img: new Set(['src', 'alt', 'width', 'height', 'border']),
  table: new Set(['width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'frame', 'rules']),
  td: new Set(['width', 'height', 'colspan', 'rowspan', 'bgcolor', 'nowrap']),
  th: new Set(['width', 'height', 'colspan', 'rowspan', 'bgcolor', 'nowrap', 'scope']),
  tr: new Set(['height', 'bgcolor']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  ol: new Set(['start', 'type', 'reversed']),
  ul: new Set(['type']),
  li: new Set(['value', 'type']),
  hr: new Set(['size', 'width', 'noshade', 'color']),
  div: new Set(['contenteditable']),
  q: new Set(['cite']),
  blockquote: new Set(['cite']),
  time: new Set(['datetime']),
  data: new Set(['value']),
  details: new Set(['open']),
};

/** Strips characters a URL parser ignores before reading the scheme. */
function urlScheme(value: string): string {
  return value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
}

function safeHref(value: string): boolean {
  const v = urlScheme(value);
  return /^(https?:|mailto:|tel:|#)/.test(v) || !/^[a-z][a-z0-9+.-]*:/.test(v);
}

function safeImageSrc(value: string): boolean {
  return /^data:image\/(png|gif|jpe?g|webp|bmp|svg\+xml)[;,]/.test(urlScheme(value));
}

/**
 * Keeps CSS declarations that cannot run code or fetch: no url() except
 * data: images, no expression(), behaviors, bindings, imports or escapes.
 */
export function sanitizeCss(css: string): string {
  const out: string[] = [];
  for (const raw of css.split(';')) {
    const decl = raw.trim();
    if (!decl) continue;
    const colon = decl.indexOf(':');
    if (colon <= 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (!/^-?[a-z][a-z0-9-]*$/.test(prop)) continue;
    if (/[\\<>{}]|\/\*|@import|expression\s*\(|javascript:|vbscript:|-moz-binding|behavior/i.test(value)) continue;
    if (prop === 'behavior' || prop === '-moz-binding') continue;
    let unsafeUrl = false;
    for (const m of value.matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
      if (!safeImageSrc(m[2])) unsafeUrl = true;
    }
    if (unsafeUrl || (/url\s*\(/i.test(value) && !/url\s*\(\s*(['"]?)data:image\//i.test(value))) continue;
    if (prop === 'position' && /fixed|sticky/i.test(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

function cleanAttrs(name: string, attrs: Array<[string, string]>): Array<[string, string]> {
  const own = ELEMENT_ATTRS[name];
  const kept: Array<[string, string]> = [];
  for (const [attr, value] of attrs) {
    if (attr.startsWith('on')) continue;
    if (!GLOBAL_ATTRS.has(attr) && !(own && own.has(attr))) continue;
    if (attr === 'style') {
      const css = sanitizeCss(value);
      if (css) kept.push([attr, css]);
      continue;
    }
    if (attr === 'href' || attr === 'cite') {
      if (safeHref(value)) kept.push([attr, value]);
      continue;
    }
    if (attr === 'src') {
      if (safeImageSrc(value)) kept.push([attr, value]);
      continue;
    }
    if (attr === 'target') {
      kept.push([attr, value === '_self' ? '_self' : '_blank']);
      continue;
    }
    if (attr === 'contenteditable') continue;
    if (/[<>]|javascript:|expression\s*\(/i.test(value)) continue;
    kept.push([attr, value]);
  }
  if (name === 'a' && kept.some(([n]) => n === 'target') && !kept.some(([n]) => n === 'rel')) {
    kept.push(['rel', 'noopener noreferrer']);
  }
  return kept;
}

/**
 * Sanitised, well-formed (XHTML) markup for an html=1 label value: the
 * formatting draw.io's editor writes (b, i, u, font, span/div with inline
 * styles, lists, tables, links, headings, sub/sup, line breaks) is kept;
 * scripts, event handlers, styles sheets, embedded documents, forms and
 * remote URLs are removed; unknown elements are unwrapped.
 */
export function sanitizeLabelHtml(html: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let dropDepth = 0;
  let dropName = '';
  for (const token of tokenize(html)) {
    if (dropDepth > 0) {
      if (token.type === 'start' && token.name === dropName && !token.selfClosing) dropDepth += 1;
      else if (token.type === 'end' && token.name === dropName) dropDepth -= 1;
      continue;
    }
    if (token.type === 'text') {
      out.push(escapeText(token.text));
    } else if (token.type === 'start') {
      if (DROPPED.has(token.name)) {
        if (!token.selfClosing && !VOID_HTML.has(token.name)) {
          dropDepth = 1;
          dropName = token.name;
        }
        continue;
      }
      if (!ALLOWED.has(token.name)) continue;
      closeImplied(token.name, open, out);
      const attrs = cleanAttrs(token.name, token.attrs)
        .map(([n, v]) => ` ${n}="${escapeAttr(v)}"`).join('');
      if (VOID.has(token.name)) {
        out.push(`<${token.name}${attrs}/>`);
      } else {
        out.push(`<${token.name}${attrs}>`);
        open.push(token.name);
      }
    } else {
      if (!ALLOWED.has(token.name) || VOID.has(token.name)) {
        // `</br>` is a line break in HTML.
        if (token.name === 'br') out.push('<br/>');
        continue;
      }
      const at = open.lastIndexOf(token.name);
      if (at < 0) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
    }
  }
  while (open.length > 0) out.push(`</${open.pop()}>`);
  return out.join('');
}

/** Elements whose start closes an open <p> (the HTML parser's rule). */
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'center', 'details', 'div', 'dl', 'figcaption', 'figure',
  'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'summary', 'table', 'ul',
]);

/** Closes the outermost open element of `names` below the nearest `scope` element. */
function closeOpen(names: Set<string>, scope: Set<string>, open: string[], out: string[]): void {
  let at = -1;
  for (let i = open.length - 1; i >= 0 && !scope.has(open[i]); i--) {
    if (names.has(open[i])) at = i;
  }
  if (at >= 0) while (open.length > at) out.push(`</${open.pop()}>`);
}

const P = new Set(['p']);
const LI = new Set(['li']);
const DT_DD = new Set(['dt', 'dd']);
const CELL = new Set(['td', 'th']);
const ROW = new Set(['tr', 'td', 'th']);
const BUTTON_SCOPE = new Set(['table', 'td', 'th', 'caption', 'button']);
const LIST_SCOPE = new Set(['ul', 'ol', 'table', 'td', 'th']);
const DL_SCOPE = new Set(['dl', 'table', 'td', 'th']);
const ROW_SCOPE = new Set(['table', 'tbody', 'thead', 'tfoot']);
const CELL_SCOPE = new Set(['tr', 'table']);

/**
 * The end tags an HTML parser implies before a start tag (an open <p>
 * before a block, an open <li> before the next <li>, table rows and
 * cells), so the XHTML written here has the structure a browser builds
 * from the same markup.
 */
function closeImplied(name: string, open: string[], out: string[]): void {
  if (CLOSES_P.has(name)) closeOpen(P, BUTTON_SCOPE, open, out);
  if (name === 'li') closeOpen(LI, LIST_SCOPE, open, out);
  else if (name === 'dt' || name === 'dd') closeOpen(DT_DD, DL_SCOPE, open, out);
  else if (name === 'tr') closeOpen(ROW, ROW_SCOPE, open, out);
  else if (name === 'td' || name === 'th') closeOpen(CELL, CELL_SCOPE, open, out);
  else if (name === 'tbody' || name === 'thead' || name === 'tfoot') {
    closeOpen(new Set(['tbody', 'thead', 'tfoot', 'tr', 'td', 'th']), new Set(['table']), open, out);
  }
}

/** HTML void elements (never have content or an end tag). */
export const VOID_HTML = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'frame', 'keygen']);

/** Block-level elements: their edges are line breaks in plain text. */
export const BLOCKS = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'center', 'dd', 'details', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul',
]);

/** The text an HTML label shows, with line breaks for <br> and block edges. */
export function htmlToText(html: string): string {
  let out = '';
  let pre = 0;
  let dropDepth = 0;
  let dropName = '';
  const newline = () => {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n';
  };
  for (const token of tokenize(html)) {
    if (dropDepth > 0) {
      if (token.type === 'start' && token.name === dropName && !token.selfClosing) dropDepth += 1;
      else if (token.type === 'end' && token.name === dropName) dropDepth -= 1;
      continue;
    }
    if (token.type === 'text') {
      out += pre > 0 ? token.text : token.text.replace(/[ \t\n\r\f]+/g, ' ');
    } else if (token.type === 'start') {
      if (DROPPED.has(token.name)) {
        if (!token.selfClosing && !VOID_HTML.has(token.name)) {
          dropDepth = 1;
          dropName = token.name;
        }
        continue;
      }
      if (token.name === 'br') out += '\n';
      else if (token.name === 'td' || token.name === 'th') out += out.endsWith('\n') || out === '' ? '' : '\t';
      else if (BLOCKS.has(token.name)) newline();
      if (token.name === 'pre') pre += 1;
    } else {
      if (token.name === 'pre') pre = Math.max(0, pre - 1);
      if (BLOCKS.has(token.name)) newline();
    }
  }
  return out.split('\n').map((line) => line.replace(/^ +| +$/g, '')).join('\n')
    .replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
}
