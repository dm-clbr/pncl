import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import AdminTodoCompletionModal from "@/components/admin/AdminTodoCompletionModal";
import {
  useAdminTodos,
  type AdminPortalTodoSummary,
} from "@/hooks/useAdminTodos";
import type {
  AdminPortalTodoCompletionType,
  AdminPortalTodoPhase,
  UpsertPortalTodoPayload,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

const PHASE_OPTIONS: { value: AdminPortalTodoPhase; label: string }[] = [
  { value: "on_board", label: "On-Board" },
  { value: "pre_license", label: "Pre-License" },
  { value: "licensing", label: "Licensing" },
  { value: "sales_ready", label: "Sales Ready" },
];

const COMPLETION_TYPE_OPTIONS: { value: AdminPortalTodoCompletionType; label: string }[] = [
  { value: "agent", label: "Agent checks it off" },
  { value: "admin", label: "PNCL admin checks it off" },
  { value: "auto", label: "Auto-completed from data" },
];

const AUTO_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: "account_created", label: "Portal account created" },
  { value: "ica", label: "ICA signed" },
  { value: "w9", label: "W-9 submitted" },
  { value: "direct_deposit", label: "Direct deposit submitted" },
  { value: "profile", label: "Portal profile saved" },
  { value: "drivers_license", label: "Driver's license uploaded" },
  { value: "npn", label: "NPN recorded" },
  { value: "eo_policy", label: "E&O policy number recorded" },
  { value: "state_licenses", label: "State license added" },
  { value: "writing_numbers", label: "Carrier writing number recorded" },
  { value: "carrier_credentials", label: "Carrier credentials saved" },
];

function phaseLabel(phase: AdminPortalTodoPhase): string {
  return PHASE_OPTIONS.find((option) => option.value === phase)?.label ?? phase;
}

type TodoFormState = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  external: boolean;
  actionLabel: string;
  showEmailHint: boolean;
  published: boolean;
  phase: AdminPortalTodoPhase;
  completionType: AdminPortalTodoCompletionType;
  autoKey: string;
};

