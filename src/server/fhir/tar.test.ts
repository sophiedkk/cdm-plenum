// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tar reader on archives the test writes: regular files, long names, the unpack cap and
// broken input.
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readTarGz } from "./tar.ts";
import { tar, tarGz } from "./test-package.ts";

const all = () => true;

describe("readTarGz", () => {
  it("returns the regular files the filter keeps", () => {
    const result = readTarGz(
      tarGz({ "package/a.json": "{}", "package/b.txt": "b", "package/other/c.json": "[]" }),
      1024 * 1024,
      (name) => name.endsWith(".json"),
    );
    if (!result.ok) throw new Error(result.error);
    expect([...result.files.keys()]).toEqual(["package/a.json", "package/other/c.json"]);
    expect(result.files.get("package/a.json")?.toString()).toBe("{}");
  });

  it("reads a long name from its pax header", () => {
    const name = `package/${"StructureDefinition-".repeat(6)}x.json`;
    const result = readTarGz(tarGz({ [name]: "{}" }), 1024 * 1024, all);
    if (!result.ok) throw new Error(result.error);
    expect([...result.files.keys()]).toEqual([name]);
  });

  it("reads a file larger than one block", () => {
    const big = "x".repeat(1500);
    const result = readTarGz(tarGz({ "package/big.json": big }), 1024 * 1024, all);
    if (!result.ok) throw new Error(result.error);
    expect(result.files.get("package/big.json")?.toString()).toBe(big);
  });

  it("refuses an archive that unpacks to more than the cap", () => {
    const result = readTarGz(tarGz({ "package/big.json": "x".repeat(20_000) }), 10_000, all);
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  it("refuses input that is not gzip", () => {
    expect(readTarGz(Buffer.from("not a tarball"), 1024, all)).toEqual({
      ok: false,
      error: "not_gzip",
    });
  });

  it("refuses broken gzip, a bad checksum and a truncated body", () => {
    const gz = tarGz({ "package/a.json": "{}" });
    expect(readTarGz(gz.subarray(0, 20), 1024 * 1024, all)).toEqual({
      ok: false,
      error: "malformed",
    });
    const archive = tar({ "package/a.json": "{}" });
    archive[0] = "q".charCodeAt(0);
    expect(readTarGz(gzipSync(archive), 1024 * 1024, all)).toEqual({
      ok: false,
      error: "malformed",
    });
    const truncated = tar({ "package/a.json": "x".repeat(2000) }).subarray(0, 1024);
    expect(readTarGz(gzipSync(truncated), 1024 * 1024, all)).toEqual({
      ok: false,
      error: "malformed",
    });
  });
});
