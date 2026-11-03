import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IcaSignatureModal from "./IcaSignatureModal";
vi.mock("./IcaSignaturePad", () => ({ default: ({ initialImage, onChange }: { initialImage: string; onChange: (value: string | null) => void }) => <div><span>{initialImage || "Empty pad"}</span><button onClick={() => onChange("new-signature")}>Draw new signature</button><button onClick={() => onChange(null)}>Clear test signature</button></div> }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
});
afterEach(cleanup);
describe("ICA signature editing", () => {
  it("restores the saved signature and discards a cancelled replacement", () => {
    const onSave = vi.fn(); const onClose = vi.fn();
    const props = { initialImage: "saved-signature", onSave, onClose };
    const page = render(<IcaSignatureModal open {...props} />);
    expect(screen.getByText("saved-signature")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draw new signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    page.rerender(<IcaSignatureModal open={false} {...props} />);
    page.rerender(<IcaSignatureModal open {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    expect(onSave).toHaveBeenCalledWith("saved-signature");
  });
  it("cannot save after the signature is cleared", () => {
    render(<IcaSignatureModal open initialImage="saved-signature" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear test signature" }));
    expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  });
});
