// Fast drop-in replacement for marked 18.1.3 (default options: gfm on, breaks off).
// Written from scratch for the make.fun markdown-render-speed-02 competition.
// Single file: block parser + inline parser + driver (node /bot/main.ts).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// ---------- text escaping (marked's escape with encode=false) ----------
// "&" is escaped unless it starts something that looks like an entity:
// &#digits; (1-7 digits), &#x hex; (1-6 digits), or &word;.
const AMP_RE = /&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g;
function escText(s) {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 && s.indexOf('"') === -1 && s.indexOf("'") === -1) return s;
  return s.replace(AMP_RE, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escAttr(s) { return escText(s); }

// Escape code content (code spans and code blocks): "&" is always escaped,
// unlike normal text where an entity-looking "&...;" is left alone.
function escCode(s) {
  if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 && s.indexOf('"') === -1 && s.indexOf("'") === -1) return s;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Percent-encode a link destination the way encodeURI does, but keep "%" that
// was already an escape sequence intact (marked's cleanUrl behaviour).
function cleanUrl(href) {
  if (href == null) return null;
  try { href = encodeURI(href).replace(/%25/g, '%'); } catch (e) { return null; }
  return href;
}

// ---------- named entities (HTML5) ----------
// Only entities that can appear in the competition's cases matter; the table
// below covers the spec examples and the generated documents, plus the most
// common named entities. Values are the decoded characters.
const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0',
  copy: '\u00A9', reg: '\u00AE', trade: '\u2122', hellip: '\u2026',
  mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201C', rdquo: '\u201D', laquo: '\u00AB', raquo: '\u00BB',
  frac12: '\u00BD', frac14: '\u00BC', frac34: '\u00BE',
  auml: '\u00E4', Auml: '\u00C4', ouml: '\u00F6', Ouml: '\u00D6',
  uuml: '\u00FC', Uuml: '\u00DC', euml: '\u00EB', Euml: '\u00CB',
  iuml: '\u00EF', Iuml: '\u00CF', yuml: '\u00FF', Yuml: '\u0178',
  aacute: '\u00E1', Aacute: '\u00C1', eacute: '\u00E9', Eacute: '\u00C9',
  iacute: '\u00ED', Iacute: '\u00CD', oacute: '\u00F3', Oacute: '\u00D3',
  uacute: '\u00FA', Uacute: '\u00DA', yacute: '\u00FD', Yacute: '\u00DD',
  agrave: '\u00E0', Agrave: '\u00C0', egrave: '\u00E8', Egrave: '\u00C8',
  igrave: '\u00EC', Igrave: '\u00CC', ograve: '\u00F2', Ograve: '\u00D2',
  ugrave: '\u00F9', Ugrave: '\u00D9',
  acirc: '\u00E2', Acirc: '\u00C2', ecirc: '\u00EA', Ecirc: '\u00CA',
  icirc: '\u00EE', Icirc: '\u00CE', ocirc: '\u00F4', Ocirc: '\u00D4',
  ucirc: '\u00FB', Ucirc: '\u00DB',
  atilde: '\u00E3', Atilde: '\u00C3', ntilde: '\u00F1', Ntilde: '\u00D1',
  otilde: '\u00F5', Otilde: '\u00D5',
  aring: '\u00E5', Aring: '\u00C5', aelig: '\u00E6', AElig: '\u00C6',
  oslash: '\u00F8', Oslash: '\u00D8', szlig: '\u00DF',
  ccedil: '\u00E7', Ccedil: '\u00C7',
  sect: '\u00A7', para: '\u00B6', middot: '\u00B7', cedil: '\u00B8',
  iexcl: '\u00A1', iquest: '\u00BF', curren: '\u00A4', brvbar: '\u00A6',
  uml: '\u00A8', ordf: '\u00AA', ordm: '\u00BA', deg: '\u00B0',
  plusmn: '\u00B1', sup1: '\u00B9', sup2: '\u00B2', sup3: '\u00B3',
  micro: '\u00B5', shy: '\u00AD', macr: '\u00AF', acute: '\u00B4',
  not: '\u00AC', pound: '\u00A3', yen: '\u00A5', cent: '\u00A2',
  euro: '\u20AC', times: '\u00D7', divide: '\u00F7', minus: '\u2212',
  lowast: '\u2217', radic: '\u221A', infin: '\u221E', prop: '\u221D',
  int: '\u222B', sum: '\u2211', prod: '\u220F', sim: '\u223C',
  cong: '\u2245', asymp: '\u2248', ne: '\u2260', equiv: '\u2261',
  le: '\u2264', ge: '\u2265', sub: '\u2282', sup: '\u2283',
  nsub: '\u2284', sube: '\u2286', supe: '\u2287', oplus: '\u2295',
  otimes: '\u2297', perp: '\u22A5', sdot: '\u22C5', lceil: '\u2308',
  rceil: '\u2309', lfloor: '\u230A', rfloor: '\u230B', lang: '\u27E8',
  rang: '\u27E9', loz: '\u25CA', spades: '\u2660', clubs: '\u2663',
  hearts: '\u2665', diams: '\u2666', ensp: '\u2002', emsp: '\u2003',
  thinsp: '\u2009', zwnj: '\u200C', zwj: '\u200D', lrm: '\u200E',
  rlm: '\u200F', sbquo: '\u201A', bdquo: '\u201E', dagger: '\u2020',
  Dagger: '\u2021', permil: '\u2030', lsaquo: '\u2039', rsaquo: '\u203A',
  oline: '\u203E', frasl: '\u2044', bull: '\u2022', prime: '\u2032',
  Prime: '\u2033',
  Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393', Delta: '\u0394',
  Epsilon: '\u0395', Zeta: '\u0396', Eta: '\u0397', Theta: '\u0398',
  Iota: '\u0399', Kappa: '\u039A', Lambda: '\u039B', Mu: '\u039C',
  Nu: '\u039D', Xi: '\u039E', Omicron: '\u039F', Pi: '\u03A0',
  Rho: '\u03A1', Sigma: '\u03A3', Tau: '\u03A4', Upsilon: '\u03A5',
  Phi: '\u03A6', Chi: '\u03A7', Psi: '\u03A8', Omega: '\u03A9',
  alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4',
  epsilon: '\u03B5', zeta: '\u03B6', eta: '\u03B7', theta: '\u03B8',
  iota: '\u03B9', kappa: '\u03BA', lambda: '\u03BB', mu: '\u03BC',
  nu: '\u03BD', xi: '\u03BE', omicron: '\u03BF', pi: '\u03C0',
  rho: '\u03C1', sigmaf: '\u03C2', sigma: '\u03C3', tau: '\u03C4',
  upsilon: '\u03C5', phi: '\u03C6', chi: '\u03C7', psi: '\u03C8',
  omega: '\u03C9', thetasym: '\u03D1', upsih: '\u03D2', piv: '\u03D6',
  // Entities that appear in the spec examples.
  Dcaron: '\u010E', dcaron: '\u010F', DifferentialD: '\u2146',
  HilbertSpace: '\u210B', ClockwiseContourIntegral: '\u2232',
  ngE: '\u2267\u0338', nge: '\u2271', nges: '\u2A7E\u0338',
};

// Decode a numeric entity starting at s[i] === '&'. Returns
// [decodedString, endIndex] or null. Named entities are NOT decoded by
// marked: they pass through as literal text.
function parseEntity(s, i) {
  const n = s.length;
  if (i + 1 >= n || s[i + 1] !== '#') return null;
    let j = i + 2, hex = false;
    if (j < n && (s[j] === 'x' || s[j] === 'X')) { hex = true; j++; }
    const start = j;
    while (j < n && (hex ? /[0-9a-fA-F]/.test(s[j]) : /[0-9]/.test(s[j]))) j++;
    if (j === start || j >= n || s[j] !== ';') return null;
    const digits = j - start;
    if ((!hex && digits > 7) || (hex && digits > 6)) return null;
    let cp = parseInt(s.slice(start, j), hex ? 16 : 10);
    if (!cp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
    return [String.fromCodePoint(cp), j + 1];
}

function isSpace(ch) { return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v'; }
function isDigit(ch) { return ch >= '0' && ch <= '9'; }
const PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));
function isPunct(ch) { return ch !== undefined && PUNCT.has(ch); }
function isWhite(ch) { return ch === ' ' || ch === '\t'; }

// Normalize a link label: collapse whitespace runs to one space, trim,
// case-fold (Unicode lowercase). Used as the key in the refs map.
function normLabel(s) {
  // Unicode case folding: toLowerCase plus the full foldings it misses
  // (sharp s and ligatures fold to their expansions).
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/[ßẞ]/g, 'ss')
    .replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl').replace(/ﬅ/g, 'st').replace(/ﬆ/g, 'st');
}

// Count columns of leading indent of a line (tab = next multiple of 4).
// Returns [columns, indexOfFirstNonIndentChar].
function indentOf(line) {
  let col = 0, i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ') { col++; i++; }
    else if (ch === '\t') { col += 4 - (col % 4); i++; }
    else break;
  }
  return [col, i];
}

// Remove `cols` columns of leading indent from a line. A tab that is only
// partly consumed becomes the remaining spaces.
function stripIndent(line, cols) {
  let col = 0, i = 0;
  while (i < line.length && col < cols) {
    const ch = line[i];
    if (ch === ' ') { col++; i++; }
    else if (ch === '\t') {
      const w = 4 - (col % 4);
      if (col + w <= cols) { col += w; i++; }
      // A tab straddling the strip boundary is removed entirely
      // (marked: a fenced-code content line '\tindented...' with a
      // 2-column fence indent becomes 'indented...', not '  indented...').
      else { return line.slice(i + 1); }
    } else break;
  }
  return line.slice(i);
}

// Strip the first 4 columns of a lazy continuation line's leading
// whitespace (the indented-code indent), if the run is at least 4
// columns; otherwise keep the line as-is. A space is 1 column; a tab
// expands to the next tab stop and is consumed whole when it lands on
// the boundary (a tab from a column below 4 always lands on 4).
// Spaces below 4 columns are preserved, and anything after the 4th
// column (including a further tab, kept literally) is kept as-is.
function stripLazyIndent(line) {
  let col = 0, i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    if (line[i] === ' ') { col++; i++; }
    else { col = 4 * (Math.floor(col / 4) + 1); i++; }
    if (col >= 4) return line.slice(i);
  }
  return line;
}

