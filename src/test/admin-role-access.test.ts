import { describe, expect, it } from "vitest";
import {
  canAccessCarrierWritingNumbers,
  canAccessAdminConsole,
  canAccessHierarchy,
  canExportHierarchy,
  canUseGenesisAdminEndpoint,
  isFullAdminRole,
  shouldReturnAdminAssistHierarchy,
  type PortalRole,
} from "../../supabase/functions/_shared/adminRoles";

describe("admin role access boundaries", () => {
  it("limits carrier writing-number access to full admins", () => {
    expect(canAccessCarrierWritingNumbers("admin")).toBe(true);
    expect(canAccessCarrierWritingNumbers("genesis_admin")).toBe(false);
    expect(canAccessCarrierWritingNumbers("admin_assist")).toBe(false);
    expect(canAccessCarrierWritingNumbers("agent")).toBe(false);
  });

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
    expect(canExportHierarchy("admin_assist")).toBe(false);
    expect(canExportHierarchy("genesis_admin")).toBe(false);
    expect(canExportHierarchy("agent")).toBe(false);
  });

  it("keeps Genesis admins out of hierarchy and hierarchy export", () => {
    const role: PortalRole = "genesis_admin";

    expect(canUseGenesisAdminEndpoint(role)).toBe(true);
    expect(canAccessHierarchy(role)).toBe(false);
    expect(canExportHierarchy(role)).toBe(false);
  });

  it("always returns the restricted hierarchy to admin assists", () => {
    expect(shouldReturnAdminAssistHierarchy("admin_assist", null)).toBe(true);
    expect(shouldReturnAdminAssistHierarchy("admin_assist", "full")).toBe(true);
  });

  it("lets full admins request the restricted hierarchy preview", () => {
    expect(shouldReturnAdminAssistHierarchy("admin", "admin_assist")).toBe(true);
    expect(shouldReturnAdminAssistHierarchy("admin", null)).toBe(false);
    expect(shouldReturnAdminAssistHierarchy("agent", "admin_assist")).toBe(false);
  });
});
