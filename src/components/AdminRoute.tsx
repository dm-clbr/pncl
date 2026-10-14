import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { hasAdminConsoleAccess, isAdminAssist } from "@/lib/roles";
import PortalLoading from "@/components/portal/PortalLoading";

export default function AdminRoute({
  children,
  allowAdminAssist = false,
}: {
  children: React.ReactNode;
  allowAdminAssist?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PortalLoading />;
  }

  if (!hasAdminConsoleAccess(user)) {
    return <Navigate to="/portal" replace />;
  }

  if (isAdminAssist(user) && !allowAdminAssist) {
    return <Navigate to="/portal/admin/hierarchy" replace />;
  }

  return children;
}
