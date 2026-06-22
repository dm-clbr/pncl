import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Image,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useAdminBrandAssets,
  type AdminBrandAssetSummary,
} from "@/hooks/useAdminBrandAssets";
import { useAuth } from "@/contexts/AuthContext";
import type { UpsertBrandAssetPayload } from "@/lib/admin-api";
import { uploadBrandAsset } from "@/lib/brand-asset-upload";
import { formatFileSize } from "@/lib/compress-image";
import { assetTypeLabel, isImageAsset } from "@/lib/portal-brand-assets";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

type BrandAssetFormState = {
  id?: string;
  title: string;
  description: string;
  url: string;
  fileName: string;
  contentType: string;
  published: boolean;
};

const EMPTY_FORM: BrandAssetFormState = {
  title: "",
  description: "",
  url: "",
  fileName: "",
  contentType: "",
  published: true,
};

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toFormState(asset: AdminBrandAssetSummary): BrandAssetFormState {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description ?? "",
    url: asset.url,
    fileName: asset.fileName,
    contentType: asset.contentType,
    published: asset.published,
  };
}

function toPayload(form: BrandAssetFormState): UpsertBrandAssetPayload {
  return {
    id: form.id,
    title: form.title.trim(),
    description: form.description.trim() || null,
    url: form.url.trim(),
    fileName: form.fileName.trim(),
    contentType: form.contentType.trim(),
    published: form.published,
  };
}

function rowLabel(asset: AdminBrandAssetSummary): string {
  return asset.title || asset.fileName || "Brand asset";
}

