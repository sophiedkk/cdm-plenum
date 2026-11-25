// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ReactNode, type Ref, useId, useRef, useState } from "react";
import { ReferenceText } from "@/components/board/reference-text";
// One card of the rating screen (DE3, DE7, DE8, DE15, DE18, ADR 0019): the element's name and
// description with the question right under them, the scale as a radio group of large buttons in
// the round's three bands with "unable to rate" after them, the reason at full width and the
// folded details. The rating covers inclusion only (DE1), so data type, cardinality and values,
// where the phase shows them (EL21), are marked "not rated" and can be flagged (DE17). A choice
// saves at once; a changed reason saves
// when the field loses focus. In a later round the card shows the own earlier score in a line and
// above the scale; how the group scored, with the anonymous reasons, opens below that line. No
// outcome label of the earlier round shows: it can push ratings toward the group (ADR 0013).
import { useModelType } from "@/components/projects/model-type-context";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import type { ConsensusRule } from "@/lib/consensus";
import { groupName } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { MyElement, OwnRating } from "@/server/rounds/ratings";
import { type DetailFlagKind, RATING_REASON_MAX } from "@/server/rounds/schemas";
import { type ElementDetails, ElementDetailsDisclosure, type FlagOutcome } from "./detail-flags";
import { MiniDistribution, shownGroups } from "./distribution";
import { DistributionTable, GroupResultsTable, ResultFigures } from "./element-result";
import { useShortcuts } from "./shortcuts";

const UNABLE = "unable";

/** The reasons of the previous round shown before "Show all" (DE8). */
export const REASONS_SHOWN = 3;

/** What a save or a clear answers. */
export type RatingOutcome = { ok: true } | { ok: false; error: string };

type SaveState = "idle" | "saving" | "cleared" | { saved: string } | { error: string };

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

interface Band {
  key: "bottom" | "middle" | "top";
  scores: number[];
  label: string;
}

function range(from: number, to: number): number[] {
  const scores: number[] = [];
  for (let score = from; score <= to; score++) scores.push(score);
  return scores;
}

/** The round's bands as its rule sets them (DE1); a rule without scores in between has two. */
export function scaleBands(rule: ConsensusRule): Band[] {
  const bands: Band[] = [
    {
      key: "bottom",
      scores: range(rule.scaleMin, rule.bottomBandMax),
      label: m.rounds_rate_band_bottom(),
    },
    {
      key: "middle",
      scores: range(rule.bottomBandMax + 1, rule.topBandMin - 1),
      label: m.rounds_rate_band_middle(),
    },
    { key: "top", scores: range(rule.topBandMin, rule.scaleMax), label: m.rounds_rate_band_top() },
  ];
  return bands.filter((band) => band.scores.length > 0);
}

/** The digits that choose a score: those on the scale. */
function digitRange(rule: ConsensusRule): { first: number; last: number } | null {
  const first = Math.max(rule.scaleMin, 0);
  const last = Math.min(rule.scaleMax, 9);
  return first <= last ? { first, last } : null;
}

export const OPTION =
  "relative flex h-10 items-center justify-center rounded-md border border-input bg-background font-medium outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground";

/** The check that shows a chosen option by more than its colour (Q-ACC-2). */
export function Chosen() {
  return (
    <RadioGroupPrimitive.Indicator className="absolute top-0.5 right-0.5">
      <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={3} />
    </RadioGroupPrimitive.Indicator>
  );
}

