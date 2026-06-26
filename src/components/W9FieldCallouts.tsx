import { getW9FieldEntry, W9_TAX_CLASS_CHECKBOX_KEYS, type W9FormFieldKey, type W9ResolvedFieldObjects } from "@/lib/w9-form-fields";
import { W9_FIELD_CALLOUTS, W9_SIGNATURE_FIELD_KEY } from "@/lib/w9-field-callouts";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface PlacedCallout {
  fieldKey: W9FormFieldKey;
  fieldId: string;
  label: string;
  hint?: string;
  top: number;
  left: number;
  placement: "left" | "right" | "below";
  filled: boolean;
}

interface W9FieldCalloutsProps {
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

export default function W9FieldCallouts({
  containerRef,
  hostRef,
  pdfDocument,
  currentPage,
  active,
  signatureImage = null,
  onSignatureRequest,
}: W9FieldCalloutsProps) {
  const [callouts, setCallouts] = useState<PlacedCallout[]>([]);
  const [mobileLayout, setMobileLayout] = useState(isMobileLayout);
  const fieldIdByKeyRef = useRef<Map<W9FormFieldKey, string>>(new Map());
  const rafRef = useRef<number>();

  const isCalloutFilled = useCallback(
    (fieldKey: W9FormFieldKey, input: HTMLInputElement | null): boolean => {
      if (fieldKey === W9_SIGNATURE_FIELD_KEY) return Boolean(signatureImage);
      if (fieldKey === "taxClassIndividual") {
        const container = containerRef.current;
        if (!container) return false;
        return W9_TAX_CLASS_CHECKBOX_KEYS.some((key) => {
          const fieldId = fieldIdByKeyRef.current.get(key);
          if (!fieldId) return false;
          const checkbox = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
          return checkbox?.checked;
        });
      }
      if (fieldKey === "ssnPart1") {
        const container = containerRef.current;
        if (!container) return false;
        for (const key of ["ssnPart1", "ssnPart2", "ssnPart3", "einPart1", "einPart2"] as const) {
          const fieldId = fieldIdByKeyRef.current.get(key);
          if (!fieldId) continue;
          const tinInput = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
          if (tinInput?.value.replace(/\D/g, "").length) return true;
        }
        return false;
      }
      return Boolean(input?.value?.trim());
    },
    [containerRef, signatureImage],
  );

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

    for (const meta of W9_FIELD_CALLOUTS) {
      if (meta.page !== currentPage) continue;

      const fieldId = fieldIdByKeyRef.current.get(meta.fieldKey);
      if (!fieldId) continue;

      const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
      if (input && inputRectIsEmpty(input) && meta.fieldKey !== "taxClassIndividual") continue;

      const target = input ?? container.querySelector(`#pdfjs_internal_id_${fieldId}`);
      if (!target) continue;

      const inputRect = (target as HTMLElement).getBoundingClientRect();
      if (inputRect.width === 0 && inputRect.height === 0) continue;

      const centerY = inputRect.top - hostRect.top + inputRect.height / 2;
      const inputLeft = inputRect.left - hostRect.left;
      const inputRight = inputRect.right - hostRect.left;
      const inputBottom = inputRect.bottom - hostRect.top;
      const filled = isCalloutFilled(meta.fieldKey, input);

      if (mobile) {
        next.push({
          fieldKey: meta.fieldKey,
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
        fieldKey: meta.fieldKey,
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
  }, [active, containerRef, currentPage, hostRef, isCalloutFilled]);

  useEffect(() => {
    if (!pdfDocument || !active) {
      fieldIdByKeyRef.current = new Map();
      setCallouts([]);
      return;
    }

    let cancelled = false;

    void pdfDocument.getFieldObjects().then((rawFieldObjects) => {
      if (cancelled || !rawFieldObjects) return;

      const fieldObjects = rawFieldObjects as W9ResolvedFieldObjects;
      const map = new Map<W9FormFieldKey, string>();

      for (const meta of W9_FIELD_CALLOUTS) {
        const entry = getW9FieldEntry(fieldObjects, meta.fieldKey);
        if (entry?.id) map.set(meta.fieldKey, entry.id);
      }

      for (const key of W9_TAX_CLASS_CHECKBOX_KEYS) {
        const entry = getW9FieldEntry(fieldObjects, key);
        if (entry?.id && !map.has(key)) map.set(key, entry.id);
      }

      for (const key of ["ssnPart2", "ssnPart3", "einPart1", "einPart2"] as const) {
        const entry = getW9FieldEntry(fieldObjects, key);
        if (entry?.id && !map.has(key)) map.set(key, entry.id);
      }

      fieldIdByKeyRef.current = map;
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
      if (target instanceof HTMLInputElement) scheduleLayout();
    };
    container.addEventListener("input", inputHandler);
    container.addEventListener("click", inputHandler);

    return () => {
      window.cancelAnimationFrame(rafRef.current ?? 0);
      container.removeEventListener("scroll", scheduleLayout);
      window.removeEventListener("resize", scheduleLayout);
      container.removeEventListener("input", inputHandler);
      container.removeEventListener("click", inputHandler);
      observer.disconnect();
    };
  }, [active, containerRef, hostRef, layoutCallouts]);

  const focusField = (fieldId: string) => {
    const container = containerRef.current;
    if (!container) return;
    const input = container.querySelector(`#pdfjs_internal_id_${fieldId}`) as HTMLInputElement | null;
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
  };

  if (!active || callouts.length === 0) return null;

  return (
    <div className={`ica-field-callouts${mobileLayout ? " ica-field-callouts--mobile" : ""}`}>
      {callouts.map((callout) => (
        <button
          key={`${callout.fieldKey}-${callout.fieldId}`}
          type="button"
          className={`ica-field-callout ica-field-callout--${callout.placement}${callout.filled ? " ica-field-callout--filled" : ""}`}
          style={{ top: callout.top, left: callout.left }}
          onClick={() => {
            if (callout.fieldKey === W9_SIGNATURE_FIELD_KEY && onSignatureRequest) {
              onSignatureRequest();
              return;
            }
            focusField(callout.fieldId);
          }}
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

function inputRectIsEmpty(input: HTMLInputElement): boolean {
  const rect = input.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0;
}
