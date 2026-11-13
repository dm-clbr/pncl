import { useState } from "react";
import SigningDocumentReview from "@/components/SigningDocumentReview";

const ignoreReview = () => {};

/** Render PDFs inside the app rather than relying on a browser PDF plugin. */
export default function AgreementPdfPreview({ url, title, collapsible = false }: {
  url: string; title: string; collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const document = <SigningDocumentReview url={url} title={title} readOnly onReviewed={ignoreReview} />;
  return collapsible ? <details className="ica-agreement-preview" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>View agreement on file</summary>
    {open && document}
  </details> : document;
}
