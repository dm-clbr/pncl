import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortalReferralPanel from "./PortalReferralPanel";
import { usePortalReferrals } from "@/hooks/usePortalReferrals";

vi.mock("@/hooks/usePortalReferrals", () => ({ usePortalReferrals: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const createInvite = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  createInvite.mockResolvedValue({ link: "https://thepncl.com/onboarding?ref=sample" });
  vi.mocked(usePortalReferrals).mockReturnValue({ compLevel: 100, compOptions: [95, 90], invites: [], loading: false, creating: false, error: null, reload: vi.fn(), createInvite });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show() { render(<MemoryRouter><PortalReferralPanel embedded /></MemoryRouter>); }
describe("Referral onboarding choice", () => {
  it.each(["loa", "ibo"])("creates a %s invite with the recruit nickname and compensation", async (designation) => {
    show();
    expect(screen.getByRole("combobox", { name: "Agent designation" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Agent designation" })).toHaveValue("");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Agent designation" }), { target: { value: designation } });
    fireEvent.click(screen.getByRole("button", { name: "Create & copy link" }));
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith({ compLevel: 95, recipientLabel: "Jordan", agentDesignation: designation }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Agent designation" })).toHaveValue(""));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://thepncl.com/onboarding?ref=sample");
  });
  it("blocks creation without a designation", () => {
    show();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Jordan" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create & copy link" }).closest("form")!);
    expect(createInvite).not.toHaveBeenCalled();
  });
  it("labels IBO and legacy LOA links in the shared list", () => {
    const state = vi.mocked(usePortalReferrals)();
    vi.mocked(usePortalReferrals).mockReturnValue({ ...state, invites: [
      { id: "new", recipientLabel: "IBO recruit", agentDesignation: "ibo", compLevel: 95, status: "pending", expiresAt: "2099-01-01", link: "https://example.com/new", sharedFromPartner: true },
      { id: "old", recipientLabel: "Existing recruit", compLevel: 90, status: "pending", expiresAt: "2099-01-01", link: "https://example.com/old" },
    ] as ReturnType<typeof usePortalReferrals>["invites"] });
    show();
    expect(screen.getByText(/IBO · 95% starting contract/)).toHaveTextContent("Business partner link");
    expect(screen.getByText(/LOA · 90% starting contract/)).toBeInTheDocument();
  });
  it("does not expose the referring agent's own tier", () => {
    const state = vi.mocked(usePortalReferrals)();
    vi.mocked(usePortalReferrals).mockReturnValue({ ...state, compLevel: 105 });
    show();
    expect(screen.getByText("Starting contract")).toBeInTheDocument();
    expect(screen.queryByText(/105/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/\b(comp|compensation|tier)\b/i);
  });
});
