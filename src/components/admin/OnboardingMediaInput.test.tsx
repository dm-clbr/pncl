import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingMediaInput from "./OnboardingMediaInput";
import { stageEditorFile } from "@/lib/onboarding-editor";
import { prepareVideo } from "@/lib/video-compression";

vi.mock("@/lib/onboarding-editor", async (original) => ({
  ...(await original<typeof import("@/lib/onboarding-editor")>()),
  stageEditorFile: vi.fn(),
}));
vi.mock("@/lib/video-compression", async (original) => ({
  ...(await original<typeof import("@/lib/video-compression")>()),
  prepareVideo: vi.fn(),
}));
const onChange = vi.fn();
const onBusy = vi.fn();
const staged = {
  mode: "file" as const,
  url: "https://example.com/video.mp4",
  assetId: "asset",
};
const show = (kind: "ica" | "video" = "ica", limit = 1000) =>
  render(
    <OnboardingMediaInput
      designation="loa"
      kind={kind}
      token="token"
      limit={limit}
      onChange={onChange}
      onBusy={onBusy}
    />,
  );
beforeEach(() => {
  vi.mocked(stageEditorFile).mockResolvedValue(staged);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("Onboarding media preparation", () => {
  it("stages a dropped PDF for only the selected designation", async () => {
    show();
    const file = new File(["%PDF-test"], "agreement.pdf", {
      type: "application/pdf",
    });
    fireEvent.drop(screen.getByText("Drop your PDF here").parentElement!, {
      dataTransfer: { files: [file] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(staged));
    expect(stageEditorFile).toHaveBeenCalledWith(
      "token",
      "loa",
      "ica",
      file,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(prepareVideo).not.toHaveBeenCalled();
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });
  it("rejects oversized documents before staging", async () => {
    show("ica", 2);
    fireEvent.drop(screen.getByText("Drop your PDF here").parentElement!, {
      dataTransfer: {
        files: [
          new File(["%PDF-test"], "large.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a document under",
    );
    expect(stageEditorFile).not.toHaveBeenCalled();
  });
  it("stages the compressed video rather than the oversized source", async () => {
    show("video");
    const source = new File([new Uint8Array(2000)], "large.mp4", {
      type: "video/mp4",
    });
    const compressed = new File([new Uint8Array(900)], "small.mp4", {
      type: "video/mp4",
    });
    vi.mocked(prepareVideo).mockResolvedValue(compressed);
    fireEvent.drop(screen.getByText("Drop a video here").parentElement!, {
      dataTransfer: { files: [source] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(staged));
    expect(prepareVideo).toHaveBeenCalledWith(
      source,
      1000,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(stageEditorFile).toHaveBeenCalledWith(
      "token",
      "loa",
      "video",
      compressed,
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });
  it("aborts preparation without replacing the current content", async () => {
    show("video");
    vi.mocked(prepareVideo).mockImplementation(
      (_file, _limit, _progress, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Canceled", "AbortError")),
          );
        }),
    );
    fireEvent.drop(screen.getByText("Drop a video here").parentElement!, {
      dataTransfer: {
        files: [new File(["video"], "clip.mp4", { type: "video/mp4" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
    expect(onChange).not.toHaveBeenCalled();
    expect(stageEditorFile).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Retry file" }),
    ).toBeInTheDocument();
  });
});