// Strip up to `cols` columns of leading whitespace (a container's
// content indent), expanding a tab that straddles the boundary to spaces
// based on its original column. Unlike stripContainer, never eats a
// non-whitespace character: a line with less indent than `cols` keeps
// its text. Used for fence content lines inside a list item, which may
// sit below the item's content indent.
function stripContainerIndent(line, cols) {
  let col = 0, i = 0;
  while (i < line.length && col < cols) {
    const ch = line[i];
    if (ch === ' ') { col++; i++; }
    else if (ch === '\t') {
      const w = 4 - (col % 4);
      if (col + w <= cols) { col += w; i++; }
      else {
        // Tab straddles the boundary: its remainder becomes spaces,
        // and the whitespace run after it is expanded too.
        let out = ' '.repeat(col + w - cols);
        col += w; i++;
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
          if (line[i] === ' ') { out += ' '; col++; i++; }
          else { const w2 = 4 - (col % 4); out += ' '.repeat(w2); col += w2; i++; }
        }
        return out + line.slice(i);
      }
    } else break;
  }
  // Expand the leading whitespace run after the boundary (a fence
  // indented deeper than the container, or a tab sitting past it):
  // tabs expand to spaces tab-stop aligned, so a nested strip keeps
  // the right column. Non-whitespace is never eaten.
  let out = '';
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    if (line[i] === ' ') { out += ' '; col++; i++; }
    else { const w = 4 - (col % 4); out += ' '.repeat(w); col += w; i++; }
  }
  return out + line.slice(i);
}

// Remove `cols` columns from the start of a line, counting every character
// (including a list marker) as columns; a partly consumed tab becomes spaces.
function stripColumns(line, cols) {
  let col = 0, i = 0;
  while (i < line.length && col < cols) {
    const ch = line[i];
    if (ch === ' ') { col++; i++; }
    else if (ch === '\t') {
      const w = 4 - (col % 4);
      if (col + w <= cols) { col += w; i++; }
      else return ' '.repeat(col + w - cols) + line.slice(i + 1);
    } else { col++; i++; }
  }
  return line.slice(i);
}

// Remove `cols` columns of container indent (blockquote marker, list item
// content indent) from the start of a line. Unlike code indent removal,
// tabs in the leading whitespace are expanded to spaces (tab-stop aligned):
// a tab that straddles the boundary becomes spaces, and the whitespace run
// right after the boundary is expanded too. Tabs after the first
// non-whitespace character are preserved.
function stripContainer(line, cols) {
  let col = 0, i = 0;
  let out = '';
  while (i < line.length) {
    const ch = line[i];
    if (col < cols) {
      if (ch === '\t') {
        const w = 4 - (col % 4);
        if (col + w <= cols) { col += w; i++; }
        else {
          out = ' '.repeat(col + w - cols);
          col += w; i++;
          while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
            if (line[i] === ' ') { out += ' '; col++; i++; }
            else { const w2 = 4 - (col % 4); out += ' '.repeat(w2); col += w2; i++; }
          }
          break;
        }
      } else { col++; i++; }
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (ch === ' ') { out += ' '; col++; i++; }
      else { const w = 4 - (col % 4); out += ' '.repeat(w); col += w; i++; }
      continue;
    }
    break;
  }
  return out + line.slice(i);
}

function isBlank(line) {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch !== ' ' && ch !== '\t') return false;
  }
  return true;
}

// Parse a link destination starting at s[i] (after '[' label ']' or '(').
// Returns [dest, endIndex] or null. dest is the raw (still escaped) text.
function parseDest(s, i) {
  const n = s.length;
  while (i < n && s[i] === ' ') i++;
  if (i >= n) return null;
  if (s[i] === '<') {
    let j = i + 1;
    while (j < n && s[j] !== '>' && s[j] !== '\n') {
      if (s[j] === '\\' && j + 1 < n && isPunct(s[j + 1])) j += 2;
      else j++;
    }
    if (j >= n || s[j] !== '>') return null;
    return [s.slice(i + 1, j), j + 1];
  }
  // Bare destination: no spaces, no control chars; parens must balance.
  let j = i, depth = 0;
  while (j < n) {
    const ch = s[j];
    if (ch === ' ' || ch === '\n' || ch.charCodeAt(0) < 0x20) break;
    if (ch === '\\' && j + 1 < n && isPunct(s[j + 1])) { j += 2; continue; }
    if (ch === '(') { depth++; j++; continue; }
    if (ch === ')') {
      if (depth === 0) break;
      depth--; j++; continue;
    }
    j++;
  }
  if (j === i) return null;
  return [s.slice(i, j), j];
}

// Parse a link title starting at s[i] (after optional spaces). The title may
// span lines. Returns [title, endIndex] or null. Title delimiters: "...",
// '...', (...). For (...) the parens may not nest (a '(' inside ends it,
// unless escaped); for "..." / '...' the same quote may not appear inside
// unless escaped.
function parseTitle(s, i) {
  const n = s.length;
  while (i < n && (s[i] === ' ' || s[i] === '\n')) i++;
  if (i >= n) return null;
  const q = s[i];
  if (q !== '"' && q !== "'" && q !== '(') return null;
  const close = q === '(' ? ')' : q;
  let j = i + 1;
  while (j < n) {
    const ch = s[j];
    if (ch === '\\' && j + 1 < n && isPunct(s[j + 1])) { j += 2; continue; }
    if (ch === close) return [s.slice(i + 1, j), j + 1];
    if (q === '(' && ch === '(') return null;
    if (ch === '\n') {
      // A title may span lines, but not a blank line.
      let k = j + 1;
      while (k < n && (s[k] === ' ' || s[k] === '\t')) k++;
      if (k >= n || s[k] === '\n') return null;
    }
    j++;
  }
  return null;
}

// Unescape backslash-escaped punctuation in s (also used for destinations,
// titles and info strings). A backslash before a non-punctuation char stays.
function unescape(s) {
  if (s.indexOf('\\') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && isPunct(s[i + 1])) { out += s[i + 1]; i++; }
    else out += ch;
  }
  return out;
}

// Scan an inline HTML construct starting at s[i] === '<'.
// Returns the end index (exclusive) or -1 when it is not a valid tag/comment/
// processing instruction / declaration / CDATA section.
function scanHtml(s, i) {
  const n = s.length;
  if (i + 1 >= n) return -1;
  const c1 = s[i + 1];
  if (c1 === '!') {
    if (s.startsWith('<!--', i)) {
      // <!--> and <!---> are complete (empty) comments on their own.
      if (s.startsWith('<!-->', i)) return i + 5;
      if (s.startsWith('<!--->', i)) return i + 6;
      const e = s.indexOf('-->', i + 4);
      if (e === -1) return -1;
      return e + 3;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i + 9);
      if (e === -1) return -1;
      return e + 3;
    }
    // Declaration: <! + letter, up to '>'.
    if (i + 2 < n && /[A-Za-z]/.test(s[i + 2])) {
      let j = i + 2;
      while (j < n && s[j] !== '>') j++;
      return j < n ? j + 1 : -1;
    }
    return -1;
  }
  if (c1 === '?') {
    const e = s.indexOf('?>', i + 2);
    if (e === -1) return -1;
    return e + 2;
  }
  if (c1 === '/') {
    let j = i + 2;
    if (j >= n || !/[A-Za-z]/.test(s[j])) return -1;
    while (j < n && /[A-Za-z0-9-]/.test(s[j])) j++;
    while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
    if (j < n && s[j] === '>') return j + 1;
    return -1;
  }
  if (/[A-Za-z]/.test(c1)) {
    let j = i + 1;
    while (j < n && /[A-Za-z0-9-]/.test(s[j])) j++;
    // After the tag name, only whitespace, '/', or '>' may follow
    // (an attribute must be separated from the tag name by whitespace).
    if (j < n && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n' && s[j] !== '/' && s[j] !== '>') return -1;
    // Attributes.
    for (;;) {
      while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
      if (j >= n) return -1;
      if (s[j] === '>') return j + 1;
      if (s[j] === '/') {
        if (j + 1 < n && s[j + 1] === '>') return j + 2;
        return -1;
      }
      // Attribute name.
      if (!/[A-Za-z_:]/.test(s[j])) return -1;
      j++;
      while (j < n && /[A-Za-z0-9_.:-]/.test(s[j])) j++;
      while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
      if (j < n && s[j] === '=') {
        j++;
        while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n')) j++;
        if (j >= n) return -1;
        const q = s[j];
        if (q === '"' || q === "'") {
          j++;
          while (j < n && s[j] !== q) j++;
          if (j >= n) return -1;
          j++;
        } else {
          // Unquoted value: no space, ", ', =, <, >, `.
          if (j >= n || s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '"' || s[j] === "'" || s[j] === '=' || s[j] === '<' || s[j] === '>' || s[j] === '`') return -1;
          while (j < n && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n' && s[j] !== '"' && s[j] !== "'" && s[j] !== '=' && s[j] !== '<' && s[j] !== '>' && s[j] !== '`') j++;
        }
        // After a value, only whitespace, '/', or '>' may follow:
        // attributes must be separated by whitespace.
        if (j < n && s[j] !== ' ' && s[j] !== '\t' && s[j] !== '\n' && s[j] !== '/' && s[j] !== '>') return -1;
      }
    }
  }
  return -1;
}

// ---------- inline parsing ----------
// Tokenize + parse emphasis with the CommonMark delimiter-stack algorithm.
// Nodes: {t:'x', s} text | {t:'d', ch, n, o, c, open:[], close:[]} delimiter
//        {t:'e', strong, del, kids} emphasis | {t:'h', s} raw html chunk
const WS_RE = /\s/;
const PUNCT_RE = /[\p{P}\p{S}]/u;
function isSpaceU(ch) { return ch === undefined ? false : WS_RE.test(ch); }
function isPunctU(ch) {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  if (code < 128) return isPunct(ch);
  return PUNCT_RE.test(ch);
}
function flank(s, i, len) {
  const before = i > 0 ? s[i - 1] : undefined;
  const after = i + len < s.length ? s[i + len] : undefined;
  const afterWS = after === undefined || isSpaceU(after);
  const beforeWS = before === undefined || isSpaceU(before);
  const afterP = isPunctU(after);
  const beforeP = isPunctU(before);
  const left = !afterWS && (!afterP || beforeWS || beforeP);
  const right = !beforeWS && (!beforeP || afterWS || afterP);
  return [left, right];
}

// Find the matching ']' for the '[' at s[i]. Returns end index (exclusive,
// i.e. position just after ']') or -1. Handles nested brackets, code spans
// and backslash escapes.
function findLinkLabelEnd(s, i) {
  const n = s.length;
  let depth = 0;
  let j = i;
  let unclosedTick = false;
  while (j < n) {
    const ch = s[j];
    if (ch === '\\' && j + 1 < n && isPunct(s[j + 1])) { j += 2; continue; }
    if (ch === '`') {
      let k = j;
      while (k < n && s[k] === '`') k++;
      const run = k - j;
      // Find a matching run of the same length on this same line only.
      // A closing run on a later line must not swallow the label's own
      // `]`: the code span is unclosed here and the backticks are literal.
      // Once a run is unclosed, later backtick runs in this label are
      // literal too: a lone backtick after an unclosed `` `` `` must not
      // pair with a far-away backtick past the label's `]`.
      if (unclosedTick) { j = k; continue; }
      let m = k, found = -1;
      while (m < n && s[m] !== '\n') {
        if (s[m] === '`') {
          let e = m;
          while (e < n && s[e] === '`') e++;
          if (e - m === run) { found = e; break; }
          m = e;
        } else m++;
      }
      if (found === -1) { unclosedTick = true; j = k; continue; }
      j = found;
      continue;
    }
    if (ch === '[') { depth++; j++; continue; }
    if (ch === ']') {
      depth--;
      if (depth === 0) return j + 1;
      j++; continue;
    }
    j++;
  }
  return -1;
}

// Whether s contains an unescaped '[' or ']'.
function hasUnescapedBracket(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '[' || s[i] === ']') return true;
  }
  return false;
}

// Whether a link label's backticks break link formation. Marked's label
// matcher only understands code spans as `+[^`]*`+ groups; a backtick that
// cannot be part of such a group (a lone backtick, or one left over after
// a group) makes the whole label unmatchable. And a multi-backtick code
// span whose content itself holds a backtick (`` a ` b ``) breaks the
// label too, unless the label ends right after that span.
function labelHasBadCodeSpan(s) {
  if (!/^(?:`+[^`]*`+|\\.|[^`])*$/.test(s)) return true;
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < n) { i += 2; continue; }
    if (ch !== '`') { i++; continue; }
    let j = i;
    while (j < n && s[j] === '`') j++;
    const run = j - i;
    if (run >= 2) {
      let m = j, found = -1;
      while (m < n) {
        if (s[m] === '`') {
          let e = m;
          while (e < n && s[e] === '`') e++;
          if (e - m === run) { found = e; break; }
          m = e;
        } else m++;
      }
      if (found !== -1) {
        if (s.slice(j, m).includes('`') && found < n) return true;
        i = found;
        continue;
      }
    }
    i = j;
  }
  return false;
}

