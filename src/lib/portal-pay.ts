import { sharedSignInError } from "./shared-sign-in";
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
  return sharedSignInError(error, "PNCL Pay");
}

export function redirectToPay(url: string) {
  window.location.replace(url);
}
