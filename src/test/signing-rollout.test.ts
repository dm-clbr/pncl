import { describe, expect, it } from "vitest";
import { legacySigningRows, loadSigningRollout, signingRowsForUser, uploadedSigningEnabled } from "../../supabase/functions/_shared/signingRollout";
import { isTodoCompleteForUser } from "../../supabase/functions/_shared/todoCompletion";
import { filterAgentTodos } from "../../supabase/functions/_shared/agentDesignation";

const savedStep = { slug: "comp_agreement", title: "Existing compensation", published: true, show_loa: true, show_ibo: false, completion_type: "agent" as const, auto_key: null };
const state = { enabled: false, revision: 0, legacy_ica_sources: { loa: "previous-ica", ibo: null }, legacy_steps: [savedStep] };
function client(enabled = false, preview = false, error: unknown = null) {
  return { from: (table: string) => {
    const q = { select: () => q, eq: () => q, single: async () => ({ data: { ...state, enabled }, error }), maybeSingle: async () => ({ data: preview && table === "onboarding_signing_preview_users" ? { user_id: "admin" } : null, error }) };
    return q;
  } };
}
describe("staged signing activation", () => {
  it("keeps public enrollment and ordinary agents on existing signing while inactive", async () => {
    expect(await uploadedSigningEnabled(client() as never)).toBe(false);
    expect(await uploadedSigningEnabled(client() as never, "agent")).toBe(false);
  });
  it("lets only a server-allowlisted account preview and switches everyone together on activation", async () => {
    expect(await uploadedSigningEnabled(client(false, true) as never, "admin")).toBe(true);
    expect(await uploadedSigningEnabled(client(false, true) as never)).toBe(false);
    expect(await uploadedSigningEnabled(client(true) as never, "agent")).toBe(true);
    expect(await uploadedSigningEnabled(client(true) as never)).toBe(true);
  });
  it("never guesses a signing mode when the server configuration cannot be read", async () => {
    await expect(loadSigningRollout(client(false, false, new Error("unavailable")) as never)).rejects.toThrow("verify signing activation");
    await expect(uploadedSigningEnabled(client(false, false, new Error("unavailable")) as never, "agent", state)).rejects.toThrow("preview access");
  });
  it("freezes the existing signing checklist while admin drafts change its visibility and completion", async () => {
    const draft = { ...savedStep, published: false, show_ibo: true, title: "New compensation" };
    const rows = await signingRowsForUser(client() as never, [draft, { ...savedStep, slug: "training", title: "Updated training" }], "agent");
    expect(rows.enabled).toBe(false);
    expect(rows.rows[0]).toMatchObject(savedStep);
    expect(rows.rows[1].title).toBe("Updated training");
    const current = await signingRowsForUser(client(true) as never, [draft], "agent");
    expect(current.rows).toEqual([draft]);
  });
  it("retains a previous required step when the new version is unpublished or absent from the live query", () => {
    expect(legacySigningRows([], state)).toEqual([{ ...savedStep, uploaded_signing: false }]);
  });
  it.each(["loa", "ibo"])("keeps the retired legacy comp step out of the %s checklist", designation => {
    const ica = { ...savedStep, slug: "ica_setup", show_ibo: true };
    const retired = { ...savedStep, published: false, show_loa: false, show_ibo: false };
    const rows = legacySigningRows([ica], { ...state, legacy_steps: [ica, retired] });
    const visible = filterAgentTodos(rows.filter(row => row.published), designation);
    expect(visible.map(row => row.slug)).toEqual(["ica_setup"]);
  });
  it("preserves permitted old checkoffs until uploaded signing is active", () => {
    const row = { slug: "ica_setup", completion_type: "auto" as const, auto_key: "ica" };
    expect(isTodoCompleteForUser({ ...row, uploaded_signing: false }, "agent", { ica_setup: true }, new Map())).toBe(true);
    expect(isTodoCompleteForUser(row, "agent", { ica_setup: true }, new Map())).toBe(false);
  });
});
