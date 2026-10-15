import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import { trackPageView } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient, getSupabaseConfig } from "@/lib/supabase";
import { isPendingPortalEnrollment } from "@/lib/portal-auth";
import { toast } from "sonner";

export default function OnboardingActivate() {
  const { user, session, loading } = useAuth();
  const [checking, setChecking] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const attemptedUserId = useRef<string | null>(null);
  const verificationInFlight = useRef(false);
  const userId = user?.id;
  const accessToken = session?.access_token;
  const pendingEnrollment = isPendingPortalEnrollment(user?.app_metadata);
  useEffect(() => {
    document.title = "Enter Portal — PNCL";
    trackPageView("employee-onboarding-activate");
  }, []);

  const verifyGoogleSignIn = useCallback(async () => {
    if (!accessToken || !userId || !pendingEnrollment || verificationInFlight.current) return;
    verificationInFlight.current = true;
    setChecking(true);
    setVerificationError(null);
    try {
      const { url, anonKey } = getSupabaseConfig();
      const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/activate-onboarding-google-signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Google sign-in is not complete yet.");
      const { data: refreshed, error } = await getSupabaseClient().auth.refreshSession();
      if (error) throw error;
      if (!refreshed.session || refreshed.session.user.id !== userId
        || refreshed.session.user.app_metadata?.enrollment_ready !== true) {
        throw new Error("Unable to confirm portal activation. Please try again.");
      }
      toast.success("Google sign-in confirmed. Your PNCL portal is ready.");
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Unable to verify Google sign-in.");
    } finally {
      verificationInFlight.current = false;
      setChecking(false);
    }
  }, [accessToken, userId, pendingEnrollment]);

  useEffect(() => {
    if (loading || !userId || !accessToken || !pendingEnrollment || attemptedUserId.current === userId) return;
    // Retry only on request after a failure; session refreshes and rerenders
    // must not restart activation or send duplicate verification requests.
    attemptedUserId.current = userId;
    void verifyGoogleSignIn();
  }, [loading, userId, accessToken, pendingEnrollment, verifyGoogleSignIn]);

  if (!loading && user && !pendingEnrollment) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <PortalAuthLayout>
      <Chip variant="pending">One final step</Chip>
      <h1 className="pauth-title">{user ? "Opening your PNCL portal" : "Activate your PNCL portal"}</h1>
      <p className="pauth-lede">
        {loading ? "Loading your sign-in…" : user
          ? "We’ll verify your Google sign-in and open the portal automatically."
          : "After setting up Gmail, sign in with your new @thepncl.com Google account. We’ll verify your sign-in and open the portal automatically."}
      </p>
      {verificationError && <div className="pauth-banner" role="alert">{verificationError}</div>}
      {loading || (user && !verificationError) ? (
        <p className="pauth-lede" role="status" aria-busy="true">
          {loading ? "Loading…" : "Checking Google sign-in…"}
        </p>
      ) : <div className="pauth-actions">
        {user ? <button type="button" className="pauth-btn is-primary" onClick={() => void verifyGoogleSignIn()} disabled={checking}>
          {checking ? "Checking Google…" : "Try verification again"}
        </button> :
        <Link to="/portal/login" className="pauth-btn is-primary">
          Continue to PNCL sign-in
        </Link>}
      </div>}
    </PortalAuthLayout>
  );
}
