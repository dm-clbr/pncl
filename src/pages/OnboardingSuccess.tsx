import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import Skeleton from "@/components/portal/Skeleton";
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
      <PortalAuthLayout>
        <StatusBadge tone="error">Invalid Link</StatusBadge>
        <h1 className="pauth-title">This onboarding link is incomplete.</h1>
        <p className="pauth-lede">Please return to the onboarding form or contact PNCL support.</p>
        <div className="pauth-actions">
          <Link to="/onboarding" className="pauth-btn is-primary">
            Back to Onboarding
          </Link>
        </div>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout>
      {viewState === "loading" && (
        <>
          <StatusBadge tone="pending">Loading</StatusBadge>
          <h1 className="pauth-title">Checking your PNCL account…</h1>
          <p className="pauth-lede">Please wait while we load your onboarding status.</p>
          <div className="pauth-loading" role="status" aria-busy="true" aria-label="Loading">
            <Skeleton variant="text" width="72%" />
            <Skeleton variant="row" />
          </div>
        </>
      )}

      {viewState === "creating" && (
        <>
          <StatusBadge tone="pending">Creating Email</StatusBadge>
          <h1 className="pauth-title">Creating your PNCL email…</h1>
          <p className="pauth-lede">We&apos;re setting up your company email and portal account now.</p>
          <div className="pauth-loading" role="status" aria-busy="true" aria-label="Creating your PNCL email">
            <Skeleton variant="text" width="64%" />
            <Skeleton variant="row" />
          </div>
        </>
      )}

      {viewState === "ready" && (
        <>
          <StatusBadge tone="ready">Email Ready</StatusBadge>
          <h1 className="pauth-title">Set up your PNCL Gmail account</h1>
          {email && (
            <div className="pauth-note">
              <span className="pauth-note-label">Your new PNCL email</span>
              <strong className="pauth-note-value">{email}</strong>
            </div>
          )}
          <p className="pauth-lede">
            Start with Gmail. You&apos;ll use the temporary password once, then Google will ask you to
            create your own password. The PNCL portal uses <strong>Sign in with Google</strong>, so there
            is no separate portal password.
          </p>
          <ol className="pauth-steps">
            <li>Show and copy your temporary Gmail password</li>
            <li>Open Gmail and create your permanent Google password</li>
            <li>Return to the PNCL portal and choose Sign in with Google</li>
          </ol>
          <div className="pauth-actions">
            <button
              type="button"
              className="pauth-btn is-primary"
              onClick={handleReveal}
              disabled={revealing}
            >
              {revealing ? "Loading…" : "Show Temporary Gmail Password"}
            </button>
          </div>
          <p className="pauth-note-text">
            This secure link is available for 24 hours. You can reopen it and show the temporary
            password again until Gmail setup is complete.
          </p>
        </>
      )}

      {showCredentials && (
        <>
          <StatusBadge tone="ready">Step 1 of 2</StatusBadge>
          <h1 className="pauth-title">Set up Gmail first</h1>
          <p className="pauth-lede">
            Use these details on Google&apos;s sign-in page. This is not a separate PNCL portal password.
          </p>
          {email && (
            <div className="pauth-note">
              <span className="pauth-note-label">PNCL Gmail address</span>
              <strong className="pauth-note-value">{email}</strong>
            </div>
          )}
          {revealed && (
            <>
              <div className="pauth-note" aria-live="polite">
                <span className="pauth-note-label">Temporary Gmail password</span>
                <strong className="pauth-note-value is-secret">{revealed.temporaryPassword}</strong>
                <span className="pauth-note-hint">Paste it exactly as shown. Google will ask you to replace it.</span>
              </div>
              <div className="pauth-actions">
                <button
                  type="button"
                  className="pauth-btn is-primary"
                  onClick={() => copyText(revealed.temporaryPassword, "Temporary password")}
                >
                  Copy Temporary Password
                </button>
                <button type="button" className="pauth-btn" onClick={() => copyText(revealed.email, "Email")}>
                  Copy Email
                </button>
              </div>
            </>
          )}
          {viewState === "viewed" && !revealed && credentialsAvailable && (
            <div className="pauth-banner">
              <p className="pauth-banner-title">Need the password again?</p>
              <p>This secure link can show it again until you finish signing in to Gmail.</p>
              <div className="pauth-actions">
                <button
                  type="button"
                  className="pauth-btn is-primary"
                  onClick={handleReveal}
                  disabled={revealing}
                >
                  {revealing ? "Loading…" : "Show Temporary Password"}
                </button>
              </div>
            </div>
          )}
          {viewState === "viewed" && !revealed && !credentialsAvailable && (
            <div className="pauth-banner" role="alert">
              <p className="pauth-banner-title">The temporary password is no longer available from this link.</p>
              <p>Contact PNCL support for a new one. If an admin already issued a new password, use the newest password only.</p>
            </div>
          )}
          <ol className="pauth-steps">
            <li>Copy the email and temporary password above</li>
            <li>Open Gmail and sign in with those exact details</li>
            <li>Create your permanent Google password when prompted</li>
          </ol>
          <div className="pauth-actions">
            <a
              href={revealed?.gmailUrl ?? gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pauth-btn is-primary"
            >
              Open Gmail
            </a>
          </div>

          <details className="pauth-details">
            <summary>Temporary password not working?</summary>
            <ul>
              <li>Use the copy button so no extra spaces are added.</li>
              <li>Confirm Google is signing in to <strong>{email}</strong>, not another account.</li>
              <li>If an admin sent a newer temporary password, the older one will no longer work.</li>
              <li>If Google shows <strong>Verify it&apos;s you</strong> and phone verification fails, stop retrying and contact PNCL support.</li>
            </ul>
          </details>

          <div className="pauth-next">
            <StatusBadge tone="neutral">Step 2 of 2</StatusBadge>
            <h2 className="pauth-subtitle">After Gmail accepts your new password</h2>
            <p className="pauth-lede">Return to the PNCL portal and choose <strong>Sign in with Google</strong> using your PNCL email.</p>
            <div className="pauth-actions">
              <Link to="/portal/login" className="pauth-btn">
                Continue to PNCL Portal
              </Link>
              <button
                type="button"
                className="pauth-btn"
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
          <h1 className="pauth-title">We couldn&apos;t finish creating your PNCL email.</h1>
          <p className="pauth-lede">
            {statusData?.message ?? "Your progress is saved. Retry the failed step or contact PNCL support."}
          </p>
          {statusData?.failedStep && (
            <p className="pauth-note-text">
              Step needing attention: <strong>{statusData.failedStep.replace(/_/g, " ")}</strong>
            </p>
          )}
          <div className="pauth-actions">
            {statusData?.retryable && (
              <button
                type="button"
                className="pauth-btn is-primary"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                {retrying ? "Retrying…" : "Retry saved enrollment"}
              </button>
            )}
            <Link to="/contact" className="pauth-btn">
              Contact Support
            </Link>
          </div>
          {import.meta.env.DEV && (statusData?.error || statusData?.email || onboardingId) && (
            <p className="pauth-banner is-diagnostic">
              {onboardingId && <>Onboarding ID: {onboardingId}{"\n"}</>}
              {statusData?.email && <>Email: {statusData.email}{"\n"}</>}
              {statusData?.error && <>Error: {statusData.error}</>}
            </p>
          )}
        </>
      )}

      {viewState === "expired" && (
        <>
          <StatusBadge tone="error">Link Expired</StatusBadge>
          <h1 className="pauth-title">This sign-in link has expired.</h1>
          <p className="pauth-lede">
            Please contact PNCL support or an admin to get a new temporary password.
          </p>
          <div className="pauth-actions">
            <Link to="/contact" className="pauth-btn is-primary">
              Contact Support
            </Link>
          </div>
        </>
      )}

      {pollError && viewState !== "failed" && viewState !== "expired" && (
        <p className="pauth-banner" role="alert">{pollError}</p>
      )}
    </PortalAuthLayout>
  );
}

/** The tone still names the state; Chip turns it into a glyph, so colour never
    carries the meaning on its own (docs/DESIGN.md, Chip). */
const BADGE_VARIANT = {
  pending: "pending",
  ready: "active",
  error: "inactive",
  neutral: "neutral",
} as const;

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "pending" | "ready" | "error" | "neutral";
}) {
  return <Chip variant={BADGE_VARIANT[tone]}>{children}</Chip>;
}
