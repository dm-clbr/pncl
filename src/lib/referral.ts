import { isSupabaseConfigured } from "./onboarding-api";

export const REFERRAL_PARAM = "ref";
export const REFERRAL_STORAGE_KEY = "pncl_onboarding_ref";

export interface ReferralInviteInfo {
  inviteId: string;
  referrerId: string;
  referrerName: string;
  compLevel: number;
}

export function buildReferralLink(inviteId: string): string {
  const url = new URL("/onboarding", window.location.origin);
  url.searchParams.set(REFERRAL_PARAM, inviteId);
  return url.toString();
}

export function persistReferralInviteId(inviteId: string): void {
  try {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, inviteId);
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export function readStoredReferralInviteId(): string | null {
  try {
    return sessionStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralInviteId(): void {
  try {
    sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export async function getReferralInviteInfo(inviteId: string): Promise<ReferralInviteInfo> {
  if (!isSupabaseConfigured()) {
    throw new Error("Referral lookup is not configured");
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/get-referrer-info`);
  url.searchParams.set("ref", inviteId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load referral invite");
  }

  return {
    inviteId: data.inviteId,
    referrerId: data.id,
    referrerName: data.name,
    compLevel: data.compLevel,
  };
}
