import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { errorResponse, handleCors, jsonResponse } from "../../supabase/functions/_shared/cors";
import { UUID } from "../../supabase/functions/_shared/summitRules";

const groupId = "00000000-0000-4000-8000-000000000001";
const originalId = "00000000-0000-4000-8000-000000000002";
const time = "2026-11-09T10:00:00Z";

function setup(result: unknown = {}) {
  let handler: (req: Request) => Promise<Response>;
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  const createClient = vi.fn(() => ({ rpc }));
  const env: Record<string, string> = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-fixture",
    OPENAI_API_KEY: "ai-only-fixture",
  };
  const dependencies = {
    Deno: { env: { get: (key: string) => env[key] }, serve: (value: typeof handler) => { handler = value; } },
    createClient, errorResponse, handleCors, jsonResponse, UUID,
    processSummitQuestions: vi.fn().mockResolvedValue(undefined),
    EdgeRuntime: { waitUntil: vi.fn() },
  };
  const code = ts.transpileModule(readFileSync("supabase/functions/summit-presenter/index.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*;\n/gm, "");
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return {
    rpc, createClient,
    // No Authorization header, API key, session, or cookie.
    request: (body: unknown = {}, method = "POST") => handler(new Request("https://example.supabase.co/functions/v1/summit-presenter", {
      method, ...(method === "POST" ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
    })),
  };
}

describe("public Summit presenter access", () => {
  it("returns all ranked groups and counts without sign-in and keeps credentials server-side", async () => {
    const groups = Array.from({ length: 5 }, (_, index) => ({ id: `${index}`, representative: `Question ${index}?`, count: 5 - index }));
    const snapshot = { revision: "1", groups, total: 15, pending_count: 0 };
    const h = setup(snapshot);
    const response = await h.request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ...snapshot, ai_configured: true });
    expect(h.rpc).toHaveBeenCalledWith("summit_snapshot_v2", { p_known_revision: null });
    expect(h.createClient).toHaveBeenCalledWith("https://example.supabase.co", "server-only-fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("returns unchanged revisions without requiring credentials", async () => {
    const h = setup({ unchanged: true, revision: "1" });
    expect(await (await h.request({ revision: "1" })).json()).toEqual({ unchanged: true, revision: "1", ai_configured: true });
    expect(h.rpc).toHaveBeenCalledWith("summit_snapshot_v2", { p_known_revision: "1" });
  });

  it("lets signed-out visitors read originals and request subsequent cursor pages", async () => {
    const original = { id: originalId, question: "  How can I find more prospects?  ", created_at: time, cursor_at: time };
    const result = { submissions: [original], has_more: true };
    const h = setup(result);
    const response = await h.request({ action: "originals", group_id: groupId, cursor: { time, id: originalId } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(h.rpc).toHaveBeenCalledWith("summit_originals", { p_group_id: groupId, p_after_time: time, p_after_id: originalId });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("makes saved pending originals readable while AI is processing", async () => {
    const result = { submissions: [{ id: originalId, question: "How can I grow?", created_at: time }], has_more: false };
    const h = setup(result);
    expect(await (await h.request({ action: "originals", group_id: null })).json()).toEqual(result);
    expect(h.rpc).toHaveBeenCalledWith("summit_originals", { p_group_id: null, p_after_time: null, p_after_id: null });
  });

  it.each([
    { action: "delete", group_id: groupId },
    { action: "originals", group_id: "bad-id" },
    { action: "originals", group_id: groupId, cursor: { time: "bad-time", id: originalId } },
    { action: "originals", group_id: groupId, cursor: { time, id: "bad-id" } },
    null,
  ])("rejects invalid read requests and mutation actions: %j", async (body) => {
    const h = setup();
    expect((await h.request(body)).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts browser preflight and rejects other HTTP methods", async () => {
    const h = setup();
    expect((await h.request(undefined, "OPTIONS")).status).toBe(204);
    expect((await h.request(undefined, "DELETE")).status).toBe(405);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
