import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  COMP_ATTACHMENT_BUCKET,
  decodeCompAttachmentPdf,
  getCompAttachmentUnsignedPath,
  mapCompAttachmentSummary,
  type CompAttachmentRecord,
} from "../_shared/portalCompAttachments.ts";
import { sendCompAttachmentAssignedEmail } from "../_shared/resend.ts";

function getSignUrl(): string {
  const siteUrl = Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
  return `${siteUrl.replace(/\/$/, "")}/portal/comp-agreement`;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const body = await req.json();

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return errorResponse("userId is required", 400, "invalid_request");
    }

    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : "Compensation Attachment";

    const pdfBytes = decodeCompAttachmentPdf(body.pdfBase64);

    const { data: targetUser, error: userError } = await adminClient.auth.admin.getUserById(userId);
    if (userError || !targetUser.user) {
      return errorResponse("User not found", 404, "not_found");
    }

    const attachmentId = crypto.randomUUID();
    const unsignedPath = getCompAttachmentUnsignedPath(userId, attachmentId);

    const { error: uploadError } = await adminClient.storage
      .from(COMP_ATTACHMENT_BUCKET)
      .upload(unsignedPath, pdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data, error } = await adminClient
      .from("portal_comp_attachments")
      .insert({
        id: attachmentId,
        user_id: userId,
        title,
        unsigned_pdf_path: unsignedPath,
        status: "pending",
        assigned_by: adminUser.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Unable to save comp attachment");
    }

    // Best-effort agent email; assignment already succeeded.
    try {
      const firstName = typeof targetUser.user.user_metadata?.first_name === "string"
        ? targetUser.user.user_metadata.first_name
        : "";
      if (targetUser.user.email) {
        await sendCompAttachmentAssignedEmail({
          to: targetUser.user.email,
          firstName,
          title,
          signUrl: getSignUrl(),
        });
      }
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : "Email failed";
      logOnboarding("comp_attachment_email_failed", { userId, error: message }, "warn");
    }

    logOnboarding("comp_attachment_assigned", { userId, attachmentId, assignedBy: adminUser.id });

    return jsonResponse({
      attachment: mapCompAttachmentSummary(data as CompAttachmentRecord),
      message: "Comp attachment assigned. The agent has been notified.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to assign comp attachment";
    logOnboarding("comp_attachment_assign_failed", { error: message }, "error");
    return errorResponse(message, 400, "assign_failed");
  }
});
