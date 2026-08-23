import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AgentBusinessCardDownload from "@/components/AgentBusinessCardDownload";
import { downloadAgentBusinessCardPdf } from "@/lib/agent-business-card-pdf";
import { loadOwnProfilePhotoForBusinessCard } from "@/lib/agent-business-card-photo";

vi.mock("@/lib/agent-business-card-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-business-card-pdf")>();
  return { ...actual, downloadAgentBusinessCardPdf: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/agent-business-card-photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-business-card-photo")>();
  return { ...actual, loadOwnProfilePhotoForBusinessCard: vi.fn().mockResolvedValue(null) };
});

const PROFILE_PHOTO = { pngBytes: new Uint8Array([137, 80, 78, 71]) };

describe("AgentBusinessCardDownload", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadOwnProfilePhotoForBusinessCard).mockResolvedValue(null);
  });

  it("locks the PDF download until a valid phone is saved", () => {
    render(
      <AgentBusinessCardDownload
        userId="agent-1"
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
        workEmailVerified
        phoneNumber="000-000-0000"
      />,
    );

    expect(screen.getByRole("button", { name: "Download PDF business card for Avery Rivera" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/add a valid phone number below and save your profile/i);
    expect(screen.getByLabelText("Business card preview for Avery Rivera")).toHaveTextContent("Phone required");
    expect(screen.getByText(/home address and onboarding data stay private/i)).toBeInTheDocument();
  });

  it("downloads the PDF when name, verified work email, and phone are complete", async () => {
    render(
      <AgentBusinessCardDownload
        userId="agent-1"
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
        workEmailVerified
        phoneNumber="555-555-0100"
        profilePhotoPath="agent-1/avatar.jpg"
        profilePhotoUrl="https://storage.example/agent-1/avatar.jpg"
        profileUpdatedAt="2026-08-24T00:00:00.000Z"
      />,
    );

    vi.mocked(loadOwnProfilePhotoForBusinessCard).mockResolvedValueOnce(PROFILE_PHOTO);

    expect(screen.getByRole("img", { name: "Profile portrait of Avery Rivera" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download PDF business card for Avery Rivera" }));

    await waitFor(() => expect(loadOwnProfilePhotoForBusinessCard).toHaveBeenCalledWith({
      userId: "agent-1",
      profilePhotoPath: "agent-1/avatar.jpg",
      profileUpdatedAt: "2026-08-24T00:00:00.000Z",
    }));
    await waitFor(() => expect(downloadAgentBusinessCardPdf).toHaveBeenCalledWith({
      firstName: "Avery",
      lastName: "Rivera",
      workEmail: "avery.rivera@thepncl.com",
      workEmailVerified: true,
      phoneNumber: "555-555-0100",
      profilePhoto: PROFILE_PHOTO,
    }));
  });

  it("downloads with a branded portrait fallback when no safe photo can load", async () => {
    render(
      <AgentBusinessCardDownload
        userId="agent-1"
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
        workEmailVerified
        phoneNumber="555-555-0100"
      />,
    );

    expect(screen.getByLabelText("Branded initials placeholder for Avery Rivera")).toHaveTextContent("AR");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF business card for Avery Rivera" }));

    await waitFor(() => expect(downloadAgentBusinessCardPdf).toHaveBeenCalledWith(expect.objectContaining({
      profilePhoto: null,
    })));
  });

  it("replaces a saved-photo preview with the branded fallback after an image error", () => {
    render(
      <AgentBusinessCardDownload
        userId="agent-1"
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
        workEmailVerified
        phoneNumber="555-555-0100"
        profilePhotoPath="agent-1/avatar.webp"
        profilePhotoUrl="https://storage.example/agent-1/avatar.webp"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Profile portrait of Avery Rivera" }));

    expect(screen.getByLabelText("Branded initials placeholder for Avery Rivera")).toHaveTextContent("AR");
  });
});
