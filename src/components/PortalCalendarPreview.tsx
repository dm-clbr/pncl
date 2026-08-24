import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  ExternalLink,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Video,
} from "lucide-react";
import {
  calendarEventSortValue,
  formatCalendarEventDate,
  formatCalendarEventTime,
  type PortalGoogleCalendarData,
} from "@/lib/portal-google-calendar";

interface PortalCalendarPreviewProps {
  data: PortalGoogleCalendarData;
  loading: boolean;
  error: string | null;
  connecting: boolean;
  syncing: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}

function formatLastSynced(value: string | null): string {
  if (!value) return "Not synced yet";
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return "Sync time unavailable";
  return `Last refreshed ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(time)}`;
}

export default function PortalCalendarPreview(props: PortalCalendarPreviewProps) {
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const sortedEvents = useMemo(
    () => [...props.data.events].sort((a, b) => calendarEventSortValue(a) - calendarEventSortValue(b)),
    [props.data.events],
  );
  const connection = props.data.connection;

  if (props.loading) {
    return (
      <div className="portal-calendar-state" role="status">
        <span className="onboarding-spinner" aria-hidden="true" />
        <div>
          <strong>Loading your calendar</strong>
          <p>Checking your private connection and upcoming preview…</p>
        </div>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="portal-calendar-state portal-calendar-state-error" role="alert">
        <CalendarX2 size={28} aria-hidden="true" />
        <div>
          <strong>Calendar preview is unavailable</strong>
          <p>{props.error}</p>
          <button type="button" className="portal-calendar-secondary-btn" onClick={props.onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="portal-calendar-connect-card">
        <span className="portal-calendar-connect-icon" aria-hidden="true">
          <CalendarClock size={34} />
        </span>
        <div>
          <p className="portal-calendar-eyebrow">Optional connection</p>
          <h2>Bring your schedule into the portal</h2>
          <p>
            Connect a Google account to see a short, read-only preview of upcoming events
            from its primary calendar. PNCL cannot create, edit, or delete calendar events.
          </p>
          <button
            type="button"
            className="portal-calendar-primary-btn"
            onClick={props.onConnect}
            disabled={props.connecting}
          >
            <Link2 size={17} aria-hidden="true" />
            {props.connecting ? "Opening Google…" : "Connect Google Calendar"}
          </button>
        </div>
      </div>
    );
  }

  if (connection.status === "reauthorization_required") {
    return (
      <div className="portal-calendar-state portal-calendar-state-expired" role="status">
        <CalendarX2 size={30} aria-hidden="true" />
        <div>
          <strong>Calendar authorization expired</strong>
          <p>
            Google no longer accepts this connection. Reconnect to restore your preview,
            or disconnect to delete the saved authorization and cached events.
          </p>
          <div className="portal-calendar-state-actions">
            <button
              type="button"
              className="portal-calendar-primary-btn"
              onClick={props.onConnect}
              disabled={props.connecting}
            >
              <Link2 size={17} aria-hidden="true" />
              {props.connecting ? "Opening Google…" : "Reconnect"}
            </button>
            <button
              type="button"
              className="portal-calendar-secondary-btn"
              onClick={() => setConfirmingDisconnect(true)}
            >
              <Unlink size={16} aria-hidden="true" />
              Disconnect
            </button>
          </div>
          {confirmingDisconnect && (
            <div className="portal-calendar-confirm" role="alert">
              <p>Delete this connection and any cached event preview?</p>
              <button type="button" onClick={props.onDisconnect} disabled={props.disconnecting}>
                {props.disconnecting ? "Disconnecting…" : "Yes, disconnect"}
              </button>
              <button type="button" onClick={() => setConfirmingDisconnect(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="portal-calendar-connected">
      <div className="portal-calendar-connected-head">
        <div className="portal-calendar-connected-copy">
          <span className="portal-calendar-status-badge">
            <CalendarCheck2 size={15} aria-hidden="true" />
            Connected · read only
          </span>
          <h2>Upcoming events</h2>
          <p>{formatLastSynced(connection.lastSyncedAt)} · Primary calendar</p>
        </div>
        <button
          type="button"
          className="portal-calendar-secondary-btn"
          onClick={props.onSync}
          disabled={props.syncing}
        >
          <RefreshCw className={props.syncing ? "is-spinning" : ""} size={16} aria-hidden="true" />
          {props.syncing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {connection.lastErrorCode === "sync_failed" && (
        <div className="portal-calendar-inline-error" role="status">
          The latest refresh did not finish. Your previous preview is shown below.
        </div>
      )}

      {sortedEvents.length === 0 ? (
        <div className="portal-calendar-empty">
          <CalendarCheck2 size={30} aria-hidden="true" />
          <strong>No upcoming events</strong>
          <p>Your primary calendar is clear for the next 14 days.</p>
        </div>
      ) : (
        <ol className="portal-calendar-event-list">
          {sortedEvents.map((event) => (
            <li key={event.id} className="portal-calendar-event">
              <div className="portal-calendar-event-date">
                <span>{formatCalendarEventDate(event)}</span>
                <strong>{formatCalendarEventTime(event)}</strong>
              </div>
              <div className="portal-calendar-event-copy">
                <h3>{event.title}</h3>
                <p>{event.calendarContext}</p>
              </div>
              {event.joinUrl && (
                <a
                  href={event.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-calendar-join-btn"
                  aria-label={`Join ${event.title}`}
                >
                  <Video size={16} aria-hidden="true" />
                  Join
                </a>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="portal-calendar-footer-actions">
        {!confirmingDisconnect ? (
          <button
            type="button"
            className="portal-calendar-text-btn"
            onClick={() => setConfirmingDisconnect(true)}
          >
            <Unlink size={15} aria-hidden="true" />
            Disconnect Google Calendar
          </button>
        ) : (
          <div className="portal-calendar-confirm" role="alert">
            <p>This revokes access and deletes your connection and cached preview.</p>
            <button type="button" onClick={props.onDisconnect} disabled={props.disconnecting}>
              {props.disconnecting ? "Disconnecting…" : "Yes, disconnect"}
            </button>
            <button type="button" onClick={() => setConfirmingDisconnect(false)}>
              Cancel
            </button>
          </div>
        )}
        <a
          href="https://myaccount.google.com/connections"
          target="_blank"
          rel="noopener noreferrer"
          className="portal-calendar-google-link"
        >
          Manage access at Google
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      <div className="portal-calendar-privacy-note">
        <ShieldCheck size={19} aria-hidden="true" />
        <p>
          <strong>Private by design.</strong> PNCL keeps only the title and time for up to
          10 events in the next 14 days. Private events are saved as “Private event.” We do
          not retain descriptions, attendees, locations, or Google event IDs. When available,
          we keep one validated HTTPS conference link so you can join the event.
        </p>
      </div>
    </div>
  );
}
