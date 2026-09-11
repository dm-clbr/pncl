import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911202712_portal_recovery_email.sql"),
  "utf8",
);

describe("portal recovery-email migration", () => {
  it("adds owner-visible recovery state without requiring a guessed legacy value", () => {
    expect(migration).toMatch(/add column if not exists recovery_email text/i);
    expect(migration).toMatch(/recovery_email_sync_status/i);
    expect(migration).not.toMatch(/recovery_email text not null/i);
    expect(migration).toMatch(/never infers a personal address/i);
  });

  it("backfills only explicit valid non-PNCL ICA/onboarding emails", () => {
    expect(migration).toContain("latest_onboarding");
    expect(migration).toContain("portal_ica");
    expect(migration).toMatch(/personal_email is not null/i);
    expect(migration).toMatch(/!~ '@thepncl\\.com\$'/i);
  });

  it("clears the legacy dm placeholder from the editable agent profile without guessing a replacement", () => {
    expect(migration).toMatch(/dm@thepncl\.com/i);
    expect(migration).toMatch(/set recovery_email = null/i);
    expect(migration).toMatch(/Do not rewrite signed ICA history/i);
  });

  it("preserves RLS and has no anonymous or public read policy", () => {
    expect(migration).toMatch(/relrowsecurity/i);
    expect(migration).toContain("Users can read own profile");
    expect(migration).toContain("array['anon', 'public']");
  });
});
