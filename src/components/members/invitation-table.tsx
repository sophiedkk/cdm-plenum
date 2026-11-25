// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The invitations of a project for the facilitator (PR3): status, expiry, the link to copy and
// pass on (the app works without SMTP, ADR 0004) and revoking an open invitation. Only the open
// ones are listed; accepted, expired and revoked ones wait behind a disclosure (ADR 0018).
import { CopyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { UNDO_MS } from "@/lib/undo";
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

function InvitationRows({
  invitations,
  caption,
  busy,
  onRevoke,
}: Readonly<{
  invitations: readonly InvitationRow[];
  caption: string;
  busy: string | null;
  onRevoke: (invitation: InvitationRow) => void;
}>) {
  return (
    <Table aria-label={caption}>
      <TableCaption className="sr-only">{caption}</TableCaption>
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
                    onClick={() => onRevoke(invitation)}
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

export function InvitationTable({
  invitations,
  revoke,
  restore,
  onRevoked,
}: Readonly<{
  invitations: readonly InvitationRow[];
  revoke: (invitationId: string) => Promise<Outcome<unknown>>;
  /** Undoes a revoke while the Undo action of its toast is shown. */
  restore: (invitationId: string) => Promise<Outcome<unknown>>;
  onRevoked: () => Promise<void> | void;
}>) {
  const [busy, setBusy] = useState<string | null>(null);
  const open = invitations.filter((invitation) => invitation.status === "pending");
  const earlier = invitations.filter((invitation) => invitation.status !== "pending");

  async function undo(invitation: InvitationRow) {
    try {
      const outcome = await restore(invitation.id);
      if (outcome.ok) {
        toast.success(m.members_invitation_restored({ email: invitation.email }));
        await onRevoked();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    }
  }

  async function onRevoke(invitation: InvitationRow) {
    setBusy(invitation.id);
    try {
      const outcome = await revoke(invitation.id);
      if (outcome.ok) {
        toast.success(m.members_invitation_revoked({ email: invitation.email }), {
          duration: UNDO_MS,
          action: { label: m.common_undo(), onClick: () => void undo(invitation) },
        });
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
    <div className="flex flex-col gap-3">
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.members_invitations_none_open()}</p>
      ) : (
        <InvitationRows
          invitations={open}
          caption={m.members_invitations_caption()}
          busy={busy}
          onRevoke={(invitation) => void onRevoke(invitation)}
        />
      )}
      {earlier.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {m.members_invitations_earlier({ count: earlier.length })}
          </summary>
          <div className="mt-2">
            <InvitationRows
              invitations={earlier}
              caption={m.members_invitations_earlier_caption()}
              busy={busy}
              onRevoke={(invitation) => void onRevoke(invitation)}
            />
          </div>
        </details>
      )}
    </div>
  );
}
