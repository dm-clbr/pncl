import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminOnboardingContent from "./AdminOnboardingContent";
import { fetchAdminOnboardingContent, uploadOnboardingContent, type OnboardingFlowContent } from "@/lib/onboarding-content";

vi.mock("@/lib/onboarding-content", async (original) => ({ ...await original<typeof import("@/lib/onboarding-content")>(), fetchAdminOnboardingContent: vi.fn(), uploadOnboardingContent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const flows: OnboardingFlowContent[] = ["loa", "ibo"].map((designation) => ({ designation: designation as "loa" | "ibo", ica: null, welcomeVideo: null, surelcVideo: null }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchAdminOnboardingContent).mockResolvedValue(flows); });
describe("separate onboarding uploads", () => {
  it("shows three independent upload slots for each flow", async () => {
    render(<AdminOnboardingContent accessToken="admin" todos={[]} onSaved={vi.fn()} />);
    await screen.findByLabelText("Choose LOA ICA");
    for (const flow of ["LOA", "IBO"]) for (const kind of ["ICA", "welcome video", "SureLC video"]) {
      expect(screen.getByLabelText(`Choose ${flow} ${kind}`)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Upload ${flow} ${kind}` })).toBeDisabled();
    }
  });
  it("uploads only to the selected IBO slot and refreshes its saved filename", async () => {
    const saved = vi.fn();
    vi.mocked(uploadOnboardingContent).mockResolvedValue({ ...flows[1], ica: { id: "new", filename: "ibo.pdf", url: "https://example.invalid/ibo.pdf", size_bytes: 10, created_at: "2026-10-22" } });
    render(<AdminOnboardingContent accessToken="admin" todos={[]} onSaved={saved} />);
    const file = new File(["%PDF"], "ibo.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByLabelText("Choose IBO ICA"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload IBO ICA" }));
    await waitFor(() => expect(uploadOnboardingContent).toHaveBeenCalledWith("admin", "ibo", "ica", file));
    expect(await screen.findByText("ibo.pdf")).toBeInTheDocument();
    expect(screen.getByText("Standard PNCL ICA")).toBeInTheDocument();
    expect(saved).toHaveBeenCalledOnce();
  });
  it("retains the old filename and selected file when an upload fails", async () => {
    vi.mocked(uploadOnboardingContent).mockRejectedValue(new Error("Upload failed"));
    const saved = vi.fn();
    render(<AdminOnboardingContent accessToken="admin" todos={[]} onSaved={saved} />);
    fireEvent.change(await screen.findByLabelText("Choose LOA welcome video"), { target: { files: [new File(["video"], "welcome.mp4", { type: "video/mp4" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload LOA welcome video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.getByRole("button", { name: "Upload LOA welcome video" })).toBeEnabled();
    expect(saved).not.toHaveBeenCalled();
  });
});
