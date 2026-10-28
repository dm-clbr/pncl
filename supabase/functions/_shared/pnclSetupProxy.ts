import { object, SetupError, type SetupStatus } from "./pnclSetupContract.ts";
export const setupMessages: Record<string, string> = {
  invalid_request: "Check the form fields and try again.",
  invalid_credentials: "Check your LeadSpply login and authentication code.",
  mfa_required:
    "Enter the six-digit code from your LeadSpply authenticator, then verify again.",
  mfa_review_required:
    "Contact support to verify this account’s authentication method.",
  work_email_review_required:
    "Your Hub work email needs review. Refresh this page or contact support.",
  integration_unavailable:
    "Account setup is temporarily unavailable. Try again shortly.",
  account_unavailable: "This account needs support review.",
  account_already_linked:
    "One of these accounts is already linked. Contact support before continuing.",
  identity_review_required:
    "These accounts need support review before they can be linked.",
  existing_account:
    "An account already exists. Verify and link it instead of creating another.",
  ownership_required:
    "Verify your existing LeadSpply account again before changing its email.",
  email_conflict:
    "Your Hub email is already used by another LeadSpply account. Contact support.",
  email_update_failed:
    "The update could not be confirmed. Refresh status before trying again.",
  email_update_cooldown:
    "Wait one minute before trying the email update again.",
  phone_verification_required:
    "Verify this phone number before creating your account.",
  phone_unavailable: "Phone verification is unavailable. Try again shortly.",
  invalid_phone_code: "Check the phone verification code and try again.",
  invite_required:
    "Enter a valid approved agent’s invite code for a setter account.",
  registration_failed:
    "Account creation could not be confirmed. Refresh status before retrying.",
  rate_limited: "Too many attempts. Please wait before trying again.",
  setup_incomplete:
    "Finish linking, email matching and required account approval first.",
  pay_unavailable: "PNCL Pay SSO is not available yet.",
  pay_user_not_found:
    "Your PNCL Pay account needs to be set up. Contact support.",
  pay_validation_failed:
    "PNCL Pay needs configuration review. Contact support.",
};
export function sanitizeSetupStatus(
  value: unknown,
  email: string,
): SetupStatus {
  const b = object(value);
  if (
    !["not_linked", "connected", "account_unavailable"].includes(
      String(b.state),
    ) || b.email !== email
  ) throw new SetupError("integration_unavailable", 502);
  for (
    const key of ["ownershipVerified", "emailMatches", "approved", "ready"]
  ) {
    if (typeof b[key] !== "boolean") {
      throw new SetupError(
        "integration_unavailable",
        502,
      );
    }
  }
  const account = b.state === "connected" ? object(b.account) : null;
  if (
    account &&
    (typeof account.id !== "string" || !/^[0-9a-f-]{36}$/i.test(account.id) ||
      typeof account.email !== "string" || account.email.length > 254)
  ) throw new SetupError("integration_unavailable", 502);
  if (
    b.proofExpiresAt !== null &&
    (typeof b.proofExpiresAt !== "string" ||
      !Number.isFinite(Date.parse(b.proofExpiresAt)))
  ) throw new SetupError("integration_unavailable", 502);
  const matches = Boolean(
    account && account.email === email && b.emailMatches === true,
  );
  return {
    state: b.state as SetupStatus["state"],
    email,
    account: account
      ? { id: account.id as string, email: account.email as string }
      : null,
    ownershipVerified: b.ownershipVerified === true,
    proofExpiresAt: b.proofExpiresAt as string | null,
    emailMatches: matches,
    approved: b.approved === true,
    ready: Boolean(
      account && matches && b.ownershipVerified === true &&
        b.approved === true && b.ready === true,
    ),
  };
}
