// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads the files of a gzipped tar archive, as a FHIR package is published
// (<https://hl7.org/fhir/packages.html>: "a tarball", gzip compressed). Only regular files are
// returned; links, directories and devices are skipped, so nothing points outside the archive.
import { gunzipSync } from "node:zlib";

const BLOCK = 512;

export type TarError = "not_gzip" | "too_large" | "malformed";

export type TarResult = { ok: true; files: Map<string, Buffer> } | { ok: false; error: TarError };

function text(block: Buffer, start: number, length: number): string {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

/** A numeric header field: octal digits, or base-256 when the first byte has its high bit set. */
function number(block: Buffer, start: number, length: number): number | null {
  const field = block.subarray(start, start + length);
  if ((field[0] ?? 0) & 0x80) {
    let value = (field[0] ?? 0) & 0x7f;
    for (const byte of field.subarray(1)) value = value * 256 + byte;
    return Number.isSafeInteger(value) ? value : null;
  }
  const digits = text(block, start, length).trim();
  if (digits === "") return 0;
  if (!/^[0-7]+$/.test(digits)) return null;
  return Number.parseInt(digits, 8);
}

/** The ustar checksum: the header bytes summed with the checksum field read as spaces. */
function checksumMatches(block: Buffer): boolean {
  const stored = number(block, 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
  return stored === sum;
}

/** The `path` record of a pax extended header (POSIX.1-2001 `pax` format), if any. */
function paxPath(body: Buffer): string | null {
  let at = 0;
  let path: string | null = null;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(body.subarray(at, space).toString("ascii"));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = body.subarray(space + 1, at + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals !== -1 && record.slice(0, equals) === "path") path = record.slice(equals + 1);
    at += length;
  }
  return path;
}

/**
 * Unpacks `gzipped` into its regular files, keeping only those `keep` accepts, by their name in
 * the archive. Refuses an archive that unpacks to more than `maxUnpackedBytes`.
 */
export function readTarGz(
  gzipped: Uint8Array,
  maxUnpackedBytes: number,
  keep: (name: string) => boolean,
): TarResult {
  if (gzipped[0] !== 0x1f || gzipped[1] !== 0x8b) return { ok: false, error: "not_gzip" };
  let tar: Buffer;
  try {
    tar = gunzipSync(gzipped, { maxOutputLength: maxUnpackedBytes });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { ok: false, error: code === "ERR_BUFFER_TOO_LARGE" ? "too_large" : "malformed" };
  }
  const files = new Map<string, Buffer>();
  let nextName: string | null = null;
  let at = 0;
  while (at + BLOCK <= tar.length) {
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) return { ok: true, files };
    if (!checksumMatches(header)) return { ok: false, error: "malformed" };
    const size = number(header, 124, 12);
    if (size === null) return { ok: false, error: "malformed" };
    const bodyStart = at + BLOCK;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tar.length) return { ok: false, error: "malformed" };
    const body = tar.subarray(bodyStart, bodyEnd);
    const type = String.fromCharCode(header[156] ?? 0);
    const prefix = text(header, 345, 155);
    const headerName = prefix === "" ? text(header, 0, 100) : `${prefix}/${text(header, 0, 100)}`;
    if (type === "x") nextName = paxPath(body);
    else if (type === "L") nextName = text(body, 0, body.length);
    else {
      const name = nextName ?? headerName;
      nextName = null;
      if ((type === "0" || type === "\0") && keep(name)) files.set(name, Buffer.from(body));
    }
    at = bodyStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  // An archive may end without its two zero blocks; every header read so far was whole.
  return at === tar.length ? { ok: true, files } : { ok: false, error: "malformed" };
}
