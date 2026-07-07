import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
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
    const { user, adminClient } = await requirePortalUser(req);

    const { data, error } = await adminClient
      .from("portal_comp_attachments")
      .select("*")
      .eq("user_id", user.id)
      .order("assigned_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const attachments = await Promise.all(
      ((data ?? []) as CompAttachmentRecord[]).map(async (record) => {
        let documentUrl: string | null = null;
        try {
          documentUrl = await createCompAttachmentSignedUrl(
            adminClient,
            record.signed_pdf_path ?? record.unsigned_pdf_path,
          );
        } catch {
          documentUrl = null;
        }
        return {
          ...mapCompAttachmentSummary(record),
          documentUrl,
        };
      }),
    );

    return jsonResponse({ attachments });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load comp attachments";
    logOnboarding("list_portal_comp_attachments_failed", { error: message }, "error");
    return errorResponse(message, 500, "load_failed");
  }
});
