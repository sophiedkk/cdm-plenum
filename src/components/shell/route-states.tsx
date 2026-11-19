// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The loading, empty, error and not-found states every data route uses.
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { CircleAlertIcon, CompassIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/i18n/messages";

/**
 * The heading and the one-sentence purpose at the top of a page; `actions` sit beside them.
 * Inside a project the layout's h1 is the project name, so a project page passes `level={2}`.
 */
export function PageHeader({
  title,
  description,
  actions,
  level = 1,
}: Readonly<{ title: string; description?: ReactNode; actions?: ReactNode; level?: 1 | 2 }>) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Heading
          className={
            level === 1 ? "text-2xl font-semibold tracking-tight" : "text-xl font-semibold"
          }
        >
          {title}
        </Heading>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** What a route shows while it loads (`pendingComponent`); announced once as "Loading". */
export function PageSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{m.common_loading()}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </div>
  );
}

/** A list or page without content yet: what is missing and, in `children`, what to do. */
export function EmptyState({
  icon,
  title,
  description,
  children,
}: Readonly<{ icon: ReactNode; title: string; description: ReactNode; children?: ReactNode }>) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        {/* A heading below the page's h1, so the empty state shows up in the heading list. */}
        <EmptyTitle role="heading" aria-level={2}>
          {title}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

/** A full-page status (an error, not found) with its own h1. */
export function StatusPage({
  icon,
  title,
  body,
  children,
}: Readonly<{ icon: ReactNode; title: string; body: ReactNode; children?: ReactNode }>) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {children && (
        <EmptyContent className="flex-row flex-wrap justify-center">{children}</EmptyContent>
      )}
    </Empty>
  );
}

/**
 * The error state of a data route (`errorComponent`): what went wrong, a retry that loads the
 * route's data again, and a way to the projects. Mounting resets the Query error boundary, so
 * a query that threw starts fresh on the retry.
 */
export function RouteErrorState({ reset }: Pick<ErrorComponentProps, "reset">) {
  const router = useRouter();
  const queryErrorReset = useQueryErrorResetBoundary();
  useEffect(() => {
    queryErrorReset.reset();
  }, [queryErrorReset]);
  return (
    <StatusPage
      icon={<CircleAlertIcon aria-hidden="true" />}
      title={m.common_error_title()}
      body={<span role="alert">{m.common_error_body()}</span>}
    >
      <Button
        type="button"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        {m.common_retry()}
      </Button>
      <Button asChild variant="outline">
        <Link to="/">{m.common_back_home()}</Link>
      </Button>
    </StatusPage>
  );
}

/** A page or record that does not exist, or that the user may not see (`not_found`). */
export function NotFoundState({ title = m.not_found_title() }: Readonly<{ title?: string }>) {
  return (
    <StatusPage
      icon={<CompassIcon aria-hidden="true" />}
      title={title}
      body={m.common_not_found_body()}
    >
      <Button asChild>
        <Link to="/">{m.common_back_home()}</Link>
      </Button>
    </StatusPage>
  );
}
