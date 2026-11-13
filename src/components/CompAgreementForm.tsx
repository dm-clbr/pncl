import SigningDocumentReview from "@/components/SigningDocumentReview";
import { validateIcaLegalName } from "../../supabase/functions/_shared/icaSigningRules";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, FileSignature } from "lucide-react";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import type { PortalCompAttachment, signPortalCompAttachment } from "@/lib/portal-comp-attachments";
import { toast } from "sonner";
import "@/styles/portal-comp.css";

export default function CompAgreementForm({
  attachment,
  defaultName,
  onSubmit,
  finishLabel = "Sign comp attachment",
}: {
  attachment: PortalCompAttachment;
  defaultName: string;
  onSubmit: (input: Parameters<typeof signPortalCompAttachment>[1]) => Promise<void>;
  finishLabel?: string;
}) {
  const [signatureName, setSignatureName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [reviewed, setReviewed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nameError = validateIcaLegalName(signatureName);
    if (nameError) {
      toast.error(nameError);
      return;
    }
    if (!agreed || !reviewed) {
      toast.error("Please confirm you agree to the compensation attachment.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        attachmentId: attachment.id,
        templateAssetId: attachment.templateAssetId,
        signatureName: signatureName.trim(),
        agreementAccepted: true,
        fieldValues,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign comp attachment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Pane title={attachment.title}>
      <p className="portal-panel-note">
        {attachment.assignedAt && <>Assigned {new Date(attachment.assignedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}. </>}
        Review the full document, then sign below.
      </p>

      <div className="portal-comp-signing-layout">
        <div className="portal-comp-signing-doc">
          {attachment.documentUrl ? (
            <SigningDocumentReview key={attachment.templateAssetId} url={attachment.documentUrl} title={attachment.title} onReviewed={setReviewed} values={fieldValues} onValuesChange={setFieldValues} signingName={signatureName} />
          ) : (
            <p className="ptools-error" role="alert">The document could not be loaded. Contact PNCL support.</p>
          )}
        </div>

        <aside className="portal-comp-signing-side" aria-label="Comp attachment signing">
          <form className="pcomp-form" onSubmit={(event) => void handleSubmit(event)}>
            <Field
              label="Type your legal name to sign"
              id={`comp-signature-${attachment.id}`}
              type="text"
              value={signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
              placeholder="Your legal first and last name"
              autoComplete="name"
              required
            />

            <label className="pcomp-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>
                I have reviewed the compensation attachment and agree to its terms. Typing my name
                above constitutes my electronic signature.
              </span>
            </label>

            {attachment.documentUrl && (
              <p className="portal-panel-note">
                <a
                  href={attachment.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ptools-cta"
                >
                  Open PDF in new tab
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </p>
            )}

            <div className="pcomp-actions">
              <button type="submit" className="ptools-cta" disabled={submitting || !reviewed || !agreed}>
                <FileSignature size={16} aria-hidden="true" />
                {submitting ? "Signing…" : finishLabel}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </Pane>
  );
}
