// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.ts";

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
});
