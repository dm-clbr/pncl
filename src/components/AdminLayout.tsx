import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  Eye,
  FileSignature,
  FileText,
  GitBranch,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  MapPinned,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Trophy,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminAssist, isGenesisAdmin } from "@/lib/roles";
import "@/styles/home2.css";

const ADMIN_SIDEBAR_STORAGE_KEY = "pncl.admin.sidebar.collapsed";
const ADMIN_MOBILE_QUERY = "(max-width: 899px)";

const FULL_ADMIN_NAV = [
  { to: "/portal/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/portal/admin/hierarchy", label: "Hierarchy", icon: GitBranch, end: false },
  { to: "/portal/admin/users", label: "Users", icon: Users, end: false },
  { to: "/portal/admin/profile-review", label: "Profile review", icon: ClipboardCheck, end: false },
  { to: "/portal/admin/gmail-verification", label: "Gmail verification", icon: Mail, end: false },
  { to: "/portal/admin/onboarding-holds", label: "Agent enrollments", icon: Workflow, end: false },
  { to: "/portal/admin/contracting", label: "Contracting", icon: FileSignature, end: false },
  { to: "/portal/admin/lead-charges", label: "Lead charges", icon: Receipt, end: false },
  { to: "/portal/admin/setter-closer", label: "Setter / Closer", icon: Handshake, end: false },
  { to: "/portal/admin/tickets", label: "Tickets", icon: ClipboardCheck, end: false },
  { to: "/portal/admin/pay-policy", label: "Pay policy", icon: DollarSign, end: false },
  { to: "/portal/admin/users/new", label: "Add user", icon: UserPlus, end: false },
  { to: "/portal/admin/incentives", label: "Incentives", icon: Trophy, end: false },
  { to: "/portal/admin/brand-assets", label: "Brand assets", icon: Palette, end: false },
  { to: "/portal/admin/carriers", label: "Carriers", icon: Building2, end: false },
  { to: "/portal/admin/state-availability", label: "State availability", icon: MapPinned, end: false },
  { to: "/portal/admin/todos", label: "To-dos", icon: CheckSquare, end: false },
  { to: "/portal/admin/clients", label: "Clients", icon: ClipboardList, end: false },
  { to: "/portal/admin/dashboard-tabs", label: "Dashboard tabs", icon: LayoutGrid, end: false },
  { to: "/portal/admin/onboarding-preview", label: "Onboarding preview", icon: Eye, end: false },
  { to: "/portal/admin/w9-preview", label: "W-9 preview", icon: FileText, end: false },
  { to: "/portal/admin/genesis", label: "Genesis", icon: GraduationCap, end: false },
] as const;

const GENESIS_ADMIN_NAV = [
  { to: "/portal/admin/genesis", label: "Genesis", icon: GraduationCap, end: false },
  { to: "/portal/admin/onboarding-preview", label: "Onboarding preview", icon: Eye, end: false },
  { to: "/portal/admin/w9-preview", label: "W-9 preview", icon: FileText, end: false },
] as const;

const ADMIN_ASSIST_NAV = [
  { to: "/portal/admin/hierarchy", label: "Hierarchy", icon: GitBranch, end: false },
] as const;

function getStoredSidebarPreference() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeSidebarPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function useIsMobileAdminViewport() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(ADMIN_MOBILE_QUERY).matches
      : false
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(ADMIN_MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

export default function AdminLayout() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(getStoredSidebarPreference);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const isMobile = useIsMobileAdminViewport();
  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";
  const adminAssistOnly = isAdminAssist(user);
  const genesisAdminOnly = isGenesisAdmin(user);
  const navItems = adminAssistOnly
    ? ADMIN_ASSIST_NAV
    : genesisAdminOnly
      ? GENESIS_ADMIN_NAV
      : FULL_ADMIN_NAV;
  const consoleTitle = adminAssistOnly
    ? "Admin assist"
    : genesisAdminOnly
      ? "Genesis admin"
      : "Admin console";

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    if (isMobile && !mobileNavOpen) {
      sidebar.setAttribute("inert", "");
    } else {
      sidebar.removeAttribute("inert");
    }
  }, [isMobile, mobileNavOpen]);

  useEffect(() => {
    if (!isMobile || !mobileNavOpen) return;

    const sidebar = sidebarRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => mobileCloseButtonRef.current?.focus());

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !sidebar) return;

      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, mobileNavOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      storeSidebarPreference(next);
      return next;
    });
  };

  const closeMobileNavigation = (restoreFocus = true) => {
    setMobileNavOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  };

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark admin-dash">
        <div className={`admin-shell${collapsed ? " admin-shell-collapsed" : ""}`}>
          <button
            type="button"
            className={`admin-sidebar-backdrop${mobileNavOpen ? " open" : ""}`}
            aria-label="Close admin navigation"
            tabIndex={mobileNavOpen ? 0 : -1}
            onClick={() => closeMobileNavigation()}
          />

          <aside
            ref={sidebarRef}
            id="admin-sidebar"
            className={`admin-sidebar${mobileNavOpen ? " open" : ""}`}
            aria-label="Admin navigation panel"
            aria-hidden={isMobile && !mobileNavOpen ? true : undefined}
            aria-modal={isMobile ? true : undefined}
            role={isMobile ? "dialog" : undefined}
          >
            <div className="admin-sidebar-header">
              <Link to="/" className="admin-sidebar-brand" aria-label="PNCL home">
                <span className="admin-sidebar-logo-full">
                  <PNCLLogo height={32} />
                </span>
                <span className="admin-sidebar-logo-mark" aria-hidden="true">P</span>
              </Link>

              <button
                type="button"
                className="admin-sidebar-collapse"
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                aria-controls="admin-navigation"
                aria-expanded={!collapsed}
                title={collapsed ? "Expand navigation" : "Collapse navigation"}
                onClick={toggleCollapsed}
              >
                {collapsed
                  ? <PanelLeftOpen size={19} aria-hidden="true" />
                  : <PanelLeftClose size={19} aria-hidden="true" />}
              </button>

              <button
                ref={mobileCloseButtonRef}
                type="button"
                className="admin-sidebar-close"
                aria-label="Close navigation"
                onClick={() => closeMobileNavigation()}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </div>

            <div className="admin-sidebar-account">
              <span className="admin-sidebar-account-mark" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="admin-sidebar-account-copy">
                <span className="portal-welcome">{consoleTitle}</span>
                <span className="portal-meta">{displayName}</span>
              </span>
            </div>

            <nav id="admin-navigation" className="admin-nav" aria-label="Admin navigation">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `admin-nav-link${isActive ? " active" : ""}`}
                  title={collapsed && !isMobile ? label : undefined}
                  onClick={() => {
                    if (isMobile) closeMobileNavigation(false);
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="admin-nav-label">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="admin-sidebar-footer">
              <Link
                to="/portal"
                className="admin-back-link"
                title={collapsed && !isMobile ? "Agent portal" : undefined}
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span className="admin-nav-label">Agent portal</span>
              </Link>
            </div>
          </aside>

          <section className="admin-main">
            <header className="admin-mobile-bar">
              <button
                ref={mobileMenuButtonRef}
                type="button"
                className="admin-mobile-menu"
                aria-label="Open navigation"
                aria-controls="admin-sidebar"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={21} aria-hidden="true" />
              </button>
              <Link to="/" className="admin-mobile-brand" aria-label="PNCL home">
                <PNCLLogo height={26} />
              </Link>
              <span className="admin-mobile-title">{consoleTitle}</span>
            </header>

            <div className="admin-content">
              <Outlet />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
