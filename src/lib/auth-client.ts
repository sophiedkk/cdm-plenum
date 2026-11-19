// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The browser side of better-auth: asks for a sign-in link (magic link plugin,
// https://www.better-auth.com/docs/plugins/magic-link). Same origin, so no base URL.
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
