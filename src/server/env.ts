// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Server configuration from the environment, checked once. A missing or malformed value stops
// the server at start with the variable's name, never its value.
import { z } from "zod";

/** An empty variable counts as unset, as in a Compose file with `SMTP_URL:`. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** The hosts the development sign-in accepts: this machine, never a public address. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Returns whether `url` points at this machine (`localhost` or `127.0.0.1`). */
export function isLocalUrl(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

export const envSchema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
    // Without it the app sends no e-mail: the facilitator copies invitation links (ADR 0004).
    SMTP_URL: optional(z.url({ protocol: /^smtps?$/ })),
    MAIL_FROM: optional(z.email()),
    // The CKM REST API (ADR 0006); unset is the international CKM, set in src/server/ckm/.
    CKM_BASE_URL: optional(z.url({ protocol: /^https?$/ })),
    // The FHIR package registry (ADR 0011); unset is the public registry, set in src/server/fhir/.
    FHIR_REGISTRY_URL: optional(z.url({ protocol: /^https?$/ })),
    // The development sign-in page (/dev/sign-in): sign in as anyone, without e-mail. Only with a
    // BETTER_AUTH_URL on this machine, checked below.
    DEV_SIGN_IN: optional(z.enum(["true", "false"])).transform((value) => value === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.CKM_BASE_URL !== undefined && /[?#]/.test(env.CKM_BASE_URL)) {
      ctx.addIssue({ code: "custom", path: ["CKM_BASE_URL"], message: "no query or fragment" });
    }
    if (env.FHIR_REGISTRY_URL !== undefined && /[?#]/.test(env.FHIR_REGISTRY_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["FHIR_REGISTRY_URL"],
        message: "no query or fragment",
      });
    }
    if (env.DEV_SIGN_IN && !isLocalUrl(env.BETTER_AUTH_URL)) {
      ctx.addIssue({ code: "custom", path: ["DEV_SIGN_IN"], message: "localhost only" });
    }
    if (env.SMTP_URL !== undefined && env.MAIL_FROM === undefined) {
      ctx.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "required with SMTP_URL" });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses the given variables; throws an error that names each invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    const hint = names.includes("DEV_SIGN_IN")
      ? " (DEV_SIGN_IN=true needs a BETTER_AUTH_URL on localhost or 127.0.0.1)"
      : "";
    throw new Error(`Invalid environment configuration: ${names.join(", ")}${hint}`);
  }
  return result.data;
}

/** Whether the development sign-in page is on: the setting, with the host checked again. */
export function devSignInEnabled(env: Pick<Env, "DEV_SIGN_IN" | "BETTER_AUTH_URL">): boolean {
  return env.DEV_SIGN_IN && isLocalUrl(env.BETTER_AUTH_URL);
}

let cached: Env | undefined;

/** The parsed process environment, read on first use. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
