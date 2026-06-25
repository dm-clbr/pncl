import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import IcaSigningStep from "@/components/IcaSigningStep";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import {
  fetchPortalIcaDocument,
  getDefaultIcaPrefill,
  submitPortalIca,
} from "@/lib/portal-ica";
import { usePortalIca } from "@/hooks/usePortalIca";
import { refreshPortalUser } from "@/lib/portal-messages";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/onboarding.css";

export default function PortalIca() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { ica, submitted, loading, setIca } = usePortalIca();
  const [prefill, setPrefill] = useState({ legalName: "", email: "" });
  const [prefillReady, setPrefillReady] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Independent Contractor Agreement — PNCL Portal";
    trackPageView("portal_ica");
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
        setPrefill(getDefaultIcaPrefill(user, profile ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
        } : null));
      })
      .catch(() => {
        if (cancelled) return;
        setPrefill(getDefaultIcaPrefill(user));
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

    void fetchPortalIcaDocument(token)
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
    if (!ica?.signedAt) return null;
    return new Date(ica.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [ica?.signedAt]);

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";

  const handleSubmit = async (payload: Parameters<typeof submitPortalIca>[1]) => {
    const token = session?.access_token;
    if (!token) {
      throw new Error("You must be signed in to sign the agreement.");
    }

    const saved = await submitPortalIca(token, payload);
    setIca(saved);
    await refreshPortalUser();
    toast.success("Agreement signed. A PDF copy was saved to your profile.");
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
              <p className="portal-welcome">Independent Contractor Agreement</p>
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
              <span>Loading agreement...</span>
            </div>
          )}

          {!loading && submitted && ica && (
            <div className="carrier-sheet-panel portal-w9-panel">
              <div className="portal-w9-submitted">
                <h1 className="h3">Agreement on file</h1>
                <p className="portal-panel-note">
                  Your Independent Contractor Agreement was signed{signedDate ? ` on ${signedDate}` : ""} for{" "}
                  <strong>{ica.legalName}</strong>.
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
                      void fetchPortalIcaDocument(token)
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
                  Need a new agreement? Contact PNCL support.
                </p>
              </div>
            </div>
          )}

          {!loading && !submitted && prefillReady && (
            <IcaSigningStep
              className="portal-ica-signing"
              eyebrow="Portal"
              title="Review and sign your agreement"
              lead="Complete the highlighted fields, draw your signature, and confirm the acknowledgments. A signed PDF will be saved to your profile."
              finishLabel="Sign and save to profile"
              prefillLegalName={prefill.legalName}
              prefillEmail={prefill.email}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </main>
    </div>
  );
}
