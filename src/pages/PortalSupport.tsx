import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import PNCLLogo from "@/components/PNCLLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalTickets,
  submitPortalTicket,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_OPTIONS,
  type PortalTicket,
  type PortalTicketType,
} from "@/lib/portal-tickets";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";
import "@/styles/home2.css";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: PortalTicket["status"]): string {
  if (status === "resolved") return "admin-status active";
  if (status === "in_progress") return "admin-status";
  return "admin-status error";
}

export default function PortalSupport() {
  const { session } = useAuth();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<PortalTicketType>("hierarchy_change");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Support — PNCL Portal";
    trackPageView("portal_support");
    window.scrollTo(0, 0);
  }, []);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setTickets(await fetchPortalTickets(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tickets.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = session?.access_token;
    if (!token) return;

    setSubmitting(true);
    try {
      const result = await submitPortalTicket(token, {
        type,
        subject: subject.trim(),
        description: description.trim(),
      });
      toast.success(result.message);
      setSubject("");
      setDescription("");
      setType("hierarchy_change");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  };

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
              <p className="portal-welcome">Support tickets</p>
              <p className="portal-meta">
                Request hierarchy changes, dispute commissions, or ask PNCL anything.
              </p>
            </div>
            <Link to="/portal" className="admin-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to portal
            </Link>
          </header>

          <div className="carrier-sheet-panel portal-profile-panel">
            <div className="carrier-sheet-panel-head">
              <div>
                <h1>Open a ticket</h1>
                <p>
                  Tell us what you need. PNCL admins are notified right away and will follow up by
                  email.
                </p>
              </div>
            </div>

            <form className="admin-form portal-profile-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="portal-profile-form-grid">
                <label className="admin-field">
                  <span>What is this about?</span>
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as PortalTicketType)}
                  >
                    {TICKET_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={subject}
                    maxLength={200}
                    required
                    placeholder="Short summary"
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </label>
              </div>

              <label className="admin-field">
                <span>Details</span>
                <textarea
                  value={description}
                  rows={5}
                  maxLength={5000}
                  required
                  placeholder="Include policy numbers, names, dates — anything that helps us resolve this quickly."
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>

              <div className="admin-form-actions">
                <button type="submit" className="admin-primary-btn" disabled={submitting}>
                  <LifeBuoy size={15} aria-hidden="true" />
                  {submitting ? "Submitting..." : "Submit ticket"}
                </button>
              </div>
            </form>
          </div>

          <div className="carrier-sheet-panel portal-profile-panel">
            <div className="carrier-sheet-panel-head">
              <div>
                <h2>Your tickets</h2>
                <p>Status updates and resolutions appear here.</p>
              </div>
            </div>

            {loading ? (
              <div className="portal-incentives-loading">
                <span className="onboarding-spinner" aria-hidden="true" />
                <span>Loading tickets...</span>
              </div>
            ) : error ? (
              <p className="admin-error">{error}</p>
            ) : tickets.length === 0 ? (
              <p className="portal-panel-note">You haven&apos;t submitted any tickets yet.</p>
            ) : (
              <ul className="portal-documents-list">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="portal-documents-item portal-ticket-item">
                    <div className="portal-documents-copy">
                      <strong>{ticket.subject}</strong>
                      <span>
                        {TICKET_TYPE_LABELS[ticket.type]} · Submitted {formatDate(ticket.createdAt)}
                      </span>
                      {ticket.resolution && (
                        <p className="portal-ticket-resolution">PNCL: {ticket.resolution}</p>
                      )}
                    </div>
                    <span className={statusClass(ticket.status)}>
                      {TICKET_STATUS_LABELS[ticket.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
