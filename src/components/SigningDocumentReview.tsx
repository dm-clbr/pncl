import { useEffect, useRef, useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import "@/lib/pdfjs-setup";
import "@/styles/signing-document-review.css";
import { customPdfFieldType, type PdfFieldValues } from "../../supabase/functions/_shared/pdfFieldRules";
type InputAnnotation = { fieldName: string; fieldType: string; fieldValue?: string | boolean; alternativeText?: string; readOnly?: boolean; required?: boolean; checkBox?: boolean; rect: number[]; };
type PageInput = InputAnnotation & { left: number; top: number; width: number; height: number };
const EMPTY_VALUES: PdfFieldValues = {};

/** Signing is enabled only after every page of this exact upload renders. */
export default function SigningDocumentReview({ url, title, onReviewed, values = EMPTY_VALUES, onValuesChange, signingName = "", signatureImage, onSignatureClick, readOnly = false }: { readOnly?: boolean; url: string; title: string; onReviewed: (ready: boolean) => void; values?: PdfFieldValues; onValuesChange?: (values: PdfFieldValues) => void; signingName?: string; signatureImage?: string; onSignatureClick?: () => void }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [width, setWidth] = useState(600);
  const [inputs, setInputs] = useState<PageInput[]>([]);
  const [allInputs, setAllInputs] = useState<Record<number, PageInput[]>>({});
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setPdf(null); setPage(1); setVisited(new Set()); setError(""); setInputs([]); setAllInputs({});
    const task = getDocument({ url, verbosity: 0 });
    task.promise.then(doc => { if (active) setPdf(doc); }).catch(() => { if (active) setError("Unable to load the signing document. Retry before signing."); });
    return () => { active = false; void task.destroy(); };
  }, [url, attempt]);
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
      if (active) { setInputs(pageInputs); setAllInputs(value => ({ ...value, [page]: pageInputs })); setVisited(value => new Set([...value, page])); setBusy(false); }
    }).catch(error => { if (active && error?.name !== "RenderingCancelledException") setError("Unable to display this page. Retry before signing."); });
    return () => { active = false; task?.cancel(); };
  }, [pdf, page, width, onValuesChange]);
  const requiredComplete = Object.values(allInputs).flat().every(field => {
    const type = customPdfFieldType(field.fieldName);
    if (!field.required || field.readOnly || type === "signature" || type === "date") return true;
    const value = values[field.fieldName] ?? field.fieldValue;
    return field.checkBox ? value === true || value === "Yes" || value === "On" : typeof value === "string" && Boolean(value.trim());
  });
  useEffect(() => { onReviewed(Boolean(pdf && visited.size === pdf.numPages && !error && (!onValuesChange || requiredComplete))); }, [pdf, visited, error, onReviewed, onValuesChange, requiredComplete]);
  return <section className="signing-document-review" aria-label={`${title} document`}>
    <a href={url} target="_blank" rel="noopener noreferrer">{readOnly ? "Open PDF" : "Open uploaded PDF"}</a>
    <div ref={holder} className="signing-document-canvas"><canvas ref={canvas} aria-label={`${title}, page ${page}`} />{onValuesChange && !busy && inputs.map((field,index) => {
      const type = customPdfFieldType(field.fieldName), automatic = type === "signature" || type === "date";
      const value = automatic ? type === "date" ? new Date().toISOString().slice(0,10) : onSignatureClick && !signatureImage ? "" : signingName : values[field.fieldName] ?? field.fieldValue ?? "";
      const label = field.alternativeText || field.fieldName;
      if (type === "signature" && onSignatureClick) return <button type="button" key={`${field.fieldName}:${index}`} className="signing-pdf-signature" aria-label={`${signatureImage ? "Change" : "Create"} signature: ${label}`} onClick={onSignatureClick} style={{ left:`${field.left*100}%`, top:`${field.top*100}%`, width:`${field.width*100}%`, height:`${field.height*100}%` }}>{signatureImage ? <img src={signatureImage} alt="Adopted signature" /> : "Click to sign"}</button>;
      if (type === "signature" && signatureImage) return <img key={`${field.fieldName}:${index}`} className="signing-pdf-signature" src={signatureImage} alt={`${label}: adopted signature`} style={{ left:`${field.left*100}%`, top:`${field.top*100}%`, width:`${field.width*100}%`, height:`${field.height*100}%` }} />;
      return <input key={`${field.fieldName}:${index}`} className="signing-pdf-input" style={{left:`${field.left*100}%`,top:`${field.top*100}%`,width:`${field.width*100}%`,height:`${field.height*100}%`}} aria-label={label} title={`${label}${field.required?' (required)':''}`} type={field.checkBox?'checkbox':'text'} checked={field.checkBox ? value===true||value==='Yes'||value==='On':undefined} value={field.checkBox?undefined:String(value)} readOnly={field.readOnly||automatic} disabled={field.checkBox&&field.readOnly} placeholder={automatic ? type==='signature'?'Adopt signature below':'Signing date':label} maxLength={type==='initials'?20:500} onChange={event=>onValuesChange({...values,[field.fieldName]:field.checkBox?event.target.checked:event.target.value})} />;
    })}</div>
    {onValuesChange && Object.values(allInputs).some(fields=>fields.length) && <p>Complete the highlighted fields. {onSignatureClick ? "Click a signature box to type or draw and adopt your signature. The final sign button saves the document." : "Signature and signing date fields are filled when you sign."}{!requiredComplete && " Some required fields are still empty."}</p>}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry document</button></p> : !pdf ? <p role="status">Loading document…</p> : <>
      <div className="signing-document-pager"><button type="button" disabled={busy || page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button><span>Page {page} of {pdf.numPages}</span><button type="button" disabled={busy || page === pdf.numPages} onClick={() => setPage(value => value + 1)}>Next page</button></div>
      {!readOnly && <p>{visited.size === pdf.numPages ? "All pages viewed. You can complete and sign below." : "View every page before signing."}</p>}
    </>}
  </section>;
}
