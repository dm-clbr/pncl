const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PNCL_DOMAIN = "thepncl.com";
const PLACEHOLDER_RECOVERY_EMAILS = new Set(["dm@thepncl.com"]);

export function normalizeRecoveryEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/** A recovery address must remain outside the PNCL Workspace domain. */
export function validateRecoveryEmail(value: string | null | undefined): string | null {
  const email = normalizeRecoveryEmail(value);
  if (!email) return "A personal recovery email is required.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid personal recovery email.";
  if (PLACEHOLDER_RECOVERY_EMAILS.has(email)) {
    return "The PNCL placeholder email cannot be used as a recovery email.";
  }
  if (email.endsWith(`@${PNCL_DOMAIN}`)) {
    return "Use a personal email address, not your @thepncl.com address.";
  }
  return null;
}
