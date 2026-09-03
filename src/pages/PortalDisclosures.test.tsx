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

describe("PortalDisclosures", () => {
  beforeEach(() => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set());
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([moduleRecord]);
    vi.mocked(acknowledgeDisclosure).mockResolvedValue();
  });

  it("renders the training video and records its exact content version", async () => {
    render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);

    expect(await screen.findByTitle("Day 1: Welcome video")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/pd2a8WCC8cs",
    );
    fireEvent.click(screen.getByRole("button", { name: "I completed this training" }));

    await waitFor(() => {
      expect(acknowledgeDisclosure).toHaveBeenCalledWith("agent-1", "module-1", 3);
    });
  });

  it("shows a current-version acknowledgment as complete", async () => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set(["module-1:3"]));

    render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);

    expect(await screen.findByText("You've acknowledged this disclosure.")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 modules acknowledged")).toBeInTheDocument();
  });

  it("does not allow a module without a video to be acknowledged", async () => {
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set(["module-1:3"]));
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([{ ...moduleRecord, video_url: null }]);

    render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);

    expect(await screen.findByText(/can be acknowledged after the training is available/i))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /completed this training/i }))
      .not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 modules acknowledged")).toBeInTheDocument();
  });
});
