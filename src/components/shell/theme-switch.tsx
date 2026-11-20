// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { ChevronDownIcon, type LucideIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useId, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n/messages";
import {
  isThemeChoice,
  readThemeChoice,
  setThemeChoice,
  subscribeThemeChoice,
  THEME_CHOICES,
  type ThemeChoice,
} from "@/lib/theme";

const THEME_TEXT: Record<ThemeChoice, { label: () => string; icon: LucideIcon }> = {
  light: { label: () => m.shell_theme_light(), icon: SunIcon },
  dark: { label: () => m.shell_theme_dark(), icon: MoonIcon },
  system: { label: () => m.shell_theme_system(), icon: MonitorIcon },
};

/** The stored theme choice; the server renders "system", the browser its stored choice. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeThemeChoice, readThemeChoice, () => "system");
}

/** The theme choices as a labelled radio group, for a menu: the switch or the person menu. */
export function ThemeMenuGroup() {
  const id = useId();
  const current = useThemeChoice();
  return (
    <>
      <DropdownMenuLabel id={id}>{m.shell_theme_label()}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-labelledby={id}
        value={current}
        onValueChange={(value) => {
          if (isThemeChoice(value) && value !== current) setThemeChoice(value);
        }}
      >
        {THEME_CHOICES.map((choice) => {
          const ChoiceIcon = THEME_TEXT[choice].icon;
          return (
            <DropdownMenuRadioItem key={choice} value={choice}>
              <ChoiceIcon aria-hidden="true" />
              {THEME_TEXT[choice].label()}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}

/** The colour theme switch of the pages without a session: light, dark or the system setting. */
export function ThemeSwitch() {
  const current = useThemeChoice();
  const { label, icon: Icon } = THEME_TEXT[current];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Icon aria-hidden="true" />
          <span className="sr-only">{m.shell_theme_label()}: </span>
          <span className="sr-only sm:not-sr-only">{label()}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeMenuGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
