// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model (DT6), read only: nested groups, each with its cardinality and, for a
// sub-block, the existing sub-block it is; under each group its elements, a registration element
// marked as one. The Details page and the recap of the detail phase show it. A value shows only
// when it says something: no cardinality until one is set.
import { useModelType } from "@/components/projects/model-type-context";
import { m } from "@/i18n/messages";
import { formatCardinality } from "@/lib/cardinality";
import { isReferenceUrl } from "@/lib/elements";
import { groupName } from "@/lib/i18n/labels";
import { type ModelTree, nestGroups, type TreeElement, type TreeNode } from "@/lib/model-tree";
import { StatusBadge } from "../status/status-badge";

function Elements({ elements }: Readonly<{ elements: readonly TreeElement[] }>) {
  if (elements.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 pl-4">
      {elements.map((element) => (
        <li key={element.id} className="flex flex-wrap items-center gap-2">
          <span>{element.name}</span>
          {element.registration && <StatusBadge label={m.details_tree_registration()} />}
        </li>
      ))}
    </ul>
  );
}

function SubBlockText({ node }: Readonly<{ node: TreeNode }>) {
  const link = node.group.subBlockLink;
  if (link === null) return null;
  const url = link.url !== null && isReferenceUrl(link.url) ? link.url : null;
  return (
    <span className="text-sm">
      {m.details_tree_is()}{" "}
      {url === null ? (
        <span className="font-medium">{link.title}</span>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          {link.title}
          <span className="sr-only"> {m.board_reference_opens_new_tab()}</span>
        </a>
      )}
    </span>
  );
}

function GroupItem({
  node,
  elementsOf,
}: Readonly<{ node: TreeNode; elementsOf: (groupId: string) => TreeElement[] }>) {
  const modelType = useModelType();
  const { group } = node;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{groupName(group, modelType)}</span>
        {group.cardinality !== null && (
          <span className="text-muted-foreground tabular-nums">
            {formatCardinality(group.cardinality)}
          </span>
        )}
        {group.subBlock && <StatusBadge tone="info" label={m.details_tree_sub_block()} />}
        <SubBlockText node={node} />
      </div>
      <Elements elements={elementsOf(group.id)} />
      {node.children.length > 0 && (
        <ul className="flex flex-col gap-2 border-l pl-4">
          {node.children.map((child) => (
            <GroupItem key={child.group.id} node={child} elementsOf={elementsOf} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ModelTreeView({ tree, label }: Readonly<{ tree: ModelTree; label: string }>) {
  const known = new Set(tree.groups.map((group) => group.id));
  const elementsOf = (groupId: string) =>
    tree.elements.filter((element) => element.groupId === groupId);
  const loose = tree.elements.filter(
    (element) => element.groupId === null || !known.has(element.groupId),
  );
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {nestGroups(tree.groups).map((node) => (
        <GroupItem key={node.group.id} node={node} elementsOf={elementsOf} />
      ))}
      {loose.length > 0 && (
        <li className="flex flex-col gap-1">
          <span className="font-semibold">{m.board_check_ungrouped()}</span>
          <Elements elements={loose} />
        </li>
      )}
    </ul>
  );
}
