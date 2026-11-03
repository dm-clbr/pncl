import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IcaSignaturePad from "./IcaSignaturePad";
const drawImage = vi.fn();
const context = { fillRect: vi.fn(), drawImage, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
let images: { onload?: () => void; src?: string }[];
beforeEach(() => {
  images = []; vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 160, left: 0, top: 0 } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,drawn");
  vi.stubGlobal("Image", class { constructor() { images.push(this); } onload?: () => void; src?: string; width = 400; height = 160; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("ICA signature canvas", () => {
  it("loads existing ink and preserves it when the viewport resizes", () => {
    const onChange = vi.fn();
    render(<IcaSignaturePad initialImage="data:image/png;base64,saved" onChange={onChange} />);
    act(() => images[0].onload?.());
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    drawImage.mockClear();
    fireEvent(window, new Event("resize"));
    expect(drawImage).toHaveBeenCalledTimes(2); // Copy the old canvas and paint it at its new size.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    drawImage.mockClear(); fireEvent(window, new Event("resize"));
    expect(drawImage).not.toHaveBeenCalled();
  });
});
