import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Pane from "@/components/portal/Pane";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import { launchChallenge, LEADSPPLY_START, leadSpplyLaunchError, redirectToLeadSpply, requestLeadSpplyLink } from "@/lib/portal-leadspply-sso";
import "@/styles/portal-integrations.css";
function Launch({ token, search }: { token: string; search: string }) {
  const [launchToken] = useState(token);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const challenge = launchChallenge(search);
        // LeadSpply creates the browser proof before Hub signs a request.
        // The automatic round trip adds no login/password prompt.
        if (!challenge) { redirectToLeadSpply(LEADSPPLY_START); return; }
        const result = await requestLeadSpplyLink(launchToken, challenge, controller.signal);
        if (active) redirectToLeadSpply(result.url);
      } catch (error) { if (active) setFailure(leadSpplyLaunchError(error)); }
      finally { clearTimeout(timeout); }
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [launchToken, search]);
  return <Pane>{failure ? <>
    <p role="alert">{failure}</p>
    <Link className="ptools-cta" to="/portal/leadspply">Account setup</Link>
    <Link className="ptools-cta" to="/portal">Back to dashboard</Link>
    <a className="ptools-cta" href="https://leadspply.com/login" rel="noreferrer">Use normal LeadSpply login</a>
  </> : <p role="status">Signing you in to LeadSpply…</p>}</Pane>;
}
export default function PortalLeadSpplyOpen() {
  const { user, session } = useAuth();
  const { search } = useLocation();
  const email = user?.email?.trim().toLowerCase() ?? "";
  const token = session?.user.id === user?.id ? session?.access_token : "";
  return <PortalToolLayout title="LeadSpply">
    {!user?.email_confirmed_at || !/^[^\s@]+@thepncl\.com$/.test(email)
      ? <Pane><p>Complete PNCL onboarding and sign in with your verified @thepncl.com email to continue.</p></Pane>
      : !token ? <Pane><p role="status">Checking your Hub session…</p></Pane>
      : <Launch key={user.id + ":" + email} token={token} search={search} />}
  </PortalToolLayout>;
}
