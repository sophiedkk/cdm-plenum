// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element in the model on the detail page (DT1, DT2): its proposal, the participant's
// consent answer, and for the facilitator and the proposers the answers without names. The
// facilitator marks objections addressed and settles; a form opens below its button, so the
// buttons keep their place.
import { CheckIcon, CircleDotIcon, CircleIcon, PencilIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/members/form-dialog";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import {
  DETAIL_TEXT_MAX,
  type DetailAnswer,
  type DetailElement,
  type DetailObjection,
  type DetailProposal,
  type DetailStructure,
  openObjections,
} from "@/lib/details";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import { ProposalForm } from "./proposal-form";
import { StructureFacts } from "./structure-facts";

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
  settle: (proposalId: string, version: number) => Promise<Outcome<unknown>>;
  onChanged: () => Promise<void> | void;
}

/** Runs a server call, shows a refusal or the success text, and refreshes after a success. */
async function run(
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

function ProposalStatus({ proposal }: Readonly<{ proposal: DetailProposal | null }>) {
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
}: Readonly<{ name: string; proposal: DetailProposal; actions: DetailActions }>) {
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
}: Readonly<{ proposal: DetailProposal; mayAddress: boolean; actions: DetailActions }>) {
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
}: Readonly<{ proposal: DetailProposal; name: string; actions: DetailActions }>) {
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

export function DetailCard({
  element,
  mayPropose,
  mayAnswer,
  facilitator,
  open,
  actions,
}: Readonly<{
  element: DetailElement;
  mayPropose: boolean;
  mayAnswer: boolean;
  facilitator: boolean;
  /** Whether the phase takes answers, notes and settling. */
  open: boolean;
  actions: DetailActions;
}>) {
  const proposal = element.proposal;
  const headingId = useId();
  const settleable = facilitator && open && proposal !== null && proposal.settledAt === null;
  const tools: ReactNode[] = [];
  if (mayPropose) tools.push(<ProposeButton key="propose" element={element} actions={actions} />);
  if (settleable && openObjections(proposal).length === 0)
    tools.push(
      <SettleButton key="settle" proposal={proposal} name={element.name} actions={actions} />,
    );
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-lg font-semibold">
          {element.name}
        </h3>
        <ProposalStatus proposal={proposal} />
      </div>
      {element.description !== "" && (
        <p className="whitespace-pre-wrap text-muted-foreground">{element.description}</p>
      )}
      {proposal === null ? (
        <p className="text-muted-foreground">{m.details_no_proposal()}</p>
      ) : (
        <>
          <StructureFacts structure={proposal.structure} />
          <p className="text-sm text-muted-foreground">
            {proposal.proposedBy === "facilitator"
              ? m.details_by_facilitator({ version: proposal.version })
              : m.details_by_architecture({ version: proposal.version })}
          </p>
        </>
      )}
      {mayPropose && <StartFrom element={element} />}
      {proposal !== null && (
        <AnswersPart proposal={proposal} mayAddress={facilitator && open} actions={actions} />
      )}
      {mayAnswer && proposal !== null && proposal.settledAt === null && (
        <AnswerPart name={element.name} proposal={proposal} actions={actions} />
      )}
      {tools.length > 0 && <div className="flex flex-wrap gap-2">{tools}</div>}
    </li>
  );
}
