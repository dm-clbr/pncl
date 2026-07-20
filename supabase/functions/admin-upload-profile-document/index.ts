import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import {
  isAdminProfileDocumentType,
  uploadAdminProfileDocument,
} from "../_shared/adminProfileDocumentUpload.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const MAX_BYTES = 5 * 1024 * 1024;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user: adminUser, adminClient } = await requireAdmin(req);
    const formData = await req.formData();

    const userId = typeof formData.get("userId") === "string" ? formData.get("userId")!.trim() : "";
    const documentTypeRaw = typeof formData.get("documentType") === "string"
      ? formData.get("documentType")!.trim()
      : "";
    const label = typeof formData.get("label") === "string" ? formData.get("label")!.trim() : "";
    const file = formData.get("file");

    if (!userId) {
      return errorResponse("userId is required", 400, "invalid_payload");
    }
    if (!isAdminProfileDocumentType(documentTypeRaw)) {
      return errorResponse("Invalid documentType", 400, "invalid_payload");
    }
    if (!(file instanceof File)) {
      return errorResponse("File is required", 400, "missing_file");
    }
    if (file.size > MAX_BYTES) {
      return errorResponse("File must be 5 MB or smaller", 400, "file_too_large");
    }

    const result = await uploadAdminProfileDocument(adminClient, {
      userId,
      documentType: documentTypeRaw,
      file,
      label: label || undefined,
    });

    const { error: auditError } = await adminClient.from("admin_audit_log").insert({
      admin_user_id: adminUser.id,
      target_user_id: userId,
      action: "profile_document_uploaded",
      changes: {
        document_type: result.documentType,
        path: result.path,
        file_name: result.fileName,
        label: result.label ?? null,
      },
    });

    if (auditError) {
      logOnboarding("admin_audit_log_write_failed", { userId, error: auditError.message }, "warn");
    }

    logOnboarding("admin_profile_document_uploaded", {
      adminUserId: adminUser.id,
      userId,
      documentType: result.documentType,
      path: result.path,
      fileName: result.fileName,
    });

    return jsonResponse({
      message: "Document uploaded.",
      ...result,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to upload profile document";
    logOnboarding("admin_upload_profile_document_failed", { error: message }, "error");
    return errorResponse(message, 400, "upload_failed");
  }
});
