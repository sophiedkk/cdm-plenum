// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A failing server function leaves one log line on the server with its name and the error,
// and never its input (Q-PRIV-2, #66).
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, failureLine, logFailures } from "./middleware.ts";

type Run = (options: unknown) => Promise<unknown>;
const run = (next: () => Promise<unknown>): Promise<unknown> =>
  (logFailures.options.server as Run)({
    next,
    serverFnMeta: { name: "saveRatingFn", filename: "x.ts" },
    data: { score: 4, text: "Systolic pressure" },
  });

afterEach(() => vi.restoreAllMocks());

describe("logFailures", () => {
  it("writes one line with the function name, error class, message and stack, then rethrows", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new TypeError('relation "round_x" does not exist');
    await expect(run(() => Promise.reject(failure))).rejects.toBe(failure);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain("fn=saveRatingFn");
    expect(line).toContain('TypeError relation "round_x" does not exist');
    expect(line).toContain("middleware.test.ts");
  });

  it("does not log the input data", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(() => Promise.reject(new Error("boom"))).catch(() => {});
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).not.toContain("Systolic");
    expect(line).not.toContain("score");
  });

  it("stays quiet on a success and on the expected sign-in refusal", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(run(async () => "ok")).resolves.toBe("ok");
    await run(() => Promise.reject(new AuthError())).catch(() => {});
    expect(spy).not.toHaveBeenCalled();
  });

  it("names a thrown non-error without printing its value", () => {
    expect(failureLine("fn", "secret text")).toBe(
      "server_function_failed fn=fn non-error thrown string",
    );
  });
});
