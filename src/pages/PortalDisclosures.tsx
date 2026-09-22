import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, PlaySquare, RefreshCw } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  acknowledgeDisclosure,
  fetchAcknowledgedDisclosureKeys,
  fetchPortalDisclosures,
  getDisclosureAcknowledgmentKey,
  hasDisclosureVideo,
  isDisclosureCompleted,
  syncPortalTrainingVideos,
  toEmbedUrl,
  type PortalDisclosure,
} from "@/lib/portal-disclosures";
import { trackPageView } from "@/lib/analytics";
import { isAdmin, isGenesisAdmin } from "@/lib/roles";
import { toast } from "sonner";
import "@/styles/home2.css";

function DisclosureVideo({ title, videoUrl }: { title: string; videoUrl: string }) {
  const embedUrl = toEmbedUrl(videoUrl);

  if (embedUrl) {
    return (
      <div className="portal-disclosure-video">
        <iframe
          src={embedUrl}
          title={`${title} video`}
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
  const { user, session } = useAuth();
  const userId = user?.id;
  const canRefreshTraining = isAdmin(user) || isGenesisAdmin(user);
  const [disclosures, setDisclosures] = useState<PortalDisclosure[]>([]);
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.title = "Video Trainings — PNCL Portal";
    trackPageView("portal_training");
    window.scrollTo(0, 0);
  }, []);

  const loadTraining = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [modules, acked] = await Promise.all([
        fetchPortalDisclosures(),
        fetchAcknowledgedDisclosureKeys(userId),
      ]);
      setDisclosures(modules);
      setAcknowledgedKeys(acked);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load training videos.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadTraining();
  }, [loadTraining]);

  const completedCount = useMemo(
    () => disclosures.filter((disclosure) => isDisclosureCompleted(acknowledgedKeys, disclosure)).length,
    [disclosures, acknowledgedKeys],
  );
  const allDone = disclosures.length > 0 && completedCount === disclosures.length;

  const handleRefresh = async () => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast.error("Your portal session expired. Sign in again.");
      return;
    }

    setRefreshing(true);
    try {
      const result = await syncPortalTrainingVideos(accessToken);
      await loadTraining();
      toast.success(
        result.added === 0
          ? "Video trainings are already up to date."
          : `${result.added} new training video${result.added === 1 ? "" : "s"} added.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to refresh training videos.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcknowledge = async (disclosure: PortalDisclosure) => {
    if (!userId || !hasDisclosureVideo(disclosure)) return;

    setAcknowledgingId(disclosure.id);
    try {
      await acknowledgeDisclosure(userId, disclosure.id, disclosure.content_version);
      setAcknowledgedKeys((prev) => new Set([
        ...prev,
        getDisclosureAcknowledgmentKey(disclosure),
      ]));
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
              <p className="portal-welcome">Video Trainings</p>
              <p className="portal-meta">
                Complete each module in order, then confirm you understand the material.
              </p>
            </div>
            <div className="training-header-actions">
              {canRefreshTraining && (
                <button
                  type="button"
                  className="admin-back-link training-refresh-btn"
                  disabled={refreshing || loading}
                  onClick={() => void handleRefresh()}
                >
                  <RefreshCw
                    size={16}
                    aria-hidden="true"
                    className={refreshing ? "is-spinning" : undefined}
                  />
                  {refreshing ? "Checking..." : "Check for new videos"}
                </button>
              )}
              <Link to="/portal" className="admin-back-link">
                <ArrowLeft size={16} aria-hidden="true" />
                Back to portal
              </Link>
            </div>
          </header>

          {loading ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading training videos...</span>
              </div>
            </div>
          ) : error ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="admin-error">{error}</p>
            </div>
          ) : disclosures.length === 0 ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="portal-panel-note">No training modules are published yet. Check back soon.</p>
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
                const acknowledged = isDisclosureCompleted(acknowledgedKeys, disclosure);
                const hasVideo = hasDisclosureVideo(disclosure);
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

                    {hasVideo && disclosure.video_url ? (
                      <DisclosureVideo title={disclosure.title} videoUrl={disclosure.video_url} />
                    ) : (
                      <p className="portal-panel-note portal-disclosure-pending-video">
                        <PlaySquare size={16} aria-hidden="true" />
                        Video coming soon. This module can be acknowledged after the training is available.
                      </p>
                    )}

                    {acknowledged ? (
                      <p className="portal-panel-note">
                        You&apos;ve acknowledged this disclosure.
                      </p>
                    ) : hasVideo ? (
                      <div className="admin-form-actions">
                        <button
                          type="button"
                          className="admin-primary-btn"
                          disabled={acknowledgingId === disclosure.id}
                          onClick={() => void handleAcknowledge(disclosure)}
                        >
                          {acknowledgingId === disclosure.id
                            ? "Saving..."
                            : "I completed this training"}
                        </button>
                      </div>
                    ) : null}
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
