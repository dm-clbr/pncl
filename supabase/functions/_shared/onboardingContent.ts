import { loadFlowRules } from "./onboardingFlowRules.ts";
import type { FlowRules } from "./onboardingEditorRules.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAgentDesignation, type AgentDesignation } from "./agentDesignation.ts";
import { resolveReferralInvitePublicInfo } from "./portalReferralInvites.ts";
import { ONBOARDING_CONTENT_BUCKET, type OnboardingAssetKind } from "./onboardingContentRules.ts";

export interface OnboardingAsset {
  id: string;
  designation: AgentDesignation;
  kind: OnboardingAssetKind;
  path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
  url: string;
}
export interface OnboardingFlowContent {
  designation: AgentDesignation;
  ica: OnboardingAsset | null;
  welcomeVideo: OnboardingAsset | null;
  surelcVideo: OnboardingAsset | null;
  rules?: FlowRules;
}

export async function resolveOnboardingDesignation(client: SupabaseClient, ref: unknown): Promise<AgentDesignation> {
  if (ref === undefined || ref === null || ref === "") return "loa";
  if (typeof ref !== "string") throw new Error("Invalid referral link.");
  const resolved = await resolveReferralInvitePublicInfo(client, ref);
  return resolveAgentDesignation(resolved.agentDesignation);
}

export async function loadOnboardingContent(client: SupabaseClient, designation: AgentDesignation): Promise<OnboardingFlowContent> {
  const { data: settings, error } = await client.from("onboarding_flow_content")
    .select("ica_asset_id, welcome_video_asset_id, surelc_video_asset_id, welcome_video_url, surelc_video_url").eq("designation", designation).single();
  if (error || !settings) throw new Error(error?.message ?? "Onboarding content is not configured.");
  const ids = [settings.ica_asset_id, settings.welcome_video_asset_id, settings.surelc_video_asset_id].filter(Boolean);
  const assets = new Map<string, OnboardingAsset>();
  if (ids.length) {
    const { data, error: assetError } = await client.from("onboarding_content_assets")
      .select("id, designation, kind, path, filename, content_type, size_bytes, sha256, created_at").in("id", ids);
    if (assetError) throw new Error(assetError.message);
    for (const asset of data ?? []) assets.set(asset.id, { ...asset, url: client.storage.from(ONBOARDING_CONTENT_BUCKET).getPublicUrl(asset.path).data.publicUrl });
    if (assets.size !== ids.length) throw new Error("An onboarding file is unavailable. Contact PNCL support.");
  }
  const linked = (url: string | null): OnboardingAsset | null => url ? { id: `link:${url}`, designation, kind: "video" as OnboardingAssetKind, path: "", filename: "Hosted video", content_type: "video/link", size_bytes: 0, sha256: "", created_at: "", url } : null;
  const { rules } = await loadFlowRules(client, designation);
  return { rules, designation, ica: assets.get(settings.ica_asset_id) ?? null, welcomeVideo: linked(settings.welcome_video_url) ?? assets.get(settings.welcome_video_asset_id) ?? null, surelcVideo: linked(settings.surelc_video_url) ?? assets.get(settings.surelc_video_asset_id) ?? null };
}

export async function downloadIcaAsset(client: SupabaseClient, asset: OnboardingAsset | null) {
  if (!asset) return undefined;
  const { data, error } = await client.storage.from(ONBOARDING_CONTENT_BUCKET).download(asset.path);
  if (error || !data) throw new Error("Unable to load the selected ICA document.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  if (sha256 !== asset.sha256) throw new Error("The ICA document failed verification. Contact PNCL support.");
  return { bytes, version: `custom-${asset.designation}-${asset.id}`, sha256 };
}
