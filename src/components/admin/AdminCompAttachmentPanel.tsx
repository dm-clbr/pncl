import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import {
  deleteCompAttachment,
  listCompAttachments,
  type AdminCompAttachment,
} from "@/lib/admin-api";
import { toast } from "sonner";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminCompAttachmentPanel({
  userId,
  userName,
  accessToken,
  onChanged,
}: {
  userId: string;
  userName: string;
  accessToken: string;
  onChanged?: () => void;
}) {
  const [attachments, setAttachments] = useState<AdminCompAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  const loadAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listCompAttachments(accessToken, userId);
      setAttachments(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to load comp attachments");
    } finally {
      setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    void loadAttachments();
  }, [loadAttachments]);

  const handleDelete = async (attachment: AdminCompAttachment) => {
    if (!window.confirm(`Remove the pending "${attachment.title}" for ${userName}?`)) {
      return;
    }

    setDeletingId(attachment.id);
    try {
      const result = await deleteCompAttachment(accessToken, attachment.id);
      toast.success(result.message);
      await loadAttachments();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to remove comp attachment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-comp-attachment-panel">
      <p className="admin-inline-note">Onboarding signing documents are managed in Onboarding Steps. Previously signed copies stay on file.</p>
      <div className="admin-row-actions"><Link className="admin-secondary-link" to="/portal/admin/onboarding-steps">Manage onboarding templates</Link><Link className="admin-secondary-link" to="/portal/admin/onboarding-steps/documents">Send a private agreement</Link></div>
      <div className="admin-genesis-details-documents">
        <h4>Assigned documents</h4>
        {loading ? (
          <div className="onboarding-spinner admin-spinner" aria-label="Loading attachments" />
        ) : attachments.length === 0 ? (
          <p className="admin-empty">No comp attachment assigned yet.</p>
        ) : (
          <ul className="admin-user-todo-list">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="admin-user-todo-item">
                <div>
                  <strong>{attachment.title}</strong>
                  <p className="admin-inline-note">
                    {attachment.status === "signed"
                      ? `Signed ${formatDate(attachment.signedAt)} by ${attachment.signatureName ?? "agent"}`
                      : `Assigned ${formatDate(attachment.assignedAt)} — awaiting agent signature`}
                  </p>
                </div>
                <div className="admin-row-actions">
                  {attachment.unsignedUrl && (
                    <a
                      href={attachment.unsignedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-secondary-link"
                    >
                      Original PDF
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {attachment.signedUrl && (
                    <a
                      href={attachment.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-secondary-link"
                    >
                      Agent-signed copy
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  )}
                  {attachment.status === "pending" && (
                    <button
                      type="button"
                      className="admin-icon-btn"
                      disabled={deletingId === attachment.id}
                      onClick={() => void handleDelete(attachment)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {deletingId === attachment.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
