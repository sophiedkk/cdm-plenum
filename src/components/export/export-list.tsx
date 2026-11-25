// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The downloads of a project (EX1, EX2, EX3, EX4), for its facilitator only. The export page and
// the hand-off page show this one list.
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { type DownloadFile, saveFile } from "@/components/export/save-file";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  exportDecisionReportFn,
  exportElementsCsvFn,
  exportMindMapFn,
  exportRatingsCsvFn,
} from "@/server/exports/functions";

type ExportOutcome = { ok: true; value: DownloadFile } | { ok: false; error: string };

type DownloadState = "idle" | "busy" | { saved: string } | { error: string };

/** One export: its name, what it holds, and a button that saves the file. */
function ExportItem({
  id,
  title,
  description,
  level,
  primary = false,
  run,
}: Readonly<{
  id: string;
  /** The one filled download of the list. */
  primary?: boolean;
  level: 3 | 4;
  title: string;
  description: string;
  run: () => Promise<ExportOutcome>;
}>) {
  const Heading = level === 3 ? "h3" : "h4";
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
      <Heading id={`${id}-title`} className="font-semibold">
        {title}
      </Heading>
      <p id={`${id}-description`} className="text-sm text-muted-foreground">
        {description}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={primary ? "default" : "outline"}
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

/**
 * `level` is the heading level of each export: one below the heading of the section it sits in.
 * `primaryReport` makes the decision report the one filled download, for the hand-off.
 */
export function ExportList({
  projectId,
  level,
  primaryReport = false,
}: Readonly<{ projectId: string; level: 3 | 4; primaryReport?: boolean }>) {
  const exportElements = useServerFn(exportElementsCsvFn);
  const exportMindMap = useServerFn(exportMindMapFn);
  const exportRatings = useServerFn(exportRatingsCsvFn);
  const exportReport = useServerFn(exportDecisionReportFn);
  const data = { projectId };
  const report = (
    <ExportItem
      level={level}
      id="export-decision-report"
      primary={primaryReport}
      title={m.export_decision_report_title()}
      description={m.export_decision_report_description()}
      run={() => exportReport({ data })}
    />
  );

  return (
    <>
      <ul className="flex flex-col gap-4">
        {primaryReport && report}
        <ExportItem
          level={level}
          id="export-elements"
          title={m.export_elements_title()}
          description={m.export_elements_description()}
          run={() => exportElements({ data: { ...data, separator: "comma" } })}
        />
        <ExportItem
          level={level}
          id="export-elements-semicolon"
          title={m.export_elements_semicolon_title()}
          description={m.export_elements_semicolon_description()}
          run={() => exportElements({ data: { ...data, separator: "semicolon" } })}
        />
        <ExportItem
          level={level}
          id="export-mind-map"
          title={m.export_mind_map_title()}
          description={m.export_mind_map_description()}
          run={() => exportMindMap({ data })}
        />
        <ExportItem
          level={level}
          id="export-ratings"
          title={m.export_ratings_title()}
          description={m.export_ratings_description()}
          run={() => exportRatings({ data: { ...data, separator: "comma" } })}
        />
        <ExportItem
          level={level}
          id="export-ratings-semicolon"
          title={m.export_ratings_semicolon_title()}
          description={m.export_ratings_semicolon_description()}
          run={() => exportRatings({ data: { ...data, separator: "semicolon" } })}
        />
        {!primaryReport && report}
      </ul>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold">{m.export_csv_heading()}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{m.export_csv_commas()}</p>
          <p>{m.export_csv_excel()}</p>
          <p>{m.export_csv_libreoffice()}</p>
        </div>
      </details>
    </>
  );
}