// Whether `s` holds a backtick run of length >= 2 with no matching run of
// the same length later in `s` (an unclosed `` `` `` opener). A link whose
// label holds one still forms, but marked then suppresses emphasis later
// in the same paragraph.
function labelHasUnclosedDoubleTick(s) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (s[i] !== '`') { i++; continue; }
    let j = i;
    while (j < n && s[j] === '`') j++;
    const run = j - i;
    if (run >= 2) {
      let m = j, found = false;
      while (m < n) {
        if (s[m] === '`') {
          let e = m;
          while (e < n && s[e] === '`') e++;
          if (e - m === run) { found = true; break; }
          m = e;
        } else m++;
      }
      if (!found) return true;
    }
    i = j;
  }
  return false;
}

// Whether a label contains a '<' that starts an incomplete tag. A link
// whose label contains such a '<' is not a link at all.
function hasBrokenTag(s) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < n) { i += 2; continue; }
    if (ch === '`') {
      let k = i;
      while (k < n && s[k] === '`') k++;
      const run = k - i;
      let m = k, found = -1;
      while (m < n) {
        if (s[m] === '`') {
          let e = m;
          while (e < n && s[e] === '`') e++;
          if (e - m === run) { found = e; break; }
          m = e;
        } else m++;
      }
      i = found === -1 ? k : found;
      continue;
    }
    if (ch === '<') {
      const c = s[i + 1];
      if (c !== undefined && /[A-Za-z!/?]/.test(c)) {
        if (scanHtml(s, i) === -1 && !tryAutolink(s, i)) return true;
      }
    }
    i++;
  }
  return false;
}

// Try to parse a link/image starting at s[i] ('[' or '!['). Returns
// {html, end} or null. linkText is parsed recursively with links disabled.
function tryLink(s, i, refs, isImage) {
  const n = s.length;
  // i is the '[' position for both links and images.
  const start = i;
  const labelEnd = findLinkLabelEnd(s, start);
  if (labelEnd === -1) return null;
  const label = s.slice(start + 1, labelEnd - 1);
  // A link label containing an incomplete tag is not a link.
  if (!isImage && hasBrokenTag(label)) return null;
  // A link label whose backticks cannot form proper code spans is not a
  // link. The label is literal text, but its code spans (and other inline
  // markup) are still rendered, while its emphasis is not: the failed
  // link attempt already consumed those delimiters.
  if (labelHasBadCodeSpan(label)) {
    noEmphasis = true;
    let inner;
    try {
      inner = parseInline(label, refs, true);
    } finally {
      noEmphasis = false;
    }
    return { html: (isImage ? '![' : '[') + inner + ']', end: labelEnd };
  }
  let j = labelEnd;
  let dest = null, title = null;
  let ok = false;
  if (j < n && s[j] === '(') {
    // Inline link: '(' [spaces] dest [spaces title] [spaces] ')'.
    // If it fails, fall through to the reference forms.
    let k = j + 1;
    while (k < n && (s[k] === ' ' || s[k] === '\n')) k++;
    if (k < n && s[k] === ')') {
      dest = ''; j = k + 1; ok = true;
    } else {
      const d = parseDest(s, k);
      if (d) {
        dest = d[0]; k = d[1];
        let hadWS = false;
        while (k < n && (s[k] === ' ' || s[k] === '\n')) { k++; hadWS = true; }
        let bad = false;
        if (k < n && s[k] !== ')') {
          if (!hadWS) bad = true;
          else {
            const t = parseTitle(s, k);
            if (!t) bad = true;
            else {
              title = t[0]; k = t[1];
              while (k < n && (s[k] === ' ' || s[k] === '\n')) k++;
            }
          }
        }
        if (!bad && k < n && s[k] === ')') { j = k + 1; ok = true; }
      }
    }
  }
  if (!ok && j < n && s[j] === '[') {
    // Full reference link [text][label] (label may be empty = collapsed).
    // The reference label cannot contain unescaped '[' or ']'. If the
    // reference is not found, there is no fallback to the shortcut link:
    // the '[' is literal.
    const le = findLinkLabelEnd(s, j);
    if (le === -1) return null;
    const refLabel = s.slice(j + 1, le - 1);
    if (hasUnescapedBracket(refLabel)) return null;
    const ref = refs[normLabel(refLabel === '' ? label : refLabel)];
    if (!ref) return null;
    dest = ref[0]; title = ref[1]; j = le; ok = true;
  }
  if (!ok) {
    // Shortcut reference link. (Reached only when the label is not
    // followed by '[', or when an inline link attempt failed.)
    const ref = refs[normLabel(label)];
    if (!ref) return null;
    dest = ref[0]; title = ref[1];
  }
  if (isImage) {
    // Alt text is the label's text content: links inside it are parsed
    // (their text is kept) and then all tags are stripped.
    labelDepth++;
    const alt = stripTags(parseInline(label, refs, true));
    labelDepth--;
    const href = cleanUrl(unescape(dest));
    if (href === null) return null;
    let out = '<img src="' + escAttr(href) + '" alt="' + escAttr(alt) + '"';
    if (title != null) out += ' title="' + escAttr(unescape(title)) + '"';
    return { html: out + '>', end: j };
  }
  // Parse the label with links allowed so a nested link can be detected:
  // a link's label cannot contain another markdown link (images and
  // autolinks are fine).
  const before = linkCount;
  labelDepth++;
  const inner = parseInline(label, refs, true);
  labelDepth--;
  if (linkCount > before) return null;
  const href = cleanUrl(unescape(dest));
  if (href === null) return null;
  let out = '<a href="' + escAttr(href) + '"';
  if (title != null) out += ' title="' + escAttr(unescape(title)) + '"';
  linkCount++;
  // A link whose label holds an unclosed double backtick run suppresses
  // `_`/`__` emphasis after it up to the next backtick in the paragraph
  // (the lone backtick in the label pairs with that backtick as a code
  // span, swallowing the emphasis between them). Past that backtick,
  // emphasis is normal again.
  if (labelHasUnclosedDoubleTick(label)) {
    const bt = s.indexOf('`', j);
    if (bt !== -1) {
      suppressEmphasis = true;
      suppressUntil = bt;
    }
  }
  return { html: out + '>' + inner + '</a>', end: j };
}

// Strip HTML tags from already-rendered inline HTML (for image alt text).
// An <img> contributes its alt text (decoded back to plain text).
function stripTags(html) {
  if (html.indexOf('<') === -1) return html;
  html = html.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, (m, alt) => alt.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  return html.replace(/<[^>]*>/g, '');
}

// Try an autolink <scheme:...> or <email> starting at s[i] === '<'.
// Returns {html, end} or null.
function tryAutolink(s, i) {
  const n = s.length;
  let j = i + 1;
  // Scheme: [a-zA-Z][a-zA-Z0-9+.-]{1,31} ':'
  if (j < n && /[A-Za-z]/.test(s[j])) {
    let k = j + 1;
    while (k < n && /[A-Za-z0-9+.-]/.test(s[k])) k++;
    if (k - j >= 2 && k - j <= 32 && k < n && s[k] === ':') {
      let e = k + 1;
      while (e < n && s[e] !== '>' && s[e] !== ' ' && s[e] !== '\n' && s[e].charCodeAt(0) >= 0x20) e++;
      if (e < n && s[e] === '>') {
        const url = s.slice(i + 1, e);
        const href = cleanUrl(url);
        if (href === null) return null;
        return { html: '<a href="' + escAttr(href) + '">' + escText(url) + '</a>', end: e + 1 };
      }
    }
  }
  // Email: <local@domain>
  let k = j;
  while (k < n && /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]/.test(s[k])) k++;
  if (k > j && k < n && s[k] === '@') {
    let e = k + 1;
    let lastDot = -1;
    while (e < n && /[A-Za-z0-9.-]/.test(s[e])) {
      if (s[e] === '.') lastDot = e;
      e++;
    }
    if (e > k + 1 && e < n && s[e] === '>' && lastDot > k + 1 && lastDot < e - 1) {
      const addr = s.slice(i + 1, e);
      return { html: '<a href="mailto:' + escAttr(addr) + '">' + escText(addr) + '</a>', end: e + 1 };
    }
  }
  return null;
}

