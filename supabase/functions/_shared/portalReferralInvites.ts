import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  ACTIVE_ONBOARDING_STATUSES_FOR_DEDUP,
  assertAdminCompAllowed,
  assertReferralCompAllowed,
  getReferralInviteExpiresAt,
  isValidCompLevel,
} from "./compLevel.ts";
import { findPartnerLinkForUser, type PartnerLinkRow } from "./hierarchyPartners.ts";
import { isValidReferrerUserId, resolveReferrer } from "./onboarding.ts";

export type ReferralInviteStatus = "pending" | "consumed" | "expired" | "revoked";

export interface ReferralInviteRow {
  id: string;
  referrer_user_id: string;
  comp_level: number;
  recipient_label: string | null;
  status: ReferralInviteStatus;
  consumed_at: string | null;
  consumed_by_onboarding_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface ResolvedReferralInvite {
  invite: ReferralInviteRow;
  referrerId: string;
  referrerName: string;
  compLevel: number;
}

export interface ReferralInviteSummary {
  id: string;
  compLevel: number;
  recipientLabel: string | null;
  status: ReferralInviteStatus;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  link: string;
  referrerUserId: string;
  sharedFromPartner: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidReferralInviteId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function buildReferralInvitePath(inviteId: string): string {
  return `/onboarding?ref=${encodeURIComponent(inviteId)}`;
}

export function buildReferralInviteUrl(inviteId: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}${buildReferralInvitePath(inviteId)}`;
}

function getSiteUrl(): string {
  return Deno.env.get("PNCL_SITE_URL") ?? "http://localhost:8080";
}

export function toReferralInviteSummary(
  invite: ReferralInviteRow,
  viewingUserId?: string,
): ReferralInviteSummary {
  return {
    id: invite.id,
    compLevel: invite.comp_level,
    recipientLabel: invite.recipient_label,
    status: invite.status,
    expiresAt: invite.expires_at,
    consumedAt: invite.consumed_at,
    createdAt: invite.created_at,
    link: buildReferralInviteUrl(invite.id, getSiteUrl()),
    referrerUserId: invite.referrer_user_id,
    sharedFromPartner: viewingUserId ? invite.referrer_user_id !== viewingUserId : false,
  };
}

function getLinkedReferrerUserIds(
  userId: string,
  partnerLink: PartnerLinkRow | null,
): string[] {
  if (!partnerLink) return [userId];
  const partnerId = partnerLink.user_id_a === userId
    ? partnerLink.user_id_b
    : partnerLink.user_id_a;
  return [userId, partnerId];
}

export function isInviteExpired(invite: Pick<ReferralInviteRow, "expires_at">, now = Date.now()): boolean {
  return new Date(invite.expires_at).getTime() <= now;
}

export async function loadReferrerCompLevel(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("portal_profiles")
    .select("comp_level")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load comp level");
  }

  const compLevel = data?.comp_level;
  return typeof compLevel === "number" && isValidCompLevel(compLevel) ? compLevel : null;
}

export async function findReferralInviteById(
  supabase: SupabaseClient,
  inviteId: string,
): Promise<ReferralInviteRow | null> {
  if (!isValidReferralInviteId(inviteId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("portal_referral_invites")
    .select("*")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load referral invite");
  }

  return (data as ReferralInviteRow | null) ?? null;
}

export async function resolveReferralInviteForOnboarding(
  supabase: SupabaseClient,
  inviteId: string,
): Promise<ResolvedReferralInvite | null> {
  const invite = await findReferralInviteById(supabase, inviteId);
  if (!invite) {
    return null;
  }

  if (invite.status !== "pending") {
    throw new Error("This referral link has already been used or is no longer valid.");
  }

  if (isInviteExpired(invite)) {
    throw new Error("This referral link has expired. Ask your upline for a new invite link.");
  }

  const referrer = await resolveReferrer(supabase, invite.referrer_user_id);
  if (!referrer) {
    throw new Error("This referral link is invalid or expired.");
  }

  return {
    invite,
    referrerId: referrer.id,
    referrerName: referrer.name,
    compLevel: invite.comp_level,
  };
}

export async function resolveReferralInvitePublicInfo(
  supabase: SupabaseClient,
  ref: string,
): Promise<ResolvedReferralInvite> {
  const resolved = await resolveReferralInviteForOnboarding(supabase, ref);
  if (resolved) {
    return resolved;
  }

  if (isValidReferrerUserId(ref)) {
    const legacyReferrer = await resolveReferrer(supabase, ref);
    if (legacyReferrer) {
      throw new Error(
        "This referral link is no longer valid. Ask your upline for a new personal invite link.",
      );
    }
  }

  throw new Error("This referral link is invalid or expired.");
}

export async function createReferralInvite(
  supabase: SupabaseClient,
  referrerUserId: string,
  compLevel: number,
  recipientLabel: string,
): Promise<ReferralInviteRow> {
  if (!isValidCompLevel(compLevel)) {
    throw new Error("Invalid comp level.");
  }

  const referrerCompLevel = await loadReferrerCompLevel(supabase, referrerUserId);
  if (referrerCompLevel == null) {
    throw new Error("Your comp level must be set before you can create referral links.");
  }

  assertReferralCompAllowed(referrerCompLevel, compLevel);

  const label = recipientLabel.trim();
  if (!label) {
    throw new Error("Add a nickname for this recruit.");
  }

  const { data, error } = await supabase
    .from("portal_referral_invites")
    .insert({
      referrer_user_id: referrerUserId,
      comp_level: compLevel,
      recipient_label: label,
      expires_at: getReferralInviteExpiresAt(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Unable to create referral invite");
  }

  return data as ReferralInviteRow;
}

export async function listReferralInvitesForUser(
  supabase: SupabaseClient,
  referrerUserId: string,
  limit = 50,
): Promise<ReferralInviteRow[]> {
  const partnerLink = await findPartnerLinkForUser(supabase, referrerUserId);
  const referrerIds = getLinkedReferrerUserIds(referrerUserId, partnerLink);

  const { data, error } = await supabase
    .from("portal_referral_invites")
    .select("*")
    .in("referrer_user_id", referrerIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error("Unable to load referral invites");
  }

  return (data ?? []) as ReferralInviteRow[];
}

export async function claimReferralInvite(
  supabase: SupabaseClient,
  inviteId: string,
): Promise<ReferralInviteRow> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("portal_referral_invites")
    .update({
      status: "consumed",
      consumed_at: nowIso,
    })
    .eq("id", inviteId)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error("Unable to claim referral invite");
  }

  if (!data) {
    throw new Error("This referral link has already been used or is no longer valid.");
  }

  return data as ReferralInviteRow;
}

export async function releaseReferralInvite(
  supabase: SupabaseClient,
  inviteId: string,
): Promise<void> {
  const { error } = await supabase
    .from("portal_referral_invites")
    .update({
      status: "pending",
      consumed_at: null,
      consumed_by_onboarding_id: null,
    })
    .eq("id", inviteId)
    .eq("status", "consumed");

  if (error) {
    throw new Error("Unable to release referral invite");
  }
}

export async function attachOnboardingToReferralInvite(
  supabase: SupabaseClient,
  inviteId: string,
  onboardingId: string,
): Promise<void> {
  const { error } = await supabase
    .from("portal_referral_invites")
    .update({ consumed_by_onboarding_id: onboardingId })
    .eq("id", inviteId)
    .eq("status", "consumed");

  if (error) {
    throw new Error("Unable to finalize referral invite");
  }
}

export async function findActiveOnboardingBySsnHash(
  supabase: SupabaseClient,
  ssnHash: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("id, status, workspace_email")
    .eq("ssn_hash", ssnHash)
    .not("status", "eq", "expired");

  if (error) {
    throw new Error("Unable to verify applicant identity");
  }

  return (data ?? []).some((row) => {
    const status = row.status as string;
    if ((ACTIVE_ONBOARDING_STATUSES_FOR_DEDUP as readonly string[]).includes(status)) {
      return true;
    }
    return status === "failed" && Boolean(row.workspace_email);
  });
}

/**
 * Phone numbers are attached to Google accounts as recovery info, and Google
 * rate-limits SMS verification per phone number across accounts. Reusing a
 * phone across onboardings burns the number, so treat it like SSN dedup.
 */
export async function findActiveOnboardingByPhoneNumber(
  supabase: SupabaseClient,
  phoneNumber: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("id, status, workspace_email")
    .eq("phone_number", phoneNumber)
    .not("status", "eq", "expired");

  if (error) {
    throw new Error("Unable to verify applicant phone number");
  }

  return (data ?? []).some((row) => {
    const status = row.status as string;
    if ((ACTIVE_ONBOARDING_STATUSES_FOR_DEDUP as readonly string[]).includes(status)) {
      return true;
    }
    return status === "failed" && Boolean(row.workspace_email);
  });
}

export async function upsertPortalProfileCompLevel(
  supabase: SupabaseClient,
  userId: string,
  compLevel: number,
  firstName: string,
  lastName: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("portal_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("portal_profiles")
      .update({ comp_level: compLevel })
      .eq("user_id", userId);

    if (error) {
      throw new Error("Unable to save comp level on profile");
    }
    return;
  }

  const { error } = await supabase
    .from("portal_profiles")
    .insert({
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      comp_level: compLevel,
    });

  if (error) {
    throw new Error("Unable to create profile with comp level");
  }
}

interface ResolvedPortalUserOnboarding {
  referrerUserId: string | null;
  hasOnboardingRecord: boolean;
}

async function resolvePortalUserOnboarding(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
  onboardingId: string | null,
): Promise<ResolvedPortalUserOnboarding> {
  const select = "referrer_user_id";

  if (onboardingId) {
    const { data, error } = await supabase
      .from("onboarding_records")
      .select(select)
      .eq("id", onboardingId)
      .not("status", "eq", "failed")
      .maybeSingle();

    if (error) {
      throw new Error("Unable to load onboarding record");
    }

    if (data) {
      const referrerUserId = data.referrer_user_id;
      return {
        hasOnboardingRecord: true,
        referrerUserId: typeof referrerUserId === "string" && referrerUserId.trim()
          ? referrerUserId
          : null,
      };
    }
  }

  const { data: byUserId, error: byUserIdError } = await supabase
    .from("onboarding_records")
    .select(select)
    .eq("supabase_user_id", userId)
    .not("status", "eq", "failed")
    .maybeSingle();

  if (byUserIdError) {
    throw new Error("Unable to load onboarding record");
  }

  if (byUserId) {
    const referrerUserId = byUserId.referrer_user_id;
    return {
      hasOnboardingRecord: true,
      referrerUserId: typeof referrerUserId === "string" && referrerUserId.trim()
        ? referrerUserId
        : null,
    };
  }

  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (normalizedEmail) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("onboarding_records")
      .select(select)
      .eq("workspace_email", normalizedEmail)
      .not("status", "eq", "failed")
      .maybeSingle();

    if (byEmailError) {
      throw new Error("Unable to load onboarding record");
    }

    if (byEmail) {
      const referrerUserId = byEmail.referrer_user_id;
      return {
        hasOnboardingRecord: true,
        referrerUserId: typeof referrerUserId === "string" && referrerUserId.trim()
          ? referrerUserId
          : null,
      };
    }
  }

  return { hasOnboardingRecord: false, referrerUserId: null };
}

function resolveProfileNamesFromUser(
  user: { email?: string | null; user_metadata?: Record<string, unknown> },
): { firstName: string; lastName: string } {
  const metadata = user.user_metadata ?? {};
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
    };
  }

  const localPart = user.email?.split("@")[0]?.trim() ?? "";
  const normalized = localPart.replace(/[.+_-]+/g, " ").trim();
  const parts = normalized.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "Agent", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function updateAgentCompLevel(
  supabase: SupabaseClient,
  userId: string,
  compLevel: number | null,
): Promise<void> {
  if (compLevel != null && !isValidCompLevel(compLevel)) {
    throw new Error("Invalid comp level.");
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    throw new Error("User not found");
  }

  const onboardingId = typeof userData.user.app_metadata?.onboarding_id === "string"
    ? userData.user.app_metadata.onboarding_id
    : null;

  const { referrerUserId, hasOnboardingRecord } = await resolvePortalUserOnboarding(
    supabase,
    userId,
    userData.user.email ?? null,
    onboardingId,
  );

  if (compLevel != null) {
    const referrerCompLevel = referrerUserId
      ? await loadReferrerCompLevel(supabase, referrerUserId)
      : null;
    assertAdminCompAllowed(
      referrerUserId,
      referrerCompLevel,
      compLevel,
      hasOnboardingRecord,
    );
  }

  const { data: existing } = await supabase
    .from("portal_profiles")
    .select("user_id, first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("portal_profiles")
      .update({ comp_level: compLevel })
      .eq("user_id", userId);

    if (error) {
      throw new Error("Unable to update comp level");
    }
    return;
  }

  if (compLevel == null) {
    return;
  }

  const { firstName, lastName } = resolveProfileNamesFromUser(userData.user);

  const { error } = await supabase
    .from("portal_profiles")
    .insert({
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      comp_level: compLevel,
    });

  if (error) {
    throw new Error("Unable to set comp level");
  }
}

export async function loadCompLevelsByUserId(
  supabase: SupabaseClient,
): Promise<Map<string, number | null>> {
  const { data, error } = await supabase
    .from("portal_profiles")
    .select("user_id, comp_level");

  if (error) {
    throw new Error("Unable to load comp levels");
  }

  const map = new Map<string, number | null>();
  for (const row of data ?? []) {
    const compLevel = row.comp_level;
    map.set(
      row.user_id as string,
      typeof compLevel === "number" && isValidCompLevel(compLevel) ? compLevel : null,
    );
  }
  return map;
}
