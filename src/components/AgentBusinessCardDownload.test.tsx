import { fireEvent, render, screen } from "@testing-library/react";
import AgentBusinessCardDownload from "@/components/AgentBusinessCardDownload";

describe("AgentBusinessCardDownload", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("offers an accessible .vcf download and excludes private data in its explanation", () => {
    vi.useFakeTimers();
    const createObjectUrl = vi.fn(() => "blob:agent-card");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <AgentBusinessCardDownload
        firstName="Avery"
        lastName="Rivera"
        workEmail="avery.rivera@thepncl.com"
      />,
    );

    const button = screen.getByRole("button", {
      name: "Download digital business card for Avery Rivera as a vCard file",
    });
    expect(button).toHaveAccessibleDescription(/home address and private onboarding details are not included/i);

    fireEvent.click(button);

    expect(createObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ type: "text/vcard;charset=utf-8" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.instances[0]).toMatchObject({
      download: "avery-rivera-pncl.vcf",
      href: "blob:agent-card",
    });
    vi.runAllTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:agent-card");
  });

  it("disables the action when neither a name nor work email is available", () => {
    render(<AgentBusinessCardDownload />);

    expect(screen.getByRole("button", {
      name: "Download digital business card for this agent as a vCard file",
    })).toBeDisabled();
  });
});
