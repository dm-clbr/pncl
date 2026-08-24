import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import AgentBusinessCardDownload from "@/components/AgentBusinessCardDownload";
import {
  canShareAgentBusinessCardPdfFile,
  createAgentBusinessCardPdfFile,
  downloadAgentBusinessCardPdf,
  downloadAgentBusinessCardPdfFile,
  shareAgentBusinessCardPdfFile,
} from "@/lib/agent-business-card-pdf";
import { loadOwnProfilePhotoForBusinessCard } from "@/lib/agent-business-card-photo";

vi.mock("@/lib/agent-business-card-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-business-card-pdf")>();
  return {
    ...actual,
    canShareAgentBusinessCardPdfFile: vi.fn(),
    createAgentBusinessCardPdfFile: vi.fn(),
    downloadAgentBusinessCardPdf: vi.fn(),
    downloadAgentBusinessCardPdfFile: vi.fn(),
    shareAgentBusinessCardPdfFile: vi.fn(),
  };
});

vi.mock("@/lib/agent-business-card-photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-business-card-photo")>();
  return { ...actual, loadOwnProfilePhotoForBusinessCard: vi.fn().mockResolvedValue(null) };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const PROFILE_PHOTO = { pngBytes: new Uint8Array([137, 80, 78, 71]) };
const PDF_FILE = new File(["pdf"], "avery-rivera-pncl-business-card.pdf", { type: "application/pdf" });

describe("AgentBusinessCardDownload", () => {
  beforeEach(() => {
    vi.mocked(canShareAgentBusinessCardPdfFile).mockReturnValue(true);
    vi.mocked(createAgentBusinessCardPdfFile).mockResolvedValue(PDF_FILE);
    vi.mocked(downloadAgentBusinessCardPdf).mockResolvedValue(undefined);
    vi.mocked(shareAgentBusinessCardPdfFile).mockResolvedValue(undefined);
  });

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
    expect(screen.getByRole("button", { name: "Share PDF business card for Avery Rivera" })).toBeDisabled();
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

  it("shares the generated PDF file on devices that support file sharing", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Share PDF business card for Avery Rivera" }));

    await waitFor(() => expect(createAgentBusinessCardPdfFile).toHaveBeenCalledWith(expect.objectContaining({
      profilePhoto: null,
    })));
    expect(canShareAgentBusinessCardPdfFile).toHaveBeenCalledWith(PDF_FILE);
    expect(shareAgentBusinessCardPdfFile).toHaveBeenCalledWith(PDF_FILE);
    expect(downloadAgentBusinessCardPdfFile).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("PDF business card shared.");
  });

  it("downloads the file with manual-attachment guidance when file sharing is unsupported", async () => {
    vi.mocked(canShareAgentBusinessCardPdfFile).mockReturnValue(false);

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

    expect(screen.getByText(/the pdf will download so you can attach it manually/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share PDF business card for Avery Rivera" }));

    await waitFor(() => expect(downloadAgentBusinessCardPdfFile).toHaveBeenCalledWith(PDF_FILE));
    expect(shareAgentBusinessCardPdfFile).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/attach it manually/i));
  });

  it("treats closing the native share sheet as a cancellation", async () => {
    vi.mocked(shareAgentBusinessCardPdfFile).mockRejectedValueOnce({ name: "AbortError" });

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

    const shareButton = screen.getByRole("button", { name: "Share PDF business card for Avery Rivera" });
    fireEvent.click(shareButton);

    await waitFor(() => expect(shareButton).toBeEnabled());
    expect(downloadAgentBusinessCardPdfFile).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("downloads the PDF when the native share sheet fails", async () => {
    vi.mocked(shareAgentBusinessCardPdfFile).mockRejectedValueOnce(new Error("Share failed"));

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

    fireEvent.click(screen.getByRole("button", { name: "Share PDF business card for Avery Rivera" }));

    await waitFor(() => expect(downloadAgentBusinessCardPdfFile).toHaveBeenCalledWith(PDF_FILE));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/downloaded so you can attach it manually/i));
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
