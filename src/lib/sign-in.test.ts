// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { confirmLinkUrl, SIGN_UP_REFUSED, signInError, verifyPath } from "./sign-in.ts";

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

describe("the confirmation link", () => {
  const verify =
    "https://plenum.example.test/api/auth/magic-link/verify?token=abc&callbackURL=%2F&errorCallbackURL=%2Fsign-in";

  it("points at our page and keeps the verification query", () => {
    expect(confirmLinkUrl(verify)).toBe(
      "https://plenum.example.test/sign-in/confirm?token=abc&callbackURL=%2F&errorCallbackURL=%2Fsign-in",
    );
  });

  it("builds the verification path from the page's query, and drops anything else", () => {
    expect(verifyPath({ token: "abc", callbackURL: "/", errorCallbackURL: "/sign-in" })).toBe(
      "/api/auth/magic-link/verify?token=abc&callbackURL=%2F&errorCallbackURL=%2Fsign-in",
    );
    expect(verifyPath({ token: "abc", other: "x" } as never)).toBe(
      "/api/auth/magic-link/verify?token=abc",
    );
  });
});
