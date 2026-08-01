import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import OnboardingLayout from "@/components/OnboardingLayout";
import { trackPageView } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, getSupabaseConfig } from "@/lib/supabase";
import { toast } from "sonner";

export default function OnboardingActivate() {
  const { user, session, loading } = useAuth();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    document.title = "Enter Portal — PNCL";
    trackPageView("employee-onboarding-activate");
  }, []);

  const verifyGoogleSignIn = async () => {
    if (!session) return;
    setChecking(true);
    try {
      const { url, anonKey } = getSupabaseConfig();
      const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/activate-onboarding-google-signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Google sign-in is not complete yet.");
      await getSupabaseClient().auth.refreshSession();
      toast.success("Google sign-in confirmed. Your PNCL portal is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify Google sign-in.");
    } finally {
      setChecking(false);
    }
  };

  if (!loading && user?.app_metadata?.enrollment_version === 3 && user.app_metadata?.enrollment_ready === true) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <OnboardingLayout>
      <span className="onboarding-status-badge tone-pending">One final step</span>
      <h2 className="h3" style={{ margin: "1rem 0" }}>Activate your PNCL portal</h2>
      <p className="lead">
        Your Gmail setup happens on the previous screen. When you&apos;ve finished it, continue to the
        PNCL portal sign-in and choose your new @thepncl.com Google account. We&apos;ll then verify the
        Google sign-in before opening the portal.
      </p>
      <Link to="/portal/login" className="btn btn-accent" style={{ marginTop: "1rem" }}>
        Continue to PNCL sign-in <span className="arr">→</span>
      </Link>
      {user && <button type="button" className="btn btn-ghost" onClick={() => void verifyGoogleSignIn()} disabled={checking} style={{ marginTop: "0.75rem" }}>
        {checking ? "Checking Google…" : "I signed in to Gmail — continue"}
      </button>}
    </OnboardingLayout>
  );
}
