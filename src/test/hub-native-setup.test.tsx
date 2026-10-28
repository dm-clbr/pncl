import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PortalLeadSpply from "@/pages/PortalLeadSpply";
const api = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  id: "hub-1",
  email: "agent@thepncl.com",
  confirmed: true,
}));
vi.mock(
  "@/contexts/AuthContext",
  () => ({
    useAuth: () => ({
      user: {
        id: auth.id,
        email: auth.email,
        email_confirmed_at: auth.confirmed ? "2026-10-27" : null,
      },
      session: { access_token: "hub-token", user: { id: auth.id } },
    }),
  }),
);
vi.mock(
  "@/lib/hub-account-setup",
  async (original) => ({
    ...await original<typeof import("@/lib/hub-account-setup")>(),
    hubAccountSetup: api,
  }),
);
vi.mock(
  "@/components/portal/PortalToolLayout",
  () => ({
    default: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  }),
);
vi.mock("@/components/PortalPrimaryNav", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ trackPageView: vi.fn() }));
const empty = {
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
  ...empty,
  state: "connected",
  account: { id: "ls-1", email: "old@example.com" },
  ownershipVerified: true,
  proofExpiresAt: new Date(Date.now() + 600000).toISOString(),
};
const view = () =>
  render(
    <StrictMode>
      <MemoryRouter>
        <PortalLeadSpply />
      </MemoryRouter>
    </StrictMode>,
  );
