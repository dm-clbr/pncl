import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { documentId } from "./documentRequestRules.ts";
import { isSigningDocumentKind } from "./onboardingSigningRules.ts";
import { ONBOARDING_CONTENT_BUCKET } from "./onboardingContentRules.ts";

export async function onboardingDocumentSource(client: SupabaseClient, input: { stepId: unknown; flow: unknown; assetId?: unknown }) {
  const stepId = documentId(input.stepId);
  if (input.flow !== "loa" && input.flow !== "ibo") throw new Error("Choose LOA or IBO.");
  const flow = input.flow;
  const { data: step, error } = await client.from("portal_todos").select("id,slug,title,description,content_type,flow_content,published,show_loa,show_ibo,updated_at").eq("id", stepId).single();
  if (error || !step || !isSigningDocumentKind(step.content_type)) throw new Error("Choose a signing document from its onboarding step.");
  const currentAssetId = step.flow_content?.[flow]?.assetId ?? null;
  const assetId = documentId(input.assetId ?? currentAssetId);
  const { data: asset, error: assetError } = await client.from("onboarding_content_assets").select("id,designation,kind,path,filename,size_bytes,sha256").eq("id", assetId).single();
  if (assetError || !asset || asset.designation !== flow || asset.kind !== step.content_type) throw new Error("The selected PDF does not belong to this step and flow.");
  return {
    stepId, stepSlug: step.slug, title: step.title, description: step.description, flow, assetId,
    currentAssetId, filename: asset.filename, kind: asset.kind, published: step.published,
    visible: flow === "loa" ? step.show_loa : step.show_ibo,
    url: client.storage.from(ONBOARDING_CONTENT_BUCKET).getPublicUrl(asset.path).data.publicUrl,
  };
}
