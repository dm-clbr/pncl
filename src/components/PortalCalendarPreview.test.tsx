import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("PortalCalendarPreview", () => {
  it("offers an explicit read-only connection when no calendar is connected", () => {
    renderPreview({ connection: null, events: [] });
    expect(screen.getByRole("heading", { name: "Bring your schedule into the portal" })).toBeInTheDocument();
    expect(screen.getByText(/cannot create, edit, or delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(actions.onConnect).toHaveBeenCalled();
  });

  it("renders connected state, event context, refresh, and privacy disclosure", () => {
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

  it("does not render a Join button for an event without a join URL", () => {
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
