import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckSquare, Eye, GitBranch, GraduationCap, LayoutGrid, Palette, Shield, Trophy, UserPlus, Users } from "lucide-react";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { trackPageView } from "@/lib/analytics";

const ADMIN_CARDS = [
  {
    to: "/portal/admin/hierarchy",
    title: "Referral hierarchy",
    description: "View the referral and connection line from upline to downline.",
    icon: GitBranch,
  },
  {
    to: "/portal/admin/users",
    title: "Manage users",
    description: "Browse the agent base, resend invites, and promote admins.",
    icon: Users,
  },
  {
    to: "/portal/admin/users/new",
    title: "Add user manually",
    description: "Provision portal access for an existing @thepncl.com mailbox.",
    icon: UserPlus,
  },
  {
    to: "/portal/admin/incentives",
    title: "Manage incentives",
    description: "Add, edit, and reorder the poster grid in the agent portal.",
    icon: Trophy,
  },
  {
    to: "/portal/admin/brand-assets",
    title: "Manage brand assets",
    description: "Upload logos, templates, and other brand files for agents.",
    icon: Palette,
  },
  {
    to: "/portal/admin/carriers",
    title: "Manage carriers",
    description: "Update carrier contacts and e-app links on the agent carrier sheet.",
    icon: Building2,
  },
  {
    to: "/portal/admin/todos",
    title: "Manage to-dos",
    description: "Edit the onboarding checklist and track completion across agents.",
    icon: CheckSquare,
  },
  {
    to: "/portal/admin/onboarding-preview",
    title: "Onboarding preview",
    description: "Walk through the new-agent onboarding flow exactly as applicants see it.",
    icon: Eye,
  },
  {
    to: "/portal/admin/dashboard-tabs",
    title: "Dashboard tabs",
    description: "Edit the collapsible tabs and links on the agent portal dashboard.",
    icon: LayoutGrid,
  },
  {
    to: "/portal/admin/genesis",
    title: "Genesis accounts",
    description: "Mark Pinnacle Genesis accounts as created and notify agents on their dashboard.",
    icon: GraduationCap,
  },
] as const;

export default function AdminDashboard() {
  const { agents, loading, error } = useAdminAgents();

  useEffect(() => {
    document.title = "Admin — PNCL Portal";
    trackPageView("admin_dashboard");
  }, []);

  const adminCount = agents.filter((agent) => agent.role === "admin").length;
  const activeCount = agents.filter((agent) => agent.emailConfirmed).length;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <Shield size={22} aria-hidden="true" />
        <div>
          <h1>Admin overview</h1>
          <p>Manage agents, referral lines, and portal access.</p>
        </div>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-stats">
          <div className="admin-stat">
            <strong>{agents.length}</strong>
            <span>Total agents</span>
          </div>
          <div className="admin-stat">
            <strong>{activeCount}</strong>
            <span>Active portal users</span>
          </div>
          <div className="admin-stat">
            <strong>{adminCount}</strong>
            <span>Admins</span>
          </div>
        </div>
      )}

      <div className="admin-card-grid">
        {ADMIN_CARDS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="admin-card">
            <span className="admin-card-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <strong>{title}</strong>
            <span>{description}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
