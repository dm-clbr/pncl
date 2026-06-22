import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminClients } from "@/hooks/useAdminClients";
import { trackPageView } from "@/lib/analytics";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminClients() {
  const { session } = useAuth();
  const { clients, loading, error } = useAdminClients(session?.access_token);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.title = "Clients — PNCL Admin";
    trackPageView("admin_clients");
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) => {
      const clientName = `${client.primaryFirstName} ${client.primaryLastName}`.toLowerCase();
      return (
        clientName.includes(normalized)
        || client.agentName.toLowerCase().includes(normalized)
        || client.agentEmail.toLowerCase().includes(normalized)
        || (client.primaryPhone?.includes(normalized) ?? false)
        || (client.address?.toLowerCase().includes(normalized) ?? false)
      );
    });
  }, [clients, query]);

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <h1>Clients</h1>
          <p>All submitted client intake forms across agents.</p>
        </div>
      </div>

      <div className="admin-field" style={{ maxWidth: "420px", marginBottom: "1rem" }}>
        <label htmlFor="admin-client-search">Search</label>
        <input
          id="admin-client-search"
          type="search"
          placeholder="Client, agent, phone, or address"
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

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Phone</th>
                <th>Agent</th>
                <th>Date met</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5}>No clients found.</td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      {client.primaryFirstName} {client.primaryLastName}
                      {client.address ? (
                        <div className="portal-meta">{client.address}</div>
                      ) : null}
                    </td>
                    <td>{client.primaryPhone || "—"}</td>
                    <td>
                      {client.agentName}
                      <div className="portal-meta">{client.agentEmail}</div>
                    </td>
                    <td>{formatDate(client.dateMet)}</td>
                    <td>{formatDate(client.createdAt.slice(0, 10))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
