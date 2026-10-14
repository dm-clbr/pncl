import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import PortalNoticeBanner from "@/components/PortalNoticeBanner";

const KEY = "portal-notice-dismissed:recovery-missing";

function renderBanner(dismissKey?: string) {
  return render(
    <MemoryRouter>
      <PortalNoticeBanner
        role="status"
        icon={<svg aria-hidden="true" />}
        title="Add your personal recovery email"
        body="Add a personal email so you can recover your PNCL Google account."
        href="/portal/profile?tab=details"
        cta="Add recovery email"
        dismissKey={dismissKey}
      />
    </MemoryRouter>,
  );
}

describe("PortalNoticeBanner", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("renders the title, body and link, with no Dismiss when there is no key", () => {
    renderBanner();

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Add your personal recovery email");
    expect(banner).toHaveTextContent(
      "Add a personal email so you can recover your PNCL Google account.",
    );
    expect(screen.getByRole("link", { name: "Add recovery email" })).toHaveAttribute(
      "href",
      "/portal/profile?tab=details",
    );
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("hides on Dismiss and remembers it in sessionStorage", () => {
    renderBanner(KEY);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");
  });

  it("renders nothing when the session already dismissed it", () => {
    window.sessionStorage.setItem(KEY, "1");

    const { container } = renderBanner(KEY);

    expect(container).toBeEmptyDOMElement();
  });
});
