import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SigningDocumentReview from "./SigningDocumentReview";

vi.mock("@/lib/pdfjs-setup", () => ({}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: () => ({ destroy: vi.fn(), promise: Promise.resolve({
    numPages: 2,
    getPage: async (page: number) => ({
      getViewport: () => ({ width: 600, height: 800, convertToViewportRectangle: (rect: number[]) => rect }),
      getAnnotations: async () => page === 1 ? [
        { fieldName: "pncl_text_office", alternativeText: "Agent office", fieldType: "Tx", required: true, rect: [60,100,300,130] },
        { fieldName: "pncl_signature_name", alternativeText: "Signature", fieldType: "Tx", required: true, readOnly: true, rect: [60,150,300,180] },
      ] : [{ fieldName: "pncl_checkbox_confirm", alternativeText: "Confirm details", checkBox: true, required: true, rect: [60,100,80,120] }],
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    }),
  }) }),
}));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("placed fields during document review", () => {
  it("requires all pages and required fields, and preserves entries between pages", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByRole("textbox", { name: "Agent office" })).toHaveValue("Sample office");
    fireEvent.change(screen.getByRole("textbox", { name: "Agent office" }), { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign" })).toBeDisabled());
  });
});
