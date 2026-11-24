// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Every refusal code the server returns has a message in both catalogues (Q-I18N-1). A new code
// in one of the server lists fails here until it has a key and an English and Dutch text.
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { ADMIN_ACTION_ERRORS } from "@/server/admin/queries";
import { CKM_ACTION_ERRORS } from "@/server/ckm/queries";
import { DEV_SIGN_IN_ERRORS } from "@/server/dev-sign-in/queries";
import { FHIR_ACTION_ERRORS } from "@/server/fhir/queries";
import { PROJECT_ACTION_ERRORS } from "@/server/projects/access";
import { ROUND_ACTION_ERRORS } from "@/server/rounds/access";
import { SOURCE_ACTION_ERRORS } from "@/server/sources/queries";
import { AUTH_REFUSALS, REFUSAL_MESSAGE_KEYS, refusalMessage } from "./refusals.ts";
import { loadCatalogue } from "./test-catalogue.ts";

const SERVER_CODES = [
  ...new Set<string>([
    ...PROJECT_ACTION_ERRORS,
    ...ROUND_ACTION_ERRORS,
    ...CKM_ACTION_ERRORS,
    ...FHIR_ACTION_ERRORS,
    ...SOURCE_ACTION_ERRORS,
    ...ADMIN_ACTION_ERRORS,
    ...DEV_SIGN_IN_ERRORS,
    ...AUTH_REFUSALS,
  ]),
];

const en = loadCatalogue("en");
const nl = loadCatalogue("nl");

afterEach(() => overwriteGetLocale(() => baseLocale));

describe("refusal messages", () => {
  it("map exactly the codes the server returns", () => {
    expect(Object.keys(REFUSAL_MESSAGE_KEYS).sort()).toEqual([...SERVER_CODES].sort());
  });

  it.each(SERVER_CODES)("%s has an English and a Dutch message", (code) => {
    const key = (REFUSAL_MESSAGE_KEYS as Record<string, string>)[code];
    expect(key, `no message key for ${code}`).toBeDefined();
    expect(en[key ?? ""], `messages/en.json has no ${key}`).toBeTruthy();
    expect(nl[key ?? ""], `messages/nl.json has no ${key}`).toBeTruthy();
  });

  it("translates through the active locale", () => {
    expect(refusalMessage("forbidden")).toBe(en["common_refusal_forbidden"]);
    overwriteGetLocale(() => "nl");
    expect(refusalMessage("forbidden")).toBe(nl["common_refusal_forbidden"]);
  });

  it("shows the general message for a code it does not know, never the code", () => {
    expect(refusalMessage("some_new_code")).toBe(en["common_error_unexpected"]);
  });
});
