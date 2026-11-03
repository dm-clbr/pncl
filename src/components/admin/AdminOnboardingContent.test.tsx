import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import AdminOnboardingContent from "./AdminOnboardingContent";
describe("single onboarding content editor", () => {
  it("directs legacy entry points to Onboarding Steps without an alternate upload control", () => {
    render(<MemoryRouter><AdminOnboardingContent todos={[]} onSaved={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Open Onboarding Steps" })).toHaveAttribute("href", "/portal/admin/onboarding-steps");
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
