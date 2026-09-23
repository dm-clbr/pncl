import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IcaFillablePdfViewer from "@/components/IcaFillablePdfViewer";

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

describe("IcaFillablePdfViewer chrome states", () => {
  it("renders the loading state without the pager or the section jumps", async () => {
    // A fetch that never settles holds the component in its loading branch.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    await act(async () => {
      render(<IcaFillablePdfViewer actions={<button type="button">Sign</button>} />);
    });

    expect(screen.getByText(/Loading/)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
  });

  it("renders the error state without the pager or the section jumps", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    await act(async () => {
      render(<IcaFillablePdfViewer actions={<button type="button">Sign</button>} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Unable to load agreement \(404\)/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Open PDF in new tab/ })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
  });
});
