import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitNewProducer } from "../../supabase/functions/_shared/newProducerSubmission";
import { computeAutoCompletionSets } from "../../supabase/functions/_shared/portalTodos";
import { isTodoCompleteForUser } from "../../supabase/functions/_shared/todoCompletion";
import { listIcaSignedUserIds } from "../../supabase/functions/_shared/portalIca";
import { validateSubmitTicketPayload } from "../../supabase/functions/_shared/portalTickets";
import inventory from "./fixtures/ibo-onboarding-steps.json";

vi.mock("../../supabase/functions/_shared/usZipCounty.ts", () => ({ lookupCountyFromZip: () => "Test County" }));
vi.mock("../../supabase/functions/_shared/portalIca.ts", () => ({ listIcaSignedUserIds: vi.fn() }));
vi.mock("../../supabase/functions/_shared/portalCompAttachments.ts", () => ({ userHasCompAttachment: async () => true }));
beforeEach(() => vi.mocked(listIcaSignedUserIds).mockResolvedValue(new Set(["agent"])));

function scenario(designation = "ibo") {
  const user = { id: "agent", email: "qa@example.invalid", user_metadata: { completed_portal_todos: Object.fromEntries(inventory.filter((r) => r.completion_type === "agent" && r.slug !== "submit_new_producer").map((r) => [r.slug, true])) } };
  const tables: Record<string, Record<string, unknown>[]> = {
    portal_todos: inventory.map((r) => ({ ...r, published: true })),
    portal_tickets: [],
    portal_agent_designations: [{ user_id: user.id, designation }],
    portal_comp_attachments: [{ user_id: user.id }],
    portal_profiles: [{ user_id: user.id, first_name: "Test", last_name: "Agent", npn: "123", eo_policy_number: "TEST-EO", address_line1: "123 Test St", address_city: "Test", address_state: "UT", address_zip: "84001", drivers_license_path: "test/license.png" }],
    portal_w9_forms: [{ user_id: user.id }],
    portal_direct_deposit_forms: [{ user_id: user.id }],
    portal_disclosures: [{ id: "training", content_version: 2, published: true, video_url: "https://example.invalid/training" }],
    portal_disclosure_acknowledgments: [{ user_id: user.id, disclosure_id: "training", content_version: 2 }],
  };
  const from = vi.fn((table: string) => {
    let rows = tables[table] ?? [];
    const q = {
      select: () => q, order: () => q,
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return q; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return q; },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  });
  const rpc = vi.fn(async () => ({ data: "test-ticket", error: null as null | { message: string } }));
  return { user, tables, client: { from, rpc }, rpc, from };
}

describe("New Producer server submission", () => {
  it.each(["ibo", "loa"])("accepts the complete %s journey and includes its designation in the ticket", async (designation) => {
    const s = scenario(designation);
    if (designation === "ibo") { s.tables.portal_w9_forms = []; s.tables.portal_direct_deposit_forms = []; }
    await expect(submitNewProducer(s.client as never, s.user as never)).resolves.toBe("test-ticket");
    expect(s.rpc).toHaveBeenCalledExactlyOnceWith("submit_portal_new_producer", { p_user_id: "agent", p_description: expect.stringContaining(`Designation: ${designation.toUpperCase()}`) });
  });
  it("does not require the LOA video for IBO and does not accept LOA playback as IBO playback", async () => {
    const s = scenario();
    delete s.user.user_metadata.completed_portal_todos.surelc_tutorial_ibo;
    await expect(submitNewProducer(s.client as never, s.user as never)).rejects.toThrow("IBO SureLC tutorial");
    expect(s.rpc).not.toHaveBeenCalled();
    s.user.user_metadata.completed_portal_todos.surelc_tutorial_ibo = true;
    delete s.user.user_metadata.completed_portal_todos.surelc_tutorial;
    await expect(submitNewProducer(s.client as never, s.user as never)).resolves.toBe("test-ticket");
  });
  it.each(["surelc_account_1", "surelc_account_2", "surelc_account_3", "carrier_applications", "take_exam"])("rejects a missing prerequisite: %s", async (slug) => {
    const s = scenario(); delete s.user.user_metadata.completed_portal_todos[slug];
    await expect(submitNewProducer(s.client as never, s.user as never)).rejects.toThrow("Complete these steps");
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("checks saved profile and current training rather than trusting forged metadata", async () => {
    const s = scenario();
    s.tables.portal_profiles[0].npn = "";
    s.tables.portal_disclosure_acknowledgments[0].content_version = 1;
    s.user.user_metadata.completed_portal_todos.record_npn = true;
    s.user.user_metadata.completed_portal_todos.disclosures = true;
    await expect(submitNewProducer(s.client as never, s.user as never)).rejects.toThrow("Record your NPN");
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("keeps W-9 and direct deposit mandatory for LOA", async () => {
    const s = scenario("loa"); s.tables.portal_w9_forms = []; s.tables.portal_direct_deposit_forms = [];
    await expect(submitNewProducer(s.client as never, s.user as never)).rejects.toThrow("W-9");
  });
  it("returns the same accepted ticket on retries even if requirements later change", async () => {
    const s = scenario(); s.tables.portal_tickets = [{ id: "existing", user_id: "agent", type: "new_producer" }];
    s.tables.portal_profiles = [];
    await expect(submitNewProducer(s.client as never, s.user as never)).resolves.toBe("existing");
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("propagates save failure so the client can retry", async () => {
    const s = scenario(); s.rpc.mockResolvedValue({ data: "", error: { message: "Database unavailable" } });
    await expect(submitNewProducer(s.client as never, s.user as never)).rejects.toThrow("Database unavailable");
  });
  it("resolves completion from a persisted ticket, never a user-editable flag", async () => {
    const s = scenario();
    const row = { slug: "submit_new_producer", auto_key: "new_producer", completion_type: "auto" as const };
    let sets = await computeAutoCompletionSets(s.client as never, new Set(["new_producer"]), ["agent"]);
    expect(isTodoCompleteForUser(row, "agent", { submit_new_producer: true }, sets)).toBe(false);
    s.tables.portal_tickets.push({ user_id: "agent", type: "new_producer" });
    sets = await computeAutoCompletionSets(s.client as never, new Set(["new_producer"]), ["agent"]);
    expect(isTodoCompleteForUser(row, "agent", {}, sets)).toBe(true);
  });
  it("does not allow the generic support form to bypass the onboarding endpoint", () => {
    expect(() => validateSubmitTicketPayload({ type: "new_producer", subject: "Skip", description: "Skip" })).toThrow("Invalid ticket type");
  });
  it("preserves legitimate historical submissions without creating retroactive tickets", async () => {
    const s = scenario(); s.tables.portal_profiles[0].new_producer_notification_sent_at = "2026-10-01T00:00:00Z";
    const sets = await computeAutoCompletionSets(s.client as never, new Set(["new_producer"]), ["agent"]);
    expect(sets.get("new_producer")?.has("agent")).toBe(true);
    expect(s.rpc).not.toHaveBeenCalled();
  });
});
