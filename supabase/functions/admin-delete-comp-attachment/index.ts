import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  COMP_ATTACHMENT_BUCKET,
  type CompAttachmentRecord,
} from "../_shared/portalCompAttachments.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireAdmin(req);
    const body = await req.json();
    const attachmentId = typeof body.attachmentId === "string" ? body.attachmentId.trim() : "";
    if (!attachmentId) {
      return errorResponse("attachmentId is required", 400, "invalid_request");
    }

    const { data: row, error: loadError } = await adminClient
      .from("portal_comp_attachments")
      .select("*")
      .eq("id", attachmentId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }
    if (!row) {
      return errorResponse("Comp attachment not found", 404, "not_found");
    }

    const record = row as CompAttachmentRecord;
    if (record.status === "signed") {
      return errorResponse(
        "A signed comp attachment cannot be deleted.",
        409,
        "already_signed",
      );
    }

    const { error: deleteError } = await adminClient
      .from("portal_comp_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("status", "pending");

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await adminClient.storage
      .from(COMP_ATTACHMENT_BUCKET)
      .remove([record.unsigned_pdf_path]);

    logOnboarding("comp_attachment_deleted", { attachmentId, userId: record.user_id });

    return jsonResponse({ message: "Comp attachment removed." });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to delete comp attachment";
    logOnboarding("comp_attachment_delete_failed", { error: message }, "error");
    return errorResponse(message, 400, "delete_failed");
  }
});
