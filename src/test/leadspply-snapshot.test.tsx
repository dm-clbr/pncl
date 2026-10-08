import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PortalLeadSpplySnapshot, { formatLeadSpplySyncStatus } from "@/components/PortalLeadSpplySnapshot";
import { usePortalLeadSpplySnapshot } from "@/hooks/usePortalLeadSpplySnapshot";
import { parseLeadSpplySnapshot, type LeadSpplySnapshot } from "@/lib/portal-leadspply-snapshot";

const auth = vi.hoisted(() => ({ token: "portal-token", loading: false, userId: "agent-1" }));
const fetchSnapshot = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ session: auth.token ? { access_token: auth.token, user: { id: auth.userId } } : null, loading: auth.loading }),
}));
vi.mock("@/lib/portal-leadspply-snapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-leadspply-snapshot")>();
  return { ...actual, fetchLeadSpplySnapshot: fetchSnapshot };
});

const connected: LeadSpplySnapshot = {
  version: 1, state: "connected", asOf: "2026-10-08T19:00:00.000Z",
  account: { name: "Avery Agent", syncStatus: "manual sync complete", lastSyncedAt: "2026-10-08T18:00:00.000Z" },
  period: { timezone: "America/Los_Angeles", monthStart: "2026-10-01", weekStart: "2026-10-05", today: "2026-10-08" },
  leads: { toWork: 4, new: 2, inProgress: 3, callbacksToday: 1 },
  appointments: { upcoming: 2, nextAt: null },
  production: { paidPoliciesMtd: 3, annualPremiumCentsMtd: 125050 },
  activity: { today: { calls: 8, appointments: 1, presentations: 2, policies: 1, points: 14 }, week: { calls: 32, appointments: 4, presentations: 6, policies: 3, points: 55 } },
  contact: { ratePct: null, speedMinutes: null },
};

afterEach(() => {
  vi.clearAllMocks();
  auth.token = "portal-token";
  auth.loading = false;
  auth.userId = "agent-1";
});

describe("LeadSpply snapshot DTO", () => {
  it("allows only the published snapshot fields and rejects bad counts", () => {
    const parsed = parseLeadSpplySnapshot({ ...connected, customer: { phone: "private" } });
    expect(parsed).toEqual(connected);
    expect(parsed).not.toHaveProperty("customer");
    expect(() => parseLeadSpplySnapshot({ ...connected, leads: { ...connected.leads!, new: -1 } })).toThrow("invalid snapshot");
  });

  it("does not accept a connected response missing its required data", () => {
    expect(() => parseLeadSpplySnapshot({ version: 1, state: "connected", asOf: connected.asOf })).toThrow("invalid snapshot");
    expect(() => parseLeadSpplySnapshot({ ...connected, contact: undefined })).toThrow("invalid snapshot");
  });
});

describe("LeadSpply snapshot panel", () => {
  it("shows explicit unlinked and error states without placeholder metrics", async () => {
    fetchSnapshot.mockResolvedValueOnce({ version: 1, state: "not_linked", asOf: connected.asOf });
    const { rerender } = render(<PortalLeadSpplySnapshot userId="agent-1" />);
    expect(await screen.findByText(/not linked to a LeadSpply account/i)).toBeInTheDocument();
    expect(screen.queryByText("To work")).not.toBeInTheDocument();

    auth.userId = "agent-2";
    fetchSnapshot.mockRejectedValueOnce(new Error("LeadSpply data is unavailable."));
    rerender(<PortalLeadSpplySnapshot userId="agent-2" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("LeadSpply data is unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps a late prior-user response from replacing the current user snapshot", async () => {
    let resolveFirst: (value: LeadSpplySnapshot) => void = () => undefined;
    let resolveSecond: (value: LeadSpplySnapshot) => void = () => undefined;
    fetchSnapshot
      .mockImplementationOnce(() => new Promise<LeadSpplySnapshot>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<LeadSpplySnapshot>((resolve) => { resolveSecond = resolve; }));

    const { result, rerender, unmount } = renderHook(({ userId }) => usePortalLeadSpplySnapshot(userId), { initialProps: { userId: "agent-1" } });
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(1));
    auth.userId = "agent-2";
    rerender({ userId: "agent-2" });
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2));
    resolveSecond({ ...connected, account: { ...connected.account!, name: "Second agent" } });
    await waitFor(() => expect(result.current.snapshot?.account?.name).toBe("Second agent"));
    resolveFirst({ ...connected, account: { ...connected.account!, name: "First agent" } });
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(result.current.snapshot?.account?.name).toBe("Second agent");
    unmount();
  });

  it("immediately masks a prior snapshot when the session and requested user differ", async () => {
    fetchSnapshot.mockResolvedValueOnce(connected);
    const { result, rerender } = renderHook(({ userId }) => usePortalLeadSpplySnapshot(userId), { initialProps: { userId: "agent-1" } });
    await waitFor(() => expect(result.current.snapshot?.account?.name).toBe("Avery Agent"));

    auth.userId = "agent-2";
    rerender({ userId: "agent-1" });
    expect(result.current.snapshot).toBeNull();
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not automatically refetch when the same user receives a refreshed access token", async () => {
    fetchSnapshot.mockResolvedValueOnce(connected);
    const { result, rerender } = renderHook(({ userId }) => usePortalLeadSpplySnapshot(userId), { initialProps: { userId: "agent-1" } });
    await waitFor(() => expect(result.current.snapshot).toEqual(connected));

    auth.token = "refreshed-token";
    rerender({ userId: "agent-1" });
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses product-facing sync text and preserves premium cents", async () => {
    fetchSnapshot.mockResolvedValueOnce({
      ...connected,
      account: { ...connected.account!, syncStatus: "upline_unlinked" },
    });
    render(<PortalLeadSpplySnapshot userId="agent-1" />);
    expect(await screen.findByText("Linked · upline needs review")).toBeInTheDocument();
    expect(screen.getByText("$1,250.50 annual premium")).toBeInTheDocument();
  });

  it("maps all account sync codes to product text", () => {
    expect(formatLeadSpplySyncStatus("synced")).toBe("Linked");
    expect(formatLeadSpplySyncStatus("upline_unlinked")).toBe("Linked · upline needs review");
    expect(formatLeadSpplySyncStatus("pending")).toBe("Account sync pending");
  });

  it("explains unavailable accounts without suggesting an automatic retry", async () => {
    fetchSnapshot.mockResolvedValueOnce({ version: 1, state: "account_unavailable", asOf: connected.asOf });
    render(<PortalLeadSpplySnapshot userId="agent-1" />);
    expect(await screen.findByText(/contact PNCL support to review the connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/try refreshing/i)).not.toBeInTheDocument();
  });

  it("uses no background timer; Refresh data is the only refresh control", () => {
    const hookSource = String(usePortalLeadSpplySnapshot);
    expect(hookSource).not.toMatch(/setInterval|setTimeout/);
  });
});
