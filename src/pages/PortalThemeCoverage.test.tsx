import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalBrandAssets from "@/pages/PortalBrandAssets";
import PortalCompAgreement from "@/pages/PortalCompAgreement";
import ProtectedRoute from "@/components/ProtectedRoute";
import { fetchPortalCompAttachments, signPortalCompAttachment, type PortalCompAttachment } from "@/lib/portal-comp-attachments";

const state = vi.hoisted(() => ({
  loading: false,
  assets: { assets: [] as Array<{ id: string; title: string; assetType: string; contentType: string; hexColor: string }>, loading: false, error: null as string | null },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "fixture@thepncl.com", user_metadata: { full_name: "Test Agent" } }, session: { access_token: "fixture" }, loading: state.loading }),
  isEmailConfirmed: () => true,
}));
vi.mock("@/hooks/usePortalProfile", () => ({ usePortalProfile: () => ({ displayName: "Test Agent", initials: "TA", photoUrl: null }) }));
vi.mock("@/hooks/usePortalBrandAssets", () => ({ usePortalBrandAssets: () => state.assets }));
vi.mock("@/lib/portal-comp-attachments", () => ({ fetchPortalCompAttachments: vi.fn(), signPortalCompAttachment: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

const attachment: PortalCompAttachment = {
  id: "test-attachment", userId: "test-agent", title: "Test attachment", status: "pending",
  assignedAt: "2026-10-14T12:00:00Z", signatureName: null, signedAt: null, documentUrl: null,
};
const mount = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("remaining portal theme coverage", () => {
  beforeEach(() => {
    state.loading = false;
    state.assets = { assets: [], loading: false, error: null };
    vi.mocked(fetchPortalCompAttachments).mockReset().mockResolvedValue([]);
    vi.mocked(signPortalCompAttachment).mockReset();
  });
  it("keeps the shared masthead, one page heading and mobile navigation on brand assets", () => {
    mount(<PortalBrandAssets />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Test Agent, view profile" })).toHaveAttribute("href", "/portal/profile");
    expect(screen.getByRole("navigation", { name: "Portal sections" })).toBeInTheDocument();
    expect(screen.getByText("No brand assets published yet")).toBeInTheDocument();
  });
  it("announces asset loading and errors inside the portal surface", () => {
    state.assets.loading = true;
    const view = mount(<PortalBrandAssets />);
    expect(screen.getByRole("status", { name: "Loading brand assets" })).toHaveAttribute("aria-busy", "true");
    state.assets = { assets: [], loading: false, error: "Could not load assets" };
    view.rerender(<MemoryRouter><PortalBrandAssets /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load assets");
  });
  it("keeps compensation empty state and the document-tab return path", async () => {
    mount(<PortalCompAgreement />);
    expect(await screen.findByText("No comp attachment yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to profile" })).toHaveAttribute("href", "/portal/profile?tab=documents");
    expect(screen.getByRole("navigation", { name: "Portal sections" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
  it("retains compensation consent validation before making a signing request", async () => {
    vi.mocked(fetchPortalCompAttachments).mockResolvedValue([attachment]);
    mount(<PortalCompAgreement />);
    const button = await screen.findByRole("button", { name: "Sign comp attachment" });
    fireEvent.click(button);
    expect(signPortalCompAttachment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    vi.mocked(signPortalCompAttachment).mockResolvedValue({ attachment: { ...attachment, status: "signed", signatureName: "Test Agent" }, message: "Saved" });
    fireEvent.click(button);
    await waitFor(() => expect(signPortalCompAttachment).toHaveBeenCalledWith("fixture", {
      attachmentId: "test-attachment", signatureName: "Test Agent", agreementAccepted: true,
    }));
    expect(await screen.findByRole("heading", { name: "Comp attachment on file" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
  it("announces compensation failures without rendering a signing form", async () => {
    vi.mocked(fetchPortalCompAttachments).mockRejectedValue(new Error("Unavailable"));
    mount(<PortalCompAgreement />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unavailable");
    expect(screen.queryByRole("button", { name: "Sign comp attachment" })).not.toBeInTheDocument();
  });
  it("uses portal loading chrome while authentication resolves", () => {
    state.loading = true;
    mount(<ProtectedRoute><div>Protected content</div></ProtectedRoute>);
    expect(screen.getByRole("status", { name: "Loading portal" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});
