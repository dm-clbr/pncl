import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { forwardRef, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalW9 from "@/pages/PortalW9";

const w9State = vi.hoisted(() => ({
  w9: null as { legalName: string; submittedAt: string } | null,
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

vi.mock("@/hooks/usePortalW9", () => ({
  usePortalW9: () => ({ ...w9State, setW9: vi.fn() }),
}));

vi.mock("@/lib/portal-profile", () => ({
  fetchPortalProfile: vi.fn().mockResolvedValue({ first_name: "Test", last_name: "Agent" }),
}));

vi.mock("@/lib/portal-w9", () => ({
  fetchPortalW9Document: vi.fn().mockResolvedValue({ downloadUrl: "https://files.example/w9.pdf" }),
  getDefaultW9Values: () => ({ legalName: "Test Agent" }),
  submitPortalW9: vi.fn(),
}));

vi.mock("@/lib/portal-messages", () => ({ refreshPortalUser: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));

/** pdf.js never runs in jsdom: it fetches a real PDF and builds its own canvas
    stack. The stub keeps the chrome contract, so the pager's action slot stays
    covered. */
vi.mock("@/components/W9FillablePdfViewer", () => ({
  default: forwardRef<unknown, { actions?: ReactNode; onPageChange?: (page: number) => void }>(
    function W9FillablePdfViewerStub({ actions, onPageChange }, _ref) {
      return (
        <div data-testid="w9-viewer">
          <button type="button" onClick={() => onPageChange?.(1)}>
            stub: reach the form page
          </button>
          <div data-testid="w9-viewer-actions">{actions}</div>
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
        <PortalW9 />
      </MemoryRouter>,
    );
  });
};

describe("PortalW9", () => {
  beforeEach(() => {
    w9State.w9 = null;
    w9State.submitted = false;
    w9State.loading = true;
  });

  it("keeps the loading state and carries exactly one h1", async () => {
    await renderPage();

    expect(screen.getByText("Loading W-9...")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Form W-9" })).toBeInTheDocument();
  });

  it("keeps the submitted state, its date and the PDF download", async () => {
    w9State.loading = false;
    w9State.submitted = true;
    w9State.w9 = { legalName: "Test Agent", submittedAt: "2026-03-04T00:00:00.000Z" };

    await renderPage();

    expect(screen.getByRole("heading", { name: "W-9 on file" })).toBeInTheDocument();
    expect(screen.getByText(/was submitted/)).toHaveTextContent("Test Agent");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Download signed PDF/ })).toHaveAttribute(
        "href",
        "https://files.example/w9.pdf",
      ),
    );
  });

  it("gates the signing sheet on the viewer reporting the W-9's form page", async () => {
    w9State.loading = false;

    await renderPage();

    await screen.findByTestId("w9-viewer");
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "stub: reach the form page" }));

    expect(screen.getByTestId("w9-viewer-actions")).toContainElement(
      screen.getByRole("button", { name: "Sign" }),
    );
  });
});
