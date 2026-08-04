import { describe, expect, it } from "vitest";
import {
  canPendingPortalEnrollmentUsePath,
  isPendingPortalEnrollment,
  PORTAL_ACTIVATE_PATH,
  PORTAL_HOME_PATH,
  resolvePortalOAuthCompletionPath,
} from "@/lib/portal-auth";

describe("portal OAuth enrollment routing", () => {
  it("identifies only incomplete version 3 enrollments as pending", () => {
    expect(isPendingPortalEnrollment({ enrollment_version: 3, enrollment_ready: false })).toBe(true);
    expect(isPendingPortalEnrollment({ enrollment_version: 3, enrollment_ready: true })).toBe(false);
    expect(isPendingPortalEnrollment({ enrollment_version: 2, enrollment_ready: false })).toBe(false);
  });

  it("preserves a pending session on OAuth return paths", () => {
    expect(canPendingPortalEnrollmentUsePath("/portal/login")).toBe(true);
    expect(canPendingPortalEnrollmentUsePath("/")).toBe(true);
    expect(canPendingPortalEnrollmentUsePath("/onboarding/activate")).toBe(true);
    expect(canPendingPortalEnrollmentUsePath("/portal")).toBe(false);
  });

  it.each([
    ["/portal/login", "/portal", PORTAL_ACTIVATE_PATH],
    ["/", "/portal", PORTAL_ACTIVATE_PATH],
    ["/", null, PORTAL_ACTIVATE_PATH],
  ])("routes a pending enrollment returning through %s to activation", (pathname, returnPath, expected) => {
    expect(resolvePortalOAuthCompletionPath(pathname, returnPath, true)).toBe(expected);
  });

  it.each([
    ["/portal/login", "/portal/profile", "/portal/profile"],
    ["/", "/portal", PORTAL_HOME_PATH],
    ["/", null, PORTAL_HOME_PATH],
  ])("routes a ready enrollment returning through %s to the requested portal path", (pathname, returnPath, expected) => {
    expect(resolvePortalOAuthCompletionPath(pathname, returnPath, false)).toBe(expected);
  });

  it("does not redirect an unrelated ready route without a stored OAuth return", () => {
    expect(resolvePortalOAuthCompletionPath("/about", null, false)).toBeNull();
  });
});
