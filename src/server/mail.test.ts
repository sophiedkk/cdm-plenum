// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createMailer, deliverSignInLink, type MailMessage } from "./mail.ts";

const MESSAGE = {
  to: "a@example.test",
  subject: "Sign in",
  text: "Open the link",
  url: "http://localhost:3000/api/auth/magic-link/verify?token=secret-token",
};

describe("createMailer", () => {
  it("returns no mailer without SMTP_URL", () => {
    expect(createMailer({})).toBeNull();
  });

  it("returns a mailer with SMTP_URL and MAIL_FROM", () => {
    const mailer = createMailer({ SMTP_URL: "smtp://mailpit:1025", MAIL_FROM: "a@example.test" });
    expect(mailer).not.toBeNull();
  });
});

describe("deliverSignInLink", () => {
  it("sends the link when a mailer is configured, and logs nothing", async () => {
    const sent: MailMessage[] = [];
    const lines: string[] = [];
    const result = await deliverSignInLink(
      { send: async (message) => void sent.push(message) },
      MESSAGE,
      { production: true, log: (line) => lines.push(line) },
    );
    expect(result).toBe("sent");
    expect(sent).toEqual([{ to: MESSAGE.to, subject: MESSAGE.subject, text: MESSAGE.text }]);
    expect(lines).toEqual([]);
  });

  it("logs the link in development without SMTP, never the address", async () => {
    const lines: string[] = [];
    const result = await deliverSignInLink(null, MESSAGE, {
      production: false,
      log: (line) => lines.push(line),
    });
    expect(result).toBe("logged");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(MESSAGE.url);
    expect(lines[0]).not.toContain(MESSAGE.to);
  });

  it("never logs the link in production without SMTP", async () => {
    const lines: string[] = [];
    const result = await deliverSignInLink(null, MESSAGE, {
      production: true,
      log: (line) => lines.push(line),
    });
    expect(result).toBe("dropped");
    expect(lines).toEqual(["sign_in_link_dropped: SMTP_URL is not set"]);
  });
});
