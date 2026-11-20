// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Every action code the activity log stores has a label in both catalogues (AD2, Q-I18N-1).
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { ACTIVITY_ACTIONS } from "@/lib/activity-actions";
import { PROJECT_PHASES } from "@/lib/project-phases";
import { activityLabel } from "./activity-labels.ts";

afterEach(() => overwriteGetLocale(() => baseLocale));

const CODES = [...ACTIVITY_ACTIONS, ...PROJECT_PHASES.map((phase) => `phase_moved_to_${phase}`)];

describe("activityLabel", () => {
  it.each(CODES)("names %s in English and Dutch, not as its code", (code) => {
    const english = activityLabel(code);
    overwriteGetLocale(() => "nl");
    const dutch = activityLabel(code);
    expect(english).not.toBe(code);
    expect(dutch).not.toBe(code);
    expect(dutch).not.toBe(english);
  });

  it("names the phase a project moved to", () => {
    expect(activityLabel("phase_moved_to_decide")).toBe("Project moved to the phase Decide");
    expect(activityLabel("rating_saved")).toBe("Rating saved");
  });

  it("shows an unknown code as the log stores it", () => {
    expect(activityLabel("phase_moved_to_nowhere")).toBe("phase_moved_to_nowhere");
    expect(activityLabel("something_new")).toBe("something_new");
  });
});
