import IcaSignaturePad from "@/components/IcaSignaturePad";
import { useEffect, useRef, useState } from "react";

interface IcaSignatureModalProps {
  open: boolean;
  initialImage?: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

function SignatureEditor({
  initialImage = null,
  onClose,
  onSave,
}: IcaSignatureModalProps) {
  const [draft, setDraft] = useState<string | null>(initialImage);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
      <dialog
        ref={dialog}
        className="ica-signature-modal"
        onCancel={onClose}
        onClose={onClose}
        aria-labelledby="ica-signature-modal-title"
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }}
      >
        <h3 id="ica-signature-modal-title" className="ica-signature-modal-title">
          Sign your full first and last name
        </h3>
        <p className="ica-signature-modal-copy">
          Use your cursor or finger to write your full first and last name. Initials or a line alone will be rejected. This signature will appear on your agreement.
        </p>
        <IcaSignaturePad
          initialImage={initialImage}
          onChange={setDraft}
        />
        <div className="ica-signature-modal-actions">
          <button type="button" className="ica-signature-modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent ica-signature-modal-save"
            disabled={!draft}
            onClick={() => {
              if (draft) onSave(draft);
            }}
          >
            Save signature
          </button>
        </div>
      </dialog>
  );
}

export default function IcaSignatureModal(props: IcaSignatureModalProps) {
  // A fresh editor on each opening discards cancelled changes and shows the saved signature.
  return props.open ? <SignatureEditor key={props.initialImage ?? "empty"} {...props} /> : null;
}
