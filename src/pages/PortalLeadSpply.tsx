import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SetupStatus } from "@/lib/hub-account-setup";
import Pane from "@/components/portal/Pane";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import HubAccountSetup from "@/components/leadspply/HubAccountSetup";
import "@/styles/portal-integrations.css";
export default function PortalLeadSpply() {
  const { user, session } = useAuth();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const target = params.get("continue") === "pay" ? "PNCL Pay" : params.get("continue") === "leadspply" ? "LeadSpply" : null;
  const email = user?.email?.trim().toLowerCase() ?? "";
  return (
    <PortalToolLayout title="Set up LeadSpply and PNCL Pay">
      <p className="portal-panel-note">
        Your verified PNCL Hub email is the login address for LeadSpply and PNCL
        Pay.
      </p>
      {target && status?.email === email && status.ready && (target !== "PNCL Pay" || status.payEnabled) && <Pane title="Your shared sign-in is ready">
        <p>Your verified company emails match. Continue with your existing account.</p>
        <Link className="ptools-cta is-primary" to={target === "PNCL Pay" ? "/portal/pay" : "/portal/leadspply/open"}>Continue to {target}</Link>
      </Pane>}
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
          <HubAccountSetup
            key={user.id + ":" + email}
            email={email}
            token={session?.user.id === user.id ? session.access_token : ""}
            initialStep={params.get("step") === "email" ? "email" : undefined}
            onStatusChange={setStatus}
          />
        )}
    </PortalToolLayout>
  );
}
