import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import {
  buildGmailUrl,
  getOnboardingStatus,
  revealOnboardingCredentials,
  resendPortalInvite,
  retryOnboardingEnrollment,
  type OnboardingStatus,
  type OnboardingStatusResponse,
  type RevealCredentialsResponse,
} from "@/lib/onboarding-api";
import { toast } from "sonner";
import { trackPageView } from "@/lib/analytics";
import { resolveOnboardingViewState } from "@/lib/onboarding-view-state";

const POLL_INTERVAL_MS = 2500;
const PREVIEW_STATUS: OnboardingStatusResponse = {
  status: "email_created",
  email: "new.agent@thepncl.com",
  credentialsViewed: false,
  credentialsAvailable: true,
  portalInviteSent: true,
};
const PREVIEW_CREDENTIALS: RevealCredentialsResponse = {
  email: "new.agent@thepncl.com",
  temporaryPassword: "PncL-7mQ!4vX2",
  mustChangePassword: true,
  gmailUrl: buildGmailUrl("new.agent@thepncl.com"),
};
const TERMINAL_STATUSES = new Set<OnboardingStatus>([
  "email_created",
  "ready",
  "failed",
  "expired",
  "credentials_viewed",
]);

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Unable to copy ${label.toLowerCase()}`);
  }
}

export default function OnboardingSuccess() {
  const { onboardingId } = useParams<{ onboardingId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const isGmailPreview = import.meta.env.DEV && searchParams.get("preview") === "gmail";

  const [statusData, setStatusData] = useState<OnboardingStatusResponse | null>(
    isGmailPreview ? PREVIEW_STATUS : null,
  );
  const [revealed, setRevealed] = useState<RevealCredentialsResponse | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  const viewState = resolveOnboardingViewState(statusData, revealed);
  const email = revealed?.email ?? statusData?.email ?? "";
  const gmailUrl = revealed?.gmailUrl ?? statusData?.gmailUrl ?? (email ? buildGmailUrl(email) : "");
  const portalInviteSent = statusData?.portalInviteSent ?? false;
  const showCredentials = viewState === "revealed" || viewState === "viewed";
  const credentialsAvailable = statusData?.credentialsAvailable ?? false;

  const fetchStatus = useCallback(async () => {
    if (isGmailPreview) return PREVIEW_STATUS;
    if (!onboardingId || !token) {
      setPollError("Missing onboarding handoff details.");
      return null;
    }

    try {
      const data = await getOnboardingStatus(onboardingId, token);
      setStatusData(data);
      setPollError(null);
      return data;
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Unable to load onboarding status.");
      return null;
    }
  }, [isGmailPreview, onboardingId, token]);

  useEffect(() => {
    document.title = "PNCL Email Setup";
    trackPageView("employee-onboarding-success");
  }, []);

  useEffect(() => {
    if (statusData?.status !== "failed") return;

    console.error(
      `[pncl-onboarding] setup_failed | onboardingId=${onboardingId ?? ""} | workspaceEmail=${statusData.email ?? ""} | error=${statusData.error ?? "unknown"}`,
    );
  }, [statusData, onboardingId]);

  useEffect(() => {
    if (isGmailPreview) return;
    if (!onboardingId || !token) return;

    let cancelled = false;

    const poll = async () => {
      const data = await fetchStatus();
      if (cancelled || !data) return;

      if (TERMINAL_STATUSES.has(data.status) || data.credentialsViewed) {
        if (pollingRef.current) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    poll();
    pollingRef.current = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchStatus, isGmailPreview, onboardingId, token]);

  const handleReveal = async () => {
    if (isGmailPreview) {
      setRevealed(PREVIEW_CREDENTIALS);
      setStatusData({
        ...PREVIEW_STATUS,
        status: "credentials_viewed",
        credentialsViewed: true,
      });
      return;
    }
    if (!onboardingId || !token) return;

    setRevealing(true);
    try {
      const data = await revealOnboardingCredentials(onboardingId, token);
      setRevealed(data);
      setStatusData((prev) =>
        prev
          ? { ...prev, status: "credentials_viewed", credentialsViewed: true }
          : { status: "credentials_viewed", credentialsViewed: true, email: data.email, gmailUrl: data.gmailUrl },
      );
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "credentials_already_viewed") {
        setStatusData((prev) =>
          prev
            ? { ...prev, status: "credentials_viewed", credentialsViewed: true }
            : { status: "credentials_viewed", credentialsViewed: true },
        );
        toast.error("Refresh this page after PNCL finishes updating the secure handoff.");
      } else {
        toast.error(err.message ?? "Unable to reveal sign-in instructions.");
      }
    } finally {
      setRevealing(false);
    }
  };

  const handleResendInvite = async () => {
    if (isGmailPreview) {
      toast.success("Preview: portal welcome email would be sent.");
      return;
    }
    if (!onboardingId || !token) return;

    setResendingInvite(true);
    try {
      await resendPortalInvite(onboardingId, token);
      toast.success("Portal welcome email sent. Check your PNCL inbox and sign in with Google.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resend portal welcome email.");
    } finally {
      setResendingInvite(false);
    }
  };

  const handleRetry = async () => {
    if (!onboardingId || !token) return;
    setRetrying(true);
    try {
      await retryOnboardingEnrollment(onboardingId, token);
      toast.success("Your saved enrollment is being resumed.");
      setStatusData(null);
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to retry account setup.");
    } finally {
      setRetrying(false);
    }
  };

  if ((!onboardingId || !token) && !isGmailPreview) {
    return (
      <OnboardingLayout>
        <StatusBadge tone="error">Invalid Link</StatusBadge>
        <h2 className="h3" style={{ margin: "1rem 0" }}>This onboarding link is incomplete.</h2>
        <p className="lead">Please return to the onboarding form or contact PNCL support.</p>
        <Link to="/onboarding" className="btn btn-accent" style={{ marginTop: "1.5rem" }}>
          Back to Onboarding <span className="arr">→</span>
        </Link>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      <div className="onboarding-step">
      {viewState === "loading" && (
        <>
          <StatusBadge tone="pending">Loading</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Checking your PNCL account…</h2>
          <p className="lead">Please wait while we load your onboarding status.</p>
        </>
      )}

      {viewState === "creating" && (
        <>
          <StatusBadge tone="pending">Creating Email</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Creating your PNCL email…</h2>
          <p className="lead">We&apos;re setting up your company email and portal account now.</p>
          <div className="onboarding-spinner" aria-hidden="true" />
        </>
      )}

      {viewState === "ready" && (
        <>
          <StatusBadge tone="ready">Email Ready</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Set up your PNCL Gmail account</h2>
          {email && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">Your new PNCL email</span>
              <strong>{email}</strong>
            </div>
          )}
          <p className="lead">
            Start with Gmail. You&apos;ll use the temporary password once, then Google will ask you to
            create your own password. The PNCL portal uses <strong>Sign in with Google</strong>, so there
            is no separate portal password.
          </p>
          <ol className="onboarding-steps">
            <li>Show and copy your temporary Gmail password</li>
            <li>Open Gmail and create your permanent Google password</li>
            <li>Return to the PNCL portal and choose Sign in with Google</li>
          </ol>
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleReveal}
            disabled={revealing}
            style={{ marginTop: "0.5rem" }}
          >
            {revealing ? "Loading…" : <>Show Temporary Gmail Password <span className="arr">→</span></>}
          </button>
          <p className="onboarding-help-text">
            This secure link is available for 24 hours. You can reopen it and show the temporary
            password again until Gmail setup is complete.
          </p>
        </>
      )}

      {showCredentials && (
        <>
          <StatusBadge tone="ready">Step 1 of 2</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Set up Gmail first</h2>
          <p className="lead">
            Use these details on Google&apos;s sign-in page. This is not a separate PNCL portal password.
          </p>
          {email && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">PNCL Gmail address</span>
              <strong>{email}</strong>
            </div>
          )}
          {revealed && (
            <>
              <div className="onboarding-email-block onboarding-password-block" aria-live="polite">
                <span className="onboarding-email-label">Temporary Gmail password</span>
                <strong className="onboarding-password">{revealed.temporaryPassword}</strong>
                <span className="onboarding-field-hint">Paste it exactly as shown. Google will ask you to replace it.</span>
              </div>
              <div className="onboarding-action-row">
                <button type="button" className="btn btn-ghost" onClick={() => copyText(revealed.email, "Email")}>
                  Copy Email
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => copyText(revealed.temporaryPassword, "Temporary password")}
                >
                  Copy Temporary Password
                </button>
              </div>
            </>
          )}
          {viewState === "viewed" && !revealed && credentialsAvailable && (
            <div className="onboarding-reveal-again">
              <strong>Need the password again?</strong>
              <p>This secure link can show it again until you finish signing in to Gmail.</p>
              <button
                type="button"
                className="btn btn-accent"
                onClick={handleReveal}
                disabled={revealing}
              >
                {revealing ? "Loading…" : <>Show Temporary Password <span className="arr">→</span></>}
              </button>
            </div>
          )}
          {viewState === "viewed" && !revealed && !credentialsAvailable && (
            <div className="onboarding-reveal-again tone-error">
              <strong>The temporary password is no longer available from this link.</strong>
              <p>Contact PNCL support for a new one. If an admin already issued a new password, use the newest password only.</p>
            </div>
          )}
          <ol className="onboarding-steps">
            <li>Copy the email and temporary password above</li>
            <li>Open Gmail and sign in with those exact details</li>
            <li>Create your permanent Google password when prompted</li>
          </ol>
          <div className="onboarding-action-row" style={{ marginTop: "0.75rem" }}>
            <a
              href={revealed?.gmailUrl ?? gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent"
            >
              Open Gmail <span className="arr">→</span>
            </a>
          </div>

          <details className="onboarding-troubleshooting">
            <summary>Temporary password not working?</summary>
            <ul>
              <li>Use the copy button so no extra spaces are added.</li>
              <li>Confirm Google is signing in to <strong>{email}</strong>, not another account.</li>
              <li>If an admin sent a newer temporary password, the older one will no longer work.</li>
              <li>If Google shows <strong>Verify it&apos;s you</strong> and phone verification fails, stop retrying and contact PNCL support.</li>
            </ul>
          </details>

          <div className="onboarding-next-step">
            <StatusBadge tone="neutral">Step 2 of 2</StatusBadge>
            <h3>After Gmail accepts your new password</h3>
            <p>Return to the PNCL portal and choose <strong>Sign in with Google</strong> using your PNCL email.</p>
            <div className="onboarding-action-row">
              <Link to="/portal/login" className="btn btn-ghost">
                Continue to PNCL Portal <span className="arr">→</span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleResendInvite}
                disabled={resendingInvite}
              >
                {resendingInvite
                  ? "Sending…"
                  : portalInviteSent
                    ? "Resend portal welcome email"
                    : "Send portal welcome email"}
              </button>
            </div>
          </div>
        </>
      )}

      {viewState === "failed" && (
        <>
          <StatusBadge tone="error">Setup Failed</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>We couldn&apos;t finish creating your PNCL email.</h2>
          <p className="lead">
            {statusData?.message ?? "Your progress is saved. Retry the failed step or contact PNCL support."}
          </p>
          {statusData?.failedStep && (
            <p className="onboarding-help-text">
              Step needing attention: <strong>{statusData.failedStep.replace(/_/g, " ")}</strong>
            </p>
          )}
          {statusData?.retryable && (
            <button
              type="button"
              className="btn btn-accent"
              disabled={retrying}
              onClick={() => void handleRetry()}
              style={{ marginTop: "1rem" }}
            >
              {retrying ? "Retrying…" : <>Retry saved enrollment <span className="arr">→</span></>}
            </button>
          )}
          {import.meta.env.DEV && (statusData?.error || statusData?.email || onboardingId) && (
            <p
              className="onboarding-error"
              style={{ marginTop: "1rem", textAlign: "left", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}
            >
              {onboardingId && <>Onboarding ID: {onboardingId}{"\n"}</>}
              {statusData?.email && <>Email: {statusData.email}{"\n"}</>}
              {statusData?.error && <>Error: {statusData.error}</>}
            </p>
          )}
          <Link to="/contact" className="btn btn-ghost" style={{ marginTop: "1rem" }}>
            Contact Support <span className="arr">→</span>
          </Link>
        </>
      )}

      {viewState === "expired" && (
        <>
          <StatusBadge tone="error">Link Expired</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>This sign-in link has expired.</h2>
          <p className="lead">
            Please contact PNCL support or an admin to get a new temporary password.
          </p>
          <Link to="/contact" className="btn btn-accent" style={{ marginTop: "1rem" }}>
            Contact Support <span className="arr">→</span>
          </Link>
        </>
      )}

      {pollError && viewState !== "failed" && viewState !== "expired" && (
        <p className="onboarding-error" style={{ marginTop: "1rem" }}>{pollError}</p>
      )}
      </div>
    </OnboardingLayout>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "pending" | "ready" | "error" | "neutral";
}) {
  return <span className={`onboarding-status-badge tone-${tone}`}>{children}</span>;
}
