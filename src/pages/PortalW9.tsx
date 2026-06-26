import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import W9SigningStep from "@/components/W9SigningStep";
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
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">Form W-9</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal/profile" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to profile
            </Link>
          </header>

          {loading && (
            <div className="portal-incentives-loading">
              <span className="onboarding-spinner" aria-hidden="true" />
              <span>Loading W-9...</span>
            </div>
          )}

          {!loading && submitted && w9 && (
            <div className="carrier-sheet-panel portal-w9-panel">
              <div className="portal-w9-submitted">
                <h1 className="h3">W-9 on file</h1>
                <p className="portal-panel-note">
                  Your Form W-9 was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                  <strong>{w9.legalName}</strong>.
                </p>
                {pdfUrl ? (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-w9-aside-pdf"
                  >
                    Download signed PDF
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="portal-w9-aside-pdf"
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
                  >
                    Download signed PDF
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                )}
                <p className="portal-panel-note">
                  Need to update your W-9? Contact PNCL support.
                </p>
              </div>
            </div>
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
    </div>
  );
}