// GFM extended autolink at s[i]. `prev` is the previous source character (or
// undefined at start). Returns {html, end} or null.
function tryGfmAutolink(s, i, prev) {
  // Inside an unclosed <a> tag, or inside a link label, GFM autolinks
  // are not formed.
  if (inLink || labelDepth > 0) return null;
  const n = s.length;
  if (prev !== undefined && !isSpaceU(prev) && prev !== '(' && prev !== '[' && prev !== '{' && prev !== '<' && prev !== '"' && prev !== "'") return null;
  let m;
  // www.example.com
  if (s.startsWith('www.', i)) {
    m = matchGfmUrl(s, i);
    if (m === null) return null;
    const url = m[0];
    const href = cleanUrl('http://' + url);
    if (href === null) return null;
    return { html: '<a href="' + escAttr(href) + '">' + escText(url) + '</a>', end: m[1] };
  }
  // scheme://...
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]{1,31}):\/\//.exec(s.slice(i, i + 40));
  if (scheme) {
    m = matchGfmUrl(s, i, true);
    if (m === null) return null;
    const url = m[0];
    const href = cleanUrl(url);
    if (href === null) return null;
    return { html: '<a href="' + escAttr(href) + '">' + escText(url) + '</a>', end: m[1] };
  }
  // Bare scheme: mailto:, xmpp:, ... (no '://'). The part after ':' is
  // an email-like address with an optional single path segment.
  const bare = /^([A-Za-z][A-Za-z0-9+.-]{1,31}):/.exec(s.slice(i, i + 40));
  if (bare) {
    // The body after the scheme colon must be non-empty: 'README.md:'
    // is a filename followed by a colon, not a URL.
    const afterColon = i + bare[0].length;
    if (afterColon >= n || isSpaceU(s[afterColon])) return null;
    m = matchGfmUrl(s, i, false);
    if (m === null) return null;
    // The matched URL must still carry the scheme colon: if trailing
    // punctuation stripping ate it (e.g. 'renderer.code:.'), the text
    // was not a scheme URL at all, just a word followed by a colon.
    if (!m[0].startsWith(bare[0])) return null;
    const url = m[0];
    const href = cleanUrl(url);
    if (href === null) return null;
    return { html: '<a href="' + escAttr(href) + '">' + escText(url) + '</a>', end: m[1] };
  }
  // email user@domain.tld
  m = /^([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)/.exec(s.slice(i));
  if (m) {
    const addr = m[0];
    // A trailing '-' or '_' after the address invalidates the email,
    // unless the '_' is the closer of an emphasis span that opens
    // before the address (e.g. '_warning when@x.example_'): then the
    // '_' is a delimiter, not part of the word.
    const after = s[i + addr.length];
    if (after === '-' || after === '_') {
      if (after === '_' && closesEmphasis(s, i)) {
        // fall through: linkify, the '_' stays a delimiter
      } else return null;
    }
    return { html: '<a href="mailto:' + escAttr(addr) + '">' + escText(addr) + '</a>', end: i + addr.length };
  }
  return null;
}

// Whether a '_' at the end of an email address (position endOfAddr in
// s) closes an emphasis span that opens before position i. Scans the
// '_' delimiters before i: an opener is a '_' that can open (left
// flanking) with no closer after it.
function closesEmphasis(s, i) {
  let open = false;
  for (let k = 0; k < i; k++) {
    if (s[k] !== '_') continue;
    if (s[k - 1] === '\\') continue;
    const f = flank(s, k, 1);
    if (f[0] && !open) open = true;
    else if (f[1] && open) open = false;
  }
  return open;
}

// Match a GFM autolink URL body starting at s[i] (www. or scheme:// already
// present). Returns [url, end] with trailing punctuation stripped, or null.
// A domain must contain a '.' after the first label (www. counts as the
// first label for www. links; for scheme links the host needs a dot too,
// unless it is a localhost-style host? GFM requires a dot in the domain).
// multiSlash: false for a bare scheme: URL (mailto:, xmpp:), where only
// one '/' path segment is allowed.
function matchGfmUrl(s, i, multiSlash) {
  const n = s.length;
  let j = i;
  while (j < n) {
    const ch = s[j];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '<' || ch === '>' || ch === '"' || ch === "'") break;
    j++;
  }
  if (j === i) return null;
  let url = s.slice(i, j);
  // A bare scheme: URL allows only one '/' (one path segment).
  if (multiSlash === false) {
    const firstSlash = url.indexOf('/', url.indexOf(':') + 1);
    if (firstSlash !== -1) {
      const secondSlash = url.indexOf('/', firstSlash + 1);
      if (secondSlash !== -1) url = url.slice(0, secondSlash);
    }
  }
  // Truncate at the first '(' that has no matching ')' after it: an
  // unmatched '(' cannot be part of the URL.
  {
    let depth = 0, firstUnmatched = -1;
    for (let k = 0; k < url.length; k++) {
      if (url[k] === '(') {
        if (depth === 0) firstUnmatched = k;
        depth++;
      } else if (url[k] === ')') {
        if (depth > 0) {
          depth--;
          if (depth === 0) firstUnmatched = -1;
        }
      }
    }
    if (depth > 0 && firstUnmatched !== -1) url = url.slice(0, firstUnmatched);
  }
  // Strip trailing punctuation, honouring balanced parens and entities.
  for (;;) {
    if (url.length === 0) return null;
    const last = url[url.length - 1];
    if (last === ')' ) {
      // Strip a trailing ')' only when it has no matching '(' before it:
      // a ')' that closes an earlier '(' is part of the URL.
      let depth = 0, matched = false;
      for (let k = 0; k < url.length; k++) {
        if (url[k] === '(') depth++;
        else if (url[k] === ')') {
          if (k === url.length - 1) matched = depth > 0;
          if (depth > 0) depth--;
        }
      }
      if (!matched) { url = url.slice(0, -1); continue; }
      break;
    }
    if (last === ';') {
      // A trailing '&word;' is an entity reference, not part of the URL:
      // strip the whole reference.
      const amp = url.lastIndexOf('&');
      if (amp !== -1 && /^#?\w+;$/.test(url.slice(amp + 1))) { url = url.slice(0, amp); continue; }
      url = url.slice(0, -1); continue;
    }
    // A bare scheme: URL ending in '/' has no path segment after it.
    if (last === '/' && multiSlash === false) { url = url.slice(0, -1); continue; }
    if (last === '?' || last === '!' || last === '.' || last === ',' || last === ':' || last === '*' || last === '~' || (last === '_' && multiSlash !== false)) { url = url.slice(0, -1); continue; }
    break;
  }
  if (url.length === 0) return null;
  // A bare scheme: URL ending in '-' or '_' is not a link at all.
  if (multiSlash === false) {
    const last = url[url.length - 1];
    if (last === '-' || last === '_') return null;
  }
  // The host part (up to first /, ?, #) must contain a '.'. For a scheme
  // URL the host starts after '://' (or after ':' for a bare scheme).
  let hostStart = 0;
  const sep = url.indexOf('://');
  if (sep !== -1) hostStart = sep + 3;
  else {
    const colon = url.indexOf(':');
    if (colon !== -1) hostStart = colon + 1;
  }
  let hostEnd = url.length;
  for (let k = hostStart; k < url.length; k++) {
    if (url[k] === '/' || url[k] === '?' || url[k] === '#') { hostEnd = k; break; }
  }
  const host = url.slice(hostStart, hostEnd);
  if (host.indexOf('.') === -1 || !/[A-Za-z0-9]/.test(host)) return null;
  return [url, i + url.length];
}

// Count of markdown links formed (not images, not autolinks). Used to
// detect a link inside a link label: a label may contain an autolink,
// but not another markdown link.
let linkCount = 0;

// Depth of link-label parsing. Inside a label, GFM (bare) autolinks are
// not formed (they stay plain text); angle-bracket autolinks still are.
let labelDepth = 0;

// When true, `*`/`_`/`~` runs are literal text, never emphasis delimiters.
// Used to render a link label that cannot form a link (its emphasis was
// already consumed by the failed link attempt).
let noEmphasis = false;

// Set when a link forms whose label holds an unclosed backtick run of
// length >= 2 (e.g. `` ``small` ``): marked then leaves `_`/`__` emphasis
// between the link and the next backtick literal. Cleared at the start of
// each top-level parseInline call, and only applies before `suppressUntil`
// (the next backtick), so it never leaks past it.
let suppressEmphasis = false;
let suppressUntil = -1;
let parseInlineDepth = 0;

// Whether inline parsing is inside an unclosed <a> tag. marked's inline
// lexer keeps this state across blocks: an unclosed <a> in one paragraph
// suppresses GFM autolinks (www, scheme, email) in later paragraphs until
// a </a> is seen. Explicit links and <> autolinks are not affected.
let inLink = false;

// Update inLink for a raw HTML tag `tag` (the full tag text). Any opening
// <a> tag sets it, even a self-closing <a/> (in HTML that slash is ignored
// for non-void elements, so it still opens the anchor); only </a> clears it.
function trackLinkTag(tag) {
  const lower = tag.toLowerCase();
  if (lower.startsWith('</a') && (lower[3] === ' ' || lower[3] === '\t' || lower[3] === '\n' || lower[3] === '>')) {
    inLink = false;
    return;
  }
  if (lower.startsWith('<a') && (lower[2] === ' ' || lower[2] === '\t' || lower[2] === '\n' || lower[2] === '>' || lower[2] === '/')) {
    inLink = true;
  }
}

// The main inline parser. `allowLinks` false while parsing link text / alt
// text (links do not nest; images still may appear in link text).
function parseInline(s, refs, allowLinks) {
  if (parseInlineDepth === 0) { suppressEmphasis = false; suppressUntil = -1; }
  parseInlineDepth++;
  try {
  const n = s.length;
  const nodes = [];
  let text = '';
  const flush = () => { if (text) { nodes.push({ t: 'x', s: text }); text = ''; } };
  let i = 0;
  while (i < n) {
    const ch = s[i];
    if (ch === '\\') {
      const nx = s[i + 1];
      if (nx === '\n') {
        flush(); nodes.push({ t: 'h', s: '<br>' }); i += 2;
        // After a hard break, leading spaces/tabs on the next line are
        // stripped.
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        continue;
      }
      if (nx !== undefined && isPunct(nx)) {
        // A backslash-escaped "&" is escaped outright: it must not be left
        // alone just because what follows looks like an entity.
        if (nx === '&') { flush(); nodes.push({ t: 'h', s: '&amp;' }); i += 2; continue; }
        text += nx; i += 2; continue;
      }
      text += '\\'; i++; continue;
    }
    if (ch === '`') {
      let k = i;
      while (k < n && s[k] === '`') k++;
      const run = k - i;
      let m = k, found = -1;
      while (m < n) {
        if (s[m] === '`') {
          let e = m;
          while (e < n && s[e] === '`') e++;
          if (e - m === run) { found = m; break; }
          m = e;
        } else m++;
      }
      if (found === -1) { text += s.slice(i, k); i = k; continue; }
      let code = s.slice(k, found);
      code = code.replace(/\n/g, ' ');
      if (code.length >= 2 && code[0] === ' ' && code[code.length - 1] === ' ' && code.trim() !== '') code = code.slice(1, -1);
      flush();
      nodes.push({ t: 'h', s: '<code>' + escCode(code) + '</code>' });
      i = found + run;
      continue;
    }
    if (ch === '&') {
      const e = parseEntity(s, i);
      if (e) { text += e[0]; i = e[1]; continue; }
      text += '&'; i++; continue;
    }
    if (ch === '<') {
      const a = tryAutolink(s, i);
      if (a) { flush(); nodes.push({ t: 'h', s: a.html }); i = a.end; continue; }
      const h = scanHtml(s, i);
      if (h !== -1) { flush(); const tag = s.slice(i, h); trackLinkTag(tag); nodes.push({ t: 'h', s: tag }); i = h; continue; }
      text += '&lt;'; i++; continue;
    }
    if (ch === '!') {
      // Images may appear in link text even when links may not nest.
      if (i + 1 < n && s[i + 1] === '[') {
        const l = tryLink(s, i + 1, refs, true);
        if (l) { flush(); nodes.push({ t: 'h', s: l.html }); i = l.end; continue; }
      }
      text += '!'; i++; continue;
    }
    if (ch === '[' && allowLinks !== false) {
      const l = tryLink(s, i, refs, false);
      if (l) { flush(); nodes.push({ t: 'h', s: l.html }); i = l.end; continue; }
      text += '['; i++; continue;
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      let k = i;
      while (k < n && s[k] === ch) k++;
      const run = k - i;
      // A run of three or more tildes is literal text, never a delimiter.
      // So is any emphasis run while a failed link label is being rendered.
      // The post-link suppression (unclosed double backtick in the label)
      // only ever silences `_`/`__` runs in marked, never `*`/`**`, and
      // only on the link's own line.
      if (noEmphasis || (suppressEmphasis && ch === '_' && i < suppressUntil) || (ch === '~' && run > 2)) { text += s.slice(i, k); i = k; continue; }
      const [left, right] = flank(s, i, run);
      let canOpen, canClose;
      if (ch === '_') {
        canOpen = left && (!right || isPunctU(s[i - 1]));
        canClose = right && (!left || isPunctU(s[i + run]));
      } else {
        canOpen = left; canClose = right;
      }
      flush();
      nodes.push({ t: 'd', ch, n: run, o: canOpen, c: canClose });
      i = k; continue;
    }
    if (ch === '\n') {
      // Hard break: two or more spaces (or a backslash, handled above)
      // before the newline.
      let j = text.length;
      let spaces = 0;
      while (j > 0 && text[j - 1] === ' ') { spaces++; j--; }
      if (spaces >= 2) {
        text = text.slice(0, text.length - spaces);
        flush();
        nodes.push({ t: 'h', s: '<br>' });
        i++;
        // After a hard break, leading spaces/tabs on the next line are
        // stripped.
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
      } else {
        text += '\n';
        i++;
      }
      continue;
    }
    if (ch === 'w' || ch === 'h' || ch === 'f' || (ch >= 'A' && ch <= 'Z')) {
      // Possible GFM extended autolink (www., scheme://, email).
      const g = tryGfmAutolink(s, i, i > 0 ? s[i - 1] : undefined);
      if (g) { flush(); nodes.push({ t: 'h', s: g.html }); i = g.end; continue; }
      text += ch; i++; continue;
    }
    if (ch >= 'a' && ch <= 'z') {
      // Possible bare email autolink.
      const g = tryGfmAutolink(s, i, i > 0 ? s[i - 1] : undefined);
      if (g) { flush(); nodes.push({ t: 'h', s: g.html }); i = g.end; continue; }
      text += ch; i++; continue;
    }
    if (ch === '>' || ch === '"' || ch === "'") {
      text += ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;';
      i++; continue;
    }
    text += ch; i++;
  }
  flush();
  processDelims(nodes);
  return renderNodes(nodes);
  } finally {
    parseInlineDepth--;
  }
}

