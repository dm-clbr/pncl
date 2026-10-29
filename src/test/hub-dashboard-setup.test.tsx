import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalLeadSpplySnapshot from "@/components/PortalLeadSpplySnapshot";

const api = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  id: "hub-1",
  email: "agent@thepncl.com",
  confirmed: true,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: auth.id,
      email: auth.email,
      email_confirmed_at: auth.confirmed ? "2026-10-29" : null,
    },
    session: { access_token: "hub-token", user: { id: auth.id } },
  }),
}));
vi.mock("@/lib/hub-account-setup", async (original) => ({
  ...await original<typeof import("@/lib/hub-account-setup")>(),
  hubAccountSetup: api,
}));
vi.mock(
  "@/hooks/usePortalLeadSpplySnapshot",
  () => ({
    usePortalLeadSpplySnapshot: () => ({
      snapshot: {
        version: 1, state: "connected", asOf: "2026-10-29T19:00:00.000Z",
        account: { name: "Sample Agent", syncStatus: "synced", lastSyncedAt: null },
        period: { timezone: "America/Denver", monthStart: "2026-10-01", weekStart: "2026-10-26", today: "2026-10-29" },
        leads: { toWork: 0, new: 0, inProgress: 0, callbacksToday: 0 },
        appointments: { upcoming: 0, nextAt: null },
        production: { paidPoliciesMtd: 0, annualPremiumCentsMtd: 0 },
        activity: {
          today: { calls: 0, appointments: 0, presentations: 0, policies: 0, points: 0 },
          week: { calls: 0, appointments: 0, presentations: 0, policies: 0, points: 0 },
        },
        contact: { ratePct: null, speedMinutes: null },
      },
      loading: false,
      error: null,
      reload,
    }),
  }),
);
const unlinked = {
  state: "not_linked",
  email: "agent@thepncl.com",
  account: null,
  ownershipVerified: false,
  proofExpiresAt: null,
  emailMatches: false,
  approved: false,
  ready: false,
  payEnabled: false,
};
const linked = {
  ...unlinked,
  state: "connected",
  account: { id: "ls-1", email: "agent@thepncl.com" },
  emailMatches: true,
  approved: true,
};
const verified = {
  ...linked,
  ownershipVerified: true,
  ready: true,
  proofExpiresAt: new Date(Date.now() + 600000).toISOString(),
};
const view = () =>
  render(
    <MemoryRouter>
      <PortalLeadSpplySnapshot userId="hub-1" />
    </MemoryRouter>,
  );
const submit = () => {
  fireEvent.change(screen.getByLabelText(/LeadSpply password/), {
    target: { value: "fixture-password" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: /^(Verify account|Verify and link account)$/,
    }),
  );
};
beforeEach(() => {
  vi.stubEnv("VITE_PNCL_HUB_SETUP_ENABLED", "true");
  api.mockResolvedValue(linked);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  auth.confirmed = true;
  auth.id = "hub-1";
  auth.email = "agent@thepncl.com";
});

