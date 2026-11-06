import { CalendarDays, LayoutDashboard, Link2, MapPinned, Wallet } from "lucide-react";
import { NavLink } from "react-router-dom";
import { PORTAL_LEADSPPLY_OPEN } from "@/lib/portal-leadspply-sso";
import { PORTAL_PAY_PATH } from "@/lib/portal-pay";

const PORTAL_NAV_ITEMS = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true, newTab: false },
  { to: "/portal/calendar", label: "Calendar", icon: CalendarDays, end: false, newTab: false },
  { to: "/portal/state-map", label: "State Map", icon: MapPinned, end: false, newTab: false },
  { to: PORTAL_LEADSPPLY_OPEN, label: "LeadSpply", icon: Link2, end: false, newTab: true },
  { to: PORTAL_PAY_PATH, label: "PNCL Pay", icon: Wallet, end: false, newTab: true },
] as const;

export default function PortalPrimaryNav() {
  return (
    <nav className="portal-primary-nav" aria-label="Agent portal">
      {PORTAL_NAV_ITEMS.map(({ to, label, icon: Icon, end, newTab }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          title={newTab ? "Opens in a new tab" : undefined}
          className={({ isActive }) => `portal-primary-nav-link${isActive ? " active" : ""}`}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