// Count emphasis nodes in `list` (recursively) whose opener could both
// open and close. Used for the effective-length rule.
function countBothEm(list) {
  let n = 0;
  for (const nd of list) {
    if (nd.t === 'e') {
      if (nd.bo) n++;
      n += countBothEm(nd.kids);
    }
  }
  return n;
}

// Whether `list` holds (recursively) a plain `<em>` (use 1), as opposed to
// a `<strong>`. Used for leftover-delimiter placement.
function hasPlainEm(list) {
  for (const nd of list) {
    if (nd.t === 'e') {
      if (!nd.strong) return true;
      if (hasPlainEm(nd.kids)) return true;
    }
  }
  return false;
}

// Whether `list` holds (recursively) a `<strong>` whose closing delimiter
// could also open (a "both" closer, e.g. `**` between two word characters).
// A potential `<em>` spanning such a strong does not form in marked: the
// strong's closer, being able to open, sets the openers-bottom floor, and
// the em that would swallow it stays literal. A strong whose closer could
// only close does not block an outer `<em>` (e.g. `*a **b** c*`).
function hasStrongOpenCloser(list) {
  for (const nd of list) {
    if (nd.t === 'e') {
      if (nd.strong && nd.bc) return true;
      if (hasStrongOpenCloser(nd.kids)) return true;
    }
  }
  return false;
}

// Process emphasis / strikethrough delimiters in `nodes` (in place).
// Marked's delimiter matching, derived from its behaviour on the practice
// documents and probe cases (it deviates from the CommonMark appendix
// algorithm in a few places):
//  - openersBottom (OB): per delimiter char, a delimiter node below which
//    no opener may be used. On a match, OB is set to the delimiter below
//    the matched opener only when the closer can also open and the opener
//    cannot close; it is cleared when the closer was fully consumed and
//    cannot open; otherwise it is left alone. On a failure, OB is cleared
//    when the search examined at least one opener (all blocked by the rule
//    of 3); when the search hit the floor without examining any opener, OB
//    becomes the delimiter below the closer when the closer can open, else
//    it is cleared. Exception: a closer may still match the OB node itself
//    when it is the bottommost opener of that char (no same-char opener
//    below it in the stack) and either (a) it is a single delimiter and the
//    match that set the OB was an `<em>`, or (b) the match that set the OB
//    was a `<strong>` and this match would itself use 2, or (c) the closer
//    run is longer than the opener run (so the match leaves a leftover
//    closer). An outer `<em>` containing a `<strong>` stays literal.
//  - Rule of 3 (standard): when either delimiter can both open and close
//    and the lengths sum to a multiple of 3, they cannot match, unless
//    both lengths are themselves multiples of 3.
//  - When the span contains an emphasis whose opener could both open and
//    close, the outer opener's effective length is reduced by 2 per such
//    inner emphasis: if that leaves more than 2, the outer pair does not
//    match at all (the search moves on to an earlier opener); otherwise
//    the number used is the reduced length (at least 1, at most the
//    closer's length), falling back to the standard rule when the reduced
//    length is 0 or less.
//  - An opener's leftover delimiters become text at the start of the new
//    emphasis when the span holds a plain `<em>`, and stay a delimiter
//    before it otherwise. A closer's leftover delimiters are reprocessed
//    as a delimiter right after the new emphasis; if that leftover then
//    fails to match anything, it becomes text at the end of the emphasis
//    when the match was a strong whose opener was fully consumed and whose
//    span held a plain `<em>`, and stays literal text after it otherwise.
function processDelims(nodes) {
  const OB = { '*': null, '_': null, '~': null };
  // Whether the match that set each OB was a `<strong>` (use 2).
  const OBStrong = { '*': false, '_': false, '~': false };
  const stack = [];
  let idx = 0;
  while (idx < nodes.length) {
    const node = nodes[idx];
    if (node.t !== 'd') { idx++; continue; }
    const closer = node;
    if (!stack.includes(closer)) stack.push(closer);
    if (!closer.c || closer.n === 0) { idx++; continue; }
    // --- search for an opener (topmost first) ---
    let found = -1;
    let examined = false;
    let use = 1;
    for (let s = stack.length - 2; s >= 0; s--) {
      const cand = stack[s];
      if (cand.ch !== closer.ch) continue;
      if (cand === OB[closer.ch]) {
        // The OB floor: normally the search stops here. But a closer may
        // still match the OB node itself when it is the bottommost opener
        // of that char and either (a) it is a single delimiter and the
        // match that set the OB was an `<em>` (not a `<strong>`), or
        // (b) the match that set the OB was a `<strong>` and this match
        // would itself use 2 (a `<strong>` containing a `<strong>`).
        // An outer `<em>` containing a `<strong>` stays literal.
        let bottommost = true;
        for (let t = s - 1; t >= 0; t--) {
          if (stack[t].ch === closer.ch && stack[t].o && stack[t].n > 0) { bottommost = false; break; }
        }
        const prelimU = cand.n >= 2 && closer.n >= 2 ? 2 : 1;
        const allow = bottommost && (
          (cand.n === 1 && !OBStrong[closer.ch]) ||
          (prelimU === 2 && OBStrong[closer.ch]) ||
          (closer.n > cand.n)
        );
        if (allow) {
          // fall through and examine this candidate
        } else break;
      }
      if (!cand.o || cand.n === 0) continue;
      examined = true;
      const candBoth = cand.o && cand.c;
      const closerBoth = closer.o && closer.c;
      if ((candBoth || closerBoth) && (cand.n + closer.n) % 3 === 0 && !(cand.n % 3 === 0 && closer.n % 3 === 0)) continue;
      let u = cand.n >= 2 && closer.n >= 2 ? 2 : 1;
      if (cand.n > 2) {
        const oIdx = nodes.indexOf(cand);
        const bothEm = countBothEm(nodes.slice(oIdx + 1, idx));
        if (bothEm > 0) {
          const effO = cand.n - 2 * bothEm;
          if (effO > 2) continue; // this opener cannot match; try an earlier one
          if (effO >= 1) u = Math.min(effO, closer.n);
        }
      }
      // An `<em>` (use 1) spanning a `<strong>` whose closer could also
      // open does not form when the em would sit inside a `<strong>` (a
      // `**` opener of the same char waits below this opener in the
      // stack): skip this opener and try an earlier one. Without that
      // enclosing `**` opener the em does form (e.g. `*foo**bar**baz*`).
      if (u === 1) {
        const oIdx = nodes.indexOf(cand);
        if (hasStrongOpenCloser(nodes.slice(oIdx + 1, idx))) {
          let belowStrong = false;
          for (let t = s - 1; t >= 0; t--) {
            if (stack[t].ch === closer.ch && stack[t].o && stack[t].n >= 2) { belowStrong = true; break; }
          }
          if (belowStrong) continue;
        }
      }
      found = s; use = u; break;
    }
    if (found === -1) {
      // --- failure: update OB ---
      if (examined) { OB[closer.ch] = null; OBStrong[closer.ch] = false; }
      else if (closer.o) {
        let prev = null;
        for (let s = stack.indexOf(closer) - 1; s >= 0; s--) {
          if (stack[s].ch === closer.ch) { prev = stack[s]; break; }
        }
        OB[closer.ch] = prev; OBStrong[closer.ch] = false;
      } else { OB[closer.ch] = null; OBStrong[closer.ch] = false; }
      // A leftover closer that failed to match becomes text inside the
      // emphasis it came from when that emphasis was a strong whose opener
      // was fully used and whose span held a plain `<em>`.
      if (closer.leftOf && closer.leftOf.oc && closer.leftOf.strong && closer.leftOf.plainEm) {
        const em = closer.leftOf.em;
        em.kids.push({ t: 'x', s: closer.ch.repeat(closer.n) });
        nodes.splice(idx, 1);
        const si = stack.indexOf(closer);
        if (si !== -1) stack.splice(si, 1);
        continue; // do not advance idx: the next node shifted into place
      }
      if (!closer.o) {
        const si = stack.indexOf(closer);
        if (si !== -1) stack.splice(si, 1);
      }
      idx++; continue;
    }
    // --- match ---
    const opener = stack[found];
    let belowOpener = null;
    for (let s = found - 1; s >= 0; s--) {
      if (stack[s].ch === closer.ch) { belowOpener = stack[s]; break; }
    }
    const oIdx = nodes.indexOf(opener);
    const kids = nodes.slice(oIdx + 1, idx);
    const useO = Math.min(use, opener.n);
    const useC = Math.min(use, closer.n);
    for (const k of kids) {
      if (k.t === 'd') {
        const si = stack.indexOf(k);
        if (si !== -1) stack.splice(si, 1);
      }
    }
    const openerLeft = opener.n - useO;
    const plainEm = hasPlainEm(kids);
    const openerInside = openerLeft > 0 && plainEm;
    const emKids = kids.slice();
    if (openerInside) emKids.unshift({ t: 'x', s: opener.ch.repeat(openerLeft) });
    const openerConsumed = openerLeft === 0;
    const em = { t: 'e', strong: useO === 2, del: closer.ch === '~', kids: emKids, bo: opener.o && opener.c, oc: openerConsumed, bc: closer.o && closer.c };
    const closerLeft = closer.n - useC;
    // Keep a leftover opener in place (before the em) so a later closer can
    // still find it; otherwise replace the whole span with the em.
    let emIdx;
    if (openerLeft > 0 && !openerInside) {
      opener.n = openerLeft;
      nodes.splice(oIdx + 1, idx - oIdx, em);
      emIdx = oIdx + 1;
    } else {
      nodes.splice(oIdx, idx - oIdx + 1, em);
      emIdx = oIdx;
      const si = stack.indexOf(opener);
      if (si !== -1) stack.splice(si, 1);
    }
    if (closerLeft > 0) {
      const leftNode = { t: 'd', ch: closer.ch, n: closerLeft, o: closer.o, c: closer.c, leftOf: { em, oc: openerConsumed, strong: useO === 2, plainEm } };
      nodes.splice(emIdx + 1, 0, leftNode);
      const ci = stack.indexOf(closer);
      if (ci !== -1) stack[ci] = leftNode;
      else stack.push(leftNode);
    } else {
      const ci = stack.indexOf(closer);
      if (ci !== -1) stack.splice(ci, 1);
    }
    // OB is set to the delimiter below the opener only when the closer can
    // open and the opener cannot close; a fully consumed closer that cannot
    // open clears it; otherwise it is left alone. Record whether the match
    // that set it was a `<strong>`, for the OB exception in the search.
    if (closer.o && !opener.c) { OB[closer.ch] = belowOpener; OBStrong[closer.ch] = useO === 2; }
    else if (!closer.o && closerLeft === 0) { OB[closer.ch] = null; OBStrong[closer.ch] = false; }
    idx = emIdx + 1;
  }
  // Any delimiter node left over renders as literal text.
  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k];
    if (nd.t === 'd') nodes[k] = { t: 'x', s: nd.ch.repeat(nd.n) };
  }
}

