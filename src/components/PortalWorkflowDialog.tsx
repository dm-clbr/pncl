import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "@/styles/portal-workflow-dialog.css";

export default function PortalWorkflowDialog({ title, children, onClose, warning = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  warning?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const target = document.querySelector<HTMLElement>("dialog[open]")
    ?? document.querySelector<HTMLElement>(".home2-page") ?? document.body;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div className="portal-workflow-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className="portal-workflow-dialog" role={warning ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId}>
        <header><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        {children}
      </div>
    </div>, target,
  );
}
