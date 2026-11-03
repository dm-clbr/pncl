import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { X, Plus, Trash2, Undo2, Eye, Move, Check, Grip } from "lucide-react";
import "@/lib/pdfjs-setup";
import { readPlacedPdfFields, writePlacedPdfFields, type PdfPlacedField, type PdfFieldType } from "@/lib/pdf-field-editor";
import { boundPdfField, PDF_FIELD_TYPES } from "../../../supabase/functions/_shared/pdfFieldRules";
import "@/styles/pdf-field-editor.css";

const labels: Record<PdfFieldType, string> = { text: "Text", signature: "Signature", initials: "Initials", date: "Signing date", checkbox: "Checkbox" };
export default function PdfFieldEditor({ url, filename, kind, onSave, onClose }: {
  url: string; filename: string; kind?: string; onSave: (file: File) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), surface = useRef<HTMLDivElement>(null);
  const bytes = useRef<Uint8Array>();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [fields, setFields] = useState<PdfPlacedField[]>([]);
  const [history, setHistory] = useState<PdfPlacedField[][]>([]), [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(1), [zoom, setZoom] = useState(100), [preview, setPreview] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 612, height: 792 }), [rendering, setRendering] = useState(true);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const drag = useRef<{ id: string; startX: number; startY: number; field: PdfPlacedField; resize: boolean } | null>(null);
  const selected = fields.find(field => field.id === selectedId);
  useEffect(() => { const active = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => active?.focus(); }, []);
  useEffect(() => {
    let active = true; let task: ReturnType<typeof getDocument> | undefined;
    void fetch(url).then(response => { if (!response.ok) throw new Error("Unable to open this PDF."); return response.arrayBuffer(); }).then(async buffer => {
      const source = new Uint8Array(buffer); const loadedFields = await readPlacedPdfFields(source, kind);
      task = getDocument({ data: source.slice(), verbosity: 0 }); const doc = await task.promise;
      if (active) { bytes.current = source; setPdf(doc); setFields(loadedFields); }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Unable to open this PDF."); });
    return () => { active = false; void task?.destroy(); };
  }, [url, kind]);
  useEffect(() => {
    if (!pdf) return;
    let active = true; let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setRendering(true);
    void pdf.getPage(page).then(async source => {
      if (!active || !canvas.current) return;
      const natural = source.getViewport({ scale: 1 }); const viewport = source.getViewport({ scale: 900 / natural.width });
      setDimensions({ width: natural.width, height: natural.height });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      const context = canvas.current.getContext("2d"); if (!context) throw new Error("PDF preview unavailable.");
      task = source.render({ canvasContext: context, viewport, annotationMode: 0 }); await task.promise;
      if (active) setRendering(false);
    }).catch(err => { if (active && err?.name !== "RenderingCancelledException") setError("Unable to render this PDF page."); });
    return () => { active = false; task?.cancel(); };
  }, [pdf, page]);
  const remember = () => setHistory(previous => [...previous.slice(-29), fields]);
  const change = (id: string, patch: Partial<PdfPlacedField>, record = true) => {
    if (record) remember();
    setFields(previous => previous.map(field => field.id === id ? boundPdfField({ ...field, ...patch }) : field));
  };
  const remove = (field: PdfPlacedField) => {
    if (field.locked || saving) return;
    remember();
    setFields(previous => previous.filter(item => item.id !== field.id));
    setSelectedId(previous => previous === field.id ? "" : previous);
  };
  const add = (type: PdfFieldType) => {
    if (fields.length >= 150) { setError("Use no more than 150 fields."); return; }
    const id = crypto.randomUUID(), name = `pncl_${type}_${id.replace(/-/g, "")}`;
    remember(); setPreview(false);
    const field: PdfPlacedField = { id: `${name}:0`, name, type, label: labels[type], page, x: .18, y: .24, width: type === "checkbox" ? .035 : type === "initials" ? .1 : .3, height: type === "checkbox" ? .027 : .035, required: true, locked: false, original: false, widget: 0 };
    setFields(previous => [...previous, field]); setSelectedId(field.id);
  };
  const beginDrag = (event: PointerEvent, field: PdfPlacedField, resize = false) => {
    if (preview || saving) return; event.preventDefault(); event.stopPropagation();
    setSelectedId(field.id); remember();
    drag.current = { id: field.id, startX: event.clientX, startY: event.clientY, field, resize };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent) => {
    const current = drag.current, rect = surface.current?.getBoundingClientRect(); if (!current || !rect) return;
    const dx = (event.clientX - current.startX) / rect.width, dy = (event.clientY - current.startY) / rect.height;
    change(current.id, current.resize ? { width: current.field.width + dx, height: current.field.height + dy } : { x: current.field.x + dx, y: current.field.y + dy }, false);
  };
  const apply = async () => {
    if (!bytes.current || saving) return; setSaving(true); setError("");
    try { const result = await writePlacedPdfFields(bytes.current, fields, kind); await onSave(new File([Uint8Array.from(result)], filename, { type: "application/pdf" })); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save the field layout."); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} className="pdf-field-editor" aria-labelledby="pdf-field-editor-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!saving) onClose(); }}>
    <header className="pdf-editor-header"><div><h2 id="pdf-field-editor-title">Place PDF fields</h2><p>{filename}</p></div><button type="button" aria-label="Close field editor" disabled={saving} onClick={onClose}><X size={20}/></button></header>
    <div className="pdf-editor-toolbar"><div className="pdf-editor-tools" aria-label="Add input field">{PDF_FIELD_TYPES.map(type => <button type="button" key={type} disabled={!pdf || saving} onClick={() => add(type)}><Plus size={14}/>{labels[type]}</button>)}</div>
      <button type="button" disabled={!history.length || saving} onClick={() => { setFields(history[history.length - 1]); setHistory(previous => previous.slice(0, -1)); }}><Undo2 size={15}/>Undo</button>
      <button type="button" aria-pressed={preview} disabled={!pdf || saving} onClick={() => setPreview(value => !value)}><Eye size={15}/>{preview ? "Back to editing" : "Agent preview"}</button>
    </div>
    {error && <p className="pdf-editor-error" role="alert">{error}</p>}
    <div className="pdf-editor-body">
      <aside className="pdf-editor-sidebar"><label>Page<select aria-label="PDF page" value={page} onChange={event => { setPage(Number(event.target.value)); setSelectedId(""); }}>{Array.from({ length: pdf?.numPages ?? 1 }, (_, i) => <option key={i} value={i + 1}>Page {i + 1} · {fields.filter(field => field.page === i + 1).length} fields</option>)}</select></label>
        <p>{preview ? "Try the fields as an agent. Preview entries are never saved." : "Add a field, drag it into place, and resize from its corner. Use arrow keys for fine adjustments."}</p>
        <div className="pdf-editor-field-list" aria-label="Fields on this page">{fields.filter(field => field.page === page).map(field => <button key={field.id} type="button" aria-pressed={selectedId === field.id} onClick={() => setSelectedId(field.id)}><span>{field.label}</span><small>{labels[field.type]}</small></button>)}</div>
        {selected && !preview ? <section className="pdf-editor-properties" aria-label="Selected field settings"><h3>Field settings</h3><label>Label<input value={selected.label} maxLength={80} disabled={selected.locked} onChange={event => change(selected.id, { label: event.target.value })}/></label>
          <label className="pdf-editor-check"><input type="checkbox" checked={selected.required} disabled={selected.locked} onChange={event => change(selected.id, { required: event.target.checked })}/>Required</label>
          {selected.type === "signature" || selected.type === "date" ? <p>Filled automatically when the agent signs.</p> : null}
          <div className="pdf-editor-position">{([['x','Left'],['y','Top'],['width','Width'],['height','Height']] as const).map(([key,label]) => <label key={key}>{label} %<input type="number" min={0} max={100} step={.1} aria-label={`${label} percent`} value={Math.round(selected[key]*1000)/10} onChange={event => { if (event.target.value !== "") change(selected.id, { [key]: Number(event.target.value)/100 }); }}/></label>)}</div>
          <label>Move to page<select aria-label="Field page" value={selected.page} disabled={selected.locked} onChange={event => { change(selected.id,{page:Number(event.target.value)}); setPage(Number(event.target.value)); }}>{Array.from({length:pdf?.numPages??1},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
          {selected.locked ? <p>This existing form field is connected to onboarding data. You can adjust its placement and size on this page.</p> : <button type="button" disabled={saving} onClick={() => remove(selected)}><Trash2 size={15}/>Delete field</button>}
        </section> : !preview && <p>Select a field to adjust its label, required status, and exact position.</p>}
      </aside>
      <section className="pdf-editor-workspace" aria-label="PDF placement canvas"><div className="pdf-editor-zoom"><span>Page {page} of {pdf?.numPages ?? "…"}</span><label>Zoom<select value={zoom} onChange={event=>setZoom(Number(event.target.value))}>{[75,100,125,150].map(value=><option key={value}>{value}</option>)}</select>%</label></div>
        {(!pdf || rendering) && <p role="status">Loading PDF page…</p>}
        <div className="pdf-editor-sheet" ref={surface} style={{width:`${zoom}%`, maxWidth: 760*zoom/100, aspectRatio:`${dimensions.width}/${dimensions.height}`, visibility:pdf&&!rendering?'visible':'hidden'}}>
          <canvas ref={canvas}/>{fields.filter(field=>field.page===page).map(field=><div key={field.id} className={`pdf-placed-field type-${field.type}${selectedId===field.id?' selected':''}${preview?' preview':''}`} style={{left:`${field.x*100}%`,top:`${field.y*100}%`,width:`${field.width*100}%`,height:`${field.height*100}%`}}>
            {preview ? field.type==='checkbox'?<input type="checkbox" aria-label={field.label}/>:<input aria-label={field.label} placeholder={field.type==='signature'?'Agent’s signature':field.type==='date'?'Signing date':field.label} readOnly={field.type==='signature'||field.type==='date'}/>:
              <><div role="button" tabIndex={0} aria-label={`Move ${field.label}`} onPointerDown={event=>beginDrag(event,field)} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={event=>{ const delta=event.shiftKey ? .01 : .002; const shifts:Record<string,[number,number]>={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};const shift=shifts[event.key];if(shift){event.preventDefault();change(field.id,{x:field.x+shift[0],y:field.y+shift[1]});}if(event.key==='Enter')setSelectedId(field.id); }}><Move size={12}/><span>{field.label}{field.required?' *':''}</span></div>
                {!field.locked && <button type="button" className="pdf-field-delete" aria-label={`Delete ${field.label}`} title={`Delete ${field.label}`} disabled={saving} onPointerDown={event => event.stopPropagation()} onClick={() => remove(field)}><Trash2 size={14}/></button>}
                <button type="button" className="pdf-field-resize" aria-label={`Resize ${field.label}`} onPointerDown={event=>beginDrag(event,field,true)} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><Grip size={12}/></button></>}
          </div>)}
        </div>
      </section>
    </div>
    <footer className="pdf-editor-footer"><p>{fields.length} fields · Saving creates a new PDF version. Existing signed copies stay unchanged.</p><div><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="pdf-editor-save" disabled={!pdf||rendering||saving} onClick={()=>void apply()}><Check size={16}/>{saving?'Saving fields…':'Apply fields'}</button></div></footer>
  </dialog>;
}