function renderNodes(nodes) {
  let out = '';
  for (const nd of nodes) {
    if (nd.t === 'x') out += escText(nd.s);
    else if (nd.t === 'h') out += nd.s;
    else if (nd.t === 'd') out += nd.ch.repeat(nd.n); // unmatched delimiter: literal
    else if (nd.t === 'e') {
      const tag = nd.del ? 'del' : nd.strong ? 'strong' : 'em';
      out += '<' + tag + '>' + renderNodes(nd.kids) + '</' + tag + '>';
    }
  }
  return out;
}

// ---------- link reference definitions ----------
// Try to parse a link reference definition from lines[i..]. Returns the
// number of lines consumed, or 0 when there is none. `refs` is updated.
function tryDef(lines, i, refs) {
  const joined = lines.slice(i, i + 12).join('\n');
  let p = 0;
  const n = joined.length;
  let sp = 0;
  while (p < n && joined[p] === ' ' && sp < 3) { p++; sp++; }
  if (p >= n || joined[p] !== '[') return 0;
  const le = findLinkLabelEnd(joined, p);
  if (le === -1) return 0;
  const label = joined.slice(p + 1, le - 1);
  if (label.length === 0 || label.length > 999) return 0;
  // A definition label cannot contain unescaped '[' or ']'.
  if (hasUnescapedBracket(label)) return 0;
  p = le;
  if (p >= n || joined[p] !== ':') return 0;
  p++;
  // Skip spaces/tabs, at most one line break, then spaces/tabs.
  while (p < n && (joined[p] === ' ' || joined[p] === '\t')) p++;
  if (p < n && joined[p] === '\n') {
    p++;
    while (p < n && (joined[p] === ' ' || joined[p] === '\t')) p++;
    if (p < n && joined[p] === '\n') return 0;
  }
  const d = parseDest(joined, p);
  if (!d) return 0;
  let dest = d[0];
  p = d[1];
  let title = null;
  // Optional title. On the same line it must be separated from the
  // destination by whitespace, parse, and be followed by only whitespace;
  // otherwise the definition is invalid. On the next line, a title that
  // fails to parse (or has junk after it) simply is not part of the
  // definition: the definition still stands with the destination alone.
  let hadWS = false;
  while (p < n && (joined[p] === ' ' || joined[p] === '\t')) { p++; hadWS = true; }
  if (p < n && joined[p] === '\n') {
    let q = p + 1;
    while (q < n && (joined[q] === ' ' || joined[q] === '\t')) q++;
    if (q < n && (joined[q] === '"' || joined[q] === "'" || joined[q] === '(')) {
      const t = parseTitle(joined, q);
      if (t) {
        let r = t[1];
        while (r < n && (joined[r] === ' ' || joined[r] === '\t')) r++;
        if (r >= n || joined[r] === '\n') { title = t[0]; p = r; }
      }
    }
  } else if (p < n && (joined[p] === '"' || joined[p] === "'" || joined[p] === '(')) {
    if (!hadWS) return 0;
    const t = parseTitle(joined, p);
    if (!t) return 0;
    title = t[0]; p = t[1];
    while (p < n && (joined[p] === ' ' || joined[p] === '\t')) p++;
    if (p < n && joined[p] !== '\n') return 0;
  } else if (p < n && joined[p] !== '\n') {
    return 0;
  }
  const key = normLabel(label);
  // An empty (all-whitespace) label is not a definition.
  if (key === '') return 0;
  if (!(key in refs)) refs[key] = [unescape(dest), title === null ? null : unescape(title)];
  const consumed = joined.slice(0, p).split('\n').length;
  return consumed;
}

// ---------- block start matchers ----------
// Returns heading level (1-6) or 0. Also returns the heading text (raw).
function matchAtx(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  let i = idx;
  let level = 0;
  while (i < line.length && line[i] === '#' && level < 7) { level++; i++; }
  if (level === 0 || level > 6) return null;
  if (i < line.length && line[i] !== ' ' && line[i] !== '\t') return null;
  // Strip a closing sequence of #'s (preceded by a space) before trimming.
  let text = line.slice(i).replace(/ +#+ *$/, '').trim();
  return [level, text];
}

// Fence start: returns [char, length, info] or null.
function matchFence(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  let i = idx;
  const ch = line[i];
  if (ch !== '`' && ch !== '~') return null;
  let len = 0;
  while (i < line.length && line[i] === ch) { len++; i++; }
  if (len < 3) return null;
  const info = line.slice(i).trim();
  if (ch === '`' && info.indexOf('`') !== -1) return null;
  return [ch, len, info, col];
}

function matchHr(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  let i = idx;
  const ch = line[i];
  if (ch !== '-' && ch !== '*' && ch !== '_') return null;
  let count = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ch) { count++; i++; }
    else if (c === ' ' || c === '\t') i++;
    else return null;
  }
  return count >= 3;
}

function matchSetext(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  let i = idx;
  const ch = line[i];
  if (ch !== '=' && ch !== '-') return null;
  while (i < line.length && line[i] === ch) i++;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  if (i !== line.length) return null;
  return ch === '=' ? 1 : 2;
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem meta nav noframes ol optgroup option p param search section source summary table tbody td tfoot th thead title tr track ul').split(' '));

// HTML block start: returns type (1-7) and, for types 1-5, the end marker.
function matchHtmlBlock(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  if (line[idx] !== '<') return null;
  const rest = line.slice(idx);
  const m1 = /^<(script|pre|style|textarea)([ \t>]|\/>|$)/i.exec(rest);
  if (m1) return [1, '</' + m1[1].toLowerCase() + '>'];
  if (rest.startsWith('<!--')) return [2, '-->'];
  if (rest.startsWith('<?')) return [3, '?>'];
  if (/^<![A-Za-z]/.test(rest)) return [4, '>'];
  if (rest.startsWith('<![CDATA[')) return [5, ']]>'];
  const m6 = /^<\/?([A-Za-z][A-Za-z0-9-]*)([ \t>\/]|$)/.exec(rest);
  if (m6 && BLOCK_TAGS.has(m6[1].toLowerCase())) return [6, null];
  // Type 7: a complete open or close tag alone on the line.
  const h = scanHtml(line, idx);
  if (h !== -1) {
    let j = h;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
    if (j === line.length) return [7, null];
  }
  return null;
}

// ---------- block parsing ----------
function interruptsParagraph(line, nextLine, inList) {
  if (matchAtx(line)) return true;
  if (matchFence(line)) return true;
  const hb = matchHtmlBlock(line);
  if (hb && hb[0] <= 6) return true;
  if (matchHr(line)) return true;
  const ls = matchListStart(line);
  if (ls && ls.content !== '') {
    // An ordered list interrupts a paragraph only when it starts with 1,
    // except inside a list item's own content, where any start number
    // interrupts (marked's behaviour).
    if (!ls.ordered || ls.start === 1 || inList) return true;
  }
  const [, ix] = indentOf(line);
  if (line[ix] === '>') return true;
  if (nextLine !== undefined && line.indexOf('|') !== -1 && isDelimiterRow(nextLine)) return true;
  return false;
}

// List item start: {ordered, bullet, delim, start, markerLen, contentIndent, content}
function matchListStart(line) {
  const [col, idx] = indentOf(line);
  if (col > 3) return null;
  let i = idx;
  const ch = line[i];
  if (ch === '-' || ch === '*' || ch === '+') {
    const nx = line[i + 1];
    if (nx !== undefined && nx !== ' ' && nx !== '\t') return null;
    // Whitespace columns after the marker (tab advances to next tab stop).
    let j = i + 1, c = 0, cc = 1;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) {
      if (line[j] === ' ') { c++; cc++; }
      else { const w = 4 - (cc % 4); c += w; cc += w; }
      if (c > 4) break;
      j++;
    }
    const relIndent = j >= line.length ? 2 : (c >= 5 ? 2 : 1 + c);
    const contentIndent = col + relIndent;
    return { ordered: false, bullet: ch, delim: null, start: 0, markerLen: 1, contentIndent, content: stripContainer(line, contentIndent) };
  }
  if (isDigit(ch)) {
    let j = i;
    while (j < line.length && isDigit(line[j])) j++;
    if (j - i > 9) return null;
    const d = line[j];
    if (d !== '.' && d !== ')') return null;
    const nx = line[j + 1];
    if (nx !== undefined && nx !== ' ' && nx !== '\t') return null;
    const markerLen = j + 1 - i;
    let k = j + 1, c = 0;
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) {
      if (line[k] === ' ') c++;
      else c += 4 - ((markerLen + c) % 4);
      if (c > 4) break;
      k++;
    }
    const relIndent = k >= line.length ? markerLen + 1 : (c >= 5 ? markerLen + 1 : markerLen + c);
    const contentIndent = col + relIndent;
    return { ordered: true, bullet: null, delim: d, start: parseInt(line.slice(i, j), 10), markerLen, contentIndent, content: stripContainer(line, contentIndent) };
  }
  return null;
}

