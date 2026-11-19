// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CKM link of an element (EL4) and, as provenance, the links of the duplicates merged into
// it (EL5, O-5). Every member sees both; neither names an author.
import { GitMergeIcon, LinkIcon } from "lucide-react";
import { useId } from "react";
import { StatusBadge } from "@/components/status/status-badge";
import { m } from "@/i18n/messages";
import type { ElementCkmLink } from "@/server/elements/queries";

function linkDetail(link: ElementCkmLink): string {
  return m.board_ckm_link_detail({
    archetypeId: link.archetypeId,
    revision: link.revision,
    atCode: link.atCode,
    name: link.ckmElementName,
  });
}

export function CkmLinks({
  link,
  merged,
}: Readonly<{ link: ElementCkmLink | null; merged: readonly ElementCkmLink[] }>) {
  const mergedId = `${useId()}merged`;
  return (
    <div className="flex flex-col items-start gap-2">
      {link !== null && (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone="info" icon={LinkIcon} label={m.board_ckm_linked_badge()} />
          <span className="break-all">{linkDetail(link)}</span>
        </div>
      )}
      {merged.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          <span id={mergedId}>
            <StatusBadge icon={GitMergeIcon} label={m.board_ckm_merged_badge()} />
          </span>
          <ul aria-labelledby={mergedId} className="flex flex-col gap-1">
            {merged.map((duplicate) => (
              <li
                key={`${duplicate.archetypeId}/${duplicate.atCode}/${duplicate.revision}`}
                className="break-all"
              >
                {linkDetail(duplicate)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
