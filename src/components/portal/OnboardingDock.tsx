import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { X } from "lucide-react";
import Stepper from "@/components/portal/Stepper";
import { getCurrentStageIndex, PORTAL_TODO_PHASES, type PortalTodo } from "@/lib/portal-todos";
import "@/styles/portal-onboarding.css";

const STAGES = PORTAL_TODO_PHASES.map((phase) => phase.label);
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

type OnboardingDockProps = {
  /** Resolved todos, each with its server `completed` flag. */
  todos: PortalTodo[];
  /** The checklist. Rendered only while the panel is open. */
  children: ReactNode;
  /** A capsule floating over the page (the dashboard) or a card in the page's
      own flow (the profile). The panel is the same either way. */
  floating?: boolean;
};

type Box = Pick<DOMRect, "top" | "right" | "bottom" | "left"> & { radius: number };

/** clip-path that crops the panel down to the capsule's box and corners. */
function insetTo(capsule: Box, panel: DOMRect) {
  return `inset(${capsule.top - panel.top}px ${panel.right - capsule.right}px ${
    panel.bottom - capsule.bottom
  }px ${capsule.left - panel.left}px round ${capsule.radius}px)`;
}

function panelShape(panel: HTMLElement) {
  const s = getComputedStyle(panel);
  return `inset(0px round ${s.borderTopLeftRadius} ${s.borderTopRightRadius} ${s.borderBottomRightRadius} ${s.borderBottomLeftRadius})`;
}

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Progress ring. The fill is a 100-unit path, so the dash offset is the
    remaining percentage. */
function Ring({ percent, label }: { percent: number; label: ReactNode }) {
  return (
    <span className="pdock-ring" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <circle className="pdock-ring-track" cx="20" cy="20" r="17" />
        <circle
          className="pdock-ring-fill"
          cx="20"
          cy="20"
          r="17"
          pathLength={100}
          style={{ strokeDashoffset: 100 - percent }}
        />
      </svg>
      <span className="pdock-ring-label">{label}</span>
    </span>
  );
}

/** Onboarding, one tap away: a capsule with the ring, the stage and the next
    step, which grows into a full-height panel with the stage Stepper and the
    checklist. The panel is a native <dialog> opened with showModal() (the top
    layer, focus moved to its title, Esc and the backdrop close it, focus
    returns to the capsule), and the growth is a clip-path morph from the
    capsule's box, so it reads as the capsule opening rather than a sheet
    arriving. Styles under .pdock in src/styles/portal-onboarding.css.

    Floating, the capsule sits above the tab bar on a phone and at the bottom
    right from 621px, and folds to the ring alone while the page scrolls down.
    Mount it outside PortalBentoStage and outside <main>, beside BottomNav. */
