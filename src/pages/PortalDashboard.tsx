import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  CircleAlert,
  Copy,
  GraduationCap,
  Link2,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { PORTAL_SECTIONS, type PortalLink, type PortalLinkSection } from "@/lib/portal-links";
import { buildReferralLink } from "@/lib/referral";
import { hasAdminConsoleAccess, isGenesisAdmin } from "@/lib/roles";
import {
  completePortalTodo,
  getPendingPortalTodos,
  type PortalTodo,
} from "@/lib/portal-todos";
import {
  dismissGenesisNotice,
  GENESIS_LOGIN_URL,
  refreshPortalUser,
  shouldShowGenesisNotice,
} from "@/lib/portal-messages";
import PortalIncentivesList from "@/components/PortalIncentivesList";
import { usePortalIncentives } from "@/hooks/usePortalIncentives";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

const PORTAL_SOCIAL_LINKS = [
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61588062292202",
    iconSrc: "/fb.svg",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/thepncl_/",
    iconSrc: "/insta.svg",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/the-pncl/?viewAsMember=true",
    iconSrc: "/linkedin.svg",
  },
] as const;

function PortalUrgentIcon({ size = 18 }: { size?: number }) {
  return (
    <span className="portal-urgent-icon" aria-hidden="true">
      <CircleAlert size={size} strokeWidth={2.5} />
    </span>
  );
}

function PortalSubLink({ link }: { link: PortalLink }) {
  const content = (
    <>
      <span>{link.title}</span>
      <ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" />
    </>
  );

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="portal-sub-link"
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={link.href} className="portal-sub-link">
      {content}
    </Link>
  );
}

