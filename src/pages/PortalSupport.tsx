import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Inbox, LifeBuoy } from "lucide-react";
import BottomNav from "@/components/portal/BottomNav";
import Chip, { type ChipVariant } from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Field from "@/components/portal/Field";
import ListRow from "@/components/portal/ListRow";
import Pane from "@/components/portal/Pane";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalSubpageHeader from "@/components/portal/PortalSubpageHeader";
import Segmented from "@/components/portal/Segmented";
import Skeleton from "@/components/portal/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalProfile } from "@/hooks/usePortalProfile";
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
import "@/styles/portal-tools.css";

const TYPE_LABEL = "What is this about?";

/** Four options, so the select becomes a Segmented control. The short labels
    are the ones the ticket rows already use, so one ticket reads the same in
    both places. */
const TYPE_ITEMS = TICKET_TYPE_OPTIONS.map((option) => ({
  value: option.value,
  label: TICKET_TYPE_LABELS[option.value],
}));

const STATUS_VARIANTS: Record<PortalTicket["status"], ChipVariant> = {
  open: "neutral",
  in_progress: "pending",
  resolved: "active",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PortalSupport() {
  const { session, user } = useAuth();
  const { photoUrl, initials, displayName } = usePortalProfile(user);
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
    <div className="home2-page ptools-page">
      <div className="grain" aria-hidden="true" />

      <main className="portal-dash dark carrier-sheet-dash">
        <div className="wrap carrier-sheet-wrap">
          <PortalHeader
            name={displayName}
            email={user?.email}
            initials={initials}
            photoUrl={photoUrl}
          />

          <PortalSubpageHeader title="Support" />

          <p className="portal-panel-note">
            Request hierarchy changes, dispute commissions, or ask PNCL anything.
          </p>

          <div className="ptools-stack">
            <Pane title="Open a ticket">
              <form
                className="ptools-form"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div className="ptools-group">
                  <span className="ptools-group-label" id="ticket-type-label">
                    {TYPE_LABEL}
                  </span>
                  <Segmented
                    items={TYPE_ITEMS}
                    value={type}
                    onChange={(value) => setType(value as PortalTicketType)}
                    label={TYPE_LABEL}
                    labelledBy="ticket-type-label"
                    mode="radiogroup"
                  />
                </div>

                <Field
                  label="Subject"
                  id="ticket-subject"
                  required
                  maxLength={200}
                  placeholder="Short summary"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />

                <Field
                  label="Details"
                  id="ticket-details"
                  required
                  hint="Policy numbers, names and dates all help us resolve it faster."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                >
                  <textarea className="portal-textarea" rows={5} maxLength={5000} />
                </Field>

                <div>
                  <button type="submit" className="ptools-cta" disabled={submitting}>
                    <LifeBuoy size={15} aria-hidden="true" />
                    {submitting ? "Submitting..." : "Submit ticket"}
                  </button>
                </div>
              </form>
            </Pane>

            <Pane title="Your tickets" aside={loading || error ? undefined : `${tickets.length}`}>
              {loading && (
                <div className="ptools-rows" aria-busy="true" aria-label="Loading tickets">
                  <Skeleton variant="row" />
                  <Skeleton variant="row" />
                </div>
              )}

              {!loading && error && <p className="ptools-error">{error}</p>}

              {!loading && !error && tickets.length === 0 && (
                <EmptyState
                  icon={<Inbox aria-hidden="true" />}
                  title="No tickets yet"
                  body="Send one above and its status shows up here."
                />
              )}

              {!loading && !error && tickets.length > 0 && (
                <ul className="ptools-rows">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <ListRow
                        label={ticket.subject}
                        secondary={`${TICKET_TYPE_LABELS[ticket.type]} · Submitted ${formatDate(ticket.createdAt)}`}
                        trailing={
                          <Chip variant={STATUS_VARIANTS[ticket.status]}>
                            {TICKET_STATUS_LABELS[ticket.status]}
                          </Chip>
                        }
                      />
                      {ticket.resolution && (
                        <p className="ptools-note">PNCL: {ticket.resolution}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
          </div>
        </div>
      </main>

      {/* Outside <main> so the fixed bar never inherits a page containing block. */}
      <BottomNav />
    </div>
  );
}
