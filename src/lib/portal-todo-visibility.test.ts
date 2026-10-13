import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPortalTodos, filterPortalTodosForAgent, derivePortalPhase, getCurrentStageIndex } from "./portal-todos";
vi.mock("@/lib/supabase", () => ({ isSupabaseAuthConfigured: () => true, getSupabaseConfig: () => ({ url: "https://test.example", anonKey: "test" }), getSupabaseClient: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
describe("Configured checklist response", () => {
  it("keeps an intentionally empty checklist empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ todos: [] }) }));
    const todos = await fetchPortalTodos("token");
    expect(todos).toEqual([]);
    expect(derivePortalPhase(todos)).toBe("complete");
    expect(getCurrentStageIndex(todos)).toBeNull();
  });
  it("preserves the server visibility flags through frontend mapping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ todos: [{ id: "w9_setup", title: "W9", showLoa: false, showIbo: true }] }) }));
    const todos = await fetchPortalTodos("token");
    expect(filterPortalTodosForAgent(todos, "ibo")).toHaveLength(1);
    expect(filterPortalTodosForAgent(todos, "loa")).toEqual([]);
  });
});
