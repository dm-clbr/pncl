import type { AgentOnboardingDetails } from "@/lib/admin-api";

function formatOnboardingValue(value: string | null | undefined, fallback = "—"): string {
  if (!value?.trim()) return fallback;
  return value.trim();
}

export default function AdminOnboardingDetailsPanel({
  onboarding,
  referrerName,
}: {
  onboarding: AgentOnboardingDetails;
  referrerName: string | null;
}) {
  const fields: Array<{ label: string; value: string }> = [
    { label: "Legal name", value: formatOnboardingValue(onboarding.legalName) },
    { label: "First name", value: formatOnboardingValue(onboarding.firstName) },
    { label: "Last name", value: formatOnboardingValue(onboarding.lastName) },
    { label: "PNCL email", value: formatOnboardingValue(onboarding.workspaceEmail ?? "") },
    { label: "Phone", value: formatOnboardingValue(onboarding.phoneNumber) },
    { label: "Date of birth", value: formatOnboardingValue(onboarding.dateOfBirth) },
    { label: "SSN", value: formatOnboardingValue(onboarding.ssn) },
    { label: "State of residence", value: formatOnboardingValue(onboarding.stateOfResidence) },
    { label: "Upline network", value: formatOnboardingValue(onboarding.uplineNetwork) },
    { label: "Referrer", value: formatOnboardingValue(referrerName) },
    { label: "Has license", value: formatOnboardingValue(onboarding.hasLicense) },
    { label: "NPN", value: formatOnboardingValue(onboarding.npn, "Not provided") },
    { label: "E&O insurance", value: formatOnboardingValue(onboarding.hasEoInsurance) },
  ];

  return (
    <dl className="admin-genesis-details-grid">
      {fields.map((field) => (
        <div key={field.label} className="admin-genesis-details-item">
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}
