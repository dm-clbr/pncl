import { act, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/lib/document-requests", async original => ({ ...await original<typeof import("@/lib/document-requests")>(), listAgentDocumentRequests: vi.fn().mockResolvedValue([]) }));
vi.mock("@/hooks/useOnboardingContent", () => ({
  useOnboardingContent: () => ({ content: { designation: "loa", ica: { id: "ica-upload", url: "/uploaded-ica.pdf", signing_mode: "ica_fields" }, welcomeVideo: null, surelcVideo: null }, error: null, retry: vi.fn() }),
}));

vi.mock("@/hooks/usePortalIca", () => ({
  usePortalIca: () => ({ ...icaState, setIca: vi.fn() }),
}));

vi.mock("@/lib/portal-profile", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/portal-profile")>(),
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
    stack. The stub keeps the pager action slot without reporting page visits. */
vi.mock("@/components/IcaFillablePdfViewer", () => ({
  default: forwardRef<unknown, { actions?: ReactNode }>(
    function IcaFillablePdfViewerStub({ actions }, _ref) {
      return (
        <div data-testid="ica-viewer">
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

  /** Four routes link here (portal-todos.ts, the dashboard checklist and two
      links on the profile page), so the back link has to point at the portal,
      the one page every entry path shares. Direct deposit pins the same href. */
  it("sends the back link to the portal, not the profile", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Back to portal" })).toHaveAttribute(
      "href",
      "/portal",
    );
  });

  /* The email AcroForm field is on page 12, so its warning needs to be visible
     while the field is being filled. That address becomes the account recovery email and the
     1099 delivery address, so it has to be readable on the page itself. */
  it("shows the recovery-email warning on the page, not inside the signing sheet", async () => {
    icaState.loading = false;

    await renderPage();

    const note = await screen.findByText(/personal address you will keep access to/);
    expect(note.closest("dialog")).toBeNull();
  });

  it("makes Sign available without requiring a visit to the last page", async () => {
    icaState.loading = false;

    await renderPage();

    await screen.findByTestId("ica-viewer");
    expect(screen.getByRole("button", { name: "Sign" })).toBeEnabled();
  });
});
