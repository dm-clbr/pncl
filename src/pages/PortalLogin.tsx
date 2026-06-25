import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { useAuth, isEmailConfirmed } from "@/contexts/AuthContext";
import { isSupabaseAuthConfigured } from "@/lib/supabase";
import { consumePortalOAuthReturn } from "@/lib/portal-auth";
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

  if (!loading && user && isEmailConfirmed(user)) {
    return <Navigate to={redirectTarget} replace />;
  }

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="onboarding-spinner" aria-label="Loading" />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-neutral">Employee Portal</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Welcome back</h2>
      <p className="lead">
        Sign in with your @thepncl.com Google account.
      </p>

      {!configured ? (
        <p className="onboarding-error-block">
          Portal authentication is not configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
        </p>
      ) : (
        <div className="onboarding-actions" style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            className="btn btn-accent"
            disabled={signingInWithGoogle}
            onClick={() => void handleGoogleSignIn()}
          >
            {signingInWithGoogle ? "Redirecting to Google…" : "Sign in with Google"}
          </button>
        </div>
      )}

      <p className="onboarding-help-text">
        New agent? Complete <Link to="/onboarding">onboarding</Link> first to create your portal account.
      </p>
    </OnboardingLayout>
  );
}
