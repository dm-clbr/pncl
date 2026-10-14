import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import PortalLoading from "@/components/portal/PortalLoading";

export default function AdminFullRoute({
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

  if (isGenesisAdmin(user)) {
    return <Navigate to="/portal/admin/genesis" replace />;
  }

  if (isAdminAssist(user) && !allowAdminAssist) {
    return <Navigate to="/portal/admin/hierarchy" replace />;
  }

  return children;
}
