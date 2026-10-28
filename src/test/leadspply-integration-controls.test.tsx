import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminLeadSpplyIntegration from "@/pages/admin/AdminLeadSpplyIntegration";

const manage = vi.hoisted(() => vi.fn());
const own = vi.hoisted(() => ({ status: null as unknown, loading: false, error: null as string | null, reload: vi.fn() }));
const auth = vi.hoisted(() => ({ userId: "agent-1", token: "portal-token", email: "agent@thepncl.com", confirmed: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: auth.token, user: { id: auth.userId } }, user: { id: auth.userId, email: auth.email, email_confirmed_at: auth.confirmed ? "2026-10-26" : null }, loading: false }) }));
vi.mock("@/lib/portal-leadspply-integration", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/portal-leadspply-integration")>()), manageLeadSpplyIntegration: manage }));
vi.mock("@/hooks/useOwnLeadSpplyIntegration", () => ({ useOwnLeadSpplyIntegration: () => own }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/components/PortalPrimaryNav", () => ({ default: () => null }));

const target = { id: "lead-1", email: "jane@thepncl.com", first_name: "Jane", last_name: "Doe", npn: "123", parent_id: null };
const preview = { matches: [{ source: { id: "pncl-1", email: "jane@thepncl.com", personal_email: null, first_name: "Jane", last_name: "Doe", npn: "123", agent_number: 7, comp_level: 90, comp_effective_at: null, parent_id: null }, status: "suggested", reason: "Email + NPN", candidates: [{ target, reasons: ["email"] }] }], targets: [target], links: [], partners: [], token: "preview-token", revision: 2, recentRuns: [], events: [], autoLink: { enabled: false, cadenceMinutes: 15, lastRun: { created_at: "2026-10-15T12:00:00Z", status: "failed", scanned_count: 3, linked_count: 1, review_count: 1, error_code: "target_unavailable" } } };

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); own.status = null; own.error = null; own.loading = false; auth.userId = "agent-1"; auth.token = "portal-token"; auth.email = "agent@thepncl.com"; auth.confirmed = true; });

describe("LeadSpply integration controls", () => {
  it("shows read-only automatic connection monitoring without triggering a sync", async () => {
    manage.mockResolvedValue(preview);
    render(<AdminLeadSpplyIntegration />);
    expect(await screen.findByText("Automatic account connection")).toBeInTheDocument();
    expect(screen.getByText(/Disabled .* every 15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Last failed sweep:.*3 scanned, 1 linked, 1 for review/i)).toBeInTheDocument();
    expect(manage).toHaveBeenCalledTimes(1);
    expect(manage.mock.calls[0][1]).toEqual({ action: "preview" });
  });

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

});
