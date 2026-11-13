import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignatureAdoption from "./SignatureAdoption";
import { typedSignatureImage } from "@/lib/signature-image";
vi.mock("@/lib/signature-image", () => ({ typedSignatureImage: vi.fn(async (name: string) => `data:image/png;base64,${name}`) }));
vi.mock("./IcaSignaturePad", () => ({ default: ({ onChange }: { onChange: (image: string | null) => void }) => <><button type="button" onClick={() => onChange("drawn-png")}>Test draw</button><button type="button" onClick={() => onChange(null)}>Test clear</button></> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("signature adoption", () => {
  it("requires opt-in after the font loads and invalidates consent when the legal name changes", async () => {
    const changed = vi.fn();
    const page = render(<SignatureAdoption name="Alex Agent" onChange={changed} />);
    await screen.findByAltText("Signature preview for Alex Agent");
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Adopt signature" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Adopt signature" }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ method: "typed", accepted: true, name: "Alex Agent", imageDataUrl: "data:image/png;base64,Alex Agent" }));
    page.rerender(<SignatureAdoption name="Alex Morgan" onChange={changed} />);
    await screen.findByAltText("Signature preview for Alex Morgan");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(changed).toHaveBeenLastCalledWith(null);
  });
  it("does not adopt a fallback font and allows drawing when loading fails", async () => {
    vi.mocked(typedSignatureImage).mockRejectedValueOnce(new Error("Font unavailable"));
    const changed = vi.fn();
    render(<SignatureAdoption name="Alex Agent" onChange={changed} />);
    await screen.findByText("Font unavailable");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Test draw" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Save and use signature" }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ method: "drawn", imageDataUrl: "drawn-png", accepted: true }));
    fireEvent.click(screen.getByRole("button", { name: "Test clear" }));
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
  it("ignores a stale font render after a newer name or drawing is selected", async () => {
    let finish!: (value: string) => void;
    vi.mocked(typedSignatureImage).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<SignatureAdoption name="Alex Agent" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
    await act(async () => finish("stale-image"));
    await waitFor(() => expect(screen.queryByAltText("Signature preview for Alex Agent")).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
