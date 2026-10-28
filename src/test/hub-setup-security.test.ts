import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  registration,
  SetupError,
  setupRequest,
} from "../../supabase/functions/_shared/pnclSetupContract";
import {
  sanitizeSetupStatus,
  setupMessages,
} from "../../supabase/functions/_shared/pnclSetupProxy";
import {
  issuePayLink,
  PARTNER_ID,
  PAY_ENDPOINT,
  payAccessEnabled,
  signPartnerJwt,
  validatePayLink,
} from "../../supabase/functions/_shared/pnclPay";
const hub = "11111111-1111-4111-8111-111111111111",
  ls = "22222222-2222-4222-8222-222222222222";
const source = {
  id: hub,
  email: "agent@thepncl.com",
  email_verified: true,
  account_active: true,
  npn: "123",
};
const ready = {
  state: "connected",
  email: source.email,
  account: { id: ls, email: source.email },
  ownershipVerified: true,
  proofExpiresAt: new Date(Date.now() + 600000).toISOString(),
  emailMatches: true,
  approved: true,
  ready: true,
};
const signup = {
  firstName: "Test",
  lastName: "Agent",
  phone: "+12025550123",
  password: " Secret123! ",
  kind: "rep",
  npn: "123",
  states: ["UT"],
  inviteCode: "",
  businessType: "sole_proprietor",
  businessName: "",
  ein: "",
  address: "123 Test St",
  city: "Test",
  state: "UT",
  postal: "84003",
  terms: true,
  agreement: true,
  smsService: false,
  smsMarketing: false,
};
beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
});
afterAll(() => vi.unstubAllGlobals());
it("rejects user-selected identity, destination, return URL and privilege metadata", () => {
  for (
    const b of [
      { action: "pay", email: "victim@thepncl.com" },
      { action: "status", pnclUserId: ls },
      { action: "pay", returnTo: "https://evil.test" },
      {
        action: "register",
        expectedEmail: source.email,
        registration: { ...signup, role: "admin" },
      },
      {
        action: "register",
        expectedEmail: source.email,
        registration: { ...signup, phoneVerified: true },
      },
    ]
  ) expect(() => setupRequest(b)).toThrow();
  for (
    const r of [
      { ...signup, terms: false },
      { ...signup, states: [] },
      { ...signup, states: ["XX"] },
      { ...signup, password: "weak" },
      { ...signup, kind: "admin" },
      { ...signup, kind: "setter", inviteCode: "" },
    ]
  ) expect(() => registration(r)).toThrow();
  expect(registration(signup).password).toBe(" Secret123! ");
});
it("fails closed on mismatched email and removes unsolicited upstream fields", () => {
  expect(sanitizeSetupStatus({ ...ready, privateKey: "SECRET" }, source.email))
    .toEqual(ready);
  expect(() =>
    sanitizeSetupStatus({ ...ready, email: "other@thepncl.com" }, source.email)
  ).toThrow();
  expect(
    sanitizeSetupStatus({
      ...ready,
      account: { id: ls, email: "other@thepncl.com" },
    }, source.email).ready,
  ).toBe(false);
  for (
    const changed of [{ ownershipVerified: false }, { approved: false }, {
      emailMatches: false,
    }, { state: "account_unavailable", account: null }]
  ) {
    expect(sanitizeSetupStatus({ ...ready, ...changed }, source.email).ready)
      .toBe(false);
  }
});
function proxy(opts: Record<string, unknown> = {}) {
  let route: (r: Request) => Promise<Response> = () => {
    throw Error("missing");
  };
  class AuthError extends Error {
    constructor(public status: number, public code: string) {
      super(code);
    }
  }
  const auth = vi.fn(async () => {
    if (opts.denied) throw new AuthError(401, "unauthorized");
    return {
      user: { id: hub },
      adminClient: {
        auth: {
          admin: {
            getUserById: vi.fn(async () => ({
              data: { user: { id: hub } },
              error: null,
            })),
          },
        },
      },
    };
  });
  const canonical = vi.fn(async () =>
    opts.renamed && canonical.mock.calls.length > 1
      ? "renamed@thepncl.com"
      : source.email
  );
  const fetcher = vi.fn(async () =>
    new Response(JSON.stringify(opts.payload ?? ready), {
      status: Number(opts.upstreamStatus ?? 200),
    })
  );
  const pay = vi.fn(async () => ({
    url: "https://www.pnclpay.com/redeem?token=fixture",
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  }));
  const code = ts.transpileModule(
    readFileSync("supabase/functions/portal-leadspply-setup/index.ts", "utf8")
      .replace(/^import[\s\S]*?;\n/gm, ""),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  new Function(
    "Deno",
    "AdminAuthError",
    "requirePortalUser",
    "requireHubWorkEmail",
    "corsHeaders",
    "SetupError",
    "setupRequest",
    "sanitizeSetupStatus",
    "setupMessages",
    "issuePayLink",
    "payAccessEnabled",
    "PAY_REDEEM_PATH",
    "retryAfterSeconds",
    "fetch",
    code,
  )(
    {
      serve: (h: typeof route) => route = h,
      env: {
        get: (name: string) =>
          name === "PNCL_PAY_TEST_USER_ID"
            ? opts.testId as string | undefined
            : name === "PNCL_PAY_TEST_EXPIRES_AT"
            ? opts.testExpires as string | undefined
            : name === "PNCL_PAY_ENDPOINT_CONFIRMED" && opts.endpointDisabled
            ? "false"
            : name === "PNCL_PAY_PRIVATE_KEY_PEM" && opts.keyMissing
            ? undefined
            : name === "PNCL_HUB_SETUP_ENABLED" && opts.disabled
            ? "false"
            : name === "PNCL_PAY_SSO_ENABLED" && opts.payDisabled
            ? "false"
            : name.endsWith("ENABLED") || name.endsWith("CONFIRMED")
            ? "true"
            : "server-fixture",
      },
    },
    AuthError,
    auth,
    canonical,
    {},
    SetupError,
    setupRequest,
    sanitizeSetupStatus,
    setupMessages,
    pay,
    payAccessEnabled,
    "/api/auth/partner/redeem",
    (value: string | null) => value ? Number(value) : 60,
    fetcher,
  );
  return {
    pay,
    fetcher,
    auth,
    request: (body: unknown = { action: "status" }) =>
      route(
        new Request("https://hub.test/setup", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      ),
  };
}
describe("Hub request authentication and Pay gate", () => {
  it("limits test issuance and UI availability to the authenticated allowlisted ID before upstream access", async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    for (
      const opts of [
        { testId: ls, testExpires: future },
        { testId: hub, testExpires: "invalid" },
        { testId: hub, testExpires: new Date(Date.now() - 1).toISOString() },
        { testId: hub },
        { testId: "*", testExpires: future },
        { testId: hub, testExpires: future, endpointDisabled: true },
        { testId: hub, testExpires: future, keyMissing: true },
      ]
    ) {
      const h = proxy({ payDisabled: true, ...opts });
      expect((await h.request({ action: "pay" })).status).toBe(503);
      expect(h.fetcher).not.toHaveBeenCalled();
      expect(h.pay).not.toHaveBeenCalled();
      expect((await (await h.request()).json()).payEnabled).toBe(false);
    }
    const h = proxy({ payDisabled: true, testId: hub, testExpires: future });
    expect((await (await h.request()).json()).payEnabled).toBe(true);
    expect((await h.request({ action: "pay" })).status).toBe(200);
    expect(h.pay).toHaveBeenCalledWith(
      source.email,
      hub,
      "server-fixture",
      "/api/auth/partner/redeem",
    );
    const injected = proxy({
      payDisabled: true,
      testId: ls,
      testExpires: future,
    });
    expect((await injected.request({ action: "pay", pnclUserId: ls })).status)
      .toBe(400);
    expect(injected.pay).not.toHaveBeenCalled();
    const unready = proxy({
      payDisabled: true,
      testId: hub,
      testExpires: future,
      payload: { ...ready, ownershipVerified: false },
    });
    expect((await unready.request({ action: "pay" })).status).toBe(409);
    expect(unready.pay).not.toHaveBeenCalled();
  });
  it("derives both identity and email from live Hub authorization", async () => {
    const h = proxy();
    const r = await h.request();
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const init = h.fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      action: "status",
      pnclUserId: hub,
      pnclEmail: source.email,
    });
    expect(init.headers).not.toHaveProperty("Authorization");
  });
  it("blocks unauthenticated, disabled, injected and stale-consent requests before upstream access", async () => {
    for (
      const [opts, body, status] of [
        [{ denied: true }, { action: "status" }, 401],
        [{ disabled: true }, { action: "status" }, 503],
        [{}, { action: "status", pnclUserId: ls }, 400],
        [
          {},
          { action: "update_email", expectedEmail: "other@thepncl.com" },
          409,
        ],
      ] as const
    ) {
      const h = proxy(opts);
      expect((await h.request(body)).status).toBe(status);
      expect(h.fetcher).not.toHaveBeenCalled();
    }
  });
  it("requires fresh LeadSpply readiness and rechecks Hub after the remote request", async () => {
    for (
      const opts of [
        { payload: { ...ready, emailMatches: false } },
        { payload: { ...ready, ownershipVerified: false } },
        { payload: { ...ready, approved: false } },
        { renamed: true },
        { payDisabled: true },
      ]
    ) {
      const h = proxy(opts);
      expect((await h.request({ action: "pay" })).ok).toBe(false);
      expect(h.pay).not.toHaveBeenCalled();
    }
    const h = proxy();
    expect((await h.request({ action: "pay" })).status).toBe(200);
    expect(h.pay).toHaveBeenCalledWith(
      source.email,
      hub,
      "server-fixture",
      "/api/auth/partner/redeem",
    );
  });
  it("sanitizes errors and preserves throttling without forwarding credentials", async () => {
    const h = proxy({
      upstreamStatus: 429,
      payload: { error: "rate_limited", message: "secret" },
    });
    const r = await h.request();
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(await r.text()).not.toContain("secret");
  });
});
describe("Pay JWT and one-time-link boundary", () => {
  let pem: string;
  let publicKey: CryptoKey;
  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    publicKey = pair.publicKey;
    pem = "-----BEGIN PRIVATE KEY-----\n" +
      Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
        .toString("base64") +
      "\n-----END PRIVATE KEY-----";
  });
  it("signs verifiable RS256 tokens with the exact audience and fresh jti each time", async () => {
    const a = await signPartnerJwt(pem), b = await signPartnerJwt(pem);
    const [header, payload, signature] = a.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(JSON.parse(Buffer.from(header, "base64url").toString()).alg).toBe(
      "RS256",
    );
    expect(claims).toMatchObject({
      iss: PARTNER_ID,
      aud: "https://www.pnclpay.com/api/partner/login-links",
    });
    expect(claims.exp - claims.iat).toBe(120);
    expect(claims.jti).not.toBe(
      JSON.parse(Buffer.from(b.split(".")[1], "base64url").toString()).jti,
    );
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        Buffer.from(signature, "base64url"),
        new TextEncoder().encode(header + "." + payload),
      ),
    ).toBe(true);
  });
  it("posts the canonical email and immutable Hub UUID, and never auto-retries", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          url: "https://www.pnclpay.com/redeem?token=one-time",
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        }),
        { status: 201 },
      )
    );
    await issuePayLink(source.email, hub, pem, "/redeem", fetcher as any);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      email: source.email,
      externalId: hub,
    });
    expect(init.redirect).toBe("error");
  });
  it("rejects malicious or expired redemption links and malformed provider errors", async () => {
    for (
      const url of [
        "http://www.pnclpay.com/redeem",
        "https://evil.test/redeem",
        "https://www.pnclplay.com/redeem?token=wrong-host",
        "https://www.pnclpay.com/other",
        "https://user@www.pnclpay.com/redeem",
        "https://www.pnclpay.com/redeem#token",
      ]
    ) {
      expect(() =>
        validatePayLink({
          url,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        }, "/redeem")
      ).toThrow();
    }
    expect(() =>
      validatePayLink({
        url: "https://www.pnclpay.com/redeem",
        expiresAt: "2020-01-01",
      }, "/redeem")
    ).toThrow();
    for (const status of [401, 404, 422, 429, 500]) {
      const f = vi.fn(async () =>
        new Response("sensitive provider details", { status })
      );
      await expect(issuePayLink(source.email, hub, pem, "/redeem", f as any))
        .rejects.not.toThrow("sensitive");
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
});
