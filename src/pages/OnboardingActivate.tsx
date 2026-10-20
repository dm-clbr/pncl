import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import PortalAuthLayout from "@/components/portal/PortalAuthLayout";
import Chip from "@/components/portal/Chip";
import { trackPageView } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { activatePortalEnrollment, PortalActivationSignInError } from "@/lib/portal-activation";
import { isPendingPortalEnrollment } from "@/lib/portal-auth";
import { toast } from "sonner";

export default function OnboardingActivate() {
  const { user, session, loading, signInWithGoogle } = useAuth();
  const [checking, setChecking] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const attemptedUserId = useRef<string | null>(null);
  const verificationInFlight = useRef(false);
  const userId = user?.id;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
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
    setNeedsSignIn(false);
    try {
      await activatePortalEnrollment(userId);
      if (currentUserId.current !== userId) return;
      toast.success("Google sign-in confirmed. Your PNCL portal is ready.");
    } catch (error) {
      if (currentUserId.current !== userId) return;
      setNeedsSignIn(error instanceof PortalActivationSignInError);
      setVerificationError(error instanceof Error ? error.message : "Unable to verify Google sign-in.");
    } finally {
      verificationInFlight.current = false;
      setChecking(false);
    }
  }, [accessToken, userId, pendingEnrollment]);

  useEffect(() => {
    if (!userId) {
      attemptedUserId.current = null;
      return;
    }
    if (loading || checking || verificationInFlight.current || !accessToken || !pendingEnrollment || attemptedUserId.current === userId) return;
    // Retry only on request after a failure; session refreshes and rerenders
    // must not restart activation or send duplicate verification requests.
    attemptedUserId.current = userId;
    void verifyGoogleSignIn();
  }, [loading, checking, userId, accessToken, pendingEnrollment, verifyGoogleSignIn]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setVerificationError(null);
    try {
      // Start OAuth directly, even if a revoked session is still in React state.
      // Going through /portal/login would send pending users right back here.
      await signInWithGoogle();
    } catch (error) {
      setNeedsSignIn(true);
      setVerificationError(error instanceof Error ? error.message : "Unable to sign in with Google.");
      setSigningIn(false);
    }
  };

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
      {loading || (user && !verificationError && !needsSignIn) ? (
        <p className="pauth-lede" role="status" aria-busy="true">
          {loading ? "Loading…" : "Checking Google sign-in…"}
        </p>
      ) : <div className="pauth-actions">
        {user && !needsSignIn ? <button type="button" className="pauth-btn is-primary" onClick={() => void verifyGoogleSignIn()} disabled={checking}>
          {checking ? "Checking Google…" : "Try verification again"}
        </button> :
        <button type="button" className="pauth-btn is-primary" onClick={() => void handleSignIn()} disabled={signingIn}>
          {signingIn ? "Redirecting to Google…" : "Sign in with Google"}
        </button>}
      </div>}
    </PortalAuthLayout>
  );
}
