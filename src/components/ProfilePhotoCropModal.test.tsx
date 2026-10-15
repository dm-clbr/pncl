import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Area } from "react-easy-crop";
import ProfilePhotoCropModal from "@/components/ProfilePhotoCropModal";
import { getCroppedProfilePhotoBlob } from "@/lib/profile-photo";

vi.mock("react-easy-crop", () => ({
  default: function MockCropper({ onCropComplete }: { onCropComplete: (area: Area, pixels: Area) => void }) {
    useEffect(() => {
      const area = { x: 0, y: 0, width: 100, height: 100 };
      onCropComplete(area, area);
    }, [onCropComplete]);
    return <div>Crop image</div>;
  },
}));
vi.mock("@/lib/profile-photo", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/profile-photo")>();
  return { ...original, getCroppedProfilePhotoBlob: vi.fn() };
});

const showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const urlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:local-cropped-photo" });
});
afterAll(() => {
  for (const [key, descriptor] of [["showModal", showDescriptor], ["close", closeDescriptor]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
  if (urlDescriptor) Object.defineProperty(URL, "createObjectURL", urlDescriptor);
  else Reflect.deleteProperty(URL, "createObjectURL");
});

beforeEach(() => vi.mocked(getCroppedProfilePhotoBlob).mockReset());

describe("profile photo crop sheet", () => {
  it("focuses the shared sheet title and cancels without confirming a photo", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ProfilePhotoCropModal imageSrc="blob:input" onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByRole("dialog", { name: "Crop profile photo" })).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Crop profile photo" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("keeps crop processing and passes the resulting file and preview to the profile", async () => {
    const onConfirm = vi.fn();
    vi.mocked(getCroppedProfilePhotoBlob).mockResolvedValue(new Blob(["cropped photo"], { type: "image/jpeg" }));
    render(<ProfilePhotoCropModal imageSrc="blob:input" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(getCroppedProfilePhotoBlob).toHaveBeenCalledWith("blob:input", { x: 0, y: 0, width: 100, height: 100 });
    expect(onConfirm.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onConfirm.mock.calls[0][1]).toBe("blob:local-cropped-photo");
  });
});
