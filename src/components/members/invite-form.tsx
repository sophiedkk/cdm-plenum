// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator invites an e-mail address into one stakeholder group (PR3). A refusal about
// the address shows at the address, a missing group at the group, anything else at the top.
import { revalidateLogic } from "@tanstack/react-form";
import { SendIcon } from "lucide-react";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { expertTypeLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { ExpertType } from "@/lib/project-roles";

/** The longest address `inviteInput` accepts (src/server/invitations/schemas.ts). */
export const EMAIL_MAX = 254;

/**
 * The limits of `inviteInput` with translated messages. Call it during render, so the messages
 * follow the active locale.
 */
export function inviteSchema() {
  return z.object({
    email: z
      .string()
      .trim()
      .max(EMAIL_MAX, { error: () => m.members_invite_email_too_long({ max: EMAIL_MAX }) })
      .pipe(z.email({ error: () => m.members_invite_email_invalid() })),
    groupId: z.string().min(1, { error: () => m.members_invite_group_required() }),
  });
}

export interface InvitedOutcome {
  invitationId: string;
  url: string;
  emailSent: boolean;
}

const EMAIL_REFUSALS = new Set(["already_member", "already_invited"]);

export function InviteForm({
  groups,
  invite,
  onInvited,
  actions,
}: Readonly<{
  groups: readonly { id: string; name: string; expertType: ExpertType }[];
  invite: (input: { email: string; groupId: string }) => Promise<Outcome<InvitedOutcome>>;
  onInvited: (email: string, invited: InvitedOutcome) => Promise<void> | void;
  /** Buttons next to the submit button, such as Cancel in a dialog. */
  actions?: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: { email: "", groupId: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: inviteSchema() },
    onSubmit: async ({ value, formApi }) => {
      const input = inviteSchema().parse(value);
      let outcome: Outcome<InvitedOutcome>;
      try {
        outcome = await invite(input);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        const message = refusalMessage(outcome.error);
        if (EMAIL_REFUSALS.has(outcome.error)) {
          applyServerRefusal(formApi, { fields: { email: message } });
        } else if (outcome.error === "group_not_found") {
          applyServerRefusal(formApi, { fields: { groupId: message } });
        } else {
          applyServerRefusal(formApi, { form: message });
        }
        return;
      }
      formApi.reset({ email: "", groupId: input.groupId });
      await onInvited(input.email, outcome.value);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <div className="flex flex-col gap-4">
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              type="email"
              label={m.members_invite_email_label()}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </form.AppField>
        <form.AppField name="groupId">
          {(field) => (
            <field.SelectField
              label={m.members_invite_group_label()}
              placeholder={m.members_invite_group_placeholder()}
              options={groups.map((group) => ({
                value: group.id,
                label: m.members_group_option({
                  group: group.name,
                  expertType: expertTypeLabel(group.expertType),
                }),
              }))}
            />
          )}
        </form.AppField>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {actions}
        <form.AppForm>
          <form.SubmitButton icon={<SendIcon aria-hidden="true" data-icon="inline-start" />}>
            {m.members_invite_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
