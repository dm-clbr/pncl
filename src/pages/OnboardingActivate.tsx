import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function OnboardingActivate() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  const configured = isSupabaseAuthConfigured();

  useEffect(() => {
    document.title = "Activate Portal — PNCL";
    trackPageView("employee-onboarding-activate");
  }, []);

  useEffect(() => {
    if (!configured || loading || user) return;

    const timeout = window.setTimeout(() => {
      setSessionTimedOut(true);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [configured, loading, user]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Portal account activated.");
      navigate("/portal", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to activate portal account.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!configured) {
    return (
      <OnboardingLayout>
        <h2 className="h3" style={{ margin: "1rem 0" }}>Portal activation is not configured.</h2>
        <p className="lead">Contact PNCL support for help.</p>
      </OnboardingLayout>
    );
  }

  if (loading) {
    return (
      <OnboardingLayout>
        <h2 className="h3" style={{ margin: "1rem 0" }}>Activating your portal account…</h2>
        <p className="lead">Please wait while we verify your email link.</p>
        <div className="onboarding-spinner" aria-hidden="true" />
      </OnboardingLayout>
    );
  }

  if (!user) {
    return (
      <OnboardingLayout>
        <h2 className="h3" style={{ margin: "1rem 0" }}>
          {sessionTimedOut ? "This activation link is invalid or expired." : "Verifying your activation link…"}
        </h2>
        <p className="lead">
          {sessionTimedOut
            ? "Open the latest portal activation email from your PNCL inbox, or contact PNCL support."
            : "Please wait a moment."}
        </p>
        {sessionTimedOut && (
          <Link to="/portal/login" className="btn btn-accent" style={{ marginTop: "1rem" }}>
            Go to Portal Login <span className="arr">→</span>
          </Link>
        )}
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-ready">Portal Activation</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Create your portal password</h2>
      <p className="lead">
        Your PNCL email is confirmed. Set a password for the Employee Portal to finish onboarding.
      </p>
      {user.email && (
        <div className="onboarding-email-block">
          <span className="onboarding-email-label">Portal email</span>
          <strong>{user.email}</strong>
        </div>
      )}
      <form onSubmit={handleActivate} className="portal-login-form" style={{ marginTop: "1rem" }}>
        <div className="onboarding-field">
          <label htmlFor="activate-password">Password</label>
          <input
            id="activate-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="onboarding-field">
          <label htmlFor="activate-confirm">Confirm password</label>
          <input
            id="activate-confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-accent" disabled={submitting}>
          {submitting ? "Activating…" : <>Activate Portal <span className="arr">→</span></>}
        </button>
      </form>
    </OnboardingLayout>
  );
}
