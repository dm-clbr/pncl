import { getSupabaseConfig } from "@/lib/supabase";
import type { AgentPhase } from "@/lib/admin-api";

export interface DownlineMember {
  onboardingId: string;
  userId: string | null;
  name: string;
  inviteLabel: string | null;
  invitedCompLevel: number | null;
  onboardingStatus: string;
  portalPhase: AgentPhase | null;
  hasPortalAccount: boolean;
  onboardingCompletedAt: string | null;
  joinedAt: string;
}

export interface DownlineListResponse {
  members: DownlineMember[];
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

export async function listPortalDownline(accessToken: string): Promise<DownlineListResponse> {
  return portalFetch("list-portal-downline", accessToken, { method: "GET" });
}

const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  pending: "Application submitted",
  creating_email: "Setting up workspace email",
  email_created: "Email created",
  ready: "Awaiting portal activation",
  credentials_viewed: "Activating portal account",
  expired: "Expired",
};

export function formatDownlineOnboardingStatus(status: string): string {
  return ONBOARDING_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function getDownlineDisplayLabel(member: DownlineMember): string {
  return member.inviteLabel?.trim() || member.name;
}
