import IcaSignaturePad from "@/components/IcaSignaturePad";
import { useState } from "react";

interface IcaSignatureModalProps {
  open: boolean;
  initialImage?: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export default function IcaSignatureModal({
  open,
  initialImage = null,
  onClose,
  onSave,
}: IcaSignatureModalProps) {
  const [draft, setDraft] = useState<string | null>(initialImage);

  if (!open) return null;

  return (
    <div className="ica-signature-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ica-signature-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ica-signature-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="ica-signature-modal-title" className="ica-signature-modal-title">
          Draw your signature
        </h3>
        <p className="ica-signature-modal-copy">
          Use your cursor or finger to sign in the box below. This will appear on your agreement.
        </p>
        <IcaSignaturePad
          key={initialImage ?? "empty"}
          onChange={(dataUrl) => setDraft(dataUrl)}
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
      </div>
    </div>
  );
}
