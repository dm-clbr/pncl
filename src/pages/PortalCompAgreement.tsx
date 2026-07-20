import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, FileSignature } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalCompAttachments,
  signPortalCompAttachment,
  type PortalCompAttachment,
} from "@/lib/portal-comp-attachments";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

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
    <div className="carrier-sheet-panel portal-profile-panel portal-comp-signing-panel">
      <div className="carrier-sheet-panel-head">
        <div>
          <p className="portal-welcome">Compensation attachment</p>
          <h2>{attachment.title}</h2>
          <p className="portal-panel-note">
            Assigned {formatDate(attachment.assignedAt)}. Review the full document, then sign in
            the panel on the right.
          </p>
        </div>
      </div>

      <div className="portal-comp-signing-layout">
        <div className="portal-comp-signing-doc">
          {attachment.documentUrl ? (
            <iframe
              title={`${attachment.title} preview`}
              src={attachment.documentUrl}
              className="portal-comp-signing-pdf"
            />
          ) : (
            <p className="admin-error">The document could not be loaded. Contact PNCL support.</p>
          )}
        </div>

        <aside className="portal-comp-signing-side" aria-label="Comp attachment signing">
          <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="admin-field">
              <span>Type your legal name to sign</span>
              <input
                type="text"
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                placeholder="Your legal first and last name"
                autoComplete="name"
                required
              />
            </label>

            <label className="admin-field admin-field-checkbox">
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
                  className="portal-w9-aside-pdf"
                >
                  Open PDF in new tab
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </p>
            )}

            <div className="admin-form-actions">
              <button type="submit" className="admin-primary-btn" disabled={submitting}>
                <FileSignature size={16} aria-hidden="true" />
                {submitting ? "Signing…" : "Sign comp attachment"}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
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
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">Comp agreement</p>
              <p className="portal-meta">
                Review and sign your compensation attachment so PNCL knows how to pay you.
              </p>
            </div>
            <Link to="/portal/profile?tab=documents" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to profile
            </Link>
          </header>

          {loading ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading comp attachments...</span>
              </div>
            </div>
          ) : error ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <p className="admin-error">{error}</p>
            </div>
          ) : attachments.length === 0 ? (
            <div className="carrier-sheet-panel portal-profile-panel">
              <div className="carrier-sheet-panel-head">
                <div>
                  <h2>No comp attachment yet</h2>
                  <p>
                    PNCL assigns your compensation attachment after your Independent Contractor
                    Agreement is signed. You&apos;ll get an email when it&apos;s ready — check back
                    here to sign it.
                  </p>
                </div>
              </div>
            </div>
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
                <div className="carrier-sheet-panel portal-profile-panel">
                  <div className="portal-w9-submitted">
                    <h1 className="h3">Comp attachment on file</h1>
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
                          className="portal-w9-aside-pdf"
                        >
                          Download signed PDF
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      </>
                    ) : (
                      <p className="portal-panel-note">Contact PNCL support if you need a copy.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
