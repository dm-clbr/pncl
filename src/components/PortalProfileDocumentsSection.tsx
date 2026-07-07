import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  deleteProfileDocument,
  fetchProfileDocuments,
  getProfileDocumentUrl,
  uploadProfileDocument,
  type PortalProfileDocument,
} from "@/lib/portal-profile-documents";
import { toast } from "sonner";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PortalProfileDocumentsSection({ user }: { user: User | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<PortalProfileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDocuments(await fetchProfileDocuments(user.id));
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      toast.error("Please choose a PDF, JPG, PNG, or WebP file.");
      return;
    }

    setPendingFile(file);
    if (!label.trim()) {
      setLabel(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !pendingFile) return;

    setUploading(true);
    try {
      await uploadProfileDocument(user.id, label, pendingFile);
      setPendingFile(null);
      setLabel("");
      toast.success("Document uploaded.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: PortalProfileDocument) => {
    setDownloadingId(doc.id);
    try {
      const url = await getProfileDocumentUrl(doc.file_path);
      if (!url) throw new Error("Unable to open document.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to open document.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc: PortalProfileDocument) => {
    if (!window.confirm(`Delete "${doc.label}"? PNCL admins will no longer see it.`)) return;

    setDeletingId(doc.id);
    try {
      await deleteProfileDocument(doc);
      toast.success("Document deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete document.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="carrier-sheet-panel portal-profile-panel">
      <div className="carrier-sheet-panel-head">
        <div>
          <h2>My documents</h2>
          <p>
            Upload any other documents PNCL asks for — certifications, carrier paperwork, or
            anything else. Admins can view what you upload here.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="portal-incentives-loading">
          <span className="onboarding-spinner" aria-hidden="true" />
          <span>Loading documents...</span>
        </div>
      ) : (
        <>
          {documents.length > 0 ? (
            <ul className="portal-documents-list">
              {documents.map((doc) => (
                <li key={doc.id} className="portal-documents-item">
                  <div className="portal-documents-copy">
                    <strong>{doc.label}</strong>
                    <span>
                      Uploaded {formatUploadDate(doc.created_at)}
                      {doc.size_bytes ? ` · ${formatFileSize(doc.size_bytes)}` : ""}
                    </span>
                  </div>
                  <div className="portal-documents-actions">
                    <button
                      type="button"
                      className="portal-panel-btn"
                      disabled={downloadingId === doc.id}
                      onClick={() => void handleDownload(doc)}
                    >
                      <Download size={14} aria-hidden="true" />
                      View
                    </button>
                    <button
                      type="button"
                      className="portal-panel-btn portal-documents-delete"
                      disabled={deletingId === doc.id}
                      onClick={() => void handleDelete(doc)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {deletingId === doc.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="portal-panel-note">No documents uploaded yet.</p>
          )}

          <form className="admin-form portal-profile-form" onSubmit={(event) => void handleUpload(event)}>
            <div className="portal-profile-form-grid">
              <label className="admin-field">
                <span>Document name</span>
                <input
                  type="text"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. AHIP certification"
                  autoComplete="off"
                />
              </label>

              <div className="admin-field">
                <span>File (PDF or image, up to 5 MB)</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="portal-profile-photo-input"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  className="portal-panel-btn portal-profile-photo-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp size={14} aria-hidden="true" />
                  {pendingFile ? `Selected: ${pendingFile.name}` : "Choose file"}
                </button>
              </div>
            </div>

            <div className="admin-form-actions">
              <button
                type="submit"
                className="admin-primary-btn"
                disabled={uploading || !pendingFile || !label.trim()}
              >
                {uploading ? "Uploading..." : "Upload document"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
