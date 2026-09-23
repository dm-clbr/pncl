import { ICA_TOTAL_PAGES, type DebitCheckInitials } from "@/lib/onboarding-contract";
import {
  extractIcaFormValues,
  validateExtractedIcaFormValues,
} from "@/lib/ica-acroform";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";
import IcaFillablePdfViewer, {
  type IcaFillablePdfViewerHandle,
} from "@/components/IcaFillablePdfViewer";
import Sheet from "@/components/portal/Sheet";

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
  lead = "Read the agreement one page at a time and complete the highlighted fields on the Introduction, Signature, and Debit-Check pages. Amber callouts mark each required line. Click a callout to jump to that field, or use the section shortcuts above the document.",
  finishLabel = "Finish signing",
  onSubmit,
  onBack,
  className = "",
}: IcaSigningStepProps) {
  const viewerRef = useRef<IcaFillablePdfViewerHandle>(null);
  const [counselAcknowledged, setCounselAcknowledged] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  // The signing sheet unlocks once the last page has been read, and stays
  // unlocked: paging back to re-read a clause must not take it away again.
  const handlePageChange = useCallback((page: number) => {
    if (page >= ICA_TOTAL_PAGES) setReachedEnd(true);
  }, []);

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
    <div className={`onboarding-step onboarding-contract-step ica-flow ica-flow-fillable pforms ${className}`.trim()}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="h3">{title}</h2>
      <p className="lead">{lead}</p>

      <IcaFillablePdfViewer
        ref={viewerRef}
        prefillLegalName={prefillLegalName}
        prefillEmail={prefillEmail}
        onPageChange={handlePageChange}
        actions={
          <>
            {onBack && (
              <button type="button" className="pforms-action pforms-action-quiet" onClick={onBack}>
                Back
              </button>
            )}
            {reachedEnd && (
              <button
                type="button"
                className="pforms-action"
                onClick={() => setSignOpen(true)}
                disabled={submitting}
              >
                {submitting ? "Signing\u2026" : "Sign"}
              </button>
            )}
          </>
        }
      />

      <Sheet open={signOpen} onClose={() => setSignOpen(false)} title="Sign your agreement">
        <p className="pforms-sheet-note">
          <strong>Email is required.</strong> The address you enter on the signature page becomes
          your account recovery email and is where PNCL delivers your electronic 1099. Use a
          personal address you will keep access to, not your @thepncl.com address.
        </p>

        <div className="pforms-acks">
          <label className="pforms-ack">
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
          <label className="pforms-ack">
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

        <button
          type="button"
          className="pforms-submit"
          disabled={submitting}
          onClick={() => {
            // ponytail: the sheet is a modal <dialog> in the top layer and a
            // toast cannot paint over it, so it closes before the unchanged
            // handler runs and every validation message stays readable. The
            // pager's Sign button carries the busy state from here on.
            setSignOpen(false);
            void handleFinishSigning();
          }}
        >
          {submitting ? "Finishing\u2026" : finishLabel}
        </button>
      </Sheet>
    </div>
  );
}
