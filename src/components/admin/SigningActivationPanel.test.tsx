import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SigningActivationPanel from "./SigningActivationPanel";
const state = vi.hoisted(() => ({ activate: vi.fn(), preview: vi.fn(), reload: vi.fn() }));
vi.mock("@/lib/onboarding-editor", () => ({ setSigningActivation: state.activate, setSigningPreview: state.preview }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const rollout = { enabled: false, revision: 3, previewSelf: false, missing: [] as string[], pendingLegacy: 1 };
const show = (value = rollout) => render(<MemoryRouter><SigningActivationPanel rollout={value} token="test" reload={state.reload} /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); state.activate.mockResolvedValue({}); state.preview.mockResolvedValue({}); });
describe("admin signing activation", () => {
  it("requires explicit review even when sources are ready", async () => {
    show(); expect(screen.getByRole("button", { name: "Activate uploaded signing" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Activate uploaded signing" }));
    await waitFor(() => expect(state.activate).toHaveBeenCalledWith("test", true, 3));
    expect(state.preview).not.toHaveBeenCalled();
  });
  it("keeps activation disabled when a required flow PDF is missing", () => {
    show({ ...rollout, missing: ["ICA (IBO)"] }); fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/ICA \(IBO\)/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Activate uploaded signing" })).toBeDisabled();
  });
  it.each([false, true])("offers fresh previews without changing any rollout setting (enabled=%s)", enabled => {
    show({ ...rollout, enabled });
    for (const [name, kind] of [["Test ICA", "ica"], ["Test W-9", "w9"], ["Test direct deposit", "direct-deposit"], ["Test compensation", "compensation"]]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", `/portal/admin/signing-preview/${kind}`);
    }
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.activate).not.toHaveBeenCalled();
  });
  it("offers a separately confirmed return to the previous process", async () => {
    show({ ...rollout, enabled: true }); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Return to previous signing" }));
    await waitFor(() => expect(state.activate).toHaveBeenCalledWith("test", false, 3));
  });
});
