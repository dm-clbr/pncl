import { ArchiveRestore, ArrowUpRight, Download } from "lucide-react";
import type { AdminResetDocumentType, AdminUserDocument } from "@/lib/admin-api";

function formatDocumentDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Maps active (non-archived) document list entries to a resettable type. */
const RESET_TYPE_BY_DOCUMENT_ID: Record<string, { type: AdminResetDocumentType; actionLabel: string }> = {
  w9: { type: "w9", actionLabel: "Archive & request new W-9" },
  "direct-deposit": { type: "direct_deposit", actionLabel: "Archive & request new form" },
  ica: { type: "ica", actionLabel: "Archive & request re-sign" },
};

export default function AdminUserDocumentsList({
  documents,
  emptyLabel = "No documents saved to this profile yet.",
  onResetDocument,
  resettingDocumentType = null,
}: {
  documents: AdminUserDocument[];
  emptyLabel?: string;
  onResetDocument?: (documentType: AdminResetDocumentType) => void;
  resettingDocumentType?: AdminResetDocumentType | null;
}) {
  if (documents.length === 0) {
    return <p className="admin-empty">{emptyLabel}</p>;
  }

  return (
    <div className="admin-user-documents">
      {documents.map((document) => {
        const reset = RESET_TYPE_BY_DOCUMENT_ID[document.id];
        const resetting = Boolean(reset && resettingDocumentType === reset.type);
        return (
          <div key={document.id} className="admin-user-document-item">
            <div>
              <strong>{document.label}</strong>
              <p className="admin-inline-note">
                {document.signedAt
                  ? `Submitted ${formatDocumentDate(document.signedAt)}`
                  : document.fileName}
              </p>
            </div>
            <div className="admin-user-document-actions">
              {reset && onResetDocument && (
                <button
                  type="button"
                  className="admin-icon-btn"
                  disabled={resettingDocumentType !== null}
                  onClick={() => onResetDocument(reset.type)}
                >
                  <ArchiveRestore size={16} aria-hidden="true" />
                  {resetting ? "Resetting…" : reset.actionLabel}
                </button>
              )}
              <a
                href={document.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-icon-btn"
              >
                <Download size={16} aria-hidden="true" />
                Download PDF
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
