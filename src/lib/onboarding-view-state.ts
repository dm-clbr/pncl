import type {
  OnboardingStatusResponse,
  RevealCredentialsResponse,
} from "./onboarding-api";

export type OnboardingViewState =
  | "loading"
  | "creating"
  | "ready"
  | "revealed"
  | "viewed"
  | "failed"
  | "expired";

export function resolveOnboardingViewState(
  status: OnboardingStatusResponse | null,
  revealed: RevealCredentialsResponse | null,
): OnboardingViewState {
  if (revealed) return "revealed";
  if (!status) return "loading";

  if (status.status === "failed") return "failed";
  if (status.status === "expired") return "expired";
  if (status.status === "credentials_viewed" || status.credentialsViewed) return "viewed";
  if (status.status === "ready" || status.status === "email_created") return "ready";
  return "creating";
}
