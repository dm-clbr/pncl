import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canManageStateAvailability,
  type PortalRole,
} from "../../supabase/functions/_shared/adminRoles";
import {
  parseStateAvailabilityUpdates,
  US_STATE_NAMES,
} from "../../supabase/functions/_shared/stateAvailability";

describe("state availability authorization", () => {
  it("allows only the full admin role to manage company statuses", () => {
    const roles: PortalRole[] = ["admin", "genesis_admin", "admin_assist", "agent"];
    expect(roles.filter(canManageStateAvailability)).toEqual(["admin"]);
  });

  it("accepts valid batch updates and rejects invalid or duplicate entries", () => {
    expect(parseStateAvailabilityUpdates([
      { stateCode: "dc", status: "Active" },
      { stateCode: "CA", status: "Pending" },
    ])).toEqual([
      { stateCode: "DC", status: "Active" },
      { stateCode: "CA", status: "Pending" },
    ]);

    expect(() => parseStateAvailabilityUpdates([{ stateCode: "UT", status: "Unknown" }]))
      .toThrow("Invalid availability status for UT");
    expect(() => parseStateAvailabilityUpdates([{ stateCode: "PR", status: "Active" }]))
      .toThrow("Invalid U.S. state code: PR");
    expect(() => parseStateAvailabilityUpdates([
      { stateCode: "UT", status: "Active" },
      { stateCode: "UT", status: "Pending" },
    ])).toThrow("Duplicate state update: UT");

    expect(parseStateAvailabilityUpdates(
      Object.keys(US_STATE_NAMES).map((stateCode) => ({ stateCode, status: "Inactive" })),
    )).toHaveLength(51);
  });

  it("seeds 50 states plus D.C. Inactive and preserves authenticated read-only access", () => {
    const initialMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260819160839_portal_state_availability.sql"),
      "utf8",
    );
    const dcMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260823203115_add_dc_state_availability.sql"),
      "utf8",
    );
    const seededStates = initialMigration.match(/\('[A-Z]{2}', '[A-Za-z ]+', 'Inactive'\)/g) ?? [];

    expect(seededStates).toHaveLength(50);
    expect(dcMigration).toContain("values ('DC', 'District of Columbia', 'Inactive')");
    expect(dcMigration).toContain("on conflict (state_code) do nothing");
    expect(dcMigration).toContain("'DE', 'DC', 'FL'");
    expect(initialMigration).toContain("status in ('Active', 'Pending', 'Inactive')");
    expect(initialMigration).toContain("alter table public.portal_state_availability enable row level security");
    expect(initialMigration).toContain("revoke all on table public.portal_state_availability from anon, authenticated");
    expect(initialMigration).toContain("grant select (state_code, state_name, status, created_at, updated_at)");
    expect(initialMigration).not.toContain("grant update on table public.portal_state_availability to authenticated");
  });
});
