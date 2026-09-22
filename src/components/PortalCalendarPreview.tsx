import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  ChevronDown,
  ExternalLink,
  Link2,
  RefreshCw,
  Unlink,
  Video,
} from "lucide-react";
import Chip from "@/components/portal/Chip";
import EmptyState from "@/components/portal/EmptyState";
import Pane from "@/components/portal/Pane";
import Skeleton from "@/components/portal/Skeleton";
import {
  calendarEventSortValue,
  formatCalendarEventDate,
  formatCalendarEventTime,
  type PortalGoogleCalendarEvent,
  type PortalGoogleCalendarData,
} from "@/lib/portal-google-calendar";
import "@/styles/portal-calendar.css";

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

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** How far out the next event is, from a plain Date diff: minutes under the
    hour, hours under the day, then days. Intl writes the phrase, so "tomorrow"
    and the agent's locale come free. */
function formatRelativeStart(event: PortalGoogleCalendarEvent): string {
  const start = calendarEventSortValue(event);
  if (!Number.isFinite(start)) return "Starts soon";
  const minutes = Math.round((start - Date.now()) / 60000);
  if (minutes <= 0) return "Happening now";
  if (minutes < 60) return RELATIVE_TIME.format(minutes, "minute");
  if (minutes < 60 * 24) return RELATIVE_TIME.format(Math.round(minutes / 60), "hour");
  return RELATIVE_TIME.format(Math.round(minutes / (60 * 24)), "day");
}

/** Runs of the same day label. The list is already sorted, so one pass over it
    beats keying a map. */
function groupByDay(events: PortalGoogleCalendarEvent[]) {
  const days: { day: string; events: PortalGoogleCalendarEvent[] }[] = [];
  for (const event of events) {
    const day = formatCalendarEventDate(event);
    const last = days[days.length - 1];
    if (last?.day === day) last.events.push(event);
    else days.push({ day, events: [event] });
  }
  return days;
}

function JoinLink({ event, variant }: { event: PortalGoogleCalendarEvent; variant?: "primary" }) {
  if (!event.joinUrl) return null;
  return (
    <a
      href={event.joinUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`pcal-btn${variant === "primary" ? " is-primary" : ""}`}
      aria-label={`Join ${event.title}`}
    >
      <Video size={16} aria-hidden="true" />
      Join
    </a>
  );
}

