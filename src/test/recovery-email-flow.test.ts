import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const publicIca = source("supabase/functions/submit-onboarding-contract/index.ts");
const portalIca = source("supabase/functions/submit-portal-ica/index.ts");
const recoverySync = source("supabase/functions/sync-portal-recovery-email/index.ts");
const sharedSync = source("supabase/functions/_shared/portalRecoveryEmail.ts");
const profile = source("src/pages/PortalProfile.tsx");
const portalIcaClient = source("src/lib/portal-ica.ts");
const icaAcroform = source("src/lib/ica-acroform.ts");

describe("mandatory recovery email flow", () => {
  it("validates the public onboarding ICA source before it persists a contract", () => {
    expect(publicIca).toContain("validateSubmitOnboardingContractPayload");
    expect(source("supabase/functions/_shared/onboardingContract.ts")).toContain("requirePersonalRecoveryEmail");
    expect(icaAcroform).toContain("validateRecoveryEmail");
  });

  it("validates and syncs the signed-in portal ICA source", () => {
    expect(portalIca).toContain("validateSubmitOnboardingContractPayload");
    expect(portalIca).toContain("syncPortalRecoveryEmailForUser");
    expect(portalIca).toContain("recoverySync");
  });

  it("does not prefill a portal ICA with the invalid PNCL Workspace address", () => {
    expect(portalIcaClient).toContain("recoveryEmail?.trim() ?? \"\"");
    expect(portalIcaClient).not.toContain("email: user?.email?.trim()");
  });

  it("requires and displays the recovery address in the agent's own profile", () => {
    expect(profile).toContain("Personal recovery email");
    expect(profile).toContain("required");
    expect(profile).toContain('updateField("recoveryEmail", event.target.value)');
    expect(profile).toContain("Google recovery status");
    expect(profile).toContain("Retry Google sync");
  });

  it("uses an authenticated owner-only endpoint, never an admin browser action", () => {
    expect(recoverySync).toContain("requirePortalUser(req)");
    expect(recoverySync).not.toContain("requireAdmin(req)");
    expect(sharedSync).toContain('.eq("supabase_user_id", user.id)');
    expect(sharedSync).toContain('.eq("user_id", user.id)');
    expect(sharedSync).toContain("updateWorkspaceUserRecovery");
  });

  it("records a safe error state for retry without exposing Workspace credentials", () => {
    expect(sharedSync).toContain('recovery_email_sync_status: "error"');
    expect(sharedSync).toContain("Google sync needs attention");
    expect(sharedSync).not.toContain("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  });
});
