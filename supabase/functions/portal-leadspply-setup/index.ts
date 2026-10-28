import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { requireHubWorkEmail } from "../_shared/hubWorkEmail.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { SetupError, setupRequest } from "../_shared/pnclSetupContract.ts";
import {
  sanitizeSetupStatus,
  setupMessages,
} from "../_shared/pnclSetupProxy.ts";
import {
  issuePayLink,
  payAccessEnabled,
  PAY_REDEEM_PATH,
  retryAfterSeconds,
} from "../_shared/pnclPay.ts";
const json = (status: number, body: unknown, retryAfter = 600) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Expose-Headers": "Retry-After",
      "Vary": "Authorization, Origin",
      ...(status === 429 ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let auditActor: string | undefined;
  let payRequest = false;
  const requestId = crypto.randomUUID();
  const audit = (outcome: string) =>
    console.info("pncl_pay_request", {
      actor: auditActor,
      requestId,
      outcome,
      at: new Date().toISOString(),
    });
  try {
    const { user, adminClient } = await requirePortalUser(req);
    const email = await requireHubWorkEmail(user, adminClient);
    if (Deno.env.get("PNCL_HUB_SETUP_ENABLED") !== "true") {
      throw new SetupError("integration_unavailable", 503);
    }
    if (
      new URL(req.url).search ||
      Number(req.headers.get("Content-Length") ?? 0) > 16384
    ) throw new SetupError("invalid_request", 400);
    const raw = await req.text();
    if (raw.length > 16384) throw new SetupError("invalid_request", 400);
    const body = setupRequest(JSON.parse(raw));
    auditActor = user.id;
    payRequest = body.action === "pay";
    if (body.expectedEmail !== undefined && body.expectedEmail !== email) {
      throw new SetupError("work_email_review_required");
    }
    const key = Deno.env.get("PNCL_INTEGRATION_KEY");
    if (!key) throw new SetupError("integration_unavailable", 503);
    const payEnabled = payAccessEnabled(user.id, (name) => Deno.env.get(name));
    if (body.action === "pay" && !payEnabled) {
      throw new SetupError("pay_unavailable", 503);
    }
    const response = await fetch(
      "https://lhxvbtiepsuohunfmnkm.supabase.co/functions/v1/pncl-hub-setup",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(40000),
        headers: {
          "Content-Type": "application/json",
          "X-PNCL-Integration-Key": key,
        },
        body: JSON.stringify({
          ...body,
          pnclUserId: user.id,
          pnclEmail: email,
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new SetupError(
        typeof payload.error === "string" && setupMessages[payload.error]
          ? payload.error
          : "integration_unavailable",
        [400, 401, 409, 429, 503].includes(response.status)
          ? response.status
          : 502,
        response.status === 429
          ? retryAfterSeconds(response.headers.get("Retry-After"))
          : undefined,
      );
    }
    if (body.action === "phone_start" || body.action === "phone_check") {
      const field = body.action === "phone_start"
        ? "phoneSent"
        : "phoneVerified";
      if (payload[field] !== true) {
        throw new SetupError("integration_unavailable", 502);
      }
      return json(200, { [field]: true });
    }
    const status = sanitizeSetupStatus(payload, email);
    if (body.action === "pay") {
      if (!status.ready) throw new SetupError("setup_incomplete");
      // Re-read Auth and onboarding after the cross-project call; stale JWT claims never choose the SSO email.
      const fresh = await adminClient.auth.admin.getUserById(user.id);
      if (
        fresh.error || !fresh.data.user ||
        await requireHubWorkEmail(fresh.data.user, adminClient) !== email
      ) throw new SetupError("work_email_review_required");
      const link = await issuePayLink(
        email,
        user.id,
        Deno.env.get("PNCL_PAY_PRIVATE_KEY_PEM")!,
        PAY_REDEEM_PATH,
      );
      audit("link_issued");
      return json(200, link);
    }
    return json(200, { ...status, payEnabled });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return json(e.status, { error: e.code, message: e.message });
    }
    const error = e instanceof SetupError ? e : new SetupError(
      e instanceof SyntaxError ? "invalid_request" : "integration_unavailable",
      e instanceof SyntaxError ? 400 : 502,
    );
    if (payRequest) audit(error.code);
    return json(error.status, {
      error: error.code,
      message: setupMessages[error.code] ??
        setupMessages.integration_unavailable,
    }, error.retryAfter);
  }
});
