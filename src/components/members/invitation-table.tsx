// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The invitations of a project for the facilitator (PR3): status, expiry, the link to copy and
// pass on (the app works without SMTP, ADR 0004) and revoking an open invitation.
import { CopyIcon, MailIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shell/route-states";
import { DateTime } from "@/components/status/date-time";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { InvitationRow } from "@/server/invitations/queries";
import { InvitationStatusBadge } from "./member-badges";

/** Copies `text` to the clipboard; false where the browser does not allow it. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InvitationTable({
  invitations,
  revoke,
  onRevoked,
}: Readonly<{
  invitations: readonly InvitationRow[];
  revoke: (invitationId: string) => Promise<Outcome<unknown>>;
  onRevoked: () => Promise<void> | void;
}>) {
  const [busy, setBusy] = useState<string | null>(null);

  if (invitations.length === 0) {
    return (
      <EmptyState
        icon={<MailIcon aria-hidden="true" />}
        title={m.members_invitations_empty_title()}
        description={m.members_invitations_empty()}
      />
    );
  }

  async function onRevoke(invitation: InvitationRow) {
    setBusy(invitation.id);
    try {
      const outcome = await revoke(invitation.id);
      if (outcome.ok) {
        toast.success(m.members_invitation_revoked({ email: invitation.email }));
        await onRevoked();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table>
      <TableCaption className="sr-only">{m.members_invitations_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.members_column_email()}</TableHead>
          <TableHead scope="col">{m.members_column_group()}</TableHead>
          <TableHead scope="col">{m.members_column_status()}</TableHead>
          <TableHead scope="col">{m.members_column_expires()}</TableHead>
          <TableHead scope="col">{m.members_column_actions()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell className="font-medium">{invitation.email}</TableCell>
            <TableCell>{invitation.groupName ?? m.members_group_removed_name()}</TableCell>
            <TableCell>
              <InvitationStatusBadge status={invitation.status} />
            </TableCell>
            <TableCell>
              <DateTime value={invitation.expiresAt} />
            </TableCell>
            <TableCell>
              {invitation.url !== null && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={m.members_copy_link_label({ email: invitation.email })}
                    onClick={async () => {
                      const url = invitation.url ?? "";
                      if (await copyText(url)) toast.success(m.members_link_copied());
                      else toast.error(m.members_copy_failed({ url }));
                    }}
                  >
                    <CopyIcon aria-hidden="true" data-icon="inline-start" />
                    {m.members_copy_link()}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === invitation.id}
                    aria-label={m.members_revoke_label({ email: invitation.email })}
                    onClick={() => void onRevoke(invitation)}
                  >
                    <XIcon aria-hidden="true" data-icon="inline-start" />
                    {m.members_revoke()}
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
