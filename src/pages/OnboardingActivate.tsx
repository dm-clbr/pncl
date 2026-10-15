import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
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
    <PortalAuthLayout>
      <Chip variant="pending">One final step</Chip>
      <h1 className="pauth-title">Activate your PNCL portal</h1>
      <p className="pauth-lede">
        Your Gmail setup happens on the previous screen. When you&apos;ve finished it, continue to the
        PNCL portal sign-in and choose your new @thepncl.com Google account. We&apos;ll then verify the
        Google sign-in before opening the portal.
      </p>
      <div className="pauth-actions">
        <Link to="/portal/login" className="pauth-btn is-primary">
          Continue to PNCL sign-in
        </Link>
        {user && <button type="button" className="pauth-btn" onClick={() => void verifyGoogleSignIn()} disabled={checking}>
          {checking ? "Checking Google…" : "I signed in to Gmail — continue"}
        </button>}
      </div>
    </PortalAuthLayout>
  );
}
