import { getSupabaseConfig } from "./supabase";
export type SetupStatus = {
  state: "not_linked" | "connected" | "account_unavailable";
  email: string;
  account: null | { id: string; email: string };
  ownershipVerified: boolean;
  proofExpiresAt: string | null;
  emailMatches: boolean;
  approved: boolean;
  ready: boolean;
  payEnabled: boolean;
};
export async function hubAccountSetup<T>(
  token: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(
    url.replace(/\/$/, "") + "/functions/v1/portal-leadspply-setup",
    {
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer " + token,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      typeof value?.message === "string"
        ? value.message
        : "Account setup is unavailable. Try again shortly.",
    ) as Error & { retryAfter?: number; code?: string };
    if (typeof value?.error === "string") error.code = value.error;
    const delay = Number(response.headers.get("Retry-After"));
    if (response.status === 429) {
      error.retryAfter = Number.isFinite(delay) && delay > 0
        ? Math.min(3600, delay)
        : 60;
    }
    throw error;
  }
  return value as T;
}
export const US_STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY"
    .split(" ");
export type Registration = {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  kind: "rep" | "setter";
  npn: string;
  states: string[];
  inviteCode: string;
  businessType: "sole_proprietor" | "business";
  businessName: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  postal: string;
  terms: boolean;
  agreement: boolean;
  smsService: boolean;
  smsMarketing: boolean;
};
export const emptyRegistration: Registration = {
  firstName: "",
  lastName: "",
  phone: "",
  password: "",
  kind: "rep",
  npn: "",
  states: [],
  inviteCode: "",
  businessType: "sole_proprietor",
  businessName: "",
  ein: "",
  address: "",
  city: "",
  state: "",
  postal: "",
  terms: false,
  agreement: false,
  smsService: false,
  smsMarketing: false,
};
