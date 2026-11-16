import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import type { AssistHierarchyNode, HierarchyNode } from "@/lib/admin-api";
import { AdminUserAvatar } from "@/components/admin/AdminUserAvatar";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const TILE_WIDTH = 148;
const PARTNER_TILE_WIDTH = 220;
const TILE_HEIGHT = 172;
const ASSIST_TILE_HEIGHT = 132;
const H_GAP = 28;
const V_GAP = 72;
const ROOT_GAP = 48;
const CANVAS_PADDING = 40;

type Point = { x: number; y: number };

type PositionedNode = {
  node: HierarchyNode | AssistHierarchyNode;
  x: number;
  y: number;
  width: number;
};

type Connection = {
  from: Point;
  to: Point;
};

function formatEffectiveDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getTileWidth(node: HierarchyNode | AssistHierarchyNode, tileWidth: number, partnerTileWidth: number): number {
  return node.isPartnerGroup ? partnerTileWidth : tileWidth;
}

function layoutHierarchyTree(
  roots: ReadonlyArray<HierarchyNode | AssistHierarchyNode>,
  tileHeight: number,
  tileWidth: number,
  partnerTileWidth: number,
  spacingScale: number,
): {
  positioned: PositionedNode[];
  width: number;
  height: number;
} {
  const padding = CANVAS_PADDING * spacingScale;
  const horizontalGap = H_GAP * spacingScale;
  const verticalGap = V_GAP * spacingScale;
  const rootGap = ROOT_GAP * spacingScale;
  const positioned: PositionedNode[] = [];
  const subtreeWidths = new Map<string, number>();
  let nextRootX = padding;
  let maxDepth = 0;

  function measure(node: HierarchyNode | AssistHierarchyNode): number {
    const childrenWidth = node.children.reduce((sum, child) => sum + measure(child), 0)
      + Math.max(0, node.children.length - 1) * horizontalGap;
    const width = Math.max(getTileWidth(node, tileWidth, partnerTileWidth), childrenWidth);
    subtreeWidths.set(node.id, width);
    return width;
  }

  function position(node: HierarchyNode | AssistHierarchyNode, left: number, depth: number) {
    maxDepth = Math.max(maxDepth, depth);
    const x = left + subtreeWidths.get(node.id)! / 2;
    const width = getTileWidth(node, tileWidth, partnerTileWidth);
    const childrenWidth = node.children.reduce((sum, child) => sum + subtreeWidths.get(child.id)!, 0)
      + Math.max(0, node.children.length - 1) * horizontalGap;
    let childLeft = x - childrenWidth / 2;
    for (const child of node.children) {
      position(child, childLeft, depth + 1);
      childLeft += subtreeWidths.get(child.id)! + horizontalGap;
    }
    positioned.push({ node, x, y: padding + depth * (tileHeight + verticalGap), width });
  }

  for (const root of roots) {
    const width = measure(root);
    position(root, nextRootX, 0);
    nextRootX += width + rootGap;
  }

  const width = Math.max(nextRootX + padding - rootGap, tileWidth + padding * 2);
  const height = padding * 2 + (maxDepth + 1) * tileHeight + maxDepth * verticalGap;

  return { positioned, width, height };
}

