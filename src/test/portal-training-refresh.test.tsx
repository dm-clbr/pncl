import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalDisclosures from "@/pages/PortalDisclosures";
import {
  fetchAcknowledgedDisclosureKeys,
  fetchPortalDisclosures,
  syncPortalTrainingVideos,
  type PortalDisclosure,
} from "@/lib/portal-disclosures";

const authState = vi.hoisted(() => ({ role: "admin" }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "agent-1", app_metadata: { role: authState.role } },
    session: { access_token: "portal-token" },
  }),
}));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/portal-disclosures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portal-disclosures")>();
  return {
    ...actual,
    fetchAcknowledgedDisclosureKeys: vi.fn(),
    fetchPortalDisclosures: vi.fn(),
    syncPortalTrainingVideos: vi.fn(),
  };
});

const moduleRecord: PortalDisclosure = {
  id: "module-1",
  slug: "disclosure_1",
  title: "Day 1: Welcome",
  description: "Training module",
  video_url: "https://www.youtube.com/watch?v=pd2a8WCC8cs",
  sort_order: 1,
  content_version: 1,
};

describe("video training refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "admin";
    vi.mocked(fetchAcknowledgedDisclosureKeys).mockResolvedValue(new Set());
    vi.mocked(fetchPortalDisclosures).mockResolvedValue([moduleRecord]);
    vi.mocked(syncPortalTrainingVideos).mockResolvedValue({
      synced: true,
      channelId: "UCrfJuBtosbhhTNiA7lLW8og",
      found: 15,
      added: 2,
      checkedAt: "2026-09-22T22:45:00.000Z",
    });
  });

  it("checks the PNCL channel and reloads the training catalog", async () => {
    render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);

    const refresh = await screen.findByRole("button", { name: "Check for new videos" });
    fireEvent.click(refresh);

    await waitFor(() => {
      expect(syncPortalTrainingVideos).toHaveBeenCalledWith("portal-token");
      expect(fetchPortalDisclosures).toHaveBeenCalledTimes(2);
    });
  });

  it("does not show the company-wide sync control to agents", async () => {
    authState.role = "agent";
    render(<MemoryRouter><PortalDisclosures /></MemoryRouter>);

    expect(await screen.findByText("Day 1: Welcome")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for new videos" })).not.toBeInTheDocument();
  });
});
