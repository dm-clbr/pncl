import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import { SharedSignIn, SignInGate } from "@/components/portal/SharedSignIn";
import { launchChallenge, LEADSPPLY_START, redirectToLeadSpply, requestLeadSpplyLink } from "@/lib/portal-leadspply-sso";
import "@/styles/portal-integrations.css";

export default function PortalLeadSpplyOpen() {
  const { user, session } = useAuth();
  const { search } = useLocation();
  const email = user?.email?.trim().toLowerCase() ?? "";
  const token = session?.user.id === user?.id ? session?.access_token ?? "" : "";
  const launch = useCallback(async (accessToken: string, signal: AbortSignal, progress: (text: string) => void) => {
    const challenge = launchChallenge(search);
    if (!challenge) {
      progress("Preparing a secure connection to LeadSpply…");
      redirectToLeadSpply(LEADSPPLY_START);
      return;
    }
    progress("Checking your LeadSpply account connection and access…");
    const result = await requestLeadSpplyLink(accessToken, challenge, signal);
    if (!signal.aborted) {
      progress("Your account is verified. Opening LeadSpply…");
      redirectToLeadSpply(result.url);
    }
  }, [search]);
  return <PortalToolLayout title="LeadSpply">
    <SignInGate product="LeadSpply" email={email} confirmed={Boolean(user?.email_confirmed_at)} token={token}>
      <SharedSignIn key={user?.id + ":" + email} product="LeadSpply" email={email} token={token} launch={launch} timeout={45000} />
    </SignInGate>
  </PortalToolLayout>;
}