/** The marker of the participant's own earlier answer above its option. */
function PreviousMarker({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return (
    <span
      id={id}
      data-previous-marker=""
      className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-sm leading-none whitespace-nowrap"
    >
      {/* The line above the scale says the score in words; the mark only points at it. */}
      <span className="sr-only">{children}</span>
      <span aria-hidden="true"> ▾</span>
    </span>
  );
}

/** The scale: one large option per score in its band, then "unable to rate" (DE1, DE3). */
function Scale({
  base,
  rule,
  choice,
  editable,
  previous,
  keysId,
  onKeyboardFocus,
  onChoose,
}: Readonly<{
  base: string;
  rule: ConsensusRule;
  choice: string;
  editable: boolean;
  /** The participant's own answer in the previous round, when they gave one. */
  previous: { number: number; own: OwnRating } | null;
  /** The keys help, which describes the scale and shows while it has keyboard focus. */
  keysId: string;
  onKeyboardFocus: (focused: boolean) => void;
  onChoose: (value: string) => void;
}>) {
  const previousValue =
    previous?.own.rated === true
      ? previous.own.score === null
        ? UNABLE
        : String(previous.own.score)
      : null;
  const markerId = `${base}-previous-marker`;
  const marker = (value: string) =>
    previousValue === value && previous ? (
      <PreviousMarker id={markerId}>
        {value === UNABLE
          ? m.rounds_rate_previous_marker_unable({ number: previous.number })
          : m.rounds_rate_previous_marker({ number: previous.number, score: value })}
      </PreviousMarker>
    ) : null;
  const describedBy = (value: string, bandId?: string) =>
    [bandId, previousValue === value ? markerId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={`${base}-scale`}
      aria-describedby={keysId}
      onFocus={(event) => onKeyboardFocus(event.target.matches(":focus-visible"))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onKeyboardFocus(false);
      }}
      value={choice}
      disabled={!editable}
      onValueChange={onChoose}
      className={`flex max-w-full shrink-0 flex-wrap items-start gap-x-5 gap-y-3 ${previousValue === null ? "" : "pt-4"}`}
    >
      {scaleBands(rule).map((band) => {
        const bandId = `${base}-band-${band.key}`;
        return (
          <div key={band.key} data-band={band.key} className="flex flex-col gap-1">
            <div className="flex justify-center gap-1.5">
              {band.scores.map((score) => {
                const value = String(score);
                return (
                  <div key={score} className="relative">
                    {marker(value)}
                    <RadioGroupPrimitive.Item
                      value={value}
                      aria-label={scoreLabel(score, rule)}
                      aria-describedby={describedBy(value, bandId)}
                      className={`${OPTION} w-10 text-base`}
                    >
                      {score}
                      <Chosen />
                    </RadioGroupPrimitive.Item>
                  </div>
                );
              })}
            </div>
            <p
              id={bandId}
              className="border-t-2 border-muted-foreground pt-0.5 text-center text-sm text-muted-foreground"
            >
              {band.label}
            </p>
          </div>
        );
      })}
      <div className="relative sm:ml-4">
        {marker(UNABLE)}
        <RadioGroupPrimitive.Item
          value={UNABLE}
          aria-describedby={describedBy(UNABLE)}
          className={`${OPTION} pr-6 pl-3 text-sm`}
        >
          {m.rounds_rate_unable()}
          <Chosen />
        </RadioGroupPrimitive.Item>
      </div>
    </RadioGroupPrimitive.Root>
  );
}

