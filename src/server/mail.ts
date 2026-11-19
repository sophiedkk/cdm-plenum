// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// E-mail for sign-in links and invitations (ADR 0004), over SMTP when SMTP_URL is set. Without
// it the app sends nothing: the facilitator copies invitation links, and a sign-in link is
// written to the server log in development only.
import { createTransport } from "nodemailer";
import { type Env, getEnv } from "./env.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Returns an SMTP mailer, or `null` when SMTP_URL is unset. */
export function createMailer(env: Pick<Env, "SMTP_URL" | "MAIL_FROM">): Mailer | null {
  if (env.SMTP_URL === undefined || env.MAIL_FROM === undefined) return null;
  const transport = createTransport(env.SMTP_URL, { from: env.MAIL_FROM });
  return {
    async send(message) {
      await transport.sendMail(message);
    },
  };
}

/** Where a sign-in link went when no mailer is configured. */
export type LinkFallback = "logged" | "dropped";

/**
 * Sends a sign-in link, or without a mailer writes it to `log` in development. A production
 * server without SMTP logs that it dropped a link, without the link or the address.
 */
export async function deliverSignInLink(
  mailer: Mailer | null,
  message: MailMessage & { url: string },
  options: { production: boolean; log: (line: string) => void },
): Promise<"sent" | LinkFallback> {
  if (mailer) {
    await mailer.send({ to: message.to, subject: message.subject, text: message.text });
    return "sent";
  }
  if (options.production) {
    options.log("sign_in_link_dropped: SMTP_URL is not set");
    return "dropped";
  }
  options.log(`Sign-in link (development, SMTP_URL is not set): ${message.url}`);
  return "logged";
}

let shared: Mailer | null | undefined;

/** The server's mailer from the environment, created on first use; `null` without SMTP. */
export function getMailer(): Mailer | null {
  if (shared === undefined) shared = createMailer(getEnv());
  return shared;
}
