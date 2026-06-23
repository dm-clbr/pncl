import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

const BUCKET = "portal-dashboard-files";
const MAX_BYTES = 26_214_400;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionForType(contentType: string, originalName: string): string {
  const fromName = originalName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (fromName) return fromName;

  switch (contentType) {
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "application/vnd.ms-powerpoint":
      return "ppt";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "pptx";
    case "application/zip":
    case "application/x-zip-compressed":
      return "zip";
    case "text/plain":
      return "txt";
    case "text/csv":
      return "csv";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
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
    const sectionIdRaw = formData.get("sectionId");

    if (!(file instanceof File)) {
      return errorResponse("File is required", 400, "missing_file");
    }

    if (typeof sectionIdRaw !== "string" || !sectionIdRaw.trim()) {
      return errorResponse("Section id is required", 400, "missing_section");
    }

    const sectionId = sectionIdRaw.trim();

    const { data: section, error: sectionError } = await adminClient
      .from("portal_dashboard_sections")
      .select("id, section_type")
      .eq("id", sectionId)
      .maybeSingle();

    if (sectionError) {
      throw new Error(sectionError.message);
    }

    if (!section) {
      return errorResponse("Dashboard tab not found", 404, "section_not_found");
    }

    if (section.section_type !== "downloads") {
      return errorResponse("This tab is not a downloads tab", 400, "invalid_section_type");
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return errorResponse("Unsupported file type", 400, "invalid_type");
    }

    if (file.size > MAX_BYTES) {
      return errorResponse("File must be 25 MB or smaller", 400, "file_too_large");
    }

    const extension = extensionForType(contentType, file.name);
    const path = `${sectionId}/${crypto.randomUUID()}-${sanitizeFilename(file.name.replace(/\.[^.]+$/, ""))}.${extension}`;

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

    logOnboarding("admin_dashboard_file_uploaded", {
      adminId: user.id,
      sectionId,
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
    const message = error instanceof Error ? error.message : "Unable to upload dashboard file";
    logOnboarding("admin_dashboard_file_upload_failed", { error: message }, "error");
    return errorResponse(message, 500, "upload_failed");
  }
});
