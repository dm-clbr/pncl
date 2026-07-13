import { getSupabaseConfig } from "@/lib/supabase";
import { buildReferralLink } from "@/lib/referral";

export type ReferralInviteStatus = "pending" | "consumed" | "expired" | "revoked";

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

export interface ReferralInviteListResponse {
  compLevel: number | null;
  compOptions: number[];
  invites: ReferralInviteSummary[];
}

async function portalFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      ...init?.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data as T;
}

export async function listReferralInvites(
  accessToken: string,
): Promise<ReferralInviteListResponse> {
  return portalFetch("list-referral-invites", accessToken, { method: "GET" });
}

export async function createReferralInvite(
  accessToken: string,
  input: { compLevel: number; recipientLabel: string },
): Promise<ReferralInviteSummary> {
  const data = await portalFetch<{ invite: ReferralInviteSummary }>(
    "create-referral-invite",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return {
    ...data.invite,
    link: data.invite.link || buildReferralLink(data.invite.id),
  };
}

export function formatReferralInviteStatus(status: ReferralInviteStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "consumed":
      return "Used";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    default:
      return status;
  }
}

export function isReferralInviteCopyable(invite: ReferralInviteSummary): boolean {
  if (invite.status !== "pending") return false;
  return new Date(invite.expiresAt).getTime() > Date.now();
}
