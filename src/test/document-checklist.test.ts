import { describe, expect, it } from "vitest";
import { mergeDocumentChecklist } from "../../supabase/functions/_shared/documentChecklist";
import { defaultFlowRules } from "../../supabase/functions/_shared/onboardingEditorRules";
import { legacySigningRows } from "../../supabase/functions/_shared/signingRollout";
import { isTodoCompleteForUser } from "../../supabase/functions/_shared/todoCompletion";
describe("onboarding document checklist integration", () => {
  it("places a custom signing task at its onboarding step and connects prerequisites", () => {
    const rules = { ...defaultFlowRules(), portalOrder: ["ica_setup", "addendum", "next"], prerequisites: { addendum: ["ica_setup"], next: ["addendum"] } };
    const rows = mergeDocumentChecklist([{ id: "ica_setup" }, { id: "next" }], [{ id: "document_request_one", stepSlug: "addendum", completed: false }], rules);
    expect(rows.map(row => row.id)).toEqual(["ica_setup", "document_request_one", "next"]);
    expect(rows[1].prerequisites).toEqual(["ica_setup"]);
    expect(rows[2].prerequisites).toEqual(["document_request_one"]);
  });
  it("requires both an original step and its additional re-sign request before dependents", () => {
    const rows = mergeDocumentChecklist([{ id: "ica_setup" }, { id: "next" }], [{ id: "document_request_new", stepSlug: "ica_setup" }], { ...defaultFlowRules(), portalOrder: ["ica_setup", "next"], prerequisites: { next: ["ica_setup"] } });
    expect(rows.find(row => row.id === "next")?.prerequisites).toEqual(["ica_setup", "document_request_new"]);
  });
  it("keeps new signing rows out of the legacy checklist and ignores manual completion", () => {
    const row = { slug: "addendum", content_type: "signing_document", completion_type: "auto" as const, auto_key: null };
    expect(legacySigningRows([row], { enabled: false, revision: 0, legacy_steps: [], legacy_ica_sources: {} })).toEqual([]);
    expect(isTodoCompleteForUser(row, "user", { addendum: true }, new Map())).toBe(false);
  });
});
