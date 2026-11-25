// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Round server functions: session middleware, then Zod validation, then the query, which checks
// the project role itself.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import { clearConsent, saveConsent, settleElement } from "./consent.ts";
import { removeDetailFlag, roundFlags, saveDetailFlag } from "./flags.ts";
import {
  addProposal,
  addProposalToBoard,
  deleteProposal,
  myProposals,
  roundProposals,
} from "./proposals.ts";
import {
  closeRound,
  createRound,
  getRound,
  listRounds,
  openRound,
  panelStatus,
  setChangeClass,
  setPanelMinimums,
  updateRound,
} from "./queries.ts";
import {
  clearRating,
  clearValueRating,
  myRatings,
  ratingsByParticipant,
  saveRating,
  saveValueRating,
} from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import {
  addProposalInput,
  changeClassInput,
  consentInput,
  createRoundInput,
  detailFlagInput,
  openRoundInput,
  panelMinimumsInput,
  proposalInput,
  ratingInput,
  roundInput,
  roundValueListInput,
  saveConsentInput,
  saveDetailFlagInput,
  saveRatingInput,
  saveValueRatingInput,
  settleInput,
  updateRoundInput,
  valueListInput,
  valueRatingInput,
} from "./schemas.ts";
import { addValueList, applyValueList, removeValueList } from "./value-rounds.ts";

const now = () => ({ now: new Date() });

export const setChangeClassFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(changeClassInput)
  .handler(({ data, context }) => setChangeClass(getDb(), context.userId, data));

export const setPanelMinimumsFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(panelMinimumsInput)
  .handler(({ data, context }) => setPanelMinimums(getDb(), context.userId, data));

export const panelStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => panelStatus(getDb(), context.userId, data.projectId));

export const createRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(createRoundInput)
  .handler(({ data, context }) => createRound(getDb(), context.userId, data, now()));

export const updateRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(updateRoundInput)
  .handler(({ data, context }) => updateRound(getDb(), context.userId, data, now()));

export const openRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(openRoundInput)
  .handler(({ data, context }) => openRound(getDb(), context.userId, data, now()));

export const closeRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => closeRound(getDb(), context.userId, data, now()));

export const listRoundsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listRounds(getDb(), context.userId, data.projectId, now()));

export const getRoundFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => getRound(getDb(), context.userId, data, now()));

export const saveRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(saveRatingInput)
  .handler(({ data, context }) => saveRating(getDb(), context.userId, data));

export const clearRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(ratingInput)
  .handler(({ data, context }) => clearRating(getDb(), context.userId, data));

export const saveConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(saveConsentInput)
  .handler(({ data, context }) => saveConsent(getDb(), context.userId, data));

export const clearConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(consentInput)
  .handler(({ data, context }) => clearConsent(getDb(), context.userId, data));

export const settleElementFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(settleInput)
  .handler(({ data, context }) => settleElement(getDb(), context.userId, data, now()));

export const saveValueRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(saveValueRatingInput)
  .handler(({ data, context }) => saveValueRating(getDb(), context.userId, data));

export const clearValueRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(valueRatingInput)
  .handler(({ data, context }) => clearValueRating(getDb(), context.userId, data));

export const addValueListFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(valueListInput)
  .handler(({ data, context }) => addValueList(getDb(), context.userId, data, now()));

export const removeValueListFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(roundValueListInput)
  .handler(({ data, context }) => removeValueList(getDb(), context.userId, data));

export const applyValueListFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(roundValueListInput)
  .handler(({ data, context }) => applyValueList(getDb(), context.userId, data));

export const myRatingsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => myRatings(getDb(), context.userId, data, now()));

export const roundResultsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => roundResults(getDb(), context.userId, data, now()));

export const responseRateFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => responseRate(getDb(), context.userId, data, now()));

export const ratingsByParticipantFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => ratingsByParticipant(getDb(), context.userId, data));

export const saveDetailFlagFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(saveDetailFlagInput)
  .handler(({ data, context }) => saveDetailFlag(getDb(), context.userId, data));

export const removeDetailFlagFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(detailFlagInput)
  .handler(({ data, context }) => removeDetailFlag(getDb(), context.userId, data));

export const roundFlagsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => roundFlags(getDb(), context.userId, data));

export const addProposalFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addProposalInput)
  .handler(({ data, context }) => addProposal(getDb(), context.userId, data));

export const deleteProposalFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(proposalInput)
  .handler(({ data, context }) => deleteProposal(getDb(), context.userId, data));

export const myProposalsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => myProposals(getDb(), context.userId, data));

export const roundProposalsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => roundProposals(getDb(), context.userId, data));

export const addProposalToBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(proposalInput)
  .handler(({ data, context }) => addProposalToBoard(getDb(), context.userId, data));
