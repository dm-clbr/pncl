import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPortalTodoCompletion,
  type PortalTodoCompletionDetail,
  type PortalTodoCompletionUser,
} from "@/lib/admin-api";
import type { AdminPortalTodoSummary } from "@/hooks/useAdminTodos";

interface AdminTodoCompletionModalProps {
  todo: AdminPortalTodoSummary | null;
  onClose: () => void;
}

function UserList({
  title,
  users,
  emptyLabel,
  variant,
}: {
  title: string;
  users: PortalTodoCompletionUser[];
  emptyLabel: string;
  variant: "completed" | "pending";
}) {
  return (
    <section className={`admin-todo-completion-list admin-todo-completion-list-${variant}`}>
      <h3>
        {title}
        <span className="admin-todo-completion-count">{users.length}</span>
      </h3>
      {users.length === 0 ? (
        <p className="admin-todo-completion-empty">{emptyLabel}</p>
      ) : (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminTodoCompletionModal({ todo, onClose }: AdminTodoCompletionModalProps) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<PortalTodoCompletionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const token = session?.access_token;
    if (!token || !todo) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getPortalTodoCompletion(token, todo.id);
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Unable to load completion details");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, todo]);

  useEffect(() => {
    if (!todo) {
      setDetail(null);
      setError(null);
      return;
    }

    void loadDetail();
  }, [loadDetail, todo]);

  useEffect(() => {
    if (!todo) return;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, todo]);

  if (!todo) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="admin-modal-overlay"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="admin-modal admin-todo-completion-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-todo-completion-title"
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-todo-completion-title">Completion breakdown</h2>
            <p>{todo.title}</p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loading && (
          <div className="admin-todo-completion-loading">
            <div className="onboarding-spinner admin-spinner" aria-label="Loading completion details" />
          </div>
        )}

        {!loading && error && <p className="admin-error">{error}</p>}

        {!loading && !error && detail && (
          <div className="admin-todo-completion-columns">
            <UserList
              title="Completed"
              users={detail.completed}
              emptyLabel="No agents have completed this task yet."
              variant="completed"
            />
            <UserList
              title="Not completed"
              users={detail.pending}
              emptyLabel="Every agent has completed this task."
              variant="pending"
            />
          </div>
        )}
      </div>
    </div>
  );
}
