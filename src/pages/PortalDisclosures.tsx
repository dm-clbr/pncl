import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, PlaySquare } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  acknowledgeDisclosure,
  fetchAcknowledgedDisclosureIds,
  fetchPortalDisclosures,
  toEmbedUrl,
  type PortalDisclosure,
} from "@/lib/portal-disclosures";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

function DisclosureVideo({ videoUrl }: { videoUrl: string }) {
  const embedUrl = toEmbedUrl(videoUrl);

  if (embedUrl) {
    return (
      <div className="portal-disclosure-video">
        <iframe
          src={embedUrl}
          title="Disclosure video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="portal-disclosure-video">
      {/* Direct file URL (e.g. Supabase storage or CDN mp4). */}
      <video src={videoUrl} controls preload="metadata" />
    </div>
  );
}

export default function PortalDisclosures() {
  const { user } = useAuth();
  const [disclosures, setDisclosures] = useState<PortalDisclosure[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Disclosures — PNCL Portal";
    trackPageView("portal_disclosures");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.all([fetchPortalDisclosures(), fetchAcknowledgedDisclosureIds(user.id)])
      .then(([modules, acked]) => {
        if (cancelled) return;
        setDisclosures(modules);
        setAcknowledgedIds(acked);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load disclosures.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const completedCount = useMemo(
    () => disclosures.filter((disclosure) => acknowledgedIds.has(disclosure.id)).length,
    [disclosures, acknowledgedIds],
  );
  const allDone = disclosures.length > 0 && completedCount === disclosures.length;

  const handleAcknowledge = async (disclosure: PortalDisclosure) => {
    if (!user) return;

    setAcknowledgingId(disclosure.id);
    try {
      await acknowledgeDisclosure(user.id, disclosure.id);
      setAcknowledgedIds((prev) => new Set([...prev, disclosure.id]));
      toast.success(`${disclosure.title} acknowledged.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save acknowledgment.");
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">Disclosures</p>
              <p className="portal-meta">
                Watch each module and confirm you understand and will comply with all state and
                national regulations.
              </p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          {loading ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading disclosures...</span>
              </div>
            </div>
          ) : error ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="admin-error">{error}</p>
            </div>
          ) : disclosures.length === 0 ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="portal-panel-note">No disclosure modules are published yet. Check back soon.</p>
            </div>
          ) : (
            <>
              <div className="carrier-sheet-panel portal-profile-panel">
                <div className="portal-profile-progress-head">
                  <strong>
                    {completedCount} of {disclosures.length} modules acknowledged
                  </strong>
                  {allDone && (
                    <span className="portal-phase-badge phase-complete">
                      <CheckCircle2 size={12} aria-hidden="true" style={{ marginRight: 6 }} />
                      All done
                    </span>
                  )}
                </div>
                <div
                  className="portal-profile-progress-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={disclosures.length}
                  aria-valuenow={completedCount}
                >
                  <span style={{ width: `${(completedCount / disclosures.length) * 100}%` }} />
                </div>
              </div>

              {disclosures.map((disclosure) => {
                const acknowledged = acknowledgedIds.has(disclosure.id);
                return (
                  <div key={disclosure.id} className="carrier-sheet-panel portal-profile-panel">
                    <div className="carrier-sheet-panel-head">
                      <div>
                        <h2>
                          {acknowledged ? (
                            <CheckCircle2
                              size={18}
                              aria-hidden="true"
                              className="portal-disclosure-check done"
                            />
                          ) : (
                            <Circle size={18} aria-hidden="true" className="portal-disclosure-check" />
                          )}
                          {disclosure.title}
                        </h2>
                        <p>{disclosure.description}</p>
                      </div>
                    </div>

                    {disclosure.video_url ? (
                      <DisclosureVideo videoUrl={disclosure.video_url} />
                    ) : (
                      <p className="portal-panel-note portal-disclosure-pending-video">
                        <PlaySquare size={16} aria-hidden="true" />
                        Video coming soon — review the module title above and acknowledge below.
                      </p>
                    )}

                    {acknowledged ? (
                      <p className="portal-panel-note">
                        You&apos;ve acknowledged this disclosure.
                      </p>
                    ) : (
                      <div className="admin-form-actions">
                        <button
                          type="button"
                          className="admin-primary-btn"
                          disabled={acknowledgingId === disclosure.id}
                          onClick={() => void handleAcknowledge(disclosure)}
                        >
                          {acknowledgingId === disclosure.id
                            ? "Saving..."
                            : "I understand and agree to comply"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
