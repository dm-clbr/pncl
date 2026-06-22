import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useAdminCarriers,
  type AdminCarrierSummary,
} from "@/hooks/useAdminCarriers";
import type { UpsertCarrierPayload } from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type CarrierFormState = {
  id?: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string;
  published: boolean;
};

const EMPTY_FORM: CarrierFormState = {
  carrier: "",
  companyNumber: "",
  eAppLabel: "",
  eAppUrl: "",
  published: true,
};

function toFormState(carrier: AdminCarrierSummary): CarrierFormState {
  return {
    id: carrier.id,
    carrier: carrier.carrier,
    companyNumber: carrier.companyNumber,
    eAppLabel: carrier.eAppLabel,
    eAppUrl: carrier.eAppUrl ?? "",
    published: carrier.published,
  };
}

function toPayload(form: CarrierFormState): UpsertCarrierPayload {
  return {
    id: form.id,
    carrier: form.carrier.trim(),
    companyNumber: form.companyNumber.trim(),
    eAppLabel: form.eAppLabel.trim(),
    eAppUrl: form.eAppUrl.trim() || null,
    published: form.published,
  };
}

function rowLabel(carrier: AdminCarrierSummary): string {
  return carrier.carrier || carrier.eAppLabel || "Carrier row";
}

export default function AdminCarriers() {
  const { carriers, loading, error, save, remove, reorder } = useAdminCarriers();
  const [form, setForm] = useState<CarrierFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Carriers — PNCL Admin";
    trackPageView("admin_carriers");
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
  };

  const handleEdit = (carrier: AdminCarrierSummary) => {
    setForm(toFormState(carrier));
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
      toast.error(err instanceof Error ? err.message : "Unable to save carrier");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (carrier: AdminCarrierSummary) => {
    if (!window.confirm(`Delete ${rowLabel(carrier)}?`)) return;

    setDeletingId(carrier.id);
    try {
      const result = await remove(carrier.id);
      toast.success(result.message);
      if (form.id === carrier.id) {
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete carrier");
    } finally {
      setDeletingId(null);
    }
  };

  const moveCarrier = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= carriers.length) return;

    const reordered = [...carriers];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    setReorderingId(reordered[nextIndex].id);
    try {
      const result = await reorder(reordered.map((carrier) => carrier.id));
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder carriers");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Building2 size={22} aria-hidden="true" />
        <div>
          <h1>Carrier sheet</h1>
          <p>
            Manage the read-only carrier reference table shown to agents under Sales Tools.
          </p>
        </div>
      </div>

      <div className="admin-panel-head-row">
        <p className="admin-panel-note">
          {editing ? "Editing carrier row" : "Add a new carrier row"}
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
            Add carrier
          </button>
        )}
      </div>

      {editing && (
        <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="admin-field">
            <span>Carrier</span>
            <input
              type="text"
              value={form.carrier}
              onChange={(event) => setForm((prev) => ({ ...prev, carrier: event.target.value }))}
              placeholder="Mutual Of Omaha"
            />
          </label>

          <label className="admin-field">
            <span>Company #</span>
            <input
              type="text"
              value={form.companyNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, companyNumber: event.target.value }))}
              placeholder="800-775-6000"
            />
          </label>

          <label className="admin-field">
            <span>E-App link label</span>
            <input
              type="text"
              value={form.eAppLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, eAppLabel: event.target.value }))}
              placeholder="MOO"
            />
          </label>

          <label className="admin-field">
            <span>E-App URL</span>
            <input
              type="url"
              value={form.eAppUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, eAppUrl: event.target.value }))}
              placeholder="https://..."
            />
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
              {submitting ? "Saving..." : form.id ? "Save changes" : "Create carrier row"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading carriers" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Company #</th>
                <th>E-App link</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {carriers.map((carrier, index) => {
                const isDeleting = deletingId === carrier.id;
                const isReordering = reorderingId === carrier.id;

                return (
                  <tr key={carrier.id}>
                    <td>{carrier.carrier || "—"}</td>
                    <td>{carrier.companyNumber || "—"}</td>
                    <td>
                      {carrier.eAppUrl ? (
                        <a
                          href={carrier.eAppUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-secondary-link"
                        >
                          {carrier.eAppLabel || carrier.eAppUrl}
                        </a>
                      ) : (
                        carrier.eAppLabel || "—"
                      )}
                    </td>
                    <td>
                      <span className={`admin-status${carrier.published ? " active" : ""}`}>
                        {carrier.published ? "Published" : "Hidden"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-incentive-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === 0 || isReordering}
                          onClick={() => void moveCarrier(index, -1)}
                          aria-label={`Move ${rowLabel(carrier)} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === carriers.length - 1 || isReordering}
                          onClick={() => void moveCarrier(index, 1)}
                          aria-label={`Move ${rowLabel(carrier)} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleEdit(carrier)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(carrier)}
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

          {carriers.length === 0 && (
            <p className="admin-empty">No carrier rows yet. Add your first row above.</p>
          )}
        </div>
      )}
    </section>
  );
}
