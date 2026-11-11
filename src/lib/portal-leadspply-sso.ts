import { sharedSignInError } from "./shared-sign-in";
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
  if ([...params.keys()].some(k => k !== "challenge") || params.getAll("challenge").length !== 1 || !challenge || !/^[0-9a-f]{64}$/.test(challenge)) throw Object.assign(new Error("invalid_request"), { code: "invalid_request" });
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
  return sharedSignInError(error, "LeadSpply").message;
}
export function redirectToLeadSpply(url: string) { window.location.replace(url); }
