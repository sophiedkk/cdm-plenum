// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isLocalUrl, parseEnv } from "./env.ts";

const VALID = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "a-secret-of-at-least-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a complete configuration", () => {
    expect(parseEnv(VALID).DATABASE_URL).toBe(VALID.DATABASE_URL);
  });

  it("names each invalid variable and never its value", () => {
    const secret = "too-short";
    let message = "";
    try {
      parseEnv({ ...VALID, DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toBe("Invalid environment configuration: DATABASE_URL, BETTER_AUTH_SECRET");
    expect(message).not.toContain(secret);
  });

  it("refuses a missing variable", () => {
    expect(() => parseEnv({ DATABASE_URL: VALID.DATABASE_URL })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("leaves SMTP off when SMTP_URL is unset or empty", () => {
    expect(parseEnv(VALID).SMTP_URL).toBeUndefined();
    expect(parseEnv({ ...VALID, SMTP_URL: "", MAIL_FROM: "" }).SMTP_URL).toBeUndefined();
  });

  it("accepts SMTP_URL with a sender address", () => {
    const env = parseEnv({
      ...VALID,
      SMTP_URL: "smtps://user:pass@mail.example.test:465",
      MAIL_FROM: "plenum@example.test",
    });
    expect(env.SMTP_URL).toBe("smtps://user:pass@mail.example.test:465");
    expect(env.MAIL_FROM).toBe("plenum@example.test");
  });

  it("refuses SMTP_URL without MAIL_FROM", () => {
    expect(() => parseEnv({ ...VALID, SMTP_URL: "smtp://mailpit:1025" })).toThrow(
      "Invalid environment configuration: MAIL_FROM",
    );
  });

  it("refuses an SMTP_URL that is not smtp or smtps, and a malformed MAIL_FROM", () => {
    expect(() =>
      parseEnv({ ...VALID, SMTP_URL: "http://mailpit:1025", MAIL_FROM: "not-an-address" }),
    ).toThrow("Invalid environment configuration: SMTP_URL, MAIL_FROM");
  });

  it("leaves CKM_BASE_URL unset when it is missing or empty", () => {
    expect(parseEnv(VALID).CKM_BASE_URL).toBeUndefined();
    expect(parseEnv({ ...VALID, CKM_BASE_URL: "" }).CKM_BASE_URL).toBeUndefined();
  });

  it("accepts an http or https CKM_BASE_URL", () => {
    const url = "https://ckm.example.test/ckm/rest";
    expect(parseEnv({ ...VALID, CKM_BASE_URL: url }).CKM_BASE_URL).toBe(url);
    expect(parseEnv({ ...VALID, CKM_BASE_URL: "http://localhost:8080/" }).CKM_BASE_URL).toBe(
      "http://localhost:8080/",
    );
  });

  it("refuses a CKM_BASE_URL that is not http or https, or has a query or fragment", () => {
    for (const value of ["ftp://ckm.example.test/", "not a url", "https://ckm.example.test/?a=1"]) {
      expect(() => parseEnv({ ...VALID, CKM_BASE_URL: value })).toThrow(
        "Invalid environment configuration: CKM_BASE_URL",
      );
    }
  });

  it("leaves FHIR_REGISTRY_URL unset when it is empty, and accepts an http or https URL", () => {
    expect(parseEnv({ ...VALID, FHIR_REGISTRY_URL: "" }).FHIR_REGISTRY_URL).toBeUndefined();
    const url = "http://localhost:8081/";
    expect(parseEnv({ ...VALID, FHIR_REGISTRY_URL: url }).FHIR_REGISTRY_URL).toBe(url);
  });

  it("refuses a FHIR_REGISTRY_URL that is not http or https, or has a query or fragment", () => {
    for (const value of ["ftp://registry.example.test/", "https://registry.example.test/#a"]) {
      expect(() => parseEnv({ ...VALID, FHIR_REGISTRY_URL: value })).toThrow(
        "Invalid environment configuration: FHIR_REGISTRY_URL",
      );
    }
  });

  it("leaves DEV_SIGN_IN off when it is unset, empty or false", () => {
    expect(parseEnv(VALID).DEV_SIGN_IN).toBe(false);
    expect(parseEnv({ ...VALID, DEV_SIGN_IN: "" }).DEV_SIGN_IN).toBe(false);
    expect(parseEnv({ ...VALID, DEV_SIGN_IN: "false" }).DEV_SIGN_IN).toBe(false);
  });

  it("accepts DEV_SIGN_IN with a BETTER_AUTH_URL on localhost or 127.0.0.1", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3100"]) {
      expect(parseEnv({ ...VALID, BETTER_AUTH_URL: url, DEV_SIGN_IN: "true" }).DEV_SIGN_IN).toBe(
        true,
      );
    }
  });

  it("refuses DEV_SIGN_IN with any other BETTER_AUTH_URL, and says why", () => {
    for (const url of [
      "https://cdm-plenum.example.org",
      "http://localhost.example.org:3000",
      "http://10.0.0.5:3000",
    ]) {
      expect(() => parseEnv({ ...VALID, BETTER_AUTH_URL: url, DEV_SIGN_IN: "true" })).toThrow(
        "Invalid environment configuration: DEV_SIGN_IN (DEV_SIGN_IN=true needs a BETTER_AUTH_URL on localhost or 127.0.0.1)",
      );
    }
  });

  it("refuses a DEV_SIGN_IN that is not true or false", () => {
    expect(() => parseEnv({ ...VALID, DEV_SIGN_IN: "yes" })).toThrow(/DEV_SIGN_IN/);
  });

  it("tells a local URL from a public one", () => {
    expect(isLocalUrl("http://localhost:3000")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1")).toBe(true);
    expect(isLocalUrl("https://cdm-plenum.example.org")).toBe(false);
  });
});
