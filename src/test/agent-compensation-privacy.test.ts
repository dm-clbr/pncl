import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("agent-facing compensation privacy", () => {
  it("does not repeat the profile tier in the shared dashboard summary", () => {
    const dashboard = source("src/pages/PortalDashboard.tsx");

    expect(dashboard).not.toContain("profile?.comp_level");
    expect(dashboard).not.toContain("Compensation tier");
  });

  it("does not include compensation values in team progress or invalid-link guidance", () => {
    const downline = source("src/components/PortalDownlinePanel.tsx");
    const onboarding = source("src/pages/AgentOnboarding.tsx");

    expect(downline).not.toContain("member.invitedCompLevel");
    expect(onboarding).not.toContain("attribution and compensation");
  });

  it("does not send the assigned contract value to referral-link visitors", () => {
    const publicLookup = source("supabase/functions/get-referrer-info/index.ts");
    const referralClient = source("src/lib/referral.ts");

    expect(publicLookup).not.toContain("resolved.compLevel");
    expect(referralClient).not.toContain("data.compLevel");
  });
});
