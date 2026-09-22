import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth, isEmailConfirmed } from "@/contexts/AuthContext";
import { isSupabaseAuthConfigured } from "@/lib/supabase";
import { consumePortalOAuthReturn, isPendingPortalEnrollment } from "@/lib/portal-auth";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function PortalLogin() {
  const { user, loading, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);
  const configured = isSupabaseAuthConfigured();

  const [redirectTarget] = useState(() => {
    const stateFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    return stateFrom ?? consumePortalOAuthReturn() ?? "/portal";
  });

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_login");
    window.scrollTo(0, 0);
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningInWithGoogle(true);
    try {
      await signInWithGoogle(redirectTarget);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in with Google";
      toast.error(message);
      setSigningInWithGoogle(false);
    }
  };

  if (!loading && user && isEmailConfirmed(user) && isPendingPortalEnrollment(user.app_metadata)) {
    return <Navigate to="/onboarding/activate" replace />;
  }

  if (!loading && user && isEmailConfirmed(user)) {
    return <Navigate to={redirectTarget} replace />;
  }

  if (loading) {
    return (
      <PortalAuthLayout>
        <div className="pauth-loading" role="status" aria-busy="true" aria-label="Loading">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="62%" />
          <Skeleton variant="text" width="88%" />
          <Skeleton variant="row" />
        </div>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout>
      <Chip>Employee Portal</Chip>
      <h1 className="pauth-title">Welcome back</h1>
      <p className="pauth-lede">
        Sign in with your @thepncl.com Google account.
      </p>

      {!configured ? (
        <div className="pauth-banner" role="alert">
          <p className="pauth-banner-title">Portal authentication is not configured.</p>
          <p>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your
            environment.
          </p>
        </div>
      ) : (
        <div className="pauth-actions">
          <button
            type="button"
            className="pauth-btn is-primary"
            disabled={signingInWithGoogle}
            onClick={() => void handleGoogleSignIn()}
          >
            {signingInWithGoogle ? "Redirecting to Google…" : "Sign in with Google"}
          </button>
        </div>
      )}
    </PortalAuthLayout>
  );
}
