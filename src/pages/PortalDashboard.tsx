import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, LogOut } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import { PORTAL_SECTIONS } from "@/lib/portal-links";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

export default function PortalDashboard() {
  const { user, signOut } = useAuth();

  useEffect(() => {
    document.title = "Employee Portal — PNCL";
    trackPageView("portal_dashboard");
    window.scrollTo(0, 0);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign out";
      toast.error(message);
    }
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <div className="portal-page portal-dashboard">
      <header className="portal-header">
        <Link to="/" className="portal-header-logo">
          <PNCLLogo height={28} />
        </Link>
        <div className="portal-header-actions">
          <span className="portal-user">{displayName}</span>
          <button type="button" className="portal-signout-btn" onClick={handleSignOut}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <main className="portal-main">
        <div className="portal-intro">
          <h1>Employee Portal</h1>
          <p>Quick links to the tools and resources you need every day.</p>
        </div>

        {PORTAL_SECTIONS.map((section) => (
          <section key={section.id} className="portal-section">
            <h2 className="portal-section-title">{section.title}</h2>
            <div className="portal-link-grid">
              {section.links.map((link) => {
                const Icon = link.icon;
                const card = (
                  <>
                    <div className="portal-link-icon">
                      <Icon size={22} />
                    </div>
                    <div className="portal-link-content">
                      <span className="portal-link-title">
                        {link.title}
                        {link.external && <ExternalLink size={14} className="portal-link-external" />}
                      </span>
                      <span className="portal-link-desc">{link.description}</span>
                    </div>
                  </>
                );

                if (link.external) {
                  return (
                    <a
                      key={link.id}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-link-card"
                    >
                      {card}
                    </a>
                  );
                }

                return (
                  <Link key={link.id} to={link.href} className="portal-link-card">
                    {card}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
