// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, CircleUserIcon, LogOutIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n/messages";
import { hasAppRole } from "@/lib/guards";
import type { SessionUser } from "@/server/session/queries";
import { LanguageMenuGroup, LanguageSwitch } from "./language-switch";
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link";
import { ThemeMenuGroup, ThemeSwitch } from "./theme-switch";
import { useSignOut } from "./use-sign-out";

const NAV_LINK =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground";

/**
 * One menu under the person's name (ADR 0018): language and theme as radio groups, and sign out.
 * The trigger names the person, so a screen reader hears who is signed in.
 */
export function PersonMenu({ user }: Readonly<{ user: SessionUser }>) {
  const { signOut, pending } = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleUserIcon aria-hidden="true" />
          <span className="sr-only">{m.shell_signed_in_as()} </span>
          <span className="max-w-48 truncate">{user.name || user.email}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <LanguageMenuGroup />
        <DropdownMenuSeparator />
        <ThemeMenuGroup />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
          <LogOutIcon aria-hidden="true" />
          {m.shell_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The page frame for a signed-in user: skip link, header with the main navigation and the
 * person menu, then the `main` landmark the page renders into.
 */
export function AppShell({ user, children }: Readonly<{ user: SessionUser; children: ReactNode }>) {
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
          <div className="ml-auto">
            <PersonMenu user={user} />
          </div>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none"
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
            <ThemeSwitch />
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
