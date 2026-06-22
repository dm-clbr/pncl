import { NavLink, Outlet, Link } from "react-router-dom";
import { ArrowLeft, GitBranch, LayoutDashboard, UserPlus, Users } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import "@/styles/home2.css";

const ADMIN_NAV = [
  { to: "/portal/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/portal/admin/hierarchy", label: "Hierarchy", icon: GitBranch, end: false },
  { to: "/portal/admin/users", label: "Users", icon: Users, end: false },
  { to: "/portal/admin/users/new", label: "Add user", icon: UserPlus, end: false },
] as const;

export default function AdminLayout() {
  const { user } = useAuth();
  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark admin-dash">
        <div className="wrap admin-wrap">
          <header className="admin-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="admin-header-copy">
              <p className="portal-welcome">Admin console</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Agent portal
            </Link>
          </header>

          <nav className="admin-nav" aria-label="Admin navigation">
            {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `admin-nav-link${isActive ? " active" : ""}`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
