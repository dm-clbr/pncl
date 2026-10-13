import { describe, expect, it, vi } from "vitest";
import { validatePortalTodoAudiences, savePortalTodoAudiences } from "../../supabase/functions/_shared/portalTodoAudiences";
import { computePortalTodoProgressByUserId, mapPortalTodoForUser, validateUpsertPortalTodoPayload, type PortalTodoRecord } from "../../supabase/functions/_shared/portalTodos";
import { filterAgentTodos } from "../../supabase/functions/_shared/agentDesignation";
import { filterPortalTodosForAgent, derivePortalPhase, isStageLocked } from "@/lib/portal-todos";
vi.mock("../../supabase/functions/_shared/usZipCounty.ts", () => ({ lookupCountyFromZip: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalIca.ts", () => ({ listIcaSignedUserIds: vi.fn() }));
const id = "00000000-0000-0000-0000-000000000001";
const record = (slug: string, options = {}) => ({ id, slug, title: slug, description: "Step", href: "", action_label: "", external: false, show_email_hint: false, phase: "on_board", completion_type: "agent", show_loa: true, show_ibo: true, ...options } as PortalTodoRecord);
describe("Onboarding audience settings", () => {
  it("lets admins re-enable W-9 for IBO and hide ICA for LOA", () => {
    const records = [record("w9_setup"), record("ica_setup", { show_loa: false }), record("next", { phase: "pre_license" })];
    expect(filterAgentTodos(records, "ibo").map(r => r.slug)).toEqual(["w9_setup", "ica_setup", "next"]);
    expect(filterAgentTodos(records, "loa").map(r => r.slug)).toEqual(["w9_setup", "next"]);
    const browser = records.map(r => mapPortalTodoForUser(r, false));
    expect(filterPortalTodosForAgent(browser, "ibo").map(r => r.id)).toEqual(["w9_setup", "ica_setup", "next"]);
    const loa = filterPortalTodosForAgent(browser.map(r => ({ ...r, completed: r.id === "w9_setup" })), "loa");
    expect(derivePortalPhase(loa)).toBe("pre_license");
    expect(isStageLocked(loa, 1)).toBe(false);
  });
  it("supports steps hidden from both audiences without mutating history", () => {
    const rows = [record("ica_setup", { show_loa: false, show_ibo: false })];
    expect(filterAgentTodos(rows, "loa")).toEqual([]);
    expect(filterAgentTodos(rows, "ibo")).toEqual([]);
    expect(rows[0].slug).toBe("ica_setup");
  });
  it("does not reset visibility on older content-editor requests", () => {
    const payload = validateUpsertPortalTodoPayload({ title: "Step", description: "Description", href: "", actionLabel: "", completionType: "agent" });
    expect(payload.showLoa).toBeUndefined();expect(payload.showIbo).toBeUndefined();
    expect(() => validateUpsertPortalTodoPayload({ ...payload, showIbo: "false" })).toThrow("boolean");
  });
  it.each([null, {}, { steps: [] }, { steps: [{ id, showLoa: true }] }, { steps: [{ id: "bad", showLoa: true, showIbo: true }] }, { steps: [{ id, showLoa: true, showIbo: true }, { id, showLoa: false, showIbo: false }] }])("rejects malformed bulk settings %j", (input) => {
    expect(() => validatePortalTodoAudiences(input)).toThrow();
  });
  it("sends a single atomic operation containing only audience flags", async () => {
    const steps = validatePortalTodoAudiences({ steps: [{ id, showLoa: false, showIbo: true, title: "Injected content", completed: true }] });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await savePortalTodoAudiences({ rpc } as never, steps);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("set_portal_todo_audiences", { settings: [{ id, show_loa: false, show_ibo: true }] });
  });
  it("propagates database save failures", async () => {
    await expect(savePortalTodoAudiences({ rpc: async () => ({ error: { message: "Step missing" } }) } as never, [{ id, showLoa: false, showIbo: true }])).rejects.toThrow("Step missing");
  });
  it("uses configured visibility in team progress and reminder totals", async () => {
    const rows = [record("done", { phase: "on_board" }), record("hidden", { show_ibo: false }), record("ibo_only", { show_loa: false, phase: "licensing" })];
    const from = (table: string) => {
      const data = table === "portal_todos" ? rows : [{ user_id: "ibo-agent", designation: "ibo" }, { user_id: "loa-agent", designation: "loa" }];
      const query = { select: () => query, eq: () => query, order: () => query, in: () => query, then: (resolve: (v: unknown) => void) => resolve({ data, error: null }) };
      return query;
    };
    const progress = await computePortalTodoProgressByUserId({ from } as never, [
      { id: "ibo-agent", user_metadata: { completed_portal_todos: { done: true } } },
      { id: "loa-agent", user_metadata: { completed_portal_todos: { done: true } } },
    ]);
    expect(progress.get("ibo-agent")).toMatchObject({ completedCount: 1, totalCount: 2, phases: [{ id: "on_board", totalCount: 1 }, { id: "licensing", totalCount: 1 }] });
    expect(progress.get("loa-agent")).toMatchObject({ completedCount: 1, totalCount: 2, phases: [{ id: "on_board", totalCount: 2 }] });
  });
});
