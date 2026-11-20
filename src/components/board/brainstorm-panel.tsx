// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private step of the brainstorm on the board (EL13): the facilitator sees how many
// participants added elements and reveals the board after a confirmation; a participant sees
// that only their own elements are shown.
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
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

/** The status line, the elements per participant and the reveal button (facilitator only). */
export function RevealPanel({
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
  const contributors = participants.filter((participant) => participant.elements > 0).length;
  const elements = participants.reduce((sum, participant) => sum + participant.elements, 0);

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
    <section
      aria-labelledby="private-step-title"
      className="mb-6 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h3 id="private-step-title" className="flex items-center gap-2 font-semibold">
        <EyeOffIcon aria-hidden="true" className="size-4" />
        {m.board_private_title()}
      </h3>
      <p data-testid="private-step-status">
        {m.board_private_status({
          elements,
          participants: contributors,
          total: participants.length,
        })}
      </p>
      {participants.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {m.board_private_counts()}
          </summary>
          <Table className="mt-2 w-auto">
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
        </details>
      )}
      <div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button">
              <EyeIcon aria-hidden="true" data-icon="inline-start" />
              {m.board_reveal()}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.board_reveal_confirm_title()}</AlertDialogTitle>
              <AlertDialogDescription>
                {m.board_reveal_confirm_description()}
              </AlertDialogDescription>
            </AlertDialogHeader>
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
      </div>
    </section>
  );
}

/** What a participant reads above the board in the private step. */
export function PrivateStepNote() {
  return (
    <p className="mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm">
      <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
      {m.board_private_participant_note()}
    </p>
  );
}
