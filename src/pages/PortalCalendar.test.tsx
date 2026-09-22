import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalCalendar from "@/pages/PortalCalendar";
import type { PortalGoogleCalendarData } from "@/lib/portal-google-calendar";

const CONNECTED = {
  status: "connected" as const,
  scope: "https://www.googleapis.com/auth/calendar.events.readonly",
  connectedAt: "2026-08-24T10:00:00Z",
  lastSyncedAt: "2026-08-24T10:01:00Z",
  syncWindowEnd: "2026-09-07T10:01:00Z",
  lastErrorCode: null,
};

function event(id: string, title: string, startsAt: string) {
  return {
    id,
    title,
    startsAt,
    endsAt: null,
    startDate: null,
    endDate: null,
    allDay: false,
    calendarContext: "Primary calendar",
    joinUrl: null,
    cachedAt: "2026-08-24T10:01:00Z",
  };
}

const calendar = {
  data: { connection: null, events: [] } as PortalGoogleCalendarData,
  loading: false,
  error: null as string | null,
  connecting: false,
  syncing: false,
  disconnecting: false,
  connect: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
  reload: vi.fn(),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "agent-1", email: "agent@thepncl.com" } }),
}));

vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({ photoUrl: null, initials: "TA", displayName: "Test Agent", loading: false }),
}));

vi.mock("@/hooks/usePortalGoogleCalendar", () => ({
  usePortalGoogleCalendar: () => calendar,
}));

vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <PortalCalendar />
    </MemoryRouter>,
  );
}

describe("PortalCalendar", () => {
  beforeEach(() => {
    calendar.data = { connection: null, events: [] };
    calendar.loading = false;
    calendar.error = null;
  });

  it("keeps the loading state as a skeleton of the list", () => {
    calendar.loading = true;
    renderPage();
    expect(screen.getByRole("status", { name: "Loading your calendar" })).toBeInTheDocument();
  });

  it("keeps the error copy and the retry action", () => {
    calendar.error = "Google Calendar request failed";
    renderPage();
    expect(screen.getByRole("heading", { name: "Calendar preview is unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Google Calendar request failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers the connection when no calendar is linked", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Bring your schedule into the portal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument();
  });

  it("puts the clear-window copy in the hero, not buried under the list", () => {
    calendar.data = { connection: CONNECTED, events: [] };
    renderPage();
    expect(screen.getByText("Clear for the next 14 days")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coming up" })).not.toBeInTheDocument();
  });

  it("puts the next event in the hero and groups the rest by day", () => {
    calendar.data = {
      connection: CONNECTED,
      events: [
        event("e2", "Carrier training", "2026-09-26T16:00:00Z"),
        event("e1", "Client call", "2026-09-25T15:00:00Z"),
      ],
    };
    renderPage();
    expect(screen.getByRole("heading", { name: "Client call" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeInTheDocument();
    expect(screen.getByText("Carrier training")).toBeInTheDocument();
    expect(screen.getByText("Connected · read only")).toBeInTheDocument();
  });
});
