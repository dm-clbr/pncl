import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260823211238_add_portal_profile_phone.sql"),
  "utf8",
);

const placeholderMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260823212828_reject_portal_profile_placeholder_phone.sql"),
  "utf8",
);

describe("portal profile phone migration", () => {
  it("backfills the matching onboarding phone without weakening own-profile access", () => {
    expect(migration).toMatch(/add column if not exists phone_number text/i);
    expect(migration).not.toMatch(/phone_number text not null/i);
    expect(migration).toMatch(/phone_number is null/i);
    expect(migration).toMatch(/latest_onboarding/i);
    expect(migration).toMatch(/profile\.user_id::text = onboarding\.supabase_user_id/i);
    expect(migration).toMatch(/phone_number <> '000-000-0000'/i);
    expect(migration).toMatch(/grant select, insert, update on table public\.portal_profiles to authenticated/i);
    expect(migration).toMatch(/relrowsecurity/i);
    expect(migration).toMatch(/Users can update own profile/i);
    expect(migration).not.toMatch(/create policy/i);
  });

  it("clears the system placeholder without adding a NOT NULL requirement", () => {
    expect(placeholderMigration).toMatch(/set phone_number = null/i);
    expect(placeholderMigration).toMatch(/where phone_number = '000-000-0000'/i);
    expect(placeholderMigration).toMatch(/phone_number <> '000-000-0000'/i);
    expect(placeholderMigration).toMatch(/relrowsecurity/i);
    expect(placeholderMigration).not.toMatch(/not null/i);
    expect(placeholderMigration).not.toMatch(/create policy/i);
  });
});
