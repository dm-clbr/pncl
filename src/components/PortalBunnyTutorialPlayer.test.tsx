import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  off = vi.fn((event: string) => {
    // The real SDK sends a postMessage during off(); detached frames cannot
    // receive it. This catches passive-effect cleanup after DOM removal.
    if (!this.frame.isConnected || !this.frame.contentWindow) throw new Error("Player iframe was detached before cleanup");
    this.listeners.delete(event);
  });
  constructor(private frame: HTMLIFrameElement) { FakePlayer.current = this; }
  on(event: string, callback: (value?: unknown) => void) { this.listeners.set(event, callback); }
  getDuration(callback: (duration: number) => void) { callback(5); }
  emit(event: string, value?: unknown) { this.listeners.get(event)?.(value); }
}

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("Bunny automatic tutorial completion", () => {
  it("can close during playback, resume to completion, and close/reopen for replay", async () => {
    vi.mocked(loadBunnyPlayer).mockResolvedValue(FakePlayer);
    const onComplete = vi.fn();
    function Journey() {
      const [open, setOpen] = useState(true);
      const [completed, setCompleted] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open tutorial</button>
        <p>{completed ? "SureLC accounts unlocked" : "Watch the tutorial"}</p>
        {open && <PortalTutorialVideoModal title="SureLC walkthrough" sourceUrl="https://player.mediadelivery.net/play/687293/video-id"
          progressKey={`test-session${completed ? ":replay" : ""}`} completed={completed} completing={false}
          onComplete={() => { onComplete(); setCompleted(true); }} onClose={() => setOpen(false)} />}</>;
    }
    render(<Journey />);
    await screen.findByTitle("SureLC walkthrough");
    const first = FakePlayer.current;
    act(() => { first.emit("ready"); first.emit("play"); first.emit("timeupdate", { seconds: 1, duration: 5 }); });
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(first.off).toHaveBeenCalledTimes(6);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open tutorial" }));
    await screen.findByTitle("SureLC walkthrough");
    const resumed = FakePlayer.current;
    act(() => {
      resumed.emit("ready"); resumed.emit("play");
      for (let seconds = 2; seconds <= 5; seconds++) resumed.emit("timeupdate", { seconds, duration: 5 });
      resumed.emit("ended");
    });
    expect(resumed.setCurrentTime).toHaveBeenCalledWith(1);
    expect(screen.getByText("SureLC accounts unlocked")).toBeInTheDocument();
    expect(FakePlayer.current).toBe(resumed);
    expect(resumed.off).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("test-session")).toBe("5");
    expect(sessionStorage.getItem("test-session:replay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(resumed.off).toHaveBeenCalledTimes(6);
    fireEvent.click(screen.getByRole("button", { name: "Open tutorial" }));
    await screen.findByTitle("SureLC walkthrough");
    act(() => { FakePlayer.current.emit("ready"); });
    expect(FakePlayer.current.setCurrentTime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.getByText("SureLC accounts unlocked")).toBeInTheDocument();
  });

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
