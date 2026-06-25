import { Link } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
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
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-pending">Almost there</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Sign in with Google</h2>
      <p className="lead">
        {email
          ? <>Use <strong>{email}</strong> when signing in with Google to access the portal.</>
          : "Sign in with your @thepncl.com Google account to access the portal."}
      </p>

      <div className="onboarding-actions" style={{ marginTop: "1.5rem" }}>
        <Link to="/portal/login" className="btn btn-accent">
          Sign in with Google <span className="arr">→</span>
        </Link>
        <button type="button" className="btn btn-ghost" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </div>
    </OnboardingLayout>
  );
}
