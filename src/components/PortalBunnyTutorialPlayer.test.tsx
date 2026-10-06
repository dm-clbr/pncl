import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBunnyPlayer } from "@/lib/bunny-player";
import PortalTutorialVideoModal from "./PortalTutorialVideoModal";

vi.mock("@/lib/bunny-player", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/bunny-player")>(),
  loadBunnyPlayer: vi.fn(),
}));

class FakePlayer {
  static current: FakePlayer;
  listeners = new Map<string, (value?: unknown) => void>();
  setCurrentTime = vi.fn();
  pause = vi.fn();
  off = vi.fn((event: string) => this.listeners.delete(event));
  constructor() { FakePlayer.current = this; }
  on(event: string, callback: (value?: unknown) => void) { this.listeners.set(event, callback); }
  getDuration(callback: (duration: number) => void) { callback(5); }
  emit(event: string, value?: unknown) { this.listeners.get(event)?.(value); }
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("Bunny automatic tutorial completion", () => {
  it("blocks seeking and premature end events, then completes exactly once after full playback", async () => {
    vi.mocked(loadBunnyPlayer).mockResolvedValue(FakePlayer);
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const onComplete = vi.fn();
    const { unmount } = render(<PortalTutorialVideoModal title="SureLC walkthrough" sourceUrl="https://player.mediadelivery.net/play/687293/video-id" progressKey="test-bunny-video" completing={false} onComplete={onComplete} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTitle("SureLC walkthrough")).toBeInTheDocument());
    const player = FakePlayer.current;
    expect(screen.getByTitle("SureLC walkthrough")).toHaveAttribute("src", expect.stringContaining("autoplay=false"));
    act(() => { player.emit("ready"); player.emit("ended"); });
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      player.emit("play"); clock = 1000;
      player.emit("timeupdate", JSON.stringify({ seconds: 1, duration: 5 }));
      clock = 1250; player.emit("timeupdate", { seconds: 5, duration: 5 }); player.emit("ended");
    });
    expect(player.setCurrentTime).toHaveBeenCalledWith(1);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      for (let seconds = 2; seconds <= 5; seconds++) { clock = seconds * 1000; player.emit("timeupdate", { seconds, duration: 5 }); }
      player.emit("ended"); player.emit("ended");
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("test-bunny-video")).toBe("5");
    unmount();
    expect(player.off).toHaveBeenCalledWith("timeupdate");
  });

  it("keeps the gate incomplete when the tracking API cannot load", async () => {
    vi.mocked(loadBunnyPlayer).mockRejectedValue(new Error("Network unavailable"));
    const onComplete = vi.fn();
    render(<PortalTutorialVideoModal title="SureLC walkthrough" sourceUrl="https://player.mediadelivery.net/play/687293/video-id" progressKey="test-bunny-error" completing={false} onComplete={onComplete} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The video could not load");
    expect(onComplete).not.toHaveBeenCalled();
  });
});
