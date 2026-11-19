// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the invitation server functions, checked before any handler runs.
import { z } from "zod";
import { idSchema } from "../projects/schemas.ts";

export const inviteInput = z.object({
  projectId: idSchema,
  groupId: idSchema,
  email: z.email().max(254),
});
export type InviteInput = z.infer<typeof inviteInput>;

export const invitationInput = z.object({ projectId: idSchema, invitationId: idSchema });
export type InvitationInput = z.infer<typeof invitationInput>;

export const invitationIdInput = z.object({ invitationId: idSchema });
