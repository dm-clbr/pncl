import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentOnboarding from "@/pages/AgentOnboarding";
import { persistContractSession } from "@/lib/onboarding-contract";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { access_token: "preview-token" } }) }));
vi.mock("@/hooks/useOnboardingContent", () => ({ useOnboardingContent: () => ({ content: { designation: "ibo", ica: null, welcomeVideo: null, surelcVideo: null }, loading: false }) }));
vi.mock("@/components/OnboardingContractStep", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn(), trackApplicationSubmitted: vi.fn() }));
vi.mock("@/lib/us-zip-county", () => ({ lookupCountyFromZip: async () => "Denver" }));

const tick = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };
async function click(name: string | RegExp) { fireEvent.click(screen.getByRole("button", { name })); await tick(); }
async function fill(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
  await click(/Continue/);
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  persistContractSession("test-signature", "Sample Agent", "sample@example.invalid", true);
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("Image", class { onerror?: () => void; set src(_value: string) { this.onerror?.(); } });
  vi.stubGlobal("FileReader", class {
    result = "data:image/jpeg;base64,dGVzdA==";
    onload?: () => void;
    readAsDataURL() { this.onload?.(); }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function reachImoQuestion() {
  const view = render(<MemoryRouter><AgentOnboarding preview previewDesignation="ibo" /></MemoryRouter>);
  await fill("111-222-3333", "555-555-0100");
  await fill("mm/dd/yyyy", "01/15/1990");
  await fill("111-22-3333", "111-22-3333");
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "CO" } }); await tick();
  await fill("123 Main St, Apt 4", "123 Test Street");
  await fill("City", "Denver");
  await fill("12345", "80202");
  await act(async () => { fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], "license.jpg", { type: "image/jpeg" })] } }); });
  await click(/Continue/);
  await click(/Skip for now/);
  await fill("Team leader name", "Sample Team");
  await click("No");
  await click(/Continue/);
  await click("No");
  expect(screen.getByRole("heading", { name: "Are you currently contracted with another IMO?" })).toBeInTheDocument();
}

describe("agent transfer details", () => {
  it("stays on Yes until both details are valid, includes them in review, and clears them on No", async () => {
    await reachImoQuestion();
    expect(screen.queryByLabelText("IMO name")).not.toBeInTheDocument();
    await click("Yes");
    const review = screen.getByRole("button", { name: /Review application/ });
    expect(review).toBeDisabled();
    fireEvent.change(screen.getByLabelText("IMO name"), { target: { value: "Sample IMO" } });
    expect(review).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Carriers you’re contracted with"), { target: { value: "Foresters\nMutual of Omaha" } });
    expect(review).toBeEnabled();
    await click(/Review application/);
    expect(screen.getByRole("heading", { name: "Check your answers" })).toBeInTheDocument();
    expect(screen.getByText("Sample IMO")).toBeInTheDocument();
    expect(screen.getByText(/Foresters/)).toHaveTextContent("Mutual of Omaha");
    const row = screen.getByText("Are you currently contracted with another IMO?").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" })); await tick();
    await click("No");
    expect(screen.getByRole("heading", { name: "Check your answers" })).toBeInTheDocument();
    expect(screen.queryByText("Sample IMO")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByText("Are you currently contracted with another IMO?").closest("li")!).getByRole("button", { name: "Edit" })); await tick();
    await click("Yes");
    expect(screen.getByLabelText("IMO name")).toHaveValue("");
    expect(screen.getByLabelText("Carriers you’re contracted with")).toHaveValue("");
  });
});
