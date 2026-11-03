import type { EditorRow } from "./onboarding-editor";
import { isLocalEditor } from "./onboarding-editor";
import { isSigningDocumentKind } from "../../supabase/functions/_shared/onboardingSigningRules";

export function changedSigningFlows(original: EditorRow, draft: EditorRow) {
  return isSigningDocumentKind(draft.contentType) ? (["loa", "ibo"] as const).filter(flow => {
    const next = draft.flowContent[flow]?.assetId;
    return next && next !== original.flowContent[flow]?.assetId;
  }) : [];
}
export function documentRolloutUrl(stepId: string, flow: "loa" | "ibo", assetId: string) {
  return `/portal/admin/onboarding-steps/documents?${new URLSearchParams({ step: stepId, flow, asset: assetId, action: "rollout", ...(isLocalEditor() ? { localPreview: "1" } : {}) })}`;
}
export function documentLibraryEntries(rows: EditorRow[]) {
  return rows.flatMap(row => (["loa", "ibo"] as const).flatMap(flow => {
    const media = row.flowContent[flow];
    const signing = isSigningDocumentKind(row.contentType);
    const visible = flow === "loa" ? row.showLoa : row.showIbo;
    if (!signing && row.contentType !== "document") return [];
    if (!media && !visible) return [];
    return [{ row, flow, media, signing, visible }];
  }));
}
