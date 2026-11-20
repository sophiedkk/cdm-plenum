// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Browsing the FHIR package registry (EL10, EL12) for the project's facilitator: packages,
// versions, StructureDefinitions and one StructureDefinition's elements. The role is checked
// before the registry is called; nothing here writes.
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { done, type ProjectActionError, readProject } from "../projects/access.ts";
import type {
  FhirClient,
  FhirFailure,
  FhirPackage,
  FhirPackageVersion,
  FhirResult,
} from "./client.ts";
import type { FhirStructure, FhirStructureSummary } from "./parse.ts";
import type {
  FhirPackageInput,
  FhirStructureInput,
  FhirVersionInput,
  SearchFhirInput,
} from "./schemas.ts";

/** Why a FHIR action was refused, beyond the project codes; the screens translate each code. */
export const FHIR_ACTION_ERRORS = [
  "fhir_unreachable",
  "fhir_timeout",
  "fhir_refused",
  "fhir_unusable",
  "fhir_too_large",
  "fhir_not_r4",
  "fhir_package_not_found",
  "fhir_structure_not_found",
  "fhir_no_snapshot",
] as const;
export type FhirActionError = ProjectActionError | (typeof FHIR_ACTION_ERRORS)[number];

/** The outcome of a FHIR action; `status` is the registry's HTTP status with `fhir_refused`. */
export type FhirActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: FhirActionError; status?: number };

/** The refusal for a failed registry call. */
export function fhirRefused<T>(failure: FhirFailure): FhirActionResult<T> {
  switch (failure.kind) {
    case "refused":
      return { ok: false, error: "fhir_refused", status: failure.status };
    case "not_found":
      return { ok: false, error: "fhir_package_not_found" };
    case "no_structure":
      return { ok: false, error: "fhir_structure_not_found" };
    case "no_snapshot":
      return { ok: false, error: "fhir_no_snapshot" };
    default:
      return { ok: false, error: `fhir_${failure.kind}` };
  }
}

/** Checks the role (`source.add`), then calls the registry. */
async function asFacilitator<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  call: () => Promise<FhirResult<T>>,
): Promise<FhirActionResult<T>> {
  const allowed = await readProject(db, userId, projectId, { source: ["add"] }, async () =>
    done(null),
  );
  if (!allowed.ok) return allowed;
  const result = await call();
  return result.kind === "ok" ? { ok: true, value: result.value } : fhirRefused(result);
}

/** Searches the registry for R4 packages by name (EL10). */
export function searchFhirPackages(
  db: Kysely<DB>,
  fhir: FhirClient,
  userId: string,
  input: SearchFhirInput,
): Promise<FhirActionResult<FhirPackage[]>> {
  return asFacilitator(db, userId, input.projectId, () => fhir.searchPackages(input.text));
}

/** The versions of a package, the newest first. */
export function listFhirVersions(
  db: Kysely<DB>,
  fhir: FhirClient,
  userId: string,
  input: FhirPackageInput,
): Promise<FhirActionResult<FhirPackageVersion[]>> {
  return asFacilitator(db, userId, input.projectId, () => fhir.packageVersions(input.packageName));
}

/** The StructureDefinitions of a package version, to pick a profile or logical model. */
export function listFhirStructures(
  db: Kysely<DB>,
  fhir: FhirClient,
  userId: string,
  input: FhirVersionInput,
): Promise<FhirActionResult<FhirStructureSummary[]>> {
  return asFacilitator(db, userId, input.projectId, () =>
    fhir.structureDefinitions(input.packageName, input.version),
  );
}

/** One StructureDefinition with the elements an import would take (EL11). */
export function readFhirStructure(
  db: Kysely<DB>,
  fhir: FhirClient,
  userId: string,
  input: FhirStructureInput,
): Promise<FhirActionResult<FhirStructure>> {
  return asFacilitator(db, userId, input.projectId, () =>
    fhir.structureDefinition(input.packageName, input.version, input.url),
  );
}
