import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { requireHubWorkEmail } from "../_shared/hubWorkEmail.ts";
import { accessEnabled, fields, record, signRequest, SSO_ENDPOINT, SsoError, validateLink } from "../_shared/pnclSsoContract.ts";
const origins = new Set(["https://www.thepncl.com", "https://thepncl.com"]);
Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Vary": "Origin, Authorization", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Expose-Headers": "Retry-After", ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}) };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "600" } : {}) } });
  if (origin && !origins.has(origin)) return json(403, { error: "forbidden" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let actor: string | undefined;
  const requestId = crypto.randomUUID();
  try {
    const { user, adminClient } = await requirePortalUser(req);
    actor = user.id;
    const email = await requireHubWorkEmail(user, adminClient);
    const env = (name: string) => Deno.env.get(name);
    if (!accessEnabled(user.id, env)) throw new SsoError("sso_not_enabled", 503);
    if (!env("PNCL_LEADSPPLY_PRIVATE_KEY_PEM")) throw new SsoError("sso_unavailable", 503);
    if (new URL(req.url).search || Number(req.headers.get("Content-Length") ?? 0) > 1024) throw new SsoError("invalid_request", 400);
    const raw = await req.text();
    if (raw.length > 1024) throw new SsoError("invalid_request", 400);
    const b = record(JSON.parse(raw));
    fields(b, ["challenge"]);
    if (typeof b.challenge !== "string" || !/^[0-9a-f]{64}$/.test(b.challenge)) throw new SsoError("invalid_request", 400);
    const body = JSON.stringify({ action: "issue", externalId: user.id, email, challenge: b.challenge });
    const jwt = await signRequest(body, env("PNCL_LEADSPPLY_PRIVATE_KEY_PEM")!);
    const res = await fetch(SSO_ENDPOINT, { method: "POST", redirect: "error", signal: AbortSignal.timeout(35000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + jwt }, body });
    if (res.status !== 201) {
      const failure = await res.json().catch(() => null);
      throw new SsoError(res.status === 429 ? "rate_limited" : failure?.error === "setup_incomplete" ? "setup_incomplete" : "sso_unavailable", res.status === 429 ? 429 : failure?.error === "setup_incomplete" ? 409 : 503);
    }
    const link = validateLink(await res.json());
    const fresh = await adminClient.auth.admin.getUserById(user.id);
    if (fresh.error || !fresh.data.user || await requireHubWorkEmail(fresh.data.user, adminClient) !== email) throw new SsoError("work_email_review_required");
    console.info("pncl_leadspply_sso", { actor, requestId, outcome: "issued" });
    return json(200, link);
  } catch (error) {
    const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    const e = error instanceof SsoError || error instanceof AdminAuthError ? error : new SsoError(timedOut ? "sso_timeout" : error instanceof SyntaxError ? "invalid_request" : "sso_unavailable", timedOut ? 504 : error instanceof SyntaxError ? 400 : 502);
    console.info("pncl_leadspply_sso", { actor, requestId, outcome: e.code });
    return json(e.status, { error: e.code });
  }
});
