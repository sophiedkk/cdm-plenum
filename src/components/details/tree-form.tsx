// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree proposal (DT6): nest the groups, give each a cardinality, mark sub-blocks with the
// existing sub-block they are, add groups, and place and mark the elements. Every move has a
// keyboard path: "Part of" puts a group into another or back at the top, and "Move up" and
// "Move down" order it among its siblings (WCAG 2.1.1). Focus stays on the control that moved a
// group. The sub-block fields open below the checkbox, so nothing above them moves.
// NOTE: no spec governs this, our own design: a "Part of" select replaces "Move into" and "Move
// out", and drag and drop is left out; one select reaches every parent in one step.
import { revalidateLogic } from "@tanstack/react-form";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { z } from "zod";
import {
  maxKindOptions,
  minOccursOptions,
  SELECT_CLASS,
  SelectField,
} from "@/components/board/element-fields";
import { fromCardinality, toCardinality } from "@/components/board/element-form";
import { useAppForm } from "@/components/form/app-form";
import { type BaseFieldProps, FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { useFieldContext } from "@/components/form/form-context";
import { useModelType } from "@/components/projects/model-type-context";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import { ELEMENT_GROUP_NAME_MAX } from "@/lib/element-groups";
import { isReferenceUrl } from "@/lib/elements";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { groupName } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  ancestry,
  depthFirst,
  descendants,
  type ModelTree,
  moveGroup,
  newGroupId,
  SUB_BLOCK_TITLE_MAX,
  SUB_BLOCK_URL_MAX,
  shiftElement,
  shiftGroup,
  type TreeInput,
} from "@/lib/model-tree";
import type { ModelType } from "@/lib/model-types";

interface EditGroup {
  id: string;
  /** A group the proposal adds, which takes a name. */
  added: boolean;
  /** The name of a group the project has, as shown. */
  label: string;
  /** The name of an added group. */
  name: string;
  parentId: string | null;
  minOccurs: string;
  maxKind: string;
  maxNumber: string;
  subBlock: boolean;
  linkTitle: string;
  linkUrl: string;
}

interface EditElement {
  id: string;
  name: string;
  /** The group id, or "" for "Not grouped yet". */
  groupId: string;
  registration: boolean;
}

interface FormValues {
  groups: EditGroup[];
  elements: EditElement[];
}

function fromTree(tree: ModelTree, type: ModelType | null): FormValues {
  return {
    groups: tree.groups.map((group) => ({
      id: group.id,
      added: false,
      label: groupName(group, type),
      name: "",
      parentId: group.parentId,
      ...fromCardinality(group.cardinality),
      subBlock: group.subBlock,
      linkTitle: group.subBlockLink?.title ?? "",
      linkUrl: group.subBlockLink?.url ?? "",
    })),
    elements: tree.elements.map((element) => ({
      id: element.id,
      name: element.name,
      groupId: element.groupId ?? "",
      registration: element.registration,
    })),
  };
}

function toInput(values: FormValues): TreeInput {
  return {
    groups: depthFirst(values.groups).map((group) => {
      const title = group.linkTitle.trim();
      const url = group.linkUrl.trim();
      return {
        id: group.id,
        name: group.added ? group.name.trim() : null,
        parentId: group.parentId,
        cardinality: toCardinality(group),
        subBlock: group.subBlock,
        subBlockLink:
          group.subBlock && title !== "" ? { title, url: url === "" ? null : url } : null,
      };
    }),
    elements: values.elements.map((element) => ({
      id: element.id,
      groupId: element.groupId === "" ? null : element.groupId,
      registration: element.registration,
    })),
  };
}

/** The checks of `proposeTreeInput` with translated messages, on the field they concern. */
function treeSchema() {
  return z
    .object({ groups: z.array(z.any()), elements: z.array(z.any()) })
    .superRefine((value, ctx) => {
      const issue = (index: number, field: keyof EditGroup, message: string) =>
        ctx.addIssue({ code: "custom", path: ["groups", index, field], message });
      (value.groups as EditGroup[]).forEach((group, index) => {
        if (group.added) {
          const name = group.name.trim();
          if (name === "") issue(index, "name", m.details_tree_name_required());
          else if (name.length > ELEMENT_GROUP_NAME_MAX) {
            issue(index, "name", m.board_text_too_long({ max: ELEMENT_GROUP_NAME_MAX }));
          }
        }
        if ((group.minOccurs === "") !== (group.maxKind === "")) {
          issue(
            index,
            group.minOccurs === "" ? "minOccurs" : "maxKind",
            m.board_cardinality_incomplete(),
          );
        }
        if (group.maxKind === "number" && !/^[1-9][0-9]{0,8}$/.test(group.maxNumber.trim())) {
          issue(index, "maxNumber", m.board_max_number_invalid());
        }
        if (!group.subBlock) return;
        const title = group.linkTitle.trim();
        const url = group.linkUrl.trim();
        if (title.length > SUB_BLOCK_TITLE_MAX) {
          issue(index, "linkTitle", m.board_text_too_long({ max: SUB_BLOCK_TITLE_MAX }));
        }
        if (url !== "" && (!isReferenceUrl(url) || url.length > SUB_BLOCK_URL_MAX)) {
          issue(index, "linkUrl", m.details_tree_link_invalid());
        } else if (url !== "" && title === "") {
          issue(index, "linkTitle", m.details_tree_link_needs_title());
        }
      });
    });
}

