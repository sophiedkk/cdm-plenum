// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's stakeholder group forms (PR6): add, rename and remove a group. A refusal
// shows in the form: a taken name at the name field, anything else at the top.
import { revalidateLogic } from "@tanstack/react-form";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { expertTypeLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { EXPERT_TYPES, type ExpertType, GROUP_NAME_MAX } from "@/lib/project-roles";

function groupName() {
  return z
    .string()
    .trim()
    .min(1, { error: () => m.members_group_name_required() })
    .max(GROUP_NAME_MAX, { error: () => m.members_group_name_too_long({ max: GROUP_NAME_MAX }) });
}

/**
 * The limits of `createGroupInput` (src/server/projects/schemas.ts) with translated messages.
 * Call it during render, so the messages follow the active locale.
 */
export function newGroupSchema() {
  return z.object({
    name: groupName(),
    expertType: z.enum(EXPERT_TYPES, { error: () => m.members_expert_type_required() }),
  });
}

/** The limits of `renameGroupInput`, with translated messages. */
export function renameGroupSchema() {
  return z.object({ name: groupName() });
}

/** The form data of a group form; the expert type is empty until one is chosen. */
interface GroupValues {
  name: string;
  expertType: string;
}

/** Runs `call` and shows its refusal: a taken name at the name field, the rest at the top. */
async function submitGroupCall<T>(
  formApi: Parameters<typeof applyServerRefusal<GroupValues>>[0],
  call: () => Promise<Outcome<T>>,
): Promise<{ value: T } | undefined> {
  let outcome: Outcome<T>;
  try {
    outcome = await call();
  } catch {
    applyServerRefusal(formApi, { form: m.common_error_unexpected() });
    return undefined;
  }
  if (outcome.ok) return { value: outcome.value };
  if (outcome.error === "group_name_taken") {
    applyServerRefusal(formApi, { fields: { name: refusalMessage(outcome.error) } });
  } else {
    applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
  }
  return undefined;
}

/** Adds a stakeholder group with a name and an expert type. */
export function NewGroupForm({
  create,
  onCreated,
}: Readonly<{
  create: (input: { name: string; expertType: ExpertType }) => Promise<Outcome<unknown>>;
  onCreated: (name: string) => Promise<void> | void;
}>) {
  const form = useAppForm({
    defaultValues: { name: "", expertType: "" } as GroupValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: newGroupSchema() },
    onSubmit: async ({ value, formApi }) => {
      const input = newGroupSchema().parse(value);
      const created = await submitGroupCall(formApi, () => create(input));
      if (!created) return;
      formApi.reset();
      await onCreated(input.name);
    },
  });

  return (
    <form
      noValidate
      aria-labelledby="new-group-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h3 id="new-group-title" className="text-lg font-semibold">
        {m.members_new_group_title()}
      </h3>
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={m.members_group_name_label()}
              description={m.members_group_name_description({ max: GROUP_NAME_MAX })}
              autoComplete="off"
              className="sm:max-w-xs"
            />
          )}
        </form.AppField>
        <form.AppField name="expertType">
          {(field) => (
            <field.SelectField
              label={m.members_expert_type_label()}
              placeholder={m.members_expert_type_placeholder()}
              options={EXPERT_TYPES.map((type) => ({ value: type, label: expertTypeLabel(type) }))}
              className="sm:max-w-xs"
            />
          )}
        </form.AppField>
      </div>
      <div>
        <form.AppForm>
          <form.SubmitButton icon={<PlusIcon aria-hidden="true" data-icon="inline-start" />}>
            {m.members_new_group_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/** A button that opens a dialog to rename one group. */
export function RenameGroupDialog({
  group,
  rename,
  onRenamed,
}: Readonly<{
  group: { id: string; name: string };
  rename: (name: string) => Promise<Outcome<unknown>>;
  onRenamed: (name: string) => Promise<void> | void;
}>) {
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { name: group.name, expertType: "" } as GroupValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: renameGroupSchema() },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      const renamed = await submitGroupCall(formApi, () => rename(name));
      if (!renamed) return;
      setOpen(false);
      await onRenamed(name);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset({ name: group.name, expertType: "" });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={m.members_rename_label({ group: group.name })}
        >
          <PencilIcon aria-hidden="true" data-icon="inline-start" />
          {m.members_rename()}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{m.members_rename_title()}</DialogTitle>
            <DialogDescription>
              {m.members_rename_description({ group: group.name })}
            </DialogDescription>
          </DialogHeader>
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={m.members_group_name_label()}
                description={m.members_group_name_description({ max: GROUP_NAME_MAX })}
                autoComplete="off"
              />
            )}
          </form.AppField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {m.common_cancel()}
              </Button>
            </DialogClose>
            <form.AppForm>
              <form.SubmitButton>{m.members_rename_submit()}</form.SubmitButton>
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A button that asks to confirm removing one group. A group with participants or open
 * invitations stays; the refusal shows in the dialog.
 */
export function RemoveGroupDialog({
  group,
  remove,
  onRemoved,
}: Readonly<{
  group: { id: string; name: string };
  remove: () => Promise<Outcome<unknown>>;
  onRemoved: () => Promise<void> | void;
}>) {
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { name: "", expertType: "" } as GroupValues,
    onSubmit: async ({ formApi }) => {
      const removed = await submitGroupCall(formApi, remove);
      if (!removed) return;
      setOpen(false);
      await onRemoved();
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset();
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={m.members_remove_label({ group: group.name })}
        >
          <Trash2Icon aria-hidden="true" data-icon="inline-start" />
          {m.members_remove()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{m.members_remove_title({ group: group.name })}</AlertDialogTitle>
            <AlertDialogDescription>{m.members_remove_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <form.AppForm>
              <form.SubmitButton variant="destructive">
                {m.members_remove_submit()}
              </form.SubmitButton>
            </form.AppForm>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
