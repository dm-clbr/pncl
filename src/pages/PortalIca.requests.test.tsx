import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalIca from "./PortalIca";
import LegacyPortalIca from "./PortalIca.legacy";
import * as documents from "@/lib/document-requests";
import { submitPortalIca } from "@/lib/portal-ica";

const state = vi.hoisted(() => ({
  user: { id: "agent-1", email: "agent@example.com", user_metadata: { full_name: "Test Agent" }, app_metadata: { role: "agent" } },
  submitted: true,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, session: { access_token: "agent-token" } }) }));
vi.mock("@/hooks/useOnboardingContent", () => ({ useOnboardingContent: () => ({ content: { signingEnabled: true, designation: "loa", ica: { id: "new-asset", url: "/new-ica.pdf" } } }) }));
vi.mock("@/hooks/usePortalIca", () => ({ usePortalIca: () => ({ submitted: state.submitted, loading: false, setIca: vi.fn(), ica: state.submitted ? { legalName: "Test Agent", signedAt: "2026-07-07T12:00:00Z", icaVersion: "legacy" } : null }) }));
vi.mock("@/lib/portal-profile", () => ({ fetchPortalProfile: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/portal-ica", () => ({ fetchPortalIcaDocument: vi.fn().mockResolvedValue({ downloadUrl: "https://files.example/old-signed-ica.pdf" }), getDefaultIcaPrefill: () => ({ legalName: "Test Agent", email: "agent@example.com" }), submitPortalIca: vi.fn() }));
vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/lib/document-requests", async original => ({ ...await original<typeof import("@/lib/document-requests")>(), listAgentDocumentRequests: vi.fn(), agentDocumentUrl: vi.fn(), signAgentDocument: vi.fn() }));
vi.mock("@/components/UploadedIcaSigningStep", () => ({ default: () => <p>First-time ICA form</p> }));
vi.mock("@/components/UploadedIcaSigningStep.legacy", () => ({ default: () => <p>First-time ICA form</p> }));
vi.mock("@/components/portal/PortalBackground", () => ({ default: () => null }));
vi.mock("@/components/SigningDocumentReview", () => ({ default: ({ url, onReviewed }: { url: string; onReviewed: (value: boolean) => void }) => <button data-source={url} onClick={() => onReviewed(true)}>Review assigned ICA</button> }));
vi.mock("@/components/SignatureAdoptionDialog", () => ({ default: ({ name, onAdopt }: { name: string; onAdopt: (value: unknown) => void }) => <button onClick={() => onAdopt({ name, method: "typed", accepted: true, version: "2026-11-13", imageDataUrl: "data:image/png;base64,test" })}>Adopt test signature</button> }));
const assigned: documents.AgentDocumentRequest = { id: "ica-request", title: "LOA ICA", description: "", assignedAt: "2026-11-13", signedAt: null, signatureName: null, documentHash: "assigned-source-hash", stepSlug: "ica_setup", templateAssetId: "new-asset" };

beforeEach(() => {
  vi.clearAllMocks();
  state.user.app_metadata.role = "agent";
  state.submitted = true;
  vi.mocked(documents.listAgentDocumentRequests).mockResolvedValue([assigned]);
  vi.mocked(documents.agentDocumentUrl).mockResolvedValue("https://files.example/assigned-ica.pdf");
  vi.mocked(documents.signAgentDocument).mockResolvedValue({ ok: true });
});

for (const [variant, Page] of [["uploaded flow", PortalIca], ["compatibility flow", LegacyPortalIca]] as const) {
  describe(`ICA requests in ${variant}`, () => {
    async function openPage() { await act(async () => { render(<MemoryRouter><Page /></MemoryRouter>); }); }
    it("keeps the old signed PDF and automatically opens the exact assigned edition", async () => {
      await openPage();
      expect(screen.getByRole("heading", { name: "Previous agreement on file" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Download signed PDF/ })).toHaveAttribute("href", "https://files.example/old-signed-ica.pdf");
      expect(screen.getByTitle("Previous signed ICA").closest("details")).not.toHaveAttribute("open");
      expect(screen.getByRole("heading", { name: "New ICA — review and sign" })).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Review assigned ICA" })).toHaveAttribute("data-source", "https://files.example/assigned-ica.pdf");
      expect(documents.agentDocumentUrl).toHaveBeenCalledWith("agent-token", assigned.id);
      expect(screen.queryByText("First-time ICA form")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sign document" })).toBeDisabled();
    });
    it("signs the request with explicit adoption and consent, preserving the previous PDF", async () => {
      await openPage();
      fireEvent.click(await screen.findByRole("button", { name: "Review assigned ICA" }));
      expect(screen.getByLabelText(/Full legal first and last name/)).toHaveValue("Test Agent");
      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("button", { name: "Sign document" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Create signature" }));
      fireEvent.click(screen.getByRole("button", { name: "Adopt test signature" }));
      vi.mocked(documents.listAgentDocumentRequests).mockResolvedValue([{ ...assigned, signedAt: "2026-11-13T18:00:00Z", signatureName: "Test Agent" }]);
      fireEvent.click(screen.getByRole("button", { name: "Sign document" }));
      await waitFor(() => expect(documents.signAgentDocument).toHaveBeenCalledWith("agent-token", "ica-request", "Test Agent", true, "assigned-source-hash", {}, expect.objectContaining({ name: "Test Agent", accepted: true })));
      expect(await screen.findByRole("heading", { name: "Signed ICA editions" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Download signed PDF/ })).toHaveAttribute("href", "https://files.example/old-signed-ica.pdf");
      expect(submitPortalIca).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Sign document" })).not.toBeInTheDocument();
    });
    it("uses the onboarding step to identify ICAs, regardless of document title", async () => {
      vi.mocked(documents.listAgentDocumentRequests).mockResolvedValue([{ ...assigned, title: "ICA notes for W-9", stepSlug: "w9_setup" }]);
      await openPage();
      expect(screen.queryByRole("heading", { name: "New ICA — review and sign" })).not.toBeInTheDocument();
      expect(documents.agentDocumentUrl).not.toHaveBeenCalled();
    });
    it("retries failed request lookup without offering a replacement native signature", async () => {
      state.submitted = false;
      vi.mocked(documents.listAgentDocumentRequests).mockRejectedValueOnce(new Error("Unable to load assigned ICA"));
      await openPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to load assigned ICA");
      expect(screen.queryByText("First-time ICA form")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry new agreement" }));
      expect(await screen.findByRole("button", { name: "Review assigned ICA" })).toBeInTheDocument();
    });
    it("shows the current uploaded PDF as an admin preview when no request is assigned", async () => {
      state.user.app_metadata.role = "admin";
      vi.mocked(documents.listAgentDocumentRequests).mockResolvedValue([]);
      await openPage();
      expect(screen.getByTitle("New ICA preview")).toHaveAttribute("src", "/new-ica.pdf");
      expect(screen.queryByRole("button", { name: "Sign document" })).not.toBeInTheDocument();
      expect(documents.signAgentDocument).not.toHaveBeenCalled();
    });
    it("retains first-time signing when no existing or assigned ICA is present", async () => {
      state.submitted = false;
      vi.mocked(documents.listAgentDocumentRequests).mockResolvedValue([]);
      await openPage();
      expect(screen.getByText("First-time ICA form")).toBeInTheDocument();
    });
  });
}
