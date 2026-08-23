import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AgentBusinessCardDownload from "@/components/AgentBusinessCardDownload";
import { downloadAgentBusinessCardPdf } from "@/lib/agent-business-card-pdf";

vi.mock("@/lib/agent-business-card-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-business-card-pdf")>();
  return { ...actual, downloadAgentBusinessCardPdf: vi.fn().mockResolvedValue(undefined) };
});

describe("AgentBusinessCardDownload", () => {
  afterEach(() => vi.clearAllMocks());

  it("locks the PDF download until a valid phone is saved", () => {
    render(
      <AgentBusinessCardDownload
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
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
        workEmailVerified
        phoneNumber="555-555-0100"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download PDF business card for Avery Rivera" }));

    await waitFor(() => expect(downloadAgentBusinessCardPdf).toHaveBeenCalledWith({
      firstName: "Avery",
      lastName: "Rivera",
      workEmail: "avery.rivera@thepncl.com",
      workEmailVerified: true,
      phoneNumber: "555-555-0100",
    }));
  });
});
