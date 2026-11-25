// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The target types of the activity log that the administration page names (UI/UX analysis F8):
// element, group, round and so on. The server looks up the name; a missing one means the
// subject was removed. Other target types (a project, an application right) have no subject.
export const NAMED_SUBJECT_TYPES = [
  "detail_proposal",
  "element",
  "element_comment",
  "element_group",
  "group",
  "invitation",
  "round",
  "scope_source",
  "source_element",
  "source_model",
] as const;

export function hasNamedSubject(targetType: string | null): boolean {
  return NAMED_SUBJECT_TYPES.some((type) => type === targetType);
}
