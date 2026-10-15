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
   moment to get going, overshoots slightly, and settles.

   Integrated on a fixed timestep rather than once per frame. Per-frame, the
   spring ran at the display's refresh rate, so a 60Hz screen got exactly half
   the steps and the camera took twice as long to do anything: 650ms to reach
   the pointer instead of 325ms. The accumulator below makes the feel identical
   everywhere.

   Tuning: the previous constants overshot by 37% and took 396 steps to come to
   rest, so any mouse movement left the loop running for seconds afterwards,
   writing transforms and holding will-change on seventeen layers the whole
   time. These reach 90% in 200ms and park in 558ms, still overshooting ~6% so
   the weight is not lost. */
const STEP_MS = 1000 / 120;
/* Cap catch-up after a background tab or a stall, or the spring integrates a
   huge backlog in one frame and snaps. */
const MAX_CATCHUP_MS = 64;
const STIFFNESS = 0.012;
const DAMPING = 0.87;
const SETTLE = 0.002;

const ROTATE_Y_DEG = 2.2;
const ROTATE_X_DEG = -1.5;
const DRIFT_X_PX = 4;
const DRIFT_Y_PX = 3;
const CAMERA_Z_PX = -14;

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
  /* Fixed-timestep bookkeeping. `last` is zeroed whenever the loop parks so the
     next start does not integrate the whole idle gap in one go. */
  const accumulator = useRef(0);
  const last = useRef(0);
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

    const step = (now: number) => {
      if (last.current === 0) last.current = now;
      accumulator.current += Math.min(now - last.current, MAX_CATCHUP_MS);
      last.current = now;

      while (accumulator.current >= STEP_MS) {
        accumulator.current -= STEP_MS;
        const dx = target.current.x - current.current.x;
        const dy = target.current.y - current.current.y;
        velocity.current.x = (velocity.current.x + dx * STIFFNESS) * DAMPING;
        velocity.current.y = (velocity.current.y + dy * STIFFNESS) * DAMPING;
        current.current.x += velocity.current.x;
        current.current.y += velocity.current.y;
      }
      write();

      const atRest =
        Math.abs(target.current.x - current.current.x) < SETTLE &&
        Math.abs(target.current.y - current.current.y) < SETTLE &&
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
        last.current = 0;
        accumulator.current = 0;
        return;
      }

      frame.current = requestAnimationFrame(step);
    };

    const start = () => {
      if (frame.current === null) {
        last.current = 0;
        accumulator.current = 0;
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
