import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminLeadSpplyIntegration from "@/pages/admin/AdminLeadSpplyIntegration";
import PortalLeadSpply from "@/pages/PortalLeadSpply";

const manage = vi.hoisted(() => vi.fn());
const own = vi.hoisted(() => ({ status: null as unknown, loading: false, error: null as string | null, reload: vi.fn() }));
const auth = vi.hoisted(() => ({ userId: "agent-1", token: "portal-token" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: auth.token, user: { id: auth.userId } }, user: { id: auth.userId }, loading: false }) }));
vi.mock("@/lib/portal-leadspply-integration", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-leadspply-integration")>()), manageLeadSpplyIntegration: manage }));
vi.mock("@/hooks/useOwnLeadSpplyIntegration", () => ({ useOwnLeadSpplyIntegration: () => own }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/components/PortalPrimaryNav", () => ({ default: () => null }));

const target = { id: "lead-1", email: "jane@thepncl.com", first_name: "Jane", last_name: "Doe", npn: "123", parent_id: null };
const preview = { matches: [{ source: { id: "pncl-1", email: "jane@thepncl.com", personal_email: null, first_name: "Jane", last_name: "Doe", npn: "123", agent_number: 7, comp_level: 90, comp_effective_at: null, parent_id: null }, status: "suggested", reason: "Email + NPN", candidates: [{ target, reasons: ["email"] }] }], targets: [target], links: [], partners: [], token: "preview-token", revision: 2, recentRuns: [], events: [] };

afterEach(() => { vi.clearAllMocks(); own.status = null; own.error = null; own.loading = false; auth.userId = "agent-1"; auth.token = "portal-token"; });

describe("LeadSpply integration controls", () => {
  it("keeps a reviewed preview on a same-user token refresh and displays a completed sync", async () => {
    manage.mockImplementation(async (_token, body) => body.action === "preview" ? preview : { linked: 1, synced: 1, unresolved: 0 });
    const view = render(<AdminLeadSpplyIntegration />);
    await screen.findByText("Email + NPN");
    fireEvent.change(screen.getByRole("combobox", { name: /LeadSpply profile/i }), { target: { value: "lead-1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    auth.token = "refreshed-token";
    view.rerender(<AdminLeadSpplyIntegration />);
    expect(manage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Sync 1 linked reps/i }));
    expect(await screen.findByText("Linked 1 accounts. Synced 1 reps. 0 need follow-up.")).toBeInTheDocument();
    expect(manage).toHaveBeenCalledWith("refreshed-token", { action: "sync", token: "preview-token", links: [{ pncl_user_id: "pncl-1", leadspply_user_id: "lead-1" }] });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("does not expose a previous user's code or completed redemption after an account switch", async () => {
    own.status = { state: "not_linked", account: null };
    let finish: (value: unknown) => void;
    manage.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<MemoryRouter><PortalLeadSpply /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText("Paste code from LeadSpply"), { target: { value: "old-private-code" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit connection code/i }));
    auth.userId = "agent-2"; auth.token = "second-user-token";
    view.rerender(<MemoryRouter><PortalLeadSpply /></MemoryRouter>);
    expect(screen.getByPlaceholderText("Paste code from LeadSpply")).toHaveValue("");
    await act(async () => { finish({ state: "connected", pending: true, account: null }); });
    expect(screen.queryByText(/Account connected\. Your hierarchy/)).not.toBeInTheDocument();
    expect(own.reload).not.toHaveBeenCalled();
    expect(manage).toHaveBeenCalledTimes(1);
  });
  it("never auto-syncs and invalidates reviewed selection after a stale 409", async () => {
    manage.mockImplementation(async (_token: string, body: { action: string }) => {
      if (body.action === "preview") return preview;
      const error = new Error("stale") as Error & { status?: number; code?: string }; error.status = 409; error.code = "preview_stale"; throw error;
    });
    render(<AdminLeadSpplyIntegration />);
    await screen.findByText("Email + NPN");
    expect(manage).toHaveBeenCalledTimes(1);
    expect(manage.mock.calls[0][1]).toEqual({ action: "preview" });
    fireEvent.change(screen.getByRole("combobox", { name: /LeadSpply profile/i }), { target: { value: "lead-1" } });
    const checkbox = screen.getByRole("checkbox"); fireEvent.click(checkbox);
    const sync = screen.getByRole("button", { name: /Sync 1 linked reps/i }); fireEvent.click(sync);
    expect(await screen.findByRole("alert")).toHaveTextContent("preview is stale");
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect((sync as HTMLButtonElement).disabled).toBe(true);
    expect(manage.mock.calls[1][1]).toEqual({ action: "sync", token: "preview-token", links: [{ pncl_user_id: "pncl-1", leadspply_user_id: "lead-1" }] });
    fireEvent.click(checkbox);
    expect((sync as HTMLButtonElement).disabled).toBe(true);
    expect(manage).toHaveBeenCalledTimes(2);
  });

  it("preserves a non-stale sync conflict message", async () => {
    manage.mockImplementation(async (_token: string, body: { action: string }) => {
      if (body.action === "preview") return preview;
      const error = new Error("A selected account was linked by another admin.") as Error & { status?: number; code?: string }; error.status = 409; error.code = "sync_conflict"; throw error;
    });
    render(<AdminLeadSpplyIntegration />);
    await screen.findByText("Email + NPN");
    fireEvent.change(screen.getByRole("combobox", { name: /LeadSpply profile/i }), { target: { value: "lead-1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Sync 1 linked reps/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("selected account was linked by another admin");
  });

  it("lets an agent redeem only their own expiring code and reload status", async () => {
    own.status = { state: "not_linked", account: null };
    manage.mockResolvedValue({ state: "not_linked", account: null, pending: true });
    render(<MemoryRouter><PortalLeadSpply /></MemoryRouter>);
    expect(screen.queryByText(/sync .* linked reps/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Paste code from LeadSpply"), { target: { value: "expiring-code" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit connection code/i }));
    await waitFor(() => expect(manage).toHaveBeenCalledWith("portal-token", { action: "redeem", code: "expiring-code" }));
    expect(own.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/hierarchy and pay tier will be applied/i)).toBeInTheDocument();
  });
});
