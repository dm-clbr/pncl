import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completePortalTodo, isTodoCompleted, type PortalTodo } from "./portal-todos";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn(), refreshSession: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabaseClient: () => ({ auth }), getSupabaseConfig: () => ({ url: "https://example.invalid", anonKey: "test-public-key" }) }));
const fetchMock = vi.fn();
const todo: PortalTodo = { id: "submit_new_producer", title: "Submit for New Producer", description: "", href: "", actionLabel: "Submit", external: false, completionType: "auto", phase: "licensing", gated: true, completed: false };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } }); auth.refreshSession.mockResolvedValue({}); });
afterEach(() => vi.unstubAllGlobals());
describe("New Producer client durability", () => {
  it("requires a successful ticket response before refreshing completion", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "Ticket save failed" }) });
    await expect(completePortalTodo(todo.id, [todo])).rejects.toThrow("Ticket save failed");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
  it("treats a legacy notification-only response as incomplete", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ notified: true }) });
    await expect(completePortalTodo(todo.id, [todo])).rejects.toThrow("Unable to create");
  });
  it("accepts a saved ticket even when optional email delivery failed", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ticketId: "ticket", notified: false }) });
    await completePortalTodo(todo.id, [todo]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("never resolves this auto step from legacy metadata alone", () => {
    expect(isTodoCompleted({ user_metadata: { completed_portal_todos: { submit_new_producer: true } } } as never, todo)).toBe(false);
  });
});
