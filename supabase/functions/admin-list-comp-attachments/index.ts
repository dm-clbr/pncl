import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requireGenesisAdminOrAdmin } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";
import {
  createCompAttachmentSignedUrl,
  mapCompAttachmentSummary,
  type CompAttachmentRecord,
} from "../_shared/portalCompAttachments.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const { adminClient } = await requireGenesisAdminOrAdmin(req);
    const userId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";

    let query = adminClient
      .from("portal_comp_attachments")
      .select("*")
      .order("assigned_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const attachments = await Promise.all(
      ((data ?? []) as CompAttachmentRecord[]).map(async (record) => {
        let unsignedUrl: string | null = null;
        let signedUrl: string | null = null;
        try {
          unsignedUrl = await createCompAttachmentSignedUrl(adminClient, record.unsigned_pdf_path);
        } catch {
          unsignedUrl = null;
        }
        if (record.signed_pdf_path) {
          try {
            signedUrl = await createCompAttachmentSignedUrl(adminClient, record.signed_pdf_path);
          } catch {
            signedUrl = null;
          }
        }
        return {
          ...mapCompAttachmentSummary(record),
          unsignedUrl,
          signedUrl,
        };
      }),
    );

    return jsonResponse({ attachments });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load comp attachments";
    logOnboarding("admin_list_comp_attachments_failed", { error: message }, "error");
    return errorResponse(message, 500, "load_failed");
  }
});
