import CompAgreementForm from "@/components/CompAgreementForm";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import Pane from "@/components/portal/Pane";
import EmptyState from "@/components/portal/EmptyState";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalCompAttachments,
  signPortalCompAttachment,
  type PortalCompAttachment,
} from "@/lib/portal-comp-attachments";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/portal-comp.css";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function PortalCompAgreement() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PortalCompAttachment[]>([]);

  useEffect(() => {
    document.title = "Comp agreement — PNCL Portal";
    trackPageView("portal_comp_agreement");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchPortalCompAttachments(token)
      .then((rows) => {
        if (cancelled) return;
        setAttachments(rows);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load comp attachments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const defaultName =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  const handleSigned = (updated: PortalCompAttachment) => {
    setAttachments((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
  };

  const pendingAttachment = attachments.find((attachment) => attachment.status === "pending") ?? null;
  const signedAttachment = attachments.find((attachment) => attachment.status === "signed") ?? null;

  return (
    <PortalToolLayout title="Compensation agreement" backTo="/portal/profile?tab=documents" backLabel="Back to profile" className="pcomp-page">
      <p className="portal-panel-note">Review and sign your compensation attachment so PNCL knows how to pay you.</p>
      <div className="ptools-stack">
        {loading ? (
          <Pane>
            <div role="status" aria-busy="true" aria-label="Loading comp attachments">
              <Skeleton variant="text" width="55%" />
              <Skeleton variant="row" />
            </div>
          </Pane>
        ) : error ? (
          <Pane><p className="ptools-error" role="alert">{error}</p></Pane>
        ) : attachments.length === 0 ? (
          <Pane>
            <EmptyState title="No comp attachment yet" body="PNCL needs to upload the compensation agreement for your onboarding flow. Contact PNCL support." />
          </Pane>
        ) : (
          <>
            {pendingAttachment && (
              <CompAgreementForm
                attachment={pendingAttachment}
                defaultName={defaultName}
                onSubmit={async input => {
                  const { attachment, message } = await signPortalCompAttachment(session?.access_token ?? "", input);
                  handleSigned(attachment);
                  toast.success(message);
                }}
              />
            )}

            {signedAttachment && !pendingAttachment && (
              <Pane title="Comp attachment on file">
                <div className="portal-w9-submitted">
                  <p className="portal-panel-note">
                    Your {signedAttachment.title} was signed
                    {signedAttachment.signedAt ? ` on ${formatDate(signedAttachment.signedAt)}` : ""}
                    {signedAttachment.signatureName ? ` by ${signedAttachment.signatureName}` : ""}.
                  </p>
                  {signedAttachment.documentUrl ? (
                    <>
                      <iframe
                        title={`${signedAttachment.title} signed copy`}
                        src={signedAttachment.documentUrl}
                        className="portal-comp-signing-pdf portal-comp-signing-pdf--signed"
                      />
                      <a
                        href={signedAttachment.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ptools-cta"
                      >
                        Download signed PDF
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    </>
                  ) : (
                    <p className="portal-panel-note">Contact PNCL support if you need a copy.</p>
                  )}
                </div>
              </Pane>
            )}
          </>
        )}
      </div>
    </PortalToolLayout>
  );
}
