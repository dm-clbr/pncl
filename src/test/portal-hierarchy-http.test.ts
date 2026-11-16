import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { buildPortalHierarchyResponse } from "../../supabase/functions/_shared/portalHierarchy";

class AuthError extends Error { status = 401; code = "unauthorized"; }

function setup({ deny = false, unavailable = false } = {}) {
  let route: (req: Request) => Promise<Response>;
  const load = vi.fn(async () => {
    if (unavailable) throw new Error("private database detail");
    return [
      { id: "leader", name: "Leader", npn: null, referrerId: null, referrerName: null },
      { id: "direct", name: "Direct", npn: null, referrerId: "leader", referrerName: "Leader" },
      { id: "outsider", name: "Outsider", npn: null, referrerId: null, referrerName: null },
    ];
  });
  const deps = {
    serve: (handler: typeof route) => { route = handler; },
    AdminAuthError: AuthError,
    requirePortalUser: async () => {
      if (deny) throw new AuthError("Unauthorized");
      return { user: { id: "leader", app_metadata: { role: "agent" } }, adminClient: {} };
    },
    loadPortalHierarchy: async (_client: unknown, userId: string) => buildPortalHierarchyResponse(await load(), userId, []),
    loadHierarchyPartnerLinks: async () => [],
    buildPortalHierarchyResponse,
    handleCors: () => null,
    jsonResponse: (data: unknown) => new Response(JSON.stringify(data)),
    errorResponse: (message: string, status: number) => new Response(JSON.stringify({ message }), { status }),
    logOnboarding: vi.fn(),
  };
  const js = ts.transpileModule(readFileSync("supabase/functions/get-portal-hierarchy/index.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^import .*;\n/gm, "");
  new Function(...Object.keys(deps), js)(...Object.values(deps));
  return { load, request: (query = "", method = "GET") => route(new Request(`https://test/get-portal-hierarchy${query}`, { method })) };
}

describe("portal hierarchy endpoint", () => {
  it("lets ordinary portal leaders read their own hierarchy and ignores attempted scope overrides", async () => {
    const response = await setup().request("?root=outsider&userId=outsider&view=admin");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.tree[0].id).toBe("leader");
    expect(result.totalAgents).toBe(2);
    expect(JSON.stringify(result)).not.toContain("outsider");
  });
  it("requires authentication before loading any roster", async () => {
    const h = setup({ deny: true });
    expect((await h.request()).status).toBe(401);
    expect(h.load).not.toHaveBeenCalled();
  });
  it("rejects writes", async () => {
    const h = setup();
    expect((await h.request("", "POST")).status).toBe(405);
    expect(h.load).not.toHaveBeenCalled();
  });
  it("reports data failures without leaking server details or pretending the team is empty", async () => {
    const response = await setup({ unavailable: true }).request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
  });
});
