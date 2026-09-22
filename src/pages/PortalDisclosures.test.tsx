import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalDisclosures from "@/pages/PortalDisclosures";
import {
  acknowledgeDisclosure,
  fetchAcknowledgedDisclosureKeys,
  fetchPortalDisclosures,
  type PortalDisclosure,
} from "@/lib/portal-disclosures";

const authState = vi.hoisted(() => ({ user: { id: "agent-1" } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));
vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({ photoUrl: null, initials: "TA", displayName: "Test Agent", loading: false }),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("@/lib/portal-disclosures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-disclosures")>();
  return {
    ...actual,
    acknowledgeDisclosure: vi.fn(),
    fetchAcknowledgedDisclosureKeys: vi.fn(),
    fetchPortalDisclosures: vi.fn(),
  };
});

const moduleRecord: PortalDisclosure = {
  id: "module-1",
  slug: "disclosure_1",
  title: "Day 1: Welcome",
  description: "Training module",
  video_url: "https://www.youtube.com/watch?v=pd2a8WCC8cs",
  sort_order: 1,
  content_version: 3,
};

function renderPage() {
  return render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);
}

describe("PortalDisclosures", () => {
  beforeEach(() => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set());
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([moduleRecord]);
    vi.mocked(acknowledgeDisclosure).mockResolvedValue();
  });

  it("holds the player behind a poster facade until it is played", async () => {
    renderPage();

    const facade = await screen.findByRole("button", { name: "Play Day 1: Welcome" });
    expect(screen.queryByTitle("Day 1: Welcome video")).not.toBeInTheDocument();
    expect(facade.querySelector("img")).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/pd2a8WCC8cs/hqdefault.jpg",
    );

    fireEvent.click(facade);

    expect(screen.getByTitle("Day 1: Welcome video")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/pd2a8WCC8cs?autoplay=1&playsinline=1",
    );
  });

  it("records the exact content version when the module is acknowledged", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "I completed this training" }));

    await waitFor(() => {
      expect(acknowledgeDisclosure).toHaveBeenCalledWith("agent-1", "module-1", 3);
    });
  });

  it("shows a current-version acknowledgment as complete", async () => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set(["module-1:3"]));

    renderPage();

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 modules acknowledged")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I completed this training" }))
      .not.toBeInTheDocument();
  });

  it("does not allow a module without a video to be acknowledged", async () => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set(["module-1:3"]));
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([{ ...moduleRecord, video_url: null }]);

    renderPage();

    expect(await screen.findByText(/can be acknowledged after the training is available/i))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /completed this training/i }))
      .not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 modules acknowledged")).toBeInTheDocument();
  });

  it("keeps the loading state as a skeleton of the list", () => {
    vi.mocked(fetchPortalDisclosures).mockReturnValue(new Promise(() => undefined));

    renderPage();

    // The announcement comes from the content: every Skeleton is aria-hidden.
    expect(screen.getByRole("status")).toHaveTextContent("Loading your training modules");
  });

  it("keeps the empty state", async () => {
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("No training modules are published yet")).toBeInTheDocument();
    expect(screen.getByText("Check back soon.")).toBeInTheDocument();
  });

  it("keeps the error state", async () => {
    vi.mocked(fetchPortalDisclosures).mockRejectedValue(new Error("Unable to load disclosures."));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load disclosures.");
  });
});
