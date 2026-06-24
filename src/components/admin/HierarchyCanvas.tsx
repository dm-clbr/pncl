import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import type { HierarchyNode } from "@/lib/admin-api";
import { getProfilePhotoUrl } from "@/lib/portal-profile";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

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

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function HierarchyTile({
  node,
  selected,
  onSelect,
}: {
  node: HierarchyNode;
  selected: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const photoUrl = getProfilePhotoUrl(
    node.profilePhotoPath ?? null,
    node.profileUpdatedAt ?? null,
  );
  const initials = getInitialsFromName(node.name);

  return (
    <button
      type="button"
      className={`admin-hierarchy-tile${selected ? " admin-hierarchy-tile-selected" : ""}`}
      onClick={() => onSelect(node.id)}
    >
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
    </button>
  );
}

interface HierarchyCanvasProps {
  tree: HierarchyNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function HierarchyCanvas({ tree, selectedNodeId, onSelectNode }: HierarchyCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutHierarchyTree(tree), [tree]);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const positionedById = useMemo(
    () => new Map(layout.positioned.map((entry) => [entry.node.id, entry])),
    [layout.positioned],
  );

  const connections = useMemo(
    () => collectConnections(tree, positionedById),
    [tree, positionedById],
  );

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const padding = 32;
    const availableWidth = viewport.clientWidth - padding * 2;
    const availableHeight = viewport.clientHeight - padding * 2;
    const nextScale = clampZoom(
      Math.min(availableWidth / layout.width, availableHeight / layout.height, 1),
    );

    setScale(nextScale);
    setPan({
      x: Math.max((viewport.clientWidth - layout.width * nextScale) / 2, padding / 2),
      y: Math.max((viewport.clientHeight - layout.height * nextScale) / 2, padding / 2),
    });
  }, [layout.height, layout.width]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const direction = event.deltaY > 0 ? -1 : 1;
    const nextScale = clampZoom(scale + direction * ZOOM_STEP);
    if (nextScale === scale) return;

    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const scaleRatio = nextScale / scale;

    setPan((current) => ({
      x: cursorX - (cursorX - current.x) * scaleRatio,
      y: cursorY - (cursorY - current.y) * scaleRatio,
    }));
    setScale(nextScale);
  }, [scale]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".admin-hierarchy-tile")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }, [pan.x, pan.y]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;

    setPan({
      x: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
    });
  }, [isPanning]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPanning(false);
    panStartRef.current = null;
  }, [isPanning]);

  const zoomLabel = `${Math.round(scale * 100)}%`;

  return (
    <div className="admin-hierarchy-shell">
      <div className="admin-hierarchy-zoom-toolbar" aria-label="Canvas zoom controls">
        <button
          type="button"
          className="admin-hierarchy-zoom-btn"
          aria-label="Zoom out"
          disabled={scale <= MIN_ZOOM}
          onClick={() => setScale((current) => clampZoom(current - ZOOM_STEP))}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <span className="admin-hierarchy-zoom-label">{zoomLabel}</span>
        <button
          type="button"
          className="admin-hierarchy-zoom-btn"
          aria-label="Zoom in"
          disabled={scale >= MAX_ZOOM}
          onClick={() => setScale((current) => clampZoom(current + ZOOM_STEP))}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="admin-hierarchy-zoom-btn admin-hierarchy-zoom-btn-text"
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          100%
        </button>
        <button
          type="button"
          className="admin-hierarchy-zoom-btn admin-hierarchy-zoom-btn-text"
          onClick={fitToView}
        >
          <RotateCcw size={13} aria-hidden="true" />
          Fit
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`admin-hierarchy-viewport${isPanning ? " admin-hierarchy-viewport-panning" : ""}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="admin-hierarchy-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            width: layout.width,
            height: layout.height,
          }}
        >
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
                <HierarchyTile
                  node={node}
                  selected={selectedNodeId === node.id}
                  onSelect={onSelectNode}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
