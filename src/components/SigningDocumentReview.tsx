import { useEffect, useRef, useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@/lib/pdfjs-setup";
import { signingDocumentError } from "@/lib/signing-document-error";
import { signerFieldRole } from "@/lib/signing-fields";
import "@/styles/signing-document-review.css";
import { customPdfFieldType, type PdfFieldValues } from "../../supabase/functions/_shared/pdfFieldRules";
type InputAnnotation = { fieldName: string; fieldType: string; fieldValue?: string | boolean; alternativeText?: string; readOnly?: boolean; required?: boolean; checkBox?: boolean; rect: number[]; };
type PageInput = InputAnnotation & { left: number; top: number; width: number; height: number };
const EMPTY_VALUES: PdfFieldValues = {};
type Signer = { name: string; email?: string; onNameChange: (value: string) => void; onEmailChange?: (value: string) => void };
type FieldLocation = InputAnnotation & { page: number };
type ReviewProps = {
  readOnly?: boolean; url: string; sourceId?: string; title: string; onReviewed: (ready: boolean) => void;
  values?: PdfFieldValues; onValuesChange?: (values: PdfFieldValues) => void; signingName?: string;
  signatureImage?: string; onSignatureClick?: () => void; signer?: Signer;
};

/** Signing requires a loaded document and completed fields, without tracking page visits. */
export default function SigningDocumentReview({ url, sourceId, title, onReviewed, values = EMPTY_VALUES, onValuesChange, signingName = "", signatureImage, onSignatureClick, readOnly = false, signer }: ReviewProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState<ReturnType<typeof signingDocumentError> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [width, setWidth] = useState(600);
  const [inputs, setInputs] = useState<PageInput[]>([]);
  const [fieldLocations, setFieldLocations] = useState<FieldLocation[]>([]);
  const [fieldsReady, setFieldsReady] = useState(false);
  const [indexingFields, setIndexingFields] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<FieldLocation | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const needsFieldIndex = !readOnly && Boolean(onValuesChange || onSignatureClick);
  const signerName = signer?.name;
  const signerEmail = signer?.email;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setPdf(null); setPage(1); setError(""); setDiagnostic(null); setBusy(true); setInputs([]); setFieldLocations([]); setFieldsReady(false); setJumpTarget(null);
    // Retry using a complete download if streaming/range requests failed.
    const task = getDocument({ url, verbosity: 0, disableRange: attempt > 0, disableStream: attempt > 0 });
    task.promise.then(doc => { if (active) setPdf(doc); }).catch(error => {
      if (!active) return;
      const detail = signingDocumentError(error, "load", sourceId);
      console.error("[Signing document]", detail);
      setDiagnostic(detail); setBusy(false);
      setError("Unable to load the signing document. Retry before signing. If this continues, refresh the page and share the support details with PNCL.");
    });
    return () => { active = false; void task.destroy(); };
  }, [url, sourceId, attempt]);
  useEffect(() => {
    if (!pdf || !needsFieldIndex) return;
    let active = true;
    setIndexingFields(true);
    setFieldsReady(false);
    // Required fields are checked across the document without rendering or
    // requiring the signer to visit each page.
    void Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const source = await pdf.getPage(index + 1);
      const annotations: InputAnnotation[] = source.getAnnotations ? await source.getAnnotations() : [];
      return annotations.filter(field => field.fieldName && (field.fieldType === "Tx" || field.checkBox))
        .map(field => ({ ...field, page: index + 1 }));
    })).then(pages => { if (active) { setFieldLocations(pages.flat()); setFieldsReady(true); } })
      .catch(error => {
        if (!active) return;
        const detail = signingDocumentError(error, "load", sourceId);
        console.error("[Signing document]", detail);
        setDiagnostic(detail);
        setError("Unable to load the signing document fields. Retry before signing. If this continues, share the support details with PNCL.");
      })
      .finally(() => { if (active) setIndexingFields(false); });
    return () => { active = false; };
    // Callback identity can change while typing; index only when the PDF changes.
  }, [pdf, needsFieldIndex, sourceId]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setBusy(true);
    void pdf.getPage(page).then(async source => {
      if (!active || !canvas.current) return;
      const viewport = source.getViewport({ scale: width / source.getViewport({ scale: 1 }).width });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      const annotations = source.getAnnotations ? await source.getAnnotations() : [];
      if (!active) return;
      const pageInputs = annotations.filter((annotation: InputAnnotation) => annotation.fieldName && (annotation.fieldType === "Tx" || annotation.checkBox)).map((annotation: InputAnnotation): PageInput => {
        const rect = viewport.convertToViewportRectangle(annotation.rect);
        return { ...annotation, left: Math.min(rect[0], rect[2]) / viewport.width, top: Math.min(rect[1], rect[3]) / viewport.height, width: Math.abs(rect[2] - rect[0]) / viewport.width, height: Math.abs(rect[3] - rect[1]) / viewport.height };
      });
      task = source.render({ canvasContext: context, viewport, annotationMode: onValuesChange ? 0 : 1 });
      await task.promise;
      if (active) { setInputs(pageInputs); setBusy(false); }
    }).catch(error => {
      if (!active || error?.name === "RenderingCancelledException") return;
      const detail = signingDocumentError(error, "render", sourceId, page);
      console.error("[Signing document]", detail);
      setDiagnostic(detail); setBusy(false); setError("Unable to display this page. Retry before signing. If this continues, share the support details with PNCL.");
    });
    return () => { active = false; task?.cancel(); };
  }, [pdf, page, width, onValuesChange, sourceId]);
  useEffect(() => {
    if (!jumpTarget || busy || page !== jumpTarget.page) return;
    const element = [...(holder.current?.querySelectorAll<HTMLElement>("[data-signing-field]") ?? [])]
      .find(node => node.dataset.signingField === jumpTarget.fieldName);
    if (!element) return;
    element.scrollIntoView?.({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
    setJumpTarget(null);
  }, [jumpTarget, busy, page, inputs]);
  // The PDF fields and signature overlay share one signer identity.
  useEffect(() => {
    if (!onValuesChange) return;
    const signerValues = { name: signerName, email: signerEmail };
    const next = { ...values };
    let changed = false;
    for (const field of fieldLocations) {
      const role = signerFieldRole(field);
      if (role && signerValues[role] !== undefined && next[field.fieldName] !== signerValues[role]) {
        next[field.fieldName] = signerValues[role]!; changed = true;
      }
    }
    if (changed) onValuesChange(next);
  }, [fieldLocations, signerName, signerEmail, onValuesChange, values]);
  const fieldValue = (field: InputAnnotation) => {
    const role = signerFieldRole(field);
    return role && signer?.[role] !== undefined ? signer[role] : values[field.fieldName] ?? field.fieldValue;
  };
  const jumpTo = (field: FieldLocation) => {
    setJumpTarget({ ...field });
    if (page !== field.page) setBusy(true);
    setPage(field.page);
  };
  const signatureField = fieldLocations.find(field => customPdfFieldType(field.fieldName) === "signature");
  const nextRequiredField = fieldLocations.find(field => {
    const type = customPdfFieldType(field.fieldName);
    if (type === "signature") return !signatureImage;
    if (!field.required || field.readOnly || type === "date") return false;
    const value = fieldValue(field);
    return field.checkBox ? value !== true && value !== "Yes" && value !== "On" : typeof value !== "string" || !value.trim();
  });
  const requiredComplete = fieldsReady && fieldLocations.every(field => {
    const type = customPdfFieldType(field.fieldName);
    if (!field.required || field.readOnly || type === "signature" || type === "date") return true;
    const value = fieldValue(field);
    return field.checkBox ? value === true || value === "Yes" || value === "On" : typeof value === "string" && Boolean(value.trim());
  });
  useEffect(() => { onReviewed(Boolean(pdf && !busy && !error && (readOnly || !onValuesChange || requiredComplete))); }, [pdf, busy, error, readOnly, onReviewed, onValuesChange, requiredComplete]);
  const pager = (position: "top" | "bottom") => <nav className="signing-document-pager" aria-label={`Document pages (${position})`}>
    <button type="button" aria-label={position === "top" ? "Previous page (top)" : undefined} disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button>
    <span>Page {page} of {pdf?.numPages}</span>
    <button type="button" aria-label={position === "top" ? "Next page (top)" : undefined} disabled={busy || page === pdf?.numPages} onClick={() => setPage(value => value + 1)}>Next page</button>
  </nav>;
  return <section className="signing-document-review" aria-label={`${title} document`}>
    <div className="signing-document-toolbar">
      <a href={url} target="_blank" rel="noopener noreferrer">{readOnly ? "Open PDF" : "Open uploaded PDF"}</a>
      {!readOnly && onSignatureClick && <div className="signing-document-field-actions">
        <button type="button" disabled={!pdf || busy || indexingFields || Boolean(error)} onClick={() => signatureField ? jumpTo(signatureField) : onSignatureClick()}>{indexingFields ? "Finding signing fields…" : signatureField ? "Jump to signature" : signatureImage ? "Edit signature" : "Create signature"}</button>
        {signatureField && nextRequiredField && <button type="button" disabled={busy || Boolean(error)} onClick={() => jumpTo(nextRequiredField)}>Next required field</button>}
      </div>}
    </div>
    {!readOnly && onSignatureClick && <p className="signing-document-navigation-note">Select a signature box to type or draw your signature. Complete the required fields before submitting.</p>}
    {pdf && !error && pager("top")}
    <div ref={holder} className="signing-document-canvas"><canvas ref={canvas} aria-label={`${title}, page ${page}`} />{onValuesChange && !busy && inputs.map((field,index) => {
      const type = customPdfFieldType(field.fieldName), automatic = type === "signature" || type === "date";
      const value = automatic ? type === "date" ? new Date().toISOString().slice(0,10) : onSignatureClick && !signatureImage ? "" : signingName : fieldValue(field) ?? "";
      const label = field.alternativeText || field.fieldName;
      if (type === "signature" && onSignatureClick) return <button type="button" key={`${field.fieldName}:${index}`} data-signing-field={field.fieldName} className="signing-pdf-signature" aria-label={`${signatureImage ? "Change" : "Create"} signature: ${label}`} onClick={onSignatureClick} style={{ left:`${field.left*100}%`, top:`${field.top*100}%`, width:`${field.width*100}%`, height:`${field.height*100}%` }}>{signatureImage ? <img src={signatureImage} alt="Adopted signature" /> : "Click to sign"}</button>;
      if (type === "signature" && signatureImage) return <img key={`${field.fieldName}:${index}`} className="signing-pdf-signature" src={signatureImage} alt={`${label}: adopted signature`} style={{ left:`${field.left*100}%`, top:`${field.top*100}%`, width:`${field.width*100}%`, height:`${field.height*100}%` }} />;
      return <input key={`${field.fieldName}:${index}`} data-signing-field={field.fieldName} className="signing-pdf-input" style={{left:`${field.left*100}%`,top:`${field.top*100}%`,width:`${field.width*100}%`,height:`${field.height*100}%`}} aria-label={label} title={`${label}${field.required?' (required)':''}`} type={field.checkBox?'checkbox':'text'} checked={field.checkBox ? value===true||value==='Yes'||value==='On':undefined} value={field.checkBox?undefined:String(value)} readOnly={field.readOnly||automatic} disabled={field.checkBox&&field.readOnly} placeholder={automatic ? type==='signature'?'Click to sign':'Signing date':label} maxLength={type==='initials'?20:500} onChange={event=>{
        const nextValue = field.checkBox ? event.target.checked : event.target.value;
        const role = signerFieldRole(field);
        if (signer && role === "name") signer.onNameChange(String(nextValue));
        if (signer && role === "email") signer.onEmailChange?.(String(nextValue));
        onValuesChange({...values,[field.fieldName]:nextValue});
      }} />;
    })}</div>
    {onValuesChange && fieldLocations.length > 0 && <p>Complete the highlighted fields. {onSignatureClick ? "Click a signature box to type or draw and adopt your signature. The final sign button saves the document." : "Signature and signing date fields are filled when you sign."}{!requiredComplete && " Some required fields are still empty."}</p>}
    {error ? <div role="alert"><p>{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry document</button></p>{diagnostic && <details><summary>Support details</summary><pre>{JSON.stringify(diagnostic, null, 2)}</pre></details>}</div> : !pdf ? <p role="status">Loading document…</p> : <>
      {pager("bottom")}
    </>}
  </section>;
}
