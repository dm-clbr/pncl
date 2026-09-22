import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Lock,
  Play,
  Send,
  Trophy,
  X,
} from "lucide-react";
import {
  getCurrentStageIndex,
  groupTodosByPhase,
  isRequiredFormTodo,
  isStageLocked,
  isTodoGateLocked,
  PORTAL_TODO_PHASES,
  SUBMIT_NEW_PRODUCER_TODO_ID,
  type PortalTodo,
} from "@/lib/portal-todos";
import { isSureLcAccountTodo } from "@/lib/surelc-accounts";
import PortalNewProducerModal from "@/components/PortalNewProducerModal";

export function PortalUrgentIcon({ size = 22 }: { size?: number }) {
  return (
    <span className="portal-urgent-icon" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" className="portal-urgent-icon-circle" />
        <path
          className="portal-urgent-icon-mark"
          d="M12 8v5"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.5" r="1.25" className="portal-urgent-icon-dot" />
      </svg>
    </span>
  );
}

/**
 * Bunny.net video links play in a pop-up modal instead of punching out.
 * Accepts both the share URL (player.mediadelivery.net/play/{library}/{video})
 * and the embed URL (iframe.mediadelivery.net/embed/{library}/{video}).
 */
function getVideoEmbedUrl(href: string): string | null {
  const match = href.match(
    /^https:\/\/(?:player\.mediadelivery\.net\/play|iframe\.mediadelivery\.net\/embed)\/(\d+)\/([\w-]+)/,
  );
  if (!match) return null;
  return `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}`;
}

function PortalVideoModal({
  title,
  embedUrl,
  sourceUrl,
  onClose,
}: {
  title: string;
  embedUrl: string;
  sourceUrl: string;
  onClose: () => void;
}) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const portalTarget = document.querySelector<HTMLElement>(".home2-page") ?? document.body;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    setLoadState("loading");
    const timeout = window.setTimeout(() => {
      setLoadState((current) => current === "loading" ? "error" : current);
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [embedUrl]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="admin-modal-overlay portal-video-overlay"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="portal-video-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="portal-video-modal-head">
          <strong>{title}</strong>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="Close video"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="portal-video-frame">
          {loadState !== "ready" && (
            <div
              className={`portal-video-status${loadState === "error" ? " is-error" : ""}`}
              role={loadState === "error" ? "alert" : "status"}
            >
              {loadState === "error"
                ? "The embedded player could not load. Open the video in a new tab below."
                : "Loading video…"}
            </div>
          )}
          <iframe
            src={embedUrl}
            title={title}
            loading="eager"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => setLoadState("ready")}
            onError={() => setLoadState("error")}
          />
        </div>
        <div className="portal-video-fallback">
          <span>If the player stays blank, use the direct video page.</span>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            Open video in a new tab
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

type DescriptionBlock =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

/** Split a description into paragraphs and bulleted lists ("•"-prefixed lines). */
function parseDescriptionBlocks(description: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const rawLine of description.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("•")) {
      const item = line.replace(/^•\s*/, "");
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") {
        last.items.push(item);
      } else {
        blocks.push({ type: "list", items: [item] });
      }
    } else {
      blocks.push({ type: "text", text: line });
    }
  }
  return blocks;
}

function TodoDescription({ description }: { description: string }) {
  const blocks = parseDescriptionBlocks(description);
  return (
    <>
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="pcl-step-list">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="pcl-step-desc">
            {block.text}
          </p>
        ),
      )}
    </>
  );
}

