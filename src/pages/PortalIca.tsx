import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck2 } from "lucide-react";
import IcaSigningStep from "@/components/IcaSigningStep";
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
import "@/styles/portal-forms.css";

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
        } : null, profile?.recovery_email));
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
  // Presentation only: the masthead avatar falls back to initials, since the
  // page holds no photo and adding a profile hook here would be a data change.
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

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
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash pforms-page">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader name={displayName} email={user?.email} initials={initials} subpage />
          <PortalSubpageHeader
            title="Independent Contractor Agreement"
            backTo="/portal"
            backLabel="Back to portal"
          />

          {loading && (
            <Pane>
              <div className="pforms-loading" aria-busy="true">
                <p className="portal-panel-note">Loading agreement...</p>
                <Skeleton variant="row" />
                <Skeleton variant="tile" />
              </div>
            </Pane>
          )}

          {!loading && submitted && ica && (
            <Pane title="Agreement on file">
              <p className="portal-panel-note">
                Your Independent Contractor Agreement was signed{signedDate ? ` on ${signedDate}` : ""} for{" "}
                <strong>{ica.legalName}</strong>.
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
                    void fetchPortalIcaDocument(token)
                      .then(({ downloadUrl }) => {
                        window.open(downloadUrl, "_blank", "noopener,noreferrer");
                      })
                      .catch((err) => {
                        toast.error(err instanceof Error ? err.message : "Unable to load PDF.");
                      });
                  }}
                />
              )}
              <p className="portal-panel-note">Need a new agreement? Contact PNCL support.</p>
            </Pane>
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

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
