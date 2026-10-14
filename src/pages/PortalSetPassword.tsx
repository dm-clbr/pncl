import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import Field from "@/components/portal/Field";
import Skeleton from "@/components/portal/Skeleton";
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
      <PortalAuthLayout>
        <h1 className="pauth-title">Portal is not configured.</h1>
        <p className="pauth-lede">Contact PNCL support for help.</p>
      </PortalAuthLayout>
    );
  }

  if (loading) {
    return (
      <PortalAuthLayout>
        <div className="pauth-loading" role="status" aria-busy="true" aria-label="Loading">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      </PortalAuthLayout>
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
    <PortalAuthLayout>
      <Chip>Employee Portal</Chip>
      <h1 className="pauth-title">Set your portal password</h1>
      <p className="pauth-lede">
        Your account uses a temporary password. Choose a new password before continuing.
      </p>
      <form onSubmit={handleSubmit} className="pauth-form">
        {/* ponytail: Chrome and every password manager want a username beside a
            new password. The address the agent already needs to see IS that
            field, read-only, so nothing is hidden and no duplicate exists. */}
        {user.email && (
          <div className="pauth-note">
            <label className="pauth-note-label" htmlFor="set-password-username">
              Portal email
            </label>
            <input
              id="set-password-username"
              className="pauth-note-value is-static"
              type="text"
              name="username"
              autoComplete="username"
              value={user.email}
              readOnly
            />
          </div>
        )}
        <Field
          label="New password"
          id="set-password"
          hint="At least 8 characters."
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Field
          label="Confirm password"
          id="set-password-confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <button type="submit" className="pauth-btn is-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Save password"}
        </button>
      </form>
    </PortalAuthLayout>
  );
}
