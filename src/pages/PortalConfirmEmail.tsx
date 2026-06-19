import { useState } from "react";
import { Link } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function PortalConfirmEmail() {
  const { user, resendConfirmationEmail, signOut } = useAuth();
  const [resending, setResending] = useState(false);

  const email = user?.email ?? "";

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await resendConfirmationEmail(email);
      toast.success("Confirmation email sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resend confirmation email.");
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-pending">Almost there</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Confirm your PNCL email</h2>
      <p className="lead">
        We sent a confirmation link to <strong>{email}</strong>.
        Open it from your PNCL inbox to activate your portal account.
      </p>

      <div className="onboarding-actions" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="btn btn-accent"
          onClick={handleResend}
          disabled={resending || !email}
        >
          {resending ? "Sending…" : <>Resend confirmation email <span className="arr">→</span></>}
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </OnboardingLayout>
  );
}