function DisconnectConfirm(props: {
  disconnecting: boolean;
  onDisconnect: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="pcal-confirm" role="alert">
      <p>This revokes access and deletes your connection and cached preview.</p>
      <button type="button" className="pcal-btn" onClick={props.onDisconnect} disabled={props.disconnecting}>
        {props.disconnecting ? "Disconnecting…" : "Yes, disconnect"}
      </button>
      <button type="button" className="pcal-btn" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  );
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
      <div className="pcal">
        <Pane title="Next up">
          <div className="pcal-stack" role="status" aria-busy="true" aria-label="Loading your calendar">
            <Skeleton variant="text" width="38%" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} variant="row" />
            ))}
          </div>
        </Pane>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="pcal" role="alert">
        <Pane>
          <EmptyState
            icon={<CalendarX2 />}
            titleAs="h2"
            title="Calendar preview is unavailable"
            body={props.error}
            action={
              <button type="button" className="pcal-btn" onClick={props.onRetry}>
                <RefreshCw size={16} aria-hidden="true" />
                Try again
              </button>
            }
          />
        </Pane>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="pcal">
        <Pane>
          <EmptyState
            icon={<CalendarClock />}
            titleAs="h2"
            title="Bring your schedule into the portal"
            body="A read-only preview of the next 14 days on your primary calendar. PNCL cannot create, edit, or delete calendar events."
            action={
              <button
                type="button"
                className="pcal-btn is-primary"
                onClick={props.onConnect}
                disabled={props.connecting}
              >
                <Link2 size={17} aria-hidden="true" />
                {props.connecting ? "Opening Google…" : "Connect Google Calendar"}
              </button>
            }
          />
        </Pane>
      </div>
    );
  }

  if (connection.status === "reauthorization_required") {
    return (
      <div className="pcal">
        <Pane title="Calendar authorization expired">
          <p className="pcal-synced">
            Google no longer accepts this connection. Reconnect to restore your preview, or
            disconnect to delete the saved authorization and cached events.
          </p>
          <div className="pcal-actions">
            <button
              type="button"
              className="pcal-btn is-primary"
              onClick={props.onConnect}
              disabled={props.connecting}
            >
              <Link2 size={17} aria-hidden="true" />
              {props.connecting ? "Opening Google…" : "Reconnect"}
            </button>
            {!confirmingDisconnect && (
              <button type="button" className="pcal-btn" onClick={() => setConfirmingDisconnect(true)}>
                <Unlink size={16} aria-hidden="true" />
                Disconnect
              </button>
            )}
          </div>
          {confirmingDisconnect && (
            <DisconnectConfirm
              disconnecting={props.disconnecting}
              onDisconnect={props.onDisconnect}
              onCancel={() => setConfirmingDisconnect(false)}
            />
          )}
        </Pane>
      </div>
    );
  }

  const [nextEvent, ...laterEvents] = sortedEvents;

  return (
    <div className="pcal">
      <Pane title="Next up">
        {nextEvent ? (
          <div className="pcal-hero">
            <p className="pcal-when">{formatRelativeStart(nextEvent)}</p>
            <h3 className="pcal-hero-title">{nextEvent.title}</h3>
            <p className="pcal-meta">
              <span>{formatCalendarEventDate(nextEvent)}</span>
              <span>{formatCalendarEventTime(nextEvent)}</span>
              <span>{nextEvent.calendarContext}</span>
            </p>
            <JoinLink event={nextEvent} variant="primary" />
          </div>
        ) : (
          <EmptyState
            icon={<CalendarCheck2 />}
            title="Clear for the next 14 days"
            body="Nothing on your primary calendar inside the sync window."
          />
        )}
      </Pane>

      {connection.lastErrorCode === "sync_failed" && (
        <p className="pcal-note" role="status">
          The latest refresh did not finish. This is the last preview that synced.
        </p>
      )}

      {laterEvents.length > 0 && (
        <Pane title="Coming up" aside={`${laterEvents.length} more`}>
          {groupByDay(laterEvents).map(({ day, events }) => (
            <section key={day} className="pcal-day">
              <h3 className="pcal-day-head">{day}</h3>
              <ul className="pcal-list">
                {events.map((event) => (
                  <li key={event.id} className="pcal-item">
                    <span className="pcal-item-time">{formatCalendarEventTime(event)}</span>
                    <span className="pcal-item-copy">
                      <span className="pcal-item-title">{event.title}</span>
                      <span className="pcal-item-context">{event.calendarContext}</span>
                    </span>
                    <JoinLink event={event} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Pane>
      )}

      <Pane title="Connection" aside={<Chip variant="active">Connected · read only</Chip>}>
        <p className="pcal-synced">{formatLastSynced(connection.lastSyncedAt)}</p>
        <div className="pcal-actions">
          <button type="button" className="pcal-btn" onClick={props.onSync} disabled={props.syncing}>
            <RefreshCw className={props.syncing ? "is-spinning" : ""} size={16} aria-hidden="true" />
            {props.syncing ? "Refreshing…" : "Refresh"}
          </button>
          {!confirmingDisconnect && (
            <button type="button" className="pcal-btn" onClick={() => setConfirmingDisconnect(true)}>
              <Unlink size={15} aria-hidden="true" />
              Disconnect
            </button>
          )}
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
            className="pcal-link"
          >
            Manage access at Google
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>

        {confirmingDisconnect && (
          <DisconnectConfirm
            disconnecting={props.disconnecting}
            onDisconnect={props.onDisconnect}
            onCancel={() => setConfirmingDisconnect(false)}
          />
        )}

        <details className="pcal-details">
          <summary>
            <ChevronDown size={16} aria-hidden="true" />
            What PNCL stores
          </summary>
          <p>
            PNCL keeps only the title and time for up to 10 events in the next 14 days. Private
            events are saved as “Private event.” We do not retain descriptions, attendees,
            locations, or Google event IDs. When available, we keep one validated HTTPS
            conference link so you can join the event.
          </p>
        </details>
      </Pane>
    </div>
  );
}
