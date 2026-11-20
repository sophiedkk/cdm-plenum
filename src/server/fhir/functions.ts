// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// FHIR server functions (EL10, EL11): session middleware, then Zod validation, then the query,
// which checks the project role itself before it calls the registry.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { getFhirClient } from "./client.ts";
import {
  listFhirStructures,
  listFhirVersions,
  readFhirStructure,
  searchFhirPackages,
} from "./queries.ts";
import {
  fhirPackageInput,
  fhirStructureInput,
  fhirVersionInput,
  searchFhirInput,
} from "./schemas.ts";

export const searchFhirPackagesFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(searchFhirInput)
  .handler(({ data, context }) =>
    searchFhirPackages(getDb(), getFhirClient(), context.userId, data),
  );

export const listFhirVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(fhirPackageInput)
  .handler(({ data, context }) => listFhirVersions(getDb(), getFhirClient(), context.userId, data));

export const listFhirStructuresFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(fhirVersionInput)
  .handler(({ data, context }) =>
    listFhirStructures(getDb(), getFhirClient(), context.userId, data),
  );

export const readFhirStructureFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(fhirStructureInput)
  .handler(({ data, context }) =>
    readFhirStructure(getDb(), getFhirClient(), context.userId, data),
  );