const EMPTY_FORM: TodoFormState = {
  slug: "",
  title: "",
  description: "",
  href: "",
  external: true,
  actionLabel: "",
  showEmailHint: true,
  published: true,
  phase: "on_board",
  completionType: "agent",
  autoKey: "",
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function toFormState(todo: AdminPortalTodoSummary): TodoFormState {
  return {
    id: todo.id,
    slug: todo.slug,
    title: todo.title,
    description: todo.description,
    href: todo.href,
    external: todo.external,
    actionLabel: todo.actionLabel,
    showEmailHint: todo.showEmailHint,
    published: todo.published,
    phase: todo.phase,
    completionType: todo.completionType,
    autoKey: todo.autoKey ?? "",
  };
}

function toPayload(form: TodoFormState): UpsertPortalTodoPayload {
  return {
    id: form.id,
    slug: form.slug.trim() || undefined,
    title: form.title.trim(),
    description: form.description.trim(),
    href: form.href.trim(),
    external: form.external,
    actionLabel: form.actionLabel.trim(),
    showEmailHint: form.showEmailHint,
    published: form.published,
    phase: form.phase,
    completionType: form.completionType,
    autoKey: form.completionType === "auto" ? form.autoKey.trim() || null : null,
  };
}

function rowLabel(todo: AdminPortalTodoSummary): string {
  return todo.title || todo.slug || "To-do";
}

function CompletionCell({
  todo,
  onViewUsers,
}: {
  todo: AdminPortalTodoSummary;
  onViewUsers: (todo: AdminPortalTodoSummary) => void;
}) {
  const percent = todo.completionPercent;
  return (
    <div className="admin-todo-completion">
      <div className="admin-todo-completion-bar" aria-hidden="true">
        <span className="admin-todo-completion-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="admin-todo-completion-label">
        {percent}% ({todo.completedCount}/{todo.totalUsers})
      </span>
      <button
        type="button"
        className="admin-todo-completion-btn"
        onClick={() => onViewUsers(todo)}
      >
        <Users size={14} aria-hidden="true" />
        View users
      </button>
    </div>
  );
}

export default function AdminTodos() {
  const { todos, totalUsers, loading, error, save, remove, reorder } = useAdminTodos();
  const [form, setForm] = useState<TodoFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [completionTodo, setCompletionTodo] = useState<AdminPortalTodoSummary | null>(null);

  useEffect(() => {
    document.title = "To-dos — PNCL Admin";
    trackPageView("admin_todos");
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
  };

  const handleEdit = (todo: AdminPortalTodoSummary) => {
    setForm(toFormState(todo));
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await save(toPayload(form));
      toast.success(result.message);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save to-do");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (todo: AdminPortalTodoSummary) => {
    if (!window.confirm(`Delete "${rowLabel(todo)}"?`)) return;

    setDeletingId(todo.id);
    try {
      const result = await remove(todo.id);
      toast.success(result.message);
      if (form.id === todo.id) {
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete to-do");
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePublished = async (todo: AdminPortalTodoSummary) => {
    setTogglingId(todo.id);
    try {
      await save({
        ...toPayload(toFormState(todo)),
        published: !todo.published,
      });
      toast.success(
        todo.published
          ? `"${rowLabel(todo)}" hidden from the agent portal.`
          : `"${rowLabel(todo)}" published to the agent portal.`,
      );
      if (form.id === todo.id) {
        setForm((prev) => ({ ...prev, published: !todo.published }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update to-do visibility");
    } finally {
      setTogglingId(null);
    }
  };

  const moveTodo = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= todos.length) return;

    const reordered = [...todos];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    setReorderingId(reordered[nextIndex].id);
    try {
      const result = await reorder(reordered.map((todo) => todo.id));
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder to-dos");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <CheckSquare size={22} aria-hidden="true" />
        <div>
          <h1>Portal to-dos</h1>
          <p>
            Manage the urgent onboarding checklist shown on the agent dashboard.
            Hide a to-do to remove it from agents without deleting completion data.
            Completion is tracked across {totalUsers} portal {totalUsers === 1 ? "user" : "users"}.
          </p>
        </div>
      </div>

      <div className="admin-panel-head-row">
        <p className="admin-panel-note">
          {editing ? "Editing to-do" : "Add a new to-do"}
        </p>
        {!editing && (
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditing(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Add to-do
          </button>
        )}
      </div>

      {editing && (
        <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="admin-field">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => {
                const title = event.target.value;
                setForm((prev) => ({
                  ...prev,
                  title,
                  slug: prev.id ? prev.slug : slugify(title),
                  actionLabel: prev.actionLabel || (title ? `Go to ${title.split(" ").slice(0, 3).join(" ")}` : ""),
                }));
              }}
              placeholder="Create your LeadSpply account"
              required
            />
          </label>

          <label className="admin-field">
            <span>Slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="leadspply_account"
              pattern="[a-z0-9_]+"
              title="Lowercase letters, numbers, and underscores only"
              required
            />
            <span className="admin-field-hint">
              Used to track completion. Do not change after agents have completed this task.
            </span>
          </label>

          <label className="admin-field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Explain what the agent needs to do..."
              rows={3}
              required
            />
          </label>

          <label className="admin-field">
            <span>Phase</span>
            <select
              value={form.phase}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phase: event.target.value as AdminPortalTodoPhase }))
              }
            >
              {PHASE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Completed by</span>
            <select
              value={form.completionType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  completionType: event.target.value as AdminPortalTodoCompletionType,
                }))
              }
            >
              {COMPLETION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {form.completionType === "auto" && (
            <label className="admin-field">
              <span>Auto-completion rule</span>
              <select
                value={form.autoKey}
                onChange={(event) => setForm((prev) => ({ ...prev, autoKey: event.target.value }))}
                required
              >
                <option value="">Select a rule...</option>
                {AUTO_KEY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="admin-field-hint">
                The step checks itself off when this data exists for the agent.
              </span>
            </label>
          )}

          <label className="admin-field">
            <span>Link URL (optional)</span>
            <input
              type="url"
              value={form.href}
              onChange={(event) => setForm((prev) => ({ ...prev, href: event.target.value }))}
              placeholder="https://..."
            />
          </label>

          <label className="admin-field">
            <span>Action button label</span>
            <input
              type="text"
              value={form.actionLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, actionLabel: event.target.value }))}
              placeholder="Go to LeadSpply"
              required={Boolean(form.href.trim())}
            />
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={form.external}
              onChange={(event) => setForm((prev) => ({ ...prev, external: event.target.checked }))}
            />
            <span>Open link in a new tab</span>
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={form.showEmailHint}
              onChange={(event) => setForm((prev) => ({ ...prev, showEmailHint: event.target.checked }))}
            />
            <span>Show @thepncl.com email hint</span>
          </label>

          <label className="admin-field admin-field-checkbox">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(event) => setForm((prev) => ({ ...prev, published: event.target.checked }))}
            />
            <span>Published in agent portal</span>
          </label>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : form.id ? "Save changes" : "Create to-do"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading to-dos" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>To-do</th>
                <th>Phase</th>
                <th>Completion</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {todos.map((todo, index) => {
                const isDeleting = deletingId === todo.id;
                const isReordering = reorderingId === todo.id;
                const isToggling = togglingId === todo.id;

                return (
                  <tr key={todo.id} className={todo.published ? undefined : "admin-todo-row-hidden"}>
                    <td>
                      <strong>{todo.title}</strong>
                      <span className="admin-todo-slug">{todo.slug}</span>
                    </td>
                    <td>
                      <span className="admin-todo-phase">{phaseLabel(todo.phase)}</span>
                      <span className="admin-todo-slug">
                        {COMPLETION_TYPE_OPTIONS.find((option) => option.value === todo.completionType)?.label
                          ?? todo.completionType}
                      </span>
                    </td>
                    <td>
                      <CompletionCell todo={todo} onViewUsers={setCompletionTodo} />
                    </td>
                    <td>
                      <span className={`admin-status${todo.published ? " active" : ""}`}>
                        {todo.published ? "Published" : "Hidden"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-incentive-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === 0 || isReordering}
                          onClick={() => void moveTodo(index, -1)}
                          aria-label={`Move ${rowLabel(todo)} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === todos.length - 1 || isReordering}
                          onClick={() => void moveTodo(index, 1)}
                          aria-label={`Move ${rowLabel(todo)} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={isToggling}
                          onClick={() => void handleTogglePublished(todo)}
                          aria-label={todo.published ? `Hide ${rowLabel(todo)}` : `Show ${rowLabel(todo)}`}
                        >
                          {todo.published ? (
                            <EyeOff size={16} aria-hidden="true" />
                          ) : (
                            <Eye size={16} aria-hidden="true" />
                          )}
                          {todo.published ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleEdit(todo)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(todo)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {todos.length === 0 && (
            <p className="admin-empty">No to-dos yet. Add your first task above.</p>
          )}
        </div>
      )}

      <AdminTodoCompletionModal
        todo={completionTodo}
        onClose={() => setCompletionTodo(null)}
      />
    </section>
  );
}
