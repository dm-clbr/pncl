import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  buildGmailUrl,
  getOnboardingStatus,
  revealOnboardingCredentials,
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
  const [pollError, setPollError] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  const viewState = resolveViewState(statusData, revealed);
  const email = revealed?.email ?? statusData?.email ?? "";
  const gmailUrl = revealed?.gmailUrl ?? statusData?.gmailUrl ?? (email ? buildGmailUrl(email) : "");

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

  if (!onboardingId || !token) {
    return (
      <OnboardingShell>
        <StatusBadge tone="error">Invalid Link</StatusBadge>
        <h1 className="onboarding-success-title">This onboarding link is incomplete.</h1>
        <p className="onboarding-success-copy">Please return to the onboarding form or contact PNCL support.</p>
        <Link to="/onboarding" className="quiz-cta-btn">Back to Onboarding</Link>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      {viewState === "loading" && (
        <>
          <StatusBadge tone="pending">Loading</StatusBadge>
          <h1 className="onboarding-success-title">Checking your PNCL account…</h1>
          <p className="onboarding-success-copy">Please wait while we load your onboarding status.</p>
        </>
      )}

      {viewState === "creating" && (
        <>
          <StatusBadge tone="pending">Creating Email</StatusBadge>
          <h1 className="onboarding-success-title">Creating your PNCL email…</h1>
          <p className="onboarding-success-copy">We&apos;re setting up your company account now.</p>
          <div className="onboarding-spinner" aria-hidden="true" />
        </>
      )}

      {viewState === "ready" && (
        <>
          <StatusBadge tone="ready">Ready</StatusBadge>
          <h1 className="onboarding-success-title">Your PNCL email is ready.</h1>
          {email && (
            <div className="onboarding-email-block">
              <span className="onboarding-email-label">Email</span>
              <strong>{email}</strong>
            </div>
          )}
          <p className="onboarding-success-copy">
            For security, your temporary sign-in instructions will only be shown once.
            After signing in, Google will ask you to create your own password.
          </p>
          <button
            type="button"
            className="quiz-cta-btn"
            onClick={handleReveal}
            disabled={revealing}
          >
            {revealing ? "Loading…" : "Reveal Sign-In Instructions"}
          </button>
          <p className="onboarding-help-text">
            If you close this page before saving your temporary password, contact PNCL support or an admin for a password reset.
          </p>
        </>
      )}

      {viewState === "revealed" && revealed && (
        <>
          <StatusBadge tone="ready">Sign-In Ready</StatusBadge>
          <h1 className="onboarding-success-title">Temporary sign-in instructions</h1>
          <div className="onboarding-email-block">
            <span className="onboarding-email-label">Email</span>
            <strong>{revealed.email}</strong>
          </div>
          <div className="onboarding-email-block">
            <span className="onboarding-email-label">Temporary password</span>
            <strong className="onboarding-password">{revealed.temporaryPassword}</strong>
          </div>
          <ol className="onboarding-steps">
            <li>Click &ldquo;Open Gmail&rdquo;</li>
            <li>Sign in with your PNCL email and temporary password</li>
            <li>Create your new password when Google asks</li>
            <li>Save your new password somewhere safe</li>
          </ol>
          <div className="onboarding-action-row">
            <button type="button" className="onboarding-secondary-btn" onClick={() => copyText(revealed.email, "Email")}>
              Copy Email
            </button>
            <button
              type="button"
              className="onboarding-secondary-btn"
              onClick={() => copyText(revealed.temporaryPassword, "Temporary password")}
            >
              Copy Temporary Password
            </button>
          </div>
          <a href={revealed.gmailUrl} target="_blank" rel="noopener noreferrer" className="quiz-cta-btn">
            Open Gmail
          </a>
          <p className="onboarding-help-text">
            For security, these temporary sign-in details will only be shown once.
            After you sign in, Google will ask you to create your own password.
          </p>
        </>
      )}

      {viewState === "viewed" && (
        <>
          <StatusBadge tone="neutral">Already Viewed</StatusBadge>
          <h1 className="onboarding-success-title">Sign-in details already viewed</h1>
          <p className="onboarding-success-copy">
            Your temporary sign-in details have already been viewed.
            Please contact PNCL support or an admin if you need a password reset.
          </p>
          {gmailUrl && (
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="quiz-cta-btn">
              Open Gmail
            </a>
          )}
        </>
      )}

      {viewState === "failed" && (
        <>
          <StatusBadge tone="error">Setup Failed</StatusBadge>
          <h1 className="onboarding-success-title">We couldn&apos;t finish creating your PNCL email.</h1>
          <p className="onboarding-success-copy">
            Please contact PNCL support or an admin for help.
          </p>
          <Link to="/contact" className="quiz-cta-btn">Contact Support</Link>
        </>
      )}

      {viewState === "expired" && (
        <>
          <StatusBadge tone="error">Link Expired</StatusBadge>
          <h1 className="onboarding-success-title">This sign-in link has expired.</h1>
          <p className="onboarding-success-copy">
            Please contact PNCL support or an admin to get a new temporary password.
          </p>
          <Link to="/contact" className="quiz-cta-btn">Contact Support</Link>
        </>
      )}

      {pollError && viewState !== "failed" && viewState !== "expired" && (
        <p className="onboarding-error" style={{ marginTop: "1rem" }}>{pollError}</p>
      )}
    </OnboardingShell>
  );
}

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="quiz-container">
      <div className="quiz-brand">
        <Link to="/" className="quiz-brand-link">PNCL</Link>
      </div>
      <div className="quiz-card quiz-fade-in onboarding-success-card">
        <div className="quiz-card-inner">{children}</div>
      </div>
    </div>
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
