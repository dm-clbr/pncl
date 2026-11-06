export const PORTAL_PAY_PATH = "/portal/pay";

/** Existing CMS shortcuts must enter through Hub to use its authenticated session. */
export function portalPayHref(href: string): string {
  try {
    const url = new URL(href);
    if (
      ["https://pnclpay.com", "https://www.pnclpay.com"].includes(url.origin) &&
      !url.username && !url.password && !url.search && !url.hash &&
      ["/", "/login"].includes(url.pathname)
    ) return PORTAL_PAY_PATH;
  } catch { /* Internal links already use their intended route. */ }
  return href;
}

/** Defense in depth; the backend independently validates the provider response. */
export function payRedirectUrl(value: { url?: unknown; expiresAt?: unknown }): string {
  const fail = () => { throw new Error("PNCL Pay could not be opened. Please try again."); };
  if (typeof value?.url !== "string" || typeof value.expiresAt !== "string") return fail();
  const url = new URL(value.url);
  const remaining = Date.parse(value.expiresAt) - Date.now();
  if (
    url.origin !== "https://www.pnclpay.com" || url.username || url.password ||
    url.pathname !== "/api/auth/partner/redeem" || url.hash ||
    url.searchParams.getAll("token").length !== 1 || !url.searchParams.get("token") ||
    [...url.searchParams.keys()].some(key => key !== "token") ||
    !Number.isFinite(remaining) || remaining <= 0 || remaining > 125000
  ) return fail();
  return url.href;
}

export function payLaunchError(error: unknown) {
  const value = error as { code?: string; status?: number; retryAfter?: number } | null;
  switch (value?.code) {
    case "pay_user_not_found":
      return { message: "Your PNCL Pay account needs to be created by Bill before you can sign in. Contact PNCL support to arrange setup.", retry: false };
    case "setup_incomplete":
      return { message: "Finish your LeadSpply account verification, email matching and required approval before opening PNCL Pay.", retry: false };
    case "work_email_review_required":
    case "account_unavailable":
      return { message: "Your account needs review before you can open PNCL Pay. Contact PNCL support.", retry: false };
    case "pay_unavailable":
      return { message: value.status === 503 ? "PNCL Pay access is not enabled for your account yet." : "PNCL Pay is temporarily unavailable. Please try again shortly.", retry: value.status !== 503 };
    case "pay_validation_failed":
      return { message: "PNCL Pay needs a setup review. Contact PNCL support.", retry: false };
    case "rate_limited":
      return { message: "Too many attempts. Please wait before trying again.", retry: true };
    default:
      return { message: value?.status === 401 ? "Your Hub session has expired. Sign in to Hub again." : "PNCL Pay could not be opened. Please try again shortly.", retry: value?.status !== 401 };
  }
}

export function redirectToPay(url: string) {
  window.location.replace(url);
}
