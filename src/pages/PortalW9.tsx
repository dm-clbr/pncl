import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck2 } from "lucide-react";
import W9SigningStep from "@/components/W9SigningStep";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import BottomNav from "@/components/portal/BottomNav";
import Pane from "@/components/portal/Pane";
import ListRow from "@/components/portal/ListRow";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import {
  fetchPortalW9Document,
  getDefaultW9Values,
  submitPortalW9,
  type SubmitPortalW9Payload,
} from "@/lib/portal-w9";
import { usePortalW9 } from "@/hooks/usePortalW9";
import { refreshPortalUser } from "@/lib/portal-messages";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/onboarding.css";
import "@/styles/portal-forms.css";

export default function PortalW9() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { w9, submitted, loading, setW9 } = usePortalW9();
  const [prefillLegalName, setPrefillLegalName] = useState("");
  const [prefillReady, setPrefillReady] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = "W-9 Form — PNCL Portal";
    trackPageView("portal_w9");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user || submitted) {
      setPrefillReady(submitted);
      return;
    }

    let cancelled = false;

    void fetchPortalProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        const defaults = getDefaultW9Values(user, profile ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
        } : null);
        setPrefillLegalName(defaults.legalName);
      })
      .catch(() => {
        if (cancelled) return;
        setPrefillLegalName(getDefaultW9Values(user).legalName);
      })
      .finally(() => {
        if (!cancelled) setPrefillReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user, submitted]);

  useEffect(() => {
    const token = session?.access_token;
    if (!submitted || !token) {
      setPdfUrl(null);
      return;
    }

    let cancelled = false;

    void fetchPortalW9Document(token)
      .then(({ downloadUrl }) => {
        if (!cancelled) setPdfUrl(downloadUrl);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, submitted]);

  const signedDate = useMemo(() => {
    if (!w9?.signedAt) return null;
    return new Date(w9.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [w9?.signedAt]);

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";
  // Presentation only: the masthead avatar falls back to initials, since the
  // page holds no photo and adding a profile hook here would be a data change.
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const handleSubmit = async (payload: SubmitPortalW9Payload) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("You must be signed in to submit your W-9.");
    }

    const saved = await submitPortalW9(token, payload);
    setW9(saved);
    await refreshPortalUser();
    toast.success("W-9 submitted. A PDF copy was saved to your profile.");
    navigate("/portal", { replace: true });
  };

  return (
    <div className="home2-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash pforms-page">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader name={displayName} email={user?.email} initials={initials} subpage />
          <PortalSubpageHeader
            title="Form W-9"
            backTo="/portal"
            backLabel="Back to portal"
          />

          {loading && (
            <Pane>
              <div className="pforms-loading" aria-busy="true">
                <p className="portal-panel-note">Loading W-9...</p>
                <Skeleton variant="row" />
                <Skeleton variant="tile" />
              </div>
            </Pane>
          )}

          {!loading && submitted && w9 && (
            <Pane title="W-9 on file">
              <p className="portal-panel-note">
                Your Form W-9 was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                <strong>{w9.legalName}</strong>.
              </p>
              {pdfUrl ? (
                <ListRow
                  label="Download signed PDF"
                  icon={<FileCheck2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                  href={pdfUrl}
                />
              ) : (
                <ListRow
                  label="Download signed PDF"
                  icon={<FileCheck2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                  onClick={() => {
                    const token = session?.access_token;
                    if (!token) return;
                    void fetchPortalW9Document(token)
                      .then(({ downloadUrl }) => {
                        window.open(downloadUrl, "_blank", "noopener,noreferrer");
                      })
                      .catch((err) => {
                        toast.error(err instanceof Error ? err.message : "Unable to load PDF.");
                      });
                  }}
                />
              )}
              <p className="portal-panel-note">Need to update your W-9? Contact PNCL support.</p>
            </Pane>
          )}

          {!loading && !submitted && prefillReady && (
            <W9SigningStep
              className="portal-w9-signing"
              eyebrow="Portal"
              title="Complete your W-9"
              lead="Fill in the highlighted fields on Form W-9 and confirm the Part II certification. A completed PDF will be saved to your profile."
              finishLabel="Submit W-9 to PNCL"
              prefillLegalName={prefillLegalName}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
