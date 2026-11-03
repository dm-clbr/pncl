vi.mock("@/components/SigningDocumentReview", () => ({ default: ({ onReviewed }: { onReviewed: (value: boolean) => void }) => <button type="button" onClick={() => onReviewed(true)}>Review all pages</button> }));
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortalDocuments from "./PortalDocuments";
import * as api from "@/lib/document-requests";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "agent-token" } }) }));
vi.mock("@/components/portal/PortalToolLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/document-requests", async original => ({ ...await original<typeof import("@/lib/document-requests")>(), listAgentDocumentRequests: vi.fn(), agentDocumentUrl: vi.fn(), signAgentDocument: vi.fn() }));
const doc: api.AgentDocumentRequest = { id: "request-1", title: "Test addendum", description: "Review these terms", assignedAt: "2026-11-03", signedAt: null, signatureName: null, documentHash: "source-hash" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listAgentDocumentRequests).mockResolvedValue([doc]);
  vi.mocked(api.agentDocumentUrl).mockResolvedValue("https://example.invalid/document.pdf");
  vi.mocked(api.signAgentDocument).mockResolvedValue({ ok: true });
});
afterEach(cleanup);
describe("agent document signing", () => {
  it("requires the document, full name, and consent; then reloads the signed copy", async () => {
    render(<MemoryRouter><PortalDocuments /></MemoryRouter>);
    const name = await screen.findByLabelText(/Full legal first and last name/);
    await screen.findByRole("link", { name: "Open full PDF" });
    expect(screen.getByRole("button", { name: "Sign document" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Review all pages" }));
    fireEvent.change(name, { target: { value: "Alex Agent" } });
    fireEvent.click(screen.getByRole("checkbox"));
    vi.mocked(api.listAgentDocumentRequests).mockResolvedValue([{ ...doc, signedAt: "2026-11-03T18:00:00Z", signatureName: "Alex Agent" }]);
    fireEvent.click(screen.getByRole("button", { name: "Sign document" }));
    await waitFor(() => expect(api.signAgentDocument).toHaveBeenCalledWith("agent-token", doc.id, "Alex Agent", true, "source-hash", {}));
    expect(await screen.findByRole("link", { name: "Open or download signed PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign document" })).not.toBeInTheDocument();
  });
  it("cannot sign when the source PDF is unavailable", async () => {
    vi.mocked(api.agentDocumentUrl).mockRejectedValue(new Error("Document unavailable"));
    render(<MemoryRouter><PortalDocuments /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Document unavailable");
    expect(screen.getByRole("button", { name: "Sign document" })).toBeDisabled();
  });
  it("does not silently substitute another document for an invalid deep link", async () => {
    render(<MemoryRouter initialEntries={["/portal/documents?request=other-agent-request"]}><PortalDocuments /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("not available for your account");
    expect(api.agentDocumentUrl).not.toHaveBeenCalled();
    expect(api.signAgentDocument).not.toHaveBeenCalled();
  });
});
