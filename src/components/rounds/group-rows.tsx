// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Group headings inside a round's tables (DE19): a heading row where a new group starts.
import type { ReactNode } from "react";
import { m } from "@/i18n/messages";
import type { GroupLabel } from "@/lib/element-groups";
import { groupName } from "@/lib/i18n/labels";
import type { ModelType } from "@/lib/model-types";

interface Grouped {
  group: (GroupLabel & { id: string }) | null;
}

/**
 * The heading of the group that starts at `index`, or null when the element before is in the
 * same group. Elements without a group come last, under "Not grouped".
 */
export function headingBefore(
  elements: readonly Grouped[],
  index: number,
  type: ModelType | null,
): string | null {
  const element = elements[index];
  if (!element) return null;
  const before = elements[index - 1];
  const id = element.group?.id ?? null;
  if (before !== undefined && (before.group?.id ?? null) === id) return null;
  if (element.group === null)
    return elements.some((other) => other.group !== null) ? m.board_check_ungrouped() : null;
  return groupName(element.group, type);
}

export function GroupRows({
  heading,
  columns,
  children,
}: Readonly<{ heading: string | null; columns: number; children: ReactNode }>) {
  return (
    <>
      {heading !== null && (
        <tr className="bg-muted/30">
          <th scope="colgroup" colSpan={columns} className="px-3 py-1.5 text-left font-semibold">
            {heading}
          </th>
        </tr>
      )}
      {children}
    </>
  );
}
