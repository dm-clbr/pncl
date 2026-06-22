import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isGenesisAdmin } from "@/lib/roles";
import OnboardingLayout from "@/components/OnboardingLayout";

export default function AdminFullRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <OnboardingLayout>
        <div className="onboarding-spinner" aria-label="Loading" />
      </OnboardingLayout>
    );
  }

  if (isGenesisAdmin(user)) {
    return <Navigate to="/portal/admin/genesis" replace />;
  }

  return children;
}
