// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Proposals for elements missing from round 1 (DE16). `ProposeSection` closes the rating screen:
// the rule, the rater's own proposals and a form for a new one. `ProposalList` is the
// facilitator's compact list on the round page, with "Add to the board" per proposal. Other
// participants' proposals never reach a participant; the server sends only the rater's own.
import { revalidateLogic } from "@tanstack/react-form";
import { CircleCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import type { OwnProposal, RoundProposal } from "@/server/rounds/proposals";
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_NAME_MAX } from "@/server/rounds/schemas";

export type ProposalOutcome = { ok: true } | { ok: false; error: RefusalCode };

/**
 * The limits of `addProposalInput` (src/server/rounds/schemas.ts) with translated messages. Call
 * it during render, so the messages follow the active locale.
 */
export function proposalSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => m.rounds_propose_name_required() })
      .max(PROPOSAL_NAME_MAX, {
        error: () => m.rounds_propose_name_too_long({ max: PROPOSAL_NAME_MAX }),
      }),
    description: z
      .string()
      .trim()
      .max(PROPOSAL_DESCRIPTION_MAX, {
        error: () => m.rounds_propose_description_too_long({ max: PROPOSAL_DESCRIPTION_MAX }),
      }),
  });
}

/** The open question at the end of round 1: the rule, the rater's own proposals and the form. */
export function ProposeSection({
  rule,
  proposals,
  editable,
  add,
  remove,
}: Readonly<{
  /** The round's rule for adding proposed elements, or null when it has none. */
  rule: string | null;
  proposals: readonly OwnProposal[];
  /** False once the round is not open, or for a facilitator outside a group. */
  editable: boolean;
  add: (name: string, description: string) => Promise<ProposalOutcome>;
  remove: (proposalId: string) => Promise<ProposalOutcome>;
}>) {
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { name: "", description: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: proposalSchema() },
    onSubmit: async ({ value, formApi }) => {
      setStatus("");
      let outcome: ProposalOutcome;
      try {
        outcome = await add(value.name.trim(), value.description.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      setStatus(m.rounds_propose_added());
      // The submit button was disabled while sending, which drops focus; the field takes it back.
      formRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus();
    },
  });

  const deleteProposal = async (proposalId: string) => {
    setStatus("");
    setError(null);
    try {
      const outcome = await remove(proposalId);
      if (outcome.ok) setStatus(m.rounds_propose_deleted());
      else setError(refusalMessage(outcome.error));
    } catch {
      setError(m.common_error_unexpected());
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {m.rounds_propose_heading()}
        </h3>
        <p className="text-sm text-muted-foreground">{m.rounds_propose_intro()}</p>
        {rule !== null && <p className="text-sm">{m.rounds_propose_rule({ rule })}</p>}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <p className="font-medium">{m.rounds_propose_mine({ count: proposals.length })}</p>
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.rounds_propose_none()}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{proposal.name}</p>
                  {proposal.description && (
                    <p className="text-sm text-muted-foreground break-words">
                      {proposal.description}
                    </p>
                  )}
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={m.rounds_propose_delete_named({ name: proposal.name })}
                    onClick={() => void deleteProposal(proposal.id)}
                  >
                    <Trash2Icon aria-hidden="true" />
                    {m.rounds_propose_delete()}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editable && (
        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={m.rounds_propose_name_label()}
                  autoComplete="off"
                  maxLength={PROPOSAL_NAME_MAX}
                />
              )}
            </form.AppField>
            <form.AppField name="description">
              {(field) => (
                <field.TextField
                  label={m.rounds_propose_description_label()}
                  description={m.rounds_propose_description_help({
                    max: PROPOSAL_DESCRIPTION_MAX,
                  })}
                  autoComplete="off"
                  maxLength={PROPOSAL_DESCRIPTION_MAX}
                />
              )}
            </form.AppField>
          </div>
          <div>
            <form.AppForm>
              <form.SubmitButton icon={<PlusIcon aria-hidden="true" data-icon="inline-start" />}>
                {m.rounds_propose_submit()}
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </section>
  );
}

/**
 * The facilitator's list of a round's proposals (DE16). `proposers` names who proposed what,
 * and is given only when the round lets the facilitator see the raters (DE4).
 */
export function ProposalList({
  proposals,
  proposers,
  addToBoard,
}: Readonly<{
  proposals: readonly RoundProposal[];
  proposers?: ReadonlyMap<string, string> | undefined;
  addToBoard: (proposal: RoundProposal) => Promise<ProposalOutcome>;
}>) {
  const headingId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (proposal: RoundProposal) => {
    setBusy(proposal.id);
    setError(null);
    try {
      const outcome = await addToBoard(proposal);
      if (!outcome.ok) setError(refusalMessage(outcome.error));
    } catch {
      setError(m.common_error_unexpected());
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-lg font-semibold">
        {m.rounds_proposals_heading({ count: proposals.length })}
      </h3>
      <p className="text-sm text-muted-foreground">{m.rounds_proposals_intro()}</p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.rounds_proposals_empty()}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {proposals.map((proposal) => {
            const proposer = proposers?.get(proposal.id);
            return (
              <li
                key={proposal.id}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium break-words">{proposal.name}</p>
                  {proposal.description && (
                    <p className="text-sm text-muted-foreground break-words">
                      {proposal.description}
                    </p>
                  )}
                  {proposer && (
                    <p className="text-sm text-muted-foreground">
                      {m.rounds_proposals_by({ name: proposer })}
                    </p>
                  )}
                </div>
                {proposal.elementId === null ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    aria-busy={busy === proposal.id}
                    aria-label={m.rounds_proposals_add_named({ name: proposal.name })}
                    onClick={() => void add(proposal)}
                  >
                    <PlusIcon aria-hidden="true" />
                    {m.rounds_proposals_add()}
                  </Button>
                ) : (
                  <StatusBadge
                    tone="success"
                    icon={CircleCheckIcon}
                    label={m.rounds_proposals_on_board()}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
