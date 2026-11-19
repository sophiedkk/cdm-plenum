// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads the e-mails the app sent from Mailpit's API (https://mailpit.axllent.org/docs/api-v1/).
// Every spec uses addresses of its own, so a search by recipient finds only its own messages,
// also when other runs share the Mailpit of the dev stack.
import { expect } from "@playwright/test";
import { mailpitUrl } from "./run-env.ts";

interface Summary {
  ID: string;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(new URL(path, mailpitUrl()), init);
  if (!response.ok) throw new Error(`Mailpit answered ${response.status} on ${path}`);
  return response;
}

async function search(recipient: string): Promise<Summary[]> {
  const query = encodeURIComponent(`to:"${recipient}"`);
  const body = (await (await call(`/api/v1/search?query=${query}`)).json()) as {
    messages: Summary[];
  };
  return body.messages;
}

/** Deletes the messages with these ids. */
export async function deleteMessages(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await call("/api/v1/messages", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
}

/**
 * Waits for the first message to `recipient`, deletes every message to that address and returns
 * the plain text of the one it read.
 */
export async function takeMessage(recipient: string): Promise<string> {
  let found: Summary[] = [];
  await expect
    .poll(
      async () => {
        found = await search(recipient);
        return found.length;
      },
      { message: `an e-mail to ${recipient} in Mailpit`, timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const [first] = found;
  if (!first) throw new Error("unreachable: the poll saw a message");
  const message = (await (await call(`/api/v1/message/${first.ID}`)).json()) as { Text: string };
  await deleteMessages(found.map((summary) => summary.ID));
  return message.Text;
}

/** Returns the first link in `text` that starts with `origin`. */
export function linkIn(text: string, origin: string): string {
  const link = text.match(/https?:\/\/\S+/g)?.find((candidate) => candidate.startsWith(origin));
  if (!link) throw new Error(`The e-mail holds no link to ${origin}.`);
  return link;
}
