import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptSecret, encryptSecret, generateHandoffToken, hashHandoffToken, validateHandoffToken } from "./security.ts";

export class EnrollmentHandoffError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

/** Server-only. Reuse the active secret so copying a link cannot revoke one already sent. */
export async function getOrCreateEnrollmentHandoff(
  client: Pick<SupabaseClient, "from">,
  onboardingId: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: string; reused: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: record, error } = await client.from("onboarding_records")
      .select("id, handoff_token_hash, handoff_token_expires_at, handoff_token_encrypted, released_at")
      .eq("id", onboardingId).maybeSingle();
    if (error) throw new Error("Unable to read the saved enrollment");
    if (!record) throw new EnrollmentHandoffError("Enrollment not found", 404, "not_found");
    if (record.released_at) {
      throw new EnrollmentHandoffError("This enrollment was released. Use the agent’s active enrollment instead.", 409, "enrollment_released");
    }

    if (record.handoff_token_encrypted && Date.parse(record.handoff_token_expires_at) > now) {
      const token = await decryptSecret(record.handoff_token_encrypted);
      // A deliberate rotation elsewhere must invalidate this cache too.
      if (await validateHandoffToken(token, record.handoff_token_hash)) {
        return { token, expiresAt: record.handoff_token_expires_at, reused: true };
      }
    }

    const token = generateHandoffToken();
    const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const { data: updated, error: updateError } = await client.from("onboarding_records")
      .update({
        handoff_token_hash: await hashHandoffToken(token),
        handoff_token_encrypted: await encryptSecret(token),
        handoff_token_expires_at: expiresAt,
      })
      .eq("id", onboardingId)
      .eq("handoff_token_hash", record.handoff_token_hash)
      .eq("handoff_token_expires_at", record.handoff_token_expires_at)
      .is("released_at", null)
      .select("id").maybeSingle();
    if (updateError) throw new Error("Unable to save the resume link");
    if (updated) return { token, expiresAt, reused: false };
    // Another request won the update. Read and return its link, never overwrite it.
  }
  throw new EnrollmentHandoffError("The enrollment changed. Please copy the resume link again.", 409, "enrollment_changed");
}
