import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import HubRegistration from "@/components/leadspply/HubRegistration";
import { hubAccountSetup, type SetupStatus } from "@/lib/hub-account-setup";
import "@/styles/portal-integrations.css";
export default function PortalLeadSpply() {
  const { user, session } = useAuth();
  const email = user?.email?.trim().toLowerCase() ?? "";
  return (
    <PortalToolLayout title="Set up LeadSpply and PNCL Pay">
      <p className="portal-panel-note">
        Your verified PNCL Hub email is the login address for LeadSpply and PNCL
        Pay.
      </p>
      {!user?.email_confirmed_at || !/^[^\s@]+@thepncl\.com$/.test(email)
        ? (
          <Pane>
            <p>
              Complete PNCL onboarding and sign in with your verified
              @thepncl.com email to continue.
            </p>
          </Pane>
        )
        : import.meta.env.VITE_PNCL_HUB_SETUP_ENABLED !== "true"
        ? (
          <Pane>
            <p>
              Account setup is being prepared. Your Hub work email is{" "}
              <strong>{email}</strong>.
            </p>
          </Pane>
        )
        : (
          <Setup
            key={user.id + ":" + email}
            email={email}
            token={session?.user.id === user.id ? session.access_token : ""}
          />
        )}
    </PortalToolLayout>
  );
}
function Setup({ email, token }: { email: string; token: string }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const run = async (body: Record<string, unknown>): Promise<boolean> => {
    if (!token || inFlight.current || Date.now() < cooldownUntil) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await hubAccountSetup<SetupStatus & { url?: string }>(
        token,
        body,
        c.signal,
      );
      if (!mounted.current) return false;
      if (body.action === "pay") {
        if (!result.url) throw new Error("PNCL Pay is unavailable.");
        window.location.assign(result.url);
      } else if (result.state) {
        setStatus(result);
        if (body.action === "update_email") {
          setMessage(
            result.emailMatches
              ? "Your LeadSpply login now uses your Hub email. Your account and data are preserved."
              : "Refresh status to confirm the email update.",
          );
        }
        if (body.action === "register") {
          setMessage(
            "Your account has been created and linked. Any required approval is still pending.",
          );
        }
        if (body.action === "verify") {
          setMessage("Your existing LeadSpply account is verified and linked.");
        }
      }
      return true;
    } catch (e) {
      const delay = (e as Error & { retryAfter?: number })?.retryAfter;
      if (mounted.current && typeof delay === "number" && delay > 0) {
        setNow(Date.now());
        setCooldownUntil(Date.now() + Math.min(delay, 3600) * 1000);
      }
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Account setup failed. Refresh status before retrying.",
        );
      }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    controller.current = c;
    setBusy(true);
    setError("");
    if (token) {
      void hubAccountSetup<SetupStatus>(token, { action: "status" }, c.signal)
        .then((value) => {
          if (active) {
            setStatus(value);
          }
        }).catch((e) => {
          if (active) {
            setError(
              e instanceof Error ? e.message : "Account setup is unavailable.",
            );
          }
        }).finally(() => {
          if (active) setBusy(false);
        });
    } else {
      setError("Sign in again to continue.");
      setBusy(false);
    }
    return () => {
      active = false;
      c.abort();
    };
  }, [token]);
  const fresh = Boolean(
    status?.proofExpiresAt && Date.parse(status.proofExpiresAt) > Date.now(),
  );
  const needsVerification = status?.state === "connected" &&
    (!status.ownershipVerified || !status.emailMatches && !fresh);
  return (
    <div className="portal-leadspply-page">
      <Pane title="1. Your PNCL Hub email">
        <strong>{email}</strong>
        <p>
          Your PNCL work email is managed by Hub. Contact support
          for a work email rename.
        </p>
      </Pane>
      <button
        className="ptools-cta"
        type="button"
        disabled={busy || cooldown > 0}
        onClick={() => void run({ action: "status" })}
      >
        Refresh status
      </button>
      {error && (
        <Pane>
          <p role="alert">{error}</p>
        </Pane>
      )}
      {cooldown > 0 && <p role="status">Try again in {cooldown} seconds.</p>}
      {message && (
        <Pane>
          <p role="status">{message}</p>
        </Pane>
      )}
      {!status && !error && <p role="status">Loading your account status…</p>}
      {status?.state === "account_unavailable" && (
        <Pane>
          <p>
            Your account needs review.{" "}
            <Link to="/portal/support">Contact support</Link>.
          </p>
        </Pane>
      )}
      {status?.state === "connected" && (
        <Pane title="2. Your LeadSpply account">
          <p>
            Login email: <strong>{status.account?.email}</strong>
          </p>
          <p>
            {status.emailMatches
              ? "Your LeadSpply login email matches Hub."
              : "Verify this account, then update its login email to your Hub email."}
          </p>
          {!status.approved && (
            <p>
              LeadSpply approval is pending. You can finish matching your email
              while approval is reviewed.
            </p>
          )}
        </Pane>
      )}
      {status?.state === "not_linked" && (
        <Pane title="2. Your LeadSpply account">
          <p>
            Link your existing account to keep your data. If you have never had
            an account, create one here.
          </p>
          <div className="portal-leadspply-page-actions">
            <button
              className="ptools-cta"
              type="button"
              disabled={busy || cooldown > 0}
              aria-pressed={mode === "existing"}
              onClick={() => setMode("existing")}
            >
              I have a LeadSpply account
            </button>
            <button
              className="ptools-cta"
              type="button"
              disabled={busy || cooldown > 0}
              aria-pressed={mode === "new"}
              onClick={() => {
                setMode("new");
                setPassword("");
                setTotp("");
              }}
            >
              I need a new account
            </button>
          </div>
        </Pane>
      )}
      {(needsVerification ||
        status?.state === "not_linked" && mode === "existing") && (
        <Pane title="Verify your existing account">
          <p>
            Use your current LeadSpply login. Verification links the account
            without changing its email yet.
          </p>
          <form
            className="hub-setup-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await run({ action: "verify", loginEmail, password, totp });
              if (mounted.current) {
                setPassword("");
                setTotp("");
              }
            }}
          >
            <fieldset
              className="hub-setup-fields"
              disabled={busy || cooldown > 0}
            >
              <Field
                id="existing-email"
                label="Current LeadSpply email"
                type="email"
                autoComplete="username"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
              <Field
                id="existing-password"
                label="LeadSpply password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                id="existing-totp"
                label="Authenticator code (if enabled)"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                pattern="[0-9]{6}"
                maxLength={6}
                onChange={(e) => setTotp(e.target.value)}
              />
              <button className="ptools-cta is-primary" type="submit">
                {busy ? "Verifying…" : "Verify and link account"}
              </button>
            </fieldset>
          </form>
          <p>
            Cannot sign in?{" "}
            <Link to="/portal/support">Recover your account with support</Link>
            {" "}
            before creating another.
          </p>
        </Pane>
      )}
      {status?.state === "not_linked" && mode === "new" && (
        <Pane>
          <HubRegistration email={email} busy={busy} cooldown={cooldown > 0} run={run} />
        </Pane>
      )}
      {status?.state === "connected" && !status.emailMatches && (
        <Pane title="3. Match your login email">
          <p>
            Change <strong>{status.account?.email}</strong> to{" "}
            <strong>{email}</strong>. Your existing LeadSpply account, password
            and data stay together.
          </p>
          <button
            className="ptools-cta is-primary"
            type="button"
            disabled={busy || cooldown > 0 || !fresh}
            onClick={() =>
              void run({ action: "update_email", expectedEmail: email })}
          >
            Update to my Hub email
          </button>
          {!fresh && <p>Verify your existing account above before updating.</p>}
        </Pane>
      )}
      {status?.state === "connected" && (
        <Pane title="PNCL Pay">
          <p>
            {!status.ready
              ? "Complete account verification, email matching and required approval before opening Pay."
              : !status.payEnabled
              ? "Your account is ready. PNCL Pay SSO is awaiting partner configuration."
              : "Your accounts are ready. Continue with your Hub email."}
          </p>
          <button
            className="ptools-cta is-primary"
            type="button"
            disabled={busy || cooldown > 0 || !status.ready ||
              !status.payEnabled}
            onClick={() => void run({ action: "pay" })}
          >
            Open PNCL Pay
          </button>
        </Pane>
      )}
    </div>
  );
}
