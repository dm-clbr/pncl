import { useEffect, useRef } from "react";
import SignatureAdoption from "./SignatureAdoption";
import type { AdoptedSignature } from "../../supabase/functions/_shared/signatureAdoption";

export default function SignatureAdoptionDialog({ name, onNameChange, onAdopt, onClose }: {
  name: string; onNameChange: (name: string) => void; onAdopt: (signature: AdoptedSignature) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className="signature-adoption-dialog" aria-labelledby="signature-adoption-title" onCancel={onClose}>
    <header><h2 id="signature-adoption-title">Adopt your signature</h2><button type="button" onClick={onClose} aria-label="Close signature editor">Close</button></header>
    <p>Choose how your signature will appear in the document. Adopting it previews it in the signature boxes; the final sign button saves your agreement.</p>
    <label className="signature-name-label">Full legal first and last name<input value={name} maxLength={120} autoComplete="name" onChange={event => onNameChange(event.target.value)} /></label>
    <SignatureAdoption name={name} onChange={signature => { if (signature) onAdopt(signature); }} />
    <button type="button" onClick={onClose}>Cancel</button>
  </dialog>;
}
