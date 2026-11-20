// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Source model server functions (EL12, EL20): session middleware, then Zod validation, then the
// query, which checks the project role and phase itself.
import { createServerFn } from "@tanstack/react-start";
import { getCkmClient } from "../ckm/client.ts";
import { getDb } from "../db/index.ts";
import { getFhirClient } from "../fhir/client.ts";
import { requireSession } from "../middleware.ts";
import {
  acceptSuggestion,
  addCkmSource,
  addFhirSource,
  addOtherSource,
  dismissSuggestion,
  importSourceModel,
  listSourceModels,
  listSourceModelsWithAuthors,
  sourceCoverage,
  suggestSource,
} from "./queries.ts";
import {
  addCkmSourceInput,
  addFhirSourceInput,
  otherSourceInput,
  projectInput,
  sourceModelInput,
} from "./schemas.ts";

export const listSourceModelsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listSourceModels(getDb(), context.userId, data));

export const listSourceModelsWithAuthorsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listSourceModelsWithAuthors(getDb(), context.userId, data));

export const sourceCoverageFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => sourceCoverage(getDb(), context.userId, data));

export const addFhirSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addFhirSourceInput)
  .handler(({ data, context }) => addFhirSource(getDb(), getFhirClient(), context.userId, data));

export const addCkmSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addCkmSourceInput)
  .handler(({ data, context }) => addCkmSource(getDb(), getCkmClient(), context.userId, data));

export const addOtherSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(otherSourceInput)
  .handler(({ data, context }) => addOtherSource(getDb(), context.userId, data));

export const suggestSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(otherSourceInput)
  .handler(({ data, context }) => suggestSource(getDb(), context.userId, data));

export const acceptSuggestionFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(sourceModelInput)
  .handler(({ data, context }) => acceptSuggestion(getDb(), context.userId, data));

export const dismissSuggestionFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(sourceModelInput)
  .handler(({ data, context }) => dismissSuggestion(getDb(), context.userId, data));

export const importSourceModelFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(sourceModelInput)
  .handler(({ data, context }) => importSourceModel(getDb(), context.userId, data));
