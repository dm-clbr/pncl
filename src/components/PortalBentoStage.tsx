/**
 * The 3D camera for the portal bento grid.
 *
 * One pointermove listener and one requestAnimationFrame loop drive the whole
 * page. The listener only records a target; transforms are written once per
 * frame from the loop, never from inside the event.
 *
 * Tiles register their content node and the loop writes their counter-rotation
 * directly to the DOM. Camera position is deliberately NOT React state: putting
 * it there would re-render every tile on every frame and there is a 16ms budget
 * to hold.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/* Spring rather than a plain lerp, so the camera carries momentum: it takes a
   moment to get going, overshoots slightly, and settles. */
const STIFFNESS = 0.028;
const DAMPING = 0.88;
const SETTLE = 0.0004;

const ROTATE_Y_DEG = 4.2;
const ROTATE_X_DEG = -3;
const DRIFT_X_PX = 7;
const DRIFT_Y_PX = 5;
const CAMERA_Z_PX = -18;

/** Share of the inverse camera rotation that tile contents take back. */
const PARALLAX = 0.35;

interface CameraApi {
  /** Registers a tile's content node for per-frame counter-rotation. */
  registerContent: (node: HTMLElement | null) => () => void;
  enabled: boolean;
}

const CameraContext = createContext<CameraApi>({
  registerContent: () => () => undefined,
  enabled: false,
});

export function usePortalCamera(): CameraApi {
  return useContext(CameraContext);
}

function motionAllowed(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  return true;
}

export default function PortalBentoStage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const contents = useRef(new Set<HTMLElement>());

  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const primed = useRef(false);
  const enabled = useRef(false);

  // Resolved once on mount; the value is read by tiles that mount later.
  const allowed = useMemo(() => motionAllowed(), []);
  enabled.current = allowed;

  const registerContent = useCallback((node: HTMLElement | null) => {
    if (!node) return () => undefined;
    contents.current.add(node);
    return () => {
      contents.current.delete(node);
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;

    const write = () => {
      const { x, y } = current.current;

      const scene = sceneRef.current;
      if (scene) {
        scene.style.transform = [
          `translate3d(${x * DRIFT_X_PX}px, ${y * DRIFT_Y_PX}px, ${CAMERA_Z_PX}px)`,
          `rotateY(${x * ROTATE_Y_DEG}deg)`,
          `rotateX(${y * ROTATE_X_DEG}deg)`,
        ].join(" ");
      }

      const counterY = -x * ROTATE_Y_DEG * PARALLAX;
      const counterX = -y * ROTATE_X_DEG * PARALLAX;
      const contentTransform = `rotateY(${counterY}deg) rotateX(${counterX}deg)`;
      contents.current.forEach((node) => {
        node.style.transform = contentTransform;
      });
    };

    const setWillChange = (on: boolean) => {
      const scene = sceneRef.current;
      if (scene) scene.style.willChange = on ? "transform" : "";
      contents.current.forEach((node) => {
        node.style.willChange = on ? "transform" : "";
      });
    };

    const step = () => {
      const dx = target.current.x - current.current.x;
      const dy = target.current.y - current.current.y;

      velocity.current.x = (velocity.current.x + dx * STIFFNESS) * DAMPING;
      velocity.current.y = (velocity.current.y + dy * STIFFNESS) * DAMPING;
      current.current.x += velocity.current.x;
      current.current.y += velocity.current.y;
      write();

      const atRest =
        Math.abs(dx) < SETTLE &&
        Math.abs(dy) < SETTLE &&
        Math.abs(velocity.current.x) < SETTLE &&
        Math.abs(velocity.current.y) < SETTLE;

      if (atRest) {
        // Settled. Snap off the residual, drop will-change, park the loop.
        current.current.x = target.current.x;
        current.current.y = target.current.y;
        velocity.current.x = 0;
        velocity.current.y = 0;
        write();
        setWillChange(false);
        frame.current = null;
        return;
      }

      frame.current = requestAnimationFrame(step);
    };

    const start = () => {
      if (frame.current === null) {
        setWillChange(true);
        frame.current = requestAnimationFrame(step);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;

      target.current.x = Math.min(
        1,
        Math.max(-1, (event.clientX / window.innerWidth) * 2 - 1),
      );
      target.current.y = Math.min(
        1,
        Math.max(-1, (event.clientY / window.innerHeight) * 2 - 1),
      );

      start();
    };

    const onPointerLeave = () => {
      target.current.x = 0;
      target.current.y = 0;
      start();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setWillChange(false);
    };
  }, [allowed]);

  const api = useMemo<CameraApi>(
    () => ({ registerContent, enabled: allowed }),
    [registerContent, allowed],
  );

  return (
    <CameraContext.Provider value={api}>
      <div
        className={`portal-stage ${className}`}
        ref={stageRef}
        data-tilt={allowed ? "on" : "off"}
      >
        <div className="portal-scene" ref={sceneRef}>
          {children}
        </div>
      </div>
    </CameraContext.Provider>
  );
}
