import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOnboardingSteps from "./AdminOnboardingSteps";
import { useOnboardingEditor } from "@/hooks/useOnboardingEditor";
import {
  blankEditorRow,
  defaultFlowRules,
  saveEditorStep,
} from "@/lib/onboarding-editor";
vi.mock("@/hooks/useOnboardingEditor", () => ({
  useOnboardingEditor: vi.fn(),
}));
vi.mock("@/lib/onboarding-editor", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding-editor")>()),
  saveEditorStep: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const reload = vi.fn();
const rows = [
  {
    ...blankEditorRow(),
    id: "ica",
    slug: "ica_setup",
    title: "Sign ICA",
    description: "Sign your agreement",
    contentType: "ica" as const,
    published: true,
  },
  {
    ...blankEditorRow(),
    id: "w9",
    slug: "w9_setup",
    title: "Submit W-9",
    description: "Submit your tax form",
    contentType: "system" as const,
    showIbo: false,
    published: true,
  },
  {
    ...blankEditorRow(),
    id: "future",
    slug: "future",
    title: "Future step",
    description: "A future step",
    phase: "sales_ready" as const,
  },
];
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  vi.mocked(useOnboardingEditor).mockReturnValue({
    data: {
      rows,
      limits: { video: 52428800, document: 20971520 },
      flows: {
        loa: { rules: defaultFlowRules(), revision: 0 },
        ibo: { rules: defaultFlowRules(), revision: 0 },
      },
    },
    loading: false,
    error: "",
    reload,
    token: "token",
  });
  vi.mocked(saveEditorStep).mockResolvedValue({ id: "new" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const show = () =>
  render(
    <MemoryRouter>
      <AdminOnboardingSteps />
    </MemoryRouter>,
  );
describe("Onboarding content editor", () => {
  it("filters the table by stage, flow and search", () => {
    show();
    fireEvent.change(screen.getByLabelText("Flow"), {
      target: { value: "ibo" },
    });
    expect(screen.queryByText("Submit W-9")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stage"), {
      target: { value: "sales_ready" },
    });
    expect(screen.queryByText("Sign ICA")).not.toBeInTheDocument();
    expect(screen.getByText("Future step")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search steps"), {
      target: { value: "missing" },
    });
    expect(
      screen.getByText("No steps match these filters."),
    ).toBeInTheDocument();
  });
  it("opens independent ICA dropzones and cancel makes no write", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit Sign ICA" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getAllByText("Drop your PDF here")).toHaveLength(2);
    fireEvent.change(within(modal).getByLabelText("Step title"), {
      target: { value: "Pending title" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "Cancel" }));
    expect(saveEditorStep).not.toHaveBeenCalled();
    expect(screen.getByText("Sign ICA")).toBeInTheDocument();
  });
  it("creates a draft row and saves all content together", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Step title"), {
      target: { value: "Guide" },
    });
    fireEvent.change(within(modal).getByLabelText("Description"), {
      target: { value: "Read your guide" },
    });
    fireEvent.click(
      within(modal).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(saveEditorStep).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({
          title: "Guide",
          published: false,
          flowContent: {},
          showLoa: true,
          showIbo: true,
        }),
      ),
    );
    expect(reload).toHaveBeenCalled();
  });
  it("keeps changes after a save failure", async () => {
    vi.mocked(saveEditorStep).mockRejectedValue(new Error("Save failed"));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit Submit W-9" }));
    fireEvent.change(screen.getByLabelText("Step title"), {
      target: { value: "Updated W-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByLabelText("Step title")).toHaveValue("Updated W-9");
    expect(reload).not.toHaveBeenCalled();
  });
  it("rejects invalid video links before saving", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.change(screen.getByLabelText("Step title"), {
      target: { value: "Training" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Watch training" },
    });
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "video" },
    });
    const loa = screen.getByRole("region", { name: "LOA content" });
    fireEvent.click(within(loa).getByRole("button", { name: "Video link" }));
    fireEvent.change(screen.getByLabelText("LOA video URL"), {
      target: { value: "https://example.com/watch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bunny Stream");
    expect(saveEditorStep).not.toHaveBeenCalled();
  });
});
