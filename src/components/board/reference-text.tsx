// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one line that says an element refers to another model (EL26): the words and the model's
// title, which is the link when the element has one. The board, the brainstorm board, the first
// look, the rating card, the round results and the detail card show it once, under the name.
import { WaypointsIcon } from "lucide-react";
import { m } from "@/i18n/messages";
import { type ElementReference, isReferenceUrl } from "@/lib/elements";
import { cn } from "@/lib/utils";

export function ReferenceText({
  reference,
  className,
}: Readonly<{ reference: ElementReference; className?: string }>) {
  // The server only stores http and https links; the check keeps a script link out all the same.
  const url = reference.url !== null && isReferenceUrl(reference.url) ? reference.url : null;
  return (
    <p className={cn("flex items-baseline gap-1.5 text-sm break-words", className)}>
      <WaypointsIcon aria-hidden="true" className="size-3.5 shrink-0 self-center" />
      <span>
        {m.board_reference_refers_to()}{" "}
        {url === null ? (
          <span className="font-medium">{reference.title}</span>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {reference.title}
            <span className="sr-only"> {m.board_reference_opens_new_tab()}</span>
          </a>
        )}
      </span>
    </p>
  );
}
