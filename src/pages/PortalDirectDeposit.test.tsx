import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalDirectDeposit from "@/pages/PortalDirectDeposit";

const ddState = vi.hoisted(() => ({
  directDeposit: null as { legalName: string; signedAt: string; pdfPath: string } | null,
  submitted: false,
  loading: true,
}));

/** One frozen object: the page's prefill effect keys on the user's identity, so
    a fresh literal per render would re-fetch forever. */
const authState = vi.hoisted(() => ({
  user: { id: "agent-1", email: "agent@thepncl.com", user_metadata: { full_name: "Test Agent" } },
  session: { access_token: "token-1" },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));

vi.mock("@/hooks/usePortalDirectDeposit", () => ({
  usePortalDirectDeposit: () => ({ ...ddState, setDirectDeposit: vi.fn() }),
}));

vi.mock("@/lib/portal-profile", () => ({
  fetchPortalProfile: vi.fn().mockResolvedValue({ first_name: "Test", last_name: "Agent" }),
}));

vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** Only the Supabase-backed calls are stubbed; the validator, the digit
    formatters and the defaults are the shipped ones, because the focus-first
    -error mapping is read off their real messages. */
vi.mock("@/lib/portal-direct-deposit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal-direct-deposit")>()),
  getDirectDepositPdfUrl: vi.fn().mockResolvedValue("https://files.example/dd.pdf"),
  submitPortalDirectDeposit: vi.fn(),
}));

/** The page resolves its prefill fetch on mount, so the mount is flushed inside
    act(): otherwise every test logs an update-outside-act warning. */
const renderPage = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <PortalDirectDeposit />
      </MemoryRouter>,
    );
  });
};

const submitForm = () => {
  const form = document.querySelector("form.pforms-dd");
  if (!form) throw new Error("form not rendered");
  fireEvent.submit(form);
};

describe("PortalDirectDeposit", () => {
  beforeEach(() => {
    ddState.directDeposit = null;
    ddState.submitted = false;
    ddState.loading = true;
  });

  it("keeps the loading state and carries exactly one h1", async () => {
    await renderPage();

    expect(screen.getByText("Loading direct deposit form...")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Direct deposit" })).toBeInTheDocument();
  });

  it("keeps the submitted state, its date and the PDF download", async () => {
    ddState.loading = false;
    ddState.submitted = true;
    ddState.directDeposit = {
      legalName: "Test Agent",
      signedAt: "2026-03-04T00:00:00.000Z",
      pdfPath: "dd/agent-1.pdf",
    };

    await renderPage();

    expect(screen.getByRole("heading", { name: "Direct deposit on file" })).toBeInTheDocument();
    expect(screen.getByText(/was submitted/)).toHaveTextContent("Test Agent");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Download signed PDF/ })).toHaveAttribute(
        "href",
        "https://files.example/dd.pdf",
      ),
    );
  });

  it("stacks the fields in one column with the right inputmode and autocomplete", async () => {
    ddState.loading = false;

    await renderPage();

    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText(/^City/)).toHaveAttribute("autocomplete", "address-level2");
    expect(screen.getByLabelText(/^ZIP code/)).toHaveAttribute("inputmode", "numeric");

    const routing = screen.getByLabelText(/routing number/);
    expect(routing).toHaveAttribute("inputmode", "numeric");
    expect(routing).toHaveAttribute("autocomplete", "off");

    const account = screen.getByLabelText(/account number/);
    expect(account).toHaveAttribute("inputmode", "numeric");
    expect(account).toHaveAttribute("autocomplete", "off");
  });

  it("puts a validation error next to its own field and focuses it", async () => {
    ddState.loading = false;

    await renderPage();

    // Prefilled from the profile, so the first failing field is the address.
    submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent("Address is required.");
    expect(screen.getByLabelText(/^Address/)).toHaveFocus();
    expect(screen.getByLabelText(/^Address/)).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText(/^Address/), { target: { value: "1 Main St" } });
    fireEvent.change(screen.getByLabelText(/^City/), { target: { value: "Provo" } });
    fireEvent.change(screen.getByLabelText(/^State/), { target: { value: "UT" } });
    fireEvent.change(screen.getByLabelText(/^ZIP code/), { target: { value: "84601" } });
    fireEvent.change(screen.getByLabelText(/bank's name/), { target: { value: "Example Bank" } });
    fireEvent.change(screen.getByLabelText(/account number/), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText(/routing number/), { target: { value: "123" } });

    // The editing cleared the first error; a short routing number is the next.
    submitForm();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid 9-digit routing number.");
    expect(screen.getByLabelText(/routing number/)).toHaveFocus();
  });
});
