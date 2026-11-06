import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Pane from "@/components/portal/Pane";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import { hubAccountSetup } from "@/lib/hub-account-setup";
import { payLaunchError, payRedirectUrl, redirectToPay } from "@/lib/portal-pay";
import "@/styles/portal-integrations.css";

function PayLaunch({ token }: { token: string }) {
  // Keep a token refresh from issuing a second link during the same launch.
  const [launchToken] = useState(token);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<ReturnType<typeof payLaunchError> | null>(null);
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
    const timeout = setTimeout(() => controller.abort(), 60000);
    setFailure(null);
    // Deferring avoids duplicate issuance during React StrictMode's mount check.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const result = await hubAccountSetup<{ url: string; expiresAt: string }>(
          launchToken, { action: "pay" }, controller.signal,
        );
        if (active) redirectToPay(payRedirectUrl(result));
      } catch (error) {
        if (!active) return;
        setFailure(payLaunchError(error));
        const delay = Number((error as { retryAfter?: number })?.retryAfter);
        setNow(Date.now());
        setRetryAt(Number.isFinite(delay) && delay > 0 ? Date.now() + Math.min(3600, delay) * 1000 : 0);
      } finally {
        clearTimeout(timeout);
      }
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, launchToken]);

  return (
    <Pane>
      {failure ? <>
        <p role="alert">{failure.message}</p>
        {failure.retry && <button className="ptools-cta is-primary" type="button" disabled={cooldown > 0} onClick={() => setAttempt(value => value + 1)}>
          {cooldown > 0 ? `Try again in ${cooldown} seconds` : "Try again"}
        </button>}
        <Link className="ptools-cta" to="/portal/leadspply">Account setup</Link>
        <Link className="ptools-cta" to="/portal/support">Contact support</Link>
        <Link className="ptools-cta" to="/portal">Back to dashboard</Link>
      </> : <p role="status">Signing you in to PNCL Pay…</p>}
    </Pane>
  );
}

export default function PortalPay() {
  const { user, session } = useAuth();
  const email = user?.email?.trim().toLowerCase() ?? "";
  const token = session?.user.id === user?.id ? session?.access_token : "";
  return (
    <PortalToolLayout title="PNCL Pay">
      {!user?.email_confirmed_at || !/^[^\s@]+@thepncl\.com$/.test(email)
        ? <Pane><p>Complete PNCL onboarding and sign in with your verified @thepncl.com email to continue.</p></Pane>
        : !token ? <Pane><p role="status">Checking your Hub session…</p></Pane>
        : <PayLaunch key={user.id + ":" + email} token={token} />}
    </PortalToolLayout>
  );
}
