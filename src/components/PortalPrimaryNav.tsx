import { LayoutDashboard, MapPinned } from "lucide-react";
import { NavLink } from "react-router-dom";

const PORTAL_NAV_ITEMS = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/portal/state-map", label: "State Map", icon: MapPinned, end: false },
] as const;

export default function PortalPrimaryNav() {
  return (
    <nav className="portal-primary-nav" aria-label="Agent portal">
      {PORTAL_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `portal-primary-nav-link${isActive ? " active" : ""}`}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
