import { describe, expect, it } from "vitest";
import {
  canAccessAdminConsole,
  canAccessHierarchy,
  canExportHierarchy,
  canUseGenesisAdminEndpoint,
  isFullAdminRole,
  type PortalRole,
} from "../../supabase/functions/_shared/adminRoles";

describe("admin role access boundaries", () => {
  it("limits admin_assist to the read-only hierarchy surface", () => {
    const role: PortalRole = "admin_assist";

    expect(canAccessAdminConsole(role)).toBe(true);
    expect(canAccessHierarchy(role)).toBe(true);
    expect(isFullAdminRole(role)).toBe(false);
    expect(canExportHierarchy(role)).toBe(false);
    expect(canUseGenesisAdminEndpoint(role)).toBe(false);
  });

  it("preserves full admin hierarchy and export access", () => {
    const role: PortalRole = "admin";

    expect(canAccessHierarchy(role)).toBe(true);
    expect(canExportHierarchy(role)).toBe(true);
    expect(isFullAdminRole(role)).toBe(true);
  });

  it("keeps Genesis admins out of hierarchy and hierarchy export", () => {
    const role: PortalRole = "genesis_admin";

    expect(canUseGenesisAdminEndpoint(role)).toBe(true);
    expect(canAccessHierarchy(role)).toBe(false);
    expect(canExportHierarchy(role)).toBe(false);
  });
});
