import type { AgentSummary } from "@/lib/admin-api";

export type ProfileRequirementKey =
  | "onboarding_record"
  | "email_confirmation"
  | "agent_id"
  | "compensation_tier"
  | "license_npn"
  | "workspace_account"
  | "profile_photo";

export interface ProfileRequirementGap {
  key: ProfileRequirementKey;
  label: string;
}

export interface ProfileCompletenessReview {
  agent: AgentSummary;
  gaps: ProfileRequirementGap[];
}

const REQUIREMENTS: Record<ProfileRequirementKey, string> = {
  onboarding_record: "Onboarding record",
  email_confirmation: "Portal email confirmation",
  agent_id: "Agent ID",
  compensation_tier: "Compensation tier",
  license_npn: "NPN for licensed agent",
  workspace_account: "Google Workspace account",
  profile_photo: "Profile photo",
};

function gap(key: ProfileRequirementKey): ProfileRequirementGap {
  return { key, label: REQUIREMENTS[key] };
}

/**
 * Returns admin-safe, operational profile gaps. It intentionally contains no
 * phone, date of birth, SSN, personal-email, password, or raw onboarding data.
 */
export function getProfileCompletenessGaps(agent: AgentSummary): ProfileRequirementGap[] {
  const gaps: ProfileRequirementGap[] = [];
  if (!agent.hasOnboardingRecord) gaps.push(gap("onboarding_record"));
  if (!agent.emailConfirmed) gaps.push(gap("email_confirmation"));
  if (agent.agentNumber == null) gaps.push(gap("agent_id"));
  if (agent.compLevel == null) gaps.push(gap("compensation_tier"));

  const isLicensed = agent.onboarding?.hasLicense?.trim().toLowerCase() === "yes";
  if (isLicensed && !agent.npn) gaps.push(gap("license_npn"));

  if (agent.hasOnboardingRecord && agent.googleWorkspaceStatus !== "active") {
    gaps.push(gap("workspace_account"));
  }
  if (!agent.profilePhotoPath) gaps.push(gap("profile_photo"));
  return gaps;
}

export function getProfileCompletenessQueue(agents: AgentSummary[]): ProfileCompletenessReview[] {
  return agents
    .map((agent) => ({ agent, gaps: getProfileCompletenessGaps(agent) }))
    .filter((review) => review.gaps.length > 0)
    .sort((a, b) => b.gaps.length - a.gaps.length || a.agent.name.localeCompare(b.agent.name));
}
