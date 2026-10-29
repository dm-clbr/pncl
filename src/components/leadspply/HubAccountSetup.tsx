import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Pane from "@/components/portal/Pane";
import Field from "@/components/portal/Field";
import PortalWorkflowDialog from "@/components/PortalWorkflowDialog";
import HubRegistration from "@/components/leadspply/HubRegistration";
import { hubAccountSetup, type SetupStatus } from "@/lib/hub-account-setup";
export default function HubAccountSetup(
  { email, token, compact = false, onChanged, onStatusChange }: {
    email: string;
    token: string;
    compact?: boolean;
    onChanged?: () => void;
    onStatusChange?: (status: SetupStatus | null) => void;
  },
) {
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
  useEffect(() => {
    onStatusChange?.(error ? null : status);
  }, [status, error, onStatusChange]);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [step, setStep] = useState<"verify" | "email" | "create" | null>(null);
  const dialogVersion = useRef(0);
  const verificationOpen = step !== null;
  const [requiresAuthenticator, setRequiresAuthenticator] = useState(false);
  const closeVerification = () => {
    dialogVersion.current += 1;
    setStep(null);
    setPassword("");
    setTotp("");
    setRequiresAuthenticator(false);
    setError("");
  };
  const openVerification = () => {
    setLoginEmail(status?.account?.email ?? email);
    setPassword("");
    setTotp("");
    setRequiresAuthenticator(false);
    setError("");
    dialogVersion.current += 1;
    setStep("verify");
  };
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
    const opening = dialogVersion.current;
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
          setMessage(
            result.emailMatches
              ? "Your LeadSpply account is verified and linked. Your login email matches Hub."
              : "Your account is verified. Match your login email to finish setup.",
          );
          if (opening === dialogVersion.current) {
            if (result.emailMatches) closeVerification();
            else setStep("email");
          }
        }
        if (
          body.action === "update_email" && result.emailMatches ||
          body.action === "register"
        ) {
          if (opening === dialogVersion.current) closeVerification();
        }
        if (
          ["verify", "update_email", "register"].includes(String(body.action))
        ) onChanged?.();
      }
      return true;
    } catch (e) {
      const setupError = e as Error & { retryAfter?: number; code?: string };
      if (
        mounted.current && opening === dialogVersion.current &&
        body.action === "verify" && setupError.code === "mfa_required"
      ) {
        setRequiresAuthenticator(true);
      }
      const delay = setupError?.retryAfter;
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
  useEffect(() => {
    if (!status?.proofExpiresAt || status.emailMatches) return;
    const remaining = Date.parse(status.proofExpiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining + 10, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [status?.proofExpiresAt, status?.emailMatches]);
  const fresh = Boolean(
    status?.ownershipVerified && status.proofExpiresAt &&
      Date.parse(status.proofExpiresAt) > Date.now(),
  );
  const needsVerification = status?.state === "connected" &&
    (!status.ownershipVerified || !status.emailMatches && !fresh);
  const modal = verificationOpen && (
    <PortalWorkflowDialog
      title={step === "email"
        ? "Use your PNCL Hub email"
        : step === "create"
        ? "Create your LeadSpply account"
        : "Verify your LeadSpply account"}
      onClose={closeVerification}
    >
      {error && <p role="alert">{error}</p>}
      {cooldown > 0 && <p role="status">Try again in {cooldown} seconds.</p>}
      {step === "verify" && (
        <>
          <p>
            {status?.state === "connected"
              ? status.ownershipVerified
                ? "Confirm your current LeadSpply login before updating its email."
                : "Your account is already linked. This one-time check confirms ownership for Pay. Normal Pay sign-ins won’t require this step again."
              : "Sign in with your existing LeadSpply account to link it to Hub. Your account and data stay together."}
          </p>
          <p>Verification does not change your login email.</p>
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
                onChange={(e) => {
                  setLoginEmail(e.target.value);
                  setRequiresAuthenticator(false);
                  setTotp("");
                }}
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
              {requiresAuthenticator && (
                <Field
                  id="existing-totp"
                  label="Authenticator code"
                  hint="This account requires an authenticator code. Enter your password again and the current six-digit code."
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={totp}
                  pattern="[0-9]{6}"
                  maxLength={6}
                  onChange={(e) => setTotp(e.target.value)}
                />
              )}
              <button className="portal-workflow-primary" type="submit">
                {busy
                  ? "Verifying…"
                  : status?.state === "connected"
                  ? "Verify account"
                  : "Verify and link account"}
              </button>
            </fieldset>
          </form>
          <p>
            Cannot sign in?{" "}
            <Link to="/portal/support">Recover your account with support</Link>
            {" "}
            before creating another.
          </p>
        </>
      )}
      {step === "email" && (
        <>
          <p>
            Your LeadSpply login needs to match your PNCL Hub email so both
            accounts and PNCL Pay use the same address.
          </p>
          <dl className="hub-setup-email-change">
            <div>
              <dt>Current LeadSpply email</dt>
              <dd>{status?.account?.email}</dd>
            </div>
            <div>
              <dt>Your Hub email</dt>
              <dd>{email}</dd>
            </div>
          </dl>
          <p>
            Your existing LeadSpply account, password and data stay together.
            This changes the email you use to sign in.
          </p>
          {fresh
            ? (
              <button
                className="portal-workflow-primary"
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() =>
                  void run({ action: "update_email", expectedEmail: email })}
              >
                {busy ? "Updating…" : "Update to my Hub email"}
              </button>
            )
            : (
              <>
                <p>
                  For security, verify your LeadSpply login again before
                  changing its email.
                </p>
                <button
                  className="portal-workflow-primary"
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={openVerification}
                >
                  Verify to update email
                </button>
              </>
            )}
          <button
            className="portal-workflow-secondary"
            type="button"
            onClick={closeVerification}
          >
            Finish later
          </button>
        </>
      )}
      {step === "create" && (
        <HubRegistration
          email={email}
          busy={busy}
          cooldown={cooldown > 0}
          run={run}
        />
      )}
    </PortalWorkflowDialog>
  );

  if (compact) {
    return (
      <div className="hub-setup-dashboard">
        {!status && !error && (
          <p role="status">Checking your account connection…</p>
        )}
        {error && !verificationOpen && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="portal-leadspply-refresh"
              disabled={busy || cooldown > 0}
              onClick={() => void run({ action: "status" })}
            >
              Retry account status
            </button>
          </div>
        )}
        {cooldown > 0 && !verificationOpen && (
          <p role="status">Try again in {cooldown} seconds.</p>
        )}
        {message && !verificationOpen && <p role="status">{message}</p>}
        {status?.state === "account_unavailable" && (
          <p>
            Your account needs review.{" "}
            <Link to="/portal/support">Contact support</Link>.
          </p>
        )}
        {status?.state === "not_linked" && (
          <div className="hub-setup-banner">
            <div>
              <strong>Connect your LeadSpply account</strong>
              <p>
                Verify and link your account in one step to see your sales here
                and prepare for PNCL Pay.
              </p>
            </div>
            <div className="portal-leadspply-actions">
              <button
                className="portal-leadspply-open"
                disabled={busy || cooldown > 0}
                onClick={openVerification}
              >
                Connect LeadSpply
              </button>
              <button
                className="portal-leadspply-refresh"
                disabled={busy || cooldown > 0}
                onClick={() => {
                  setError("");
                  setStep("create");
                }}
              >
                Create a LeadSpply account
              </button>
            </div>
          </div>
        )}
        {status?.state === "connected" &&
          (!status.ownershipVerified || !status.emailMatches) && (
          <div className="hub-setup-banner">
            <div>
              <strong>
                {!status.ownershipVerified
                  ? "One quick check for PNCL Pay"
                  : "Use one email for Hub, LeadSpply and Pay"}
              </strong>
              <p>
                {!status.ownershipVerified
                  ? "Your LeadSpply account is already connected. Verify your link once to prepare for PNCL Pay. Your connection and sales data stay in place."
                  : "Your account is verified. Update your LeadSpply login to match your Hub email to finish this step."}
              </p>
            </div>
            <button
              className="portal-leadspply-open"
              disabled={busy || cooldown > 0}
              onClick={() => {
                if (needsVerification) openVerification();
                else {
                  setError("");
                  setStep("email");
                }
              }}
            >
              {!status.ownershipVerified
                ? "Verify link once"
                : "Continue email setup"}
            </button>
          </div>
        )}
        {status?.state === "connected" && status.ownershipVerified &&
          status.emailMatches && (
          <p className="hub-setup-verified">
            Link verified · Your LeadSpply login matches Hub.
            {!status.approved
              ? " LeadSpply approval is pending."
              : !status.payEnabled
              ? " PNCL Pay access is not enabled for your account yet."
              : ""}
          </p>
        )}
        {modal}
      </div>
    );
  }
  return (
    <div className="portal-leadspply-page">
      <Pane title="1. Your PNCL Hub email">
        <strong>{email}</strong>
        <p>
          Your PNCL work email is managed by Hub. Contact support for a work
          email rename.
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
      {error && !verificationOpen && (
        <Pane>
          <p role="alert">{error}</p>
        </Pane>
      )}
      {cooldown > 0 && !verificationOpen && (
        <p role="status">Try again in {cooldown} seconds.</p>
      )}
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
          {status.ownershipVerified && <p>Account ownership verified.</p>}
          {needsVerification && (
            <>
              <p>
                {status.ownershipVerified
                  ? "Confirm your current login before changing your LeadSpply email."
                  : "Your account is already linked. Verify ownership once to finish setting up Pay. You won’t need to repeat this for normal Pay sign-ins."}
              </p>
              <button
                className="ptools-cta is-primary"
                type="button"
                disabled={busy || cooldown > 0}
                onClick={openVerification}
              >
                {status.ownershipVerified
                  ? "Verify to update email"
                  : "Verify account one time"}
              </button>
            </>
          )}
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
              onClick={() => {
                setMode("existing");
                openVerification();
              }}
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
      {modal}
      {status?.state === "not_linked" && mode === "new" && (
        <Pane>
          <HubRegistration
            email={email}
            busy={busy}
            cooldown={cooldown > 0}
            run={run}
          />
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
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            Review email update
          </button>
          {!fresh && (
            <p>
              Use the verification button in your LeadSpply account section
              before updating.
            </p>
          )}
        </Pane>
      )}
      {status?.state === "connected" && (
        <Pane title="PNCL Pay">
          <p>
            {!status.ready
              ? "Complete account verification, email matching and required approval before opening Pay."
              : !status.payEnabled
              ? "Your account is ready. PNCL Pay access is not enabled for your account yet."
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
