import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import * as contract from "../../supabase/functions/_shared/pnclSsoContract";
beforeAll(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal }); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
class AuthError extends Error { constructor(public code: string, public status = 401) { super(code); } }
const id = "11111111-1111-4111-8111-111111111111", email = "agent@thepncl.com", challenge = "a".repeat(64);
function fixture(opts: { disabled?: boolean; changedEmail?: boolean; upstream?: number } = {}) {
  let route!: (req: Request) => Promise<Response>;
  const auth = vi.fn(async (req: Request) => {
    if (req.headers.get("Authorization") !== "Bearer authorized") throw new AuthError("unauthorized");
    return { user: { id, email }, adminClient: { auth: { admin: { getUserById: async () => ({ data: { user: { id, email } } }) } } } };
  });
  const canonical = vi.fn().mockResolvedValueOnce(email).mockResolvedValue(opts.changedEmail ? "renamed@thepncl.com" : email);
  const sign = vi.fn(async (_body: string, _pem: string) => "synthetic-jwt");
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(opts.upstream ? { error: opts.upstream === 409 ? "setup_incomplete" : "sensitive-error" } : { url: contract.SSO_DESTINATION + "#token=" + "b".repeat(43), expiresAt: new Date(Date.now()+120000).toISOString() }), { status: opts.upstream ?? 201 }));
  const source = ts.transpileModule(readFileSync("supabase/functions/portal-leadspply-sso/index.ts", "utf8").replace(/^import[\s\S]*?;\n/gm,""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "AdminAuthError", "requirePortalUser", "requireHubWorkEmail", "accessEnabled", "fields", "record", "signRequest", "SSO_ENDPOINT", "SsoError", "validateLink", "fetch", source)(
    { serve: (h: typeof route) => route=h, env: { get: (name: string) => name === "PNCL_LEADSPPLY_SSO_ENABLED" ? opts.disabled ? "false" : "true" : name === "PNCL_LEADSPPLY_PRIVATE_KEY_PEM" ? "test-placeholder" : undefined } },
    AuthError, auth, canonical, contract.accessEnabled, contract.fields, contract.record, sign, contract.SSO_ENDPOINT, contract.SsoError, contract.validateLink, fetcher,
  );
  const call = (body: unknown = { challenge }, headers: Record<string,string> = { Authorization: "Bearer authorized", Origin: "https://www.thepncl.com" }) => route(new Request("https://hub.example/functions/v1/portal-leadspply-sso", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { call, sign, fetcher, auth };
}
it("requires a verified Hub session and an approved origin", async () => {
  const f=fixture(); expect((await f.call({challenge},{})).status).toBe(401);
  expect((await f.call({challenge},{Authorization:"Bearer authorized", Origin:"https://evil.example"})).status).toBe(403);
  expect(f.sign).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});
it("rejects user-selected identity, destination and role fields", async () => {
  for(const addition of [{email:"victim@thepncl.com"},{externalId:id},{returnTo:"https://evil.example"},{role:"admin"}]) {
    const f=fixture(); expect((await f.call({challenge,...addition})).status).toBe(400); expect(f.sign).not.toHaveBeenCalled();
  }
});
it("uses only canonical server identity and the fixed signed destination", async () => {
  const f=fixture(), r=await f.call(); expect(r.status).toBe(200);
  expect(JSON.parse(f.sign.mock.calls[0][0])).toEqual({action:"issue",externalId:id,email,challenge});
  expect(f.fetcher.mock.calls[0][0]).toBe(contract.SSO_ENDPOINT);
  expect(r.headers.get("Cache-Control")).toBe("no-store"); expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
});
it("fails closed when disabled or the authoritative Hub email changes during issuance", async () => {
  const f=fixture({disabled:true}); expect((await f.call()).status).toBe(503); expect(f.sign).not.toHaveBeenCalled();
  const g=fixture({changedEmail:true}); const r=await g.call(); expect(r.status).toBe(409); expect((await r.json()).error).toBe("work_email_review_required");
});
it("sanitizes provider errors and preserves setup and rate-limit outcomes", async () => {
  for(const [status,expected] of [[409,409],[429,429],[500,503]]) {
    const f=fixture({upstream:status}); const r=await f.call(); expect(r.status).toBe(expected); expect(await r.text()).not.toContain("sensitive-error");
  }
});
it("reports an upstream timeout without leaking details or retrying a signed request", async () => {
  const f = fixture();
  f.fetcher.mockRejectedValueOnce(Object.assign(new Error("sensitive network details"), { name: "TimeoutError" }));
  const response = await f.call();
  expect(response.status).toBe(504);
  expect(await response.json()).toEqual({ error: "sso_timeout" });
  expect(f.sign).toHaveBeenCalledOnce();
  expect(f.fetcher).toHaveBeenCalledOnce();
});
