import { useMemo } from "react";
import type { HierarchyNode } from "@/lib/admin-api";
import { getProfilePhotoUrl } from "@/lib/portal-profile";

const TILE_WIDTH = 148;
const TILE_HEIGHT = 132;
const H_GAP = 28;
const V_GAP = 72;
const ROOT_GAP = 48;
const CANVAS_PADDING = 40;

type Point = { x: number; y: number };

type PositionedNode = {
  node: HierarchyNode;
  x: number;
  y: number;
};

type Connection = {
  from: Point;
  to: Point;
};

function getInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function layoutHierarchyTree(roots: HierarchyNode[]): {
  positioned: PositionedNode[];
  width: number;
  height: number;
} {
  const positioned: PositionedNode[] = [];
  let nextLeafX = CANVAS_PADDING;
  let maxDepth = 0;

  function assignNode(node: HierarchyNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const y = CANVAS_PADDING + depth * (TILE_HEIGHT + V_GAP);

    if (node.children.length === 0) {
      const x = nextLeafX + TILE_WIDTH / 2;
      nextLeafX += TILE_WIDTH + H_GAP;
      positioned.push({ node, x, y });
      return x;
    }

    const childCenters = node.children.map((child) => assignNode(child, depth + 1));
    const x = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    positioned.push({ node, x, y });
    return x;
  }

  for (const root of roots) {
    assignNode(root, 0);
    nextLeafX += ROOT_GAP;
  }

  const width = Math.max(nextLeafX + CANVAS_PADDING - ROOT_GAP, TILE_WIDTH + CANVAS_PADDING * 2);
  const height = CANVAS_PADDING * 2 + (maxDepth + 1) * TILE_HEIGHT + maxDepth * V_GAP;

  return { positioned, width, height };
}

function collectConnections(roots: HierarchyNode[], positionedById: Map<string, PositionedNode>): Connection[] {
  const connections: Connection[] = [];

  function walk(node: HierarchyNode) {
    const parent = positionedById.get(node.id);
    if (!parent) return;

    for (const child of node.children) {
      const childPos = positionedById.get(child.id);
      if (childPos) {
        connections.push({
          from: { x: parent.x, y: parent.y + TILE_HEIGHT },
          to: { x: childPos.x, y: childPos.y },
        });
      }
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return connections;
}

function connectorPath(from: Point, to: Point): string {
  const midY = from.y + (to.y - from.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
}

function HierarchyTile({ node }: { node: HierarchyNode }) {
  const photoUrl = getProfilePhotoUrl(
    node.profilePhotoPath ?? null,
    node.profileUpdatedAt ?? null,
  );
  const initials = getInitialsFromName(node.name);

  return (
    <article className="admin-hierarchy-tile">
      <div className="admin-hierarchy-tile-avatar" aria-hidden="true">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="admin-hierarchy-tile-photo" />
        ) : (
          <span className="admin-hierarchy-tile-initials">{initials}</span>
        )}
      </div>
      <h3 className="admin-hierarchy-tile-name">{node.name}</h3>
      <div className="admin-hierarchy-tile-foot">
        {node.role === "admin" && <span className="admin-badge">Admin</span>}
        {node.children.length > 0 && (
          <span className="admin-hierarchy-tile-meta">{node.children.length} direct</span>
        )}
      </div>
    </article>
  );
}

export function HierarchyCanvas({ tree }: { tree: HierarchyNode[] }) {
  const layout = useMemo(() => layoutHierarchyTree(tree), [tree]);

  const positionedById = useMemo(
    () => new Map(layout.positioned.map((entry) => [entry.node.id, entry])),
    [layout.positioned],
  );

  const connections = useMemo(
    () => collectConnections(tree, positionedById),
    [tree, positionedById],
  );

  return (
    <div className="admin-hierarchy-scroll">
      <div
        className="admin-hierarchy-canvas"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="admin-hierarchy-lines"
          width={layout.width}
          height={layout.height}
          aria-hidden="true"
        >
          {connections.map((connection, index) => (
            <path
              key={index}
              d={connectorPath(connection.from, connection.to)}
              className="admin-hierarchy-line"
            />
          ))}
        </svg>

        {layout.positioned.map(({ node, x, y }) => (
          <div
            key={node.id}
            className="admin-hierarchy-node"
            style={{
              left: x - TILE_WIDTH / 2,
              top: y,
              width: TILE_WIDTH,
              height: TILE_HEIGHT,
            }}
          >
            <HierarchyTile node={node} />
          </div>
        ))}
      </div>
    </div>
  );
}
