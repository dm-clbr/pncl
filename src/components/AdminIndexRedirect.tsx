import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import AdminDashboard from "@/pages/admin/AdminDashboard";

export default function AdminIndexRedirect() {
  const { user } = useAuth();

  if (isGenesisAdmin(user)) {
    return <Navigate to="/portal/admin/genesis" replace />;
  }

  if (isAdminAssist(user)) {
    return <Navigate to="/portal/admin/hierarchy" replace />;
  }

  return <AdminDashboard />;
}
