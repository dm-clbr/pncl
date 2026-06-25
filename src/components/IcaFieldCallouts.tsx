import { ICA_FIELD_CALLOUTS } from "@/lib/ica-field-callouts";
import { ICA_FORM_FIELDS } from "@/lib/ica-form-fields";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface PlacedCallout {
  fieldName: string;
  fieldId: string;
  label: string;
  hint?: string;
  top: number;
  left: number;
  placement: "left" | "right" | "below";
  filled: boolean;
}

interface IcaFieldCalloutsProps {
  containerRef: RefObject<HTMLDivElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  active: boolean;
  signatureImage?: string | null;
  onSignatureRequest?: () => void;
}

const CALLOUT_WIDTH = 168;
const MOBILE_BREAKPOINT = 560;

function isMobileLayout(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export default function IcaFieldCallouts({
  containerRef,
  hostRef,
  pdfDocument,
  currentPage,
  active,
  signatureImage = null,
  onSignatureRequest,
}: IcaFieldCalloutsProps) {
  const [callouts, setCallouts] = useState<PlacedCallout[]>([]);
  const [mobileLayout, setMobileLayout] = useState(isMobileLayout);
  const fieldIdByNameRef = useRef<Map<string, string>>(new Map());
  const rafRef = useRef<number>();

  const layoutCallouts = useCallback(() => {
    const container = containerRef.current;
    const host = hostRef.current;
    if (!container || !host || !active) {
      setCallouts([]);
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const mobile = isMobileLayout();
    setMobileLayout(mobile);
    const next: PlacedCallout[] = [];

    for (const meta of ICA_FIELD_CALLOUTS) {
      if (meta.page !== currentPage) continue;

      const fieldId = fieldIdByNameRef.current.get(meta.fieldName);
      if (!fieldId) continue;

      const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (!input) continue;

      const inputRect = input.getBoundingClientRect();
      if (inputRect.width === 0 && inputRect.height === 0) continue;

      const centerY = inputRect.top - hostRect.top + inputRect.height / 2;
      const inputLeft = inputRect.left - hostRect.left;
      const inputRight = inputRect.right - hostRect.left;
      const inputBottom = inputRect.bottom - hostRect.top;

      const isSignatureField = meta.fieldName === ICA_FORM_FIELDS.signature;
      const filled = isSignatureField
        ? Boolean(signatureImage)
        : Boolean(input.value?.trim());

      if (mobile) {
        next.push({
          fieldName: meta.fieldName,
          fieldId,
          label: meta.label,
          hint: meta.hint,
          top: inputBottom + 8,
          left: Math.max(8, inputLeft),
          placement: "below",
          filled,
        });
        continue;
      }

      const placeLeft = inputLeft > CALLOUT_WIDTH + 16;
      const left = placeLeft ? inputLeft - CALLOUT_WIDTH - 10 : inputRight + 10;

      next.push({
        fieldName: meta.fieldName,
        fieldId,
        label: meta.label,
        hint: meta.hint,
        top: centerY,
        left,
        placement: placeLeft ? "left" : "right",
        filled,
      });
    }

    setCallouts(next);
  }, [active, containerRef, currentPage, hostRef, signatureImage]);

  useEffect(() => {
    if (!pdfDocument || !active) {
      fieldIdByNameRef.current = new Map();
      setCallouts([]);
      return;
    }

    let cancelled = false;

    void pdfDocument.getFieldObjects().then((fieldObjects) => {
      if (cancelled || !fieldObjects) return;

      const map = new Map<string, string>();
      for (const meta of ICA_FIELD_CALLOUTS) {
        const entry = fieldObjects[meta.fieldName]?.[0];
        if (entry?.id) map.set(meta.fieldName, entry.id);
      }
      fieldIdByNameRef.current = map;
      layoutCallouts();
    });

    return () => {
      cancelled = true;
    };
  }, [active, layoutCallouts, pdfDocument]);

  useEffect(() => {
    const container = containerRef.current;
    const host = hostRef.current;
    if (!container || !host || !active) return;

    const scheduleLayout = () => {
      window.cancelAnimationFrame(rafRef.current ?? 0);
      rafRef.current = window.requestAnimationFrame(layoutCallouts);
    };

    scheduleLayout();

    container.addEventListener("scroll", scheduleLayout, { passive: true });
    window.addEventListener("resize", scheduleLayout);

    const observer = new MutationObserver(scheduleLayout);
    observer.observe(container, { childList: true, subtree: true, attributes: true });

    const inputHandler = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        scheduleLayout();
      }
    };
    container.addEventListener("input", inputHandler);

    return () => {
      window.cancelAnimationFrame(rafRef.current ?? 0);
      container.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      container.removeEventListener("input", inputHandler);
      observer.disconnect();
    };
  }, [active, containerRef, hostRef, layoutCallouts]);

  const handleCalloutClick = (callout: PlacedCallout) => {
    if (callout.fieldName === ICA_FORM_FIELDS.signature && onSignatureRequest) {
      onSignatureRequest();
      return;
    }
    focusField(callout.fieldId);
  };

  const focusField = (fieldId: string) => {
    const container = containerRef.current;
    if (!container) return;
    const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
  };

  if (!active || callouts.length === 0) return null;

  return (
    <div className={`ica-field-callouts${mobileLayout ? " ica-field-callouts--mobile" : ""}`}>
      {callouts.map((callout) => (
        <button
          key={callout.fieldId}
          type="button"
          className={`ica-field-callout ica-field-callout--${callout.placement}${callout.filled ? " ica-field-callout--filled" : ""}`}
          style={{ top: callout.top, left: callout.left }}
          onClick={() => handleCalloutClick(callout)}
          title={callout.hint ? `${callout.label} — ${callout.hint}` : callout.label}
        >
          <span className="ica-field-callout-label">{callout.label}</span>
          {callout.hint && !callout.filled && (
            <span className="ica-field-callout-hint">{callout.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
}
