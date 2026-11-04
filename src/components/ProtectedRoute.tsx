import { Navigate, useLocation } from "react-router-dom";
import { useAuth, isEmailConfirmed } from "@/contexts/AuthContext";
import PortalLoading from "@/components/portal/PortalLoading";
import PortalAuthUnavailable from "@/components/portal/PortalAuthUnavailable";
import PortalConfirmEmail from "@/pages/PortalConfirmEmail";
import { isPendingPortalEnrollment, PORTAL_ACTIVATE_PATH } from "@/lib/portal-auth";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, retryAuth } = useAuth();
  const location = useLocation();

  if (authError) return <PortalAuthUnavailable message={authError} onRetry={retryAuth} />;

  if (loading) {
    return <PortalLoading />;
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed(user)) {
    return <PortalConfirmEmail />;
  }

  if (isPendingPortalEnrollment(user.app_metadata)) {
    return <Navigate to={PORTAL_ACTIVATE_PATH} replace />;
  }

  return children;
}
