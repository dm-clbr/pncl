import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  id?: string;
};

/** Native <dialog> opened with showModal(): bottom sheet up to 620px, right
    side panel from 621px. Styles under .portal-sheet in
    src/styles/portal-primitives.css. The top layer ignores preserve-3d, but
    mount it outside PortalBentoStage anyway so the closed element never sits
    inside the tilted tree. Focus lands on the title on open; the native
    dialog returns focus to the opener on close. */
export default function Sheet({ open, onClose, title, children, id }: SheetProps) {
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
    // Only the backdrop reports the dialog itself as the target.
    if (event.target === event.currentTarget) close();
  };

  return (
    <dialog
      ref={dialogRef}
      id={id}
      className="portal-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={onBackdropClick}
    >
      <span className="portal-sheet-handle" aria-hidden="true" />
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
