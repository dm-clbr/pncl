import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { useAdminAgents } from "@/hooks/useAdminAgents";
import { getProfileCompletenessQueue } from "@/lib/profile-completeness";
import { trackPageView } from "@/lib/analytics";

export default function AdminProfileCompleteness() {
  const { agents, loading, error, reload } = useAdminAgents();
  const queue = useMemo(() => getProfileCompletenessQueue(agents), [agents]);

  useEffect(() => {
    document.title = "Profile review — PNCL Admin";
    trackPageView("admin_profile_review");
  }, []);

  return (
    <section className="admin-panel">
      <div className="admin-panel-head admin-panel-head-row">
        <div style={{ display: "flex", gap: 14 }}>
          <ClipboardCheck size={22} aria-hidden="true" />
          <div>
            <h1>Profile review</h1>
            <p>Find missing operational profile requirements. This queue never displays SSNs, phone numbers, birth dates, personal emails, or credentials.</p>
          </div>
        </div>
        <button type="button" className="admin-icon-btn" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p className="admin-empty-state">Loading profile review…</p> : null}
      {!loading && !error && queue.length === 0 ? <p className="admin-empty-state">All current agent profiles meet the tracked requirements.</p> : null}
      {!loading && !error && queue.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Agent</th><th>Missing requirements</th><th>Review</th></tr></thead>
            <tbody>
              {queue.map(({ agent, gaps }) => (
                <tr key={agent.id}>
                  <td><strong>{agent.name}</strong><br /><span className="admin-table-subtext">{agent.email}</span></td>
                  <td>{gaps.map((item) => item.label).join(" · ")}</td>
                  <td><Link className="admin-secondary-link" to={`/portal/admin/users/${agent.id}`}>Open profile</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