/** The anonymous reasons of the previous round: the first three, then all on request (DE8). */
function PreviousReasons({
  base,
  reasons,
}: Readonly<{ base: string; reasons: readonly string[] }>) {
  const [all, setAll] = useState(false);
  const shown = all ? reasons : reasons.slice(0, REASONS_SHOWN);
  const listId = `${base}-reasons`;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-3">
        <p id={`${listId}-heading`} className="font-semibold">
          {m.rounds_rate_previous_reasons()}
        </p>
        {reasons.length > REASONS_SHOWN && (
          <Button
            type="button"
            variant="link"
            size="sm"
            aria-expanded={all}
            aria-controls={listId}
            className="h-6 px-0"
            onClick={() => setAll(!all)}
          >
            {all
              ? m.rounds_rate_reasons_fewer()
              : m.rounds_rate_reasons_all({ count: reasons.length })}
          </Button>
        )}
      </div>
      {reasons.length === 0 ? (
        <p className="text-muted-foreground">{m.rounds_rate_previous_no_reasons()}</p>
      ) : (
        <ul
          id={listId}
          aria-labelledby={`${listId}-heading`}
          className="flex list-disc flex-col gap-0.5 pl-5"
        >
          {shown.map((reason, index) => (
            // Reasons carry no id; the same text can occur twice.
            // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
            <li key={index}>
              <span className={all ? "break-words" : "line-clamp-2 break-words"}>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The participant's own score in the previous round, with a button beside it that opens how the
 * group scored. The panel opens below the row, so the button stays where it is.
 */
function PreviousRound({
  base,
  element,
}: Readonly<{
  base: string;
  element: MyElement & { previous: NonNullable<MyElement["previous"]> };
}>) {
  const previous = element.previous;
  const groups = shownGroups(previous.groups);
  const [open, setOpen] = useState(false);
  const panelId = `${base}-group-scores`;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p>
          {m.rounds_rate_previous_own_value({
            number: previous.number,
            value: ownText(previous.own),
          })}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="h-auto px-0 text-muted-foreground"
        >
          <ChevronRightIcon
            aria-hidden="true"
            data-icon="inline-start"
            className={
              open
                ? "rotate-90 motion-safe:transition-transform"
                : "motion-safe:transition-transform"
            }
          />
          {m.rounds_rate_group_scores({ number: previous.number })}
        </Button>
      </div>
      <div
        id={panelId}
        hidden={!open}
        className="grid gap-x-8 gap-y-3 rounded-md border p-3 md:grid-cols-[auto_minmax(0,1fr)]"
      >
        <ul
          aria-label={m.rounds_rate_previous_distribution({
            number: previous.number,
            name: element.name,
          })}
          className="flex flex-col gap-2 md:col-start-1 md:row-start-1"
        >
          <li className="flex items-center gap-2">
            <span className="text-muted-foreground">{m.rounds_rate_previous_everyone()}</span>
            <MiniDistribution result={previous.result} own={previous.own.score} />
          </li>
          {groups.map((group) => (
            <li key={group.groupId} className="flex items-center gap-2">
              <span className="text-muted-foreground">{group.groupName}</span>
              <MiniDistribution result={group.result} />
            </li>
          ))}
        </ul>
        <div className="md:col-start-2 md:row-span-2 md:row-start-1">
          <PreviousReasons base={base} reasons={previous.reasons} />
        </div>
        <details className="self-end md:col-start-1 md:row-start-2 md:open:col-span-2 md:open:row-start-3">
          <summary className="cursor-pointer font-semibold">
            {m.rounds_rate_previous_figures()}
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
          </div>
        </details>
      </div>
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
  kind = "elements",
}: Readonly<{
  /** What the round rates: elements, or the values of a value list under their element (DT3). */
  kind?: "elements" | "values";
  element: MyElement;
  /**
   * The element's data type, cardinality and values, shown folded and not rated; null while the
   * phase hides them (EL21), which leaves out the flags as well.
   */
  details: ElementDetails | null;
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
  const modelType = useModelType();
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
  const [reasonFocused, setReasonFocused] = useState(false);

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
    const saved =
      value === UNABLE ? m.rounds_rate_saved_unable() : m.rounds_rate_saved_score({ score: value });
    const ok = await run(() => save(value === UNABLE ? null : Number(value), text), { saved });
    if (ok) savedReason.current = text;
  };
  const choose = (value: string) => {
    setChoice(value);
    void saveChoice(value, reason);
  };

  const digits = digitRange(rule);
  const [keysShown, setKeysShown] = useState(false);
  useShortcuts((key) => {
    if (!editable) return false;
    if (key === "u") {
      choose(UNABLE);
      return true;
    }
    const digit = /^[0-9]$/.test(key) ? Number(key) : null;
    if (digit === null || digit < rule.scaleMin || digit > rule.scaleMax) return false;
    choose(String(digit));
    return true;
  });

  const statusText =
    state === "idle"
      ? ""
      : state === "saving"
        ? m.rounds_rate_saving()
        : state === "cleared"
          ? m.rounds_rate_cleared()
          : "saved" in state
            ? state.saved
            : state.error;

  return (
    <section
      aria-labelledby={`${base}-heading`}
      className="flex flex-col gap-4 rounded-lg border bg-card px-4 py-4 text-card-foreground shadow-xs sm:px-6"
    >
      <div className="flex flex-col gap-1">
        {element.group && (
          <p className="text-sm text-muted-foreground">
            <span className="sr-only">
              {kind === "values" ? m.rounds_value_card_element() : m.rounds_card_group()}{" "}
            </span>
            {groupName(element.group, modelType)}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3
            id={`${base}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 type-page-title break-words outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {element.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {kind === "values"
              ? m.rounds_value_card_position({ index: position.index, total: position.total })
              : m.rounds_card_position({ index: position.index, total: position.total })}
          </p>
        </div>
        {element.reference && <ReferenceText reference={element.reference} />}
        {element.description && (
          <p className="break-words text-muted-foreground">{element.description}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {/* The question is the label of the scale, so the task sits right above the options. */}
        <p id={`${base}-scale`} className="font-semibold">
          {kind === "values" ? m.rounds_value_rate_question() : m.rounds_rate_question()}
        </p>
        {element.previous && (
          <PreviousRound base={base} element={{ ...element, previous: element.previous }} />
        )}
        <Scale
          base={base}
          rule={rule}
          choice={choice}
          editable={editable}
          previous={element.previous}
          keysId={`${base}-keys`}
          onKeyboardFocus={setKeysShown}
          onChoose={choose}
        />
        {/* Help on demand: the keys show while the scale has keyboard focus. */}
        <p
          id={`${base}-keys`}
          data-testid="rating-keys"
          className={
            keysShown ? "text-sm text-muted-foreground touch:hidden" : "sr-only touch:hidden"
          }
        >
          {editable && digits
            ? m.rounds_rate_keys({ first: digits.first, last: digits.last })
            : m.rounds_rate_keys_move()}
        </p>
        <div className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
          <p
            role="status"
            className={
              typeof state === "object" && "error" in state
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {statusText}
          </p>
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
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${base}-reason`}>{m.rounds_rate_reason_label()}</FieldLabel>
        <Textarea
          id={`${base}-reason`}
          value={reason}
          rows={2}
          maxLength={RATING_REASON_MAX}
          disabled={!editable}
          aria-describedby={reasonFocused ? `${base}-reason-help` : undefined}
          onChange={(event) => setReason(event.target.value)}
          onFocus={() => setReasonFocused(true)}
          onBlur={() => {
            setReasonFocused(false);
            if (choice !== "" && reason !== savedReason.current) void saveChoice(choice, reason);
          }}
        />
        {/* Help on demand: the note shows while the field has focus. */}
        {reasonFocused && (
          <FieldDescription id={`${base}-reason-help`}>
            {choice === ""
              ? m.rounds_rate_reason_help_unrated()
              : m.rounds_rate_reason_help({ max: RATING_REASON_MAX })}
          </FieldDescription>
        )}
      </div>
      {details && (
        <ElementDetailsDisclosure
          details={details}
          flags={element.flags}
          editable={editable}
          saveFlag={saveFlag}
          removeFlag={removeFlag}
        />
      )}
    </section>
  );
}
