import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminSigningPreview from "./AdminSigningPreview";
import AdminRoute from "@/components/AdminRoute";
import { submitPortalDirectDeposit, getDirectDepositPdfUrl } from "@/lib/portal-direct-deposit";
import { fetchPortalCompAttachments, signPortalCompAttachment } from "@/lib/portal-comp-attachments";
import { fetchPortalProfile } from "@/lib/portal-profile";
import { refreshPortalUser } from "@/lib/portal-messages";

const state = vi.hoisted(() => ({
  role: "admin", designation: "loa", error: null as string | null, missing: false,
  content: vi.fn(), retry: vi.fn(), records: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  loading: false, session: { access_token: "admin-token" },
  user: { id: "admin-with-signed-documents", app_metadata: { role: state.role }, user_metadata: { full_name: "Real Admin", role: "admin", direct_deposit_signed: true } },
}) }));
vi.mock("@/hooks/useOnboardingContent", () => ({ useOnboardingContent: (context: { previewDesignation: string }) => {
  state.content(context);
  const asset = { id: context.previewDesignation, url: "/test.pdf", signing_mode: "signature_record" };
  return { content: state.missing ? {} : { ica: asset, w9: asset, compAgreement: asset }, error: state.error, retry: state.retry };
} }));
vi.mock("@/hooks/usePortalDirectDeposit", () => ({ usePortalDirectDeposit: state.records }));
vi.mock("@/components/UploadedIcaSigningStep", () => ({ default: ({ onSubmit, asset }: { onSubmit: () => void; asset: { id: string } }) => <button onClick={() => onSubmit()}>Test ICA {asset.id}</button> }));
vi.mock("@/components/W9SigningStep", () => ({ default: ({ onSubmit }: { onSubmit: () => void }) => <button onClick={() => onSubmit()}>Test W-9 form</button> }));
vi.mock("@/components/SigningDocumentReview", () => ({ default: ({ onReviewed }: { onReviewed: (value: boolean) => void }) => <button onClick={() => onReviewed(true)}>Review PDF</button> }));
vi.mock("@/lib/portal-direct-deposit", async original => ({
  ...await original<typeof import("@/lib/portal-direct-deposit")>(), submitPortalDirectDeposit: vi.fn(), getDirectDepositPdfUrl: vi.fn(),
}));
vi.mock("@/lib/portal-comp-attachments", () => ({ fetchPortalCompAttachments: vi.fn(), signPortalCompAttachment: vi.fn() }));
vi.mock("@/lib/portal-profile", () => ({ fetchPortalProfile: vi.fn() }));
vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: vi.fn() }));
vi.mock("@/components/portal/PortalBackground", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function show(kind = "direct-deposit", query = "") {
  return render(<MemoryRouter initialEntries={[`/portal/admin/signing-preview/${kind}${query}`]}><Routes>
    <Route path="/portal/admin/signing-preview/:kind" element={<AdminRoute><AdminSigningPreview /></AdminRoute>} />
    <Route path="/portal" element={<p>Agent portal</p>} />
    <Route path="/portal/admin/hierarchy" element={<p>Assistant portal</p>} />
    <Route path="/portal/admin/onboarding-steps" element={<p>Onboarding steps</p>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => { vi.clearAllMocks(); state.role = "admin"; state.error = null; state.missing = false; });
describe("new-agent signing preview", () => {
  it("opens a blank coded form without fetching the admin's completed record, profile, or signed PDF", () => {
    show();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/account number/)).toHaveValue("");
    expect(screen.queryByText("Direct deposit on file")).not.toBeInTheDocument();
    expect(state.records).not.toHaveBeenCalled();
    expect(fetchPortalProfile).not.toHaveBeenCalled();
    expect(getDirectDepositPdfUrl).not.toHaveBeenCalled();
    expect(state.content).not.toHaveBeenCalled();
  });
  it("validates the real coded form, simulates submission locally, and restarts blank", async () => {
    show();
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
    for (const [id, value] of Object.entries({ "dd-name": "Preview Agent", "dd-address": "123 Test St", "dd-city": "Provo", "dd-state": "UT", "dd-zip": "84601", "dd-bank": "Test Bank", "dd-account": "123456789", "dd-routing": "021000021", "dd-signature": "Preview Agent" })) {
      fireEvent.change(document.getElementById(id)!, { target: { value } });
    }
    fireEvent.click(screen.getByLabelText("I authorize direct deposit as described above."));
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText("Preview complete")).toBeInTheDocument());
    expect(submitPortalDirectDeposit).not.toHaveBeenCalled();
    expect(refreshPortalUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restart preview" }));
    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/account number/)).toHaveValue("");
  });
  it.each(["agent", "admin_assist"])("blocks %s from the admin preview, ignoring a user-editable admin role", role => {
    state.role = role; show();
    expect(screen.queryByText("Preview as a new agent")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
  it("uses the selected flow's ICA and resets completion when switching flows", async () => {
    show("ica", "?flow=ibo");
    expect(state.content).toHaveBeenCalledWith({ accessToken: "admin-token", previewDesignation: "ibo" });
    fireEvent.click(screen.getByRole("button", { name: "Test ICA ibo" }));
    await screen.findByText("Preview complete");
    fireEvent.change(screen.getByLabelText("Preview flow"), { target: { value: "loa" } });
    expect(screen.getByRole("button", { name: "Test ICA loa" })).toBeInTheDocument();
  });
  it("uses an empty W-9 test form with a local completion callback", async () => {
    show("w9");
    fireEvent.click(screen.getByRole("button", { name: "Test W-9 form" }));
    expect(await screen.findByText("Preview complete")).toBeInTheDocument();
  });
  it("tests compensation without loading or signing any real assignment", async () => {
    show("compensation");
    fireEvent.click(screen.getByRole("button", { name: "Review PDF" }));
    fireEvent.change(screen.getByLabelText(/Type your legal name to sign/), { target: { value: "Preview Agent" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Test submit (preview)" }));
    expect(await screen.findByText("Preview complete")).toBeInTheDocument();
    expect(fetchPortalCompAttachments).not.toHaveBeenCalled();
    expect(signPortalCompAttachment).not.toHaveBeenCalled();
  });
  it("reports missing configured documents without falling back to another flow", () => {
    state.missing = true; show("ica", "?flow=ibo");
    expect(screen.getByRole("alert")).toHaveTextContent("for the IBO flow");
  });
  it("offers retry when configured content cannot load", () => {
    state.error = "Content unavailable"; show("ica");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.retry).toHaveBeenCalled();
  });
});
