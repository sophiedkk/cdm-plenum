// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element in the model on the detail page (DT1 to DT5): its structure, then its codes, each
// with the participant's consent answer and, for the facilitator and the proposers of that kind,
// the answers without names. Codes first wait for a second terminologist's review. The
// facilitator marks objections addressed and settles; a form opens below its button, so the
// buttons keep their place.
import { CheckIcon, CircleDotIcon, CircleIcon, PencilIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { ReferenceText } from "@/components/board/reference-text";
import { FormDialog } from "@/components/members/form-dialog";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import {
  type CodeProposal,
  type ConsentState,
  DETAIL_TEXT_MAX,
  type DetailAnswer,
  type DetailBoard,
  type DetailCodes,
  type DetailElement,
  type DetailObjection,
  type DetailStructure,
  openObjections,
  reviewDone,
} from "@/lib/details";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import { CodeFacts } from "./code-facts";
import { CodeForm } from "./code-form";
import { ProposalForm } from "./proposal-form";
import { StructureFacts } from "./structure-facts";
import { ValueRoundPart } from "./value-round-part";

/** What the card does through the server; each call returns the server's outcome. */
export interface DetailActions {
  propose: (
    elementId: string,
    version: number,
    structure: DetailStructure,
  ) => Promise<Outcome<unknown>>;
  answer: (
    proposalId: string,
    version: number,
    answer: DetailAnswer,
    reason: string | null,
  ) => Promise<Outcome<unknown>>;
  address: (answerId: string, note: string) => Promise<Outcome<unknown>>;
  proposeCodes: (
    elementId: string,
    version: number,
    codes: DetailCodes,
  ) => Promise<Outcome<unknown>>;
  review: (
    proposalId: string,
    version: number,
    decision: "approve" | "return",
    note: string | null,
  ) => Promise<Outcome<unknown>>;
  skipReview: (proposalId: string, version: number, reason: string) => Promise<Outcome<unknown>>;
  settle: (proposalId: string, version: number) => Promise<Outcome<unknown>>;
  /** Puts the values of a structure proposal in a value round (DT3). */
  addValueList: (proposalId: string) => Promise<Outcome<{ number: number }>>;
  onChanged: () => Promise<void> | void;
}

/** Runs a server call, shows a refusal or the success text, and refreshes after a success. */
export async function run(
  call: () => Promise<Outcome<unknown>>,
  success: string,
  onChanged: () => Promise<void> | void,
): Promise<boolean> {
  try {
    const outcome = await call();
    if (!outcome.ok) {
      toast.error(refusalMessage(outcome.error));
      return false;
    }
    toast.success(success);
    await onChanged();
    return true;
  } catch {
    toast.error(m.common_error_unexpected());
    return false;
  }
}

/** A text and its submit button, opened below the button that asks for it. */
function NoteForm({
  label,
  submitLabel,
  onSubmit,
  onCancel,
}: Readonly<{
  label: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<boolean>;
  onCancel: () => void;
}>) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      noValidate
      className="mt-3 flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (trimmed === "") {
          setError(m.details_text_required());
          return;
        }
        if (trimmed.length > DETAIL_TEXT_MAX) {
          setError(m.board_text_too_long({ max: DETAIL_TEXT_MAX }));
          return;
        }
        setPending(true);
        const saved = await onSubmit(trimmed);
        setPending(false);
        if (saved) setText("");
      }}
    >
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        rows={3}
        value={text}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}error`}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
      />
      {error !== null && (
        <p id={`${id}error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
      </div>
    </form>
  );
}

export function ProposalStatus({ proposal }: Readonly<{ proposal: ConsentState | null }>) {
  if (proposal === null) return <StatusBadge icon={CircleIcon} label={m.details_status_none()} />;
  return proposal.settledAt === null ? (
    <StatusBadge tone="info" icon={CircleDotIcon} label={m.details_status_open()} />
  ) : (
    <StatusBadge tone="success" icon={CheckIcon} label={m.details_status_settled()} />
  );
}