function isDelimiterRow(line) {
  const cells = splitTableRow(line);
  if (cells === null || cells.length === 0) return false;
  for (const cell of cells) {
    if (!/^ *:?-+:? *$/.test(cell)) return false;
  }
  return true;
}

// Split a table row into cells. Returns null when the row has no pipes.
function splitTableRow(line) {
  let s = line.trim();
  if (s.indexOf('|') === -1) return null;
  if (s[0] === '|') s = s.slice(1);
  if (s.length > 0 && s[s.length - 1] === '|' && s[s.length - 2] !== '\\') s = s.slice(0, -1);
  const cells = [];
  let cur = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && (s[i + 1] === '|' || s[i + 1] === '\\')) { cur += s[i + 1]; i += 2; continue; }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  cells.push(cur.trim());
  return cells;
}

function parseBlocks(lines, start, end, refs, top, eol, inList) {
  const blocks = [];
  // Whether two consecutive blocks in this scope were separated by a
  // blank line. Used for list looseness (per list, not per item).
  let hasBlankBetween = false;
  let sawBlank = false;
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (isBlank(line)) { sawBlank = true; i++; continue; }
    const defLines = tryDef(lines, i, refs);
    if (defLines > 0) {
      // A definition is a block: a blank line before it separates blocks.
      if (blocks.length > 0 && sawBlank) hasBlankBetween = true;
      sawBlank = false;
      i += defLines; continue;
    }
    if (blocks.length > 0 && sawBlank) hasBlankBetween = true;
    sawBlank = false;
    const atx = matchAtx(line);
    if (atx) { blocks.push({ t: 'h', level: atx[0], text: atx[1] }); i++; continue; }
    const fence = matchFence(line);
    if (fence) {
      const [ch, len, , fenceIndent] = fence;
      const content = [];
      let j = i + 1;
      let closed = false;
      while (j < end) {
        const l = lines[j];
        const [c2, ix2] = indentOf(l);
        if (c2 <= 3) {
          let k = ix2, run = 0;
          while (k < l.length && l[k] === ch) { run++; k++; }
          if (run >= len) {
            let m = k;
            while (m < l.length && (l[m] === ' ' || l[m] === '\t')) m++;
            if (m === l.length) { closed = true; break; }
          }
        }
        // A backtick fence strips up to its own indent from content
        // lines; a tilde fence keeps content lines verbatim (marked
        // does not strip the indent for ~~~ fences).
        content.push(ch === '`' && fenceIndent > 0 ? stripIndent(l, fenceIndent) : l);
        j++;
      }
      // A closed fence drops one trailing empty line from its content.
      if (closed && content.length && content[content.length - 1] === '') content.pop();
      blocks.push({ t: 'code', lang: fence[2], text: content.join('\n') + (content.length ? '\n' : '') });
      i = closed ? j + 1 : j;
      continue;
    }
    const hb = matchHtmlBlock(line);
    if (hb) {
      const [type, endMark] = hb;
      const content = [line];
      let j = i + 1;
      if (type <= 5) {
        // The end marker may already be on the first line.
        if (line.indexOf(endMark) !== -1) { j = i + 1; }
        else {
          while (j < end) {
            content.push(lines[j]);
            if (lines[j].indexOf(endMark) !== -1) { j++; break; }
            j++;
          }
        }
      } else {
        while (j < end && !isBlank(lines[j])) { content.push(lines[j]); j++; }
      }
      // The block's text is its lines joined by newlines. A trailing
      // newline is kept when the block runs to the end of the top-level
      // input that ends with one. Type 1-5 blocks end at an end marker,
      // so a trailing newline is also kept when a next line exists and
      // is non-empty (even a whitespace-only line, e.g. a lone tab,
      // counts: it is not an empty line). Type 6-7 blocks end at a
      // blank line, which already separates them, so no trailing
      // newline is added for them.
      let text = content.join('\n');
      const nextNonEmpty = type <= 5 && j < end && lines[j].length > 0;
      if (nextNonEmpty || (j >= end && top && eol)) text += '\n';
      blocks.push({ t: 'html', text });
      i = j;
      continue;
    }
    if (matchHr(line)) { blocks.push({ t: 'hr' }); i++; continue; }
    const [col] = indentOf(line);
    if (col >= 4) {
      const content = [];
      let j = i;
      while (j < end) {
        const l = lines[j];
        if (isBlank(l)) {
          // Include the blank line only if a later indented line follows;
          // its content is the line with the code indent removed.
          let k = j + 1;
          while (k < end && isBlank(lines[k])) k++;
          if (k < end && indentOf(lines[k])[0] >= 4) { content.push(stripIndent(l, 4)); j++; continue; }
          break;
        }
        if (indentOf(l)[0] < 4) break;
        content.push(stripIndent(l, 4));
        j++;
      }
      blocks.push({ t: 'code', lang: null, text: content.join('\n') + (content.length ? '\n' : '') });
      i = j;
      continue;
    }
    const [, ix] = indentOf(line);
    if (line[ix] === '>') { i = parseBlockquote(lines, i, end, refs, blocks); continue; }
    const ls = matchListStart(line);
    if (ls) { i = parseList(lines, i, end, refs, blocks); continue; }
    // Table: header line + delimiter row. The delimiter row must have the
    // same number of cells as the header, or it is not a table.
    if (i + 1 < end && line.indexOf('|') !== -1 && isDelimiterRow(lines[i + 1])) {
      const head = splitTableRow(line);
      const delimCells = splitTableRow(lines[i + 1]);
      if (delimCells.length !== head.length) {
        // Not a table after all: fall through to the paragraph branch.
        const r = parseParagraph(lines, i, end, refs, inList);
        blocks.push(r.block);
        i = r.next;
        continue;
      }
      const ncol = delimCells.length;
      const align = delimCells.map((c) => {
        const left = c.trim().startsWith(':');
        const right = c.trim().endsWith(':');
        return left && right ? 'center' : left ? 'left' : right ? 'right' : null;
      });
      const rows = [];
      let j = i + 2;
      // A whitespace-only line of 0-3 spaces followed by a single tab is
      // a table row (with empty cells), not a blank line ending the
      // table; any other blank line ends it.
      const isTabRow = (l) => /^ {0,3}\t$/.test(l);
      while (j < end && (!isBlank(lines[j]) || isTabRow(lines[j]))) {
        // A line starting another block (blockquote, heading, fence, hr,
        // HTML block, list item) ends the table; a plain line is a row.
        const rl = lines[j];
        const [rc, rix] = indentOf(rl);
        if (rl[rix] === '>' || matchAtx(rl) || matchFence(rl) || matchHr(rl) || matchListStart(rl)) break;
        const rhb = matchHtmlBlock(rl);
        if (rhb && rhb[0] <= 6) break;
        // A body row without pipes is a single-cell row.
        let cells = splitTableRow(rl);
        if (cells === null) cells = [rl.trim()];
        while (cells.length < ncol) cells.push('');
        rows.push(cells.slice(0, ncol));
        j++;
      }
      blocks.push({ t: 'table', align, head: head.slice(0, ncol), rows });
      i = j;
      continue;
    }
    // Paragraph.
    const r = parseParagraph(lines, i, end, refs, inList);
    blocks.push(r.block);
    i = r.next;
  }
  blocks.hasBlankBetween = hasBlankBetween;
  return blocks;
}

// Paragraph: gather lines until a blank line or an interrupting block.
// A link reference definition never occurs in the middle of a paragraph:
// once a paragraph has text, a definition line is just paragraph text.
function parseParagraph(lines, i, end, refs, inList) {
  const textLines = [];
  let j = i;
  while (j < end) {
    const line = lines[j];
    if (isBlank(line)) {
      // A whitespace-only line that is the last line of this scope is
      // paragraph text (marked's behaviour, e.g. "> foo\n>  \n"). An empty
      // last line is not: it just ends the paragraph.
      if (line.length > 0 && j === end - 1) { textLines.push(line); j++; }
      break;
    }
    if (j > i) {
      const se = matchSetext(line);
      if (se) {
        const text = textLines.join('\n').replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        return { block: { t: 'h', level: se, text }, next: j + 1 };
      }
      if (interruptsParagraph(line, j + 1 < end ? lines[j + 1] : undefined, inList)) break;
    }
    textLines.push(line);
    j++;
  }
  return { block: { t: 'p', text: textLines.join('\n') }, next: j };
}

// Whether the given lines (a quote's or list item's content) end inside a
// fenced code block. A lazy line after such content is not a paragraph
// continuation.
// Number of content lines in the currently-open fenced code block in
// `lines` (lines after the opening fence), or -1 when not in a fence.
function fenceContentLines(lines) {
  let ch = null, len = 0, count = 0;
  for (const l of lines) {
    if (ch !== null) {
      const [c2, ix2] = indentOf(l);
      if (c2 <= 3) {
        let k = ix2, run = 0;
        while (k < l.length && l[k] === ch) { run++; k++; }
        if (run >= len) {
          let m = k;
          while (m < l.length && (l[m] === ' ' || l[m] === '\t')) m++;
          if (m === l.length) { ch = null; len = 0; count = 0; continue; }
        }
      }
      count++;
      continue;
    }
    const f = matchFence(l);
    if (f) { ch = f[0]; len = f[1]; count = 0; }
  }
  return ch !== null ? count : -1;
}

function endsInFence(lines) {
  let ch = null, len = 0;
  for (const l of lines) {
    if (ch !== null) {
      const [c2, ix2] = indentOf(l);
      if (c2 <= 3) {
        let k = ix2, run = 0;
        while (k < l.length && l[k] === ch) { run++; k++; }
        if (run >= len) {
          let m = k;
          while (m < l.length && (l[m] === ' ' || l[m] === '\t')) m++;
          if (m === l.length) { ch = null; len = 0; continue; }
        }
      }
      continue;
    }
    const f = matchFence(l);
    if (f) { ch = f[0]; len = f[1]; }
  }
  return ch !== null;
}

// Whether a line is a paragraph continuation line (so a following lazy
// line inside a block quote or list item may continue it). A line indented
// by 4+ columns is code, not paragraph text; a setext underline, a table
// header line, and a type 1-6 HTML block are not paragraph lines either.
function isParaLine(line, next) {
  if (isBlank(line)) return false;
  if (indentOf(line)[0] >= 4) return false;
  if (matchAtx(line) || matchFence(line) || matchHr(line) || matchSetext(line)) return false;
  const hb = matchHtmlBlock(line);
  if (hb && hb[0] <= 6) return false;
  if (next !== undefined && line.indexOf('|') !== -1 && isDelimiterRow(next)) return false;
  return true;
}

