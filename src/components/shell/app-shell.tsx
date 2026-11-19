// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { Link } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { hasAppRole } from "@/lib/guards";
import type { SessionUser } from "@/server/session/queries";
import { LanguageSwitch } from "./language-switch";
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link";
import { useSignOut } from "./use-sign-out";

const NAV_LINK =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground";

/**
 * The page frame for a signed-in user: skip link, header with the main navigation, the user,
 * the language switch and sign out, then the `main` landmark the page renders into.
 */
export function AppShell({ user, children }: Readonly<{ user: SessionUser; children: ReactNode }>) {
  const { signOut, pending } = useSignOut();
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/projects" className="font-semibold tracking-tight">
            {m.app_name()}
          </Link>
          <nav aria-label={m.shell_nav_label()}>
            <ul className="flex flex-wrap gap-1">
              <li>
                <Link to="/projects" className={NAV_LINK}>
                  {m.shell_nav_projects()}
                </Link>
              </li>
              {hasAppRole(user, "administrator") && (
                <li>
                  <Link to="/admin" className={NAV_LINK}>
                    {m.shell_nav_admin()}
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <p className="text-sm">
              <span className="sr-only">{m.shell_signed_in_as()} </span>
              {user.name || user.email}
            </p>
            <LanguageSwitch />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void signOut()}
            >
              <LogOutIcon aria-hidden="true" />
              {m.shell_sign_out()}
            </Button>
          </div>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none"
      >
        {children}
      </main>
    </div>
  );
}

/** The page frame without a session: skip link, the app name, the language switch, `main`. */
export function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            {m.app_name()}
          </Link>
          <div className="ml-auto">
            <LanguageSwitch />
          </div>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-md flex-1 px-4 py-8 outline-none"
      >
        {children}
      </main>
    </div>
  );
}
