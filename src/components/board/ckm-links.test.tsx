// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CKM link of an element (EL4) and the links of merged duplicates as provenance (EL5, O-5).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ElementCkmLink } from "@/server/elements/queries";
import { CkmLinks } from "./ckm-links";

afterEach(cleanup);

const BP = "openEHR-EHR-OBSERVATION.blood_pressure.v2";

function link(atCode: string, name: string): ElementCkmLink {
  return {
    archetypeId: BP,
    cid: "1013.1.3574",
    revision: "2.0.17",
    atCode,
    ckmElementName: name,
    rmType: "DV_QUANTITY",
  };
}

describe("CkmLinks", () => {
  it("shows the element's own link without a provenance list when nothing was merged", () => {
    render(<CkmLinks link={link("at0004", "Systolic")} merged={[]} />);
    expect(screen.getByText("Linked to CKM")).toBeTruthy();
    expect(screen.getByText(`${BP}, revision 2.0.17, element at0004 (Systolic)`)).toBeTruthy();
    expect(screen.queryByText("Also linked via merged duplicate")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists the merged duplicates' links under their own label beside the element's link", () => {
    render(
      <CkmLinks
        link={link("at0004", "Systolic")}
        merged={[link("at0005", "Diastolic"), link("at1006", "Mean arterial pressure")]}
      />,
    );
    const list = screen.getByRole("list", { name: "Also linked via merged duplicate" });
    expect([...list.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      `${BP}, revision 2.0.17, element at0005 (Diastolic)`,
      `${BP}, revision 2.0.17, element at1006 (Mean arterial pressure)`,
    ]);
    expect(screen.getByText("Linked to CKM")).toBeTruthy();
  });

  it("shows the provenance alone for an element without a link of its own", () => {
    render(<CkmLinks link={null} merged={[link("at0005", "Diastolic")]} />);
    expect(screen.queryByText("Linked to CKM")).toBeNull();
    expect(screen.getByRole("list", { name: "Also linked via merged duplicate" })).toBeTruthy();
  });
});
