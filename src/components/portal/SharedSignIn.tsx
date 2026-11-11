import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Pane from "./Pane";
import { useAuth } from "@/contexts/AuthContext";
import { explainSignInFailure, setupSignInError, sharedSignInError, sharedSignInSetupHref, type SignInFailure, type SignInProduct } from "@/lib/shared-sign-in";
import { hubAccountSetup, type SetupStatus } from "@/lib/hub-account-setup";
import SharedSignInSetupDialog from "./SharedSignInSetupDialog";

export function SignInStatus({ product, email, message, failure, retry, cooldown = 0, slow = false, setupHref = "/portal/leadspply", showSetup }: {
  product: SignInProduct; email?: string; message?: string; failure?: SignInFailure | null;
  retry?: () => void; cooldown?: number; slow?: boolean;
  setupHref?: string; showSetup?: () => void;
}) {
  const { signInWithGoogle } = useAuth();
  const [signInFailed, setSignInFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  async function signIn() {
    setSigningIn(true); setSignInFailed(false);
    try { await signInWithGoogle(product === "LeadSpply" ? "/portal/leadspply/open" : "/portal/pay"); }
    catch { setSignInFailed(true); }
    finally { setSigningIn(false); }
  }
  return <div className="portal-shared-signin"><Pane title={showSetup ? `Finish setting up ${product}` : failure ? `Couldn’t sign in to ${product}` : `Connecting to ${product}`}>
    <div className="portal-shared-signin-body">
      {email && <p>Using your Hub account: <strong>{email}</strong></p>}
      {failure ? <>
        <p role="alert">{failure.message}</p>
        {signInFailed && <p role="alert">Google sign-in could not start. Please try again or contact support.</p>}
        <div className="portal-shared-signin-actions">
          {failure.retry && retry && <button className="ptools-cta is-primary" type="button" disabled={cooldown > 0} onClick={retry}>{cooldown > 0 ? `Try again in ${cooldown} seconds` : "Try again"}</button>}
          {failure.action === "signin" && <button className="ptools-cta is-primary" type="button" disabled={signingIn} onClick={() => void signIn()}>{signingIn ? "Opening Google sign-in…" : "Sign in to Hub again"}</button>}
          {showSetup && <button className="ptools-cta is-primary" type="button" onClick={showSetup}>View setup steps</button>}
          <Link className={`ptools-cta${failure.action === "setup" && !showSetup ? " is-primary" : ""}`} to={setupHref}>Account setup</Link>
          <Link className={`ptools-cta${failure.action === "support" && !failure.retry ? " is-primary" : ""}`} to="/portal/support">Contact support</Link>
          {product === "LeadSpply" && <a className="ptools-cta" href="https://leadspply.com/login" rel="noreferrer">Use normal LeadSpply login</a>}
        </div>
      </> : <div role="status" aria-live="polite"><p>{message}</p>{slow && <p>This is taking longer than usual. We’re still waiting for a response. You’ll see an explanation here if sign-in cannot finish.</p>}</div>}
      <Link className="portal-shared-signin-back" to="/portal">Back to dashboard</Link>
    </div>
  </Pane></div>;
}

export function SignInGate({ product, email, confirmed, token, children }: {
  product: SignInProduct; email: string; confirmed: boolean; token: string; children: React.ReactNode;
}) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (token) return;
    const timer = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [token, email]);
  const failure: SignInFailure | null = !/^[^\s@]+@thepncl\.com$/.test(email)
    ? { message: "Shared sign-in requires your @thepncl.com Google account. Sign in to Hub with your company email to continue.", action: "signin", retry: false }
    : !confirmed ? { message: "Your Hub email has not been verified. Sign in with your verified @thepncl.com Google account to continue.", action: "signin", retry: false }
    : !token && timedOut ? { message: "Hub could not confirm your current session. Sign in to Hub again to continue.", action: "signin", retry: false } : null;
  return failure || !token ? <SignInStatus product={product} email={email} failure={failure} message="Checking your Hub session…" /> : children;
}

export function SharedSignIn({ product, email, token, launch, timeout = 60000 }: {
  product: SignInProduct; email: string; token: string; timeout?: number;
  launch: (token: string, signal: AbortSignal, progress: (message: string) => void) => Promise<void>;
}) {
  // Refreshes do not issue duplicate links; a deliberate retry uses the latest token.
  const [attempt, setAttempt] = useState({ token, version: 0 });
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [setup, setSetup] = useState<{ status: SetupStatus | null } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [message, setMessage] = useState("Checking your account connection…");
  const [slow, setSlow] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const cooldown = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setFailure(null); setSlow(false); setSetup(null); setSetupOpen(false);
    setMessage("Checking your account connection…");
    const slowTimer = setTimeout(() => { if (active) setSlow(true); }, 8000);
    const deadline = setTimeout(() => {
      if (!active) return;
      // Set the result even if a browser request fails to settle after abort.
      setFailure(sharedSignInError({ code: "sso_timeout" }, product));
      active = false; controller.abort();
    }, timeout);
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const status = await hubAccountSetup<SetupStatus>(attempt.token, { action: "status" }, controller.signal);
        if (!active) return;
        if (!status || status.email !== email || !["connected", "not_linked", "account_unavailable"].includes(status.state)) {
          throw { code: "integration_unavailable" };
        }
        if (!status.ready || product === "PNCL Pay" && !status.payEnabled) {
          setSetup({ status }); setSetupOpen(true);
          setFailure(setupSignInError(status) ?? sharedSignInError({ code: status.ready ? "pay_unavailable" : "setup_incomplete", status: 503 }, product));
          return;
        }
        await launch(attempt.token, controller.signal, text => { if (active) setMessage(text); });
      } catch (error) {
        if (!active) return;
        clearTimeout(deadline); clearTimeout(slowTimer);
        // Show an explanation immediately while looking up more precise setup steps.
        setFailure(sharedSignInError(error, product));
        if ((error as { code?: string })?.code === "pay_user_not_found" && product === "PNCL Pay") {
          setSetup({ status: null }); setSetupOpen(true);
        }
        const delay = Number((error as { retryAfter?: number })?.retryAfter);
        setNow(Date.now());
        setRetryAt((error as { code?: string })?.code === "rate_limited" ? Date.now() + (Number.isFinite(delay) && delay > 0 ? Math.min(3600, delay) : 60) * 1000 : 0);
        const explanation = await explainSignInFailure(error, product, attempt.token, controller.signal);
        if (active) setFailure(explanation);
      } finally {
        clearTimeout(deadline); clearTimeout(slowTimer);
      }
    });
    return () => { active = false; clearTimeout(deadline); clearTimeout(slowTimer); controller.abort(); };
  }, [attempt, launch, product, email, timeout]);
  const retry = () => setAttempt(value => ({ token, version: value.version + 1 }));
  return <>
    <SignInStatus product={product} email={email} message={message} failure={failure} slow={slow} cooldown={cooldown} retry={retry}
      setupHref={sharedSignInSetupHref(product, setup?.status)} showSetup={setup ? () => setSetupOpen(true) : undefined} />
    {setup && setupOpen && <SharedSignInSetupDialog product={product} email={email} status={setup.status} onClose={() => setSetupOpen(false)} onRefresh={retry} />}
  </>;
}
