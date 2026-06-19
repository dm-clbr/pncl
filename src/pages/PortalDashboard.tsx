import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Link2,
  LogOut,
} from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { PORTAL_SECTIONS, type PortalLink, type PortalLinkSection } from "@/lib/portal-links";
import { buildReferralLink } from "@/lib/referral";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

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
  onToggle,
  children,
}: {
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`portal-tile-group${open ? " open" : ""}`}>
      <button
        type="button"
        className={`portal-tile${open ? " open" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="portal-tile-label">
          {label}
          {count !== undefined && <span className="portal-tile-count">({count})</span>}
        </span>
        <ChevronDown size={22} strokeWidth={2.5} className="portal-tile-chevron" aria-hidden="true" />
      </button>
      {open && children && <div className="portal-tile-panel">{children}</div>}
    </div>
  );
}

export default function PortalDashboard() {
  const { user, signOut } = useAuth();
  const referralLink = useMemo(
    () => (user?.id ? buildReferralLink(user.id) : ""),
    [user?.id],
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_dashboard");
    window.scrollTo(0, 0);
  }, []);

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

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";
  const agentEmail = user?.email ?? "";

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

          {referralLink && (
            <button type="button" className="portal-banner" onClick={handleCopyReferralLink}>
              <span className="portal-banner-icon" aria-hidden="true">
                <Link2 size={28} />
              </span>
              <span className="portal-banner-copy">
                <strong>Referral link ready</strong>
                <span>Tap to copy your personal onboarding link</span>
              </span>
              <Copy size={18} className="portal-banner-action" aria-hidden="true" />
            </button>
          )}

          <div className="portal-tiles">
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

            <button type="button" className="portal-signout" onClick={handleSignOut}>
              <LogOut size={18} strokeWidth={2.5} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
