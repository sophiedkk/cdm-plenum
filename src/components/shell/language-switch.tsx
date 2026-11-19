// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { ChevronDownIcon, LanguagesIcon } from "lucide-react";
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
import { getLocale, type Locale, setLocale, toLocale } from "@/i18n/runtime";

/** Each language by its own name, so a reader finds theirs in any interface language. */
const LANGUAGE_NAMES: Record<Locale, () => string> = {
  en: () => m.shell_language_en(),
  nl: () => m.shell_language_nl(),
};

/**
 * The language switch (Q-I18N-1). Paraglide stores the choice in its locale cookie and reloads
 * the page, so the server renders the next page in that language.
 */
export function LanguageSwitch() {
  const current = getLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <LanguagesIcon aria-hidden="true" />
          <span className="sr-only">{m.shell_language_label()}: </span>
          <span lang={current}>{LANGUAGE_NAMES[current]()}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{m.shell_language_label()}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            const locale = toLocale(value);
            if (locale && locale !== current) void setLocale(locale);
          }}
        >
          {(Object.keys(LANGUAGE_NAMES) as Locale[]).map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale}>
              {LANGUAGE_NAMES[locale]()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