beforeEach(() => {
  vi.stubEnv("VITE_PNCL_HUB_SETUP_ENABLED", "true");
  api.mockResolvedValue(empty);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  auth.id = "hub-1";
  auth.email = "agent@thepncl.com";
  auth.confirmed = true;
});
it("loads under StrictMode and offers native setup without external signup or automatic mutations", async () => {
  view();
  await screen.findByLabelText(/Current\ LeadSpply\ email\s*\*?$/);
  expect(api.mock.calls.every((c) => c[1].action === "status")).toBe(true);
  expect(document.querySelector('a[href="https://leadspply.com/register"]'))
    .toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "I need a new account" }));
  expect(screen.getByLabelText(/First\ name\s*\*?$/)).toBeInTheDocument();
  expect(screen.getByText("Create account with my Hub email")).toBeDisabled();
  expect(screen.queryByLabelText("Login email")).toBeNull();
});
it("verifies first, requires explicit email consent, and clears credentials", async () => {
  api.mockImplementation(async (_t, b) =>
    b.action === "status" ? empty : b.action === "verify" ? linked : {
      ...linked,
      emailMatches: true,
      account: { id: "ls-1", email: auth.email },
    }
  );
  view();
  fireEvent.change(
    await screen.findByLabelText(/Current\ LeadSpply\ email\s*\*?$/),
    { target: { value: "old@example.com" } },
  );
  fireEvent.change(screen.getByLabelText(/LeadSpply\ password\s*\*?$/), {
    target: { value: "Secret123!" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Verify and link account" }),
  );
  const update = await screen.findByRole("button", {
    name: "Update to my Hub email",
  });
  expect(update).toBeEnabled();
  expect(api.mock.calls.some((c) => c[1].action === "update_email")).toBe(
    false,
  );
  expect(screen.queryByDisplayValue("Secret123!")).toBeNull();
  fireEvent.click(update);
  await screen.findByText(/Your LeadSpply login now uses/);
  expect(api).toHaveBeenLastCalledWith("hub-token", {
    action: "update_email",
    expectedEmail: auth.email,
  }, expect.any(AbortSignal));
});
it.each(["unverified", "mismatch", "approval", "configuration"])(
  "blocks Pay when %s is incomplete",
  async (reason) => {
    api.mockResolvedValue({
      ...linked,
      emailMatches: reason !== "mismatch",
      ownershipVerified: reason !== "unverified",
      approved: reason !== "approval",
      ready: reason === "configuration",
      payEnabled: reason !== "configuration",
    });
    view();
    expect(await screen.findByRole("button", { name: "Open PNCL Pay" }))
      .toBeDisabled();
  },
);
it("disables migration for expired proof and exposes verification again", async () => {
  api.mockResolvedValue({
    ...linked,
    proofExpiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  view();
  expect(await screen.findByRole("button", { name: "Update to my Hub email" }))
    .toBeDisabled();
  expect(screen.getByLabelText(/Current\ LeadSpply\ email\s*\*?$/))
    .toBeInTheDocument();
});
it("remounts and discards old credentials and late responses after a Hub identity switch", async () => {
  let finish: (v: unknown) => void = () => {};
  api.mockImplementation(async (_t, b) =>
    b.action === "verify"
      ? new Promise((resolve) => {
        finish = resolve;
      })
      : empty
  );
  const v = view();
  fireEvent.change(
    await screen.findByLabelText(/Current\ LeadSpply\ email\s*\*?$/),
    { target: { value: "old@example.com" } },
  );
  fireEvent.change(screen.getByLabelText(/LeadSpply\ password\s*\*?$/), {
    target: { value: "Secret123!" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Verify and link account" }),
  );
  auth.id = "hub-2";
  auth.email = "other@thepncl.com";
  v.rerender(
    <StrictMode>
      <MemoryRouter>
        <PortalLeadSpply />
      </MemoryRouter>
    </StrictMode>,
  );
  await screen.findByLabelText(/Current\ LeadSpply\ email\s*\*?$/);
  await act(async () => finish(linked));
  expect(screen.getByLabelText(/LeadSpply\ password\s*\*?$/)).toHaveValue("");
  expect(screen.queryByText(/existing LeadSpply account is verified/))
    .toBeNull();
});
it("requires phone verification, matching passwords and agreements for native registration", async () => {
  api.mockImplementation(async (_t, b) =>
    b.action === "phone_start"
      ? { phoneSent: true }
      : b.action === "phone_check"
      ? { phoneVerified: true }
      : b.action === "register"
      ? {
        ...linked,
        emailMatches: true,
        account: { id: "ls-1", email: auth.email },
      }
      : empty
  );
  view();
  fireEvent.click(
    await screen.findByRole("button", { name: "I need a new account" }),
  );
  const fill = (label: string, value: string) =>
    fireEvent.change(
      screen.getByLabelText(
        new RegExp(
          "^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\*?$",
        ),
      ),
      { target: { value } },
    );
  fill("First name", "Test");
  fill("Last name", "Agent");
  fill("Mobile phone", "+12025550123");
  fireEvent.click(
    screen.getByRole("button", { name: "Send verification code" }),
  );
  await screen.findByLabelText(/Phone\ verification\ code\s*\*?$/);
  fill("Phone verification code", "123456");
  fireEvent.click(screen.getByRole("button", { name: "Verify phone" }));
  await screen.findByText(/Phone verified/);
  fill("NPN", "1234");
  fireEvent.click(screen.getByLabelText(/UT\s*\*?$/));
  fill("Business street address", "123 Test St");
  fill("City", "Test");
  fill("State", "UT");
  fill("ZIP code", "84003");
  fill("Choose a LeadSpply password", "Secret123!");
  fill("Confirm password", "Secret123!");
  fireEvent.click(
    screen.getByLabelText(
      /I\ agree\ to\ the\ LeadSpply\ Terms\ and\ Conditions\.\s*\*?$/,
    ),
  );
  fireEvent.click(
    screen.getByLabelText(
      /I\ agree\ to\ the\ LeadSpply\ Agent\ Agreement\.\s*\*?$/,
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create account with my Hub email" }),
  );
  await screen.findByText(/account has been created and linked/);
  const body = api.mock.calls.find((c) => c[1].action === "register")?.[1];
  expect(body.expectedEmail).toBe(auth.email);
  expect(body.registration).not.toHaveProperty("email");
  expect(body.registration).not.toHaveProperty("role");
});
it('honors server cooldowns before allowing another attempt',async()=>{
 const error=Object.assign(new Error('Too many attempts.'),{retryAfter:120});
 api.mockImplementation(async(_t,b)=>{if(b.action==='verify')throw error;return empty;});
 view();fireEvent.change(await screen.findByLabelText(/Current LeadSpply email/),{target:{value:'old@example.com'}});fireEvent.change(screen.getByLabelText(/LeadSpply password/),{target:{value:'Secret123!'}});
 fireEvent.click(screen.getByRole('button',{name:'Verify and link account'}));await screen.findByText('Try again in 120 seconds.');expect(screen.getByRole('button',{name:'Verify and link account'})).toBeDisabled();expect(screen.getByRole('button',{name:'Refresh status'})).toBeDisabled();
});