/** A checkbox for a `boolean` value, with its label beside it. */
function CheckField({ label, className, srName }: BaseFieldProps & { readonly srName?: string }) {
  const field = useFieldContext<boolean>();
  const a11y = useFieldA11y(field, undefined);
  return (
    <Field orientation="horizontal" className={className}>
      <input
        {...a11y.controlProps}
        type="checkbox"
        checked={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.checked)}
        className="size-4 shrink-0 accent-primary"
      />
      <label htmlFor={a11y.controlProps.id}>
        {label}
        {srName && <span className="sr-only">: {srName}</span>}
      </label>
      <FieldFeedback a11y={a11y} description={undefined} />
    </Field>
  );
}

/** The path of a group from the top of the model, as the selects name it. */
function pathLabel(groups: readonly EditGroup[], id: string): string {
  return ancestry(groups, id)
    .map((group) => (group.added ? group.name.trim() || m.details_tree_new_group() : group.label))
    .join(" > ");
}

export function TreeForm({
  initial,
  submitLabel,
  submit,
  onDone,
  actions,
}: Readonly<{
  /** The tree to start from: the current proposal, or the tree the project has now. */
  initial: ModelTree;
  submitLabel: string;
  submit: (tree: TreeInput) => Promise<Outcome<unknown>>;
  onDone: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const base = useId();
  const modelType = useModelType();
  const form = useAppForm({
    defaultValues: fromTree(initial, modelType),
    validationLogic: revalidateLogic(),
    validators: { onDynamic: treeSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<unknown>;
      try {
        outcome = await submit(toInput(value));
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onDone();
    },
  });

  /** Puts focus back on a control of a group after the list re-renders. */
  const refocus = (id: string, control: string) => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-group="${id}"] [data-control="${control}"]`)
        ?.focus();
    });
  };
  const refocusElement = (id: string, control: string) => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-element="${id}"] [data-control="${control}"]`)
        ?.focus();
    });
  };
  const moveElement = (id: string, step: -1 | 1) => {
    form.setFieldValue("elements", shiftElement(form.state.values.elements, id, step));
    refocusElement(id, step < 0 ? "up" : "down");
  };
  const setGroups = (next: EditGroup[]) => form.setFieldValue("groups", next);
  const groupsNow = () => form.state.values.groups;

  const removeGroup = (id: string) => {
    const groups = groupsNow();
    const removed = groups.find((group) => group.id === id);
    if (!removed) return;
    setGroups(
      depthFirst(
        groups
          .filter((group) => group.id !== id)
          .map((group) =>
            group.parentId === id ? { ...group, parentId: removed.parentId } : group,
          ),
      ),
    );
    form.setFieldValue(
      "elements",
      form.state.values.elements.map((element) =>
        element.groupId === id ? { ...element, groupId: removed.parentId ?? "" } : element,
      ),
    );
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>("[data-add-group]")?.focus();
    });
  };

  const renderGroup = (groups: EditGroup[], group: EditGroup): ReactNode => {
    const index = groups.indexOf(group);
    const children = groups.filter((child) => child.parentId === group.id);
    const siblings = groups.filter((other) => other.parentId === group.parentId);
    const place = siblings.indexOf(group);
    const blocked = descendants(groups, group.id);
    const shown = group.added ? group.name.trim() || m.details_tree_new_group() : group.label;
    const parentId = `${base}${group.id}parent`;
    return (
      <li key={group.id} data-group={group.id} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          {group.added ? (
            <form.AppField name={`groups[${index}].name`}>
              {(field) => (
                <field.TextField label={m.details_tree_new_group_name()} autoComplete="off" />
              )}
            </form.AppField>
          ) : (
            <p className="font-semibold">{group.label}</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-2">
              <label htmlFor={parentId} className="text-sm font-medium">
                {m.details_tree_part_of()}
                <span className="sr-only">: {shown}</span>
              </label>
              <select
                id={parentId}
                data-control="parent"
                className={SELECT_CLASS}
                value={group.parentId ?? ""}
                onChange={(event) => {
                  setGroups(moveGroup(groupsNow(), group.id, event.target.value || null));
                  refocus(group.id, "parent");
                }}
              >
                <option value="">{m.details_tree_top()}</option>
                {groups
                  .filter((other) => other.id !== group.id && !blocked.has(other.id))
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {pathLabel(groups, other.id)}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-control="up"
              disabled={place <= 0}
              onClick={() => {
                setGroups(shiftGroup(groupsNow(), group.id, -1));
                refocus(group.id, "up");
              }}
            >
              <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
              {m.details_tree_move_up()}
              <span className="sr-only">: {shown}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-control="down"
              disabled={place >= siblings.length - 1}
              onClick={() => {
                setGroups(shiftGroup(groupsNow(), group.id, 1));
                refocus(group.id, "down");
              }}
            >
              <ArrowDownIcon aria-hidden="true" data-icon="inline-start" />
              {m.details_tree_move_down()}
              <span className="sr-only">: {shown}</span>
            </Button>
            {group.added && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeGroup(group.id)}
              >
                <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                {m.details_tree_remove_group()}
                <span className="sr-only">: {shown}</span>
              </Button>
            )}
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">
              {m.board_cardinality_legend()}
              <span className="sr-only">: {shown}</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <form.AppField name={`groups[${index}].minOccurs`}>
                {() => <SelectField label={m.board_min_label()} options={minOccursOptions()} />}
              </form.AppField>
              <form.AppField name={`groups[${index}].maxKind`}>
                {() => <SelectField label={m.board_max_label()} options={maxKindOptions()} />}
              </form.AppField>
              {group.maxKind === "number" && (
                <form.AppField name={`groups[${index}].maxNumber`}>
                  {(field) => (
                    <field.TextField
                      label={m.board_max_number_label()}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  )}
                </form.AppField>
              )}
            </div>
          </fieldset>
          <form.AppField name={`groups[${index}].subBlock`}>
            {() => <CheckField label={m.details_tree_sub_block()} srName={shown} />}
          </form.AppField>
          {group.subBlock && (
            <div className="grid gap-3 sm:grid-cols-2">
              <form.AppField name={`groups[${index}].linkTitle`}>
                {(field) => (
                  <field.TextField label={m.details_tree_link_title()} autoComplete="off" />
                )}
              </form.AppField>
              <form.AppField name={`groups[${index}].linkUrl`}>
                {(field) => (
                  <field.TextField
                    type="url"
                    label={m.details_tree_link_url()}
                    autoComplete="off"
                  />
                )}
              </form.AppField>
            </div>
          )}
        </div>
        {children.length > 0 && (
          <ul className="flex flex-col gap-3 border-l pl-4">
            {children.map((child) => renderGroup(groups, child))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.Subscribe selector={(state) => state.values.groups}>
        {(groups) => (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-semibold">{m.details_tree_groups()}</legend>
            <ul className="flex flex-col gap-3">
              {groups
                .filter((group) => group.parentId === null)
                .map((group) => renderGroup(groups, group))}
            </ul>
            <div>
              <Button
                type="button"
                variant="outline"
                data-add-group
                onClick={() => {
                  const id = newGroupId();
                  setGroups([
                    ...groupsNow(),
                    {
                      id,
                      added: true,
                      label: "",
                      name: "",
                      parentId: null,
                      ...fromCardinality(null),
                      subBlock: false,
                      linkTitle: "",
                      linkUrl: "",
                    },
                  ]);
                  requestAnimationFrame(() => {
                    formRef.current
                      ?.querySelector<HTMLElement>(`[data-group="${id}"] input`)
                      ?.focus();
                  });
                }}
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {m.details_tree_add_group()}
              </Button>
            </div>
          </fieldset>
        )}
      </form.Subscribe>
      <form.Subscribe
        selector={(state) => ({ groups: state.values.groups, elements: state.values.elements })}
      >
        {({ groups, elements }) =>
          elements.length > 0 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-semibold">{m.details_tree_elements()}</legend>
              <ul className="flex flex-col gap-3">
                {elements.map((element, index) => (
                  <li
                    key={element.id}
                    data-element={element.id}
                    className="flex flex-col gap-2 rounded-lg border p-3"
                  >
                    <p className="font-medium">{element.name}</p>
                    <div className="grid items-end gap-3 sm:grid-cols-2">
                      <form.AppField name={`elements[${index}].groupId`}>
                        {() => (
                          <SelectField
                            label={m.details_tree_group_of({ name: element.name })}
                            options={[
                              { value: "", label: m.board_check_ungrouped() },
                              ...groups.map((group) => ({
                                value: group.id,
                                label: pathLabel(groups, group.id),
                              })),
                            ]}
                          />
                        )}
                      </form.AppField>
                      <form.AppField name={`elements[${index}].registration`}>
                        {() => (
                          <CheckField label={m.details_tree_registration()} srName={element.name} />
                        )}
                      </form.AppField>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-control="up"
                        disabled={
                          elements.findIndex((other) => other.groupId === element.groupId) === index
                        }
                        onClick={() => moveElement(element.id, -1)}
                      >
                        <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
                        {m.details_tree_move_up()}
                        <span className="sr-only">: {element.name}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-control="down"
                        disabled={
                          elements.findLastIndex((other) => other.groupId === element.groupId) ===
                          index
                        }
                        onClick={() => moveElement(element.id, 1)}
                      >
                        <ArrowDownIcon aria-hidden="true" data-icon="inline-start" />
                        {m.details_tree_move_down()}
                        <span className="sr-only">: {element.name}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          )
        }
      </form.Subscribe>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
