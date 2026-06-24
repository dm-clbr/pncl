import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HierarchyNode } from "@/lib/admin-api";

function collectExpandableIds(roots: HierarchyNode[]): Set<string> {
  const ids = new Set<string>();

  function walk(node: HierarchyNode) {
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
  onToggle,
  onSelect,
}: {
  node: HierarchyNode;
  depth: number;
  expandedIds: Set<string>;
  selectedNodeId: string | null;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const selected = selectedNodeId === node.id;

  return (
    <li className="admin-tree-item">
      <div className={`admin-tree-row${selected ? " admin-tree-row-selected" : ""}`}>
        {hasChildren ? (
          <button
            type="button"
            className="admin-tree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
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
          <span className="admin-tree-name">{node.name}</span>
          {node.role === "admin" && <span className="admin-badge">Admin</span>}
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
  tree: HierarchyNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function HierarchyTree({ tree, selectedNodeId, onSelectNode }: HierarchyTreeProps) {
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
            onToggle={handleToggle}
            onSelect={onSelectNode}
          />
        ))}
      </ul>
    </div>
  );
}
