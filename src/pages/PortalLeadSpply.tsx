import { useAuth } from "@/contexts/AuthContext";
import Pane from "@/components/portal/Pane";
import PortalToolLayout from "@/components/portal/PortalToolLayout";
import HubAccountSetup from "@/components/leadspply/HubAccountSetup";
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
          <HubAccountSetup
            key={user.id + ":" + email}
            email={email}
            token={session?.user.id === user.id ? session.access_token : ""}
          />
        )}
    </PortalToolLayout>
  );
}
