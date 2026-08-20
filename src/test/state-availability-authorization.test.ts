import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canManageStateAvailability,
  type PortalRole,
} from "../../supabase/functions/_shared/adminRoles";
import {
  parseStateAvailabilityUpdates,
} from "../../supabase/functions/_shared/stateAvailability";

describe("state availability authorization", () => {
  it("allows only the full admin role to manage company statuses", () => {
    const roles: PortalRole[] = ["admin", "genesis_admin", "admin_assist", "agent"];
    expect(roles.filter(canManageStateAvailability)).toEqual(["admin"]);
  });

  it("accepts valid batch updates and rejects invalid or duplicate entries", () => {
    expect(parseStateAvailabilityUpdates([
      { stateCode: "ut", status: "Active" },
      { stateCode: "CA", status: "Pending" },
    ])).toEqual([
      { stateCode: "UT", status: "Active" },
      { stateCode: "CA", status: "Pending" },
    ]);

    expect(() => parseStateAvailabilityUpdates([{ stateCode: "UT", status: "Unknown" }]))
      .toThrow("Invalid availability status for UT");
    expect(() => parseStateAvailabilityUpdates([{ stateCode: "DC", status: "Active" }]))
      .toThrow("Invalid U.S. state code: DC");
    expect(() => parseStateAvailabilityUpdates([
      { stateCode: "UT", status: "Active" },
      { stateCode: "UT", status: "Pending" },
    ])).toThrow("Duplicate state update: UT");
  });

  it("seeds all 50 states Inactive and grants authenticated users read-only access", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260819160839_portal_state_availability.sql"),
      "utf8",
    );
    const seededStates = migration.match(/\('[A-Z]{2}', '[A-Za-z ]+', 'Inactive'\)/g) ?? [];

    expect(seededStates).toHaveLength(50);
    expect(migration).toContain("status in ('Active', 'Pending', 'Inactive')");
    expect(migration).toContain("alter table public.portal_state_availability enable row level security");
    expect(migration).toContain("revoke all on table public.portal_state_availability from anon, authenticated");
    expect(migration).toContain("grant select (state_code, state_name, status, created_at, updated_at)");
    expect(migration).not.toContain("grant update on table public.portal_state_availability to authenticated");
  });
});