it("explains that an existing link is intact, then removes the banner after one-time verification", async () => {
  api.mockImplementation(async (_token, body) =>
    body.action === "status" ? linked : verified
  );
  view();
  expect(await screen.findByText(/Your LeadSpply account is already connected/))
    .toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Linked", { exact: true })).toBeInTheDocument();
  expect(screen.queryByText("Verified", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Verify link once" }));
  expect(screen.getByLabelText(/Current LeadSpply email/)).toHaveValue(
    auth.email,
  );
  submit();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("button", { name: "Verify link once" })).toBeNull();
  expect(screen.getByText(/Link verified · Your LeadSpply login matches Hub/))
    .toBeInTheDocument();
  expect(screen.getByText("Verified", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Linked", { exact: true })).toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(api.mock.calls.map((c) => c[1].action)).toEqual(["status", "verify"]);
});
it("shows persisted ownership verification with Pay disabled and clears it when the Hub user changes", async () => {
  api.mockResolvedValue({ ...verified, proofExpiresAt: null, payEnabled: false });
  const { rerender } = view();
  expect(await screen.findByText("Verified", { exact: true })).toBeInTheDocument();
  api.mockImplementation(() => new Promise(() => {}));
  auth.id = "hub-2";
  auth.email = "second@thepncl.com";
  rerender(<MemoryRouter><PortalLeadSpplySnapshot userId="hub-2" /></MemoryRouter>);
  expect(screen.queryByText("Verified", { exact: true })).toBeNull();
});
it.each(["old@example.com", "other@thepncl.com"])(
  "links and verifies together, then requires consent to replace mismatched email %s",
  async (oldEmail) => {
    const mismatched = {
      ...verified,
      account: { id: "ls-1", email: oldEmail },
      emailMatches: false,
      ready: false,
    };
    api.mockImplementation(async (_token, body) =>
      body.action === "status"
        ? unlinked
        : body.action === "verify"
        ? mismatched
        : verified
    );
    view();
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect LeadSpply" }),
    );
    fireEvent.change(screen.getByLabelText(/Current LeadSpply email/), {
      target: { value: oldEmail },
    });
    submit();
    await screen.findByRole("dialog", { name: "Use your PNCL Hub email" });
    expect(screen.getByRole("button", { name: "Close", exact: true })).toHaveFocus();
    expect(screen.getByText(oldEmail)).toBeInTheDocument();
    expect(screen.getByText(auth.email)).toBeInTheDocument();
    expect(screen.queryByLabelText(/LeadSpply password/)).toBeNull();
    expect(api.mock.calls.some((c) => c[1].action === "update_email")).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Update to my Hub email" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api).toHaveBeenLastCalledWith("hub-token", {
      action: "update_email",
      expectedEmail: auth.email,
    }, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Verify link once" }))
      .toBeNull();
    expect(reload).toHaveBeenCalledTimes(2);
  },
);
it("lets users defer an email update and resume without repeating a fresh verification", async () => {
  api.mockResolvedValue({
    ...verified,
    emailMatches: false,
    ready: false,
    account: { id: "ls-1", email: "old@example.com" },
  });
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: "Continue email setup" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finish later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue email setup" }));
  expect(screen.getByRole("dialog", { name: "Use your PNCL Hub email" }))
    .toBeInTheDocument();
  expect(api.mock.calls.map((c) => c[1].action)).toEqual(["status"]);
});
it("does not reopen a dismissed dialog when a pending verification finishes", async () => {
  let resolve: (value: unknown) => void = () => {};
  api.mockImplementation(async (_token, body) =>
    body.action === "status" ? linked : new Promise((done) => {
      resolve = done;
    })
  );
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: "Verify link once" }),
  );
  submit();
  fireEvent.keyDown(window, { key: "Escape" });
  await act(async () =>
    resolve({ ...verified, emailMatches: false, ready: false })
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Continue email setup" }))
    .toBeInTheDocument();
});
it("offers native account creation from the dashboard and clears it on dismissal", async () => {
  api.mockResolvedValue(unlinked);
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: "Create a LeadSpply account" }),
  );
  expect(screen.getByRole("dialog", { name: "Create your LeadSpply account" }))
    .toBeInTheDocument();
  expect(screen.getByText(auth.email)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Choose a LeadSpply password/), {
    target: { value: "fixture-password" },
  });
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.click(
    screen.getByRole("button", { name: "Create a LeadSpply account" }),
  );
  expect(screen.getByLabelText(/Choose a LeadSpply password/)).toHaveValue("");
  expect(api.mock.calls.every((c) => c[1].action === "status")).toBe(true);
});
it("does not fetch setup or allow connecting with an unverified Hub email", async () => {
  auth.confirmed = false;
  view();
  expect(api).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Connect LeadSpply" }))
    .toBeNull();
});
