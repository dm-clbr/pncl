import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteDashboardFile,
  reorderDashboardFiles,
  upsertDashboardFile,
  type AdminDashboardFileSummary,
  type AdminDashboardSectionSummary,
} from "@/lib/admin-api";
import { uploadDashboardFile } from "@/lib/dashboard-file-upload";
import { assetTypeLabel } from "@/lib/portal-brand-assets";
import { toast } from "sonner";

type DashboardSectionFilesProps = {
  section: AdminDashboardSectionSummary;
  isPersisted: boolean;
  onChanged: () => Promise<void>;
};

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function DashboardSectionFiles({
  section,
  isPersisted,
  onChanged,
}: DashboardSectionFilesProps) {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleUpload = async (files: File[]) => {
    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    if (!isPersisted) {
      toast.error("Save dashboard tabs before uploading files");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setUploadProgress({ current: index + 1, total: files.length });

      try {
        const uploaded = await uploadDashboardFile(token, section.id, file);
        await upsertDashboardFile(token, {
          sectionId: section.id,
          title: titleFromFilename(uploaded.fileName),
          url: uploaded.url,
          fileName: uploaded.fileName,
          contentType: uploaded.contentType,
          published: true,
        });
      } catch (err) {
        failures.push(
          `${file.name}: ${err instanceof Error ? err.message : "Unable to upload file"}`,
        );
      }
    }

    setUploadProgress(null);
    setUploading(false);

    if (failures.length === 0) {
      toast.success(`Added ${files.length} file${files.length === 1 ? "" : "s"}`);
    } else if (files.length > failures.length) {
      toast.success(`Added ${files.length - failures.length} file${files.length - failures.length === 1 ? "" : "s"}`);
      toast.error(`${failures.length} upload${failures.length === 1 ? "" : "s"} failed`);
    } else {
      toast.error(failures[0] ?? "Unable to upload files");
    }

    await onChanged();
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    void handleUpload(files);
  };

  const handleDelete = async (file: AdminDashboardFileSummary) => {
    if (!window.confirm(`Delete "${file.title}"?`)) return;

    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    setBusyId(file.id);
    try {
      await deleteDashboardFile(token, file.id);
      toast.success("File deleted");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete file");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (file: AdminDashboardFileSummary) => {
    setEditingId(file.id);
    setEditTitle(file.title);
  };

  const handleSaveEdit = async (file: AdminDashboardFileSummary) => {
    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    const title = editTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }

    setBusyId(file.id);
    try {
      await upsertDashboardFile(token, {
        id: file.id,
        sectionId: section.id,
        title,
        description: file.description,
        url: file.url,
        fileName: file.fileName,
        contentType: file.contentType,
        published: file.published,
      });
      setEditingId(null);
      toast.success("File updated");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update file");
    } finally {
      setBusyId(null);
    }
  };

  const handleReorder = async (fileId: string, direction: "up" | "down") => {
    const token = session?.access_token;
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    const index = section.files.findIndex((file) => file.id === fileId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= section.files.length) return;

    const orderedIds = section.files.map((file) => file.id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];

    setBusyId(fileId);
    try {
      await reorderDashboardFiles(token, section.id, orderedIds);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to reorder files");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-dashboard-files">
      {!isPersisted && (
        <p className="admin-panel-note">
          Save dashboard tabs first, then upload PDFs and other files here.
        </p>
      )}

      <div className="admin-dashboard-files-actions">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.jpg,.jpeg,.png,.webp"
          hidden
          onChange={handleFileInput}
        />
        <button
          type="button"
          className="admin-primary-btn admin-dashboard-add-link-btn"
          disabled={!isPersisted || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} aria-hidden="true" />
          {uploading
            ? uploadProgress
              ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
              : "Uploading..."
            : "Upload files"}
        </button>
      </div>

      {section.files.length === 0 ? (
        <p className="admin-panel-note">No files yet. Upload PDFs, documents, or other resources.</p>
      ) : (
        <ul className="admin-dashboard-files-list">
          {section.files.map((file, index) => (
            <li key={file.id} className="admin-dashboard-file-row">
              {editingId === file.id ? (
                <div className="admin-dashboard-file-edit">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="File title"
                  />
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={busyId === file.id}
                    onClick={() => void handleSaveEdit(file)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-link"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="admin-dashboard-file-copy">
                    <strong>{file.title}</strong>
                    <span>
                      {assetTypeLabel(file.contentType)} · {file.fileName}
                    </span>
                  </div>
                  <div className="admin-incentive-actions">
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={index === 0 || busyId === file.id}
                      onClick={() => void handleReorder(file.id, "up")}
                      aria-label={`Move ${file.title} up`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={index === section.files.length - 1 || busyId === file.id}
                      onClick={() => void handleReorder(file.id, "down")}
                      aria-label={`Move ${file.title} down`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={busyId === file.id}
                      onClick={() => startEdit(file)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={busyId === file.id}
                      onClick={() => void handleDelete(file)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
