import { Link } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import { useAuth } from "@/contexts/AuthContext";

export default function PortalConfirmEmail() {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // ignore — navigation will reflect signed-out state
    }
  };

  return (
    <PortalAuthLayout>
      <Chip variant="pending">Almost there</Chip>
      <h1 className="pauth-title">Sign in with Google</h1>
      <p className="pauth-lede">
        {email
          ? <>Use <strong>{email}</strong> when signing in with Google to access the portal.</>
          : "Sign in with your @thepncl.com Google account to access the portal."}
      </p>

      <div className="pauth-actions">
        <Link to="/portal/login" className="pauth-btn is-primary">
          Sign in with Google
        </Link>
        <button type="button" className="pauth-btn" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>
    </PortalAuthLayout>
  );
}
