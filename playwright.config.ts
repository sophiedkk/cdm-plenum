// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from "@playwright/test";
import {
  appPort,
  appUrl,
  baseDatabaseUrl,
  ckmStubPort,
  ckmStubUrl,
  E2E_AUTH_SECRET,
  runDatabaseUrl,
  smtpUrl,
} from "./tests/e2e/run-env.ts";

// The e2e suite runs the production build (`pnpm test:e2e` builds it first) against a database
// of its own, created next to TEST_DATABASE_URL, migrated before the server starts and dropped
// after the last spec. E-mail goes to Mailpit, which the specs read through its API.
// CKM is a local stub (tests/e2e/ckm-stub.ts) serving the fixtures, so no spec calls the live CKM.
// Run it in the e2e container: scripts/dev/e2e.sh.
const baseURL = appUrl();

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, locale: "en-GB", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  webServer: [
    {
      command: "node tests/e2e/ckm-stub.ts",
      url: `${ckmStubUrl()}/health`,
      env: { E2E_CKM_PORT: String(ckmStubPort()) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: [
        "node tests/e2e/run-database.ts",
        "node src/server/db/migrate.ts",
        "node .output/server/index.mjs",
      ].join(" && "),
      url: `${baseURL}/api/health`,
      env: {
        NODE_ENV: "production",
        PORT: String(appPort()),
        TEST_DATABASE_URL: baseDatabaseUrl(),
        DATABASE_URL: runDatabaseUrl(),
        BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
        BETTER_AUTH_URL: baseURL,
        SMTP_URL: smtpUrl(),
        MAIL_FROM: "cdm-plenum-e2e@example.test",
        CKM_BASE_URL: `${ckmStubUrl()}/ckm/rest`,
      },
      reuseExistingServer: false,
      stdout: "pipe",
      timeout: 60_000,
    },
  ],
});
