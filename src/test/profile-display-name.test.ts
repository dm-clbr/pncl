import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "../../supabase/functions/_shared/profileDisplayName";
describe("editable profile names", () => {
  it("prefers Nathan's edited profile and preserves his historical agreement identity", () => {
    const user = { email: "nathan@example.com", user_metadata: { full_name: "Criddle Holdings LLC" } };
    const agreement = { legal_name: "Criddle Holdings LLC" };
    expect(resolveDisplayName(user, agreement.legal_name, { first_name: " Nathan ", last_name: "Criddle" })).toBe("Nathan Criddle");
    expect(agreement.legal_name).toBe("Criddle Holdings LLC");
    expect(user.user_metadata.full_name).toBe("Criddle Holdings LLC");
  });
  it("keeps sensible fallbacks for missing or blank profiles", () => {
    expect(resolveDisplayName({ user_metadata: { full_name: "Auth Name" } }, "Onboarding Name", { first_name: " ", last_name: null })).toBe("Onboarding Name");
    expect(resolveDisplayName({ user_metadata: { full_name: "Auth Name" } })).toBe("Auth Name");
    expect(resolveDisplayName({ email: "agent@example.com" })).toBe("agent");
  });
});
