import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Users } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import PinnacleFormPreview from "@/components/PinnacleFormPreview";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalClients } from "@/hooks/usePortalClients";
import { clientRecordToFormData } from "@/lib/client-intake";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/client-intake.css";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalClients() {
  const { user } = useAuth();
  const { clients, loading, error } = usePortalClients(user?.id);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "My Clients — PNCL Portal";
    trackPageView("portal_clients");
    window.scrollTo(0, 0);
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) => {
      const name = `${client.primary_first_name} ${client.primary_last_name}`.toLowerCase();
      return (
        name.includes(normalized)
        || (client.primary_phone?.includes(normalized) ?? false)
        || (client.primary_email?.toLowerCase().includes(normalized) ?? false)
        || (client.address?.toLowerCase().includes(normalized) ?? false)
      );
    });
  }, [clients, query]);

  const selectedClient = useMemo(
    () => filteredClients.find((client) => client.id === selectedId) ?? null,
    [filteredClients, selectedId],
  );

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Agent";

  return (
    <div className="home2-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <header className="carrier-sheet-header">
            <Link to="/" className="portal-hero-logo" aria-label="PNCL home">
              <PNCLLogo height={40} />
            </Link>
            <div className="carrier-sheet-header-copy">
              <p className="portal-welcome">My clients</p>
              <p className="portal-meta">{displayName}</p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          <div className="carrier-sheet-panel">
            <div className="client-list-toolbar">
              <div>
                <h1>Client list</h1>
                <p>Financial inventory forms you have submitted for clients.</p>
              </div>
              <Link to="/portal/clients/new" className="btn btn-accent">
                <Plus size={16} aria-hidden="true" />
                New client intake
              </Link>
            </div>

            <div className="admin-field" style={{ maxWidth: "420px", marginBottom: "1rem" }}>
              <label htmlFor="client-search">Search clients</label>
              <input
                id="client-search"
                type="search"
                placeholder="Name, phone, email, or address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {loading && (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading clients...</span>
              </div>
            )}

            {!loading && error && <p className="admin-error">{error}</p>}

            {!loading && !error && filteredClients.length === 0 && (
              <div className="client-list-empty">
                <Users size={32} strokeWidth={1.5} aria-hidden="true" />
                <p>No clients yet.</p>
                <Link to="/portal/clients/new" className="btn btn-accent" style={{ marginTop: "1rem" }}>
                  Start your first intake
                </Link>
              </div>
            )}

            {!loading && !error && filteredClients.length > 0 && (
              <div className="client-detail-panel">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Phone</th>
                        <th>Date met</th>
                        <th>Added</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.map((client) => (
                        <tr key={client.id}>
                          <td>
                            {client.primary_first_name} {client.primary_last_name}
                          </td>
                          <td>{client.primary_phone || "—"}</td>
                          <td>{formatDate(client.date_met)}</td>
                          <td>{formatDate(client.created_at.slice(0, 10))}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setSelectedId(client.id === selectedId ? null : client.id)}
                            >
                              {selectedId === client.id ? "Hide form" : "View form"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedClient && (
                  <div>
                    <h2>
                      {selectedClient.primary_first_name} {selectedClient.primary_last_name}
                    </h2>
                    <PinnacleFormPreview
                      data={clientRecordToFormData(selectedClient)}
                      compact
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