function PortalTile({
  label,
  count,
  open,
  urgent,
  onToggle,
  children,
}: {
  label: string;
  count?: number;
  open: boolean;
  urgent?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`portal-tile-group${open ? " open" : ""}${urgent ? " urgent" : ""}`}>
      <button
        type="button"
        className={`portal-tile${open ? " open" : ""}${urgent ? " urgent" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="portal-tile-label">
          {urgent && <PortalUrgentIcon />}
          {label}
          {count !== undefined && <span className="portal-tile-count">({count})</span>}
          {urgent && <span className="portal-urgent-label">Action required</span>}
        </span>
        <ChevronDown size={22} strokeWidth={2.5} className="portal-tile-chevron" aria-hidden="true" />
      </button>
      {open && children && <div className="portal-tile-panel">{children}</div>}
    </div>
  );
}

function PortalTodoItem({
  todo,
  agentEmail,
  completing,
  onComplete,
}: {
  todo: PortalTodo;
  agentEmail: string;
  completing: boolean;
  onComplete: (todoId: string) => void;
}) {
  return (
    <div className="portal-todo-item urgent">
      <button
        type="button"
        className="portal-todo-check"
        onClick={() => onComplete(todo.id)}
        disabled={completing}
        aria-label={`Mark "${todo.title}" as complete`}
      >
        {completing ? (
          <span className="onboarding-spinner portal-todo-check-spinner" aria-hidden="true" />
        ) : (
          <Circle size={20} strokeWidth={2} aria-hidden="true" />
        )}
      </button>

      <div className="portal-todo-copy">
        <div className="portal-todo-title-row">
          <PortalUrgentIcon size={16} />
          <strong>{todo.title}</strong>
          <span className="portal-todo-urgent-tag">Do this ASAP</span>
        </div>
        <p>{todo.description}</p>
        {agentEmail && todo.showEmailHint !== false && (
          <p className="portal-todo-email">
            Use <span>{agentEmail}</span> when you sign up.
          </p>
        )}
        <a
          href={todo.href}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-todo-link"
        >
          {todo.actionLabel}
          <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export default function PortalDashboard() {
  const { user: authUser, signOut } = useAuth();
  const [portalUser, setPortalUser] = useState(authUser);
  const referralLink = useMemo(
    () => (portalUser?.id ? buildReferralLink(portalUser.id) : ""),
    [portalUser?.id],
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [completingTodoId, setCompletingTodoId] = useState<string | null>(null);
  const [dismissingGenesisNotice, setDismissingGenesisNotice] = useState(false);

  const pendingTodos = useMemo(() => getPendingPortalTodos(portalUser), [portalUser]);
  const showGenesisNotice = shouldShowGenesisNotice(portalUser);
  const { incentives, loading: incentivesLoading } = usePortalIncentives();

  useEffect(() => {
    setPortalUser(authUser);
  }, [authUser]);

  useEffect(() => {
    void refreshPortalUser()
      .then((user) => {
        if (user) setPortalUser(user);
      })
      .catch(() => {
        // Keep the cached session user if refresh fails.
      });
  }, []);

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_dashboard");
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (pendingTodos.length > 0) {
      setOpenSections((prev) => ({ ...prev, todos: true }));
    }
  }, [pendingTodos.length]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign out";
      toast.error(message);
    }
  };

  const handleCopyReferralLink = async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied to clipboard.");
    } catch {
      toast.error("Unable to copy link. Select and copy it manually.");
    }
  };

  const handleCompleteTodo = async (todoId: string) => {
    setCompletingTodoId(todoId);
    try {
      await completePortalTodo(todoId);
      toast.success("To-do marked complete.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update to-do.");
    } finally {
      setCompletingTodoId(null);
    }
  };

  const handleDismissGenesisNotice = async () => {
    setDismissingGenesisNotice(true);
    try {
      await dismissGenesisNotice();
      const refreshedUser = await refreshPortalUser();
      if (refreshedUser) setPortalUser(refreshedUser);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to dismiss notice.");
    } finally {
      setDismissingGenesisNotice(false);
    }
  };

  const displayName = portalUser?.user_metadata?.full_name ?? portalUser?.email?.split("@")[0] ?? "Agent";
  const agentEmail = portalUser?.email ?? "";
  const showAdminLink = hasAdminConsoleAccess(portalUser);
  const adminLink = isGenesisAdmin(portalUser) ? "/portal/admin/genesis" : "/portal/admin";

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark">
        <div className="wrap portal-wrap">
          <header className="portal-hero">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={44} />
            </Link>
            <p className="portal-welcome">Welcome, {displayName}</p>
            {agentEmail && <p className="portal-meta">{agentEmail}</p>}
          </header>

          {showGenesisNotice && (
            <div className="portal-notice-banner" role="status">
              <span className="portal-notice-icon" aria-hidden="true">
                <GraduationCap size={20} strokeWidth={2.25} />
              </span>
              <div className="portal-notice-copy">
                <strong>Your Pinnacle Genesis account is ready</strong>
                <p>
                  Check your email for login instructions to access Genesis. You can also open
                  Genesis anytime from the <strong>Pinnacle Genesis</strong> link under{" "}
                  <strong>Training &amp; Resources</strong> below.
                </p>
                <a
                  href={GENESIS_LOGIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-notice-link"
                >
                  Go to Pinnacle Genesis
                  <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
                </a>
              </div>
              <button
                type="button"
                className="portal-notice-dismiss"
                onClick={() => void handleDismissGenesisNotice()}
                disabled={dismissingGenesisNotice}
                aria-label="Dismiss Genesis account notice"
              >
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          )}

          {pendingTodos.length > 0 && (
            <div className="portal-urgent-banner" role="status">
              <PortalUrgentIcon />
              <p>
                <strong>{pendingTodos.length} urgent item{pendingTodos.length === 1 ? "" : "s"}</strong>
                <span>Complete your setup steps before getting started.</span>
              </p>
            </div>
          )}

          {referralLink && (
            <button type="button" className="portal-banner" onClick={handleCopyReferralLink}>
              <span className="portal-banner-icon" aria-hidden="true">
                <Link2 size={22} />
              </span>
              <span className="portal-banner-copy">
                <strong>Referral link ready</strong>
                <span>Tap to copy your personal onboarding link</span>
              </span>
              <Copy size={18} className="portal-banner-action" aria-hidden="true" />
            </button>
          )}

          <div className="portal-tiles">
            {pendingTodos.length > 0 && (
              <PortalTile
                label="Getting started"
                count={pendingTodos.length}
                urgent
                open={Boolean(openSections.todos)}
                onToggle={() => toggleSection("todos")}
              >
                <p className="portal-panel-note">
                  Complete these steps when you first join PNCL. Mark each item done once
                  you&apos;ve finished it.
                </p>
                {pendingTodos.map((todo) => (
                  <PortalTodoItem
                    key={todo.id}
                    todo={todo}
                    agentEmail={agentEmail}
                    completing={completingTodoId === todo.id}
                    onComplete={(id) => void handleCompleteTodo(id)}
                  />
                ))}
              </PortalTile>
            )}

            {referralLink && (
              <PortalTile
                label="Refer New Agents"
                count={1}
                open={Boolean(openSections.referrals)}
                onToggle={() => toggleSection("referrals")}
              >
                <p className="portal-panel-note">
                  Share this link with agents you refer. Their onboarding form will automatically
                  list you as their upline network.
                </p>
                <code className="portal-referral-url">{referralLink}</code>
                <button type="button" className="portal-panel-btn" onClick={handleCopyReferralLink}>
                  <Copy size={16} />
                  Copy link
                </button>
              </PortalTile>
            )}

            {PORTAL_SECTIONS.map((section: PortalLinkSection) => (
              <PortalTile
                key={section.id}
                label={section.title}
                count={section.links.length}
                open={Boolean(openSections[section.id])}
                onToggle={() => toggleSection(section.id)}
              >
                {section.links.map((link) => (
                  <PortalSubLink key={link.id} link={link} />
                ))}
              </PortalTile>
            ))}

            <PortalTile
              label="Incentives"
              count={incentives.length}
              open={Boolean(openSections.incentives)}
              onToggle={() => toggleSection("incentives")}
            >
              {incentivesLoading ? (
                <div className="portal-incentives-loading">
                  <span className="onboarding-spinner" aria-hidden="true" />
                  <span>Loading incentives...</span>
                </div>
              ) : incentives.length > 0 ? (
                <PortalIncentivesList items={incentives} />
              ) : (
                <p className="portal-panel-note">No incentives published yet.</p>
              )}
            </PortalTile>

            {showAdminLink && (
              <Link to={adminLink} className="portal-sub-link portal-admin-link">
                <span>{isGenesisAdmin(portalUser) ? "Genesis admin" : "Admin console"}</span>
                <Shield size={18} strokeWidth={2.5} aria-hidden="true" />
              </Link>
            )}

            <button type="button" className="portal-signout" onClick={handleSignOut}>
              <LogOut size={18} strokeWidth={2.5} aria-hidden="true" />
              Sign out
            </button>

            <div className="portal-socials">
              {PORTAL_SOCIAL_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-social-link"
                  aria-label={link.label}
                >
                  <span
                    className="portal-social-icon"
                    style={{
                      WebkitMaskImage: `url(${link.iconSrc})`,
                      maskImage: `url(${link.iconSrc})`,
                    }}
                    aria-hidden="true"
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
