import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IcaSignatureModal from "./IcaSignatureModal.legacy";
import { readFileSync } from "node:fs";

const onboardingStyles = readFileSync("src/styles/onboarding.css", "utf8");

const stroke = vi.fn();
const image = "data:image/png;base64,local-test-ink";
let stylesheet: HTMLStyleElement;

beforeEach(() => {
  stylesheet = document.createElement("style");
  stylesheet.textContent = onboardingStyles;
  document.head.append(stylesheet);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke,
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400, height: 160, left: 0, top: 0,
  } as DOMRect);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(image);
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  stylesheet.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete HTMLCanvasElement.prototype.setPointerCapture;
});

describe("legacy ICA signature popup during staged rollout", () => {
  it("opens over the document instead of below it and saves drawn ink", () => {
    const onSave = vi.fn();
    render(<IcaSignatureModal open onClose={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole("dialog", { name: "Draw your signature" });
    const overlay = getComputedStyle(dialog.parentElement!);
    expect(overlay.position).toBe("fixed");
    expect(overlay.inset).toBe("0");
    expect(overlay.zIndex).toBe("1100");
    expect(overlay.display).toBe("grid");
    const save = screen.getByRole("button", { name: "Save signature" });
    expect(save).toBeDisabled();
    const canvas = screen.getByLabelText("Draw your signature", { selector: "canvas" });
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 60 });
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: 80 });
    fireEvent.pointerUp(canvas);
    expect(stroke).toHaveBeenCalled();
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(image);
  });

  it("disables saving again after clearing the drawing", () => {
    render(<IcaSignatureModal open onClose={vi.fn()} onSave={vi.fn()} />);
    const canvas = screen.getByLabelText("Draw your signature", { selector: "canvas" });
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 30 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 40 });
    fireEvent.pointerUp(canvas);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  });
});
