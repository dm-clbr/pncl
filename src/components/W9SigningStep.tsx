import {
  extractW9FormValues,
  extractedToSubmitPayload,
  validateExtractedW9FormValues,
} from "@/lib/w9-acroform";
import { W9_CERTIFICATION_ITEMS } from "@/lib/w9-content";
import { W9_PDF_PAGES } from "@/lib/w9-form";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";
import W9FillablePdfViewer, { type W9FillablePdfViewerHandle } from "@/components/W9FillablePdfViewer";
import Sheet from "@/components/portal/Sheet";
// The .pforms-* chrome is owned by this step, so it travels with it: the public
// onboarding flow and the admin preview render it outside the portal pages.
import "@/styles/portal-forms.css";
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
  lead = "Fill in the highlighted fields on Form W-9 page 1 and confirm the Part II certification. A completed PDF will be saved to your profile.",
  finishLabel = "Submit W-9 to PNCL",
  onSubmit,
  onBack,
  className = "",
}: W9SigningStepProps) {
  const viewerRef = useRef<W9FillablePdfViewerHandle>(null);
  const [certificationAccepted, setCertificationAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [reachedFormPage, setReachedFormPage] = useState(false);

  // Same gate as the ICA, on the W-9's last *field* page rather than its last
  // page: pages 2 to 6 are IRS instructions and every field is on page 1, so
  // gating on page 6 would put five Next taps between the agent and the only
  // submit. Unlocks once and stays unlocked.
  const handlePageChange = useCallback((page: number) => {
    if (page >= W9_PDF_PAGES.form) setReachedFormPage(true);
  }, []);

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

    let extracted;
    try {
      extracted = await extractW9FormValues(pdfDocument, container);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read form fields.");
      return;
    }

    const validationError = validateExtractedW9FormValues(extracted, certificationAccepted);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(extractedToSubmitPayload(extracted, certificationAccepted));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit W-9.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`onboarding-step onboarding-contract-step ica-flow ica-flow-fillable pforms ${className}`.trim()}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="h3">{title}</h2>
      <p className="lead">{lead}</p>

      <W9FillablePdfViewer
        ref={viewerRef}
        prefillLegalName={prefillLegalName}
        onPageChange={handlePageChange}
        actions={
          <>
            {onBack && (
              <button type="button" className="pforms-action pforms-action-quiet" onClick={onBack}>
                Back
              </button>
            )}
            {reachedFormPage && (
              <button
                type="button"
                className="pforms-action"
                onClick={() => setSignOpen(true)}
                disabled={submitting}
              >
                {submitting ? "Submitting\u2026" : "Sign"}
              </button>
            )}
          </>
        }
      />

      <Sheet open={signOpen} onClose={() => setSignOpen(false)} title="Certify your W-9">
        <p className="pforms-sheet-note">Under penalties of perjury, I certify that:</p>
        <ol className="pforms-cert-list">
          {W9_CERTIFICATION_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>

        <div className="pforms-acks">
          <label className="pforms-ack">
            <input
              type="checkbox"
              checked={certificationAccepted}
              onChange={(event) => setCertificationAccepted(event.target.checked)}
            />
            <span>I certify that the information on this W-9 is correct.</span>
          </label>
        </div>

        <p className="pforms-sheet-fine">
          Your tax ID is encrypted and stored securely. PNCL uses this information to file required
          IRS information returns such as Form 1099-NEC.
        </p>

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
          {submitting ? "Submitting\u2026" : finishLabel}
        </button>
      </Sheet>
    </div>
  );
}
