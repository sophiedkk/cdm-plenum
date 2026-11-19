// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads the configuration when the server starts, so a missing or malformed variable stops the
// process with the variable's name before it serves a request (src/server/env.ts).
import { definePlugin } from "nitro";
import { getEnv } from "../env.ts";

// Nitro loads a runtime plugin from its default export.
export default definePlugin(() => {
  getEnv();
});
