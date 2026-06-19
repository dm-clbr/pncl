import { Navigate, useLocation } from "react-router-dom";
import { useAuth, isEmailConfirmed, mustChangePassword } from "@/contexts/AuthContext";
import OnboardingLayout from "@/components/OnboardingLayout";
import PortalConfirmEmail from "@/pages/PortalConfirmEmail";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="onboarding-spinner" aria-label="Loading" />
      </OnboardingLayout>
    );
  }

  if (!user) {
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed(user)) {
    return <PortalConfirmEmail />;
  }

  if (mustChangePassword(user)) {
    return <Navigate to="/portal/set-password" replace />;
  }

  return children;
}
