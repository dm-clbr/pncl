import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AssistHierarchyNode, HierarchyNode } from "@/lib/admin-api";

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
    ? (node as AssistHierarchyNode).email
    : (node as HierarchyNode).name;

  return (
    <li className="admin-tree-item">
      <div className={`admin-tree-row${selected ? " admin-tree-row-selected" : ""}`}>
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

        <button type="button" className="admin-tree-select" onClick={() => onSelect(node.id)}>
          {assistView ? (
            <>
              <span className="admin-tree-name">{label}</span>
              <span className="admin-tree-meta">NPN {(node as AssistHierarchyNode).npn ?? "—"}</span>
            </>
          ) : (
            <>
              <span className="admin-tree-name">{label}</span>
              {(node as HierarchyNode).role === "admin" && <span className="admin-badge">Admin</span>}
            </>
          )}
          {hasChildren && (
            <span className="admin-tree-count">
              {node.children.length} direct
            </span>
          )}
        </button>
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
  assistView?: boolean;
  onSelectNode: (nodeId: string) => void;
}

export function HierarchyTree({ tree, selectedNodeId, assistView = false, onSelectNode }: HierarchyTreeProps) {
  const defaultExpanded = useMemo(() => collectExpandableIds(tree), [tree]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpanded));

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
    <div className="admin-hierarchy-tree-wrap">
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