function PortalTodoItem({
  todo,
  agentEmail,
  completing,
  locked,
  gateLocked,
  onComplete,
}: {
  todo: PortalTodo;
  agentEmail: string;
  completing: boolean;
  locked?: boolean;
  /** Gated step: visible but disabled until every earlier step in the stage is done. */
  gateLocked?: boolean;
  onComplete: (todoId: string) => void;
}) {
  const isRequiredForm = isRequiredFormTodo(todo.id);
  const isAdminManaged = todo.completionType === "admin";
  const isAgentCheckable = todo.completionType === "agent";
  const videoEmbedUrl = getVideoEmbedUrl(todo.href);
  const [videoOpen, setVideoOpen] = useState(false);
  const needsNewProducerConfirmation = todo.id === SUBMIT_NEW_PRODUCER_TODO_ID;
  const [confirmingNewProducer, setConfirmingNewProducer] = useState(false);
  const keepCompletedLink = isSureLcAccountTodo(todo.id) && Boolean(todo.href);

  const disabled = locked || gateLocked;
  const urgent = isRequiredForm && !disabled && !todo.completed;
  // The whole title row is the mark-complete control. The new-producer step
  // checks itself off once its submission goes through, so its row is static.
  const toggles = isAgentCheckable && !needsNewProducerConfirmation;

  const actionContent = (
    <>
      {todo.actionLabel}
      <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
    </>
  );

  const row = (
    <>
      <span className="pcl-step-mark" aria-hidden="true">
        {completing ? (
          <span className="onboarding-spinner pcl-step-spinner" />
        ) : todo.completed ? (
          <Check size={13} strokeWidth={3} />
        ) : disabled ? (
          <Lock size={11} strokeWidth={2} />
        ) : urgent ? (
          <PortalUrgentIcon size={18} />
        ) : null}
      </span>
      <span className="pcl-step-title">{todo.title}</span>
    </>
  );

  return (
    <li
      className={`pcl-step${todo.completed ? " is-done" : ""}${disabled ? " is-locked" : ""}${urgent ? " is-urgent" : ""}`}
    >
      {toggles ? (
        <button
          type="button"
          className="pcl-step-row pcl-step-toggle"
          onClick={() => onComplete(todo.id)}
          disabled={completing || disabled || todo.completed}
          aria-pressed={todo.completed}
        >
          {row}
          <span className="portal-sr">, mark complete</span>
        </button>
      ) : (
        <div className="pcl-step-row">
          {row}
          {todo.completed && <span className="portal-sr">, completed</span>}
        </div>
      )}

      {todo.completed ? (
        keepCompletedLink && (
          <div className="pcl-step-body">
            <a
              href={todo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="pcl-step-link"
            >
              {todo.actionLabel || "Open SureLC"}
              <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
            </a>
          </div>
        )
      ) : (
        <div className="pcl-step-body">
          {urgent && <span className="pcl-step-tag is-urgent">Required: top priority</span>}
          {isAdminManaged && <span className="pcl-step-tag">PNCL admin completes this</span>}
          {locked ? (
            <p className="pcl-step-desc">Complete the previous stage to unlock this step.</p>
          ) : (
            <>
              <TodoDescription description={todo.description} />
              {gateLocked && (
                <p className="pcl-step-desc">Complete the steps above to unlock this step.</p>
              )}
            </>
          )}
          {!disabled && agentEmail && todo.showEmailHint !== false && (
            <p className="pcl-step-email">
              Use <span>{agentEmail}</span> when you sign up.
            </p>
          )}
          {!disabled && needsNewProducerConfirmation && (
            <button
              type="button"
              className="pcl-step-link"
              onClick={() => setConfirmingNewProducer(true)}
              disabled={completing}
            >
              <Send size={15} strokeWidth={2.5} aria-hidden="true" />
              {todo.actionLabel || "Submit for New Producer"}
            </button>
          )}
          {!disabled && todo.href && (
            videoEmbedUrl ? (
              <button
                type="button"
                className="pcl-step-link"
                onClick={() => setVideoOpen(true)}
              >
                <Play size={16} strokeWidth={2.5} aria-hidden="true" />
                {todo.actionLabel || "Watch video"}
              </button>
            ) : todo.external ? (
              <a
                href={todo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="pcl-step-link"
              >
                {actionContent}
              </a>
            ) : (
              <Link to={todo.href} className="pcl-step-link">
                {actionContent}
              </Link>
            )
          )}
          {videoOpen && videoEmbedUrl && (
            <PortalVideoModal
              title={todo.title}
              embedUrl={videoEmbedUrl}
              sourceUrl={todo.href}
              onClose={() => setVideoOpen(false)}
            />
          )}
          {confirmingNewProducer && (
            <PortalNewProducerModal
              onClose={() => setConfirmingNewProducer(false)}
              onConfirmed={() => {
                setConfirmingNewProducer(false);
                onComplete(todo.id);
              }}
            />
          )}
        </div>
      )}
    </li>
  );
}

interface PortalOnboardingChecklistProps {
  /** Todos with `completed` already resolved. */
  todos: PortalTodo[];
  agentEmail: string;
  completingTodoId: string | null;
  onComplete: (todoId: string) => void;
  /**
   * Admin preview: renders every stage/step unlocked so admins can review
   * locked steps. Visual only, completion guards still apply.
   */
  previewUnlocked?: boolean;
}

export default function PortalOnboardingChecklist({
  todos,
  agentEmail,
  completingTodoId,
  onComplete,
  previewUnlocked = false,
}: PortalOnboardingChecklistProps) {
  const todosByPhase = useMemo(() => groupTodosByPhase(todos), [todos]);
  const total = todos.length;
  const completedCount = useMemo(
    () => todos.filter((todo) => todo.completed).length,
    [todos],
  );
  const allDone = total > 0 && completedCount === total;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const currentStageIndex = useMemo(() => getCurrentStageIndex(todos), [todos]);

  const currentPhaseId = useMemo(() => {
    if (currentStageIndex === null) return null;
    return PORTAL_TODO_PHASES[currentStageIndex]?.id ?? null;
  }, [currentStageIndex]);

  // Kept as state rather than native <details>: its toggle event fires a task
  // after the click, so a re-render in between would re-apply the stale open
  // prop, and locked stages must refuse to open at all.
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const isPhaseOpen = (phaseId: string, stageIndex: number) => {
    if (!previewUnlocked && isStageLocked(todos, stageIndex)) return false;
    return openPhases[phaseId] ?? phaseId === currentPhaseId;
  };
  const togglePhase = (phaseId: string, stageIndex: number) => {
    if (!previewUnlocked && isStageLocked(todos, stageIndex)) return;
    setOpenPhases((prev) => ({ ...prev, [phaseId]: !isPhaseOpen(phaseId, stageIndex) }));
  };

  return (
    <div className="pcl">
      <div className="pcl-head">
        <span className="pcl-eyebrow">Your path to sales ready</span>
        <h2 className="pcl-title">Onboarding checklist</h2>
        <div className="pcl-progress">
          <span>{completedCount} of {total} complete</span>
          <span>{percent}%</span>
        </div>
        <div
          className="pcl-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding progress"
        >
          <span style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
      </div>

      {previewUnlocked && (
        <p className="pcl-note is-preview">
          Admin preview: every stage is unlocked for you. Agents still see stages locked
          until they complete the previous one.
        </p>
      )}

      {allDone ? (
        <div className="pcl-done">
          <Trophy size={20} strokeWidth={2} aria-hidden="true" />
          <div>
            <strong>You&apos;re sales ready!</strong>
            <p>Every onboarding step is complete. Go write some business.</p>
          </div>
        </div>
      ) : (
        <p className="pcl-note">
          Work through each stage in order. The next stage unlocks once every step in the
          current stage is complete.
        </p>
      )}

      {PORTAL_TODO_PHASES.map((phase, phaseIndex) => {
        const items = todosByPhase.get(phase.id) ?? [];
        if (items.length === 0) return null;
        const doneCount = items.filter((todo) => todo.completed).length;
        const phaseComplete = doneCount === items.length;
        const locked = !previewUnlocked && isStageLocked(todos, phaseIndex);
        const open = isPhaseOpen(phase.id, phaseIndex);
        const isCurrent = phaseIndex === currentStageIndex;

        return (
          <div
            key={phase.id}
            className={`pcl-stage${open ? " is-open" : ""}${phaseComplete ? " is-complete" : ""}${locked ? " is-locked" : ""}${isCurrent ? " is-current" : ""}`}
          >
            <button
              type="button"
              className="pcl-stage-head"
              onClick={() => togglePhase(phase.id, phaseIndex)}
              aria-expanded={open}
              disabled={locked}
              aria-disabled={locked}
            >
              <span className="pcl-stage-title">
                <span className="pcl-stage-num" aria-hidden="true">
                  {locked ? (
                    <Lock size={11} strokeWidth={2} />
                  ) : phaseComplete ? (
                    <Check size={12} strokeWidth={3} />
                  ) : (
                    String(phaseIndex + 1).padStart(2, "0")
                  )}
                </span>
                {phase.label}
              </span>
              <span className="pcl-stage-meta">
                {locked ? "Locked" : `${doneCount}/${items.length}`}
                {!locked && (
                  <ChevronDown size={16} className="pcl-stage-chevron" aria-hidden="true" />
                )}
              </span>
            </button>
            {open && (
              <ul className="pcl-stage-items">
                {items.map((todo) => (
                  <PortalTodoItem
                    key={todo.id}
                    todo={todo}
                    agentEmail={agentEmail}
                    completing={completingTodoId === todo.id}
                    locked={locked}
                    gateLocked={!previewUnlocked && isTodoGateLocked(todos, todo.id)}
                    onComplete={onComplete}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
