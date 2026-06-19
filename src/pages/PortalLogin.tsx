import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { useAuth, isEmailConfirmed } from "@/contexts/AuthContext";
import { isSupabaseAuthConfigured } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function PortalLogin() {
  const { user, loading, signInWithEmail } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const configured = isSupabaseAuthConfigured();

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/portal";

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_login");
    window.scrollTo(0, 0);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in";
      toast.error(message);
    } finally {
      setSigningIn(false);
    }
  };

  if (!loading && user && isEmailConfirmed(user)) {
    return <Navigate to={from} replace />;
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
        Sign in with your @thepncl.com email and portal password.
      </p>

      {!configured ? (
        <p className="onboarding-error-block">
          Portal authentication is not configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> in your environment.
        </p>
      ) : (
        <form onSubmit={handleSignIn} style={{ marginTop: "1.5rem" }}>
          <div className="onboarding-field">
            <label htmlFor="portal-email">PNCL email</label>
            <input
              id="portal-email"
              type="email"
              autoComplete="username"
              placeholder="you@thepncl.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="onboarding-field">
            <label htmlFor="portal-password">Password</label>
            <input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              placeholder="Your portal password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="onboarding-actions">
            <button type="submit" className="btn btn-accent" disabled={signingIn}>
              {signingIn ? "Signing in…" : <>Sign in <span className="arr">→</span></>}
            </button>
          </div>
        </form>
      )}

      <p className="onboarding-help-text">
        New agent? Complete <Link to="/onboarding">onboarding</Link> first to create your portal account.
      </p>
    </OnboardingLayout>
  );
}
