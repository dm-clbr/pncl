import type { DebitCheckInitials } from "@/lib/onboarding-contract";
import {
  extractIcaFormValues,
  validateExtractedIcaFormValues,
} from "@/lib/ica-acroform";
import { toast } from "sonner";
import { useRef, useState } from "react";
import IcaFillablePdfViewer, {
  type IcaFillablePdfViewerHandle,
} from "@/components/IcaFillablePdfViewer";

export interface IcaSigningSubmitPayload {
  legalName: string;
  personalEmail: string;
  signatureName: string;
  signatureImageBase64: string;
  debitCheckInitials: DebitCheckInitials;
  agreementAccepted: boolean;
  counselAcknowledged: boolean;
}

interface IcaSigningStepProps {
  prefillLegalName?: string;
  prefillEmail?: string;
  eyebrow?: string;
  title?: string;
  lead?: string;
  finishLabel?: string;
  onSubmit: (payload: IcaSigningSubmitPayload) => Promise<void>;
  onBack?: () => void;
  className?: string;
}

export default function IcaSigningStep({
  prefillLegalName = "",
  prefillEmail = "",
  eyebrow = "Agreement",
  title = "Review and sign your agreement",
  lead = "Read the agreement one page at a time and complete the highlighted fields on the Introduction, Signature, and Debit-Check pages. Amber callouts mark each required line — click a callout to jump to that field, or use the section shortcuts above the document.",
  finishLabel = "Finish signing",
  onSubmit,
  onBack,
  className = "",
}: IcaSigningStepProps) {
  const viewerRef = useRef<IcaFillablePdfViewerHandle>(null);
  const [counselAcknowledged, setCounselAcknowledged] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFinishSigning = async () => {
    if (!counselAcknowledged || !agreementAccepted) {
      toast.error("Please confirm both acknowledgments in the signing panel.");
      return;
    }

    const pdfDocument = viewerRef.current?.getPdfDocument();
    const container = viewerRef.current?.getContainer();
    if (!pdfDocument || !container) {
      toast.error("The agreement is still loading. Please wait a moment and try again.");
      return;
    }

    try {
      await viewerRef.current?.ensureFieldPagesRendered();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load agreement fields.");
      return;
    }

    let extracted;
    try {
      const signatureImage = viewerRef.current?.getSignatureImage();
      extracted = await extractIcaFormValues(pdfDocument, container, signatureImage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read form fields.");
      return;
    }

    const validationError = validateExtractedIcaFormValues(
      extracted,
      viewerRef.current?.getSignatureImage(),
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        legalName: extracted.legalName.trim(),
        personalEmail: extracted.personalEmail.trim(),
        signatureName: extracted.signatureName.trim(),
        signatureImageBase64: viewerRef.current?.getSignatureImage() ?? "",
        debitCheckInitials: extracted.debitCheckInitials,
        agreementAccepted,
        counselAcknowledged,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign the agreement.");
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
          <IcaFillablePdfViewer
            ref={viewerRef}
            className="onboarding-contract-fillable"
            prefillLegalName={prefillLegalName}
            prefillEmail={prefillEmail}
          />
        </div>

        <aside className="ica-signing-side-panel" aria-label="Agreement signing">
          <div className="ica-signing-acknowledgments">
            <label className="admin-field admin-field-checkbox">
              <input
                type="checkbox"
                checked={counselAcknowledged}
                onChange={(event) => setCounselAcknowledged(event.target.checked)}
              />
              <span>
                I have read this agreement, understand it, and had the opportunity to consult
                independent legal counsel (or I voluntarily waive that right).
              </span>
            </label>
            <label className="admin-field admin-field-checkbox">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(event) => setAgreementAccepted(event.target.checked)}
              />
              <span>
                I agree to the Independent Contractor Agreement and Debit-Check Authorization.
              </span>
            </label>
          </div>

          <div className="onboarding-actions ica-signing-side-actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={handleFinishSigning}
              disabled={submitting}
            >
              {submitting ? "Finishing…" : <>{finishLabel} <span className="arr">→</span></>}
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
