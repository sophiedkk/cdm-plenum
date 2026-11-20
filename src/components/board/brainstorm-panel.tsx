// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private step of the brainstorm on the board (EL13). The facilitator reads one status line
// and reveals the board from it, after a confirmation that lists the elements per participant; a
// participant reads that only their own elements are shown. One line each, so 10 elements still
// fit on the first screen (Q-USE-1).
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";

export interface ParticipantCount {
  memberId: string;
  name: string;
  email: string;
  elements: number;
}

const LINE = "-mt-3 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm";

/** The facilitator's status line: how many participants added how many elements, and `action`. */
export function PrivateStepStatus({
  participants,
  action,
}: Readonly<{ participants: readonly ParticipantCount[]; action: ReactNode }>) {
  const contributors = participants.filter((participant) => participant.elements > 0).length;
  const elements = participants.reduce((sum, participant) => sum + participant.elements, 0);
  return (
    <p className={LINE}>
      <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
      <span data-testid="private-step-status">
        {m.board_private_status({
          elements,
          participants: contributors,
          total: participants.length,
        })}
      </span>
      {action}
    </p>
  );
}

/** What a participant reads above the board in the private step. */
export function PrivateStepNote() {
  return (
    <p className={LINE}>
      <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
      {m.board_private_participant_note()}
    </p>
  );
}

/** The reveal button; the confirmation shows the elements per participant (facilitator only). */
export function RevealButton({
  participants,
  reveal,
  onRevealed,
}: Readonly<{
  participants: readonly ParticipantCount[];
  reveal: () => Promise<Outcome<unknown>>;
  onRevealed: () => Promise<void> | void;
}>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const outcome = await reveal();
      if (outcome.ok) {
        setOpen(false);
        toast.success(m.board_revealed());
        await onRevealed();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <EyeIcon aria-hidden="true" data-icon="inline-start" />
          {m.board_reveal()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.board_reveal_confirm_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.board_reveal_confirm_description()}</AlertDialogDescription>
        </AlertDialogHeader>
        {participants.length > 0 && (
          <Table aria-label={m.board_private_counts()}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">{m.board_private_column_participant()}</TableHead>
                <TableHead scope="col" className="text-right">
                  {m.board_private_column_elements()}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => (
                <TableRow key={participant.memberId}>
                  <TableCell>{participant.name || participant.email}</TableCell>
                  <TableCell className="text-right tabular-nums">{participant.elements}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void confirm()}
          >
            {m.board_reveal_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
