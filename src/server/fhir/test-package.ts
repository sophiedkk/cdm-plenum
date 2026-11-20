// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Test helpers for the FHIR client: the synthetic package in src/server/fhir/fixtures/ and a
// small ustar writer, so the tests build the tarball without a binary file in the repository.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const FIXTURES = new URL("./fixtures/", import.meta.url);

/** The text of `src/server/fhir/fixtures/<name>`. */
export function fhirFixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), "utf8");
}

/** The parsed JSON of a fixture. */
export function fhirFixtureJson(name: string): unknown {
  return JSON.parse(fhirFixture(name));
}

function header(name: string, size: number, type = "0"): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100, "ascii");
  block.write("0000000\0", 108, "ascii");
  block.write("0000000\0", 116, "ascii");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  block.write("00000000000\0", 136, "ascii");
  block.write(type, 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

function padded(body: Buffer): Buffer {
  const rest = body.length % 512;
  return rest === 0 ? body : Buffer.concat([body, Buffer.alloc(512 - rest)]);
}

/** An uncompressed tar of `files` (name to content); a name over 100 bytes gets a pax header. */
export function tar(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const body = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    if (Buffer.byteLength(name) > 100) {
      const record = ` path=${name}\n`;
      let length = record.length;
      while (`${length}${record}`.length !== length) length = `${length}${record}`.length;
      const pax = Buffer.from(`${length}${record}`, "utf8");
      parts.push(header("PaxHeader", pax.length, "x"), padded(pax));
    }
    parts.push(header(name.slice(0, 100), body.length), padded(body));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

/** The gzipped tar of `files`. */
export function tarGz(files: Record<string, string | Buffer>): Buffer {
  return gzipSync(tar(files));
}

/** The files of the synthetic package `example.fhir.bp` under `package/`, by archive name. */
export function fixturePackageFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const dir = new URL("package/", FIXTURES);
  for (const name of readdirSync(dir)) {
    files[`package/${name}`] = readFileSync(new URL(name, dir), "utf8");
  }
  return files;
}

/** The synthetic package as a registry serves it. */
export function fixturePackage(): Buffer {
  return tarGz(fixturePackageFiles());
}
