import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildAgentSummaries,
  getDescendantUserIds,
} from "../_shared/adminAgents.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import {
  canonicalPartnerPair,
  findPartnerLinkForUser,
} from "../_shared/hierarchyPartners.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { isValidReferrerUserId } from "../_shared/onboarding.ts";

interface LinkPartnersPayload {
  userIdA: string;
  userIdB: string;
}

function validatePayload(body: unknown): LinkPartnersPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userIdA = typeof data.userIdA === "string" ? data.userIdA.trim() : "";
  const userIdB = typeof data.userIdB === "string" ? data.userIdB.trim() : "";

  if (!isValidReferrerUserId(userIdA) || !isValidReferrerUserId(userIdB)) {
    throw new Error("Valid user ids are required");
  }

  if (userIdA === userIdB) {
    throw new Error("Cannot link a user to themselves");
  }

  return { userIdA, userIdB };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());
    const agents = await buildAgentSummaries(adminClient);
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const agentA = agentsById.get(payload.userIdA);
    const agentB = agentsById.get(payload.userIdB);

    if (!agentA || !agentB) {
      return errorResponse("Both users must be portal agents", 404, "agent_not_found");
    }

    const existingLinks = await Promise.all([
      findPartnerLinkForUser(adminClient, payload.userIdA),
      findPartnerLinkForUser(adminClient, payload.userIdB),
    ]);

    if (existingLinks[0] || existingLinks[1]) {
      return errorResponse(
        "One or both users already have a business partner link",
        400,
        "partner_already_linked",
      );
    }

    const descendantsA = await getDescendantUserIds(adminClient, payload.userIdA);
    const descendantsB = await getDescendantUserIds(adminClient, payload.userIdB);

    if (descendantsA.has(payload.userIdB) || descendantsB.has(payload.userIdA)) {
      return errorResponse(
        "Partners cannot be in each other's downline",
        400,
        "partner_downline_conflict",
      );
    }

    const referrerA = agentA.referrerId ?? null;
    const referrerB = agentB.referrerId ?? null;
    if (referrerA !== referrerB) {
      return errorResponse(
        "Partners must share the same upline",
        400,
        "partner_upline_mismatch",
      );
    }

    const [userIdA, userIdB] = canonicalPartnerPair(payload.userIdA, payload.userIdB);
    const { error } = await adminClient.from("hierarchy_partner_links").insert({
      user_id_a: userIdA,
      user_id_b: userIdB,
      created_by_admin_id: user.id,
    });

    if (error) {
      logOnboarding("admin_link_partners_failed", { error: error.message }, "error");
      return errorResponse("Unable to link partners", 500, "link_failed");
    }

    logOnboarding("admin_partners_linked", {
      userIdA,
      userIdB,
      adminUserId: user.id,
    });

    return jsonResponse({
      userIdA,
      userIdB,
      message: "Business partners linked.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to link partners";
    logOnboarding("admin_link_partners_request_failed", { error: message }, "error");
    return errorResponse(message, 400, "invalid_request");
  }
});
