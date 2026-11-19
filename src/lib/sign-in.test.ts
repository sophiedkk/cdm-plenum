// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SIGN_UP_REFUSED, signInError } from "./sign-in.ts";

describe("signInError", () => {
  it("shows nothing without an error", () => {
    expect(signInError(undefined)).toBeNull();
    expect(signInError("")).toBeNull();
  });

  it("tells a refused sign-up apart from a used or expired link", () => {
    expect(signInError(SIGN_UP_REFUSED)).toBe("not_invited");
    expect(signInError("INVALID_TOKEN")).toBe("invalid_link");
    expect(signInError("anything-else")).toBe("invalid_link");
  });
});
