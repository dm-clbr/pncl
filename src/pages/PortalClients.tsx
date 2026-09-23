import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, X } from "lucide-react";
import PinnacleFormPreview from "@/components/PinnacleFormPreview";
import BottomNav from "@/components/portal/BottomNav";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalBackground from "@/components/portal/PortalBackground";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalClients } from "@/hooks/usePortalClients";
import { usePortalProfile } from "@/hooks/usePortalProfile";
import { clientRecordToFormData } from "@/lib/client-intake";
import { trackPageView } from "@/lib/analytics";
import "@/styles/home2.css";
import "@/styles/client-intake.css";
import "@/styles/portal-tools.css";

function formatDate(value: string | null): string {
  if (!value) return "no date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalClients() {
  const { user } = useAuth();
  const { photoUrl, initials, displayName } = usePortalProfile(user);
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

  const searching = query.trim().length > 0;

  return (
    <div className="home2-page ptools-page">
      <PortalBackground />
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader
            name={displayName}
            email={user?.email}
            initials={initials}
            photoUrl={photoUrl}
          />

          <PortalSubpageHeader
            title="My Clients"
            aside={
              <Link to="/portal/clients/new" className="ptools-cta">
                New intake
              </Link>
            }
          />

          <p className="portal-panel-note">
            Financial inventory forms you have submitted for clients.
          </p>

          <div className="ptools-stack">
            <Pane
              title="Client list"
              aside={loading || error ? undefined : `${filteredClients.length}`}
            >
              <div className="ptools-search">
                <Field
                  label="Search clients"
                  id="client-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Name, phone, email, or address"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {searching && (
                  <button
                    type="button"
                    className="ptools-search-clear"
                    aria-label="Clear the client search"
                    onClick={() => setQuery("")}
                  >
                    <X size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>

              {loading && (
                <div className="ptools-rows" aria-busy="true" aria-label="Loading clients">
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                </div>
              )}

              {!loading && error && <p className="ptools-error">{error}</p>}

              {!loading && !error && filteredClients.length === 0 && (
                <EmptyState
                  icon={<Users aria-hidden="true" />}
                  title={searching ? "No matches" : "No clients yet"}
                  body={
                    searching
                      ? "No client matches that search."
                      : "Every intake you submit is listed here."
                  }
                  action={
                    <Link to="/portal/clients/new" className="ptools-cta">
                      Start your first intake
                    </Link>
                  }
                />
              )}

              {!loading && !error && filteredClients.length > 0 && (
                <ul className="ptools-rows">
                  {filteredClients.map((client) => (
                    <li key={client.id}>
                      <ListRow
                        label={`${client.primary_first_name} ${client.primary_last_name}`}
                        secondary={`${client.primary_phone || "no phone"} · Met ${formatDate(client.date_met)}`}
                        trailing={
                          <span className="ptools-row-action">
                            {selectedId === client.id ? "Hide form" : "View form"}
                          </span>
                        }
                        onClick={() =>
                          setSelectedId(client.id === selectedId ? null : client.id)
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Pane>

            {selectedClient && (
              <Pane
                title={`${selectedClient.primary_first_name} ${selectedClient.primary_last_name}`}
              >
                <PinnacleFormPreview data={clientRecordToFormData(selectedClient)} compact />
              </Pane>
            )}
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
