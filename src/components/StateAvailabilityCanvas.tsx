import { useEffect, useRef, useState } from "react";
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
  STATE_AVAILABILITY_META,
  type StateAvailability,
} from "@/lib/portal-state-availability";
import { US_STATE_BY_FIPS, type UsStateCode } from "@/lib/us-states";

interface StateVisual {
  group: THREE.Group;
  outlineMaterials: THREE.LineBasicMaterial[];
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
  const callbacksRef = useRef({ onHover, onSelect });
  const [webglError, setWebglError] = useState<string | null>(null);
  const licenseKey = [...licensedStates].sort().join(",");

  callbacksRef.current = { onHover, onSelect };
  selectedRef.current = selectedState;

  const refreshHighlights = () => {
    for (const [code, visual] of visualsRef.current) {
      const highlighted = code === selectedRef.current || code === hoveredRef.current;
      visual.group.position.z = highlighted ? 5 : 0;
      for (const material of visual.outlineMaterials) {
        material.color.set(highlighted ? "#ff7a3d" : "#171a20");
        material.opacity = highlighted ? 1 : 0.72;
      }
    }
    renderRef.current?.();
  };

  useEffect(() => {
    selectedRef.current = selectedState;
    refreshHighlights();
  }, [selectedState]);

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-500, 500, 320, -320, 0.1, 2000);
    camera.position.set(487.5, -305, 1000);
    camera.lookAt(487.5, -305, 0);

    const stateByCode = new Map(states.map((state) => [state.stateCode, state]));
    const licensedStateSet = new Set(
      licenseKey ? licenseKey.split(",") as UsStateCode[] : [],
    );
    const topology = statesAtlas as unknown as Topology<{ states: GeometryCollection }>;
    const collection = feature(
      topology,
      topology.objects.states,
    ) as unknown as FeatureCollection<StateGeometry>;

    const interactiveMeshes: THREE.Mesh[] = [];
    const visuals = new Map<UsStateCode, StateVisual>();

    for (const stateFeature of collection.features) {
      const fips = String(stateFeature.id ?? "").padStart(2, "0");
      const stateDefinition = US_STATE_BY_FIPS.get(fips);
      if (!stateDefinition || !stateFeature.geometry) continue;
      const availability = stateByCode.get(stateDefinition.code);
      if (!availability) continue;

      const group = new THREE.Group();
      group.userData.stateCode = stateDefinition.code;
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: availabilityUnavailable
          ? "#3d4654"
          : STATE_AVAILABILITY_META[availability.status].color,
        side: THREE.DoubleSide,
      });
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
          color: "#171a20",
          transparent: true,
          opacity: 0.72,
        });
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 20),
          outlineMaterial,
        );
        outline.position.z = 0.4;
        group.add(outline);
        outlineMaterials.push(outlineMaterial);
      }

      if (licensedStateSet.has(stateDefinition.code)) {
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(4.5, 8.5, 24),
          new THREE.MeshBasicMaterial({
            color: "#f4f0df",
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
      visuals.set(stateDefinition.code, { group, outlineMaterials });
    }

    visualsRef.current = visuals;

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;

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
      camera.updateProjectionMatrix();
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

    const handleClick = (event: PointerEvent) => {
      const code = stateAtPointer(event);
      if (code) callbacksRef.current.onSelect(code);
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("click", handleClick);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    refreshHighlights();

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("click", handleClick);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      visualsRef.current = new Map();
      renderRef.current = null;
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
      {webglError && <p className="state-map-webgl-error" role="status">{webglError}</p>}
    </div>
  );
}
