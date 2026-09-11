import { getEmailDomain } from "./onboarding.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_RECOVERY_EMAILS = new Set(["dm@thepncl.com"]);

export function normalizeRecoveryEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function requirePersonalRecoveryEmail(value: unknown): string {
  const email = normalizeRecoveryEmail(value);
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new Error("A valid personal recovery email is required");
  }
  if (PLACEHOLDER_RECOVERY_EMAILS.has(email)) {
    throw new Error("The PNCL placeholder email cannot be used as a recovery email");
  }
  if (email.endsWith(`@${getEmailDomain().toLowerCase()}`)) {
    throw new Error("Use a personal recovery email, not a PNCL workspace address");
  }
  return email;
}