export default function AdminBrandAssets() {
  const { session } = useAuth();
  const { assets, loading, error, save, saveMany, remove, reorder } = useAdminBrandAssets();
  const [form, setForm] = useState<BrandAssetFormState>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Brand Assets — PNCL Admin";
    trackPageView("admin_brand_assets");
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
    setUploading(false);
    setBulkUploadProgress(null);
  };

  const handleEdit = (asset: AdminBrandAssetSummary) => {
    setForm(toFormState(asset));
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBulkUpload = async (files: File[], token: string) => {
    setUploading(true);
    setBulkUploadProgress({ current: 0, total: files.length });

    const payloads: UpsertBrandAssetPayload[] = [];
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setBulkUploadProgress({ current: index + 1, total: files.length });

      try {
        const result = await uploadBrandAsset(token, file, file.name);
        payloads.push({
          title: titleFromFilename(result.fileName),
          url: result.url,
          fileName: result.fileName,
          contentType: result.contentType,
          published: true,
        });
      } catch (err) {
        failures.push(
          `${file.name}: ${err instanceof Error ? err.message : "Unable to upload file"}`,
        );
      }
    }

    if (payloads.length > 0) {
      try {
        await saveMany(payloads);
        toast.success(`Added ${payloads.length} brand asset${payloads.length === 1 ? "" : "s"}`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "Unable to save brand assets");
      }
    }

    setBulkUploadProgress(null);
    setUploading(false);

    if (failures.length > 0) {
      toast.error(
        failures.length === 1
          ? failures[0]
          : `${failures.length} file${failures.length === 1 ? "" : "s"} failed to upload`,
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    if (files.length > 1) {
      if (editing) {
        toast.error("Choose one file when replacing an existing asset.");
        return;
      }
      await handleBulkUpload(files, token);
      return;
    }

    const file = files[0];
    setUploading(true);
    try {
      const result = await uploadBrandAsset(token, file, file.name);
      setForm((prev) => ({
        ...prev,
        url: result.url,
        fileName: result.fileName,
        contentType: result.contentType,
        title: prev.title.trim() || titleFromFilename(result.fileName),
      }));
      toast.success(`File uploaded (${formatFileSize(file.size)})`);
      if (!editing) {
        setEditing(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.url.trim()) {
      toast.error("Upload a file before saving");
      return;
    }

    setSubmitting(true);
    try {
      const result = await save(toPayload(form));
      toast.success(result.message);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save brand asset");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (asset: AdminBrandAssetSummary) => {
    if (!window.confirm(`Delete ${rowLabel(asset)}?`)) return;

    setDeletingId(asset.id);
    try {
      const result = await remove(asset.id);
      toast.success(result.message);
      if (form.id === asset.id) {
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete brand asset");
    } finally {
      setDeletingId(null);
    }
  };

  const moveAsset = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= assets.length) return;

    const reordered = [...assets];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];

    setReorderingId(reordered[nextIndex].id);
    try {
      const result = await reorder(reordered.map((asset) => asset.id));
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder brand assets");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Palette size={22} aria-hidden="true" />
        <div>
          <h1>Brand assets</h1>
          <p>
            Upload logos, templates, and other files for agents to download from the portal. Select
            multiple files to add them all at once.
          </p>
        </div>
      </div>

      <div className="admin-panel-head-row">
        <p className="admin-panel-note">
          {editing ? "Editing brand asset" : "Add a new brand asset"}
        </p>
        {!editing && (
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Plus size={16} aria-hidden="true" />
            {bulkUploadProgress
              ? `Uploading ${bulkUploadProgress.current}/${bulkUploadProgress.total}...`
              : uploading
                ? "Uploading..."
                : "Upload assets"}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple={!editing}
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,.zip"
        className="admin-upload-input"
        onChange={(event) => void handleFileUpload(event)}
      />

      {editing && (
        <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-upload-preview">
            {form.url && isImageAsset(form.contentType) ? (
              <img src={form.url} alt="" className="admin-upload-preview-image" />
            ) : (
              <span className="admin-upload-preview-placeholder" aria-hidden="true">
                <Image size={28} strokeWidth={1.75} />
              </span>
            )}
            <div className="admin-upload-preview-copy">
              <strong>{form.fileName || "No file selected"}</strong>
              {form.contentType && <span>{assetTypeLabel(form.contentType)}</span>}
              <button
                type="button"
                className="admin-secondary-link"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={14} aria-hidden="true" />
                {uploading ? "Uploading..." : form.url ? "Replace file" : "Choose file"}
              </button>
            </div>
          </div>

          <label className="admin-field">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="PNCL logo — dark background"
              required
            />
          </label>

          <label className="admin-field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Optional notes for agents"
              rows={3}
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
            <button type="submit" className="admin-primary-btn" disabled={submitting || uploading}>
              {submitting ? "Saving..." : form.id ? "Save changes" : "Create brand asset"}
            </button>
            <button type="button" className="admin-secondary-link" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading brand assets" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>File</th>
                <th>Type</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, index) => {
                const isDeleting = deletingId === asset.id;
                const isReordering = reorderingId === asset.id;

                return (
                  <tr key={asset.id}>
                    <td>
                      <div className="admin-brand-asset-cell">
                        {isImageAsset(asset.contentType) ? (
                          <img src={asset.url} alt="" className="admin-brand-asset-thumb" />
                        ) : (
                          <span className="admin-brand-asset-thumb admin-brand-asset-thumb-file" aria-hidden="true">
                            <Image size={16} strokeWidth={1.75} />
                          </span>
                        )}
                        <span>{asset.title}</span>
                      </div>
                    </td>
                    <td>{asset.fileName}</td>
                    <td>{assetTypeLabel(asset.contentType)}</td>
                    <td>
                      <span className={`admin-status${asset.published ? " active" : ""}`}>
                        {asset.published ? "Published" : "Hidden"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-incentive-actions">
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === 0 || isReordering}
                          onClick={() => void moveAsset(index, -1)}
                          aria-label={`Move ${rowLabel(asset)} up`}
                        >
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={index === assets.length - 1 || isReordering}
                          onClick={() => void moveAsset(index, 1)}
                          aria-label={`Move ${rowLabel(asset)} down`}
                        >
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleEdit(asset)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(asset)}
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

          {assets.length === 0 && (
            <p className="admin-empty">No brand assets yet. Upload your first file above.</p>
          )}
        </div>
      )}
    </section>
  );
}
