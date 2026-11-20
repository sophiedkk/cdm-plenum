// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One card of the rating screen (DE3, DE7, DE8, DE15, DE18): the element's name and description,
// the scale as a radio group with "unable to rate", an optional reason and the folded details.
// The rating covers inclusion only (DE1), so data type, cardinality and values are marked "not
// rated" and can be flagged (DE17). A choice saves at once; a changed reason saves when the
// field loses focus. In a later round one line above the scale shows the participant's own
// earlier rating and the distribution per stakeholder group; the median, the band shares and
// the anonymous reasons sit behind "details". No outcome label of the earlier round shows: it
// can push ratings toward the group (ADR 0013).
import { type Ref, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import type { ConsensusRule } from "@/lib/consensus";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { MyElement, OwnRating } from "@/server/rounds/ratings";
import { type DetailFlagKind, RATING_REASON_MAX } from "@/server/rounds/schemas";
import { type ElementDetails, ElementDetailsDisclosure, type FlagOutcome } from "./detail-flags";
import { MiniDistribution, shownGroups } from "./distribution";
import { DistributionTable, GroupResultsTable, ResultFigures } from "./element-result";

const UNABLE = "unable";

/** What a save or a clear answers. */
export type RatingOutcome = { ok: true } | { ok: false; error: string };

type SaveState = "idle" | "saving" | "saved" | "cleared" | { error: string };

function ownText(own: OwnRating): string {
  if (!own.rated) return m.rounds_rate_previous_not_rated();
  if (own.score === null) return m.rounds_rate_unable();
  return String(own.score);
}

function scoreLabel(score: number, rule: ConsensusRule): string {
  if (score === rule.scaleMin) return m.rounds_rate_score_lowest({ score });
  if (score === rule.scaleMax) return m.rounds_rate_score_highest({ score });
  return String(score);
}

function PreviousRound({
  element,
}: Readonly<{ element: MyElement & { previous: NonNullable<MyElement["previous"]> } }>) {
  const previous = element.previous;
  const groups = shownGroups(previous.groups);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="font-medium">
          {m.rounds_rate_previous_own_value({
            number: previous.number,
            value: ownText(previous.own),
          })}
        </p>
        <ul
          aria-label={m.rounds_rate_previous_distribution({
            number: previous.number,
            name: element.name,
          })}
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <li className="flex items-center gap-2">
            <span className="text-muted-foreground">{m.rounds_rate_previous_everyone()}</span>
            <MiniDistribution result={previous.result} />
          </li>
          {groups.map((group) => (
            <li key={group.groupId} className="flex items-center gap-2">
              <span className="text-muted-foreground">{group.groupName}</span>
              <MiniDistribution result={group.result} />
            </li>
          ))}
        </ul>
      </div>
      <details>
        <summary className="cursor-pointer font-medium">
          {m.rounds_rate_previous_details({ count: previous.reasons.length })}
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="grid gap-6 md:grid-cols-2">
            <ResultFigures result={previous.result} />
            <DistributionTable
              result={previous.result}
              caption={m.rounds_rate_previous_table({
                number: previous.number,
                name: element.name,
              })}
            />
          </div>
          <GroupResultsTable name={element.name} groups={previous.groups} showOutcome={false} />
          <div>
            <p className="font-medium">{m.rounds_rate_previous_reasons()}</p>
            {previous.reasons.length === 0 ? (
              <p className="text-muted-foreground">{m.rounds_rate_previous_no_reasons()}</p>
            ) : (
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {previous.reasons.map((reason, index) => (
                  // Reasons carry no id; the same text can occur twice.
                  // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

/** One element of the round as a card: a region named by the element's heading. */
export function RatingElement({
  element,
  details,
  position,
  headingRef,
  rule,
  editable,
  save,
  clear,
  saveFlag,
  removeFlag,
}: Readonly<{
  element: MyElement;
  /** The element's data type, cardinality and values, shown folded and not rated. */
  details: ElementDetails;
  /** The card's place among the round's elements, from 1. */
  position: { index: number; total: number };
  /** The heading, which takes focus when the participant moves to this card. */
  headingRef?: Ref<HTMLHeadingElement>;
  rule: ConsensusRule;
  editable: boolean;
  save: (score: number | null, reason: string) => Promise<RatingOutcome>;
  clear: () => Promise<RatingOutcome>;
  saveFlag: (kind: DetailFlagKind, reason: string) => Promise<FlagOutcome>;
  removeFlag: (kind: DetailFlagKind) => Promise<FlagOutcome>;
}>) {
  const base = useId();
  const initial = element.own.rated
    ? element.own.score === null
      ? UNABLE
      : String(element.own.score)
    : "";
  const [choice, setChoice] = useState(initial);
  const [reason, setReason] = useState(element.own.reason ?? "");
  const savedReason = useRef(element.own.reason ?? "");
  const [state, setState] = useState<SaveState>("idle");

  const scores: number[] = [];
  for (let score = rule.scaleMin; score <= rule.scaleMax; score++) scores.push(score);

  // Arrow keys in the radio group change the choice on every press; the saves run one after the
  // other, so the last choice is the one the server keeps.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = (action: () => Promise<RatingOutcome>, done: SaveState): Promise<boolean> => {
    setState("saving");
    const next = queue.current.then(async () => {
      try {
        const outcome = await action();
        setState(outcome.ok ? done : { error: refusalMessage(outcome.error) });
        return outcome.ok;
      } catch {
        setState({ error: m.common_error_unexpected() });
        return false;
      }
    });
    queue.current = next;
    return next;
  };
  const saveChoice = async (value: string, text: string) => {
    const ok = await run(() => save(value === UNABLE ? null : Number(value), text), "saved");
    if (ok) savedReason.current = text;
  };

  const statusText =
    state === "idle"
      ? ""
      : state === "saving"
        ? m.rounds_rate_saving()
        : state === "saved"
          ? m.rounds_rate_saved()
          : state === "cleared"
            ? m.rounds_rate_cleared()
            : state.error;

  return (
    <section
      aria-labelledby={`${base}-heading`}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {m.rounds_card_position({ index: position.index, total: position.total })}
        </p>
        <h3
          id={`${base}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold break-words outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {element.name}
        </h3>
        {element.description && <p className="break-words">{element.description}</p>}
      </div>
      {element.previous && <PreviousRound element={{ ...element, previous: element.previous }} />}
      <div className="flex flex-col gap-2">
        <p id={`${base}-scale`} className="font-medium">
          {m.rounds_rate_question()}
        </p>
        <RadioGroup
          aria-labelledby={`${base}-scale`}
          value={choice}
          disabled={!editable}
          onValueChange={(value) => {
            setChoice(value);
            void saveChoice(value, reason);
          }}
          className="flex flex-wrap gap-x-4 gap-y-3"
        >
          {scores.map((score) => {
            const id = `${base}-score-${score}`;
            return (
              <div key={score} className="flex items-center gap-2">
                <RadioGroupItem value={String(score)} id={id} />
                <FieldLabel htmlFor={id} className="font-normal">
                  {scoreLabel(score, rule)}
                </FieldLabel>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <RadioGroupItem value={UNABLE} id={`${base}-unable`} />
            <FieldLabel htmlFor={`${base}-unable`} className="font-normal">
              {m.rounds_rate_unable()}
            </FieldLabel>
          </div>
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${base}-reason`}>{m.rounds_rate_reason_label()}</FieldLabel>
        <Textarea
          id={`${base}-reason`}
          value={reason}
          rows={1}
          className="min-h-9 py-1.5"
          maxLength={RATING_REASON_MAX}
          disabled={!editable}
          aria-describedby={`${base}-reason-help`}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => {
            if (choice !== "" && reason !== savedReason.current) void saveChoice(choice, reason);
          }}
        />
        <FieldDescription id={`${base}-reason-help`}>
          {choice === ""
            ? m.rounds_rate_reason_help_unrated()
            : m.rounds_rate_reason_help({ max: RATING_REASON_MAX })}
        </FieldDescription>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {editable && choice !== "" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await run(clear, "cleared")) {
                setChoice("");
                savedReason.current = "";
                setReason("");
              }
            }}
          >
            {m.rounds_rate_clear()}
          </Button>
        )}
        <p
          role="status"
          className={
            typeof state === "object" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {statusText}
        </p>
      </div>
      <ElementDetailsDisclosure
        details={details}
        flags={element.flags}
        editable={editable}
        saveFlag={saveFlag}
        removeFlag={removeFlag}
      />
    </section>
  );
}
