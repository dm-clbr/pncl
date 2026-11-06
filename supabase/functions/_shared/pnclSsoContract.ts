// Shared wire contract. Only the Hub server chooses the identity; only this
// fixed destination can receive handoffs. Never put session tokens in URLs.
export const SSO_ENDPOINT = "https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-hub-sso";
export const SSO_DESTINATION = "https://leadspply.com/pncl-sso.html";
export const PARTNER_ID = "pnclhub-h7fyl";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORK_EMAIL = /^[^\s@]+@thepncl\.com$/;
export const HANDOFF = /^[A-Za-z0-9_-]{43}$/;
export class SsoError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SsoError("invalid_request", 400);
  return value as Record<string, unknown>;
}
export function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new SsoError("invalid_request", 400);
}
export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
export const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const encode = (v: unknown) => b64(new TextEncoder().encode(JSON.stringify(v)));
export const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), x => x.toString(16).padStart(2, "0")).join("");
export async function signRequest(body: string, pem: string, now = Date.now()) {
  const key = await crypto.subtle.importKey("pkcs8", decode(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) throw new SsoError("sso_unavailable", 503);
  const iat = Math.floor(now / 1000);
  const input = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({ iss: PARTNER_ID, aud: SSO_ENDPOINT, iat, exp: iat + 120, jti: crypto.randomUUID(), body_sha256: await digest(body) });
  return input + "." + b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input))));
}
export async function verifyRequest(jwt: string, body: string, pem: string, now = Date.now()) {
  try {
    if (jwt.length > 4096) throw new Error();
    const parts = jwt.split(".");
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const header = record(JSON.parse(new TextDecoder().decode(decode(parts[0]))));
    fields(header, ["alg", "typ"]);
    if (header.alg !== "RS256" || header.typ !== "JWT") throw new Error();
    const key = await crypto.subtle.importKey("spki", decode(pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if ((key.algorithm as RsaKeyAlgorithm).modulusLength < 2048 || !await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))) throw new Error();
    const c = record(JSON.parse(new TextDecoder().decode(decode(parts[1]))));
    fields(c, ["iss", "aud", "iat", "exp", "jti", "body_sha256"]);
    const t = Math.floor(now / 1000);
    if (c.iss !== PARTNER_ID || c.aud !== SSO_ENDPOINT || typeof c.iat !== "number" || typeof c.exp !== "number" || !Number.isInteger(c.iat) || !Number.isInteger(c.exp) || c.iat > t + 30 || c.iat < t - 150 || c.exp <= t || c.exp <= c.iat || c.exp - c.iat > 120 || typeof c.jti !== "string" || !UUID.test(c.jti) || c.body_sha256 !== await digest(body)) throw new Error();
    return { jti: c.jti, expiresAt: new Date((c.exp + 30) * 1000).toISOString() };
  } catch { throw new SsoError("partner_auth_failed", 401); }
}
export function accessEnabled(id: string, env: (name: string) => string | undefined, now = Date.now()) {
  if (env("PNCL_LEADSPPLY_SSO_ENABLED") === "true") return true;
  const expires = Date.parse(env("PNCL_LEADSPPLY_TEST_EXPIRES_AT") ?? "");
  return UUID.test(id) && env("PNCL_LEADSPPLY_TEST_USER_ID") === id && Number.isFinite(expires) && expires > now;
}
export function validateLink(value: unknown, now = Date.now()) {
  try {
    const b = record(value);
    if (typeof b.url !== "string" || typeof b.expiresAt !== "string") throw new Error();
    const url = new URL(b.url), expiry = Date.parse(b.expiresAt);
    if (url.origin + url.pathname !== SSO_DESTINATION || url.username || url.password || url.search || !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash) || !Number.isFinite(expiry) || expiry <= now || expiry > now + 125000) throw new Error();
    return { url: url.href, expiresAt: b.expiresAt };
  } catch { throw new SsoError("sso_unavailable", 502); }
}
