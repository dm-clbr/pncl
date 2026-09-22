import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { feature } from "topojson-client";
import statesAtlas from "us-atlas/states-albers-10m.json";
import type { GeometryCollection, Topology } from "topojson-specification";
import type {
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import {
  type StateAvailability,
  type StateAvailabilityStatus,
} from "@/lib/portal-state-availability";
import { US_STATE_BY_FIPS, type UsStateCode } from "@/lib/us-states";

interface StateVisual {
  group: THREE.Group;
  outlineMaterials: THREE.LineBasicMaterial[];
  restOutline: { color: string; opacity: number };
}

interface StateAvailabilityCanvasProps {
  states: StateAvailability[];
  licensedStates: Set<UsStateCode>;
  selectedState: UsStateCode | null;
  availabilityUnavailable?: boolean;
  onHover: (stateCode: UsStateCode | null) => void;
  onSelect: (stateCode: UsStateCode) => void;
}

type StateGeometry = Polygon | MultiPolygon;

/** Map fills, not the swatches in STATE_AVAILABILITY_META. Those three sit at
    1.48:1 (Active to Pending) and 2.31:1 (Active to Inactive), so a viewer with
    deuteranopia or protanopia loses the difference. These three clear 3:1
    against each other: Active to Inactive 3.32:1, Pending to Active 3.48:1,
    Pending to Inactive 11.55:1. Colour still is not the only channel: Pending
    also carries a hatch and a licensed state carries a ring. */
export const STATE_MAP_FILL: Record<StateAvailabilityStatus, string> = {
  Active: "#27865a",
  Pending: "#fbdf9d",
  Inactive: "#212730",
};

const UNAVAILABLE_FILL = "#3d4654";
const HATCH_INK = "#7a5c14";
const RING_LIGHT = "#f4f0df";
const RING_HALO = "#101318";
const HIGHLIGHT_OUTLINE = "#ff7a3d";
/** A dark fill needs a light edge or the state has no silhouette against the
    panel and two neighbouring Inactive states read as one shape. A bright fill
    keeps the etched dark edge. No single edge colour covers both: the fills are
    more than 3:1 apart by design, so any one line colour lands inside 3:1 of
    one of them. */
const DARK_OUTLINE = { color: "#171a20", opacity: 0.85 };
const LIGHT_OUTLINE = { color: RING_LIGHT, opacity: 0.55 };

/** The albers atlas centre the camera was framed on. */
const MAP_CENTER_X = 487.5;
const MAP_CENTER_Y = -305;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.4;

function createShape(rings: Position[][]): THREE.Shape | null {
  const [outer, ...holes] = rings;
  if (!outer || outer.length < 3) return null;

  const shape = new THREE.Shape();
  outer.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, -y);
    else shape.lineTo(x, -y);
  });

  for (const ring of holes) {
    if (ring.length < 3) continue;
    const hole = new THREE.Path();
    ring.forEach(([x, y], index) => {
      if (index === 0) hole.moveTo(x, -y);
      else hole.lineTo(x, -y);
    });
    shape.holes.push(hole);
  }

  return shape;
}

