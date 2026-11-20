// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the FHIR server functions (EL10, EL11), checked before any handler runs.
import { z } from "zod";
import { idSchema } from "../projects/schemas.ts";
import { PACKAGE_NAME_PATTERN, PACKAGE_VERSION_PATTERN } from "./client.ts";

export const packageName = z.string().regex(PACKAGE_NAME_PATTERN);
export const packageVersion = z.string().regex(PACKAGE_VERSION_PATTERN);
/** A canonical URL (https://hl7.org/fhir/R4/datatypes.html#canonical): no spaces, 1000 at most. */
export const canonicalUrl = z.string().min(1).max(1000).regex(/^\S+$/);

export const searchFhirInput = z.object({
  projectId: idSchema,
  text: z.string().trim().min(2).max(100),
});
export type SearchFhirInput = z.infer<typeof searchFhirInput>;

export const fhirPackageInput = z.object({ projectId: idSchema, packageName });
export type FhirPackageInput = z.infer<typeof fhirPackageInput>;

export const fhirVersionInput = fhirPackageInput.extend({ version: packageVersion });
export type FhirVersionInput = z.infer<typeof fhirVersionInput>;

export const fhirStructureInput = fhirVersionInput.extend({ url: canonicalUrl });
export type FhirStructureInput = z.infer<typeof fhirStructureInput>;
