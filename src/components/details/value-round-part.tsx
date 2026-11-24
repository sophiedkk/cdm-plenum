// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The value round of a structure proposal on its card (DT3): a line that names the round the
// values are in, with a link to it on the Rounds page, and for the facilitator the button that
// puts the values in a round. The round never settles the proposal; applying its result makes a
// new version that the group answers like any revision (DT2).
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { DetailBoard, DetailElement } from "@/lib/details";

const LINK = "underline underline-offset-4";

/** What the round of the card's values says, in words; null when it has nothing to say. */
function roundText(element: DetailElement): string | null {
  const round = element.valueRound;
  const proposal = element.proposal;
  if (round === null || proposal === null) return null;
  switch (round.status) {
    case "draft":
      return m.details_value_round_draft({ number: round.number });
    case "open":
      return m.details_value_round_open({ number: round.number });
    case "awaiting_close":
      return m.details_value_round_due({ number: round.number });
    case "closed":
      if (round.appliedVersion !== null) {
        return proposal.version === round.appliedVersion
          ? m.details_value_round_applied({
              version: round.appliedVersion,
              number: round.number,
            })
          : null;
      }
      // A later version replaced the values the round rated; its result no longer applies.
      return proposal.version === round.version
        ? m.details_value_round_closed({ number: round.number })
        : null;
  }
}

export function ValueRoundPart({
  projectId,
  element,
  valueRounds,
  facilitator,
  open,
  add,
}: Readonly<{
  projectId: string;
  element: DetailElement;
  /** The facilitator's view of what can start now; null for anyone else. */
  valueRounds: DetailBoard["valueRounds"];
  facilitator: boolean;
  open: boolean;
  /** Puts the values of the proposal in a round; shows its own refusal and success. */
  add: (proposalId: string) => Promise<void>;
}>) {
  const [pending, setPending] = useState(false);
  const proposal = element.proposal;
  const text = roundText(element);
  const round = element.valueRound;
  const inRound = round !== null && round.status !== "closed";
  // A reference element has no values (EL26), and a settled proposal waits for a revision.
  const mayStart =
    facilitator &&
    open &&
    valueRounds?.mayStart === true &&
    proposal !== null &&
    proposal.settledAt === null &&
    proposal.structure.values.length > 0 &&
    !inRound;
  if (text === null && !mayStart) return null;
  const draft = valueRounds?.draft ?? null;
  return (
    <div className="flex flex-col items-start gap-2">
      {text !== null && round !== null && (
        <p className="text-sm">
          <Link
            to="/projects/$projectId/rounds/$roundId"
            params={{ projectId, roundId: round.id }}
            className={LINK}
          >
            {text}
          </Link>
        </p>
      )}
      {mayStart && proposal !== null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          onClick={async () => {
            setPending(true);
            try {
              await add(proposal.id);
            } finally {
              setPending(false);
            }
          }}
        >
          {draft === null
            ? m.details_value_round_start()
            : m.details_value_round_add({ number: draft.number })}
          <span className="sr-only">: {element.name}</span>
        </Button>
      )}
    </div>
  );
}
