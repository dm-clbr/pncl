import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PortalCalendarPreview from "@/components/PortalCalendarPreview";
import type { PortalGoogleCalendarData } from "@/lib/portal-google-calendar";

const actions = {
  onConnect: vi.fn(),
  onSync: vi.fn(),
  onDisconnect: vi.fn(),
  onRetry: vi.fn(),
};

function renderPreview(
  data: PortalGoogleCalendarData,
  overrides: Partial<React.ComponentProps<typeof PortalCalendarPreview>> = {},
) {
  return render(
    <PortalCalendarPreview
      data={data}
      loading={false}
      error={null}
      connecting={false}
      syncing={false}
      disconnecting={false}
      {...actions}
      {...overrides}
    />,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PortalCalendarPreview", () => {
  it("offers an explicit read-only connection when no calendar is connected", () => {
    renderPreview({ connection: null, events: [] });
    expect(screen.getByRole("heading", { name: "Bring your schedule into the portal" })).toBeInTheDocument();
    expect(screen.getByText(/cannot create, edit, or delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(actions.onConnect).toHaveBeenCalled();
  });

  it("renders connected state, event context, refresh, and privacy disclosure", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    renderPreview({
      connection: {
        status: "connected",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        connectedAt: "2026-08-24T10:00:00Z",
        lastSyncedAt: "2026-08-24T10:01:00Z",
        syncWindowEnd: "2026-09-07T10:01:00Z",
        lastErrorCode: null,
      },
      events: [{
        id: "event-1",
        title: "Private event",
        startsAt: "2026-08-25T09:00:00Z",
        endsAt: "2026-08-25T10:00:00Z",
        startDate: null,
        endDate: null,
        allDay: false,
        calendarContext: "Primary calendar",
        joinUrl: "https://meet.google.com/abc-defg-hij",
        cachedAt: "2026-08-24T10:01:00Z",
      }],
    });

    expect(screen.getByText("Connected · read only")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Private event" })).toBeInTheDocument();
    expect(screen.getAllByText("Primary calendar").length).toBeGreaterThan(0);
    const joinLink = screen.getByRole("link", { name: "Join Private event" });
    expect(joinLink).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(joinLink).toHaveAttribute("target", "_blank");
    expect(joinLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/do not retain descriptions, attendees, locations/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(actions.onSync).toHaveBeenCalled();
  });

  it("shows reauthorization and an explicit disconnect confirmation", () => {
    renderPreview({
      connection: {
        status: "reauthorization_required",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        connectedAt: "2026-08-24T10:00:00Z",
        lastSyncedAt: null,
        syncWindowEnd: null,
        lastErrorCode: "authorization_expired",
      },
      events: [],
    });

    expect(screen.getByText("Calendar authorization expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(actions.onDisconnect).toHaveBeenCalled();
  });

  it("writes the hero's relative start from the diff between now and the start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    const cases: [string, string | null, RegExp][] = [
      ["in 30 minutes", "2026-09-22T12:30:00Z", /30 minute/i],
      ["in 5 hours", "2026-09-22T17:00:00Z", /5 hour/i],
      ["in 3 days", "2026-09-25T12:00:00Z", /3 day/i],
      ["running now", "2026-09-22T11:30:00Z", /^Happening now$/],
      ["no start time", null, /^Starts soon$/],
    ];
    for (const [, startsAt, expected] of cases) {
      renderPreview({
        connection: {
          status: "connected",
          scope: "https://www.googleapis.com/auth/calendar.events.readonly",
          connectedAt: "2026-09-21T10:00:00Z",
          lastSyncedAt: "2026-09-21T10:01:00Z",
          syncWindowEnd: "2026-10-05T10:01:00Z",
          lastErrorCode: null,
        },
        events: [{
          id: "relative-event",
          title: "Relative event",
          startsAt,
          endsAt: startsAt ? new Date(new Date(startsAt).getTime() + 3600000).toISOString() : null,
          startDate: null,
          endDate: null,
          allDay: false,
          calendarContext: "Primary calendar",
          joinUrl: null,
          cachedAt: "2026-09-21T10:01:00Z",
        }],
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
      cleanup();
    }
  });

  it("drops events that already ended, all-day ones included", () => {
    vi.useFakeTimers();
    // Local, not UTC: an all-day event ends at its exclusive end date's local
    // midnight, so a Z-suffixed clock would move the boundary per time zone.
    vi.setSystemTime(new Date("2026-09-22T12:00:00"));
    renderPreview({
      connection: {
        status: "connected",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        connectedAt: "2026-09-19T10:00:00",
        lastSyncedAt: "2026-09-19T10:01:00",
        syncWindowEnd: "2026-10-03T10:01:00",
        lastErrorCode: null,
      },
      events: [
        {
          id: "stale-all-day",
          title: "Company holiday",
          startsAt: null,
          endsAt: null,
          startDate: "2026-09-20",
          endDate: "2026-09-21",
          allDay: true,
          calendarContext: "Primary calendar",
          joinUrl: "https://meet.google.com/old-stale-one",
          cachedAt: "2026-09-19T10:01:00",
        },
        {
          id: "stale-timed",
          title: "Morning standup",
          startsAt: "2026-09-22T09:00:00",
          endsAt: "2026-09-22T09:30:00",
          startDate: null,
          endDate: null,
          allDay: false,
          calendarContext: "Primary calendar",
          joinUrl: "https://meet.google.com/aaa-bbbb-ccc",
          cachedAt: "2026-09-19T10:01:00",
        },
        {
          id: "live-all-day",
          title: "Open enrollment day",
          startsAt: null,
          endsAt: null,
          startDate: "2026-09-22",
          endDate: "2026-09-23",
          allDay: true,
          calendarContext: "Primary calendar",
          joinUrl: null,
          cachedAt: "2026-09-19T10:01:00",
        },
        {
          id: "later-timed",
          title: "Underwriting sync",
          startsAt: "2026-09-22T15:00:00",
          endsAt: "2026-09-22T16:00:00",
          startDate: null,
          endDate: null,
          allDay: false,
          calendarContext: "Primary calendar",
          joinUrl: null,
          cachedAt: "2026-09-19T10:01:00",
        },
      ],
    });

    expect(screen.queryByText("Company holiday")).not.toBeInTheDocument();
    expect(screen.queryByText("Morning standup")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Join/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open enrollment day" })).toBeInTheDocument();
    expect(screen.getByText("Happening now")).toBeInTheDocument();
    expect(screen.getByText("Underwriting sync")).toBeInTheDocument();
  });

  it("falls back to the empty state when every cached event has ended", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00"));
    renderPreview({
      connection: {
        status: "connected",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        connectedAt: "2026-09-19T10:00:00",
        lastSyncedAt: "2026-09-19T10:01:00",
        syncWindowEnd: "2026-10-03T10:01:00",
        lastErrorCode: null,
      },
      events: [
        {
          id: "stale-all-day",
          title: "Company holiday",
          startsAt: null,
          endsAt: null,
          startDate: "2026-09-20",
          endDate: "2026-09-21",
          allDay: true,
          calendarContext: "Primary calendar",
          joinUrl: "https://meet.google.com/old-stale-one",
          cachedAt: "2026-09-19T10:01:00",
        },
      ],
    });

    expect(screen.getByText("Clear for the next 14 days")).toBeInTheDocument();
    expect(screen.queryByText("Company holiday")).not.toBeInTheDocument();
  });

  it("does not render a Join button for an event without a join URL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    renderPreview({
      connection: {
        status: "connected",
        scope: "https://www.googleapis.com/auth/calendar.events.readonly",
        connectedAt: "2026-08-24T10:00:00Z",
        lastSyncedAt: "2026-08-24T10:01:00Z",
        syncWindowEnd: "2026-09-07T10:01:00Z",
        lastErrorCode: null,
      },
      events: [{
        id: "event-no-link",
        title: "Planning block",
        startsAt: "2026-08-25T11:00:00Z",
        endsAt: "2026-08-25T12:00:00Z",
        startDate: null,
        endDate: null,
        allDay: false,
        calendarContext: "Primary calendar",
        joinUrl: null,
        cachedAt: "2026-08-24T10:01:00Z",
      }],
    });

    expect(screen.getByRole("heading", { name: "Planning block" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Join Planning block/i })).not.toBeInTheDocument();
  });
});
