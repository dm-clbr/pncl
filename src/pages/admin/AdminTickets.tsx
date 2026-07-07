import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listAdminTickets,
  updateAdminTicket,
  type AdminTicket,
  type AdminTicketAssignee,
  type AdminTicketStatus,
} from "@/lib/admin-api";
import { trackPageView } from "@/lib/analytics";
import { toast } from "sonner";

const TYPE_LABELS: Record<AdminTicket["type"], string> = {
  hierarchy_change: "Hierarchy change",
  pay_tier: "Pay tier",
  commission_dispute: "Commission dispute",
  other: "Other",
};

const STATUS_LABELS: Record<AdminTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

type StatusFilter = "all" | AdminTicketStatus;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: AdminTicketStatus): string {
  if (status === "resolved") return "admin-status active";
  if (status === "in_progress") return "admin-status";
  return "admin-status error";
}

function TicketModal({
  ticket,
  admins,
  accessToken,
  onClose,
  onSaved,
}: {
  ticket: AdminTicket;
  admins: AdminTicketAssignee[];
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AdminTicketStatus>(ticket.status);
  const [assignedTo, setAssignedTo] = useState(ticket.assignedTo ?? "");
  const [resolution, setResolution] = useState(ticket.resolution ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateAdminTicket(accessToken, {
        ticketId: ticket.id,
        status,
        assignedTo: assignedTo || null,
        resolution: resolution.trim() || null,
      });
      toast.success(result.message);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={saving ? undefined : onClose}>
      <div
        className="admin-modal admin-ticket-modal"
        role="dialog"
        aria-labelledby="admin-ticket-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head">
          <div>
            <h2 id="admin-ticket-title">{ticket.subject}</h2>
            <p>
              {TYPE_LABELS[ticket.type]} from {ticket.agentName}
              {ticket.agentEmail ? ` (${ticket.agentEmail})` : ""} · {formatDate(ticket.createdAt)}
            </p>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="admin-ticket-description">{ticket.description}</p>

        <div className="admin-ticket-modal-fields">
          <label className="admin-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminTicketStatus)}
            >
              {(Object.keys(STATUS_LABELS) as AdminTicketStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Assigned to</span>
            <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
              <option value="">Unassigned</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="admin-field">
          <span>Resolution note (visible to the agent)</span>
          <textarea
            rows={3}
            value={resolution}
            placeholder="What was done to resolve this?"
            onChange={(event) => setResolution(event.target.value)}
          />
        </label>

        <div className="admin-form-actions">
          <button type="button" className="admin-secondary-btn" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="admin-primary-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTickets() {
  const { session } = useAuth();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [admins, setAdmins] = useState<AdminTicketAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Tickets — PNCL Admin";
    trackPageView("admin_tickets");
  }, []);

  const reload = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await listAdminTickets(token);
      setTickets(data.tickets);
      setAdmins(data.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(
    () => tickets.filter((ticket) => statusFilter === "all" || ticket.status === statusFilter),
    [tickets, statusFilter],
  );

  const counts = useMemo(() => ({
    all: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "open").length,
    in_progress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
  }), [tickets]);

  const activeTicket = activeTicketId
    ? tickets.find((ticket) => ticket.id === activeTicketId) ?? null
    : null;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <ClipboardCheck size={22} aria-hidden="true" />
        <div>
          <h1>Support tickets</h1>
          <p>Hierarchy changes, pay tier questions, and commission disputes raised by agents.</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="admin-field">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All ({counts.all})</option>
            <option value="open">Open ({counts.open})</option>
            <option value="in_progress">In progress ({counts.in_progress})</option>
            <option value="resolved">Resolved ({counts.resolved})</option>
          </select>
        </label>
      </div>

      {loading && <div className="onboarding-spinner admin-spinner" aria-label="Loading tickets" />}

      {!loading && error && <p className="admin-error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Agent</th>
                <th>Type</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.subject}</td>
                  <td>{ticket.agentName}</td>
                  <td>{TYPE_LABELS[ticket.type]}</td>
                  <td>
                    <span className={statusClass(ticket.status)}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </td>
                  <td>{ticket.assignedToName ?? "—"}</td>
                  <td>{formatDate(ticket.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      onClick={() => setActiveTicketId(ticket.id)}
                    >
                      Work ticket
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <p className="admin-empty">No tickets match this filter.</p>
          )}
        </div>
      )}

      {activeTicket && session?.access_token && (
        <TicketModal
          ticket={activeTicket}
          admins={admins}
          accessToken={session.access_token}
          onClose={() => setActiveTicketId(null)}
          onSaved={() => {
            setActiveTicketId(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
