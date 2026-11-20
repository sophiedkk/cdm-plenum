// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { type DownloadFile, saveFile } from "@/components/export/save-file";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  exportElementsCsvFn,
  exportMindMapFn,
  exportRatingsCsvFn,
} from "@/server/exports/functions";

/** The exports of the project (EX1, EX2, EX4), for its facilitator only. */
export const Route = createFileRoute("/_authed/projects/$projectId/export")({
  beforeLoad: requireStep("export"),
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.export_title()) }] }),
  component: Export,
});

type ExportOutcome = { ok: true; value: DownloadFile } | { ok: false; error: string };

type DownloadState = "idle" | "busy" | { saved: string } | { error: string };

/** One export: its name, what it holds, and a button that saves the file. */
function ExportItem({
  id,
  title,
  description,
  run,
}: Readonly<{
  id: string;
  title: string;
  description: string;
  run: () => Promise<ExportOutcome>;
}>) {
  const [state, setState] = useState<DownloadState>("idle");
  const busy = state === "busy";
  const download = async () => {
    setState("busy");
    try {
      const outcome = await run();
      if (!outcome.ok) {
        setState({ error: refusalMessage(outcome.error) });
        return;
      }
      saveFile(outcome.value);
      setState({ saved: outcome.value.filename });
    } catch {
      setState({ error: m.common_error_unexpected() });
    }
  };
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 id={`${id}-title`} className="font-semibold">
        {title}
      </h3>
      <p id={`${id}-description`} className="text-sm text-muted-foreground">
        {description}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          aria-busy={busy}
          aria-describedby={`${id}-description`}
          onClick={() => void download()}
        >
          {busy ? (
            <Loader2Icon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <DownloadIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {m.export_download({ name: title })}
        </Button>
        <p role="status" className="text-sm">
          {typeof state === "object" && "saved" in state
            ? m.export_saved({ filename: state.saved })
            : ""}
        </p>
      </div>
      {typeof state === "object" && "error" in state && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

function Export() {
  const { projectId } = Route.useParams();
  const exportElements = useServerFn(exportElementsCsvFn);
  const exportMindMap = useServerFn(exportMindMapFn);
  const exportRatings = useServerFn(exportRatingsCsvFn);
  const data = { projectId };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader level={2} title={m.export_title()} description={m.export_purpose()} />
      <ul className="flex flex-col gap-4">
        <ExportItem
          id="export-elements"
          title={m.export_elements_title()}
          description={m.export_elements_description()}
          run={() => exportElements({ data })}
        />
        <ExportItem
          id="export-mind-map"
          title={m.export_mind_map_title()}
          description={m.export_mind_map_description()}
          run={() => exportMindMap({ data })}
        />
        <ExportItem
          id="export-ratings"
          title={m.export_ratings_title()}
          description={m.export_ratings_description()}
          run={() => exportRatings({ data })}
        />
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{m.export_csv_heading()}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{m.export_csv_commas()}</p>
          <p>{m.export_csv_excel()}</p>
          <p>{m.export_csv_libreoffice()}</p>
        </div>
      </details>
    </div>
  );
}
