import { SetupError } from "./pnclSetupContract.ts";
export const PAY_ENDPOINT = "https://www.pnclpay.com/api/partner/login-links";
export const PAY_REDEEM_PATH = "/api/auth/partner/redeem";
export const PARTNER_ID = "pnclhub-h7fyl";

// Only server configuration can opt a single immutable Hub ID into a timed test.
// This does not bypass identity, ownership, matching-email or approval checks.
export function payAccessEnabled(
  userId: string,
  env: (name: string) => string | undefined,
  now = Date.now(),
): boolean {
  if (
    env("PNCL_PAY_ENDPOINT_CONFIRMED") !== "true" ||
    !env("PNCL_PAY_PRIVATE_KEY_PEM")
  ) return false;
  if (env("PNCL_PAY_SSO_ENABLED") === "true") return true;
  const testId = env("PNCL_PAY_TEST_USER_ID");
  const expires = Date.parse(env("PNCL_PAY_TEST_EXPIRES_AT") ?? "");
  return Boolean(
    testId && /^[0-9a-f-]{36}$/i.test(testId) &&
      userId === testId && Number.isFinite(expires) && expires > now,
  );
}
const b64 = (v: Uint8Array) =>
  btoa(String.fromCharCode(...v)).replace(/=/g, "").replace(/\+/g, "-").replace(
    /\//g,
    "_",
  );
const encode = (v: unknown) => b64(new TextEncoder().encode(JSON.stringify(v)));
export async function signPartnerJwt(
  privatePem: string,
  now = Date.now(),
): Promise<string> {
  const pem = privatePem.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
    "",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) {
    throw new SetupError("pay_unavailable", 503);
  }
  const iat = Math.floor(now / 1000);
  const input = encode({ alg: "RS256", typ: "JWT" }) + "." +
    encode({
      iss: PARTNER_ID,
      aud: PAY_ENDPOINT,
      iat,
      exp: iat + 120,
      jti: crypto.randomUUID(),
    });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(input),
  );
  return input + "." + b64(new Uint8Array(signature));
}
export function validatePayLink(
  value: unknown,
  path: string,
  now = Date.now(),
) {
  if (
    !path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path) ||
    !value || typeof value !== "object"
  ) throw new SetupError("pay_unavailable", 502);
  const b = value as { url?: unknown; expiresAt?: unknown };
  if (typeof b.url !== "string" || typeof b.expiresAt !== "string") {
    throw new SetupError("pay_unavailable", 502);
  }
  const url = new URL(b.url);
  const expiry = Date.parse(b.expiresAt);
  if (
    url.origin !== new URL(PAY_ENDPOINT).origin || url.username ||
    url.password || url.hash || url.pathname !== path ||
    url.searchParams.getAll("token").length !== 1 ||
    !url.searchParams.get("token") ||
    [...url.searchParams.keys()].some((key) => key !== "token") ||
    !Number.isFinite(expiry) || expiry <= now || expiry > now + 125000
  ) throw new SetupError("pay_unavailable", 502);
  return { url: url.href, expiresAt: b.expiresAt };
}
export async function issuePayLink(
  email: string,
  hubId: string,
  privatePem: string,
  path: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    !/^[^\s@]+@thepncl\.com$/.test(email) || !/^[0-9a-f-]{36}$/i.test(hubId)
  ) throw new SetupError("work_email_review_required");
  const jwt = await signPartnerJwt(privatePem);
  const response = await fetcher(PAY_ENDPOINT, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwt,
    },
    body: JSON.stringify({ email, externalId: hubId }),
  });
  if (response.status !== 201) {
    throw new SetupError(
      response.status === 404
        ? "pay_user_not_found"
        : response.status === 429
        ? "rate_limited"
        : response.status === 422
        ? "pay_validation_failed"
        : "pay_unavailable",
      response.status === 429 ? 429 : response.status === 404 ? 409 : 502,
      response.status === 429
        ? retryAfterSeconds(response.headers.get("Retry-After"))
        : undefined,
    );
  }
  return validatePayLink(await response.json(), path);
}

export function retryAfterSeconds(
  value: string | null,
  now = Date.now(),
): number {
  const n = value && /^\d+$/.test(value)
    ? Number(value)
    : value
    ? Math.ceil((Date.parse(value) - now) / 1000)
    : 60;
  return Number.isFinite(n) ? Math.min(3600, Math.max(1, n)) : 60;
}
