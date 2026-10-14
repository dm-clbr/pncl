import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, PlaySquare, RefreshCw } from "lucide-react";
import PortalPrimaryNav from "@/components/PortalPrimaryNav";
import BottomNav from "@/components/portal/BottomNav";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Pane from "@/components/portal/Pane";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Skeleton from "@/components/portal/Skeleton";
import Stepper from "@/components/portal/Stepper";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
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
import "@/styles/portal-training.css";

/** The video id inside an embed URL toEmbedUrl() built. YouTube is the only
    host with a thumbnail at a guessable address, so it is the only poster. */
const YOUTUBE_EMBED = /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/;

/* playsinline keeps iOS Safari from taking the tap into its own fullscreen
   player; autoplay rides the tap that mounted the iframe. */
function autoplaySrc(embedUrl: string): string {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("playsinline", "1");
  return url.toString();
}

export function DisclosureVideo({
  title,
  videoUrl,
  startPlaying = false,
}: {
  title: string;
  videoUrl: string;
  /* ponytail: the preview harness needs the played state and cannot click.
     The page always starts on the facade. */
  startPlaying?: boolean;
}) {
  const embedUrl = toEmbedUrl(videoUrl);
  const [playing, setPlaying] = useState(startPlaying);

  if (!embedUrl) {
    // Direct file URL (e.g. Supabase storage or CDN mp4). preload="metadata"
    // costs a few KB, so this one needs no facade.
    return (
      <div className="ptr-video">
        <video src={videoUrl} controls preload="metadata" />
      </div>
    );
  }

  if (!playing) {
    const posterId = YOUTUBE_EMBED.exec(embedUrl)?.[1];
    return (
      <button type="button" className="ptr-facade" onClick={() => setPlaying(true)}>
        {posterId && (
          <img
            className="ptr-poster"
            src={`https://i.ytimg.com/vi/${posterId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )}
        <span className="ptr-play" aria-hidden="true">
          <Play size={20} fill="currentColor" />
        </span>
        <span className="portal-sr">Play {title}</span>
      </button>
    );
  }

  return (
    <div className="ptr-video">
      <iframe
        src={autoplaySrc(embedUrl)}
        title={`${title} video`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export default function PortalDisclosures() {
  const { user, session } = useAuth();
  const userId = user?.id;
  const canRefreshTraining = isAdmin(user) || isGenesisAdmin(user);
  const { photoUrl, initials, displayName } = usePortalProfile(user);
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

  /* Nothing stops an agent acknowledging module 7 first, so the stepper reads
     each module's own state instead of assuming everything before the current
     step is done.
     ponytail: the seven published modules fit the rail; past about ten the
     badges crowd and this wants a count bar instead. */
  const doneSteps = useMemo(
    () => disclosures.flatMap((disclosure, index) =>
      (isDisclosureCompleted(acknowledgedKeys, disclosure) ? [index + 1] : [])),
    [disclosures, acknowledgedKeys],
  );
  const completedCount = doneSteps.length;
  const allDone = disclosures.length > 0 && completedCount === disclosures.length;
  // findIndex returns -1 once everything is done, which leaves no current step.
  const currentStep = disclosures.findIndex((_, index) => !doneSteps.includes(index + 1)) + 1;

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
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark">
        <div className="wrap portal-training-wrap">
          <PortalHeader
            subpage
            name={displayName}
            email={user?.email}
            initials={initials}
            photoUrl={photoUrl}
          />

          <PortalPrimaryNav />

          <PortalSubpageHeader
            title="Video Trainings"
            aside={
              canRefreshTraining ? (
                <button
                  type="button"
                  className="ptr-refresh"
                  disabled={refreshing || loading}
                  onClick={() => void handleRefresh()}
                >
                  <RefreshCw
                    size={16}
                    aria-hidden="true"
                    className={refreshing ? "is-spinning" : undefined}
                  />
                  <span className="ptr-refresh-label">
                    {refreshing ? "Checking..." : "Check for new videos"}
                  </span>
                </button>
              ) : undefined
            }
          />

          <p className="portal-panel-note">
            Complete each module in order, then confirm you understand the material.
          </p>

          <div className="ptr">
            {loading ? (
              <Pane title="Your progress">
                <div className="ptr-loading" role="status" aria-busy="true">
                  <span className="portal-sr">Loading your training modules</span>
                  <Skeleton variant="text" width="45%" />
                  <Skeleton variant="tile" />
                </div>
              </Pane>
            ) : error ? (
              <Pane title="Your progress">
                <p className="ptr-error" role="alert">{error}</p>
              </Pane>
            ) : disclosures.length === 0 ? (
              <Pane>
                <EmptyState
                  titleAs="h2"
                  title="No training modules are published yet"
                  body="Check back soon."
                  icon={<PlaySquare aria-hidden="true" />}
                />
              </Pane>
            ) : (
              <>
                <Pane
                  title="Your progress"
                  aside={allDone ? <Chip variant="active">All done</Chip> : undefined}
                >
                  <Stepper
                    steps={disclosures.map((disclosure) => disclosure.title)}
                    current={currentStep}
                    done={doneSteps}
                    label="Training modules"
                  />
                  <p className="ptr-count">
                    {completedCount} of {disclosures.length} modules acknowledged
                  </p>
                </Pane>

                {disclosures.map((disclosure, index) => {
                  const acknowledged = isDisclosureCompleted(acknowledgedKeys, disclosure);
                  const hasVideo = hasDisclosureVideo(disclosure);
                  return (
                    <Pane
                      key={disclosure.id}
                      title={disclosure.title}
                      aside={<span className="ptr-tag">Module {index + 1}</span>}
                    >
                      <div className="ptr-module">
                        <p className="ptr-desc">{disclosure.description}</p>

                        {hasVideo && disclosure.video_url ? (
                          <DisclosureVideo title={disclosure.title} videoUrl={disclosure.video_url} />
                        ) : (
                          <p className="ptr-soon">
                            <PlaySquare size={16} aria-hidden="true" />
                            Video coming soon. This module can be acknowledged after the training is available.
                          </p>
                        )}

                        {acknowledged ? (
                          <p className="ptr-done">
                            <Chip variant="active">Completed</Chip>
                          </p>
                        ) : hasVideo ? (
                          <button
                            type="button"
                            className="ptr-btn"
                            disabled={acknowledgingId === disclosure.id}
                            onClick={() => void handleAcknowledge(disclosure)}
                          >
                            {acknowledgingId === disclosure.id
                              ? "Saving..."
                              : "I completed this training"}
                          </button>
                        ) : null}
                      </div>
                    </Pane>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing
          block. It replaces the primary nav at 620px and below. */}
      <BottomNav />
    </div>
  );
}
