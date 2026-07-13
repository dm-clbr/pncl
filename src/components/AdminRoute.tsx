import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { hasAdminConsoleAccess, isAdminAssist } from "@/lib/roles";
import OnboardingLayout from "@/components/OnboardingLayout";

export default function AdminRoute({
  children,
  allowAdminAssist = false,
}: {
  children: React.ReactNode;
  allowAdminAssist?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="onboarding-spinner" aria-label="Loading" />
      </OnboardingLayout>
    );
  }

  if (!hasAdminConsoleAccess(user)) {
    return <Navigate to="/portal" replace />;
  }

  if (isAdminAssist(user) && !allowAdminAssist) {
    return <Navigate to="/portal/admin/hierarchy" replace />;
  }

  return children;
}
