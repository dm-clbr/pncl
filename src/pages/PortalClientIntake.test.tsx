import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_INTAKE_STEPS } from "@/lib/client-intake";
import PortalClientIntake from "@/pages/PortalClientIntake";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "agent-1", email: "agent@thepncl.com" } }),
}));
vi.mock("@/hooks/usePortalProfile", () => ({
  usePortalProfile: () => ({
    profile: null,
    photoUrl: null,
    initials: "PG",
    displayName: "Porter Gerlach",
    loading: false,
  }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => ({}) }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PortalClientIntake />
    </MemoryRouter>,
  );


const STEP_BY_QUESTION = new Map(CLIENT_INTAKE_STEPS.map((step) => [step.question, step]));

/** setStepValue formats phones, SSNs and dates, so digits are enough. */
const answerFor = (key: string) => {
  if (/Phone/i.test(key)) return "8015550137";
  if (/Ssn/i.test(key)) return "111223333";
  if (/Dob|dateMet|effDate/i.test(key)) return "01021990";
  if (/Email/i.test(key)) return "dana@example.com";
  return "Test answer";
};

/** Walks the wizard to the review screen, answering whatever control is on
    screen. "No" on every yes/no keeps the conditional branches out. */
const answerEveryStep = () => {
  for (let guard = 0; guard < 300; guard += 1) {
    if (screen.queryByRole("button", { name: "Save client" })) return;
    const heading = screen
      .getAllByRole("heading")
      .map((node) => node.textContent ?? "")
      .find((text) => STEP_BY_QUESTION.has(text));
    const step = heading ? STEP_BY_QUESTION.get(heading)! : null;
    if (!step) throw new Error(`No known question on screen: ${document.title}`);

    if (step.type === "yesno") {
      const options = step.options ?? ["Yes", "No"];
      const label = options.includes("No") ? "No" : options[0];
      fireEvent.click(screen.getByRole("button", { name: label }));
      act(() => void vi.advanceTimersByTime(600));
      continue;
    }
    if (step.type === "select") {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: step.options![0] } });
      act(() => void vi.advanceTimersByTime(600));
      continue;
    }
    if (step.type === "dual") {
      const [height, weight] = screen.getAllByRole("textbox");
      fireEvent.change(height, { target: { value: "5 ft 6 in" } });
      fireEvent.change(weight, { target: { value: "148" } });
    } else {
      const field = screen.queryAllByRole("textbox")[0]
        ?? document.querySelector<HTMLInputElement>("#intake-input")!;
      fireEvent.change(field, { target: { value: answerFor(String(step.key)) } });
    }
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Review form)$/ }));
    act(() => void vi.advanceTimersByTime(400));
  }
  throw new Error("Never reached the review screen");
};

describe("PortalClientIntake", () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  afterEach(() => vi.clearAllTimers());

  it("opens on the intro with the three stages and the start action", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Client intake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Client intake form" })).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Intake stages" });
    expect(stages).toHaveTextContent("Script");
    expect(stages).toHaveTextContent("Form");
    expect(stages).toHaveTextContent("Review");
    expect(screen.getByRole("button", { name: "Start intake" })).toBeInTheDocument();
  });

  it("shows one question with a counter and a gated Continue once started", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText(/^Step 1 of /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("enables Continue when the answer satisfies the existing validation", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dana Whitfield" } });
    expect(screen.getByRole("button", { name: "Continue" }))
      .toHaveAttribute("aria-disabled", "false");
  });

  it("keeps a pristine required question clean, then announces the error on submit", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

    // Pristine: the copy is not rendered and nothing is marked invalid.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");

    // Answer, advance, come back: Back exists on step 2.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dana Whitfield" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByText(/^Step 2 of /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    act(() => void vi.advanceTimersByTime(400));

    // Clear it and try to advance: the message appears, wired to the control.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This field is required.");
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByText(/^Step 1 of /)).toBeInTheDocument();
  });

  it("reaches the review screen, groups the answers and edits one", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));
    answerEveryStep();

    // Stage 3 of the stepper, both review Panes, and the save action.
    const stages = screen.getByRole("list", { name: "Intake stages" });
    expect(within(stages).getByText("Review").closest("li"))
      .toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "Pinnacle form preview" })).toBeInTheDocument();
    const answers = screen.getByRole("heading", { name: "Answers" }).closest("section")!;
    // Grouped by section, not one flat list.
    expect(within(answers).getAllByText("Edit").length).toBeGreaterThan(1);
    expect(within(answers).getAllByRole("group").length).toBeGreaterThan(1);

    // Edit jumps back to that answer's step.
    fireEvent.click(within(answers).getAllByText("Edit")[0]);
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole("button", { name: "Back to review" })).toBeInTheDocument();
  });
});
