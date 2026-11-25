// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's stakeholder group forms (PR6): add, rename and remove a group. A refusal
// shows in the form: a taken name at the name field, anything else at the top.
import { revalidateLogic } from "@tanstack/react-form";
import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { expertTypeLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { EXPERT_TYPES, type ExpertType, GROUP_NAME_MAX } from "@/lib/project-roles";
import { UNDO_MS } from "@/lib/undo";

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
  // The rename form shares the group form data; its expert type stays empty and unused.
  return z.object({ name: groupName(), expertType: z.string() });
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
  actions,
}: Readonly<{
  create: (input: { name: string; expertType: ExpertType }) => Promise<Outcome<unknown>>;
  onCreated: (name: string) => Promise<void> | void;
  /** Buttons next to the submit button, such as Cancel in a dialog. */
  actions?: ReactNode;
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
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <div className="flex flex-col gap-4">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={m.members_group_name_label()}
              description={m.members_group_name_description({ max: GROUP_NAME_MAX })}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="expertType">
          {(field) => (
            <field.SelectField
              label={m.members_expert_type_label()}
              placeholder={m.members_expert_type_placeholder()}
              options={EXPERT_TYPES.map((type) => ({ value: type, label: expertTypeLabel(type) }))}
            />
          )}
        </form.AppField>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {actions}
        <form.AppForm>
          <form.SubmitButton icon={<PlusIcon aria-hidden="true" data-icon="inline-start" />}>
            {m.members_new_group_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/** The dialog to rename one group; the group's action menu opens it. */
export function RenameGroupDialog({
  group,
  rename,
  onRenamed,
  open,
  onOpenChange,
}: Readonly<{
  group: { id: string; name: string };
  rename: (name: string) => Promise<Outcome<unknown>>;
  onRenamed: (name: string) => Promise<void> | void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const form = useAppForm({
    defaultValues: { name: group.name, expertType: "" } as GroupValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: renameGroupSchema() },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      const renamed = await submitGroupCall(formApi, () => rename(name));
      if (!renamed) return;
      onOpenChange(false);
      await onRenamed(name);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset({ name: group.name, expertType: "" });
        onOpenChange(next);
      }}
    >
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
 * The one menu of a group (UI/UX analysis F6): Rename and Remove. Removing happens at once with
 * an Undo toast: only a group without people or open invitations can go (`group_not_empty`), so
 * undoing it creates the group again with its name and expert type, and nothing else is lost.
 */
export function GroupActions({
  group,
  rename,
  onRenamed,
  remove,
  restore,
  onChanged,
}: Readonly<{
  group: { id: string; name: string; expertType: ExpertType };
  rename: (name: string) => Promise<Outcome<unknown>>;
  onRenamed: (name: string) => Promise<void> | void;
  remove: () => Promise<Outcome<unknown>>;
  restore: () => Promise<Outcome<unknown>>;
  /** Called after a remove or an undo, to refresh the lists. */
  onChanged: () => Promise<void> | void;
}>) {
  const [renaming, setRenaming] = useState(false);

  async function undo() {
    try {
      const outcome = await restore();
      if (!outcome.ok) {
        toast.error(refusalMessage(outcome.error));
        return;
      }
      toast.success(m.members_group_restored({ group: group.name }));
      await onChanged();
    } catch {
      toast.error(m.common_error_unexpected());
    }
  }

  async function removeNow() {
    try {
      const outcome = await remove();
      if (!outcome.ok) {
        toast.error(refusalMessage(outcome.error));
        return;
      }
      toast.success(m.members_group_removed({ group: group.name }), {
        duration: UNDO_MS,
        action: { label: m.common_undo(), onClick: () => void undo() },
      });
      await onChanged();
    } catch {
      toast.error(m.common_error_unexpected());
    }
  }

  return (
    <>
      {/* Not modal: a modal menu hides the page with aria-hidden while the page stays focusable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.members_actions_label({ group: group.name })}
          >
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <PencilIcon aria-hidden="true" />
            {m.members_rename()}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => void removeNow()}>
            <Trash2Icon aria-hidden="true" />
            {m.members_remove()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameGroupDialog
        group={group}
        rename={rename}
        onRenamed={onRenamed}
        open={renaming}
        onOpenChange={setRenaming}
      />
    </>
  );
}
