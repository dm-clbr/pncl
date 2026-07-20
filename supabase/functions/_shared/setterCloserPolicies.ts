import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type LeadPurchaser = "setter" | "closer";
export type SplitType = "50_50" | "70_30";

export interface SetterCloserPolicyRecord {
  id: string;
  policy_number: string;
  carrier: string | null;
  client_name: string | null;
  lead_purchaser: LeadPurchaser;
  split_type: SplitType;
  setter_user_id: string | null;
  setter_npn: string | null;
  setter_name: string | null;
  closer_user_id: string | null;
  closer_npn: string;
  closer_name: string | null;
  policy_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertSetterCloserPolicyPayload {
  id?: string;
  policyNumber: string;
  carrier?: string;
  clientName?: string;
  leadPurchaser: LeadPurchaser;
  setterNpn?: string;
  setterName?: string;
  closerNpn: string;
  closerName?: string;
  policyDate?: string;
  notes?: string;
}

export function splitTypeForLeadPurchaser(leadPurchaser: LeadPurchaser): SplitType {
  return leadPurchaser === "setter" ? "50_50" : "70_30";
}

export function formatSplitLabel(splitType: SplitType): string {
  return splitType === "50_50" ? "50/50" : "70/30";
}

function normalizeNpn(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function validateUpsertSetterCloserPolicyPayload(body: unknown): UpsertSetterCloserPolicyPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const policyNumber = typeof data.policyNumber === "string" ? data.policyNumber.trim() : "";
  if (!policyNumber) {
    throw new Error("Policy number is required");
  }

  const leadPurchaserInput = typeof data.leadPurchaser === "string" ? data.leadPurchaser.trim() : "";
  if (leadPurchaserInput !== "setter" && leadPurchaserInput !== "closer") {
    throw new Error("Lead purchaser must be setter or closer");
  }

  const closerNpn = normalizeNpn(typeof data.closerNpn === "string" ? data.closerNpn : undefined);
  if (!closerNpn) {
    throw new Error("Closer NPN is required");
  }

  const policyDateRaw = typeof data.policyDate === "string" ? data.policyDate.trim() : "";
  if (policyDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(policyDateRaw)) {
    throw new Error("Policy date must be YYYY-MM-DD");
  }

  return {
    id,
    policyNumber: policyNumber.slice(0, 120),
    carrier: normalizeOptionalText(typeof data.carrier === "string" ? data.carrier : undefined, 120) ?? undefined,
    clientName: normalizeOptionalText(typeof data.clientName === "string" ? data.clientName : undefined, 160) ?? undefined,
    leadPurchaser: leadPurchaserInput,
    setterNpn: normalizeNpn(typeof data.setterNpn === "string" ? data.setterNpn : undefined) ?? undefined,
    setterName: normalizeOptionalText(typeof data.setterName === "string" ? data.setterName : undefined, 160) ?? undefined,
    closerNpn,
    closerName: normalizeOptionalText(typeof data.closerName === "string" ? data.closerName : undefined, 160) ?? undefined,
    policyDate: policyDateRaw || undefined,
    notes: normalizeOptionalText(typeof data.notes === "string" ? data.notes : undefined, 2000) ?? undefined,
  };
}

interface NpnMatcher {
  byNpn: Map<string, string>;
  namesByUserId: Map<string, string>;
}

/** Maps normalized NPN strings to portal user IDs. */
export async function buildNpnUserMatcher(adminClient: SupabaseClient): Promise<NpnMatcher> {
  const byNpn = new Map<string, string>();
  const namesByUserId = new Map<string, string>();

  const { data: profileRows, error } = await adminClient
    .from("portal_profiles")
    .select("user_id, npn, first_name, last_name");

  if (error) throw new Error(error.message);

  for (const row of (profileRows ?? []) as {
    user_id: string;
    npn: string | null;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const npn = row.npn?.trim();
    if (npn) {
      byNpn.set(npn, row.user_id);
    }
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (name) namesByUserId.set(row.user_id, name);
  }

  const { data: onboardingRows } = await adminClient
    .from("onboarding_records")
    .select("supabase_user_id, npn, first_name, last_name")
    .not("supabase_user_id", "is", null);

  for (const row of (onboardingRows ?? []) as {
    supabase_user_id: string;
    npn: string | null;
    first_name: string | null;
    last_name: string | null;
  }[]) {
    const npn = row.npn?.trim();
    if (npn && !byNpn.has(npn)) {
      byNpn.set(npn, row.supabase_user_id);
    }
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (name && !namesByUserId.has(row.supabase_user_id)) {
      namesByUserId.set(row.supabase_user_id, name);
    }
  }

  return { byNpn, namesByUserId };
}

export function resolveUserIdForNpn(matcher: NpnMatcher, npn: string | null | undefined): string | null {
  const normalized = npn?.trim();
  if (!normalized) return null;
  return matcher.byNpn.get(normalized) ?? null;
}

export function mapSetterCloserPolicyRecord(
  record: SetterCloserPolicyRecord,
  matcher: NpnMatcher,
) {
  const setterUserId = record.setter_user_id ?? resolveUserIdForNpn(matcher, record.setter_npn);
  const closerUserId = record.closer_user_id ?? resolveUserIdForNpn(matcher, record.closer_npn);

  return {
    id: record.id,
    policyNumber: record.policy_number,
    carrier: record.carrier,
    clientName: record.client_name,
    leadPurchaser: record.lead_purchaser,
    splitType: record.split_type,
    splitLabel: formatSplitLabel(record.split_type),
    setterUserId,
    setterNpn: record.setter_npn,
    setterName: record.setter_name ?? (setterUserId ? matcher.namesByUserId.get(setterUserId) ?? null : null),
    closerUserId,
    closerNpn: record.closer_npn,
    closerName: record.closer_name ?? (closerUserId ? matcher.namesByUserId.get(closerUserId) ?? null : null),
    policyDate: record.policy_date,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function buildSetterCloserPolicyInsertPayload(
  adminClient: SupabaseClient,
  input: UpsertSetterCloserPolicyPayload,
  createdBy: string | null,
) {
  const matcher = await buildNpnUserMatcher(adminClient);
  const splitType = splitTypeForLeadPurchaser(input.leadPurchaser);

  return {
    policy_number: input.policyNumber,
    carrier: input.carrier ?? null,
    client_name: input.clientName ?? null,
    lead_purchaser: input.leadPurchaser,
    split_type: splitType,
    setter_user_id: resolveUserIdForNpn(matcher, input.setterNpn),
    setter_npn: input.setterNpn ?? null,
    setter_name: input.setterName ?? null,
    closer_user_id: resolveUserIdForNpn(matcher, input.closerNpn),
    closer_npn: input.closerNpn,
    closer_name: input.closerName ?? null,
    policy_date: input.policyDate ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
  };
}
