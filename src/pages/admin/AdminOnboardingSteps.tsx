import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Workflow } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminTodos } from "@/hooks/useAdminTodos";
import { isTodoApplicableToAgent } from "@/lib/agent-designation";
import { saveOnboardingSteps, type AdminPortalTodoSummary, type PortalTodoAudienceInput } from "@/lib/admin-api";
import { toast } from "sonner";
import "@/styles/admin-onboarding-steps.css";

const STAGES = [
  { id: "on_board", label: "On-Board" },
  { id: "pre_license", label: "Pre-License" },
  { id: "licensing", label: "Licensing" },
  { id: "new_producer", label: "New Producer" },
  { id: "sales_ready", label: "Sales Ready" },
];

function audience(todo: AdminPortalTodoSummary): PortalTodoAudienceInput {
  return { id: todo.id,
    showLoa: isTodoApplicableToAgent(todo.slug, "loa", todo),
    showIbo: isTodoApplicableToAgent(todo.slug, "ibo", todo) };
}

export default function AdminOnboardingSteps() {
  const { session } = useAuth();
  const { todos, loading, error, reload } = useAdminTodos();
  const [drafts, setDrafts] = useState<Record<string, PortalTodoAudienceInput>>({});
  const [stageFilter, setStageFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const changes = Object.values(drafts);
  const counts = useMemo(() => todos.reduce((result, todo) => {
    if (!todo.published) return result;
    const selected = drafts[todo.id] ?? audience(todo);
    if (selected.showLoa) result.loa += 1;
    if (selected.showIbo) result.ibo += 1;
    return result;
  }, { loa: 0, ibo: 0 }), [todos, drafts]);

  useEffect(() => { document.title = "Onboarding steps — PNCL Admin"; }, []);

  const toggle = (todo: AdminPortalTodoSummary, field: "showLoa" | "showIbo", checked: boolean) => {
    setSaveError(null);
    setDrafts((previous) => {
      const saved = audience(todo);
      const next = { ...(previous[todo.id] ?? saved), [field]: checked };
      const updated = { ...previous };
      if (next.showLoa === saved.showLoa && next.showIbo === saved.showIbo) delete updated[todo.id];
      else updated[todo.id] = next;
      return updated;
    });
  };

  const save = async () => {
    const token = session?.access_token;
    if (!token || !changes.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveOnboardingSteps(token, changes);
      setDrafts({});
      toast.success(result.message);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save onboarding steps.";
      setSaveError(message);
      toast.error(message);
    } finally { setSaving(false); }
  };

  return (
    <section className="admin-panel admin-onboarding-steps">
      <div className="admin-panel-head">
        <Workflow size={22} aria-hidden="true" />
        <div>
          <h1>Onboarding steps</h1>
          <p>Choose which steps LOA and IBO agents see on their onboarding checklist.</p>
        </div>
      </div>
      <p className="admin-panel-note">
        Changes apply to existing and future agents when their checklist reloads.
        Hidden steps stop counting toward progress and stage locks. Completed documents and history stay saved.
      </p>
      <div className="admin-onboarding-toolbar">
        <div className="admin-onboarding-counts" aria-live="polite">
          <span><strong>LOA</strong> {counts.loa} published steps</span>
          <span><strong>IBO</strong> {counts.ibo} published steps</span>
        </div>
        <label className="admin-field admin-onboarding-stage-filter">
          <span>Stage</span>
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="all">All stages</option>
            {STAGES.filter((stage) => todos.some((todo) => todo.phase === stage.id)).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
          </select>
        </label>
        <Link to="/portal/admin/todos" className="admin-secondary-link">Edit step content & order</Link>
      </div>
      {loading && <p className="admin-panel-note" role="status">Loading onboarding steps…</p>}
      {!loading && error && <p className="admin-error" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          <p className="admin-panel-note" id="onboarding-step-help">
            Checked = shown for that agent type. Unpublished steps stay hidden until published in To-dos.
            Steps that need an assigned document still appear only when that document is available.
          </p>
          {todos.length === 0 ? <p className="admin-empty">No onboarding steps yet. Add steps in To-dos.</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-onboarding-table" aria-describedby="onboarding-step-help">
                <thead><tr><th scope="col">Onboarding step</th><th scope="col">Status</th><th scope="col">LOA</th><th scope="col">IBO</th></tr></thead>
                <tbody>
                  {STAGES.filter((stage) => stageFilter === "all" || stage.id === stageFilter).map((stage) => {
                    const rows = todos.filter((todo) => todo.phase === stage.id);
                    if (!rows.length) return null;
                    return rows.map((todo, index) => {
                      const selected = drafts[todo.id] ?? audience(todo);
                      return <tr key={todo.id} className={todo.published ? undefined : "admin-todo-row-hidden"}>
                        <th scope="row">
                          {index === 0 && <span className="admin-onboarding-stage">{stage.label}</span>}
                          <strong>{todo.title}</strong>
                          <span className="admin-todo-slug">{todo.description}</span>
                        </th>
                        <td data-label="Status"><span className={`admin-status${todo.published ? " active" : ""}`}>{todo.published ? "Published" : "Unpublished"}</span></td>
                        <td data-label="LOA"><label className="admin-onboarding-check"><input type="checkbox" checked={selected.showLoa} disabled={saving} onChange={(event) => toggle(todo, "showLoa", event.target.checked)} aria-label={`Show ${todo.title} for LOA`} /></label></td>
                        <td data-label="IBO"><label className="admin-onboarding-check"><input type="checkbox" checked={selected.showIbo} disabled={saving} onChange={(event) => toggle(todo, "showIbo", event.target.checked)} aria-label={`Show ${todo.title} for IBO`} /></label></td>
                      </tr>;
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-onboarding-save">
            <span role="status">{changes.length ? `${changes.length} step${changes.length === 1 ? "" : "s"} with unsaved changes` : "No unsaved changes"}</span>
            <div className="admin-form-actions">
              <button type="button" className="admin-secondary-link" disabled={saving || !changes.length} onClick={() => { setDrafts({}); setSaveError(null); }}>Discard changes</button>
              <button type="button" className="admin-primary-btn" disabled={saving || !changes.length || !session?.access_token} onClick={() => void save()}>{saving ? "Saving…" : "Save onboarding steps"}</button>
            </div>
          </div>
          {saveError && <p className="admin-error" role="alert">{saveError}</p>}
        </>
      )}
    </section>
  );
}
