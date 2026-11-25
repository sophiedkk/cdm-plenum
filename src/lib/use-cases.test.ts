// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { splitUseCases } from "./use-cases";

describe("splitUseCases", () => {
  it("splits on new lines and drops empty lines", () => {
    expect(splitUseCases("Follow-up\r\n\n  Screening  \nResearch")).toEqual([
      "Follow-up",
      "Screening",
      "Research",
    ]);
  });

  it("splits on a semicolon and a space when there is no new line", () => {
    expect(splitUseCases("Follow-up; Screening;  Research;")).toEqual([
      "Follow-up",
      "Screening",
      "Research",
    ]);
  });

  it("leaves a semicolon inside a line alone when the text has new lines", () => {
    expect(splitUseCases("Follow-up; at home\nScreening")).toEqual([
      "Follow-up; at home",
      "Screening",
    ]);
  });

  it("gives one item for a single use case and none for an empty text", () => {
    expect(splitUseCases("Hypertension follow-up")).toEqual(["Hypertension follow-up"]);
    expect(splitUseCases("")).toEqual([]);
    expect(splitUseCases(" \n ")).toEqual([]);
  });
});
