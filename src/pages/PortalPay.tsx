import { useAuth } from "@/contexts/AuthContext";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import { SharedSignIn, SignInGate } from "@/components/portal/SharedSignIn";
import { hubAccountSetup } from "@/lib/hub-account-setup";
import { payRedirectUrl, redirectToPay } from "@/lib/portal-pay";
import "@/styles/portal-integrations.css";

async function launch(token: string, signal: AbortSignal, progress: (text: string) => void) {
  progress("Checking your linked account and PNCL Pay access…");
  const result = await hubAccountSetup<{ url: string; expiresAt: string }>(token, { action: "pay" }, signal);
  if (!signal.aborted) {
    const url = payRedirectUrl(result);
    progress("Your account is verified. Opening PNCL Pay…");
    redirectToPay(url);
  }
}

export default function PortalPay() {
  const { user, session } = useAuth();
  const email = user?.email?.trim().toLowerCase() ?? "";
  const token = session?.user.id === user?.id ? session?.access_token ?? "" : "";
  return <PortalToolLayout title="PNCL Pay">
    <SignInGate product="PNCL Pay" email={email} confirmed={Boolean(user?.email_confirmed_at)} token={token}>
      <SharedSignIn key={user?.id + ":" + email} product="PNCL Pay" email={email} token={token} launch={launch} />
    </SignInGate>
  </PortalToolLayout>;
}