function polygonSets(geometry: StateGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Diagonal hatch for Pending, so the status survives a colour-blind read and a
    greyscale print. ExtrudeGeometry's default UV generator hands the face the
    raw atlas coordinates, so the repeat is set in map units and every state
    gets the same stripe pitch. Returns null where there is no 2D context. */
function createHatchTexture(): THREE.CanvasTexture | null {
  const tile = document.createElement("canvas");
  tile.width = 16;
  tile.height = 16;
  const context = tile.getContext("2d");
  if (!context) return null;

  context.fillStyle = STATE_MAP_FILL.Pending;
  context.fillRect(0, 0, 16, 16);
  context.strokeStyle = HATCH_INK;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(-4, 12);
  context.lineTo(12, -4);
  context.moveTo(4, 20);
  context.lineTo(20, 4);
  context.stroke();

  const texture = new THREE.CanvasTexture(tile);
  // flipY leaves UNPACK_FLIP_Y_WEBGL set for the renderer's next texImage3D,
  // which logs an INVALID_OPERATION warning. The tile is a symmetric hatch, so
  // the only difference is which way the stripes lean.
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 18, 1 / 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function StateAvailabilityCanvas({
  states,
  licensedStates,
  selectedState,
  availabilityUnavailable = false,
  onHover,
  onSelect,
}: StateAvailabilityCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualsRef = useRef<Map<UsStateCode, StateVisual>>(new Map());
  const hoveredRef = useRef<UsStateCode | null>(null);
  const selectedRef = useRef<UsStateCode | null>(selectedState);
  const renderRef = useRef<(() => void) | null>(null);
  const applyViewRef = useRef<(() => void) | null>(null);
  const callbacksRef = useRef({ onHover, onSelect });
  const [webglError, setWebglError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const zoomRef = useRef(zoom);
  const licenseKey = [...licensedStates].sort().join(",");

  callbacksRef.current = { onHover, onSelect };
  selectedRef.current = selectedState;
  zoomRef.current = zoom;

  const refreshHighlights = () => {
    for (const [code, visual] of visualsRef.current) {
      const highlighted = code === selectedRef.current || code === hoveredRef.current;
      visual.group.position.z = highlighted ? 5 : 0;
      for (const material of visual.outlineMaterials) {
        material.color.set(highlighted ? HIGHLIGHT_OUTLINE : visual.restOutline.color);
        material.opacity = highlighted ? 1 : visual.restOutline.opacity;
      }
    }
    renderRef.current?.();
  };

  useEffect(() => {
    selectedRef.current = selectedState;
    applyViewRef.current?.();
    refreshHighlights();
  }, [selectedState]);

  useEffect(() => {
    applyViewRef.current?.();
    renderRef.current?.();
  }, [zoom]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || states.length === 0) return;

    setWebglError(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      setWebglError("Interactive map unavailable. Use the complete state list below.");
      return;
    }

    const finePointer = window.matchMedia("(pointer: fine)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    // A phone paints this map at a third of the fragments for no visible loss.
    renderer.setPixelRatio(coarsePointer.matches ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-500, 500, 320, -320, 0.1, 2000);
    camera.position.set(MAP_CENTER_X, MAP_CENTER_Y, 1000);
    camera.lookAt(MAP_CENTER_X, MAP_CENTER_Y, 0);

    const stateByCode = new Map(states.map((state) => [state.stateCode, state]));
    const licensedStateSet = new Set(
      licenseKey ? licenseKey.split(",") as UsStateCode[] : [],
    );
    const topology = statesAtlas as unknown as Topology<{ states: GeometryCollection }>;
    const collection = feature(
      topology,
      topology.objects.states,
    ) as unknown as FeatureCollection<StateGeometry>;

    const hatchTexture = availabilityUnavailable ? null : createHatchTexture();
    const interactiveMeshes: THREE.Mesh[] = [];
    const visuals = new Map<UsStateCode, StateVisual>();
    const centers = new Map<UsStateCode, { x: number; y: number }>();

    for (const stateFeature of collection.features) {
      const fips = String(stateFeature.id ?? "").padStart(2, "0");
      const stateDefinition = US_STATE_BY_FIPS.get(fips);
      if (!stateDefinition || !stateFeature.geometry) continue;
      const availability = stateByCode.get(stateDefinition.code);
      if (!availability) continue;

      const group = new THREE.Group();
      group.userData.stateCode = stateDefinition.code;
      const hatched = !availabilityUnavailable
        && availability.status === "Pending"
        && hatchTexture !== null;
      const fillMaterial = new THREE.MeshBasicMaterial({
        // The hatch tile already carries the Pending fill, so its material
        // multiplies by white rather than tinting the stripes.
        color: hatched ? "#ffffff" : availabilityUnavailable
          ? UNAVAILABLE_FILL
          : STATE_MAP_FILL[availability.status],
        map: hatched ? hatchTexture : null,
        side: THREE.DoubleSide,
      });
      const darkFill = availabilityUnavailable || availability.status === "Inactive";
      const restOutline = darkFill ? LIGHT_OUTLINE : DARK_OUTLINE;
      const outlineMaterials: THREE.LineBasicMaterial[] = [];

      for (const rings of polygonSets(stateFeature.geometry)) {
        const shape = createShape(rings);
        if (!shape) continue;
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 2.2,
          bevelEnabled: false,
          curveSegments: 1,
        });
        const mesh = new THREE.Mesh(geometry, fillMaterial);
        mesh.userData.stateCode = stateDefinition.code;
        group.add(mesh);
        interactiveMeshes.push(mesh);

        const outlineMaterial = new THREE.LineBasicMaterial({
          color: restOutline.color,
          transparent: true,
          opacity: restOutline.opacity,
        });
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 20),
          outlineMaterial,
        );
        outline.position.z = 0.4;
        group.add(outline);
        outlineMaterials.push(outlineMaterial);
      }

      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      centers.set(stateDefinition.code, { x: center.x, y: center.y });

      if (licensedStateSet.has(stateDefinition.code)) {
        // Two bands, not one: the light ring alone reads at 1.14:1 on the pale
        // Pending fill, and a single mid tone would vanish on Active.
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(8.5, 10.5, 24),
          new THREE.MeshBasicMaterial({
            color: RING_HALO,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        halo.position.set(center.x, center.y, 7.9);
        halo.renderOrder = 4;
        halo.userData.stateCode = stateDefinition.code;
        group.add(halo);

        const marker = new THREE.Mesh(
          new THREE.RingGeometry(4.5, 8.5, 24),
          new THREE.MeshBasicMaterial({
            color: RING_LIGHT,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        marker.position.set(center.x, center.y, 8);
        marker.renderOrder = 5;
        marker.userData.stateCode = stateDefinition.code;
        group.add(marker);
      }

      scene.add(group);
      visuals.set(stateDefinition.code, { group, outlineMaterials, restOutline });
    }

    visualsRef.current = visuals;

    // There is no animation loop: every frame is asked for. Off-screen and
    // backgrounded asks are dropped and replayed once, so a map scrolled out of
    // view or a backgrounded tab costs nothing. The first frame always paints,
    // so the map is ready before it scrolls in.
    let onScreen = true;
    let framePending = false;
    const render = () => {
      if (!onScreen || document.hidden) {
        framePending = true;
        return;
      }
      framePending = false;
      renderer.render(scene, camera);
    };
    const flush = () => {
      if (framePending) render();
    };
    renderRef.current = render;

    // Zoom alone would push the small north-eastern states out of frame, so the
    // zoomed camera follows the selection and stops at the map's edge. That is
    // the whole pan story: there is no drag, the list is how you reach a state.
    const clamp = (value: number, low: number, high: number) =>
      Math.min(Math.max(value, low), high);
    const applyView = () => {
      camera.zoom = zoomRef.current;
      const center = selectedRef.current ? centers.get(selectedRef.current) : undefined;
      const marginX = (camera.right - camera.left) / 2 * (1 - 1 / camera.zoom);
      const marginY = (camera.top - camera.bottom) / 2 * (1 - 1 / camera.zoom);
      camera.position.x = clamp(
        center?.x ?? MAP_CENTER_X, MAP_CENTER_X - marginX, MAP_CENTER_X + marginX,
      );
      camera.position.y = clamp(
        center?.y ?? MAP_CENTER_Y, MAP_CENTER_Y - marginY, MAP_CENTER_Y + marginY,
      );
      camera.updateProjectionMatrix();
    };
    applyViewRef.current = applyView;

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      renderer.setSize(width, height, false);

      const aspect = width / height;
      const mapWidth = 1060;
      const mapHeight = 680;
      let viewWidth = mapWidth;
      let viewHeight = viewWidth / aspect;
      if (viewHeight < mapHeight) {
        viewHeight = mapHeight;
        viewWidth = viewHeight * aspect;
      }
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      applyView();
      render();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const stateAtPointer = (event: PointerEvent): UsStateCode | null => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
      return (hit?.object.userData.stateCode as UsStateCode | undefined) ?? null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Hover is a fine-pointer affordance. On a touch screen it would fire on
      // the tap that already selects and leave the highlight behind.
      if (!finePointer.matches) return;
      const code = stateAtPointer(event);
      if (code === hoveredRef.current) return;
      hoveredRef.current = code;
      canvas.style.cursor = code ? "pointer" : "default";
      callbacksRef.current.onHover(code);
      refreshHighlights();
    };

    const handlePointerLeave = () => {
      hoveredRef.current = null;
      canvas.style.cursor = "default";
      callbacksRef.current.onHover(null);
      refreshHighlights();
    };

    // pointerdown, not click: a tap selects on every pointer type, and touch
    // gets the state without a hover step it can never reach.
    const handlePointerDown = (event: PointerEvent) => {
      const code = stateAtPointer(event);
      if (code) callbacksRef.current.onSelect(code);
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("visibilitychange", flush);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      flush();
    });
    intersectionObserver.observe(host);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    refreshHighlights();

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("visibilitychange", flush);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      hatchTexture?.dispose();
      renderer.dispose();
      visualsRef.current = new Map();
      renderRef.current = null;
      applyViewRef.current = null;
    };
  }, [states, licenseKey, availabilityUnavailable]);

  return (
    <div className="state-map-canvas-shell" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="state-map-canvas"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* WCAG 2.5.1: the map must be reachable without a pinch. The camera is
          orthographic, so zoom is one number and the view stays centred.
          ponytail: no pan, the state list is the way to reach a small state. */}
      <div className="state-map-zoom" role="group" aria-label="Map zoom">
        <button
          type="button"
          onClick={() => setZoom((current) => Math.min(ZOOM_MAX, current * ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.max(ZOOM_MIN, current / ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(ZOOM_MIN)}
          disabled={zoom === ZOOM_MIN}
          aria-label="Reset zoom"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
      {webglError && <p className="state-map-webgl-error" role="status">{webglError}</p>}
    </div>
  );
}
