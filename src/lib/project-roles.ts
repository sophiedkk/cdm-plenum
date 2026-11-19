// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project roles of ADR 0004 and what each may do: the one rule the server checks and the
// screens read. A project is a better-auth organization, a stakeholder group a team.
import { createAccessControl } from "better-auth/plugins/access";

/** The roles a person holds inside one project (docs/requirements.md, "Roles"). */
export const PROJECT_ROLES = ["facilitator", "participant"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** Returns whether `value` names a project role. */
export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && (PROJECT_ROLES as readonly string[]).includes(value);
}

/** What can be done in a project, by resource; the roles below grant subsets. */
export const PROJECT_STATEMENTS = {
  invitation: ["create", "list", "cancel"],
  group: ["create", "update", "delete"],
  scope: ["update", "read_authors"],
  element: ["update", "merge", "import", "set_values", "read_authors"],
  ckm: ["search", "link", "import"],
  export: ["download"],
} as const;

/** The access control of the project roles (better-auth `createAccessControl`). */
export const projectAccessControl = createAccessControl(PROJECT_STATEMENTS);

/**
 * The facilitator invites, manages stakeholder groups, edits the scope and the board, sees who
 * wrote what (EL2, ADR 0005), uses CKM (EL4, EL7) and downloads the exports. A participant
 * manages nothing: reading the scope, adding elements and commenting need only a membership.
 */
export const projectRoles = {
  facilitator: projectAccessControl.newRole({
    invitation: ["create", "list", "cancel"],
    group: ["create", "update", "delete"],
    scope: ["update", "read_authors"],
    element: ["update", "merge", "import", "set_values", "read_authors"],
    ckm: ["search", "link", "import"],
    export: ["download"],
  }),
  participant: projectAccessControl.newRole({}),
} satisfies Record<ProjectRole, unknown>;

/** One permission of a project role: a resource and one of its actions. */
export type ProjectPermission = {
  [R in keyof typeof PROJECT_STATEMENTS]: {
    readonly [K in R]: readonly [(typeof PROJECT_STATEMENTS)[R][number]];
  };
}[keyof typeof PROJECT_STATEMENTS];

/** Returns whether `role` may do `permission` in a project. */
export function projectCan(role: ProjectRole, permission: ProjectPermission): boolean {
  return projectRoles[role].authorize(permission).success;
}

/**
 * The expert type of a stakeholder group (PR6, owner decision 2026-11-19, after the Nictiz zib
 * management agreements, roles from NEN 7522).
 */
export const EXPERT_TYPES = ["clinical", "terminology", "architecture"] as const;
export type ExpertType = (typeof EXPERT_TYPES)[number];

/** Returns whether `value` names an expert type. */
export function isExpertType(value: unknown): value is ExpertType {
  return typeof value === "string" && (EXPERT_TYPES as readonly string[]).includes(value);
}

/**
 * The stakeholder groups a new project starts with: the Nictiz clinical expert areas, one
 * terminology group and one architecture group. `key` picks the translated name.
 */
export const DEFAULT_GROUPS = [
  { key: "general_medicine", expertType: "clinical" },
  { key: "primary_care", expertType: "clinical" },
  { key: "mental_health_care", expertType: "clinical" },
  { key: "nursing", expertType: "clinical" },
  { key: "medication_and_allergies", expertType: "clinical" },
  { key: "patient", expertType: "clinical" },
  { key: "administrative", expertType: "clinical" },
  { key: "terminology", expertType: "terminology" },
  { key: "architecture", expertType: "architecture" },
] as const satisfies readonly { key: string; expertType: ExpertType }[];
export type DefaultGroupKey = (typeof DEFAULT_GROUPS)[number]["key"];

/** The longest project name and stakeholder group name the app stores. */
export const PROJECT_NAME_MAX = 120;
export const GROUP_NAME_MAX = 60;
