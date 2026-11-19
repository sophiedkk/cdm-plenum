// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The archetype XML parser against trimmed real CKM archetypes (tests/fixtures/ckm/).
import { describe, expect, it } from "vitest";
import { parseArchetypeXml } from "./parse.ts";
import { ckmFixture } from "./test-fixtures.ts";

function parsed(name: string) {
  const result = parseArchetypeXml(ckmFixture(name));
  if (!result.ok) throw new Error(`parse failed: ${result.error}`);
  return result.value;
}

describe("parseArchetypeXml on blood pressure v2", () => {
  const archetype = parsed("blood_pressure.v2.xml");

  it("reads the archetype ID, the original language and the build uid", () => {
    expect(archetype.archetypeId).toBe("openEHR-EHR-OBSERVATION.blood_pressure.v2");
    expect(archetype.originalLanguage).toBe("en");
    expect(archetype.buildUid).toBe("ac39a1a0-a269-4816-9391-7f475515f04e");
  });

  it("lists every ELEMENT once, in document order, and skips internal references", () => {
    expect(archetype.elements.map((element) => element.atCode)).toEqual([
      "at0004",
      "at0005",
      "at1006",
      "at1007",
      "at1059",
      "at0033",
      "at0008",
      "at1052",
      "at1043",
      "at1005",
      "at0013",
      "at0014",
      "at1035",
      "at1038",
      "at1054",
      "at1055",
      "at1010",
    ]);
  });

  it("reads path, English term text, description, RM type and occurrences", () => {
    expect(archetype.elements[0]).toEqual({
      path: "/data[at0001]/events[at0006]/data[at0003]/items[at0004]",
      atCode: "at0004",
      name: "Systolic",
      description:
        "Peak systemic arterial blood pressure  - measured in systolic or contraction phase of the heart cycle.",
      rmTypes: ["DV_QUANTITY"],
      occurrences: { min: 0, max: 1 },
    });
  });

  it("reads elements under state and protocol, and a choice of two RM types", () => {
    const position = archetype.elements.find((element) => element.atCode === "at0008");
    expect(position?.path).toBe("/data[at0001]/events[at0006]/state[at0007]/items[at0008]");
    expect(position?.name).toBe("Position");
    expect(position?.rmTypes).toEqual(["DV_CODED_TEXT"]);
    const location = archetype.elements.find((element) => element.atCode === "at0014");
    expect(location?.path).toBe("/protocol[at0011]/items[at0014]");
    expect(location?.rmTypes).toEqual(["DV_CODED_TEXT", "DV_TEXT"]);
  });
});

describe("parseArchetypeXml on other archetypes", () => {
  it("decodes DV_INTERVAL<DV_QUANTITY> as CKM writes it (dosage v2)", () => {
    const dose = parsed("dosage.v2.xml").elements.find((element) => element.atCode === "at0144");
    expect(dose?.path).toBe("/items[at0144]");
    expect(dose?.rmTypes).toEqual(["DV_QUANTITY", "DV_INTERVAL<DV_QUANTITY>"]);
  });

  it("gives no RM type to an element whose value the archetype leaves open (analyte v1)", () => {
    const archetype = parsed("laboratory_test_analyte.v1.xml");
    const result = archetype.elements.find((element) => element.atCode === "at0001");
    expect(result?.rmTypes).toEqual([]);
    expect(result?.name).toBe("Analyte result");
  });
});

/** A minimal archetype with one element; `extra` goes inside the ELEMENT node. */
function minimal(options: { occurrences?: string; term?: string; language?: string } = {}) {
  const occurrences =
    options.occurrences ??
    "<occurrences><lower_included>true</lower_included><upper_included>true</upper_included><lower_unbounded>false</lower_unbounded><upper_unbounded>false</upper_unbounded><lower>1</lower><upper>1</upper></occurrences>";
  const term = options.term ?? '<items code="at0001"><items id="text">Weight</items></items>';
  return `<?xml version="1.0" encoding="UTF-8"?>
<archetype xmlns="http://schemas.openehr.org/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <original_language><code_string>${options.language ?? "nl"}</code_string></original_language>
  <archetype_id><value>openEHR-EHR-CLUSTER.example.v1</value></archetype_id>
  <definition>
    <rm_type_name>CLUSTER</rm_type_name>
    <node_id>at0000</node_id>
    <attributes xsi:type="C_MULTIPLE_ATTRIBUTE">
      <rm_attribute_name>items</rm_attribute_name>
      <children xsi:type="C_COMPLEX_OBJECT">
        <rm_type_name>ELEMENT</rm_type_name>
        ${occurrences}
        <node_id>at0001</node_id>
      </children>
    </attributes>
  </definition>
  <ontology>
    <term_definitions language="en"><items code="at0001"><items id="text">English</items></items></term_definitions>
    <term_definitions language="nl">${term}</term_definitions>
  </ontology>
</archetype>`;
}

