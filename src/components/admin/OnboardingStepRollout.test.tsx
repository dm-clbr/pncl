import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingStepModal from "./OnboardingStepModal";
import { blankEditorRow, saveEditorStep, stageEditorFile } from "@/lib/onboarding-editor";
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async original => ({ ...await original<typeof import("react-router-dom")>(), useNavigate: () => navigate }));
vi.mock("@/lib/onboarding-editor", async original => ({ ...await original<typeof import("@/lib/onboarding-editor")>(), saveEditorStep: vi.fn(), stageEditorFile: vi.fn() }));
const row = { ...blankEditorRow(), id: "step", slug: "ica_setup", title: "ICA", description: "Sign ICA", published: true, contentType: "ica" as const, showIbo: false, flowContent: { loa: { mode: "file" as const, assetId: "old-pdf", url: "https://example.invalid/old.pdf", filename: "old.pdf" } } };
const saved = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  vi.mocked(saveEditorStep).mockResolvedValue({ id: "step" });
  vi.mocked(stageEditorFile).mockResolvedValue({ mode: "file", assetId: "new-pdf", url: "https://example.invalid/new.pdf", filename: "new.pdf" });
});
afterEach(cleanup);
async function replacePdf() {
  render(<OnboardingStepModal row={row} token="admin" limits={{ video: 50000000, document: 20000000 }} onClose={() => {}} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("LOA document file"), { target: { files: [new File(["%PDF-"], "new.pdf", { type: "application/pdf" })] } });
  await screen.findByText("new.pdf");
}
describe("replacing a step's signing PDF", () => {
  it("makes a published replacement required for every applicable existing agent", async () => {
    await replacePdf();
    expect(screen.getByLabelText("Review a staged rollout before requiring signatures")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Review a staged rollout before requiring signatures"));
    fireEvent.click(screen.getByRole("button", { name: "Save & require signatures" }));
    await waitFor(() => expect(saveEditorStep).toHaveBeenCalledWith("admin", expect.objectContaining({ flowContent: { loa: expect.objectContaining({ assetId: "new-pdf" }) } })));
    expect(navigate).not.toHaveBeenCalled();
  });
  it("retains the old PDF until the reviewed rollout releases the onboarding stage", async () => {
    await replacePdf();
    fireEvent.click(screen.getByRole("button", { name: "Save & review rollout" }));
    await waitFor(() => expect(saveEditorStep).toHaveBeenCalledWith("admin", expect.objectContaining({ flowContent: row.flowContent })));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("asset=new-pdf"));
    expect(saved).toHaveBeenCalledOnce();
  });
  it("keeps an uploaded draft out of the required-signature path", async () => {
    await replacePdf();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "draft" } });
    expect(screen.queryByRole("button", { name: "Save & require signatures" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveEditorStep).toHaveBeenCalledWith("admin", expect.objectContaining({ published: false, flowContent: { loa: expect.objectContaining({ assetId: "new-pdf" }) } })));
    expect(navigate).not.toHaveBeenCalled();
  });
  it("does not navigate or lose the new PDF when saving fails", async () => {
    vi.mocked(saveEditorStep).mockRejectedValue(new Error("This step changed. Reload before saving."));
    await replacePdf();
    fireEvent.click(screen.getByRole("button", { name: "Save & review rollout" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("step changed");
    expect(navigate).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
    expect(screen.getByText("new.pdf")).toBeInTheDocument();
  });
});
