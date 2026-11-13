import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileCheck2 } from "lucide-react";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import BottomNav from "@/components/portal/BottomNav";
import Pane from "@/components/portal/Pane";
import DirectDepositForm from "@/components/DirectDepositForm";
import ListRow from "@/components/portal/ListRow";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPortalProfile } from "@/lib/portal-profile";
import {
  EMPTY_DIRECT_DEPOSIT_FORM,
  getDefaultDirectDepositValues,
  getDirectDepositPdfUrl,
  submitPortalDirectDeposit,
  type PortalDirectDepositFormValues,
} from "@/lib/portal-direct-deposit";
import { refreshPortalUser } from "@/lib/portal-messages";
import { usePortalDirectDeposit } from "@/hooks/usePortalDirectDeposit";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";
import "@/styles/portal-forms.css";

export default function PortalDirectDeposit() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { directDeposit, submitted, loading, setDirectDeposit } = usePortalDirectDeposit();
  const [form, setForm] = useState<PortalDirectDepositFormValues>(EMPTY_DIRECT_DEPOSIT_FORM);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Direct Deposit — PNCL Portal";
    trackPageView("portal_direct_deposit");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user || submitted) return;

    let cancelled = false;

    void fetchPortalProfile(user.id)
      .then((profile) => {
        if (cancelled) return;
        setForm(getDefaultDirectDepositValues(user, profile ? {
          firstName: profile.first_name,
          lastName: profile.last_name,
        } : null));
      })
      .catch(() => {
        if (cancelled) return;
        setForm(getDefaultDirectDepositValues(user));
      });

    return () => {
      cancelled = true;
    };
  }, [user, submitted]);

  useEffect(() => {
    if (!directDeposit?.pdfPath) {
      setPdfUrl(null);
      return;
    }

    let cancelled = false;

    void getDirectDepositPdfUrl(directDeposit.pdfPath)
      .then((url) => {
        if (!cancelled) setPdfUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [directDeposit?.pdfPath]);

  const signedDate = useMemo(() => {
    if (!directDeposit?.signedAt) return null;
    return new Date(directDeposit.signedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [directDeposit?.signedAt]);

  const handleSubmit = async (values: PortalDirectDepositFormValues) => {
    const token = session?.access_token;
    if (!token) throw new Error("Please sign in to submit your direct deposit form.");
    const saved = await submitPortalDirectDeposit(token, values);
    setDirectDeposit(saved);
    await refreshPortalUser();
    toast.success("Direct deposit form submitted. A PDF copy was saved to your profile.");
    navigate("/portal", { replace: true });
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";
  // Presentation only: the masthead avatar falls back to initials, since the
  // page holds no photo and adding a profile hook here would be a data change.
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="home2-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash pforms-page">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader name={displayName} email={user?.email} initials={initials} subpage />
          <PortalSubpageHeader
            title="Direct deposit"
            backTo="/portal"
            backLabel="Back to portal"
          />

          {/* One capped column: a 1320px wrap would stretch a five-character ZIP
              field across the whole screen. */}
          <div className="pforms-dd-col">
            {loading && (
              <Pane>
                <div className="pforms-loading" aria-busy="true">
                  <p className="portal-panel-note">Loading direct deposit form...</p>
                  <Skeleton variant="row" />
                  <Skeleton variant="tile" />
                </div>
              </Pane>
            )}

            {!loading && submitted && directDeposit && (
              <Pane title="Direct deposit on file">
                <p className="portal-panel-note">
                  Your direct deposit form was submitted{signedDate ? ` on ${signedDate}` : ""} for{" "}
                  <strong>{directDeposit.legalName}</strong>.
                </p>
                {pdfUrl && (
                  <ListRow
                    label="Download signed PDF"
                    icon={<FileCheck2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                    href={pdfUrl}
                  />
                )}
                <p className="portal-panel-note">
                  Need to update your banking information? Contact PNCL support.
                </p>
              </Pane>
            )}

            {!loading && !submitted && (
              <DirectDepositForm initialValues={form} onSubmit={handleSubmit} />
            )}

            <Pane as="aside" title="About this form">
              <p className="pforms-dd-lead">
                This digital form replaces mailing a paper direct deposit request. Once you submit,
                PNCL receives your banking details and a signed PDF is saved to your profile for
                your records.
              </p>
              <p className="pforms-dd-lead">
                Questions? Email <a href="mailto:ap@thepncl.com">ap@thepncl.com</a>.
              </p>
            </Pane>
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
