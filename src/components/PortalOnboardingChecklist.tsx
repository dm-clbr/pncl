import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ChevronDown, Circle, Lock, Trophy } from "lucide-react";
import {
  getCurrentStageIndex,
  groupTodosByPhase,
  isRequiredFormTodo,
  isStageLocked,
  isTodoGateLocked,
  PORTAL_TODO_PHASES,
  type PortalTodo,
} from "@/lib/portal-todos";

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

  if (todo.completed) {
    return (
      <div className="portal-todo-item done">
        <span className="portal-todo-check portal-todo-check-done" aria-hidden="true">
          <CheckCircle2 size={20} strokeWidth={2} />
        </span>
        <div className="portal-todo-copy portal-todo-copy-done">
          <strong>{todo.title}</strong>
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
        <p className="portal-todo-desc">
          {locked
            ? "Complete the previous stage to unlock this step."
            : gateLocked
              ? `${todo.description} Complete the steps above to unlock this step.`
              : todo.description}
        </p>
        {!disabled && agentEmail && todo.showEmailHint !== false && (
          <p className="portal-todo-email">
            Use <span>{agentEmail}</span> when you sign up.
          </p>
        )}
        {!disabled && todo.href && (
          todo.external ? (
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
}

export default function PortalOnboardingChecklist({
  todos,
  agentEmail,
  completingTodoId,
  onComplete,
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
    if (isStageLocked(todos, stageIndex)) return false;
    return openPhases[phaseId] ?? phaseId === currentPhaseId;
  };
  const togglePhase = (phaseId: string, stageIndex: number) => {
    if (isStageLocked(todos, stageIndex)) return;
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
        const locked = isStageLocked(todos, phaseIndex);
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
                    gateLocked={isTodoGateLocked(todos, todo.id)}
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
