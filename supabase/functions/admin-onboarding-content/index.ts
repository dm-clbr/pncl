import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { AdminAuthError, requireAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { loadOnboardingContent } from "../_shared/onboardingContent.ts";
import { ONBOARDING_CONTENT_BUCKET, validateOnboardingAsset } from "../_shared/onboardingContentRules.ts";

serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== "GET" && req.method !== "POST") return errorResponse("Method not allowed", 405);
  try {
    const { user, adminClient } = await requireAdmin(req);
    if (req.method === "GET") return jsonResponse({ flows: await Promise.all([loadOnboardingContent(adminClient, "loa"), loadOnboardingContent(adminClient, "ibo")]) });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("Choose a file to upload.", 400);
    const { designation, kind, extension } = validateOnboardingAsset(form.get("designation"), form.get("kind"), file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === "ica") {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("This file is not a PDF.");
      let pdf;
      try { pdf = await PDFDocument.load(bytes); } catch { throw new Error("Upload a readable PDF without password protection."); }
      if (pdf.getPageCount() < 1 || pdf.getPageCount() > 100) throw new Error("ICA documents must contain 1–100 pages.");
    } else {
      const mp4 = new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
      const webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      if ((extension === "mp4" && !mp4) || (extension === "webm" && !webm)) throw new Error("The file does not match its video format.");
    }
    const id = crypto.randomUUID();
    const path = `${designation}/${kind}/${id}.${extension}`;
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
    const { error: uploadError } = await adminClient.storage.from(ONBOARDING_CONTENT_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const publicUrl = adminClient.storage.from(ONBOARDING_CONTENT_BUCKET).getPublicUrl(path).data.publicUrl;
    const { error: saveError } = await adminClient.rpc("publish_onboarding_content", { asset: {
      id, designation, kind, path, filename: file.name.slice(0, 200), content_type: file.type,
      size_bytes: file.size, sha256, created_by: user.id,
    }, video_url: kind === "ica" ? null : publicUrl });
    if (saveError) {
      // Never remove on an uncertain transaction outcome: the file may already be active.
      throw new Error("The file uploaded, but publication could not be confirmed. Reload to check before retrying.");
    }
    return jsonResponse({ flow: await loadOnboardingContent(adminClient, designation), message: `${designation.toUpperCase()} content saved.` });
  } catch (error) {
    if (error instanceof AdminAuthError) return errorResponse(error.message, error.status, error.code);
    return errorResponse(error instanceof Error ? error.message : "Unable to save onboarding content.", 400);
  }
});