function collectConnections(
  roots: ReadonlyArray<HierarchyNode | AssistHierarchyNode>,
  positionedById: Map<string, PositionedNode>,
  tileHeight: number,
): Connection[] {
  const connections: Connection[] = [];

  function walk(node: HierarchyNode | AssistHierarchyNode) {
    const parent = positionedById.get(node.id);
    if (!parent) return;

    for (const child of node.children) {
      const childPos = positionedById.get(child.id);
      if (childPos) {
        connections.push({
          from: { x: parent.x, y: parent.y + tileHeight },
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
  assistView,
  renderMetrics,
  onSelect,
}: {
  node: HierarchyNode | AssistHierarchyNode;
  selected: boolean;
  assistView?: boolean;
  renderMetrics?: (node: HierarchyNode | AssistHierarchyNode) => ReactNode;
  onSelect: (nodeId: string) => void;
}) {
  const partnerClass = node.isPartnerGroup ? " admin-hierarchy-tile-partner" : "";

  if (assistView) {
    const assistNode = node as AssistHierarchyNode;
    const members = assistNode.isPartnerGroup && assistNode.members?.length
      ? assistNode.members
      : [{
          id: assistNode.id,
          name: assistNode.name,
          npn: assistNode.npn,
          referrerName: assistNode.referrerName,
          referrerNpn: assistNode.referrerNpn,
        }];

    return (
      <button
        type="button"
        className={`admin-hierarchy-tile admin-hierarchy-tile-assist${partnerClass}${selected ? " admin-hierarchy-tile-selected" : ""}`}
        aria-label={`View hierarchy details for ${assistNode.name}`}
        onClick={() => onSelect(assistNode.id)}
      >
        <div className="admin-hierarchy-tile-avatars">
          {members.map((member) => (
            <AdminUserAvatar
              key={member.id}
              name={member.name}
              size="md"
              className="admin-hierarchy-tile-avatar"
            />
          ))}
        </div>
        <h3 className="admin-hierarchy-tile-name">
          {assistNode.isPartnerGroup ? members.map((member) => member.name).join(" & ") : assistNode.name}
        </h3>
        <p className="admin-hierarchy-tile-npn">
          NPN {members.map((member) => member.npn ?? "—").join(" · ")}
        </p>
        <div className="admin-hierarchy-tile-foot">
          {assistNode.children.length > 0 && (
            <span className="admin-hierarchy-tile-meta">{assistNode.children.reduce((n, child) => n + (child.members?.length ?? 1), 0)} direct</span>
          )}
        </div>
      </button>
    );
  }

  const fullNode = node as HierarchyNode;
  const members = fullNode.isPartnerGroup && fullNode.members?.length
    ? fullNode.members
    : [{
        id: fullNode.id,
        email: fullNode.email,
        name: fullNode.name,
        role: fullNode.role,
        status: fullNode.status,
        npn: null,
        profilePhotoPath: fullNode.profilePhotoPath,
        profileUpdatedAt: fullNode.profileUpdatedAt,
      }];

  return (
    <button
      type="button"
      className={`admin-hierarchy-tile${partnerClass}${selected ? " admin-hierarchy-tile-selected" : ""}`}
      onClick={() => onSelect(fullNode.id)}
    >
      <div className="admin-hierarchy-tile-avatars">
        {members.map((member) => (
          <AdminUserAvatar
            key={member.id}
            name={member.name}
            email={member.email}
            profilePhotoPath={member.profilePhotoPath}
            profileUpdatedAt={member.profileUpdatedAt}
            size="md"
            className="admin-hierarchy-tile-avatar"
          />
        ))}
      </div>
      <h3 className="admin-hierarchy-tile-name">
        {fullNode.isPartnerGroup ? members.map((member) => member.name).join(" & ") : fullNode.name}
      </h3>
      {!fullNode.isPartnerGroup && (
        <>
          <p className="admin-hierarchy-tile-npn">Tier {fullNode.compLevel ?? "—"}{fullNode.compLevel != null ? "%" : ""}</p>
          {formatEffectiveDate(fullNode.compLevelEffectiveAt) && (
            <p className="admin-hierarchy-tile-effective">Effective {formatEffectiveDate(fullNode.compLevelEffectiveAt)}</p>
          )}
        </>
      )}
      {fullNode.isPartnerGroup && (
        <p className="admin-hierarchy-tile-npn">
          {(fullNode.members ?? []).map((member) => member.compLevel != null ? `${member.compLevel}%` : "Not set").join(" · ")}
        </p>
      )}
      {renderMetrics?.(node)}
      <div className="admin-hierarchy-tile-foot">
        {fullNode.isPartnerGroup && <span className="admin-badge assist">Partners</span>}
        {!fullNode.isPartnerGroup && fullNode.role === "admin" && <span className="admin-badge">Admin</span>}
        {fullNode.children.length > 0 && (
          <span className="admin-hierarchy-tile-meta">{fullNode.children.reduce((n, child) => n + (child.members?.length ?? 1), 0)} direct</span>
        )}
      </div>
    </button>
  );
}

interface HierarchyCanvasProps {
  tree: HierarchyNode[] | AssistHierarchyNode[];
  selectedNodeId: string | null;
  assistView?: boolean;
  initialView?: "fit" | "root";
  cardSize?: "compact" | "large";
  cardScale?: number;
  renderMetrics?: (node: HierarchyNode | AssistHierarchyNode) => ReactNode;
  onSelectNode: (nodeId: string) => void;
}

export function HierarchyCanvas({ tree, selectedNodeId, assistView = false, initialView, cardSize = "compact", cardScale = 1, renderMetrics, onSelectNode }: HierarchyCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const tileWidth = (cardSize === "large" ? 280 : TILE_WIDTH) * cardScale;
  const partnerTileWidth = (cardSize === "large" ? 340 : PARTNER_TILE_WIDTH) * cardScale;
  const tileHeight = (assistView ? ASSIST_TILE_HEIGHT : cardSize === "large" ? 320 : TILE_HEIGHT + (renderMetrics ? 72 : 0)) * cardScale;
  const layout = useMemo(() => layoutHierarchyTree(tree, tileHeight, tileWidth, partnerTileWidth, cardScale), [tree, tileHeight, tileWidth, partnerTileWidth, cardScale]);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const positionedById = useMemo(
    () => new Map(layout.positioned.map((entry) => [entry.node.id, entry])),
    [layout.positioned],
  );

  const connections = useMemo(
    () => collectConnections(tree, positionedById, tileHeight),
    [tree, positionedById, tileHeight],
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

  const centerRoot = useCallback(() => {
    const viewport = viewportRef.current;
    const root = tree[0] && positionedById.get(tree[0].id);
    if (!viewport || !root) return;
    // Start with readable text; users can choose Fit for a whole-team overview.
    setScale(1);
    setPan({ x: viewport.clientWidth / 2 - root.x, y: 16 - root.y });
  }, [positionedById, tree]);

  useEffect(() => {
    if (!initialView) return;
    const positionView = initialView === "root" ? centerRoot : fitToView;
    positionView();
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(positionView);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [initialView, centerRoot, fitToView]);

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

    // Panning must not start the browser's text-selection gesture.
    event.preventDefault();
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
            if (initialView === "root") { centerRoot(); return; }
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
        onDragStart={(event) => event.preventDefault()}
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
                  style={{ strokeWidth: 1.5 * cardScale }}
                />
              ))}
            </svg>

            {layout.positioned.map(({ node, x, y, width }) => (
              <div
                key={node.id}
                className="admin-hierarchy-node"
                style={{
                  left: x - width / 2,
                  top: y,
                  width,
                  height: tileHeight,
                }}
              >
                <div style={{
                  width: width / cardScale,
                  height: tileHeight / cardScale,
                  transform: `scale(${cardScale})`,
                  transformOrigin: "0 0",
                }}>
                  <HierarchyTile
                    node={node}
                    selected={selectedNodeId === node.id}
                    assistView={assistView}
                    renderMetrics={renderMetrics}
                    onSelect={onSelectNode}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
