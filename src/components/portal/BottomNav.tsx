import { CalendarDays, LayoutDashboard, MapPinned, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/portal/calendar", label: "Calendar", icon: CalendarDays, end: false },
  { to: "/portal/state-map", label: "State Map", icon: MapPinned, end: false },
  { to: "/portal/profile", label: "Profile", icon: UserRound, end: false },
] as const;

/** Fixed bottom tab bar, rendered only at 620px and below (CSS, not JS, so the
    markup is identical at every width). Four destinations in the thumb zone;
    Sign out and the socials stay in the page footer, never here. NavLink sets
    aria-current="page" on the active tab. Styles under .portal-bottom-nav in
    src/styles/portal-shell.css.

    Mount it OUTSIDE PortalBentoStage: the stage is preserve-3d, which makes it
    the containing block for position: fixed. A sibling of the page's <main> is
    the safe spot. */
export default function BottomNav() {
  return (
    <nav className="portal-bottom-nav" aria-label="Portal sections">
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `portal-bottom-nav-item${isActive ? " active" : ""}`
          }
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="portal-bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
