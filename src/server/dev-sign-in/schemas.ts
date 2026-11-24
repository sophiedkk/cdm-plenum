// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const devSignInInput = z.object({ userId: z.string().min(1).max(200) });
export type DevSignInInput = z.infer<typeof devSignInInput>;
