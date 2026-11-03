import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDocumentRequests from "./AdminDocumentRequests";
import * as api from "@/lib/document-requests";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "admin-token" } }) }));
vi.mock("@/lib/document-requests", async original => ({
  ...await original<typeof import("@/lib/document-requests")>(),
  listDocumentCampaigns: vi.fn(), previewDocumentRecipients: vi.fn(), publishDocumentRequest: vi.fn(),
  readDocumentFile: vi.fn(), notifyDocumentRecipients: vi.fn(), documentRequestReport: vi.fn(), releaseDocumentCurrentAgents: vi.fn(), setDocumentOnboarding: vi.fn(),
}));
const recipients: api.DocumentRecipient[] = [
  { id: "one", name: "Alex Agent", email: "alex@example.invalid", designation: "loa", state: "UT", joined_at: "2026-01-01", ica_signed: true },
  { id: "two", name: "Bailey Agent", email: "bailey@example.invalid", designation: "ibo", state: "ID", joined_at: "2026-02-01", ica_signed: false },
];
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:sample"); URL.revokeObjectURL = vi.fn();
  vi.mocked(api.listDocumentCampaigns).mockResolvedValue([]);
  vi.mocked(api.previewDocumentRecipients).mockResolvedValue(recipients);
  vi.mocked(api.publishDocumentRequest).mockResolvedValue({ id: "published" });
  vi.mocked(api.readDocumentFile).mockResolvedValue("pdf-base64");
  vi.mocked(api.notifyDocumentRecipients).mockResolvedValue({ sent: 1, failed: 0, remaining: 0 });
  vi.mocked(api.documentRequestReport).mockResolvedValue([]);
  vi.mocked(api.releaseDocumentCurrentAgents).mockResolvedValue({ ok: true });
  vi.mocked(api.setDocumentOnboarding).mockResolvedValue({ ok: true });
});
afterEach(cleanup);
async function compose() {
  render(<MemoryRouter initialEntries={["/portal/admin/onboarding-steps/documents"]}><AdminDocumentRequests /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "New document request" }));
  fireEvent.change(screen.getByLabelText("Document title"), { target: { value: "Own your book addendum" } });
  fireEvent.change(screen.getByLabelText(/PDF document/), { target: { files: [new File(["%PDF-"], "addendum.pdf", { type: "application/pdf" })] } });
}
describe("admin document workflow", () => {
  it("sends exactly the reviewed selection and keeps future onboarding independent", async () => {
    await compose();
    fireEvent.change(screen.getByLabelText("Agent type"), { target: { value: "loa" } });
    fireEvent.click(screen.getByLabelText("Require this document for future new agents"));
    fireEvent.change(screen.getByLabelText("Add to onboarding for"), { target: { value: "ibo" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByLabelText("Select Bailey Agent"));
    expect(api.publishDocumentRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start rollout" }));
    await waitFor(() => expect(api.publishDocumentRequest).toHaveBeenCalledWith("admin-token", expect.objectContaining({
      recipientIds: ["one"], filters: expect.objectContaining({ designation: "loa" }), onboardingEnabled: true, onboardingAudience: "ibo", deliveryMode: "both", rolloutOrder: "current_first",
    })));
    await screen.findByText(/Requests are published/);
  });
  it("invalidates the recipient review when filters change", async () => {
    await compose(); fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    await screen.findByRole("button", { name: "Send to 2 agents" });
    fireEvent.change(screen.getByLabelText("Agent type"), { target: { value: "ibo" } });
    expect(screen.queryByRole("button", { name: "Send to 2 agents" })).not.toBeInTheDocument();
    expect(api.publishDocumentRequest).not.toHaveBeenCalled();
  });
  it("supports future-only documents without querying or notifying existing agents", async () => {
    await compose();
    fireEvent.click(screen.getByLabelText("Send to existing agents"));
    fireEvent.click(screen.getByLabelText("Require this document for future new agents"));
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish for future onboarding" }));
    await waitFor(() => expect(api.publishDocumentRequest).toHaveBeenCalledWith("admin-token", expect.objectContaining({ recipientIds: [], onboardingEnabled: true, deliveryMode: "both", rolloutOrder: "together" })));
    expect(api.previewDocumentRecipients).not.toHaveBeenCalled();
    expect(api.notifyDocumentRecipients).not.toHaveBeenCalled();
  });
  it("retains the same request ID on an ambiguous publish failure", async () => {
    vi.mocked(api.publishDocumentRequest).mockRejectedValueOnce(new Error("Connection interrupted"));
    await compose(); fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 2 agents" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry publication" }));
    await waitFor(() => expect(api.publishDocumentRequest).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.publishDocumentRequest).mock.calls[0][1]).toEqual(vi.mocked(api.publishDocumentRequest).mock.calls[1][1]);
  });
  it("keeps email failures visible without retrying publication", async () => {
    vi.mocked(api.notifyDocumentRecipients).mockRejectedValue(new Error("Provider unavailable"));
    await compose(); fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 2 agents" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email delivery needs attention");
    expect(api.publishDocumentRequest).toHaveBeenCalledTimes(1);
  });
  it("holds current-agent delivery when onboarding is first", async () => {
    await compose();
    fireEvent.click(screen.getByLabelText("Require this document for future new agents"));
    fireEvent.change(screen.getByLabelText("Rollout order"), { target: { value: "onboarding_first" } });
    fireEvent.change(screen.getByLabelText("Delivery method"), { target: { value: "email" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start rollout" }));
    await waitFor(() => expect(api.publishDocumentRequest).toHaveBeenCalledWith("admin-token", expect.objectContaining({ deliveryMode: "email", rolloutOrder: "onboarding_first" })));
    expect(api.notifyDocumentRecipients).not.toHaveBeenCalled();
  });
  it("supports portal-only delivery without sending emails", async () => {
    await compose();
    fireEvent.change(screen.getByLabelText("Delivery method"), { target: { value: "portal" } });
    fireEvent.click(screen.getByRole("button", { name: "Review request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 2 agents" }));
    await waitFor(() => expect(api.publishDocumentRequest).toHaveBeenCalledWith("admin-token", expect.objectContaining({ deliveryMode: "portal" })));
    expect(api.notifyDocumentRecipients).not.toHaveBeenCalled();
  });
  it("starts the held current-agent stage only after the admin chooses it", async () => {
    const campaign: api.DocumentCampaign = { id: "stage-test", title: "Staged document", description: "", created_at: "2026-11-03", onboarding_enabled: true, onboarding_pending: false, onboarding_audience: "ibo", delivery_mode: "portal", rollout_order: "onboarding_first", held_count: 2, current_count: 2, recipient_count: 0, signed_count: 0, email_pending_count: 0 };
    vi.mocked(api.listDocumentCampaigns).mockResolvedValue([campaign]);
    render(<MemoryRouter><AdminDocumentRequests /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "View request" }));
    expect(api.releaseDocumentCurrentAgents).not.toHaveBeenCalled();
    vi.mocked(api.listDocumentCampaigns).mockResolvedValue([{ ...campaign, held_count: 0, recipient_count: 2 }]);
    fireEvent.click(screen.getByRole("button", { name: "Start current-agent rollout" }));
    await waitFor(() => expect(api.releaseDocumentCurrentAgents).toHaveBeenCalledWith("admin-token", "stage-test"));
    await screen.findByText("2 agents · released");
    expect(api.notifyDocumentRecipients).not.toHaveBeenCalled();
  });
  it("activates deferred future onboarding with the saved audience", async () => {
    const campaign: api.DocumentCampaign = { id: "stage-test", title: "Staged document", description: "", created_at: "2026-11-03", onboarding_enabled: false, onboarding_pending: true, onboarding_audience: "ibo", delivery_mode: "both", rollout_order: "current_first", held_count: 0, current_count: 2, recipient_count: 2, signed_count: 1, email_pending_count: 0 };
    vi.mocked(api.listDocumentCampaigns).mockResolvedValue([campaign]);
    render(<MemoryRouter><AdminDocumentRequests /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "View request" }));
    expect(api.setDocumentOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start future onboarding" }));
    await waitFor(() => expect(api.setDocumentOnboarding).toHaveBeenCalledWith("admin-token", "stage-test", true, "ibo"));
  });

});
