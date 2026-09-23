import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import W9FillablePdfViewer from "@/components/W9FillablePdfViewer";

/** pdf.js cannot run in jsdom: it parses a real PDF and paints its own canvas
    stack. These stubs keep the module graph loadable so the component's own
    loading and error branches are the thing under test. */
vi.mock("@/lib/pdfjs-setup", () => ({}));
vi.mock("pdfjs-dist/legacy/web/pdf_viewer.css", () => ({}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => ({ promise: Promise.reject(new Error("stub: no pdf")) }),
}));
vi.mock("pdfjs-dist/legacy/web/pdf_viewer.mjs", () => ({
  EventBus: class {
    on() {}
    off() {}
  },
  PDFLinkService: class {
    setViewer() {}
    setDocument() {}
  },
  PDFViewer: class {
    currentPageNumber = 1;
    setDocument() {}
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The pager goes away while the document is loading or failed, but the
    actions slot must not go with it: it carries the signing step's Back
    control, which on the public onboarding funnel is the only way out of the
    contract step. */
describe("W9FillablePdfViewer chrome states", () => {
  it("renders the loading state without the pager but keeps the actions slot", async () => {
    // A fetch that never settles holds the component in its loading branch.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    await act(async () => {
      render(<W9FillablePdfViewer actions={<button type="button">Back</button>} />);
    });

    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("renders the error state without the pager but keeps the actions slot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    await act(async () => {
      render(<W9FillablePdfViewer actions={<button type="button">Back</button>} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Unable to load W-9 \(404\)/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Open PDF in new tab/ })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});
