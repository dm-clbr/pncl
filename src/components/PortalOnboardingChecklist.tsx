import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Circle,
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

  return (
    <div className="admin-modal-overlay" onClick={handleBackdropClick} role="presentation">
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
    </div>
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
          <ul key={index} className="portal-todo-desc-list">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index} className="portal-todo-desc">
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

  if (todo.completed) {
    return (
      <div className="portal-todo-item done">
        <span className="portal-todo-check portal-todo-check-done" aria-hidden="true">
          <CheckCircle2 size={20} strokeWidth={2} />
        </span>
        <div className="portal-todo-copy portal-todo-copy-done">
          <strong>{todo.title}</strong>
          {keepCompletedLink && (
            <a
              href={todo.href}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-todo-link"
            >
              {todo.actionLabel || "Open SureLC"}
              <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    );
  }

  const actionContent = (
    <>
      {todo.actionLabel}
      <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
    </>
  );

  const disabled = locked || gateLocked;

  return (
    <div className={`portal-todo-item urgent${disabled ? " portal-todo-item-locked" : ""}`}>
      {isAgentCheckable && (
        needsNewProducerConfirmation ? (
          // Checks itself off once the submission goes through, so the circle
          // is only an indicator here.
          <span className="portal-todo-check portal-todo-check-static" aria-hidden="true">
            {completing ? (
              <span className="onboarding-spinner portal-todo-check-spinner" />
            ) : (
              <Circle size={20} strokeWidth={2} />
            )}
          </span>
        ) : (
          <button
            type="button"
            className="portal-todo-check"
            onClick={() => onComplete(todo.id)}
            disabled={completing || disabled}
            aria-label={`Mark "${todo.title}" as complete`}
          >
            {completing ? (
              <span className="onboarding-spinner portal-todo-check-spinner" aria-hidden="true" />
            ) : (
              <Circle size={20} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        )
      )}

      <div className={`portal-todo-copy${isAgentCheckable ? "" : " portal-todo-copy-required"}`}>
        <div className="portal-todo-title-row">
          {isRequiredForm && !disabled && <PortalUrgentIcon size={16} />}
          {disabled && <Lock size={14} aria-hidden="true" />}
          <strong>{todo.title}</strong>
          {isRequiredForm && !disabled && (
            <span className="portal-todo-urgent-tag">Required — top priority</span>
          )}
          {isAdminManaged && (
            <span className="portal-todo-urgent-tag">PNCL admin completes this</span>
          )}
        </div>
        {locked ? (
          <p className="portal-todo-desc">Complete the previous stage to unlock this step.</p>
        ) : (
          <>
            <TodoDescription description={todo.description} />
            {gateLocked && (
              <p className="portal-todo-desc">Complete the steps above to unlock this step.</p>
            )}
          </>
        )}
        {!disabled && agentEmail && todo.showEmailHint !== false && (
          <p className="portal-todo-email">
            Use <span>{agentEmail}</span> when you sign up.
          </p>
        )}
        {!disabled && needsNewProducerConfirmation && (
          <button
            type="button"
            className="portal-todo-link"
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
              className="portal-todo-link"
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
              className="portal-todo-link"
            >
              {actionContent}
            </a>
          ) : (
            <Link to={todo.href} className="portal-todo-link">
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
    </div>
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
   * locked steps. Visual only — completion guards still apply.
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
    <div className="portal-checklist-card">
      <div className="portal-checklist-head">
        <span className="portal-checklist-eyebrow">Your path to sales ready</span>
        <h2>Onboarding checklist</h2>
        <div className="portal-checklist-progress-row">
          <span>{completedCount} of {total} complete</span>
          <span>{percent}%</span>
        </div>
        <div
          className="portal-checklist-progress-bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding progress"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      {previewUnlocked && (
        <p className="portal-checklist-note portal-checklist-preview-note">
          Admin preview: every stage is unlocked for you. Agents still see stages locked
          until they complete the previous one.
        </p>
      )}

      {allDone ? (
        <div className="portal-checklist-done">
          <Trophy size={22} aria-hidden="true" />
          <div>
            <strong>You&apos;re sales ready!</strong>
            <p>Every onboarding step is complete. Go write some business.</p>
          </div>
        </div>
      ) : (
        <p className="portal-checklist-note">
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
            className={`portal-checklist-phase${open ? " open" : ""}${phaseComplete ? " complete" : ""}${locked ? " locked" : ""}${isCurrent ? " current" : ""}`}
          >
            <button
              type="button"
              className="portal-checklist-phase-head"
              onClick={() => togglePhase(phase.id, phaseIndex)}
              aria-expanded={open}
              disabled={locked}
              aria-disabled={locked}
            >
              <span className="portal-checklist-phase-title">
                {phaseComplete ? (
                  <CheckCircle2 size={17} strokeWidth={2.25} aria-hidden="true" />
                ) : locked ? (
                  <Lock size={15} aria-hidden="true" />
                ) : (
                  <span className="portal-checklist-phase-num" aria-hidden="true">
                    Stage {phaseIndex + 1}
                  </span>
                )}
                {phase.label}
              </span>
              <span className="portal-checklist-phase-meta">
                {locked ? "Locked" : `${doneCount}/${items.length}`}
                {!locked && (
                  <ChevronDown size={16} className="portal-checklist-phase-chevron" aria-hidden="true" />
                )}
              </span>
            </button>
            {open && (
              <div className="portal-checklist-phase-items">
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
