/**
 * A small XML reader and writer for draw.io files, with no DOM, so the CLI
 * and the collab server read `.drawio` the same way the editor does.
 *
 * It reads elements, attributes, text, CDATA and character references, and
 * skips the declaration, comments, processing instructions and DOCTYPE.
 * Namespaces are kept as part of names (`xlink:href`). It is not a
 * validating parser: malformed input throws an XmlError naming the offset.
 */

export interface XmlElement {
  name: string;
  /** Attributes in document order. */
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

export class XmlError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (at character ${offset})`);
    this.name = 'XmlError';
  }
}

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

const NAME_START = /[A-Za-z_:À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-·À-￿]/;

/** Parses a document and returns its root element. */
export function parseXml(source: string): XmlElement {
  let i = 0;
  const n = source.length;
  const fail = (message: string): never => {
    throw new XmlError(message, i);
  };

  const skipWhitespace = (): void => {
    while (i < n && /\s/.test(source[i])) i++;
  };

  const readName = (): string => {
    const start = i;
    if (i >= n || !NAME_START.test(source[i])) fail('Expected a name');
    i++;
    while (i < n && NAME_CHAR.test(source[i])) i++;
    return source.slice(start, i);
  };

  const skipUntil = (terminator: string): void => {
    const at = source.indexOf(terminator, i);
    if (at < 0) fail(`Unterminated construct, expected ${terminator}`);
    i = at + terminator.length;
  };

  /** Skips declarations, comments, PIs and DOCTYPE; true if something was skipped. */
  const skipMisc = (): boolean => {
    if (source.startsWith('<?', i)) {
      skipUntil('?>');
      return true;
    }
    if (source.startsWith('<!--', i)) {
      skipUntil('-->');
      return true;
    }
    if (source.startsWith('<!DOCTYPE', i) || source.startsWith('<!doctype', i)) {
      // DOCTYPE may hold an internal subset in brackets.
      let depth = 0;
      while (i < n) {
        const c = source[i++];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) return true;
      }
      fail('Unterminated DOCTYPE');
    }
    return false;
  };

  const readElement = (): XmlElement => {
    if (source[i] !== '<') fail('Expected <');
    i++;
    const name = readName();
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      if (i >= n) fail(`Unterminated start tag <${name}>`);
      if (source.startsWith('/>', i)) {
        i += 2;
        return { name, attrs, children: [] };
      }
      if (source[i] === '>') {
        i++;
        break;
      }
      const attrName = readName();
      skipWhitespace();
      if (source[i] !== '=') fail(`Expected = after attribute ${attrName}`);
      i++;
      skipWhitespace();
      const quote = source[i];
      if (quote !== '"' && quote !== "'") fail('Expected a quoted attribute value');
      const end = source.indexOf(quote, i + 1);
      if (end < 0) fail('Unterminated attribute value');
      attrs[attrName] = decodeEntities(source.slice(i + 1, end));
      i = end + 1;
    }
    const children: XmlNode[] = [];
    let text = '';
    const flushText = (): void => {
      if (text !== '') children.push(text);
      text = '';
    };
    for (;;) {
      if (i >= n) fail(`Unterminated element <${name}>`);
      if (source[i] === '<') {
        if (source.startsWith('</', i)) {
          flushText();
          i += 2;
          const closing = readName();
          if (closing !== name) fail(`Mismatched </${closing}>, expected </${name}>`);
          skipWhitespace();
          if (source[i] !== '>') fail('Expected >');
          i++;
          // Indentation between child elements is layout, not content.
          const hasElements = children.some((c) => typeof c !== 'string');
          return { name, attrs, children: hasElements ? children.filter((c) => typeof c !== 'string' || c.trim() !== '') : children };
        }
        if (source.startsWith('<![CDATA[', i)) {
          const end = source.indexOf(']]>', i + 9);
          if (end < 0) fail('Unterminated CDATA');
          text += source.slice(i + 9, end);
          i = end + 3;
          continue;
        }
        if (source.startsWith('<!--', i) || source.startsWith('<?', i)) {
          skipMisc();
          continue;
        }
        flushText();
        children.push(readElement());
        continue;
      }
      const next = source.indexOf('<', i);
      const end = next < 0 ? n : next;
      text += decodeEntities(source.slice(i, end));
      i = end;
    }
  };

  // Byte-order mark.
  if (source.charCodeAt(0) === 0xfeff) i = 1;
  for (;;) {
    skipWhitespace();
    if (!skipMisc()) break;
  }
  if (i >= n || source[i] !== '<') fail('No root element');
  return readElement();
}

export function isElement(node: XmlNode | undefined): node is XmlElement {
  return typeof node === 'object' && node != null;
}

export function childElements(el: XmlElement, name?: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => isElement(c) && (name == null || c.name === name));
}

export function firstChild(el: XmlElement, name?: string): XmlElement | null {
  return childElements(el, name)[0] ?? null;
}

export function textContent(el: XmlElement): string {
  return el.children.map((c) => (typeof c === 'string' ? c : textContent(c))).join('');
}

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/\t/g, '&#9;');
}

export function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Writes an element. With `indent`, child elements go on their own lines
 * (as draw.io's pretty output does); text content is never re-indented.
 */
export function serializeXml(el: XmlElement, indent = '', depth = 0): string {
  const pad = indent ? `\n${indent.repeat(depth)}` : '';
  const attrs = Object.entries(el.attrs).map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`).join('');
  if (el.children.length === 0) return `${depth > 0 ? pad : ''}<${el.name}${attrs} />`;
  const onlyElements = el.children.every(isElement);
  const inner = el.children
    .map((c) => (typeof c === 'string' ? escapeXmlText(c) : serializeXml(c, onlyElements ? indent : '', depth + 1)))
    .join('');
  const close = onlyElements && indent ? `${pad}</${el.name}>` : `</${el.name}>`;
  return `${depth > 0 ? pad : ''}<${el.name}${attrs}>${inner}${close}`;
}

export function element(name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement {
  return { name, attrs, children };
}