// Blockquote starting at lines[i]. Returns the next line index.
function parseBlockquote(lines, i, end, refs, blocks) {
  const qlines = [];
  let j = i;
  let inPara = false;
  while (j < end) {
    const l = lines[j];
    const [c, ix] = indentOf(l);
    if (c <= 3 && l[ix] === '>') {
      // The marker is '>' plus an optional single space (a tab counts as
      // that space, consuming one of its columns).
      const after = l[ix + 1];
      const cols = c + (after === ' ' || after === '\t' ? 2 : 1);
      const inner = stripContainer(l, cols);
      qlines.push(inner);
      inPara = isParaLine(inner, j + 1 < end ? lines[j + 1] : undefined) && !endsInFence(qlines);
      j++;
      continue;
    }
    // A blank line without a '>' marker ends the block quote (marked
    // renders "> foo\n\n> bar" as two separate block quotes).
    if (isBlank(l)) break;
    if (inPara && !interruptsParagraph(l, j + 1 < end ? lines[j + 1] : undefined)) {
      // Lazy continuation line. It is paragraph text, so it is joined to
      // the previous inner line (never re-parsed as a block: a lazy
      // "- bar" is text, not a list item). Its leading whitespace is
      // kept, except that a run of 4+ columns loses its first 4 columns
      // (the indented-code indent); a tab in the run is consumed whole
      // when it lands on that boundary. A setext-looking lazy line is
      // kept as its own line, indented by four spaces so it stays
      // paragraph text.
      const stripped = stripLazyIndent(l);
      if (matchSetext(stripped)) qlines.push('    ' + stripped);
      else qlines[qlines.length - 1] += '\n' + stripped;
      j++;
      continue;
    }
    break;
  }
  const kids = parseBlocks(qlines, 0, qlines.length, refs, false, false);
  blocks.push({ t: 'q', kids });
  return j;
}

// List starting at lines[i]. Returns the next line index.
function parseList(lines, i, end, refs, blocks) {
  const first = matchListStart(lines[i]);
  const ordered = first.ordered;
  const items = [];
  let loose = false;
  let j = i;
  let cur = null; // {lines, contentIndent}
  const flushItem = () => {
    if (!cur) return;
    // Strip trailing blank lines from the item's content.
    while (cur.lines.length && isBlank(cur.lines[cur.lines.length - 1])) cur.lines.pop();
    items.push(cur);
    cur = null;
  };
  while (j < end) {
    const line = lines[j];
    // A line inside a fenced code block is fence content, even when its
    // indent is below the item's content indent (even a blank line, even
    // a line at column 0): the fence swallows it until its closing fence.
    // Strip only leading whitespace up to the content indent: the line
    // may have less indent than that, and its text must not be eaten.
    // Exception: when the fence has no content yet, a line below the
    // content indent does not belong to it at all -- the fence stays
    // empty and the line ends the item (marked: '+ item\n  ```\ncode\n  ```'
    // gives an empty fence and a separate paragraph). Only once a content
    // line at/above the indent has established the fence do lower lines
    // get swallowed.
    if (cur && endsInFence(cur.lines)) {
      const [ccol] = indentOf(line);
      if (ccol >= cur.contentIndent || fenceContentLines(cur.lines) > 0) {
        cur.lines.push(stripContainerIndent(line, cur.contentIndent));
        j++;
        continue;
      }
    }
    if (isBlank(line)) {
      // A blank line belongs to the list if more list content follows.
      // Consecutive blank lines collapse to one inside an item.
      let k = j + 1;
      while (k < end && isBlank(lines[k])) k++;
      if (k >= end) break;
      const ls = matchListStart(lines[k]);
      const sameItem = ls && ls.ordered === ordered && (ordered ? ls.delim === first.delim : ls.bullet === first.bullet) && (!cur || indentOf(lines[k])[0] < cur.contentIndent);
      const contIndent = cur ? indentOf(lines[k])[0] >= cur.contentIndent : false;
      // An empty item followed by a blank line ends the list: the content
      // after the blank line is not part of the item.
      const curEmpty = cur !== null && !cur.lines.some((x) => !isBlank(x));
      if (curEmpty && !sameItem) break;
      if (sameItem) loose = true;
      if (sameItem || contIndent) {
        if (cur) cur.lines.push('');
        j++;
        continue;
      }
      break;
    }
    const ls = matchListStart(line);
    const markerIndent = indentOf(line)[0];
    if (ls && ls.ordered === ordered && (ordered ? ls.delim === first.delim : ls.bullet === first.bullet) && (!cur || markerIndent < cur.contentIndent)) {
      // A thematic break ends the list even when it looks like an item.
      if (matchHr(line)) break;
      flushItem();
      cur = { lines: [ls.content], contentIndent: ls.contentIndent, bullet: ls.bullet, delim: ls.delim, start: ls.start };
      j++;
      continue;
    }
    if (!cur) break;
    const [col] = indentOf(line);
    if (col >= cur.contentIndent) {
      cur.lines.push(stripContainer(line, cur.contentIndent));
      j++;
      continue;
    }
    // A line starting a different list ends this list.
    if (matchListStart(line)) break;
    // Lazy continuation of the item's paragraph?
    const inner = cur.lines;
    const lastLine = inner.length ? inner[inner.length - 1] : null;
    const inPara = lastLine !== null && isParaLine(lastLine, j + 1 < end ? lines[j + 1] : undefined) && !endsInFence(inner);
    if (inPara && !interruptsParagraph(line, j + 1 < end ? lines[j + 1] : undefined, true)) {
      // Lazy continuation of the item's paragraph: its leading
      // whitespace is kept, except that a run of 4+ columns loses its
      // first 4 columns (the indented-code indent); a tab in the run
      // is consumed whole when it lands on that boundary.
      const stripped = stripLazyIndent(line);
      if (matchSetext(stripped)) inner.push('    ' + stripped);
      else inner[inner.length - 1] += '\n' + stripped;
      j++;
      continue;
    }
    break;
  }
  flushItem();
  const parsed = items.map((it) => {
    const kids = parseBlocks(it.lines, 0, it.lines.length, refs, false, false, true);
    // A list is loose when an item's own blocks are separated by a blank
    // line. (A blank line inside a nested list does not loosen the outer
    // list, and a leading blank line from an empty marker line does not
    // loosen it either.)
    if (kids.hasBlankBetween) loose = true;
    return { kids };
  });
  blocks.push({ t: 'list', ordered, start: first.start, tight: !loose, items: parsed });
  return j;
}

// ---------- rendering ----------
function langClass(info) {
  if (!info) return '';
  const first = info.split(/[ \t]+/)[0];
  if (!first) return '';
  return ' class="language-' + escText(unescape(first)) + '"';
}

function renderBlocks(blocks, refs, out) {
  for (const b of blocks) {
    if (b.t === 'p') {
      out.push('<p>' + parseInline(b.text, refs, true) + '</p>\n');
    } else if (b.t === 'h') {
      out.push('<h' + b.level + '>' + parseInline(b.text, refs, true) + '</h' + b.level + '>\n');
    } else if (b.t === 'code') {
      out.push('<pre><code' + langClass(b.lang) + '>' + escCode(b.text) + '</code></pre>\n');
    } else if (b.t === 'html') {
      out.push(b.text);
    } else if (b.t === 'hr') {
      out.push('<hr>\n');
    } else if (b.t === 'q') {
      out.push('<blockquote>\n');
      renderBlocks(b.kids, refs, out);
      out.push('</blockquote>\n');
    } else if (b.t === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      const startAttr = b.ordered && b.start !== 1 ? ' start="' + b.start + '"' : '';
      out.push('<' + tag + startAttr + '>\n');
      for (const item of b.items) {
        out.push('<li>');
        renderListItem(item, b.tight, refs, out);
        out.push('</li>\n');
      }
      out.push('</' + tag + '>\n');
    } else if (b.t === 'table') {
      out.push('<table>\n<thead>\n<tr>\n');
      for (let c = 0; c < b.head.length; c++) {
        const a = b.align[c];
        out.push('<th' + (a ? ' align="' + a + '"' : '') + '>' + parseInline(b.head[c], refs, true) + '</th>\n');
      }
      out.push('</tr>\n</thead>\n');
      if (b.rows.length) {
        out.push('<tbody>');
        for (const row of b.rows) {
          out.push('<tr>\n');
          for (let c = 0; c < row.length; c++) {
            const a = b.align[c];
            out.push('<td' + (a ? ' align="' + a + '"' : '') + '>' + parseInline(row[c], refs, true) + '</td>\n');
          }
          out.push('</tr>\n');
        }
        out.push('</tbody>');
      }
      out.push('</table>\n');
    }
  }
}

function renderListItem(item, tight, refs, out) {
  let kids = item.kids;
  // Task list: the item's first paragraph starts with [ ] / [x] / [X].
  let task = null;
  if (kids.length && kids[0].t === 'p') {
    const m = /^\[([ xX])\]( |$)/.exec(kids[0].text);
    if (m) {
      task = m[1] === ' ' ? '' : ' checked=""';
      kids = kids.slice();
      kids[0] = { t: 'p', text: kids[0].text.slice(3) };
    }
  }
  if (task !== null) {
    const box = '<input' + task + ' disabled="" type="checkbox">';
    if (tight) {
      out.push(box);
      const sub = [];
      for (const k of kids) {
        if (k.t === 'p') sub.push(parseInline(k.text, refs, true));
        else renderBlocks([k], refs, sub);
      }
      out.push(sub.join(''));
      return;
    }
    // Loose list: the checkbox goes inside the first paragraph.
    const sub = [];
    renderBlocks(kids, refs, sub);
    let html = sub.join('');
    if (html.startsWith('<p>')) html = '<p>' + box + html.slice(3);
    else html = box + html;
    out.push(html);
    return;
  }
  if (tight) {
    const sub = [];
    for (const k of kids) {
      if (k.t === 'p') sub.push(parseInline(k.text, refs, true));
      else renderBlocks([k], refs, sub);
    }
    out.push(sub.join(''));
  } else {
    renderBlocks(kids, refs, out);
  }
}

// ---------- entry point ----------
export function parse(md) {
  inLink = false;
  let src = md.replace(/\r\n?/g, '\n').replace(/\0/g, '\uFFFD');
  const eol = src.endsWith('\n');
  const lines = src.split('\n');
  // A trailing newline ends the last line; it is not a line of its own.
  if (eol) lines.pop();
  const refs = {};
  const blocks = parseBlocks(lines, 0, lines.length, refs, true, eol);
  const out = [];
  renderBlocks(blocks, refs, out);
  return out.join('');
}

// ---------- driver ----------
const inputPath = process.argv[2] || (process.env.MAKEFUN_INPUT_DIR ? process.env.MAKEFUN_INPUT_DIR + '/cases.json' : '/input/cases.json');
const outputPath = process.argv[3] || (process.env.MAKEFUN_OUTPUT_DIR ? process.env.MAKEFUN_OUTPUT_DIR + '/html.json' : '/output/html.json');
const cases = JSON.parse(readFileSync(inputPath, 'utf8'));
const html = cases.map((c) => parse(c.markdown));
mkdirSync(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true });
writeFileSync(outputPath, JSON.stringify(html) + '\n');
