import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Image,
  Pencil,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import PortalIncentivePoster from "@/components/PortalIncentivePoster";
import {
  useAdminIncentives,
  type AdminIncentiveSummary,
} from "@/hooks/useAdminIncentives";
import type { UpsertIncentivePayload } from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type IncentiveFormState = {
  id?: string;
  slug: string;
  title: string;
  type: "image" | "video";
  src: string;
  poster: string;
  href: string;
  published: boolean;
};

const EMPTY_FORM: IncentiveFormState = {
  slug: "",
  title: "",
  type: "image",
  src: "",
  poster: "",
  href: "",
  published: true,
};

function toFormState(incentive: AdminIncentiveSummary): IncentiveFormState {
  return {
    id: incentive.id,
    slug: incentive.slug,
    title: incentive.title,
    type: incentive.type,
    src: incentive.src,
    poster: incentive.poster ?? "",
    href: incentive.href ?? "",
    published: incentive.published,
  };
}

function toPayload(form: IncentiveFormState): UpsertIncentivePayload {
  return {
    id: form.id,
    slug: form.slug.trim() || undefined,
    title: form.title.trim(),
    type: form.type,
    src: form.src.trim(),
    poster: form.type === "video" ? form.poster.trim() : null,
    href: form.href.trim() || null,
    published: form.published,
  };
}

function previewIncentive(form: IncentiveFormState): AdminIncentiveSummary | null {
  if (!form.title.trim() || !form.src.trim()) return null;
  if (form.type === "video" && !form.poster.trim()) return null;

  return {
    id: form.id ?? "preview",
    slug: form.slug.trim() || "preview",
    title: form.title.trim(),
    type: form.type,
    src: form.src.trim(),
    poster: form.type === "video" ? form.poster.trim() : null,
    href: form.href.trim() || null,
    sortOrder: 0,
    published: form.published,
    createdAt: "",
    updatedAt: "",
  };
}

export default function AdminIncentives() {
  const { incentives, loading, error, save, remove, reorder } = useAdminIncentives();
  const [form, setForm] = useState<IncentiveFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Incentives — PNCL Admin";
    trackPageView("admin_incentives");
  }, []);

  const preview = useMemo(() => previewIncentive(form), [form]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await save(toPayload(form));
      toast.success(result.message);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save incentive");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (incentive: AdminIncentiveSummary) => {
    setForm(toFormState(incentive));
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (incentive: AdminIncentiveSummary) => {
    if (!window.confirm(`Delete "${incentive.title}"?`)) return;

    setDeletingId(incentive.id);
    try {
      const result = await remove(incentive.id);
      toast.success(result.message);
      if (form.id === incentive.id) {
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete incentive");
    } finally {
      setDeletingId(null);
    }
  };

  const moveIncentive = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= incentives.length) return;

    const orderedIds = incentives.map((item) => item.id);
    [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];

    setReorderingId(incentives[index].id);
    try {
      const result = await reorder(orderedIds);
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder incentives");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head admin-panel-head-row">
        <div className="admin-panel-head">
          <Trophy size={22} aria-hidden="true" />
          <div>
            <h1>Incentives</h1>
            <p>Manage the poster grid shown in the agent portal.</p>
          </div>
        </div>
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
            Add incentive
          </button>
        )}
      </div>

      {(editing || form.id) && (
        <form className="admin-form admin-incentive-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-incentive-form-grid">
            <div className="admin-incentive-form-fields">
              <label className="admin-field">
                <span>Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Trip to Hawaii"
                  required
                />
              </label>

              <label className="admin-field">
                <span>Slug</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                  placeholder="trip-to-hawaii"
                />
              </label>

              <label className="admin-field">
                <span>Type</span>
                <select
                  value={form.type}
                  onChange={(event) => {
                    const type = event.target.value as "image" | "video";
                    setForm((prev) => ({
                      ...prev,
                      type,
                      poster: type === "image" ? "" : prev.poster,
                    }));
                  }}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </label>

              <label className="admin-field">
                <span>{form.type === "video" ? "Video URL" : "Image URL"}</span>
                <input
                  type="text"
                  value={form.src}
                  onChange={(event) => setForm((prev) => ({ ...prev, src: event.target.value }))}
                  placeholder="/poster.png or https://..."
                  required
                />
              </label>

              {form.type === "video" && (
                <label className="admin-field">
                  <span>Poster URL</span>
                  <input
                    type="text"
                    value={form.poster}
                    onChange={(event) => setForm((prev) => ({ ...prev, poster: event.target.value }))}
                    placeholder="https://..."
                    required
                  />
                </label>
              )}

              <label className="admin-field">
                <span>Link URL (optional)</span>
                <input
                  type="text"
                  value={form.href}
                  onChange={(event) => setForm((prev) => ({ ...prev, href: event.target.value }))}
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
            </div>

            <div className="admin-incentive-preview">
              <p className="admin-incentive-preview-label">Preview</p>
              {preview ? (
                <PortalIncentivePoster item={preview} />
              ) : (
                <div className="admin-incentive-preview-empty">
                  <Image size={28} aria-hidden="true" />
                  <span>Add a title and media URL to preview.</span>
                </div>
              )}
            </div>
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : form.id ? "Save changes" : "Create incentive"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading incentives" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {incentives.map((incentive, index) => {
                const isDeleting = deletingId === incentive.id;
                const isReordering = reorderingId === incentive.id;

                return (
                  <tr key={incentive.id}>
                    <td>
                      <div className="admin-incentive-thumb">
                        <PortalIncentivePoster item={incentive} />
                      </div>
                    </td>
                    <td>
                      <strong>{incentive.title}</strong>
                      <span className="admin-incentive-slug">{incentive.slug}</span>
                    </td>
                    <td>{incentive.type}</td>
                    <td>
                      <span className={`admin-status${incentive.published ? " active" : ""}`}>
                        {incentive.published ? "Published" : "Hidden"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-incentive-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === 0 || isReordering}
                          onClick={() => void moveIncentive(index, -1)}
                          aria-label={`Move ${incentive.title} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === incentives.length - 1 || isReordering}
                          onClick={() => void moveIncentive(index, 1)}
                          aria-label={`Move ${incentive.title} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleEdit(incentive)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(incentive)}
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

          {incentives.length === 0 && (
            <p className="admin-empty">No incentives yet. Add your first poster above.</p>
          )}
        </div>
      )}
    </section>
  );
}
