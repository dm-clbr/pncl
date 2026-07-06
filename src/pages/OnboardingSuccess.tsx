import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import {
  buildGmailUrl,
  getOnboardingStatus,
  revealOnboardingCredentials,
  resendPortalInvite,
  type OnboardingStatus,
  type OnboardingStatusResponse,
  type RevealCredentialsResponse,
} from "@/lib/onboarding-api";
import { toast } from "sonner";
import { trackPageView } from "@/lib/analytics";

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES = new Set<OnboardingStatus>([
  "ready",
  "failed",
  "expired",
  "credentials_viewed",
]);

type ViewState = "loading" | "creating" | "ready" | "revealed" | "viewed" | "failed" | "expired";

function resolveViewState(
  status: OnboardingStatusResponse | null,
  revealed: RevealCredentialsResponse | null,
): ViewState {
  if (revealed) return "revealed";
  if (!status) return "loading";

  if (status.status === "failed") return "failed";
  if (status.status === "expired") return "expired";
  if (status.status === "credentials_viewed" || status.credentialsViewed) return "viewed";
  if (status.status === "ready" || status.status === "email_created") return "ready";
  return "creating";
}

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

  const [statusData, setStatusData] = useState<OnboardingStatusResponse | null>(null);
  const [revealed, setRevealed] = useState<RevealCredentialsResponse | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  const viewState = resolveViewState(statusData, revealed);
  const email = revealed?.email ?? statusData?.email ?? "";
  const gmailUrl = revealed?.gmailUrl ?? statusData?.gmailUrl ?? (email ? buildGmailUrl(email) : "");
  const portalInviteSent = statusData?.portalInviteSent ?? false;
  const showCredentials = viewState === "revealed" || viewState === "viewed";

  const fetchStatus = useCallback(async () => {
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
  }, [onboardingId, token]);

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
  }, [fetchStatus, onboardingId, token]);

  const handleReveal = async () => {
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
      } else {
        toast.error(err.message ?? "Unable to reveal sign-in instructions.");
      }
    } finally {
      setRevealing(false);
    }
  };

  const handleResendInvite = async () => {
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

  if (!onboardingId || !token) {
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
          <h2 className="h3" style={{ margin: "1rem 0" }}>Your PNCL email is ready.</h2>
          {email && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">Email</span>
              <strong>{email}</strong>
            </div>
          )}
          <p className="lead">
            {statusData?.pendingGmailVerification ? (
              <>
                {statusData.message ?? "Your PNCL email was created, but Google needs a quick verification before you can sign in."}
                {" "}Check your personal email for instructions, then reveal your temporary Gmail password below.
              </>
            ) : portalInviteSent ? (
              <>
                A portal welcome email was sent to <strong>{email}</strong>. Sign in to Gmail first,
                then use <strong>Sign in with Google</strong> on the portal login page.
              </>
            ) : (
              <>
                Your PNCL email is ready. Reveal your Gmail sign-in instructions below, then request
                a portal welcome email for <strong>{email}</strong>.
              </>
            )}
          </p>
          <ol className="onboarding-steps">
            <li>Reveal and save your temporary Gmail sign-in details</li>
            <li>Sign in to Gmail and set your Google password</li>
            <li>Sign in to the Employee Portal with Google using your @thepncl.com account</li>
          </ol>
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleReveal}
            disabled={revealing}
            style={{ marginTop: "0.5rem" }}
          >
            {revealing ? "Loading…" : <>Reveal Gmail Sign-In <span className="arr">→</span></>}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResendInvite}
            disabled={resendingInvite}
            style={{ marginTop: "0.75rem" }}
          >
            {resendingInvite
              ? "Sending…"
              : portalInviteSent
                ? "Resend portal welcome email"
                : "Send portal welcome email"}
          </button>
          <p className="onboarding-help-text">
            If you close this page before saving your temporary password, contact PNCL support or an admin for a password reset.
          </p>
        </>
      )}

      {showCredentials && (
        <>
          <StatusBadge tone="ready">Gmail Sign-In</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>Sign in to your PNCL email</h2>
          {revealed && (
            <>
              <div className="onboarding-email-block">
                <span className="onboarding-email-label">Email</span>
                <strong>{revealed.email}</strong>
              </div>
              <div className="onboarding-email-block">
                <span className="onboarding-email-label">Temporary password</span>
                <strong className="onboarding-password">{revealed.temporaryPassword}</strong>
              </div>
              <div className="onboarding-action-row">
                <button type="button" className="btn btn-ghost" onClick={() => copyText(revealed.email, "Email")}>
                  Copy Email
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => copyText(revealed.temporaryPassword, "Temporary password")}
                >
                  Copy Temporary Password
                </button>
              </div>
            </>
          )}
          {viewState === "viewed" && email && !revealed && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">Email</span>
              <strong>{email}</strong>
            </div>
          )}
          <ol className="onboarding-steps">
            <li>Open Gmail and sign in with your temporary password</li>
            <li>Create your new Google password when prompted</li>
            <li>Sign in to the Employee Portal with Google using your @thepncl.com account</li>
          </ol>
          <p className="onboarding-help-text">
            Google may show <strong>Verify it&apos;s you</strong> on first sign-in. If phone verification fails
            or asks for a number you cannot use, stop and contact PNCL support — do not keep retrying the same
            phone number. An admin can briefly allow sign-in while you complete setup.
          </p>
          <div className="onboarding-action-row" style={{ marginTop: "0.75rem" }}>
            <a
              href={revealed?.gmailUrl ?? gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-accent"
            >
              Open Gmail <span className="arr">→</span>
            </a>
            <Link to="/portal/login" className="btn btn-ghost">
              Sign in with Google <span className="arr">→</span>
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
          <p className="onboarding-help-text">
            After Gmail is set up, use <strong>Sign in with Google</strong> on the portal login page.
          </p>
        </>
      )}

      {viewState === "failed" && (
        <>
          <StatusBadge tone="error">Setup Failed</StatusBadge>
          <h2 className="h3" style={{ margin: "1rem 0" }}>We couldn&apos;t finish creating your PNCL email.</h2>
          <p className="lead">
            Please contact PNCL support or an admin for help.
          </p>
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
          <Link to="/contact" className="btn btn-accent" style={{ marginTop: "1rem" }}>
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
