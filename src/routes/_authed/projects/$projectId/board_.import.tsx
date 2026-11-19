// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { CsvImport } from "@/components/board/csv-import";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { importCsvFn, previewCsvImportFn } from "@/server/elements/functions";
import { elementKeys } from "@/server/elements/query-options";

/** The CSV import of candidate elements (EL3), for the facilitator only. */
export const Route = createFileRoute("/_authed/projects/$projectId/board_/import")({
  beforeLoad: ({ context, params }) => {
    if (context.project.role !== "facilitator") {
      throw redirect({ to: "/projects/$projectId/board", params });
    }
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_import_title()) }],
  }),
  component: BoardImport,
});

function BoardImport() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const preview = useServerFn(previewCsvImportFn);
  const importCsv = useServerFn(importCsvFn);

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_import_title()}
        description={m.board_import_purpose()}
        actions={
          <Button asChild variant="outline">
            <Link to="/projects/$projectId/board" params={{ projectId }}>
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              {m.board_import_back()}
            </Link>
          </Button>
        }
      />
      <CsvImport
        preview={(file) =>
          preview({ data: { projectId, fileName: file.name, content: file.content } })
        }
        importFile={(file) =>
          importCsv({ data: { projectId, fileName: file.name, content: file.content } })
        }
        onImported={async (count, fileName) => {
          await queryClient.invalidateQueries({ queryKey: elementKeys.board(projectId) });
          toast.success(m.board_import_done({ count, file: fileName }));
          await navigate({ to: "/projects/$projectId/board", params: { projectId } });
        }}
      />
    </>
  );
}
