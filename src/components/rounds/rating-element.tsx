// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element on the rating screen (DE3, DE7, DE8, DE15): a fieldset with the scale as a radio
// group, "unable to rate" and an optional reason. A choice saves at once; a changed reason saves
// when the field loses focus. In a later round one line above the scale shows the participant's
// own earlier rating and the distribution per stakeholder group; the median, the band shares and
// the anonymous reasons sit behind "details". No outcome label of the earlier round shows: it
// can push ratings toward the group (ADR 0013).
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import type { ConsensusRule } from "@/lib/consensus";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { MyElement, OwnRating } from "@/server/rounds/ratings";
import { RATING_REASON_MAX } from "@/server/rounds/schemas";
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

/** One element of the round as a fieldset whose legend is the element name. */
export function RatingElement({
  element,
  dataType,
  rule,
  editable,
  save,
  clear,
}: Readonly<{
  element: MyElement;
  /** The openEHR type of the element, or null when the board has none yet. */
  dataType: string | null;
  rule: ConsensusRule;
  editable: boolean;
  save: (score: number | null, reason: string) => Promise<RatingOutcome>;
  clear: () => Promise<RatingOutcome>;
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
    <FieldSet className="gap-3 rounded-lg border p-4" aria-describedby={`${base}-about`}>
      <FieldLegend className="mb-0 text-base font-semibold">{element.name}</FieldLegend>
      <p id={`${base}-about`} className="text-sm text-muted-foreground">
        {element.description && <span className="text-foreground">{element.description} </span>}
        {dataType === null
          ? m.rounds_rate_data_type_none()
          : m.rounds_rate_data_type({ type: dataType })}
      </p>
      {element.previous && <PreviousRound element={{ ...element, previous: element.previous }} />}
      <div className="flex flex-col gap-2">
        <p id={`${base}-scale`} className="sr-only">
          {m.rounds_rate_scale_label({ min: rule.scaleMin, max: rule.scaleMax })}
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
          className="min-h-9"
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
    </FieldSet>
  );
}
