// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Server configuration from the environment, checked once. A missing or malformed value stops
// the server at start with the variable's name, never its value.
import { z } from "zod";

/** An empty variable counts as unset, as in a Compose file with `SMTP_URL:`. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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
    throw new Error(`Invalid environment configuration: ${names.join(", ")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** The parsed process environment, read on first use. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
