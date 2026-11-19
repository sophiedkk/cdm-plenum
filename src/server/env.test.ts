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
});
