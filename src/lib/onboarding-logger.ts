type LogLevel = "info" | "warn" | "error";

function formatLog(step: string, data: Record<string, unknown> = {}): string {
  const parts = Object.entries(data)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);
  return parts.length
    ? `[pncl-onboarding] ${step} | ${parts.join(" | ")}`
    : `[pncl-onboarding] ${step}`;
}

function logOnboarding(
  step: string,
  data: Record<string, unknown> = {},
  level: LogLevel = "info",
): void {
  const line = formatLog(step, data);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logOnboardingSubmitStarted(legalName: string): void {
  logOnboarding("form_submit_started", { legalName });
}

export function logOnboardingSubmitSuccess(
  onboardingId: string,
  status: string,
  details: Record<string, unknown> = {},
): void {
  logOnboarding("form_submit_response", { onboardingId, status, ...details });
}

export function logOnboardingSubmitError(message: string, details: Record<string, unknown> = {}): void {
  logOnboarding("form_submit_failed", { message, ...details }, "error");
}

export function logOnboardingStatusPoll(
  onboardingId: string,
  status: string,
  details: Record<string, unknown> = {},
): void {
  const level = status === "failed" ? "error" : "info";
  logOnboarding("status_poll", { onboardingId, status, ...details }, level);
}

export function logOnboardingStatusError(
  onboardingId: string,
  message: string,
  details: Record<string, unknown> = {},
): void {
  logOnboarding("status_poll_failed", { onboardingId, message, ...details }, "error");
}

export function logOnboardingReveal(
  onboardingId: string,
  outcome: "success" | "error",
  message?: string,
): void {
  logOnboarding(
    "credentials_reveal",
    { onboardingId, outcome, message: message ?? "" },
    outcome === "error" ? "error" : "info",
  );
}
