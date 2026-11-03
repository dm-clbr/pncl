import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDocumentRequests, { ComposeDocument } from "./AdminDocumentRequests";
import * as api from "@/lib/document-requests";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "admin-token" } }) }));
vi.mock("@/components/admin/DocumentLibrary", () => ({ default: ({ onHistory }: { onHistory: () => void }) => <button onClick={() => onHistory()}>All rollout history</button> }));
vi.mock("@/lib/document-requests", async original => ({
  ...await original<typeof import("@/lib/document-requests")>(), listDocumentCampaigns: vi.fn(), previewDocumentRecipients: vi.fn(), publishLinkedDocumentRollout: vi.fn(),
  notifyDocumentRecipients: vi.fn(), documentRequestReport: vi.fn(), releaseDocumentCurrentAgents: vi.fn(), setDocumentOnboarding: vi.fn(),
}));
const recipients: api.DocumentRecipient[] = [
  { id: "one", name: "Alex Agent", email: "alex@example.invalid", designation: "loa", state: "UT", joined_at: "2026-01-01", ica_signed: true },
  { id: "two", name: "Bailey Agent", email: "bailey@example.invalid", designation: "loa", state: "ID", joined_at: "2026-02-01", ica_signed: false },
];
const source: api.OnboardingDocumentSource = { stepId: "step", stepSlug: "ica_setup", title: "Sign ICA", description: "Sign", flow: "loa", assetId: "new-pdf", currentAssetId: "old-pdf", filename: "new-ica.pdf", kind: "ica", url: "https://example.invalid/pdf", published: true, visible: true };
const published = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listDocumentCampaigns).mockResolvedValue([]);
  vi.mocked(api.previewDocumentRecipients).mockResolvedValue(recipients);
  vi.mocked(api.publishLinkedDocumentRollout).mockResolvedValue({ id: "published" });
  vi.mocked(api.notifyDocumentRecipients).mockResolvedValue({ sent: 1, failed: 0, remaining: 0 });
  vi.mocked(api.documentRequestReport).mockResolvedValue([]);
  vi.mocked(api.releaseDocumentCurrentAgents).mockResolvedValue({ ok: true });
  vi.mocked(api.setDocumentOnboarding).mockResolvedValue({ ok: true });
});
afterEach(cleanup);
function compose(value = source) {
  render(<MemoryRouter><ComposeDocument source={value} token="admin-token" onCancel={() => {}} onPublished={published} /></MemoryRouter>);
}
describe("linked document rollout", () => {
  it("uses the saved PDF without an upload and sends only the reviewed selection", async () => {
    compose();
    expect(screen.queryByLabelText(/PDF document/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agent type")).toBeDisabled();
    expect(screen.getByText("new-ica.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByLabelText("Select Bailey Agent"));
    expect(api.publishLinkedDocumentRollout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start rollout" }));
    await waitFor(() => expect(api.publishLinkedDocumentRollout).toHaveBeenCalledWith("admin-token", expect.objectContaining({
      stepId: "step", flow: "loa", assetId: "new-pdf", expectedAssetId: "old-pdf", recipientIds: ["one"], filters: expect.objectContaining({ designation: "loa" }), deliveryMode: "both", rolloutOrder: "current_first",
    })));
    expect(published).toHaveBeenCalledWith("published", true);
  });
  it("invalidates recipient review when filters change", async () => {
    compose(); fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    await screen.findByRole("button", { name: "Start rollout" });
    fireEvent.change(screen.getByLabelText("State of residence"), { target: { value: "UT" } });
    expect(screen.queryByRole("button", { name: "Start rollout" })).not.toBeInTheDocument();
  });
  it("keeps a stable idempotency ID on an ambiguous publication failure", async () => {
    vi.mocked(api.publishLinkedDocumentRollout).mockRejectedValueOnce(new Error("Connection interrupted"));
    compose(); fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start rollout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry publication" }));
    await waitFor(() => expect(api.publishLinkedDocumentRollout).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.publishLinkedDocumentRollout).mock.calls[0][1]).toEqual(vi.mocked(api.publishLinkedDocumentRollout).mock.calls[1][1]);
  });
  it("holds existing-agent email when onboarding is first", async () => {
    compose(); fireEvent.change(screen.getByLabelText("Rollout order"), { target: { value: "onboarding_first" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start rollout" }));
    await waitFor(() => expect(published).toHaveBeenCalledWith("published", false));
  });
  it("does not pretend to defer a PDF already selected in onboarding", async () => {
    compose({ ...source, currentAssetId: source.assetId });
    expect(screen.queryByLabelText("Rollout order")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Delivery method"), { target: { value: "portal" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 2 agents" }));
    await waitFor(() => expect(api.publishLinkedDocumentRollout).toHaveBeenCalledWith("admin-token", expect.objectContaining({ rolloutOrder: "together", deliveryMode: "portal" })));
    expect(published).toHaveBeenCalledWith("published", false);
  });
  it("starts the second stage only from the document's rollout history", async () => {
    const campaign: api.DocumentCampaign = { id: "stage-test", title: "Staged document", description: "", created_at: "2026-11-03", onboarding_enabled: false, onboarding_pending: true, onboarding_audience: "loa", delivery_mode: "both", rollout_order: "current_first", held_count: 0, current_count: 2, recipient_count: 2, signed_count: 1, email_pending_count: 0, onboarding_step_id: "step", onboarding_flow: "loa", rollout_request_id: "attempt" };
    vi.mocked(api.listDocumentCampaigns).mockResolvedValue([campaign]);
    render(<MemoryRouter><AdminDocumentRequests /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "All rollout history" }));
    fireEvent.click(await screen.findByRole("button", { name: "View rollout" }));
    expect(screen.queryByRole("button", { name: "Save onboarding settings" })).not.toBeInTheDocument();
    expect(api.setDocumentOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start future onboarding" }));
    await waitFor(() => expect(api.setDocumentOnboarding).toHaveBeenCalledWith("admin-token", "stage-test", true, "loa"));
  });
});
