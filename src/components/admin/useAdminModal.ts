import { useEffect, useRef, type RefObject } from "react";

// ponytail: no visibility filter, so a hidden control inside a modal still counts as a
// Tab stop; filter on getClientRects() if a modal ever hides focusable content.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour for an .admin-modal while `open`: focus moves in, Tab and Shift+Tab
 * wrap inside it, Escape calls `onClose` (pass undefined while the modal must not close),
 * body scroll is locked, and on close the body overflow and the previous focus return.
 */
export function useAdminModal(ref: RefObject<HTMLElement>, open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const modal = ref.current;
    if (!open || !modal) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!modal.contains(document.activeElement)) (focusables()[0] ?? modal).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!closeRef.current) return;
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        modal.focus();
      } else if (event.shiftKey && (active === first || !modal.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [ref, open]);
}
