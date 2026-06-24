import { ArrowUpRight, Download } from "lucide-react";
import type { AdminUserDocument } from "@/lib/admin-api";

function formatDocumentDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminUserDocumentsList({
  documents,
  emptyLabel = "No documents saved to this profile yet.",
}: {
  documents: AdminUserDocument[];
  emptyLabel?: string;
}) {
  if (documents.length === 0) {
    return <p className="admin-empty">{emptyLabel}</p>;
  }

  return (
    <div className="admin-user-documents">
      {documents.map((document) => (
        <div key={document.id} className="admin-user-document-item">
          <div>
            <strong>{document.label}</strong>
            <p className="admin-inline-note">
              {document.signedAt
                ? `Submitted ${formatDocumentDate(document.signedAt)}`
                : document.fileName}
            </p>
          </div>
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
      ))}
    </div>
  );
}
