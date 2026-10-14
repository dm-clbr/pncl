import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, FileSignature } from "lucide-react";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
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

function PendingAttachmentCard({
  attachment,
  accessToken,
  defaultName,
  onSigned,
}: {
  attachment: PortalCompAttachment;
  accessToken: string;
  defaultName: string;
  onSigned: (updated: PortalCompAttachment) => void;
}) {
  const [signatureName, setSignatureName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!signatureName.trim()) {
      toast.error("Type your legal name to sign.");
      return;
    }
    if (!agreed) {
      toast.error("Please confirm you agree to the compensation attachment.");
      return;
    }

    setSubmitting(true);
    try {
      const { attachment: updated, message } = await signPortalCompAttachment(accessToken, {
        attachmentId: attachment.id,
        signatureName: signatureName.trim(),
        agreementAccepted: true,
      });
      toast.success(message);
      onSigned(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign comp attachment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Pane title={attachment.title}>
      <p className="portal-panel-note">
        Assigned {formatDate(attachment.assignedAt)}. Review the full document, then sign below.
      </p>

      <div className="portal-comp-signing-layout">
        <div className="portal-comp-signing-doc">
          {attachment.documentUrl ? (
            <iframe
              title={`${attachment.title} preview`}
              src={attachment.documentUrl}
              className="portal-comp-signing-pdf"
            />
          ) : (
            <p className="ptools-error" role="alert">The document could not be loaded. Contact PNCL support.</p>
          )}
        </div>

        <aside className="portal-comp-signing-side" aria-label="Comp attachment signing">
          <form className="pcomp-form" onSubmit={(event) => void handleSubmit(event)}>
            <Field
              label="Type your legal name to sign"
              id={`comp-signature-${attachment.id}`}
              type="text"
              value={signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
              placeholder="Your legal first and last name"
              autoComplete="name"
              required
            />

            <label className="pcomp-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              <span>
                I have reviewed the compensation attachment and agree to its terms. Typing my name
                above constitutes my electronic signature.
              </span>
            </label>

            {attachment.documentUrl && (
              <p className="portal-panel-note">
                <a
                  href={attachment.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ptools-cta"
                >
                  Open PDF in new tab
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </p>
            )}

            <div className="pcomp-actions">
              <button type="submit" className="ptools-cta" disabled={submitting}>
                <FileSignature size={16} aria-hidden="true" />
                {submitting ? "Signing…" : "Sign comp attachment"}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </Pane>
  );
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
            <EmptyState title="No comp attachment yet" body="PNCL assigns your compensation attachment after your Independent Contractor Agreement is signed. You'll get an email when it's ready — check back here to sign it." />
          </Pane>
        ) : (
          <>
            {pendingAttachment && (
              <PendingAttachmentCard
                attachment={pendingAttachment}
                accessToken={session?.access_token ?? ""}
                defaultName={defaultName}
                onSigned={handleSigned}
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