/** The participant's own answer and the buttons to give or change it (DT2). */
function AnswerPart({
  name,
  proposal,
  actions,
}: Readonly<{ name: string; proposal: ConsentState; actions: DetailActions }>) {
  const [objecting, setObjecting] = useState(false);
  const [pending, setPending] = useState(false);
  const own = proposal.own;
  const agree = async () => {
    setPending(true);
    await run(
      () => actions.answer(proposal.id, proposal.version, "agree", null),
      m.details_answer_saved(),
      actions.onChanged,
    );
    setPending(false);
  };
  return (
    <div className="border-t pt-3">
      {own !== null && (
        <p className="mb-2">
          {own.answer === "agree" ? m.details_own_agreed() : m.details_own_objected()}
          {own.reason !== null && (
            <span className="block whitespace-pre-wrap text-muted-foreground">{own.reason}</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || own?.answer === "agree"}
          aria-busy={pending}
          onClick={() => void agree()}
        >
          {m.details_agree()}
          <span className="sr-only">: {name}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-expanded={objecting}
          onClick={() => setObjecting(!objecting)}
        >
          {own?.answer === "objection" ? m.details_object_again() : m.details_object()}
          <span className="sr-only">: {name}</span>
        </Button>
      </div>
      {objecting && (
        <NoteForm
          label={m.details_objection_label()}
          submitLabel={m.details_objection_submit()}
          onCancel={() => setObjecting(false)}
          onSubmit={async (reason) => {
            const saved = await run(
              () => actions.answer(proposal.id, proposal.version, "objection", reason),
              m.details_answer_saved(),
              actions.onChanged,
            );
            if (saved) setObjecting(false);
            return saved;
          }}
        />
      )}
    </div>
  );
}

/** One objection without a name, with the facilitator's note or the button to add one. */
function ObjectionItem({
  objection,
  mayAddress,
  actions,
}: Readonly<{ objection: DetailObjection; mayAddress: boolean; actions: DetailActions }>) {
  const [addressing, setAddressing] = useState(false);
  return (
    <li className="flex flex-col gap-1 rounded-lg border p-3">
      <p className="whitespace-pre-wrap">{objection.reason}</p>
      {objection.addressedNote !== null ? (
        <p className="text-sm text-muted-foreground">
          {m.details_addressed()} {objection.addressedNote}
        </p>
      ) : (
        mayAddress && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={addressing}
              onClick={() => setAddressing(!addressing)}
            >
              {m.details_address()}
            </Button>
            {addressing && (
              <NoteForm
                label={m.details_address_label()}
                submitLabel={m.details_address_submit()}
                onCancel={() => setAddressing(false)}
                onSubmit={async (note) => {
                  const saved = await run(
                    () => actions.address(objection.id, note),
                    m.details_addressed_saved(),
                    actions.onChanged,
                  );
                  if (saved) setAddressing(false);
                  return saved;
                }}
              />
            )}
          </div>
        )
      )}
    </li>
  );
}

/** The answers to the current version and the earlier objections, without names. */
function AnswersPart({
  proposal,
  mayAddress,
  actions,
}: Readonly<{ proposal: ConsentState; mayAddress: boolean; actions: DetailActions }>) {
  const answers = proposal.answers;
  if (answers === null) return null;
  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <p>
        {m.details_answers_count({
          agreed: answers.agreed,
          objections: answers.objections.length,
        })}
      </p>
      {answers.objections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {answers.objections.map((objection) => (
            <ObjectionItem
              key={objection.id}
              objection={objection}
              mayAddress={mayAddress && proposal.settledAt === null}
              actions={actions}
            />
          ))}
        </ul>
      )}
      {proposal.history !== null && proposal.history.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {m.details_history({ count: proposal.history.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {proposal.history.map((objection) => (
              <li key={objection.id} className="rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground">
                  {m.details_history_version({ version: objection.version })}
                </p>
                <p className="whitespace-pre-wrap">{objection.reason}</p>
                {objection.addressedNote !== null && (
                  <p className="text-muted-foreground">
                    {m.details_addressed()} {objection.addressedNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** What the proposer starts from (DT1): the linked source elements and the raters' flags. */
function StartFrom({ element }: Readonly<{ element: DetailElement }>) {
  const types = new Set(element.sources.map((source) => source.type ?? ""));
  const flags = element.flags ?? [];
  if (element.sources.length === 0 && flags.length === 0) return null;
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">
        {m.details_start_from()}
      </summary>
      <div className="mt-2 flex flex-col gap-3 text-sm">
        {element.sources.length > 0 && (
          <section className="flex flex-col gap-1">
            <h4 className="font-semibold">{m.details_sources()}</h4>
            {types.size > 1 && <p className="text-warning">{m.details_sources_differ()}</p>}
            <ul className="flex flex-col gap-1">
              {element.sources.map((source, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a source element may repeat across models
                <li key={index}>
                  {source.model}: {source.name}
                  <span className="text-muted-foreground">
                    {" "}
                    (
                    {[source.type, source.cardinality && formatCardinality(source.cardinality)]
                      .filter(Boolean)
                      .join(", ") || m.board_not_decided()}
                    )
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {flags.length > 0 && (
          <section className="flex flex-col gap-1">
            <h4 className="font-semibold">{m.details_flags()}</h4>
            <ul className="flex flex-col gap-1">
              {flags.map((flag, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: flags have no id here; their order is stable
                <li key={index}>
                  <span className="text-muted-foreground">{FLAG_LABELS[flag.kind]()}:</span>{" "}
                  {flag.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

const FLAG_LABELS = {
  data_type: () => m.board_field_data_type(),
  cardinality: () => m.board_field_cardinality(),
  values: () => m.board_field_values(),
} as const;

/** The button that opens the proposal form in a dialog. */
function ProposeButton({
  element,
  actions,
}: Readonly<{ element: DetailElement; actions: DetailActions }>) {
  const proposal = element.proposal;
  const title = proposal === null ? m.details_propose() : m.details_revise();
  return (
    <FormDialog
      title={m.details_propose_title({ name: element.name })}
      description={m.details_propose_description()}
      trigger={
        <Button type="button" variant="outline" size="sm">
          <PencilIcon aria-hidden="true" data-icon="inline-start" />
          {title}
          <span className="sr-only">: {element.name}</span>
        </Button>
      }
    >
      {({ close, cancel }) => (
        <ProposalForm
          reference={element.reference !== null}
          initial={proposal?.structure ?? element.current}
          submitLabel={m.details_propose_submit()}
          submit={(structure) => actions.propose(element.id, proposal?.version ?? 0, structure)}
          onDone={async () => {
            toast.success(m.details_proposed());
            close();
            await actions.onChanged();
          }}
          actions={cancel}
        />
      )}
    </FormDialog>
  );
}

function SettleButton({
  proposal,
  name,
  actions,
}: Readonly<{ proposal: ConsentState; name: string; actions: DetailActions }>) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        setPending(true);
        await run(
          () => actions.settle(proposal.id, proposal.version),
          m.details_settled(),
          actions.onChanged,
        );
        setPending(false);
      }}
    >
      <CheckIcon aria-hidden="true" data-icon="inline-start" />
      {m.details_settle()}
      <span className="sr-only">: {name}</span>
    </Button>
  );
}

/** The button that opens the code form in a dialog (DT4, DT5). */
function ProposeCodesButton({
  element,
  actions,
}: Readonly<{ element: DetailElement; actions: DetailActions }>) {
  const codes = element.codes;
  return (
    <FormDialog
      title={m.details_codes_title({ name: element.name })}
      description={m.details_codes_description()}
      trigger={
        <Button type="button" variant="outline" size="sm">
          <PencilIcon aria-hidden="true" data-icon="inline-start" />
          {codes === null ? m.details_propose_codes() : m.details_revise_codes()}
          <span className="sr-only">: {element.name}</span>
        </Button>
      }
    >
      {({ close, cancel }) => (
        <CodeForm
          initial={codes?.codes ?? element.currentCodes}
          values={element.current.values}
          submitLabel={m.details_propose_submit()}
          submit={(next) => actions.proposeCodes(element.id, codes?.version ?? 0, next)}
          onDone={async () => {
            toast.success(m.details_codes_proposed());
            close();
            await actions.onChanged();
          }}
          actions={cancel}
        />
      )}
    </FormDialog>
  );
}

const REVIEW_TEXT = {
  pending: () => m.details_review_pending(),
  approved: () => m.details_review_approved(),
  returned: () => m.details_review_returned(),
  skipped: () => m.details_review_skipped(),
} as const;

/**
 * Where the review of the codes stands (DT4); a second terminologist approves or returns, and the
 * facilitator skips with a reason when no other terminologist can review.
 */
function ReviewPart({
  name,
  codes,
  mayReview,
  maySkip,
  actions,
}: Readonly<{
  name: string;
  codes: CodeProposal;
  mayReview: boolean;
  maySkip: boolean;
  actions: DetailActions;
}>) {
  const [asking, setAsking] = useState<"return" | "skip" | null>(null);
  const [pending, setPending] = useState(false);
  const { state, note } = codes.review;
  const waiting = state === "pending";
  const approve = async () => {
    setPending(true);
    await run(
      () => actions.review(codes.id, codes.version, "approve", null),
      m.details_review_saved(),
      actions.onChanged,
    );
    setPending(false);
  };
  return (
    <div className="border-t pt-3">
      <p>
        {REVIEW_TEXT[state]()}
        {note !== null && (
          <span className="block whitespace-pre-wrap text-muted-foreground">{note}</span>
        )}
        {state === "returned" && note === null && (
          <span className="block text-muted-foreground">
            {m.details_review_structure_changed()}
          </span>
        )}
      </p>
      {waiting && mayReview && !codes.review.ownProposal && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void approve()}
          >
            {m.details_review_approve()}
            <span className="sr-only">: {name}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-expanded={asking === "return"}
            onClick={() => setAsking(asking === "return" ? null : "return")}
          >
            {m.details_review_return()}
            <span className="sr-only">: {name}</span>
          </Button>
        </div>
      )}
      {waiting && maySkip && codes.review.skippable && (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={asking === "skip"}
            onClick={() => setAsking(asking === "skip" ? null : "skip")}
          >
            {m.details_review_skip()}
            <span className="sr-only">: {name}</span>
          </Button>
        </div>
      )}
      {asking !== null && (
        <NoteForm
          label={
            asking === "return" ? m.details_review_return_label() : m.details_review_skip_label()
          }
          submitLabel={
            asking === "return" ? m.details_review_return_submit() : m.details_review_skip_submit()
          }
          onCancel={() => setAsking(null)}
          onSubmit={async (text) => {
            const saved = await run(
              () =>
                asking === "return"
                  ? actions.review(codes.id, codes.version, "return", text)
                  : actions.skipReview(codes.id, codes.version, text),
              m.details_review_saved(),
              actions.onChanged,
            );
            if (saved) setAsking(null);
            return saved;
          }}
        />
      )}
    </div>
  );
}

/** A part of the card, structure or codes: its heading with the status, then its content. */
function Part({
  title,
  status,
  children,
}: Readonly<{ title: string; status: ReactNode; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{title}</h4>
        {status}
      </div>
      {children}
    </section>
  );
}

/** The consent of one proposal: the answers for its readers, the own answer, and settling. */
export function ConsentPart({
  name,
  settleLabel,
  proposal,
  mayAnswer,
  facilitator,
  open,
  actions,
}: Readonly<{
  name: string;
  /** The accessible name the settle button adds, so two in one card differ. */
  settleLabel: string;
  proposal: ConsentState;
  mayAnswer: boolean;
  facilitator: boolean;
  open: boolean;
  actions: DetailActions;
}>) {
  const settleable =
    facilitator && open && proposal.settledAt === null && openObjections(proposal).length === 0;
  return (
    <>
      <AnswersPart proposal={proposal} mayAddress={facilitator && open} actions={actions} />
      {mayAnswer && proposal.settledAt === null && (
        <AnswerPart name={name} proposal={proposal} actions={actions} />
      )}
      {settleable && (
        <div>
          <SettleButton proposal={proposal} name={settleLabel} actions={actions} />
        </div>
      )}
    </>
  );
}

export function DetailCard({
  element,
  mayPropose,
  mayProposeCodes,
  mayReview,
  mayAnswer,
  facilitator,
  open,
  actions,
  projectId,
  valueRounds,
}: Readonly<{
  projectId: string;
  /** The facilitator's view of what can start now (DT3); null for anyone else. */
  valueRounds: DetailBoard["valueRounds"];
  element: DetailElement;
  mayPropose: boolean;
  mayProposeCodes: boolean;
  mayReview: boolean;
  mayAnswer: boolean;
  facilitator: boolean;
  /** Whether the phase takes answers, reviews, notes and settling. */
  open: boolean;
  actions: DetailActions;
}>) {
  const proposal = element.proposal;
  const codes = element.codes;
  const headingId = useId();
  const structureSettled = proposal?.settledAt != null;
  // NOTE: EL26, P3.2. A reference takes its codes from the model it names: no code step.
  const showCodes =
    element.reference === null && (structureSettled || codes !== null || element.codesInReview);
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 id={headingId} className="text-lg font-semibold">
        {element.name}
      </h3>
      {element.reference && <ReferenceText reference={element.reference} />}
      {element.description !== "" && (
        <p className="whitespace-pre-wrap text-muted-foreground">{element.description}</p>
      )}
      <Part title={m.details_structure()} status={<ProposalStatus proposal={proposal} />}>
        {proposal === null ? (
          <p className="text-muted-foreground">{m.details_no_proposal()}</p>
        ) : (
          <>
            <StructureFacts structure={proposal.structure} reference={element.reference !== null} />
            <p className="text-sm text-muted-foreground">
              {proposal.proposedBy === "facilitator"
                ? m.details_by_facilitator({ version: proposal.version })
                : m.details_by_architecture({ version: proposal.version })}
            </p>
          </>
        )}
        <ValueRoundPart
          projectId={projectId}
          element={element}
          valueRounds={valueRounds}
          facilitator={facilitator}
          open={open}
          add={async (proposalId) => {
            try {
              const outcome = await actions.addValueList(proposalId);
              if (!outcome.ok) {
                toast.error(refusalMessage(outcome.error));
                return;
              }
              toast.success(m.details_value_round_added({ number: outcome.value.number }));
              await actions.onChanged();
            } catch {
              toast.error(m.common_error_unexpected());
            }
          }}
        />
        {mayPropose && <StartFrom element={element} />}
        {proposal !== null && (
          <ConsentPart
            name={element.name}
            settleLabel={element.name}
            proposal={proposal}
            mayAnswer={mayAnswer}
            facilitator={facilitator}
            open={open}
            actions={actions}
          />
        )}
        {mayPropose && (
          <div>
            <ProposeButton element={element} actions={actions} />
          </div>
        )}
      </Part>
      {showCodes && (
        <Part title={m.details_codes()} status={<ProposalStatus proposal={codes} />}>
          {codes === null ? (
            <p className="text-muted-foreground">
              {element.codesInReview ? m.details_codes_in_review() : m.details_no_codes()}
            </p>
          ) : (
            <>
              <CodeFacts codes={codes.codes} values={element.current.values} />
              <p className="text-sm text-muted-foreground">
                {codes.proposedBy === "facilitator"
                  ? m.details_by_facilitator({ version: codes.version })
                  : m.details_by_terminology({ version: codes.version })}
              </p>
              <ReviewPart
                name={element.name}
                codes={codes}
                mayReview={mayReview}
                maySkip={facilitator && open}
                actions={actions}
              />
              {reviewDone(codes.review.state) && (
                <ConsentPart
                  name={m.details_codes_of({ name: element.name })}
                  settleLabel={m.details_codes_of({ name: element.name })}
                  proposal={codes}
                  mayAnswer={mayAnswer}
                  facilitator={facilitator}
                  open={open}
                  actions={actions}
                />
              )}
            </>
          )}
          {mayProposeCodes && structureSettled && (
            <div>
              <ProposeCodesButton element={element} actions={actions} />
            </div>
          )}
        </Part>
      )}
    </li>
  );
}
