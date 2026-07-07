import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { listPortalUsers } from "../_shared/adminAgents.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import { listIcaSignedUserIds } from "../_shared/portalIca.ts";
import type { CompAttachmentRecord } from "../_shared/portalCompAttachments.ts";

interface ContractingProfileRow {
  user_id: string;
  first_name: string;
  last_name: string;
  npn: string | null;
  eo_policy_number: string | null;
  eo_certificate_path: string | null;
  licensing_notification_sent_at: string | null;
  contracting_initiated_at: string | null;
  updated_at: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);

    const [users, { data: profileRows, error: profileError }] = await Promise.all([
      listPortalUsers(adminClient),
      adminClient
        .from("portal_profiles")
        .select(
          "user_id, first_name, last_name, npn, eo_policy_number, eo_certificate_path, licensing_notification_sent_at, contracting_initiated_at, updated_at",
        ),
    ]);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const profilesByUserId = new Map<string, ContractingProfileRow>();
    for (const row of (profileRows ?? []) as ContractingProfileRow[]) {
      profilesByUserId.set(row.user_id, row);
    }

    const userIds = users.map((user) => user.id);

    const [icaSignedUserIds, { data: icaRows, error: icaError }, { data: compRows, error: compError }] =
      await Promise.all([
        listIcaSignedUserIds(adminClient, userIds),
        adminClient.from("portal_ica_signatures").select("user_id, signed_at"),
        adminClient
          .from("portal_comp_attachments")
          .select("*")
          .order("assigned_at", { ascending: false }),
      ]);

    if (icaError) throw new Error(icaError.message);
    if (compError) throw new Error(compError.message);

    const icaSignedAtByUserId = new Map<string, string>();
    for (const row of icaRows ?? []) {
      if (row.user_id && row.signed_at) {
        icaSignedAtByUserId.set(row.user_id, row.signed_at);
      }
    }

    // Latest attachment per user drives the comp status column.
    const latestCompByUserId = new Map<string, CompAttachmentRecord>();
    for (const row of (compRows ?? []) as CompAttachmentRecord[]) {
      if (!latestCompByUserId.has(row.user_id)) {
        latestCompByUserId.set(row.user_id, row);
      }
    }

    const rows = users.map((user) => {
      const profile = profilesByUserId.get(user.id);
      const npn = profile?.npn?.trim() ?? "";
      const eoPolicyNumber = profile?.eo_policy_number?.trim() ?? "";
      const fullName = typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";
      const profileName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
      const latestComp = latestCompByUserId.get(user.id) ?? null;

      return {
        userId: user.id,
        name: profileName || fullName || user.email?.split("@")[0] || "Agent",
        email: user.email ?? "",
        npn: npn || null,
        eoPolicyNumber: eoPolicyNumber || null,
        hasEoCertificate: Boolean(profile?.eo_certificate_path),
        licensingReady: Boolean(npn && eoPolicyNumber),
        licensingCompletedAt: profile?.licensing_notification_sent_at ?? null,
        contractingInitiatedAt: profile?.contracting_initiated_at ?? null,
        icaSigned: icaSignedUserIds.has(user.id),
        icaSignedAt: icaSignedAtByUserId.get(user.id) ?? null,
        compStatus: latestComp ? latestComp.status : "none",
        compTitle: latestComp?.title ?? null,
        compAssignedAt: latestComp?.assigned_at ?? null,
        compSignedAt: latestComp?.signed_at ?? null,
      };
    });

    return jsonResponse({ rows });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load contracting queue";
    logOnboarding("admin_list_contracting_failed", { error: message }, "error");
    return errorResponse(message, 500, "load_failed");
  }
});
