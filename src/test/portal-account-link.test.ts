import { beforeEach, describe, expect, it, vi } from "vitest";
import { provisionPortalAccount, resendPortalInvite } from "../../supabase/functions/_shared/portalAuth";
import { sendPortalWelcomeEmail } from "../../supabase/functions/_shared/resend";
import { sharedSignInError } from "../lib/shared-sign-in";

vi.mock("../../supabase/functions/_shared/resend", () => ({ sendPortalWelcomeEmail: vi.fn() }));
vi.mock("../../supabase/functions/_shared/logger", () => ({ logOnboarding: vi.fn() }));
const input = { onboardingId: "onboarding-1", email: "rep@thepncl.com", legalName: "Example Rep", firstName: "Example", lastName: "Rep" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: () => "https://thepncl.com" } });
  vi.mocked(sendPortalWelcomeEmail).mockResolvedValue(undefined);
});
function db(existing = true) {
  const events: string[] = [];
  const listUsers = vi.fn().mockImplementation(async () => ({ data: { users: existing ? [{ id: "user-1", email: input.email }] : [] }, error: null }));
  const createUser = vi.fn().mockImplementation(async () => { events.push("create"); existing = true; return { data: { user: { id: "user-1" } }, error: null }; });
  const updateUserById = vi.fn();
  const rpc = vi.fn().mockImplementation(async (name: string) => { events.push(name); return { data: null, error: null }; });
  vi.mocked(sendPortalWelcomeEmail).mockImplementation(async () => { events.push("mail"); });
  return { auth: { admin: { listUsers, createUser, updateUserById } }, rpc, events };
}
describe("durable portal account linking", () => {
  it("checks legacy ownership before persisting, preserving the existing Auth account and roles", async () => {
    const client = db();
    await expect(provisionPortalAccount(client as never, input)).resolves.toBe("user-1");
    expect(client.events).toEqual(["check_portal_account_link", "persist_portal_account_link", "mail"]);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it("persists a newly created account before delivery failure and reuses it on retry", async () => {
    const client = db(false);
    vi.mocked(sendPortalWelcomeEmail).mockRejectedValueOnce(new Error("mail unavailable"));
    await expect(provisionPortalAccount(client as never, input)).rejects.toThrow("mail unavailable");
    expect(client.events).toEqual(["create", "persist_portal_account_link"]);
    await expect(provisionPortalAccount(client as never, input)).resolves.toBe("user-1");
    expect(client.auth.admin.createUser).toHaveBeenCalledTimes(1);
  });
  it("does not create, mutate or email an existing conflicting identity", async () => {
    const client = db();
    client.rpc.mockResolvedValueOnce({ error: { message: "identity_conflict" } });
    await expect(resendPortalInvite(client as never, { ...input, existingSupabaseUserId: "other-user" })).rejects.toThrow("support review");
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(sendPortalWelcomeEmail).not.toHaveBeenCalled();
  });
  it("does not send mail after persistence fails", async () => {
    const client = db();
    client.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "conflict" } });
    await expect(provisionPortalAccount(client as never, input)).rejects.toThrow("save the portal account link");
    expect(sendPortalWelcomeEmail).not.toHaveBeenCalled();
  });
  it("fails closed when existing account discovery is unavailable", async () => {
    const client = db();
    client.auth.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: { message: "unavailable" } });
    await expect(provisionPortalAccount(client as never, input)).rejects.toThrow("verify existing");
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it("gives the user a support repair action for a missing internal link", () => {
    expect(sharedSignInError({ code: "onboarding_link_missing" }, "PNCL Pay")).toMatchObject({ action: "support", retry: false });
    expect(sharedSignInError({ code: "onboarding_link_missing" }, "PNCL Pay").message).toContain("completed onboarding");
  });
});
