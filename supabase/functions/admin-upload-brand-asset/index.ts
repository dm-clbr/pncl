import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const BUCKET = "portal-brand-assets";
const MAX_BYTES = 26_214_400;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
]);

function extensionForType(contentType: string, originalName: string): string {
  const fromName = originalName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;

  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "application/pdf":
      return "pdf";
    case "application/zip":
    case "application/x-zip-compressed":
      return "zip";
    default:
      return "bin";
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "upload";
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { user, adminClient } = await requireAdmin(req);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse("File is required", 400, "missing_file");
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return errorResponse("Unsupported file type", 400, "invalid_type");
    }

    if (file.size > MAX_BYTES) {
      return errorResponse("File must be 25 MB or smaller", 400, "file_too_large");
    }

    const extension = extensionForType(contentType, file.name);
    const path = `${crypto.randomUUID()}-${sanitizeFilename(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrl } = adminClient.storage.from(BUCKET).getPublicUrl(path);

    logOnboarding("admin_brand_asset_uploaded", {
      adminId: user.id,
      path,
      contentType,
      size: file.size,
    });

    return jsonResponse({
      url: publicUrl.publicUrl,
      path,
      contentType,
      fileName: file.name,
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to upload brand asset";
    logOnboarding("admin_brand_asset_upload_failed", { error: message }, "error");
    return errorResponse(message, 500, "upload_failed");
  }
});
