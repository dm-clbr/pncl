import { useEffect, useId, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  id?: string;
  /** half holds the bottom sheet to 40% of the viewport, so the surface behind
      it keeps the other 60%. Default full keeps every existing caller at 85vh,
      and from 621px the sheet is a side panel where neither applies. */
  size?: "full" | "half";
};

/** Native <dialog> opened with showModal(): bottom sheet up to 620px, right
    side panel from 621px. Styles under .portal-sheet in
    src/styles/portal-primitives.css. The top layer ignores preserve-3d, but
    mount it outside PortalBentoStage anyway so the closed element never sits
    inside the tilted tree. Focus lands on the title on open; the native
    dialog returns focus to the opener on close. */
export default function Sheet({ open, onClose, title, children, id, size = "full" }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      titleRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Esc (native cancel), the backdrop and the button all close the native
  // dialog; its close event is the one path back to the owner's state.
  const close = () => dialogRef.current?.close();
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    // The backdrop reports the dialog itself as the target, but so does the
    // dialog's own bare surface (the strip around the drag handle), so close
    // only when the pointer lands outside the dialog's box.
    if (event.target !== event.currentTarget) return;
    const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    if (x < left || x > right || y < top || y > bottom) close();
  };

  // Swipe down on the handle dismisses the bottom sheet (the handle is hidden
  // from 621px, where the sheet is a side panel). Esc, the backdrop and the
  // 44px Close stay the non-dragging paths, so WCAG 2.5.7 holds.
  const dragFrom = useRef<number | null>(null);
  const followPointer = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const offsetBy = (dy: number) => {
    if (!followPointer) return;
    dialogRef.current?.style.setProperty("transform", `translateY(${dy}px)`);
  };
  const onHandleDown = (event: PointerEvent<HTMLSpanElement>) => {
    dragFrom.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (dragFrom.current === null) return;
    offsetBy(Math.max(0, event.clientY - dragFrom.current));
  };
  const onHandleUp = (event: PointerEvent<HTMLSpanElement>) => {
    const from = dragFrom.current;
    if (from === null) return;
    dragFrom.current = null;
    dialogRef.current?.style.removeProperty("transform");
    // ponytail: one fixed threshold, no velocity tracking. 56px is past the
    // handle's own row, so a tap or a scroll nudge never closes the sheet.
    if (event.clientY - from > 56) close();
  };

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className={`portal-sheet${size === "half" ? " is-half" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onBackdropClick}
    >
      <span
        className="portal-sheet-handle"
        aria-hidden="true"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      />
      <div className="portal-sheet-head">
        <h2 ref={titleRef} id={titleId} className="portal-sheet-title" tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="portal-sheet-close" onClick={close} aria-label="Close">
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="portal-sheet-body">{children}</div>
    </dialog>
  );
}
