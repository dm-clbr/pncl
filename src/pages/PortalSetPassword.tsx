import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { useAuth, isEmailConfirmed, mustChangePassword } from "@/contexts/AuthContext";
import { getSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function PortalSetPassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseAuthConfigured();

  useEffect(() => {
    document.title = "Set Portal Password — PNCL";
    trackPageView("portal_set_password");
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (error) throw error;

      toast.success("Password updated.");
      navigate("/portal", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!configured) {
    return (
      <OnboardingLayout>
        <h2 className="h3" style={{ margin: "1rem 0" }}>Portal is not configured.</h2>
        <p className="lead">Contact PNCL support for help.</p>
      </OnboardingLayout>
    );
  }

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="onboarding-spinner" aria-label="Loading" />
      </OnboardingLayout>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" replace />;
  }

  if (!isEmailConfirmed(user)) {
    return <Navigate to="/portal/login" replace />;
  }

  if (!mustChangePassword(user)) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-ready">Employee Portal</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Set your portal password</h2>
      <p className="lead">
        Your account uses a temporary password. Choose a new password before continuing.
      </p>
      {user.email && (
        <div className="onboarding-email-block">
          <span className="onboarding-email-label">Portal email</span>
          <strong>{user.email}</strong>
        </div>
      )}
      <form onSubmit={handleSubmit} className="portal-login-form" style={{ marginTop: "1rem" }}>
        <div className="onboarding-field">
          <label htmlFor="set-password">New password</label>
          <input
            id="set-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="onboarding-field">
          <label htmlFor="set-password-confirm">Confirm password</label>
          <input
            id="set-password-confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-accent" disabled={submitting}>
          {submitting ? "Saving…" : <>Save password <span className="arr">→</span></>}
        </button>
      </form>
    </OnboardingLayout>
  );
}
