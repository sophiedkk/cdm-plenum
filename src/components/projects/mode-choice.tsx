// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The choice between a Delphi study and a Team (PR14, ADR 0023), shared by the new project form
// and the settings page: two radio options, each with its one-line explanation.
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { projectModeDescription, projectModeLabel } from "@/lib/i18n/labels";
import { isProjectMode, PROJECT_MODES, type ProjectMode } from "@/lib/project-mode";

export function ModeChoice({
  name,
  value,
  onChange,
  labelledBy,
}: Readonly<{
  name: string;
  value: ProjectMode;
  onChange: (mode: ProjectMode) => void;
  /** The id of the heading or legend that names the group. */
  labelledBy: string;
}>) {
  return (
    <RadioGroup
      name={name}
      value={value}
      aria-labelledby={labelledBy}
      onValueChange={(next) => {
        if (isProjectMode(next)) onChange(next);
      }}
    >
      {PROJECT_MODES.map((option) => {
        const id = `${name}-${option}`;
        return (
          <Field key={option} orientation="horizontal">
            <RadioGroupItem value={option} id={id} aria-describedby={`${id}-description`} />
            <FieldContent>
              <FieldLabel htmlFor={id}>{projectModeLabel(option)}</FieldLabel>
              <FieldDescription id={`${id}-description`}>
                {projectModeDescription(option)}
              </FieldDescription>
            </FieldContent>
          </Field>
        );
      })}
    </RadioGroup>
  );
}
