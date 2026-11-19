import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SigningDocumentReview from "./SigningDocumentReview";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const state = vi.hoisted(() => ({ failLoad: false, failRenderPage: 0 }));

vi.mock("@/lib/pdfjs-setup", () => ({}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  version: "4.10.38",
  getDocument: vi.fn(() => ({ destroy: vi.fn(), promise: state.failLoad ? Promise.reject(new TypeError("Failed to fetch https://private.example/pdf?token=secret")) : Promise.resolve({
    numPages: 3,
    getPage: async (page: number) => ({
      getViewport: () => ({ width: 600, height: 800, convertToViewportRectangle: (rect: number[]) => rect }),
      getAnnotations: async () => page === 1 ? [
        { fieldName: "pncl_text_office", alternativeText: "Agent office", fieldType: "Tx", required: true, rect: [60,100,300,130] },
        { fieldName: "pncl_signature_name", alternativeText: "Signature", fieldType: "Tx", required: true, readOnly: true, rect: [60,150,300,180] },
      ] : page === 2 ? [{ fieldName: "pncl_checkbox_confirm", alternativeText: "Confirm details", checkBox: true, required: true, rect: [60,100,80,120] }] : [],
      render: () => ({ promise: page === state.failRenderPage ? Promise.reject(new Error("Canvas unavailable")) : Promise.resolve(), cancel: vi.fn() }),
    }),
  }) })),
}));
beforeEach(() => {
  state.failLoad = false; state.failRenderPage = 0; vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("placed fields during document review", () => {
  it("validates fields on unvisited pages and allows signing without visiting text-only pages", async () => {
    function Harness() {
      const [values, setValues] = useState<Record<string, string | boolean>>({});
      const [ready, setReady] = useState(false);
      return <><SigningDocumentReview url="/sample.pdf" title="Sample" values={values} onValuesChange={setValues} onReviewed={setReady} signingName="Alex Morgan" /><button disabled={!ready}>Sign</button></>;
    }
    render(<Harness />);
    const office = await screen.findByRole("textbox", { name: "Agent office" });
    expect(screen.getByRole("textbox", { name: "Signature" })).toHaveValue("Alex Morgan");
    expect(screen.getByRole("textbox", { name: "Signature" })).toHaveAttribute("readonly");
    fireEvent.change(office, { target: { value: "Sample office" } });
    expect(screen.getByRole("button", { name: "Sign" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const confirmation = await screen.findByRole("checkbox", { name: "Confirm details" });
    expect(screen.getByRole("button", { name: "Sign" })).toBeDisabled();
    fireEvent.click(confirmation);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign" })).toBeEnabled());
    expect(screen.getAllByText("Page 2 of 3")).toHaveLength(2);
    expect(screen.queryByText(/View every page before signing/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByRole("textbox", { name: "Agent office" })).toHaveValue("Sample office");
    fireEvent.change(screen.getByRole("textbox", { name: "Agent office" }), { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign" })).toBeDisabled());
  });

  it("accepts completed fields on unvisited pages", async () => {
    const reviewed = vi.fn();
    render(<SigningDocumentReview url="/sample.pdf" title="Sample" values={{ pncl_text_office: "Sample office", pncl_checkbox_confirm: true }} onValuesChange={vi.fn()} onReviewed={reviewed} />);
    await waitFor(() => expect(reviewed).toHaveBeenLastCalledWith(true));
    expect(screen.getAllByText("Page 1 of 3")).toHaveLength(2);
  });
});

it("opens the signature overlay from the document and shows the exact adopted image", async () => {
  const open = vi.fn(); const changed = vi.fn(); const reviewed = vi.fn();
  const props = { url: "/sample.pdf", title: "Sample", onReviewed: reviewed, onValuesChange: changed, onSignatureClick: open };
  const page = render(<SigningDocumentReview {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Create signature: Signature" }));
  expect(open).toHaveBeenCalledOnce();
  page.rerender(<SigningDocumentReview {...props} signatureImage="data:image/png;base64,adopted" />);
  expect(await screen.findByRole("button", { name: "Change signature: Signature" })).toBeInTheDocument();
  expect(screen.getByAltText("Adopted signature")).toHaveAttribute("src", "data:image/png;base64,adopted");
});

describe("document loading recovery", () => {
  it("reports safe details and enables signing after retry without requiring page visits", async () => {
    state.failLoad = true;
    const reviewed = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SigningDocumentReview url="https://private.example/pdf?token=secret" sourceId="17996bca-9d4b-4c5d-bbca-884faa95ca0a" title="Agreement" onReviewed={reviewed} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("network_failed");
    expect(alert).toHaveTextContent("17996bca-9d4b-4c5d-bbca-884faa95ca0a");
    expect(alert.textContent).not.toContain("secret");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private.example");
    expect(reviewed).toHaveBeenLastCalledWith(false);
    state.failLoad = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry document" }));
    expect(await screen.findAllByText("Page 1 of 3")).toHaveLength(2);
    expect(getDocument).toHaveBeenLastCalledWith(expect.objectContaining({ disableRange: true, disableStream: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    await waitFor(() => expect(reviewed).toHaveBeenLastCalledWith(true));
  });
  it("blocks signing when a later page fails to render", async () => {
    state.failRenderPage = 2;
    const reviewed = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SigningDocumentReview url="/sample.pdf" title="Agreement" onReviewed={reviewed} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("canvas_unavailable");
    expect(reviewed).toHaveBeenLastCalledWith(false);
  });
});
