import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const linkRepairMessages: Record<string, string> = {
  repair_available: "Completed onboarding has a verified existing Hub account that can be connected.",
  no_existing_account: "No existing Hub account was found. Review the identity before provisioning.",
  onboarding_incomplete: "Complete the outstanding onboarding or Google verification steps first.",
  onboarding_released: "This onboarding record is released and requires review.",
  onboarding_in_progress: "Provisioning is in progress. Refresh when it finishes.",
  identity_conflict: "The account identity or another enrollment conflicts with this record. Review it manually.",
  work_email_unverified: "The existing Hub account or work email is not currently eligible.",
  account_not_found: "The onboarding record or Hub account could not be found.",
  other_failure_requires_review: "A different setup failure needs review before connecting the account.",
  already_linked: "This onboarding record is already connected to a Hub account.",
};

export interface PortalLinkRepairStatus {
  candidateUserId: string | null;
  canRepair: boolean;
  reason: string;
  message: string;
}

export async function portalLinkRepairStatus(db: SupabaseClient, onboardingId: string, candidateUserId: string | null): Promise<PortalLinkRepairStatus> {
  const { data, error } = await db.rpc("portal_link_repair_status", { p_onboarding: onboardingId, p_user: candidateUserId });
  if (error || !data || typeof data.canRepair !== "boolean" || !linkRepairMessages[data.reason]) {
    throw new Error("Unable to verify onboarding account links. Refresh or contact support.");
  }
  return { candidateUserId, canRepair: data.canRepair && Boolean(candidateUserId), reason: data.reason, message: linkRepairMessages[data.reason] };
}
