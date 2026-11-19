import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
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
const REQUEST_TIMEOUT_MS = 15000;
const POLL_TIMEOUT_MS = 120000;
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
  const isCapacityPreview = import.meta.env.DEV && searchParams.get("preview") === "capacity";

  const [statusData, setStatusData] = useState<OnboardingStatusResponse | null>(
    isGmailPreview ? PREVIEW_STATUS : isCapacityPreview ? { status: "waiting_capacity" } : null,
  );
  const [revealed, setRevealed] = useState<RevealCredentialsResponse | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const passwordCardRef = useRef<HTMLElement | null>(null);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pollError, setPollError] = useState<(Error & { code?: string; status?: number }) | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);

  const viewState = resolveOnboardingViewState(statusData, revealed);
  const email = revealed?.email ?? statusData?.email ?? "";
  const gmailUrl = revealed?.gmailUrl ?? statusData?.gmailUrl ?? (email ? buildGmailUrl(email) : "");
  const portalInviteSent = statusData?.portalInviteSent ?? false;
  const showCredentials = viewState === "revealed" || viewState === "viewed";
  const credentialsAvailable = statusData?.credentialsAvailable ?? (viewState === "ready");

  useEffect(() => {
    if (revealed) passwordCardRef.current?.focus();
  }, [revealed]);

  const refreshStatus = () => {
    if (isGmailPreview || isCapacityPreview) return;
    setStatusData(null);
    setPollError(null);
    setPollAttempt((attempt) => attempt + 1);
  };

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
    if (isGmailPreview || isCapacityPreview || !onboardingId || !token) return;

    let cancelled = false;
    let pollTimer: number | undefined;
    let requestTimer: number | undefined;
    let controller: AbortController | undefined;
    let progressStartedAt = Date.now();
    setStatusData(null);
    setRevealed(null);
    setPollError(null);

    const poll = async () => {
      controller = new AbortController();
      requestTimer = window.setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      try {
        const data = await getOnboardingStatus(onboardingId, token, controller.signal);
        if (cancelled) return;
        setStatusData(data);
        setPollError(null);
        if (data.status === "waiting_capacity") {
          progressStartedAt = Date.now();
          pollTimer = window.setTimeout(poll, 30000);
        } else if (!TERMINAL_STATUSES.has(data.status) && !data.credentialsViewed) {
          if (Date.now() - progressStartedAt >= POLL_TIMEOUT_MS) {
            setPollError(new Error("Account setup is taking longer than expected. Your progress is saved."));
          } else {
            // Schedule only after the previous request finishes; never overlap requests.
            pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch (error) {
        if (cancelled) return;
        setPollError(controller.signal.aborted
          ? new Error("The connection timed out. Your progress is saved. Please try again.")
          : error instanceof Error ? error : new Error("Unable to load onboarding status."));
      } finally {
        window.clearTimeout(requestTimer);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(requestTimer);
      controller?.abort();
    };
  }, [isGmailPreview, isCapacityPreview, onboardingId, token, pollAttempt]);

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
      refreshStatus();
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
        <p className="pauth-lede">Ask your PNCL admin for a resume link to your saved enrollment. You do not need to start over.</p>
        <div className="pauth-actions">
          <Link to="/contact" className="pauth-btn is-primary">
            Contact Support
          </Link>
        </div>
      </PortalAuthLayout>
    );
  }

  if (pollError) {
    const invalidLink = ["invalid_token", "invalid_request", "not_found"].includes(pollError.code ?? "")
      || [400, 401, 403, 404].includes(pollError.status ?? 0)
      || pollError.message === "Invalid sign-in handoff token.";
    return (
      <PortalAuthLayout>
        <StatusBadge tone="error">{invalidLink ? "Link Needs Updating" : "Connection Interrupted"}</StatusBadge>
        <h1 className="pauth-title">{invalidLink ? "This resume link is no longer valid." : "We couldn’t check your account setup."}</h1>
        <p className="pauth-lede" role="alert">
          {invalidLink
            ? "Open the most recent resume link from your PNCL admin, or ask them to copy a new one from your active enrollment. Your saved enrollment does not need to be started again."
            : pollError.message}
        </p>
        <div className="pauth-actions">
          {!invalidLink && <button type="button" className="pauth-btn is-primary" onClick={refreshStatus}>Try again</button>}
          <Link to="/contact" className="pauth-btn">Contact Support</Link>
          <Link to="/portal/login" className="pauth-btn">Sign in to PNCL Portal</Link>
        </div>
        <p className="onboarding-help-text">If you already set your Google password, sign in to the portal with your PNCL Google account.</p>
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

      {viewState === "waiting_capacity" && (
        <>
          <StatusBadge tone="pending">Progress saved</StatusBadge>
          <h1 className="pauth-title">Waiting for Google Workspace capacity</h1>
          <p className="pauth-lede">Your application and signed agreement are saved. Your PNCL Google account needs an available license or Gmail activation before setup can finish.</p>
          <section className="pauth-note" aria-label="What happens next">
            <h2 className="pauth-subtitle">We’ll take it from here.</h2>
            <p className="pauth-note-text">Your admin will be notified. We’ll check again automatically every 5 minutes and continue your saved setup when Google is ready.</p>
          </section>
          <p className="onboarding-help-text">You can safely close this page. Your admin will receive an update when your account is ready and can share your sign-in link. You do not need to apply or sign again.</p>
          <div className="pauth-actions">
            <button type="button" className="pauth-btn is-primary" onClick={refreshStatus}>Check status</button>
            <Link to="/contact" className="pauth-btn">Contact Support</Link>
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

      {(viewState === "ready" || showCredentials) && (
        <>
          <StatusBadge tone="ready">Step 1 of 2 · Gmail setup</StatusBadge>
          <h1 className="pauth-title">Your PNCL Gmail account</h1>
          <p className="pauth-lede">
            {revealed || credentialsAvailable
              ? "Start with the temporary password below to sign in for the first time."
              : "Use your Google password if you’ve already completed Gmail setup."}
          </p>
          {email && (
            <div className="pauth-note">
              <span className="pauth-note-label">PNCL Gmail address</span>
              <strong className="pauth-note-value">{email}</strong>
              {revealed && (
                <button type="button" className="pauth-btn" onClick={() => copyText(revealed.email, "Email")}>
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
                  className="pauth-btn is-primary onboarding-password-action"
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
                  className="pauth-btn is-primary onboarding-password-action"
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
                <Link to="/contact" className="pauth-btn is-primary onboarding-password-action">Contact Support</Link>
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
                className="pauth-btn is-primary"
              >
                Open Gmail to Sign In <span className="arr">→</span>
              </a>
            </>
          )}
          {!revealed && credentialsAvailable && (
            <p className="onboarding-help-text">Show and copy your password first. Then open Gmail and create your own Google password.</p>
          )}

          <details className="pauth-details">
            <summary>
              <ChevronDown size={16} aria-hidden="true" />
              Temporary password not working?
            </summary>
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
          <h1 className="pauth-title">
            {statusData?.steps?.google === "ready"
              ? "Your PNCL email is created. Account setup needs attention."
              : "We couldn’t finish your PNCL account setup."}
          </h1>
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
            Ask your PNCL admin for a new resume link to your saved enrollment. You do not need to start over.
          </p>
          <div className="pauth-actions">
            <Link to="/contact" className="pauth-btn is-primary">
              Contact Support
            </Link>
          </div>
        </>
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
