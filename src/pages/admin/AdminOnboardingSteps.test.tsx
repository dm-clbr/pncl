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
  stageEditorFile,
} from "@/lib/onboarding-editor";
vi.mock("@/hooks/useOnboardingEditor", () => ({
  useOnboardingEditor: vi.fn(),
}));
vi.mock("@/lib/onboarding-editor", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding-editor")>()),
  saveEditorStep: vi.fn(),
  stageEditorFile: vi.fn(),
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
      features: { supportingFiles: true },
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

describe("Row preview and supporting documents", () => {
  it("previews every row without saving, signing or changing completion", () => {
    show();
    expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(rows.length);
    fireEvent.click(screen.getByRole("button", { name: "Preview Sign ICA" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByTitle("LOA document preview")).toHaveAttribute("src", "/documents/pncl-ica-standard.pdf");
    fireEvent.click(within(modal).getByRole("button", { name: "IBO", exact: true }));
    expect(within(modal).getByTitle("IBO document preview")).toBeInTheDocument();
    expect(within(modal).queryByRole("button", { name: /Sign agreement/ })).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Done" }));
    expect(saveEditorStep).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  function sureLcRow() {
    const state = vi.mocked(useOnboardingEditor).mock.results[0]?.value ?? useOnboardingEditor();
    const row = { ...blankEditorRow(), id: "surelc", slug: "surelc_tutorial", title: "SureLC walkthrough", description: "Watch and read your guide", contentType: "surelc_video" as const,
      published: true, flowContent: { loa: { mode: "link" as const, url: "https://example.com/loa.mp4" }, ibo: { mode: "link" as const, url: "https://example.com/ibo.mp4" } } };
    vi.mocked(useOnboardingEditor).mockReturnValue({ ...state, data: { ...state.data!, rows: [row] } });
  }

  it("previews the selected flow's video and supporting PDF", () => {
    sureLcRow();
    const state = useOnboardingEditor();
    state.data!.rows[0].flowAttachments = { loa: [{ mode: "file", assetId: "loa", url: "https://example.com/loa.pdf", filename: "LOA guide.pdf" }], ibo: [{ mode: "file", assetId: "ibo", url: "https://example.com/ibo.pdf", filename: "IBO guide.pdf" }] };
    show();
    fireEvent.click(screen.getByRole("button", { name: "Preview SureLC walkthrough" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByLabelText("LOA video preview")).toHaveAttribute("src", "https://example.com/loa.mp4");
    expect(within(modal).getByRole("link", { name: "LOA guide.pdf" })).toHaveAttribute("href", "https://example.com/loa.pdf");
    fireEvent.click(within(modal).getByRole("button", { name: "IBO", exact: true }));
    expect(within(modal).getByLabelText("IBO video preview")).toHaveAttribute("src", "https://example.com/ibo.mp4");
    expect(within(modal).queryByText("LOA guide.pdf")).not.toBeInTheDocument();
    expect(within(modal).getByRole("link", { name: "IBO guide.pdf" })).toBeInTheDocument();
  });

  it("adds multiple LOA PDFs alongside the video without replacing the IBO reference", async () => {
    sureLcRow();
    vi.mocked(stageEditorFile)
      .mockResolvedValueOnce({ mode: "file", assetId: "loa-guide", url: "https://example.com/guide.pdf", filename: "LOA guide.pdf", size: 100 })
      .mockResolvedValueOnce({ mode: "file", assetId: "loa-checklist", url: "https://example.com/checklist.pdf", filename: "Checklist.pdf", size: 100 });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit SureLC walkthrough" }));
    const loa = screen.getByRole("region", { name: "LOA supporting files" });
    const ibo = screen.getByRole("region", { name: "IBO supporting files" });
    expect(within(loa).getByRole("link", { name: "SureLC quick reference (PDF)" })).toBeInTheDocument();
    for (const filename of ["LOA guide.pdf", "Checklist.pdf"]) {
      fireEvent.click(within(loa).getByRole("button", { name: "Add supporting file" }));
      fireEvent.change(within(loa).getByLabelText("LOA document file"), { target: { files: [new File(["%PDF-test"], filename, { type: "application/pdf" })] } });
      await within(loa).findByRole("link", { name: filename });
    }
    expect(within(loa).queryByText("SureLC quick reference (PDF)")).not.toBeInTheDocument();
    expect(within(ibo).getByRole("link", { name: "SureLC quick reference (PDF)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saveEditorStep).toHaveBeenCalled());
    const saved = vi.mocked(saveEditorStep).mock.calls[0][1];
    expect(saved.flowContent.loa?.url).toBe("https://example.com/loa.mp4");
    expect(saved.flowAttachments?.loa).toHaveLength(2);
    expect(saved.flowAttachments?.ibo).toBeUndefined();
  });
});
