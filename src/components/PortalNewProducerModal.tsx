import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalCarriers } from "@/hooks/usePortalCarriers";
import { confirmPortalCarrierContracts } from "@/lib/portal-carrier-credentials";
import type { PortalCarrier } from "@/lib/portal-carriers";
import { toast } from "sonner";

interface PortalNewProducerModalProps {
  onClose: () => void;
  /** Runs after the carrier confirmations save, to check the step off. */
  onConfirmed: () => void;
}

function groupBySection(carriers: PortalCarrier[]): { title: string; carriers: PortalCarrier[] }[] {
  const sections: { title: string; carriers: PortalCarrier[] }[] = [];
  for (const carrier of carriers) {
    const title = carrier.section || "Other";
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.carriers.push(carrier);
    } else {
      sections.push({ title, carriers: [carrier] });
    }
  }
  return sections;
}

export default function PortalNewProducerModal({
  onClose,
  onConfirmed,
}: PortalNewProducerModalProps) {
  const { session } = useAuth();
  const { carriers, loading, error } = usePortalCarriers();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const sections = useMemo(() => groupBySection(carriers), [carriers]);
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected],
  );

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !submitting) onClose();
  };

  const handleConfirm = async () => {
    const token = session?.access_token;
    if (!token) {
      toast.error("You must be signed in to submit for New Producer.");
      return;
    }
    if (selectedIds.length === 0) return;

    setSubmitting(true);
    try {
      await confirmPortalCarrierContracts(token, selectedIds);
      onConfirmed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit for New Producer.");
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={handleBackdropClick} role="presentation">
      <div
        className="portal-new-producer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-new-producer-title"
      >
        <div className="portal-new-producer-head">
          <h2 id="portal-new-producer-title">Submit for New Producer</h2>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="portal-new-producer-warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>
            By submitting for New Producer, you have requested contracts with all of your
            recommended carriers. Please confirm that you&apos;re ready to proceed before
            continuing.
          </p>
        </div>

        <p className="portal-new-producer-prompt">
          Please mark each carrier that you have contracts with.
        </p>

        {loading && (
          <div className="portal-incentives-loading">
            <span className="onboarding-spinner" aria-hidden="true" />
            <span>Loading carriers...</span>
          </div>
        )}

        {!loading && error && <p className="admin-error">{error}</p>}

        {!loading && !error && carriers.length === 0 && (
          <p className="admin-empty">No carriers available yet. Contact PNCL support.</p>
        )}

        {!loading && !error && carriers.length > 0 && (
          <div className="portal-new-producer-carriers">
            {sections.map((section) => (
              <section key={section.title}>
                <h3>{section.title}</h3>
                {section.carriers.map((carrier) => (
                  <label key={carrier.id} className="portal-new-producer-carrier">
                    <input
                      type="checkbox"
                      checked={selected[carrier.id] ?? false}
                      disabled={submitting}
                      onChange={(event) =>
                        setSelected((prev) => ({ ...prev, [carrier.id]: event.target.checked }))
                      }
                    />
                    <span>{carrier.carrier}</span>
                  </label>
                ))}
              </section>
            ))}
          </div>
        )}

        <div className="portal-new-producer-actions">
          <span className="portal-new-producer-count">
            {selectedIds.length} carrier{selectedIds.length === 1 ? "" : "s"} marked
          </span>
          <div className="portal-new-producer-buttons">
            <button
              type="button"
              className="admin-secondary-link"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="portal-panel-btn"
              onClick={() => void handleConfirm()}
              disabled={submitting || selectedIds.length === 0}
            >
              {submitting ? "Submitting..." : "Confirm and submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
