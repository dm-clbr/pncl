import { useCallback, useEffect, useState } from "react";
import { DollarSign, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deletePayPolicyEntry,
  listAdminPayPolicyEntries,
  upsertPayPolicyEntry,
  type AdminPayPolicyEntry,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<AdminPayPolicyEntry["category"], string> = {
  policy: "Pay policy",
  faq: "FAQ",
};

interface EntryDraft {
  id?: string;
  title: string;
  body: string;
  category: AdminPayPolicyEntry["category"];
  sortOrder: number;
  published: boolean;
}

function EntryModal({
  draft,
  accessToken,
  onClose,
  onSaved,
}: {
  draft: EntryDraft;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required.");
      return;
    }

    setSaving(true);
    try {
      const result = await upsertPayPolicyEntry(accessToken, {
        id: form.id,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        sortOrder: form.sortOrder,
        published: form.published,
      });
      toast.success(result.message);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="admin-modal admin-ticket-modal"
        role="dialog"
        aria-labelledby="admin-pay-policy-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h2 id="admin-pay-policy-title">{form.id ? "Edit entry" : "New entry"}</h2>
          <button
            type="button"
            className="admin-modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Type</span>
            <select
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as EntryDraft["category"] })
              }
            >
              <option value="policy">Pay policy</option>
              <option value="faq">FAQ</option>
            </select>
          </label>

          <label className="admin-field">
            <span>Sort order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 0 })}
            />
          </label>
        </div>

        <label className="admin-field">
          <span>{form.category === "faq" ? "Question" : "Title"}</span>
          <input
            type="text"
            value={form.title}
            maxLength={200}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>

        <label className="admin-field">
          <span>{form.category === "faq" ? "Answer" : "Body"}</span>
          <textarea
            rows={6}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </label>

        <label className="admin-field admin-field-checkbox">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => setForm({ ...form, published: event.target.checked })}
          />
          <span>Published (visible to agents)</span>
        </label>

        <div className="admin-form-actions">
          <button type="button" className="admin-secondary-btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="admin-primary-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPayPolicy() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<AdminPayPolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Pay policy — PNCL Admin";
    trackPageView("admin_pay_policy");
  }, []);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      setEntries(await listAdminPayPolicyEntries(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load entries");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleDelete = async (entry: AdminPayPolicyEntry) => {
    const token = session?.access_token;
    if (!token) return;
    if (!window.confirm(`Delete "${entry.title}"? Agents will no longer see it.`)) return;

    setDeletingId(entry.id);
    try {
      const result = await deletePayPolicyEntry(token, entry.id);
      toast.success(result.message);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete entry");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <DollarSign size={22} aria-hidden="true" />
        <div>
          <h1>Pay &amp; Commissions page</h1>
          <p>
            Policies and FAQs shown to agents at /portal/pay-policy. Changes go live immediately —
            no deploy needed.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <button
          type="button"
          className="admin-primary-btn"
          onClick={() =>
            setDraft({ title: "", body: "", category: "policy", sortOrder: entries.length + 1, published: true })
          }
        >
          <Plus size={15} aria-hidden="true" />
          New entry
        </button>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading entries" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Order</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title}</td>
                  <td>{CATEGORY_LABELS[entry.category]}</td>
                  <td>{entry.sort_order}</td>
                  <td>
                    <span className={entry.published ? "admin-status active" : "admin-status"}>
                      {entry.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label={`Edit ${entry.title}`}
                        onClick={() =>
                          setDraft({
                            id: entry.id,
                            title: entry.title,
                            body: entry.body,
                            category: entry.category,
                            sortOrder: entry.sort_order,
                            published: entry.published,
                          })
                        }
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="admin-icon-btn danger"
                        aria-label={`Delete ${entry.title}`}
                        disabled={deletingId === entry.id}
                        onClick={() => void handleDelete(entry)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entries.length === 0 && (
            <p className="admin-empty">No entries yet. Add the first pay policy or FAQ.</p>
          )}
        </div>
      )}

      {draft && session?.access_token && (
        <EntryModal
          draft={draft}
          accessToken={session.access_token}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
