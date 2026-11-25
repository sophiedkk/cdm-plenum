// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { type ReactNode, useEffect } from "react";
import { AppShell, PublicLayout } from "@/components/shell/app-shell";
import { NotFoundState, RouteErrorState } from "@/components/shell/route-states";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { m } from "@/i18n/messages";
import { getLocale } from "@/i18n/runtime";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import {
  DEFAULT_TIME_ZONE,
  TimeZoneProvider,
  timeZoneCookie,
  timeZoneFromCookies,
} from "@/lib/time-zone";
import { devSignInEnabledQueryOptions } from "@/server/dev-sign-in/query-options";
import { sessionQueryOptions } from "@/server/session/query-options";
import appCss from "@/styles/app.css?url";

export interface RouterContext {
  queryClient: QueryClient;
}

// NOTE: no spec governs this, our own design: the reader's zone travels in a cookie the browser
// sets, so the server renders moments in that zone and hydration finds the same text.
const readTimeZone = createIsomorphicFn()
  .server(() => timeZoneFromCookies(getRequestHeader("cookie")))
  .client(() => timeZoneFromCookies(document.cookie));

export const Route = createRootRouteWithContext<RouterContext>()({
  // NOTE: our own design after eduLIMS (ADR 0002). The session query is always stale, so every
  // navigation asks the server and a revoked session or role applies at once.
  beforeLoad: async ({ context }) => {
    const [user, devSignIn] = await Promise.all([
      context.queryClient.fetchQuery(sessionQueryOptions()),
      // Only whether the development sign-in page is on, for "Switch person" in the shell.
      context.queryClient.ensureQueryData(devSignInEnabledQueryOptions()),
    ]);
    return { user, devSignIn, timeZone: readTimeZone() };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: m.app_description() },
      { title: m.app_name() },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

/** Stores the browser's time zone in the cookie and renders again when the page used another. */
function TimeZoneSync({ used }: Readonly<{ used: string }>) {
  const router = useRouter();
  useEffect(() => {
    const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (actual === used) return;
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is missing in Firefox
    document.cookie = timeZoneCookie(actual);
    void router.invalidate();
  }, [used, router]);
  return null;
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const timeZone =
    useRouteContext({ from: "__root__", select: (context) => context.timeZone }) ??
    DEFAULT_TIME_ZONE;
  return (
    // The theme script sets data-theme on <html> before React hydrates, so the server's markup
    // differs from the browser's on that one attribute.
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <TimeZoneProvider value={timeZone}>
          <TimeZoneSync used={timeZone} />
          <TooltipProvider>{children}</TooltipProvider>
        </TimeZoneProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

/** A page outside the route tree (not found, an error) in the frame the visitor has. */
function Frame({ children }: Readonly<{ children: ReactNode }>) {
  const user = useRouteContext({ from: "__root__", select: (context) => context.user });
  return user ? (
    <AppShell user={user}>{children}</AppShell>
  ) : (
    <PublicLayout>{children}</PublicLayout>
  );
}

function NotFound() {
  return (
    <Frame>
      <NotFoundState />
    </Frame>
  );
}

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <Frame>
      <RouteErrorState reset={reset} />
    </Frame>
  );
}
