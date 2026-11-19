// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundState, PageSkeleton, RouteErrorState } from "./components/shell/route-states";
import { DEFAULT_STALE_TIME, QUERY_RETRY } from "./lib/query-config";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One QueryClient per request on the server, so no user's data reaches another request.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: DEFAULT_STALE_TIME, retry: QUERY_RETRY } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // The Query cache decides what is fresh, not the router's own preload cache.
    defaultPreloadStaleTime: 0,
    // A route without its own states renders these where its component would be, so a page
    // inside the app shell keeps the header.
    defaultPendingComponent: PageSkeleton,
    defaultErrorComponent: RouteErrorState,
    defaultNotFoundComponent: () => <NotFoundState />,
  });
  // Streams the queries a loader warmed on the server to the client with the HTML.
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
