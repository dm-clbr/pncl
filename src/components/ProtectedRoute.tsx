import { Navigate, useLocation } from "react-router-dom";
import { useAuth, isEmailConfirmed } from "@/contexts/AuthContext";
import PortalLoading from "@/components/portal/PortalLoading";
import PortalConfirmEmail from "@/pages/PortalConfirmEmail";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PortalLoading />;
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed(user)) {
    return <PortalConfirmEmail />;
  }

  return children;
}
