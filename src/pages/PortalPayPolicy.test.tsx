import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalPayPolicy from "@/pages/PortalPayPolicy";
import { fetchPayPolicyEntries, type PayPolicyEntry } from "@/lib/portal-pay-policy";

vi.mock("@/lib/portal-pay-policy", () => ({ fetchPayPolicyEntries: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

const entry = (id: string, category: PayPolicyEntry["category"]): PayPolicyEntry => ({
  id,
  title: category === "policy" ? "Advance and chargeback" : "When does my first commission hit?",
  body: category === "policy" ? "PNCL advances 75%." : "Two to three weeks after issue.",
  category,
  sort_order: 1,
  published: true,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalPayPolicy />
    </MemoryRouter>,
  );

describe("PortalPayPolicy", () => {
  beforeEach(() => {
    vi.mocked(fetchPayPolicyEntries).mockReset();
  });

  it("keeps the loading state", () => {
    vi.mocked(fetchPayPolicyEntries).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByLabelText("Loading pay policies")).toBeInTheDocument();
  });

  it("keeps the error state", async () => {
    vi.mocked(fetchPayPolicyEntries).mockRejectedValue(new Error("Unable to load content."));
    renderPage();
    expect(await screen.findByText("Unable to load content.")).toBeInTheDocument();
  });

  it("keeps the empty state as one pane with the support call to action", async () => {
    vi.mocked(fetchPayPolicyEntries).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Pay policies are being finalized")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a support ticket" })).toHaveAttribute(
      "href",
      "/portal/support",
    );
  });

  it("gives the restored pay policies heading the pane title style and opens FAQs natively", async () => {
    vi.mocked(fetchPayPolicyEntries).mockResolvedValue([entry("p1", "policy"), entry("f1", "faq")]);
    renderPage();

    const heading = await screen.findByRole("heading", { name: "Pay policies" });
    expect(heading.tagName).toBe("H2");
    expect(heading).toHaveClass("portal-pane-title");

    expect(screen.getByRole("heading", { name: "Advance and chargeback" }).tagName).toBe("H3");

    const summary = screen.getByText("When does my first commission hit?").closest("summary");
    expect(summary).not.toBeNull();
    expect(summary?.parentElement?.tagName).toBe("DETAILS");
  });
});