export default function OnboardingDock({ todos, children, floating = false }: OnboardingDockProps) {
  const capsuleRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const titleId = useId();
  const summaryId = useId();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  const total = todos.length;
  const done = todos.filter((todo) => todo.completed).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const stageIndex = getCurrentStageIndex(todos);
  const allDone = total > 0 && stageIndex === null;
  const stage = stageIndex === null ? null : PORTAL_TODO_PHASES[stageIndex];
  const next = stage && todos.find((todo) => todo.phase === stage.id && !todo.completed);
  // The Stepper is 1-based; past the last stage every step reads as done.
  const currentStep = stageIndex === null ? STAGES.length + 1 : stageIndex + 1;

  // Fold to the ring while the page scrolls down, unfold on the way back up.
  // ponytail: one direction check per frame, no velocity; an 8px dead zone
  // keeps a resting thumb from flickering it.
  useEffect(() => {
    if (!floating) return;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) < 8) return;
        setCompact(y > last && y > 120);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [floating]);

  /** The capsule's visible box and corner: folded, only the ring at its
      right end. A 999px pill radius clamps to half the height, as it renders. */
  const capsuleBox = (): Box | null => {
    const capsule = capsuleRef.current;
    if (!capsule) return null;
    const { top, right, bottom, left, height } = capsule.getBoundingClientRect();
    const radius = Math.min(parseFloat(getComputedStyle(capsule).borderTopLeftRadius) || 0, height / 2);
    return { top, right, bottom, left: compact ? right - height : left, radius };
  };

  const openPanel = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    const from = capsuleBox();
    setOpen(true);
    setCompact(false);
    dialog.showModal();
    titleRef.current?.focus({ preventScroll: true });
    if (reducedMotion() || typeof dialog.animate !== "function" || !from) return;
    const panel = dialog.getBoundingClientRect();
    dialog.animate([{ clipPath: insetTo(from, panel) }, { clipPath: panelShape(dialog) }], {
      duration: 560,
      easing: EASE_OUT,
    });
    innerRef.current?.animate(
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 360, delay: 140, easing: EASE_OUT, fill: "backwards" },
    );
  };

  /** Shrink back into the capsule, then close for real. The dialog's close
      event is the one path back to the closed state. */
  const closePanel = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    const to = capsuleBox();
    if (reducedMotion() || typeof dialog.animate !== "function" || !to) {
      dialog.close();
      return;
    }
    const fade = innerRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 140,
      easing: EASE_OUT,
      fill: "forwards",
    });
    const panel = dialog.getBoundingClientRect();
    const shrink = dialog.animate(
      [{ clipPath: panelShape(dialog) }, { clipPath: insetTo(to, panel) }],
      { duration: 420, easing: EASE_IN_OUT, fill: "forwards" },
    );
    const backdrop = fadeBackdrop(dialog, 420);
    // The forwards fills hold the closed frame until the dialog is gone, then
    // drop, or the next open would start from an invisible panel.
    shrink.onfinish = () => {
      dialog.close();
      [shrink, fade, backdrop].forEach((animation) => animation?.cancel());
    };
  };

  // Esc arrives as a cancel event; take it over so it runs the same morph.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    closePanel();
  };

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    if (x < left || x > right || y < top || y > bottom) closePanel();
  };

  // Swipe down on the grabber (phone only; it is hidden from 621px) dismisses
  // the panel downward. Esc, the backdrop and the Close button remain the
  // non-dragging paths (WCAG 2.5.7).
  const dragFrom = useRef<number | null>(null);
  const dragBy = useRef(0);
  const onGrabDown = (event: PointerEvent<HTMLDivElement>) => {
    dragFrom.current = event.clientY;
    dragBy.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onGrabMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragFrom.current === null || reducedMotion()) return;
    dragBy.current = Math.max(0, event.clientY - dragFrom.current);
    dialogRef.current?.style.setProperty("transform", `translateY(${dragBy.current}px)`);
  };
  const onGrabUp = () => {
    const dialog = dialogRef.current;
    if (dragFrom.current === null || !dialog) return;
    dragFrom.current = null;
    const dy = dragBy.current;
    // ponytail: a fixed 80px threshold, no fling velocity.
    if (dy <= 80 || typeof dialog.animate !== "function") {
      dialog.style.removeProperty("transform");
      if (dy > 80) dialog.close();
      return;
    }
    const drop = dialog.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(100%)" }],
      { duration: 260, easing: EASE_OUT, fill: "forwards" },
    );
    const backdrop = fadeBackdrop(dialog, 260);
    drop.onfinish = () => {
      dialog.close();
      dialog.style.removeProperty("transform");
      [drop, backdrop].forEach((animation) => animation?.cancel());
    };
  };

  if (total === 0) return null;

  const eyebrow = allDone ? "Complete" : stage?.label;
  const line = allDone ? "You're sales ready" : next ? `Next: ${next.title}` : "Keep going";

  return (
    <div className={`pdock${floating ? " is-floating" : ""}`}>
      <button
        ref={capsuleRef}
        type="button"
        className="pdock-capsule"
        data-compact={compact || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openPanel}
      >
        <span className="pdock-copy">
          <span className="pdock-eyebrow">
            {eyebrow}
            <span className="pdock-count">
              {done} of {total}
              <span className="portal-sr"> steps complete</span>
            </span>
          </span>
          <span className="pdock-line">{line}</span>
          <span className="portal-sr">, open the checklist</span>
        </span>
        <Ring percent={percent} label={`${percent}%`} />
      </button>

      <dialog
        ref={dialogRef}
        id={panelId}
        className="pdock-panel"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        onClose={() => setOpen(false)}
        onCancel={onCancel}
        onClick={onBackdropClick}
      >
        <div className="pdock-panel-inner" ref={innerRef}>
          <div
            className="pdock-grabber"
            aria-hidden="true"
            onPointerDown={onGrabDown}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabUp}
            onPointerCancel={onGrabUp}
          >
            <span />
          </div>

          <div className="pdock-panel-head">
            <Ring percent={percent} label={`${percent}%`} />
            <div className="pdock-panel-titles">
              <h2 ref={titleRef} id={titleId} className="pdock-panel-title" tabIndex={-1}>
                Onboarding
              </h2>
              <p id={summaryId} className="pdock-panel-summary">
                {done} of {total} steps complete
                {stage ? ` · ${stage.label}` : ""}
              </p>
            </div>
            <button type="button" className="pdock-close" onClick={closePanel} aria-label="Close">
              <X aria-hidden="true" />
            </button>
          </div>

          <Stepper steps={STAGES} current={currentStep} label="Onboarding stages" />

          <div className="pdock-panel-body">{open && children}</div>
        </div>
      </dialog>
    </div>
  );
}

function fadeBackdrop(dialog: HTMLDialogElement, duration: number): Animation | undefined {
  try {
    return dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration,
      easing: EASE_OUT,
      fill: "forwards",
      pseudoElement: "::backdrop",
    });
  } catch {
    // ponytail: a browser without pseudo-element animation drops the backdrop
    // with the dialog instead of fading it; nothing else depends on it.
    return undefined;
  }
}
