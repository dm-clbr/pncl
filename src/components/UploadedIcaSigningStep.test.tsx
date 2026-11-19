import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadedIcaSigningStep from "./UploadedIcaSigningStep";

const pdf = vi.hoisted(() => ({ fail: false }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {}, version: "4.10.38",
  getDocument: () => ({
    destroy: vi.fn(),
    promise: pdf.fail ? Promise.reject(new Error("Missing PDF")) : Promise.resolve({
      numPages: 10,
      getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }) }),
    }),
  }),
}));
vi.mock("./IcaSignaturePad", () => ({ default: ({ onChange }: { onChange: (value: string) => void }) => <button type="button" onClick={() => onChange("data:image/png;base64,test")}>Draw test signature</button> }));
const asset = { id: "ibo-ica-id", filename: "ibo.pdf", url: "https://example.invalid/ibo.pdf", size_bytes: 100, created_at: "2026-10-22" };
beforeEach(() => {
  pdf.fail = false;
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("uploaded ICA review", () => {
  it("submits from the first page once signature adoption and both consents are complete", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await act(async () => { render(<UploadedIcaSigningStep asset={asset} prefillLegalName="Sample Agent" prefillEmail="sample@example.invalid" onSubmit={onSubmit} />); });
    const sign = screen.getByRole("button", { name: "Sign agreement" });
    expect(sign).toBeDisabled();
    expect(screen.queryByLabelText("Full legal first and last name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Personal email")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create signature" }));
    expect(screen.getByLabelText("Full legal first and last name")).toHaveValue("Sample Agent");
    expect(screen.getByLabelText("Personal email")).toHaveValue("sample@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Draw signature", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Draw test signature" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I adopt the signature/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save and use signature" }));
    expect(sign).toBeDisabled();
    const [counsel, accepted] = screen.getAllByRole("checkbox");
    fireEvent.click(counsel);
    expect(sign).toBeDisabled();
    fireEvent.click(accepted);
    await waitFor(() => expect(sign).toBeEnabled());
    expect(screen.getAllByText("Page 1 of 10")).toHaveLength(2);
    expect(screen.queryByText(/View all pages|View every page/)).not.toBeInTheDocument();
    fireEvent.click(sign);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ signatureAdoption: expect.objectContaining({ method: "drawn", accepted: true }), templateAssetId: "ibo-ica-id", agreementAccepted: true, counselAcknowledged: true })));
  });
  it("does not allow signing an unavailable document", async () => {
    pdf.fail = true;
    await act(async () => { render(<UploadedIcaSigningStep asset={asset} onSubmit={vi.fn()} />); });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load the signing document");
    expect(screen.getByRole("button", { name: "Sign agreement" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry document" })).toBeEnabled();
  });
});

vi.mock("./IcaSigningStep", () => ({ default: () => <div>Mapped uploaded agreement</div> }));
