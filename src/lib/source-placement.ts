// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Where an element from an existing model starts (EL18, EL23, ADR 0020): under the brainstorm
// question that matches its place in the source model, or nowhere when the place is unknown.
import type { ElementPrompt } from "./brainstorm.ts";

/** The kinds of source model an element can come from (EL12). */
export type PlacementKind = "ckm" | "fhir" | "zib" | "other";

/**
 * The question an imported element starts under. An openEHR archetype path tells the part of
 * the entry: `state` is the patient's state, `protocol` how it was measured, `data` what is
 * recorded (openEHR EHR Information Model, OBSERVATION,
 * <https://specifications.openehr.org/releases/RM/latest/ehr.html>). A FHIR StructureDefinition
 * has no such parts, so its elements start under what is recorded. Anything else: null.
 */
// NOTE: no spec governs this mapping; our own design (ADR 0020).
export function startingPrompt(kind: PlacementKind, path: string): ElementPrompt | null {
  if (kind === "fhir" || kind === "zib") return "recorded";
  if (kind !== "ckm") return null;
  if (/\/state(\[|\/|$)/.test(path)) return "patient_state";
  if (path.startsWith("/protocol")) return "method";
  if (path.startsWith("/data")) return "recorded";
  return null;
}
