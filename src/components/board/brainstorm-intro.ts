// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one intro line of the brainstorm page: the sentence about cards from existing models comes
// first, and only when there are such cards, named by their label and not by their shape (WCAG 1.3.3).
import { m } from "@/i18n/messages";
import type { BrainstormBoard } from "@/server/elements/brainstorm-board";

export function brainstormIntro(board: Pick<BrainstormBoard, "columns" | "privateStep">): string {
  const purpose = board.privateStep
    ? m.board_brainstorm_purpose_private()
    : m.board_brainstorm_purpose_shared();
  const hasModelCards = board.columns.some((column) => column.fromModels.length > 0);
  return hasModelCards ? `${m.board_brainstorm_from_models()} ${purpose}` : purpose;
}
