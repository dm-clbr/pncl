import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getCompletedTodosFromMetadata } from "../_shared/portalTodos.ts";
import { logOnboarding } from "../_shared/logger.ts";
import type { PortalW9Record } from "../_shared/portalW9.ts";
import { resolveW9PdfPath } from "../_shared/portalW9Pdf.ts";
import { PORTAL_PROFILE_DOCUMENTS_BUCKET } from "../_shared/portalW9Documents.ts";

const W9_TODO_SLUG = "w9_setup";

interface ResetPortalW9Payload {
  userId: string;
}

function validatePayload(body: unknown): ResetPortalW9Payload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const userId = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!userId) throw new Error("userId is required");

  return { userId };
}

function buildArchivePath(userId: string, signedAt: string | null): string {
  const stampSource = signedAt ? new Date(signedAt) : new Date();
  const stamp = Number.isNaN(stampSource.getTime()) ? new Date() : stampSource;
  const label = stamp.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `${userId}/archive/w9-${label}.pdf`;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const payload = validatePayload(await req.json());

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
      payload.userId,
    );

    if (userError || !userData.user) {
      return errorResponse("User not found", 404, "user_not_found");
    }

    const { data: w9Data, error: w9Error } = await adminClient
      .from("portal_w9_forms")
      .select("*")
      .eq("user_id", payload.userId)
      .maybeSingle();

    if (w9Error) {
      throw new Error(w9Error.message);
    }

    if (!w9Data) {
      return errorResponse("This user has no W-9 on file.", 404, "w9_not_found");
    }

    const record = w9Data as PortalW9Record;
    const activePdfPath = resolveW9PdfPath(record);
    const archivePath = buildArchivePath(payload.userId, record.signed_at);
    let archived = false;

    const { error: copyError } = await adminClient.storage
      .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
      .copy(activePdfPath, archivePath);

    if (copyError) {
      // Missing PDF shouldn't block the reset; the form data row is the source of truth.
      logOnboarding("admin_reset_portal_w9_archive_failed", {
        userId: payload.userId,
        path: activePdfPath,
        error: copyError.message,
      }, "warn");
    } else {
      archived = true;
      const { error: removeError } = await adminClient.storage
        .from(PORTAL_PROFILE_DOCUMENTS_BUCKET)
        .remove([activePdfPath]);

      if (removeError) {
        throw new Error(`W-9 was archived but the active PDF could not be removed: ${removeError.message}`);
      }
    }

    const { error: deleteError } = await adminClient
      .from("portal_w9_forms")
      .delete()
      .eq("user_id", payload.userId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const completed = getCompletedTodosFromMetadata(
      userData.user.user_metadata as Record<string, unknown> | undefined,
    );
    delete completed[W9_TODO_SLUG];

    const { error: metadataError } = await adminClient.auth.admin.updateUserById(payload.userId, {
      user_metadata: {
        ...userData.user.user_metadata,
        completed_portal_todos: completed,
        // Shows the re-submit banner on the portal dashboard until a new W-9 is signed.
        w9_resign_required: true,
      },
    });

    if (metadataError) {
      throw new Error(metadataError.message);
    }

    const { error: auditError } = await adminClient
      .from("admin_audit_log")
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: payload.userId,
        action: "w9_reset",
        changes: {
          archivedPath: archived ? archivePath : null,
          previousSignedAt: record.signed_at,
          previousSignatureName: record.signature_name,
        },
      });

    if (auditError) {
      logOnboarding("admin_audit_log_write_failed", {
        userId: payload.userId,
        error: auditError.message,
      }, "warn");
    }

    logOnboarding("admin_reset_portal_w9", {
      adminId: adminUser.id,
      userId: payload.userId,
      archivedPath: archived ? archivePath : null,
    });

    return jsonResponse({
      userId: payload.userId,
      archivedPath: archived ? archivePath : null,
      message: archived
        ? "W-9 archived. The agent will be asked to fill out a new one."
        : "W-9 reset. The agent will be asked to fill out a new one.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to reset W-9";
    logOnboarding("admin_reset_portal_w9_failed", { error: message }, "error");
    return errorResponse(message, 500, "reset_failed");
  }
});