describe("parseArchetypeXml details", () => {
  it("takes the term text of the original language, not English", () => {
    const result = parseArchetypeXml(minimal());
    expect(result.ok && result.value.elements[0]?.name).toBe("Weight");
  });

  it("falls back to the at-code when the term has no text", () => {
    const result = parseArchetypeXml(minimal({ term: "" }));
    expect(result.ok && result.value.elements[0]?.name).toBe("at0001");
  });

  it("decodes the predefined entities in term text", () => {
    const term =
      '<items code="at0001"><items id="text">Weight &amp; height &#x3E; 0</items></items>';
    const result = parseArchetypeXml(minimal({ term }));
    expect(result.ok && result.value.elements[0]?.name).toBe("Weight & height > 0");
  });

  it("leaves an undeclared or HTML entity as written", () => {
    const term = '<items code="at0001"><items id="text">A &nbsp; B &#0; C</items></items>';
    const result = parseArchetypeXml(minimal({ term }));
    expect(result.ok && result.value.elements[0]?.name).toBe("A &nbsp; B &#0; C");
  });

  it("reads an unbounded upper occurrence as max null", () => {
    const occurrences =
      "<occurrences><lower_included>true</lower_included><lower_unbounded>false</lower_unbounded><upper_unbounded>true</upper_unbounded><lower>0</lower></occurrences>";
    const result = parseArchetypeXml(minimal({ occurrences }));
    expect(result.ok && result.value.elements[0]?.occurrences).toEqual({ min: 0, max: null });
  });

  it("reads excluded bounds as the nearest included integer", () => {
    const occurrences =
      "<occurrences><lower_included>false</lower_included><upper_included>false</upper_included><lower_unbounded>false</lower_unbounded><upper_unbounded>false</upper_unbounded><lower>0</lower><upper>3</upper></occurrences>";
    const result = parseArchetypeXml(minimal({ occurrences }));
    expect(result.ok && result.value.elements[0]?.occurrences).toEqual({ min: 1, max: 2 });
  });

  it("gives null occurrences when the node has none or they are not integers", () => {
    const none = parseArchetypeXml(minimal({ occurrences: " " }));
    expect(none.ok && none.value.elements[0]?.occurrences).toBeNull();
    const bad = parseArchetypeXml(
      minimal({ occurrences: "<occurrences><lower>one</lower></occurrences>" }),
    );
    expect(bad.ok && bad.value.elements[0]?.occurrences).toBeNull();
  });

  it("gives null for the build uid when the description has none", () => {
    const result = parseArchetypeXml(minimal());
    expect(result.ok && result.value.buildUid).toBeNull();
  });
});

describe("parseArchetypeXml refusals", () => {
  it("refuses a document with a DOCTYPE, so no entity is ever declared (XXE)", () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE archetype [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<archetype><archetype_id><value>&xxe;</value></archetype_id></archetype>`;
    expect(parseArchetypeXml(xxe)).toEqual({ ok: false, error: "doctype" });
  });

  it("refuses an entity expansion bomb", () => {
    const bomb = `<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><archetype>&lol2;</archetype>`;
    expect(parseArchetypeXml(bomb)).toEqual({ ok: false, error: "doctype" });
  });

  it("refuses malformed XML", () => {
    expect(parseArchetypeXml("<archetype><definition></archetype>")).toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("refuses a document that is not an archetype", () => {
    expect(parseArchetypeXml("<template><id>x</id></template>")).toEqual({
      ok: false,
      error: "not_an_archetype",
    });
    expect(parseArchetypeXml("<archetype><definition/></archetype>")).toEqual({
      ok: false,
      error: "not_an_archetype",
    });
  });
});
