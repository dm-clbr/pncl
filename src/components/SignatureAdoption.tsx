import { useEffect, useRef, useState } from "react";
import IcaSignaturePad from "./IcaSignaturePad";
import { typedSignatureImage } from "@/lib/signature-image";
import { SIGNATURE_ADOPTION_CONSENT, SIGNATURE_ADOPTION_VERSION, type AdoptedSignature, type SignatureMethod } from "../../supabase/functions/_shared/signatureAdoption";
import "@/styles/signature-adoption.css";

export default function SignatureAdoption({ name, onChange, disabled = false, initialMethod = "typed" }: {
  name: string; onChange: (signature: AdoptedSignature | null) => void; disabled?: boolean; initialMethod?: SignatureMethod;
}) {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const [method, setMethod] = useState<SignatureMethod>(initialMethod);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [typed, setTyped] = useState<{ name: string; image: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const notify = useRef(onChange);
  useEffect(() => { notify.current = onChange; }, [onChange]);
  useEffect(() => {
    setConsent(false); setAdopted(false); notify.current(null);
    setTyped(null); setError("");
    if (method !== "typed" || !normalizedName) return;
    let active = true;
    void typedSignatureImage(normalizedName).then(image => { if (active) setTyped({ name: normalizedName, image }); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to load signature."); });
    return () => { active = false; };
  }, [normalizedName, method, attempt]);
  const image = method === "typed" ? typed?.name === normalizedName ? typed.image : null : drawn;
  const resetAdoption = () => { setConsent(false); setAdopted(false); notify.current(null); };
  const adopt = () => {
    if (!consent || !image || !normalizedName || disabled) return;
    setAdopted(true);
    notify.current({ method, name: normalizedName, accepted: true, version: SIGNATURE_ADOPTION_VERSION, imageDataUrl: image });
  };
  return <fieldset className="signature-adoption" disabled={disabled}>
    <legend>Your signature</legend>
    <div className="signature-methods" role="group" aria-label="Signature method">
      <button type="button" aria-pressed={method === "typed"} onClick={() => { setMethod("typed"); resetAdoption(); }}>Type signature</button>
      <button type="button" aria-pressed={method === "drawn"} onClick={() => { if (method !== "drawn") setDrawn(null); setMethod("drawn"); resetAdoption(); }}>Draw signature</button>
    </div>
    {method === "typed" ? <div className="signature-preview">{image ? <img src={image} alt={`Signature preview for ${normalizedName}`} /> : <p>{normalizedName ? error || "Loading signature…" : "Enter your full legal name to preview your signature."}</p>}</div> : <>
      <p>Write your full first and last name using your mouse, finger, or stylus.</p>
      <IcaSignaturePad onChange={value => { setDrawn(value); resetAdoption(); }} />
    </>}
    {error && method === "typed" && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry signature font</button>}
    <label className="signature-adoption-consent"><input type="checkbox" checked={consent} disabled={!image || !normalizedName || disabled} onChange={event => { setConsent(event.target.checked); setAdopted(false); notify.current(null); }} /><span>{SIGNATURE_ADOPTION_CONSENT}</span></label>
    <button type="button" className="signature-adopt-action" disabled={!image || !normalizedName || !consent || adopted || disabled} onClick={adopt}>{method === "typed" ? "Adopt signature" : "Save and use signature"}</button>
    {adopted && <p role="status">Signature adopted. Review the document and finish signing below.</p>}
  </fieldset>;
}
