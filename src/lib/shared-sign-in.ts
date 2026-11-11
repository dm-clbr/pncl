import { hubAccountSetup, type SetupStatus } from "./hub-account-setup";

export type SignInProduct = "LeadSpply" | "PNCL Pay";
export type SignInFailure = {
  message: string;
  retry: boolean;
  action?: "setup" | "signin" | "support";
};

/** Display only known explanations, never raw provider responses or sign-in URLs. */
export function sharedSignInError(error: unknown, product: SignInProduct): SignInFailure {
  const e = error as { code?: string; status?: number; name?: string } | null;
  const fail = (message: string, action: SignInFailure["action"] = "support", retry = false) => ({ message, action, retry });
  if (e?.status === 401 || e?.code === "unauthorized") return fail("Your Hub session has expired. Sign in to Hub again to continue.", "signin");
  if (["AbortError", "TimeoutError"].includes(e?.name ?? "") || e?.code === "sso_timeout") return fail(`${product} took too long to respond. Check your connection and try again.`, "support", true);
  switch (e?.code) {
    case "work_email_unverified": return fail("Hub could not verify your company account. Sign in with your confirmed @thepncl.com Google account. If this is already your account, contact support to review its access.", "signin");
    case "work_email_review_required": return fail("Hub could not verify your work email or onboarding eligibility. Contact support to review your account. Admin accounts do not need agent onboarding.");
    case "setup_incomplete": return fail("Finish your LeadSpply account verification, email matching and required approval in Account setup before using shared sign-in.", "setup");
    case "ownership_required": return fail("Ownership of your LeadSpply account has not been verified. Open Account setup and verify your existing LeadSpply login.", "setup");
    case "account_unavailable": return fail("Your linked LeadSpply account is unavailable for shared sign-in. Confirm your LeadSpply email, then contact support if access is still blocked.");
    case "pay_user_not_found": return fail("Your PNCL Pay account needs to be created by Bill before you can sign in. Contact PNCL support to arrange setup.");
    case "pay_validation_failed": return fail("PNCL Pay could not validate the account connection. Contact support to review Pay setup.");
    case "sso_not_enabled": return fail("Shared sign-in to LeadSpply is not enabled for your account yet. Contact support or use your normal LeadSpply login.");
    case "pay_unavailable":
      if (e.status === 503) return fail("PNCL Pay access is not enabled for your account yet. Contact support to arrange access.");
      return fail("PNCL Pay is temporarily unavailable. Please try again shortly.", "support", true);
    case "rate_limited": return fail("Too many sign-in attempts. Wait for the countdown, then try again.", "support", true);
    case "invalid_request": return fail(`This sign-in attempt is invalid or has expired. Return to the dashboard and open ${product} again to start a fresh sign-in.`);
    case "sso_unavailable":
    case "integration_unavailable": return fail(`The shared sign-in service for ${product} is unavailable. Please try again shortly. Contact support if this continues.`, "support", true);
    default: return fail(`${product} could not complete shared sign-in. Check your connection and try again. Contact support if this continues.`, "support", true);
  }
}

export function setupSignInError(status: SetupStatus): SignInFailure | null {
  if (status.state === "account_unavailable" && status.blockedReason === "email_confirmation_required") return { message: "Your LeadSpply email has not been confirmed. Open LeadSpply login, sign in and choose Resend confirmation email if prompted. Confirm the email, then return to Account setup to verify your existing login once.", action: "setup", retry: false };
  if (status.state === "account_unavailable") return sharedSignInError({ code: "account_unavailable" }, "LeadSpply");
  if (status.state === "not_linked") return { message: "Your Hub account is not linked to LeadSpply yet. Open Account setup to verify and link your existing account, or create one if you do not have one.", action: "setup", retry: false };
  if (status.state !== "connected") return null;
  const steps: string[] = [];
  if (!status.ownershipVerified) steps.push("verify ownership with your existing LeadSpply login");
  if (!status.emailMatches) steps.push("match your LeadSpply login email to your Hub work email");
  if (!status.approved) steps.push("contact support for the required LeadSpply account approval");
  return steps.length ? { message: `Shared sign-in is blocked. To continue, ${steps.join("; ")}. Open Account setup to review these steps.`, action: "setup", retry: false } : null;
}

/** Diagnose only the signed-in user's existing link after an eligibility failure. */
export async function explainSignInFailure(error: unknown, product: SignInProduct, token: string, signal: AbortSignal): Promise<SignInFailure> {
  const fallback = sharedSignInError(error, product);
  if ((error as { code?: string })?.code !== "setup_incomplete" || signal.aborted) return fallback;
  // A failed status lookup must not replace the original sign-in explanation.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const status = await hubAccountSetup<SetupStatus>(token, { action: "status" }, controller.signal);
    return setupSignInError(status) ?? fallback;
  } catch { return fallback; }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
