// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One card of the rating screen (DE3, DE7, DE8, DE15, DE18): the element's name and description,
// the scale as a radio group of large buttons in the round's three bands with "unable to rate"
// after them, an optional reason and the folded details. The rating covers inclusion only (DE1),
// so data type, cardinality and values are marked "not rated" and can be flagged (DE17). A choice
// saves at once; a changed reason saves when the field loses focus. In a later round the card
// shows the participant's own earlier rating on the distribution and above the scale, and the
// first anonymous reasons; the median and the band shares sit behind "details". No outcome label
// of the earlier round shows: it can push ratings toward the group (ADR 0013).
import { CheckIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ReactNode, type Ref, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { m } from "@/i18n/messages";
import type { ConsensusRule } from "@/lib/consensus";
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

const OPTION =
  "relative flex h-10 items-center justify-center rounded-md border border-input bg-background font-medium outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground";

/** The check that shows a chosen option by more than its colour (Q-ACC-2). */
function Chosen() {
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
      className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-xs leading-none font-medium whitespace-nowrap"
    >
      {children}
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
  onChoose,
}: Readonly<{
  base: string;
  rule: ConsensusRule;
  choice: string;
  editable: boolean;
  /** The participant's own answer in the previous round, when they gave one. */
  previous: { number: number; own: OwnRating } | null;
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
              className="border-t-2 border-muted-foreground pt-0.5 text-center text-xs text-muted-foreground"
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
        <p id={`${listId}-heading`} className="font-medium">
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

function PreviousRound({
  base,
  element,
}: Readonly<{
  base: string;
  element: MyElement & { previous: NonNullable<MyElement["previous"]> };
}>) {
  const previous = element.previous;
  const groups = shownGroups(previous.groups);
  return (
    // From md up: the own score and the distributions left with the details under them, the
    // reasons right; open details take the full width below both.
    <div className="grid gap-x-8 gap-y-2 rounded-md bg-muted/50 px-3 py-2 text-sm md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5 md:col-start-1 md:row-start-1">
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
          className="flex flex-wrap items-start gap-x-5 gap-y-2"
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
      </div>
      <div className="md:col-start-2 md:row-span-2 md:row-start-1">
        <PreviousReasons base={base} reasons={previous.reasons} />
      </div>
      <details className="self-end md:col-start-1 md:row-start-2 md:open:col-span-2 md:open:row-start-3">
        <summary className="cursor-pointer font-medium">{m.rounds_rate_previous_figures()}</summary>
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
  );
}

/** One element of the round as a card: a region named by the element's heading. */
export function RatingElement({
  element,
  details,
  position,
  progress,
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
  /** The links to every card, shown next to the place. */
  progress?: ReactNode;
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
      className="flex flex-col gap-2 rounded-lg border px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h3
            id={`${base}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 text-lg font-semibold break-words outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {element.name}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-muted-foreground">
              {m.rounds_card_position({ index: position.index, total: position.total })}
            </p>
            {progress}
          </div>
        </div>
        {element.description && <p className="break-words">{element.description}</p>}
      </div>
      {element.previous && (
        <PreviousRound base={base} element={{ ...element, previous: element.previous }} />
      )}
      <div className="flex flex-col gap-2">
        <p id={`${base}-scale`} className="font-medium">
          {m.rounds_rate_question()}
        </p>
        {/* The keys line sits beside the scale where it fits, under it where it does not. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <Scale
            base={base}
            rule={rule}
            choice={choice}
            editable={editable}
            previous={element.previous}
            onChoose={choose}
          />
          <p
            data-testid="rating-keys"
            className="min-w-56 flex-1 pb-5 text-xs text-muted-foreground touch:hidden"
          >
            {editable && digits
              ? m.rounds_rate_keys({ first: digits.first, last: digits.last })
              : m.rounds_rate_keys_move()}
          </p>
        </div>
      </div>
      <div className="grid gap-x-3 gap-y-1.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 md:col-start-2">
          <FieldDescription id={`${base}-reason-help`} className="min-w-60 flex-1">
            {choice === ""
              ? m.rounds_rate_reason_help_unrated()
              : m.rounds_rate_reason_help({ max: RATING_REASON_MAX })}
          </FieldDescription>
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
                typeof state === "object" && "error" in state
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {statusText}
            </p>
          </div>
        </div>
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
