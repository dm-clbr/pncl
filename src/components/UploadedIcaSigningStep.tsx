import IcaSigningStep from "./IcaSigningStep";
import { useState } from "react";
import SigningDocumentReview from "./SigningDocumentReview";
import "@/lib/pdfjs-setup";
import IcaSigningGuidance from "@/components/IcaSigningGuidance";
import { validateIcaLegalName, normalizeIcaLegalName } from "../../supabase/functions/_shared/icaSigningRules";
import { validateRecoveryEmail } from "@/lib/recovery-email";
import SignatureAdoptionDialog from "@/components/SignatureAdoptionDialog";
import "@/styles/signature-adoption.css";
import type { AdoptedSignature } from "../../supabase/functions/_shared/signatureAdoption";
import type { IcaSigningStepProps } from "@/components/IcaSigningStep";
import type { OnboardingAsset } from "@/lib/onboarding-content";
import { toast } from "sonner";

function SignatureRecordIcaStep({ asset, prefillLegalName = "", prefillEmail = "", onSubmit, onBack, finishLabel = "Sign agreement", className = "" }: Omit<IcaSigningStepProps, "pdfUrl"> & { asset: OnboardingAsset }) {
  const [readAll, setReadAll] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [legalName, setLegalName] = useState(prefillLegalName);
  const [email, setEmail] = useState(prefillEmail);
  const [signature, setSignature] = useState<AdoptedSignature | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [counsel, setCounsel] = useState(false);
  const [signatureEditorOpen, setSignatureEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!readAll || !accepted || !counsel || !signature || !legalName.trim() || !email.trim()) return;
    const validationError = validateIcaLegalName(legalName) || validateRecoveryEmail(email);
    if (validationError) { toast.error(validationError); return; }
    const { imageDataUrl, ...signatureAdoption } = signature;
    setBusy(true);
    try { await onSubmit({ legalName: normalizeIcaLegalName(legalName), personalEmail: email.trim(), signatureName: normalizeIcaLegalName(legalName), signatureImageBase64: imageDataUrl, signatureAdoption,
      debitCheckInitials: { a: "", b: "", c: "", d: "", e: "" }, agreementAccepted: true, counselAcknowledged: true, templateAssetId: asset.id, fieldValues }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Unable to sign agreement."); }
    finally { setBusy(false); }
  };
  return <div className={`onboarding-step uploaded-ica ${className}`}>
    <span className="eyebrow">Independent Contractor Agreement</span><h2 className="h3">Review and sign your agreement</h2>
    <p className="lead">Read every page, then sign below. Your signature record will be attached to this document and a signed copy saved to your profile.</p>
    <IcaSigningGuidance legalName={legalName} includeInitials={false} />
    <SigningDocumentReview url={asset.url} title="Agreement" onReviewed={setReadAll} values={fieldValues} onValuesChange={setFieldValues} signingName={legalName} signatureImage={signature?.imageDataUrl} onSignatureClick={busy ? undefined : () => setSignatureEditorOpen(true)} />
    <form onSubmit={(event) => void sign(event)} className="uploaded-ica-form">
      <label className="onboarding-field">Full legal first and last name<input required maxLength={200} value={legalName} onChange={(event) => { setLegalName(event.target.value); setSignature(null); }} autoComplete="name" /></label>
      <label className="onboarding-field">Personal email<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <p className="onboarding-help-text">Use a personal email you will keep access to, not your PNCL email.</p>
      <div className="adopted-signature-summary">{signature && <img src={signature.imageDataUrl} alt="Adopted signature" />}<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setSignatureEditorOpen(true)}>{signature ? "Change signature" : "Create signature"}</button></div>
      {signatureEditorOpen && <SignatureAdoptionDialog name={legalName} onNameChange={name => { setLegalName(name); setSignature(null); }} onAdopt={value => { setSignature(value); setSignatureEditorOpen(false); }} onClose={() => setSignatureEditorOpen(false)} />}
      <label className="uploaded-ica-ack"><input type="checkbox" checked={counsel} onChange={(event) => setCounsel(event.target.checked)} />I have read this agreement and had the opportunity to consult independent legal counsel.</label>
      <label className="uploaded-ica-ack"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I agree to this Independent Contractor Agreement and consent to sign electronically.</label>
      {!readAll && <p className="onboarding-help-text">View all pages to enable signing.</p>}
      <div className="onboarding-actions">{onBack && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>Back</button>}
        <button className="btn btn-accent" type="submit" disabled={busy || !readAll || !signature || !accepted || !counsel || !legalName.trim() || !email.trim()}>{busy ? "Signing…" : finishLabel}</button></div>
    </form>
  </div>;
}

export default function UploadedIcaSigningStep(props: Parameters<typeof SignatureRecordIcaStep>[0]) {
  if (props.asset.signing_mode === "ica_fields") return <IcaSigningStep {...props} pdfUrl={props.asset.url} onSubmit={payload => props.onSubmit({ ...payload, templateAssetId: props.asset.id })} />;
  return <SignatureRecordIcaStep {...props} />;
}
