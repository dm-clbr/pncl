import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminOnboardingLogic from "./AdminOnboardingLogic";
import { useOnboardingEditor } from "@/hooks/useOnboardingEditor";
import { defaultFlowRules, saveEditorFlow } from "@/lib/onboarding-editor";
vi.mock("@/hooks/useOnboardingEditor", () => ({
  useOnboardingEditor: vi.fn(),
}));
vi.mock("@/lib/onboarding-editor", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding-editor")>()),
  saveEditorFlow: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
beforeEach(() => {
  vi.mocked(useOnboardingEditor).mockReturnValue({
    data: {
      rows: [],
      limits: { video: 1000, document: 1000 },
      flows: {
        loa: { rules: defaultFlowRules(), revision: 3 },
        ibo: { rules: defaultFlowRules(), revision: 8 },
      },
    },
    loading: false,
    error: "",
    token: "token",
    reload: vi.fn(),
  });
  vi.mocked(saveEditorFlow).mockResolvedValue({ revision: 4 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("retains separate draft orders and saves only the selected flow revision", async () => {
  render(
    <MemoryRouter>
      <AdminOnboardingLogic />
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Edit other conditions" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Move Phone number down" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "IBO", exact: true }));
  expect(screen.getByRole("button", { name: "Save flow" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "LOA •", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Save flow" }));
  await waitFor(() => expect(saveEditorFlow).toHaveBeenCalledTimes(1));
  const [, flow, rules, revision] = vi.mocked(saveEditorFlow).mock.calls[0];
  expect(flow).toBe("loa");
  expect(revision).toBe(3);
  expect(rules.applicationOrder.slice(0, 2)).toEqual([
    "dateOfBirth",
    "phoneNumber",
  ]);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save flow" })).toBeDisabled(),
  );
});
