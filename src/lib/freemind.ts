// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The FreeMind mind map writer of EX2: a `<map version="1.0.1">` document with the node layout
// CKM serves for archetypes (`/ckm/rest/v1/archetypes/{cid}/mindmap`): a root node and child
// nodes, each with an optional note as `<richcontent TYPE="NOTE">` holding XHTML.

/** One node of the map. `note` is plain text; each line becomes one paragraph of the note. */
export interface MindMapNode {
  id: string;
  text: string;
  note?: string;
  children?: readonly MindMapNode[];
}

// NOTE: XML 1.0, section 2.2 (https://www.w3.org/TR/xml/#charsets). These code points cannot
// appear in an XML document, not even as a character reference, so they are dropped.
// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are the point.
const NOT_XML_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDFFF]/gu;

/**
 * Escapes text for an XML attribute or element. Markup characters become entities; line breaks
 * and every character outside ASCII become numeric references, so the file reads the same
 * whatever encoding a reader assumes (CKM writes no XML declaration either).
 */
export function xmlEscape(text: string): string {
  let out = "";
  for (const char of text.replace(NOT_XML_CHAR, "")) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "&") out += "&amp;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (char === '"') out += "&quot;";
    else if (char === "'") out += "&apos;";
    else if (code === 0x09 || code === 0x0a || code === 0x0d || code > 0x7e) {
      out += `&#${code};`;
    } else out += char;
  }
  return out;
}

function note(text: string): string {
  const paragraphs = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${xmlEscape(line)}</p>`);
  if (paragraphs.length === 0) return "";
  return `<richcontent TYPE="NOTE"><html><head></head><body>${paragraphs.join("")}</body></html></richcontent>\n`;
}

function node(item: MindMapNode, depth: number): string {
  const position = depth === 1 ? ' POSITION="right"' : "";
  const children = (item.children ?? []).map((child) => node(child, depth + 1)).join("");
  return (
    `<node ID="${xmlEscape(item.id)}"${position} TEXT="${xmlEscape(item.text)}">\n` +
    (depth === 0 ? '<font NAME="SansSerif" SIZE="14" BOLD="true"/>\n' : "") +
    (item.note === undefined ? "" : note(item.note)) +
    children +
    "</node>\n"
  );
}

/** Writes a FreeMind 1.0.1 document with `root` as its root node. */
export function writeFreeMind(root: MindMapNode): string {
  return (
    '<map version="1.0.1">\n' +
    "<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n" +
    node(root, 0) +
    "</map>\n"
  );
}
