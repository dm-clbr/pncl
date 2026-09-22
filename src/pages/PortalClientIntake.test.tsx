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
        ?? document.querySelector<HTMLInputElement>('[id^="intake-"]')!;
      fireEvent.change(field, { target: { value: answerFor(String(step.key)) } });
    }
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Review form)$/ }));
    act(() => void vi.advanceTimersByTime(400));
  }
  throw new Error("Never reached the review screen");
};

/** matchMedia stub that reports the desktop breakpoint as matching. */
const desktopMatchMedia = (query: string) => ({
  matches: query === "(min-width: 621px)",
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

/** The steps rendered on the current screen, in screen order. */
const screenSteps = () =>
  screen
    .getAllByRole("heading")
    .map((node) => STEP_BY_QUESTION.get(node.textContent ?? ""))
    .filter((step): step is NonNullable<typeof step> => !!step);

/** Fills every text-like question on the current screen, leaving yes/no and
    select questions alone. */
const fillTextQuestions = () => {
  const controls = document.querySelectorAll(".pintake-control");
  screenSteps().forEach((step, offset) => {
    const root = controls[offset];
    if (!root || step.type === "yesno" || step.type === "select") return;
    const inputs = root.querySelectorAll<HTMLElement>("input, textarea");
    if (step.type === "dual") {
      fireEvent.change(inputs[0], { target: { value: "5 ft 6 in" } });
      fireEvent.change(inputs[1], { target: { value: "148" } });
      return;
    }
    fireEvent.change(inputs[0], { target: { value: answerFor(String(step.key)) } });
  });
};

const choiceButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>(".pintake-option"));

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

  it("puts three questions on one desktop screen and advances past all of them", () => {
    const desktop = (query: string) => ({
      matches: query === "(min-width: 621px)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { writable: true, value: desktop });
    try {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

      // Three questions, three counters, one action bar.
      const fields = screen.getAllByRole("textbox");
      expect(fields).toHaveLength(3);
      expect(screen.getByText(/^Step 1 of /)).toBeInTheDocument();
      expect(screen.getByText(/^Step 3 of /)).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^(Continue|Review form)$/ })).toHaveLength(1);

      // Continue stays gated until every question on the screen is answered.
      fireEvent.change(fields[0], { target: { value: "Dana Whitfield" } });
      expect(screen.getByRole("button", { name: "Continue" }))
        .toHaveAttribute("aria-disabled", "true");
      fireEvent.change(fields[1], { target: { value: "45" } });
      fireEvent.change(fields[2], { target: { value: "01021990" } });
      expect(screen.getByRole("button", { name: "Continue" }))
        .toHaveAttribute("aria-disabled", "false");

      // One advance clears all three: the next screen starts at step 4.
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      act(() => void vi.advanceTimersByTime(400));
      expect(screen.getByText(/^Step 4 of /)).toBeInTheDocument();

      // Back returns to the screen that held steps 1 to 3.
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      act(() => void vi.advanceTimersByTime(400));
      expect(screen.getByText(/^Step 1 of /)).toBeInTheDocument();
      expect(screen.getByText(/^Step 3 of /)).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", { writable: true, value: original });
    }
  });

  it("does not auto-advance a desktop yes/no while earlier questions are blank", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { writable: true, value: desktopMatchMedia });
    try {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Start intake" }));

      // Walk to the first desktop screen that pairs text questions with a yes/no.
      let guard = 0;
      while (
        !(screenSteps().some((step) => step.type === "yesno")
          && screenSteps().some((step) => step.type !== "yesno" && step.type !== "select"))
      ) {
        if (guard++ > 60) throw new Error("No mixed text + yes/no screen in the step table");
        fillTextQuestions();
        const options = choiceButtons();
        const select = screen.queryByRole("combobox");
        if (options.length > 0) {
          fireEvent.click(options.find((b) => b.textContent === "No") ?? options[0]);
          act(() => void vi.advanceTimersByTime(600));
        } else if (select) {
          const step = screenSteps().find((entry) => entry.type === "select")!;
          fireEvent.change(select, { target: { value: step.options![0] } });
          act(() => void vi.advanceTimersByTime(600));
        } else {
          fireEvent.click(screen.getByRole("button", { name: /^(Continue|Review form)$/ }));
          act(() => void vi.advanceTimersByTime(400));
        }
      }

      /* Step number only: a Yes answer can reveal a branch and change the total. */
      const stepNumber = () => document.querySelector(".pintake-count")!.textContent!.split(" of ")[0];
      const counter = stepNumber();
      const blanks = screen.getAllByRole("textbox").length;
      expect(blanks).toBeGreaterThan(0);

      // Answering the yes/no first must not skip the blank questions above it.
      fireEvent.click(choiceButtons()[0]);
      act(() => void vi.advanceTimersByTime(600));
      expect(stepNumber()).toBe(counter);
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /^(Continue|Review form)$/ }))
        .toHaveAttribute("aria-disabled", "true");

      // Once the text questions are answered, Continue moves the whole screen.
      fillTextQuestions();
      const advance = screen.getByRole("button", { name: /^(Continue|Review form)$/ });
      expect(advance).toHaveAttribute("aria-disabled", "false");
      fireEvent.click(advance);
      act(() => void vi.advanceTimersByTime(400));
      expect(stepNumber()).not.toBe(counter);
    } finally {
      Object.defineProperty(window, "matchMedia", { writable: true, value: original });
    }
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
