import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import Skeleton from "@/components/portal/Skeleton";
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
    <Pane
      title="My documents"
      aside={
        !loading && documents.length > 0 ? <Chip>{documents.length} uploaded</Chip> : undefined
      }
    >
      <p className="portal-profile-lede">
        Upload anything else PNCL asks for, such as a certification or carrier paperwork. Admins
        can see what you add here.
      </p>

      {loading ? (
        <div className="portal-profile-rows" aria-busy="true">
          <span className="portal-sr">Loading documents...</span>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : (
        <>
          {documents.length > 0 ? (
            <ul className="portal-profile-rows">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <ListRow
                    label={doc.label}
                    secondary={`Uploaded ${formatUploadDate(doc.created_at)}${
                      doc.size_bytes ? ` · ${formatFileSize(doc.size_bytes)}` : ""
                    }`}
                    trailing={
                      <>
                        <button
                          type="button"
                          className="portal-profile-iconbtn"
                          disabled={downloadingId === doc.id}
                          onClick={() => void handleDownload(doc)}
                          aria-label={
                            downloadingId === doc.id
                              ? `Opening ${doc.label}`
                              : `View ${doc.label}`
                          }
                        >
                          <Download size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="portal-profile-iconbtn"
                          disabled={deletingId === doc.id}
                          onClick={() => void handleDelete(doc)}
                          aria-label={
                            deletingId === doc.id
                              ? `Deleting ${doc.label}`
                              : `Delete ${doc.label}`
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileUp size={22} aria-hidden="true" />}
              title="Nothing uploaded yet"
              body="What you add stays on your profile for PNCL admins."
            />
          )}

          <form className="portal-profile-form" onSubmit={(event) => void handleUpload(event)}>
            <Field
              label="Document name"
              id="profile-document-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. AHIP certification"
              autoComplete="off"
            />

            {/* ponytail: the file input covers the zone at zero opacity, so the
                browser's own drop target and picker do the work and no drag
                handlers are needed. */}
            <label className="portal-dropzone">
              <span className="portal-dropzone-icon" aria-hidden="true">
                <FileUp size={22} strokeWidth={1.5} />
              </span>
              <span className="portal-dropzone-copy">
                <strong>Add a file</strong>
                <span>Drop a file here or tap to browse. PDF or image, up to 5 MB.</span>
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="portal-dropzone-input"
                onChange={handleFileChange}
              />
            </label>

            {pendingFile && (
              <div className="portal-dropzone-files">
                <Chip variant="pdf">{pendingFile.name}</Chip>
              </div>
            )}

            <button
              type="submit"
              className="portal-profile-btn"
              disabled={uploading || !pendingFile || !label.trim()}
            >
              {uploading ? "Uploading..." : "Upload document"}
            </button>
          </form>
        </>
      )}
    </Pane>
  );
}
