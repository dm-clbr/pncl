import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import { SharedSignIn, SignInGate, SignInStatus } from "@/components/portal/SharedSignIn";
import { hubAccountSetup } from "@/lib/hub-account-setup";
import { payRedirectUrl, paySourceAccountId, redirectToPay } from "@/lib/portal-pay";
import { sharedSignInError } from "@/lib/shared-sign-in";
import "@/styles/portal-integrations.css";

async function launchPay(token: string, signal: AbortSignal, progress: (text: string) => void, expectedAccountId: string | null) {
  progress("Checking your linked account and PNCL Pay access…");
  const result = await hubAccountSetup<{ url: string; expiresAt: string }>(token, { action: "pay", ...(expectedAccountId ? { expectedAccountId } : {}) }, signal);
  if (!signal.aborted) {
    const url = payRedirectUrl(result);
    progress("Your account is verified. Opening PNCL Pay…");
    redirectToPay(url);
  }
}

export default function PortalPay() {
  const { user, session } = useAuth();
  const { search } = useLocation();
  let expectedAccountId: string | null = null;
  let invalidSource = false;
  try { expectedAccountId = paySourceAccountId(search); } catch { invalidSource = true; }
  const launch = useCallback((token: string, signal: AbortSignal, progress: (text: string) => void) =>
    launchPay(token, signal, progress, expectedAccountId), [expectedAccountId]);
  const email = user?.email?.trim().toLowerCase() ?? "";
  const token = session?.user.id === user?.id ? session?.access_token ?? "" : "";
  return <PortalToolLayout title="PNCL Pay">
    {invalidSource ? <SignInStatus product="PNCL Pay" failure={sharedSignInError({ code: 'invalid_request' }, 'PNCL Pay')} /> :
      <SignInGate product="PNCL Pay" email={email} confirmed={Boolean(user?.email_confirmed_at)} token={token}>
        <SharedSignIn key={user?.id + ":" + email + ":" + expectedAccountId} product="PNCL Pay" email={email} token={token} launch={launch} expectedAccountId={expectedAccountId} />
      </SignInGate>}
  </PortalToolLayout>;
}
