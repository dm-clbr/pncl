import {
  extractW9FormValues,
  extractedToSubmitPayload,
  validateExtractedW9FormValues,
} from "@/lib/w9-acroform";
import { W9_CERTIFICATION_ITEMS } from "@/lib/w9-content";
import { toast } from "sonner";
import { useRef, useState } from "react";
import W9FillablePdfViewer, { type W9FillablePdfViewerHandle } from "@/components/W9FillablePdfViewer";
import type { SubmitPortalW9Payload } from "@/lib/portal-w9";

interface W9SigningStepProps {
  prefillLegalName?: string;
  eyebrow?: string;
  title?: string;
  lead?: string;
  finishLabel?: string;
  onSubmit: (payload: SubmitPortalW9Payload) => Promise<void>;
  onBack?: () => void;
  className?: string;
}

export default function W9SigningStep({
  prefillLegalName = "",
  eyebrow = "Tax form",
  title = "Complete your W-9",
  lead = "Fill in the highlighted fields on Form W-9 page 1, draw your signature, and confirm the certification. A signed PDF will be saved to your profile.",
  finishLabel = "Submit W-9 to PNCL",
  onSubmit,
  onBack,
  className = "",
}: W9SigningStepProps) {
  const viewerRef = useRef<W9FillablePdfViewerHandle>(null);
  const [certificationAccepted, setCertificationAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFinishSigning = async () => {
    if (!certificationAccepted) {
      toast.error("Please confirm the Part II certification.");
      return;
    }

    const pdfDocument = viewerRef.current?.getPdfDocument();
    const container = viewerRef.current?.getContainer();
    if (!pdfDocument || !container) {
      toast.error("The W-9 is still loading. Please wait a moment and try again.");
      return;
    }

    try {
      await viewerRef.current?.ensureFieldPagesRendered();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load W-9 fields.");
      return;
    }

    const signatureImage = viewerRef.current?.getSignatureImage() ?? "";

    let extracted;
    try {
      extracted = await extractW9FormValues(pdfDocument, container, signatureImage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read form fields.");
      return;
    }

    const validationError = validateExtractedW9FormValues(extracted, signatureImage, certificationAccepted);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(extractedToSubmitPayload(extracted, signatureImage, certificationAccepted));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit W-9.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`onboarding-step onboarding-contract-step ica-flow ica-flow-fillable ${className}`.trim()}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="h3">{title}</h2>
      <p className="lead">{lead}</p>

      <div className="ica-signing-layout-fillable">
        <div className="ica-signing-doc-fillable">
          <W9FillablePdfViewer
            ref={viewerRef}
            className="onboarding-contract-fillable"
            prefillLegalName={prefillLegalName}
          />
        </div>

        <aside className="ica-signing-side-panel" aria-label="W-9 certification">
          <div className="ica-signing-acknowledgments">
            <p className="portal-w9-field-note">Under penalties of perjury, I certify that:</p>
            <ol className="portal-w9-cert-list">
              {W9_CERTIFICATION_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <label className="admin-field admin-field-checkbox">
              <input
                type="checkbox"
                checked={certificationAccepted}
                onChange={(event) => setCertificationAccepted(event.target.checked)}
              />
              <span>I certify that the information on this W-9 is correct.</span>
            </label>
          </div>

          <p className="portal-w9-security-note">
            Your tax ID is encrypted and stored securely. PNCL uses this information to file required IRS
            information returns such as Form 1099-NEC.
          </p>

          <div className="onboarding-actions ica-signing-side-actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={handleFinishSigning}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : <>{finishLabel} <span className="arr">→</span></>}
            </button>
          </div>

          {onBack && (
            <button type="button" className="onboarding-back ica-signing-side-back" onClick={onBack}>
              ← Back
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
