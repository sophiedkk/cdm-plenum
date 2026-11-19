// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Status badges carry their meaning in text, never in colour alone (Q-ACC-2, WCAG 1.4.1).
import { cleanup, render } from "@testing-library/react";
import { CircleCheckIcon } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { PhaseBadge, RoleBadge } from "@/components/projects/project-badges";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { StatusBadge } from "./status-badge";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

describe("StatusBadge", () => {
  it("shows its label as text and hides the icon from assistive technology", () => {
    const { container } = render(
      <StatusBadge label="Included" tone="success" icon={CircleCheckIcon} />,
    );
    const badge = container.firstElementChild;
    expect(badge?.textContent).toBe("Included");
    expect(badge?.getAttribute("data-tone")).toBe("success");
    expect(badge?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("tells two tones apart by their text, not only by colour", () => {
    const { container } = render(
      <>
        <StatusBadge label="Included" tone="success" />
        <StatusBadge label="Excluded" tone="danger" />
      </>,
    );
    const texts = [...container.querySelectorAll("[data-tone]")].map((el) => el.textContent);
    expect(texts).toEqual(["Included", "Excluded"]);
  });
});

describe("project badges", () => {
  it("name the phase and the role in the active language", () => {
    overwriteGetLocale(() => "nl");
    const { container } = render(
      <>
        <PhaseBadge phase="discover" />
        <RoleBadge projectRole="participant" />
      </>,
    );
    expect(container.textContent).toBe("VerkennenDeelnemer");
  });
});
