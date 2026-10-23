import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UploadedIcaSigningStep from "./UploadedIcaSigningStep";

const pdf = vi.hoisted(() => ({ fail: false }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    destroy: vi.fn(),
    promise: pdf.fail ? Promise.reject(new Error("Missing PDF")) : Promise.resolve({
      numPages: 2,
      getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }) }),
    }),
  }),
}));
vi.mock("./IcaSignaturePad", () => ({ default: ({ onChange }: { onChange: (value: string) => void }) => <button type="button" onClick={() => onChange("data:image/png;base64,test")}>Draw test signature</button> }));
const asset = { id: "ibo-ica-id", filename: "ibo.pdf", url: "https://example.invalid/ibo.pdf", size_bytes: 100, created_at: "2026-10-22" };
beforeEach(() => {
  pdf.fail = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("uploaded ICA review", () => {
  it("requires every page, a signature and both consents before submitting the reviewed asset ID", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await act(async () => { render(<UploadedIcaSigningStep asset={asset} prefillLegalName="Sample Agent" prefillEmail="sample@example.invalid" onSubmit={onSubmit} />); });
    const sign = screen.getByRole("button", { name: "Sign agreement" });
    fireEvent.click(screen.getByRole("button", { name: "Draw test signature" }));
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    expect(sign).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(sign).toBeEnabled());
    fireEvent.click(sign);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ templateAssetId: "ibo-ica-id", agreementAccepted: true, counselAcknowledged: true })));
  });
  it("does not allow signing an unavailable document", async () => {
    pdf.fail = true;
    await act(async () => { render(<UploadedIcaSigningStep asset={asset} onSubmit={vi.fn()} />); });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load the agreement");
    expect(screen.getByRole("button", { name: "Sign agreement" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry agreement" })).toBeEnabled();
  });
});
