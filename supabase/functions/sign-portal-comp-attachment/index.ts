import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  COMP_AGREEMENT_TODO_SLUG,
  COMP_ATTACHMENT_BUCKET,
  createCompAttachmentSignedUrl,
  generateSignedCompAttachmentPdf,
  getCompAttachmentSignedPath,
  mapCompAttachmentSummary,
  type CompAttachmentRecord,
} from "../_shared/portalCompAttachments.ts";

function getCompletedTodos(metadata: Record<string, unknown> | undefined): Record<string, boolean> {
  const value = metadata?.completed_portal_todos;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.headers.get("x-real-ip");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const body = await req.json();

    const attachmentId = typeof body.attachmentId === "string" ? body.attachmentId.trim() : "";
    const signatureName = typeof body.signatureName === "string" ? body.signatureName.trim() : "";

    if (!attachmentId) {
      return errorResponse("attachmentId is required", 400, "invalid_request");
    }
    if (!signatureName) {
      return errorResponse("Type your legal name to sign", 400, "invalid_signature");
    }
    if (body.agreementAccepted !== true) {
      return errorResponse("You must agree to the compensation attachment", 400, "not_accepted");
    }

    const { data: row, error: loadError } = await adminClient
      .from("portal_comp_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }
    if (!row) {
      return errorResponse("Comp attachment not found", 404, "not_found");
    }

    const record = row as CompAttachmentRecord;
    if (record.status === "signed") {
      return errorResponse("This comp attachment is already signed.", 409, "already_signed");
    }

    const { data: unsignedFile, error: downloadError } = await adminClient.storage
      .from(COMP_ATTACHMENT_BUCKET)
      .download(record.unsigned_pdf_path);

    if (downloadError || !unsignedFile) {
      throw new Error(downloadError?.message ?? "Unable to load comp attachment PDF");
    }

    const signedAt = new Date();
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    const signedPdfBytes = await generateSignedCompAttachmentPdf(
      new Uint8Array(await unsignedFile.arrayBuffer()),
      {
        title: record.title,
        signatureName,
        signedAt,
        ipAddress,
        userAgent,
      },
    );

    const signedPath = getCompAttachmentSignedPath(user.id, record.id);
    const { error: uploadError } = await adminClient.storage
      .from(COMP_ATTACHMENT_BUCKET)
      .upload(signedPath, signedPdfBytes, {
        upsert: true,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: updated, error: updateError } = await adminClient
      .from("portal_comp_attachments")
      .update({
        status: "signed",
        signed_pdf_path: signedPath,
        signature_name: signatureName,
        signed_at: signedAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        updated_at: signedAt.toISOString(),
      })
      .eq("id", record.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Unable to save signature");
    }

    // Completes the "Sign your comp agreement" checklist item.
    const completedTodos = {
      ...getCompletedTodos(user.user_metadata),
      [COMP_AGREEMENT_TODO_SLUG]: true,
    };
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        completed_portal_todos: completedTodos,
      },
    });
    if (metadataError) {
      logOnboarding("comp_attachment_todo_update_failed", {
        userId: user.id,
        error: metadataError.message,
      }, "warn");
    }

    const documentUrl = await createCompAttachmentSignedUrl(adminClient, signedPath);

    logOnboarding("comp_attachment_signed", { userId: user.id, attachmentId: record.id });

    return jsonResponse({
      attachment: {
        ...mapCompAttachmentSummary(updated as CompAttachmentRecord),
        documentUrl,
      },
      message: "Compensation attachment signed successfully.",
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to sign comp attachment";
    logOnboarding("comp_attachment_sign_failed", { error: message }, "error");
    return errorResponse(message, 400, "sign_failed");
  }
});
