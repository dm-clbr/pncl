import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AssistHierarchyNode, HierarchyNode } from "@/lib/admin-api";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";
import { nodeMatchesUserId } from "@/lib/hierarchy-utils";

function formatEffectiveDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function collectExpandableIds(roots: Array<{ id: string; children: HierarchyNode[] | AssistHierarchyNode[] }>): Set<string> {
  const ids = new Set<string>();

  function walk(node: { id: string; children: HierarchyNode[] | AssistHierarchyNode[] }) {
    if (node.children.length > 0) {
      ids.add(node.id);
      node.children.forEach(walk);
    }
  }

  roots.forEach(walk);
  return ids;
}

function HierarchyTreeNode({
  node,
  depth,
  expandedIds,
  selectedNodeId,
  assistView,
  onToggle,
  onSelect,
}: {
  node: HierarchyNode | AssistHierarchyNode;
  depth: number;
  expandedIds: Set<string>;
  selectedNodeId: string | null;
  assistView?: boolean;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const selected = selectedNodeId === node.id;
  const label = assistView
    ? node.isPartnerGroup
      ? (node as AssistHierarchyNode).members?.map((member) => member.name).join(" & ") ?? "Business partners"
      : (node as AssistHierarchyNode).name
    : node.isPartnerGroup
      ? (node as HierarchyNode).name
      : (node as HierarchyNode).name;

  return (
    <li className="admin-tree-item">
      <div
        className={`admin-tree-row${selected ? " admin-tree-row-selected" : ""}`}
        data-hierarchy-node-id={node.id}
        data-hierarchy-member-ids={node.memberIds?.join(" ")}
      >
        {hasChildren ? (
          <button
            type="button"
            className="admin-tree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            onClick={() => onToggle(node.id)}
          >
            {expanded ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="admin-tree-toggle-spacer" aria-hidden="true" />
        )}

        {assistView ? (
          <button
            type="button"
            className="admin-tree-select"
            aria-label={`View hierarchy details for ${label}`}
            onClick={() => onSelect(node.id)}
          >
            {node.isPartnerGroup ? (
              <>
                <div className="admin-hierarchy-tile-avatars admin-tree-avatars">
                  {((node as AssistHierarchyNode).members ?? []).map((member) => (
                    <AdminUserAvatar
                      key={member.id}
                      name={member.name}
                      size="sm"
                    />
                  ))}
                </div>
                <span className="admin-tree-name">{label}</span>
                <span className="admin-tree-meta">
                  NPN {(node as AssistHierarchyNode).members?.map((member) => member.npn ?? "—").join(" · ")}
                </span>
              </>
            ) : (
              <>
                <AdminUserAvatar
                  name={(node as AssistHierarchyNode).name}
                  size="sm"
                />
                <span className="admin-tree-name">{label}</span>
                <span className="admin-tree-meta">NPN {(node as AssistHierarchyNode).npn ?? "—"}</span>
              </>
            )}
            {hasChildren && (
              <span className="admin-tree-count">{node.children.length} direct</span>
            )}
          </button>
        ) : (
          <button type="button" className="admin-tree-select" onClick={() => onSelect(node.id)}>
          {node.isPartnerGroup ? (
            <>
              <div className="admin-hierarchy-tile-avatars admin-tree-avatars">
                {((node as HierarchyNode).members ?? []).map((member) => (
                  <AdminUserAvatar
                    key={member.id}
                    name={member.name}
                    email={member.email}
                    profilePhotoPath={member.profilePhotoPath}
                    profileUpdatedAt={member.profileUpdatedAt}
                    size="sm"
                  />
                ))}
              </div>
              <span className="admin-tree-name">{label}</span>
              <span className="admin-badge assist">Partners</span>
            </>
          ) : (
            <>
              <span className="admin-tree-name">{label}</span>
              <span className="admin-tree-meta">
                Tier {(node as HierarchyNode).compLevel ?? "—"}{(node as HierarchyNode).compLevel != null ? "%" : ""}
                {formatEffectiveDate((node as HierarchyNode).compLevelEffectiveAt)
                  ? ` · effective ${formatEffectiveDate((node as HierarchyNode).compLevelEffectiveAt)}`
                  : ""}
              </span>
              {(node as HierarchyNode).role === "admin" && <span className="admin-badge">Admin</span>}
            </>
          )}
          {hasChildren && (
            <span className="admin-tree-count">
              {node.children.length} direct
            </span>
          )}
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <ul className="admin-tree-children" style={{ "--depth": depth + 1 } as React.CSSProperties}>
          {node.children.map((child) => (
            <HierarchyTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedNodeId={selectedNodeId}
              assistView={assistView}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface HierarchyTreeProps {
  tree: HierarchyNode[] | AssistHierarchyNode[];
  selectedNodeId: string | null;
  focusRequest?: { userId: string; requestId: number } | null;
  assistView?: boolean;
  onSelectNode: (nodeId: string) => void;
}

function getAncestorIds(
  roots: ReadonlyArray<HierarchyNode | AssistHierarchyNode>,
  userId: string,
  ancestors: string[] = [],
): string[] | null {
  for (const node of roots) {
    if (nodeMatchesUserId(node, userId)) return ancestors;
    const match = getAncestorIds(node.children, userId, [...ancestors, node.id]);
    if (match) return match;
  }
  return null;
}

export function HierarchyTree({ tree, selectedNodeId, focusRequest = null, assistView = false, onSelectNode }: HierarchyTreeProps) {
  const defaultExpanded = useMemo(() => collectExpandableIds(tree), [tree]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpanded));
  const viewportRef = useRef<HTMLDivElement>(null);
  const handledFocusRequest = useRef<number | null>(null);

  useEffect(() => {
    if (!focusRequest) {
      handledFocusRequest.current = null;
      return;
    }
    if (handledFocusRequest.current === focusRequest.requestId) return;
    const ancestors = getAncestorIds(tree, focusRequest.userId);
    if (!ancestors) return;
    handledFocusRequest.current = focusRequest.requestId;
    setExpandedIds((current) => new Set([...current, ...ancestors]));
  }, [focusRequest, tree]);

  useEffect(() => {
    if (!focusRequest || handledFocusRequest.current !== focusRequest.requestId) return;
    const viewport = viewportRef.current;
    const target = [...(viewport?.querySelectorAll<HTMLElement>("[data-hierarchy-node-id]") ?? [])]
      .find((row) => row.dataset.hierarchyNodeId === focusRequest.userId
        || row.dataset.hierarchyMemberIds?.split(" ").includes(focusRequest.userId));
    if (!viewport || !target) return;
    const viewportBounds = viewport.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const top = Math.max(0, viewport.scrollTop + targetBounds.top - viewportBounds.top
      - viewport.clientHeight / 2 + targetBounds.height / 2);
    let left = viewport.scrollLeft;
    if (targetBounds.left < viewportBounds.left) {
      left = Math.max(0, viewport.scrollLeft + targetBounds.left - viewportBounds.left);
    } else if (targetBounds.right > viewportBounds.right) {
      left = Math.max(0, viewport.scrollLeft + (targetBounds.width >= viewport.clientWidth
        ? targetBounds.left - viewportBounds.left
        : targetBounds.right - viewportBounds.right));
    }
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ top, left });
    } else {
      viewport.scrollTop = top;
      viewport.scrollLeft = left;
    }
  }, [expandedIds, focusRequest]);

  function handleToggle(nodeId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  return (
    <div ref={viewportRef} className="admin-hierarchy-tree-wrap">
      <ul className="admin-tree">
        {tree.map((node) => (
          <HierarchyTreeNode
            key={node.id}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            selectedNodeId={selectedNodeId}
            assistView={assistView}
            onToggle={handleToggle}
            onSelect={onSelectNode}
          />
        ))}
      </ul>
    </div>
  );
}
