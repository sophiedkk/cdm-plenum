// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { writeFreeMind, xmlEscape } from "./freemind";

describe("xmlEscape", () => {
  it("escapes the five markup characters", () => {
    expect(xmlEscape(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;",
    );
  });

  it("writes line breaks, tabs and non-ASCII letters as numeric references", () => {
    expect(xmlEscape("a\tb\r\nc")).toBe("a&#9;b&#13;&#10;c");
    expect(xmlEscape("ëën")).toBe("&#235;&#235;n");
    expect(xmlEscape("Πίεση")).toBe("&#928;&#943;&#949;&#963;&#951;");
    expect(xmlEscape("🩺")).toBe("&#129658;");
  });

  it("drops characters XML 1.0 does not allow", () => {
    expect(xmlEscape("a\u0000b\u0007c\u001Fd￿e\uD800f")).toBe("abcdef");
  });

  it("returns an empty string for an empty text", () => {
    expect(xmlEscape("")).toBe("");
  });
});

describe("writeFreeMind", () => {
  it("writes a FreeMind 1.0.1 map with the root and its children on the right", () => {
    const map = writeFreeMind({
      id: "root",
      text: "Blood pressure",
      children: [
        { id: "ID_1", text: "Systolic", note: "Peak pressure.\nIn mmHg." },
        { id: "ID_2", text: "Diastolic" },
      ],
    });
    expect(map).toBe(
      [
        '<map version="1.0.1">',
        "<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->",
        '<node ID="root" TEXT="Blood pressure">',
        '<font NAME="SansSerif" SIZE="14" BOLD="true"/>',
        '<node ID="ID_1" POSITION="right" TEXT="Systolic">',
        '<richcontent TYPE="NOTE"><html><head></head><body><p>Peak pressure.</p><p>In mmHg.</p></body></html></richcontent>',
        "</node>",
        '<node ID="ID_2" POSITION="right" TEXT="Diastolic">',
        "</node>",
        "</node>",
        "</map>",
        "",
      ].join("\n"),
    );
  });

  it("escapes text in node names and notes", () => {
    const map = writeFreeMind({
      id: "root",
      text: 'Bloeddruk "zittend" & <liggend>',
      children: [{ id: "ID_1", text: "Systolisch", note: "</p></body><script>x</script>" }],
    });
    expect(map).toContain('TEXT="Bloeddruk &quot;zittend&quot; &amp; &lt;liggend&gt;"');
    expect(map).toContain("<p>&lt;/p&gt;&lt;/body&gt;&lt;script&gt;x&lt;/script&gt;</p>");
    expect(map).not.toContain("<script>");
  });

  it("writes Greek and Dutch text as character references", () => {
    const map = writeFreeMind({ id: "root", text: "Αρτηριακή πίεση", note: "Één meting" });
    expect(map).toContain(
      'TEXT="&#913;&#961;&#964;&#951;&#961;&#953;&#945;&#954;&#942; &#960;&#943;&#949;&#963;&#951;"',
    );
    expect(map).toContain("<p>&#201;&#233;n meting</p>");
    const ascii = [...map].every((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code === 0x0a || (code >= 0x20 && code <= 0x7e);
    });
    expect(ascii).toBe(true);
  });

  it("writes no note for an empty or blank description", () => {
    const map = writeFreeMind({
      id: "root",
      text: "Root",
      children: [
        { id: "ID_1", text: "A", note: "" },
        { id: "ID_2", text: "B", note: " \n \n" },
      ],
    });
    expect(map).not.toContain("richcontent");
  });

  it("writes a map with only a root", () => {
    expect(writeFreeMind({ id: "root", text: "" })).toBe(
      '<map version="1.0.1">\n' +
        "<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n" +
        '<node ID="root" TEXT="">\n<font NAME="SansSerif" SIZE="14" BOLD="true"/>\n</node>\n</map>\n',
    );
  });
});
