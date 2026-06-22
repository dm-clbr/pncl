import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const BUCKET = "portal-incentives";
const MAX_IMAGE_BYTES = 1_250_000;
const MAX_VIDEO_BYTES = 52_428_800;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function extensionForType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
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
    const isImage = ALLOWED_IMAGE_TYPES.has(contentType);
    const isVideo = ALLOWED_VIDEO_TYPES.has(contentType);

    if (!isImage && !isVideo) {
      return errorResponse("Unsupported file type", 400, "invalid_type");
    }

    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > maxBytes) {
      return errorResponse(
        isImage ? "Image must be 1 MB or smaller after compression" : "Video must be 50 MB or smaller",
        400,
        "file_too_large",
      );
    }

    const extension = extensionForType(contentType);
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

    logOnboarding("admin_incentive_media_uploaded", {
      adminId: user.id,
      path,
      contentType,
      size: file.size,
    });

    return jsonResponse({ url: publicUrl.publicUrl, path });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to upload media";
    logOnboarding("admin_incentive_media_upload_failed", { error: message }, "error");
    return errorResponse(message, 500, "upload_failed");
  }
});
