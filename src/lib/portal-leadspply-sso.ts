import { getSupabaseConfig } from "./supabase";
import { validateLink } from "../../supabase/functions/_shared/pnclSsoContract";
export const PORTAL_LEADSPPLY_OPEN = "/portal/leadspply/open";
export const LEADSPPLY_START = "https://leadspply.com/pncl-sso.html";
export function portalLeadSpplyHref(href: string) {
  try {
    const u = new URL(href);
    if (["https://leadspply.com", "https://www.leadspply.com"].includes(u.origin) && !u.username && !u.password && !u.hash && !u.search && ["/", "/login", "/dashboard"].includes(u.pathname)) return PORTAL_LEADSPPLY_OPEN;
  } catch { /* preserve existing internal links */ }
  return href;
}
export function launchChallenge(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const challenge = params.get("challenge");
  if ([...params.keys()].some(k => k !== "challenge") || params.getAll("challenge").length !== 1 || !challenge || !/^[0-9a-f]{64}$/.test(challenge)) throw new Error("invalid_request");
  return challenge;
}
export async function requestLeadSpplyLink(token: string, challenge: string, signal: AbortSignal) {
  const { url, anonKey } = getSupabaseConfig();
  const res = await fetch(url.replace(/\/$/, "") + "/functions/v1/portal-leadspply-sso", { method: "POST", signal, headers: { Authorization: "Bearer " + token, apikey: anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ challenge }) });
  const value = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error("LeadSpply sign-in could not finish."), { code: value?.error, status: res.status, retryAfter: res.status === 429 ? Number(res.headers.get("Retry-After")) || 600 : undefined });
  return validateLink(value);
}
export function leadSpplyLaunchError(error: unknown) {
  const e = error as { code?: string; status?: number };
  switch (e?.code) {
    case "setup_incomplete": return "Finish your LeadSpply verification, email matching and approval in account setup.";
    case "work_email_review_required": return "Your work email needs a support review before you can open LeadSpply.";
    case "sso_unavailable": return "Hub sign-in to LeadSpply is not available for your account yet. You can still use your normal LeadSpply login.";
    case "rate_limited": return "Too many sign-in attempts. Please wait a few minutes, then open LeadSpply from the dashboard again.";
    default: return e?.status === 401 ? "Your Hub session has expired. Sign in to Hub again." : "LeadSpply could not be opened. Please try again from the dashboard.";
  }
}
export function redirectToLeadSpply(url: string) { window.location.replace(url); }
