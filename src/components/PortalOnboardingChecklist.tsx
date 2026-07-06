import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ChevronDown, Circle, Trophy } from "lucide-react";
import {
  groupTodosByPhase,
  isRequiredFormTodo,
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
  onComplete,
}: {
  todo: PortalTodo;
  agentEmail: string;
  completing: boolean;
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

  return (
    <div className="portal-todo-item urgent">
      {isAgentCheckable && (
        <button
          type="button"
          className="portal-todo-check"
          onClick={() => onComplete(todo.id)}
          disabled={completing}
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
          {isRequiredForm && <PortalUrgentIcon size={16} />}
          <strong>{todo.title}</strong>
          {isRequiredForm && (
            <span className="portal-todo-urgent-tag">Required — top priority</span>
          )}
          {isAdminManaged && (
            <span className="portal-todo-urgent-tag">PNCL admin completes this</span>
          )}
        </div>
        <p>{todo.description}</p>
        {agentEmail && todo.showEmailHint !== false && (
          <p className="portal-todo-email">
            Use <span>{agentEmail}</span> when you sign up.
          </p>
        )}
        {todo.href && (
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

  const currentPhaseId = useMemo(() => {
    for (const phase of PORTAL_TODO_PHASES) {
      const items = todosByPhase.get(phase.id) ?? [];
      if (items.some((todo) => !todo.completed)) return phase.id;
    }
    return null;
  }, [todosByPhase]);

  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const isPhaseOpen = (phaseId: string) => openPhases[phaseId] ?? phaseId === currentPhaseId;
  const togglePhase = (phaseId: string) => {
    setOpenPhases((prev) => ({ ...prev, [phaseId]: !isPhaseOpen(phaseId) }));
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
          Work through each phase in order. Some steps complete automatically as you
          submit forms and update your profile.
        </p>
      )}

      {PORTAL_TODO_PHASES.map((phase, phaseIndex) => {
        const items = todosByPhase.get(phase.id) ?? [];
        if (items.length === 0) return null;
        const doneCount = items.filter((todo) => todo.completed).length;
        const phaseComplete = doneCount === items.length;
        const open = isPhaseOpen(phase.id);

        return (
          <div
            key={phase.id}
            className={`portal-checklist-phase${open ? " open" : ""}${phaseComplete ? " complete" : ""}`}
          >
            <button
              type="button"
              className="portal-checklist-phase-head"
              onClick={() => togglePhase(phase.id)}
              aria-expanded={open}
            >
              <span className="portal-checklist-phase-title">
                {phaseComplete ? (
                  <CheckCircle2 size={17} strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  <span className="portal-checklist-phase-num" aria-hidden="true">
                    {phaseIndex + 1}
                  </span>
                )}
                {phase.label}
              </span>
              <span className="portal-checklist-phase-meta">
                {doneCount}/{items.length}
                <ChevronDown size={16} className="portal-checklist-phase-chevron" aria-hidden="true" />
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
