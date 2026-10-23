import { useEffect, useRef, useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@/lib/pdfjs-setup";
import IcaSignaturePad from "@/components/IcaSignaturePad";
import type { IcaSigningStepProps } from "@/components/IcaSigningStep";
import type { OnboardingAsset } from "@/lib/onboarding-content";
import { toast } from "sonner";

export default function UploadedIcaSigningStep({ asset, prefillLegalName = "", prefillEmail = "", onSubmit, onBack, finishLabel = "Sign agreement", className = "" }: IcaSigningStepProps & { asset: OnboardingAsset }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(640);
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [legalName, setLegalName] = useState(prefillLegalName);
  const [email, setEmail] = useState(prefillEmail);
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [counsel, setCounsel] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPdf(null); setError(null); setPage(1); setVisited(new Set());
    const task = getDocument({ url: asset.url, isEvalSupported: false });
    task.promise.then((document) => { if (!cancelled) setPdf(document); })
      .catch(() => { if (!cancelled) setError("Unable to load the agreement. Retry before signing."); });
    return () => { cancelled = true; void task.destroy(); };
  }, [asset.url, retry]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setRendering(true);
    pdf.getPage(page).then(async (pdfPage) => {
      if (cancelled || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: width / pdfPage.getViewport({ scale: 1 }).width });
      const target = canvas.current;
      target.width = viewport.width; target.height = viewport.height;
      const context = target.getContext("2d");
      if (!context) throw new Error("Unable to display PDF.");
      task = pdfPage.render({ canvasContext: context, viewport });
      await task.promise;
      if (!cancelled) { setVisited((previous) => new Set([...previous, page])); setRendering(false); }
    }).catch((err) => { if (!cancelled && err?.name !== "RenderingCancelledException") { setError("Unable to display the agreement. Retry before signing."); setRendering(false); } });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, page, width]);
  const readAll = Boolean(pdf && visited.size === pdf.numPages && !error);
  const sign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!readAll || !accepted || !counsel || !signature || !legalName.trim() || !email.trim()) return;
    setBusy(true);
    try { await onSubmit({ legalName: legalName.trim(), personalEmail: email.trim(), signatureName: legalName.trim(), signatureImageBase64: signature,
      debitCheckInitials: { a: "", b: "", c: "", d: "", e: "" }, agreementAccepted: true, counselAcknowledged: true, templateAssetId: asset.id }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Unable to sign agreement."); }
    finally { setBusy(false); }
  };
  return <div className={`onboarding-step uploaded-ica ${className}`}>
    <span className="eyebrow">Independent Contractor Agreement</span><h2 className="h3">Review and sign your agreement</h2>
    <p className="lead">Read every page, then sign below. Your signature record will be attached to this document and a signed copy saved to your profile.</p>
    <a href={asset.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Open original PDF</a>
    <div ref={holder} className="uploaded-ica-document"><canvas ref={canvas} aria-label={`Agreement page ${page}`} /></div>
    {error ? <p role="alert">{error} <button className="btn btn-ghost" onClick={() => setRetry((value) => value + 1)}>Retry agreement</button></p> : <>
      {!pdf && <p role="status">Loading agreement…</p>}
      {pdf && <div className="uploaded-ica-pager"><button type="button" className="btn btn-ghost" disabled={page <= 1 || rendering} onClick={() => setPage(page - 1)}>Previous page</button>
        <span>Page {page} of {pdf.numPages}</span><button type="button" className="btn btn-ghost" disabled={page >= pdf.numPages || rendering} onClick={() => setPage(page + 1)}>Next page</button></div>}
    </>}
    <form onSubmit={(event) => void sign(event)} className="uploaded-ica-form">
      <label className="onboarding-field">Legal name<input required maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} autoComplete="name" /></label>
      <label className="onboarding-field">Personal email<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <p className="onboarding-help-text">Use a personal email you will keep access to, not your PNCL email.</p>
      <IcaSignaturePad onChange={setSignature} />
      <label className="uploaded-ica-ack"><input type="checkbox" checked={counsel} onChange={(event) => setCounsel(event.target.checked)} />I have read this agreement and had the opportunity to consult independent legal counsel.</label>
      <label className="uploaded-ica-ack"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I agree to this Independent Contractor Agreement and consent to sign electronically.</label>
      {!readAll && <p className="onboarding-help-text">View all pages to enable signing.</p>}
      <div className="onboarding-actions">{onBack && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>Back</button>}
        <button className="btn btn-accent" type="submit" disabled={busy || !readAll || !signature || !accepted || !counsel || !legalName.trim() || !email.trim()}>{busy ? "Signing…" : finishLabel}</button></div>
    </form>
  </div>;
}
