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
    return true;
  } catch {
    toast.error(`Unable to copy ${label.toLowerCase()}`);
    return false;
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
  const [revealError, setRevealError] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const passwordCardRef = useRef<HTMLElement | null>(null);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  const viewState = resolveOnboardingViewState(statusData, revealed);
  const email = revealed?.email ?? statusData?.email ?? "";
  const gmailUrl = revealed?.gmailUrl ?? statusData?.gmailUrl ?? (email ? buildGmailUrl(email) : "");
  const portalInviteSent = statusData?.portalInviteSent ?? false;
  const showCredentials = viewState === "revealed" || viewState === "viewed";
  const credentialsAvailable = statusData?.credentialsAvailable ?? (viewState === "ready");

  useEffect(() => {
    if (revealed) passwordCardRef.current?.focus();
  }, [revealed]);

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
    setRevealError(null);
    setPasswordCopied(false);
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
        setRevealError("Refresh this page after PNCL finishes updating the secure handoff.");
      } else {
        setRevealError(err.message ?? "Unable to show your temporary password. Please try again.");
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

      {(viewState === "ready" || showCredentials) && (
        <>
          <StatusBadge tone="ready">Step 1 of 2 · Gmail setup</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Your PNCL Gmail account</h2>
          <p className="lead">
            {revealed || credentialsAvailable
              ? "Start with the temporary password below to sign in for the first time."
              : "Use your Google password if you’ve already completed Gmail setup."}
          </p>
          {email && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">PNCL Gmail address</span>
              <strong>{email}</strong>
              {revealed && (
                <button type="button" className="btn btn-ghost onboarding-copy-email" onClick={() => copyText(revealed.email, "Email")}>
                  Copy Email
                </button>
              )}
            </div>
          )}
          <section
            className="onboarding-password-card"
            aria-labelledby="temporary-password-heading"
            ref={passwordCardRef}
            tabIndex={-1}
          >
            <span className="onboarding-password-eyebrow">First-time Gmail sign-in</span>
            <h3 id="temporary-password-heading">Your temporary Gmail password</h3>
            {revealed ? (
              <>
                <strong className="onboarding-password">{revealed.temporaryPassword}</strong>
                <button
                  type="button"
                  className="btn onboarding-password-action"
                  onClick={async () => setPasswordCopied(await copyText(revealed.temporaryPassword, "Temporary password"))}
                >
                  {passwordCopied ? "Password copied — copy again" : "Copy Temporary Password"}
                </button>
                <p className="onboarding-password-hint" role="status">
                  {passwordCopied ? "Copied! Next, open Gmail and paste this password." : "Copy this password and paste it into Google’s password field."}
                </p>
              </>
            ) : credentialsAvailable ? (
              <>
                <p>We&apos;ve created a temporary password for you. Show it here before opening Gmail.</p>
                <button
                  type="button"
                  className="btn onboarding-password-action"
                  onClick={handleReveal}
                  disabled={revealing}
                >
                  {revealing ? "Loading your password…" : "Show My Temporary Gmail Password"}
                </button>
                <p className="onboarding-password-hint">Use this secure link to show it again until Gmail setup is complete. The link expires after 24 hours.</p>
              </>
            ) : (
              <>
                <p>The temporary password is no longer available from this link.</p>
                <p>If you already set your Google password, use that password. Otherwise, contact PNCL support for a new temporary password.</p>
                <Link to="/contact" className="btn onboarding-password-action">Contact Support</Link>
              </>
            )}
            {revealError && <p className="onboarding-password-error" role="alert">{revealError}</p>}
          </section>
          {revealed && (
            <>
              <p className="onboarding-help-text">Google will ask you to replace this temporary password with your own.</p>
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent"
              >
                Open Gmail to Sign In <span className="arr">→</span>
              </a>
            </>
          )}
          {!revealed && credentialsAvailable && (
            <p className="onboarding-help-text">Show and copy your password first. Then open Gmail and create your own Google password.</p>
          )}

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
            <h3>After you finish Gmail setup</h3>
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
