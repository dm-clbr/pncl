import type { FlowRules } from "./onboarding-editor";
import { getSupabaseConfig } from "@/lib/supabase";
import type { AgentDesignation } from "@/lib/agent-designation";
export { validateOnboardingAsset } from "../../supabase/functions/_shared/onboardingContentRules";
export type { OnboardingAssetKind } from "../../supabase/functions/_shared/onboardingContentRules";
import type { OnboardingAssetKind } from "../../supabase/functions/_shared/onboardingContentRules";

export interface OnboardingAsset {
  id: string;
  filename: string;
  url: string;
  size_bytes: number;
  created_at: string;
}
export interface OnboardingFlowContent {
  designation: AgentDesignation;
  ica: OnboardingAsset | null;
  welcomeVideo: OnboardingAsset | null;
  surelcVideo: OnboardingAsset | null;
  rules?: FlowRules;
}
export interface OnboardingContentContext {
  referralInviteId?: string | null;
  accessToken?: string;
  portal?: boolean;
  previewDesignation?: AgentDesignation;
}

async function contentRequest(path: string, accessToken?: string, body?: FormData) {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${accessToken || anonKey}`, apikey: anonKey }, body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Unable to load onboarding content. Please retry.");
  return data;
}
export async function fetchOnboardingContent(context: OnboardingContentContext = {}): Promise<OnboardingFlowContent> {
  const params = new URLSearchParams();
  if (context.referralInviteId) params.set("ref", context.referralInviteId);
  if (context.portal) params.set("scope", "portal");
  if (context.previewDesignation) params.set("previewDesignation", context.previewDesignation);
  return contentRequest(`get-onboarding-content?${params}`, context.accessToken);
}
export async function fetchAdminOnboardingContent(accessToken: string): Promise<OnboardingFlowContent[]> {
  return (await contentRequest("admin-onboarding-content", accessToken)).flows;
}
export async function uploadOnboardingContent(accessToken: string, designation: AgentDesignation, kind: OnboardingAssetKind, file: File): Promise<OnboardingFlowContent> {
  const form = new FormData();
  form.append("designation", designation); form.append("kind", kind); form.append("file", file);
  return (await contentRequest("admin-onboarding-content", accessToken, form)).flow;
}
