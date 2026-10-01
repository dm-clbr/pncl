import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("https://deno.land/x/jose@v5.2.0/index.ts", () => ({
  importPKCS8: vi.fn(async () => ({})),
  SignJWT: class {
    setProtectedHeader() { return this; }
    setIssuer() { return this; }
    setSubject() { return this; }
    setAudience() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return "test-assertion"; }
  },
}));
vi.mock("../../supabase/functions/_shared/onboarding.ts", () => ({
  getEmailDomain: () => "thepncl.com",
}));
vi.mock("../../supabase/functions/_shared/logger.ts", () => ({
  logOnboarding: vi.fn(),
}));

type DirectoryUser = { id?: string; primaryEmail?: string; deletionTime?: string };
const fetchMock = vi.fn();
const deletedAt = "2026-09-30T10:00:00Z";
let workspace: typeof import("../../supabase/functions/_shared/googleWorkspace");

function mockDirectory(
  active: DirectoryUser[] = [],
  deletedPages: DirectoryUser[][] = [[]],
  getStatus = 404,
) {
  fetchMock.mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "oauth2.googleapis.com") {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }));
    }
    if (url.pathname !== "/admin/directory/v1/users") {
      return new Response(JSON.stringify(active[0] ?? {}), { status: getStatus });
    }
    if (url.searchParams.get("showDeleted") === "true") {
      // Reproduce the production API behavior, including valid exact queries.
      if (url.searchParams.has("query")) {
        return new Response(JSON.stringify({ error: { message: "Invalid Input: query" } }), { status: 400 });
      }
      const page = Number(url.searchParams.get("pageToken") ?? "0");
      return new Response(JSON.stringify({
        users: deletedPages[page],
        ...(page + 1 < deletedPages.length ? { nextPageToken: String(page + 1) } : {}),
      }));
    }
    return new Response(JSON.stringify({ users: active }));
  });
}

function listRequests() {
  return fetchMock.mock.calls.map(([input]) => new URL(input))
    .filter((url) => url.pathname === "/admin/directory/v1/users");
}

describe("Google Workspace email lookup", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Deno", { env: { get: () => "test-config" } });
    workspace = await import("../../supabase/functions/_shared/googleWorkspace");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists deleted users without a query and filters prefix/domain across all pages", async () => {
    mockDirectory([
      { primaryEmail: "JANE.SMITH@thepncl.com" },
      { primaryEmail: "jane.smith@other.com" },
      { primaryEmail: "jane.jones@thepncl.com" },
    ], [
      [{ id: "unrelated", primaryEmail: "other@thepncl.com", deletionTime: deletedAt }],
      [
        { id: "deleted", primaryEmail: "Jane.Smith2@thepncl.com", deletionTime: deletedAt },
        { id: "duplicate", primaryEmail: "jane.smith2@thepncl.com", deletionTime: deletedAt },
        { primaryEmail: "jane.smith@thepncl.com", deletionTime: deletedAt },
        { primaryEmail: "jane.smith3@other.com", deletionTime: deletedAt },
        { primaryEmail: "jane.smith4@thepncl.com" },
      ],
    ]);
    expect(await workspace.listWorkspaceEmailsForLocalPart("jane.smith", "THEPNCL.COM"))
      .toEqual({ active: ["jane.smith@thepncl.com"], deleted: ["jane.smith2@thepncl.com"] });
    const urls = listRequests();
    const activeUrl = urls.find((url) => url.searchParams.get("showDeleted") === "false")!;
    expect(activeUrl.searchParams.get("query")).toBe("email:jane.smith*");
    const deletedUrls = urls.filter((url) => url.searchParams.get("showDeleted") === "true");
    expect(deletedUrls).toHaveLength(2);
    expect(deletedUrls.every((url) => !url.searchParams.has("query"))).toBe(true);
    expect(deletedUrls[1].searchParams.get("pageToken")).toBe("1");
  });

  it("reserves an exact deleted address found on a later page", async () => {
    mockDirectory([], [
      [{ id: "prefix-only", primaryEmail: "jane.smith2@thepncl.com", deletionTime: deletedAt }],
      [{ id: "deleted", primaryEmail: "Jane.Smith@thepncl.com", deletionTime: deletedAt }],
    ]);
    expect(await workspace.getWorkspaceEmailAvailability("jane.smith@thepncl.com"))
      .toEqual({ status: "deleted", userId: "deleted", email: "Jane.Smith@thepncl.com", deletionTime: deletedAt });
    expect(listRequests().every((url) => !url.searchParams.has("query"))).toBe(true);
  });

  it("allows a new address after a 404 and no exact deleted match", async () => {
    mockDirectory([], [[
      { id: "prefix-only", primaryEmail: "jane.smith2@thepncl.com", deletionTime: deletedAt },
      { id: "other-domain", primaryEmail: "jane.smith@other.com", deletionTime: deletedAt },
    ]]);
    expect(await workspace.getWorkspaceEmailAvailability("jane.smith@thepncl.com"))
      .toEqual({ status: "available" });
  });

  it("keeps active accounts reserved without listing deleted accounts", async () => {
    mockDirectory([{ id: "active", primaryEmail: "jane.smith@thepncl.com" }], [[]], 200);
    expect(await workspace.getWorkspaceEmailAvailability("jane.smith@thepncl.com"))
      .toEqual({ status: "active", userId: "active", email: "jane.smith@thepncl.com" });
    expect(listRequests()).toHaveLength(0);
  });

  it("does not treat a Google permission error as an available address", async () => {
    mockDirectory([], [[]], 403);
    expect(await workspace.getWorkspaceEmailAvailability("jane.smith@thepncl.com"))
      .toMatchObject({ status: "error", message: expect.stringContaining("Google API 403") });
    expect(listRequests()).toHaveLength(0);
  });

  it("does not treat a failed deleted-user listing as an available address", async () => {
    mockDirectory();
    const directoryFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.searchParams.get("showDeleted") === "true") {
        return new Response("Directory temporarily unavailable", { status: 503 });
      }
      return directoryFetch(input);
    });
    expect(await workspace.getWorkspaceEmailAvailability("jane.smith@thepncl.com"))
      .toMatchObject({ status: "error", message: expect.stringContaining("(503)") });
  });
});
