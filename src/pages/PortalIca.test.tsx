import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { forwardRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalIca from "@/pages/PortalIca";

const icaState = vi.hoisted(() => ({
  ica: null as { legalName: string; signedAt: string } | null,
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

vi.mock("@/hooks/usePortalIca", () => ({
  usePortalIca: () => ({ ...icaState, setIca: vi.fn() }),
}));

vi.mock("@/lib/portal-profile", () => ({
  fetchPortalProfile: vi.fn().mockResolvedValue({ first_name: "Test", last_name: "Agent" }),
}));

vi.mock("@/lib/portal-ica", () => ({
  fetchPortalIcaDocument: vi.fn().mockResolvedValue({ downloadUrl: "https://files.example/ica.pdf" }),
  getDefaultIcaPrefill: () => ({ legalName: "Test Agent", email: "agent@example.com" }),
  submitPortalIca: vi.fn(),
}));

vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

/** pdf.js never runs in jsdom: it fetches a real PDF and builds its own canvas
    stack. The stub keeps the chrome contract, so the pager slot and the page
    callback stay covered. */
vi.mock("@/components/IcaFillablePdfViewer", () => ({
  default: forwardRef<unknown, { actions?: ReactNode; onPageChange?: (page: number) => void }>(
    function IcaFillablePdfViewerStub({ actions, onPageChange }, _ref) {
      return (
        <div data-testid="ica-viewer">
          <button type="button" onClick={() => onPageChange?.(14)}>
            stub: reach page 14
          </button>
          <div data-testid="ica-viewer-actions">{actions}</div>
        </div>
      );
    },
  ),
}));

/** The page resolves its prefill fetch on mount, so the mount is flushed inside
    act(): otherwise every test logs an update-outside-act warning. */
const renderPage = async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <PortalIca />
      </MemoryRouter>,
    );
  });
};

describe("PortalIca", () => {
  beforeEach(() => {
    icaState.ica = null;
    icaState.submitted = false;
    icaState.loading = true;
  });

  it("keeps the loading state and carries exactly one h1", async () => {
    await renderPage();

    expect(screen.getByText("Loading agreement...")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Independent Contractor Agreement" }),
    ).toBeInTheDocument();
  });

  it("keeps the signed state, its date and the PDF download", async () => {
    icaState.loading = false;
    icaState.submitted = true;
    icaState.ica = { legalName: "Test Agent", signedAt: "2026-03-04T00:00:00.000Z" };

    await renderPage();

    expect(screen.getByRole("heading", { name: "Agreement on file" })).toBeInTheDocument();
    expect(screen.getByText(/was signed on/)).toHaveTextContent("Test Agent");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Download signed PDF/ })).toHaveAttribute(
        "href",
        "https://files.example/ica.pdf",
      ),
    );
  });

  it("holds the Sign button back until the last page has been reached", async () => {
    icaState.loading = false;

    await renderPage();

    await screen.findByTestId("ica-viewer");
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "stub: reach page 14" }));

    expect(screen.getByRole("button", { name: "Sign" })).toBeInTheDocument();
  });
});
