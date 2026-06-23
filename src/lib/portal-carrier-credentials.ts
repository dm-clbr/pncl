import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export interface CarrierCredentialItem {
  carrierId: string;
  carrier: string;
  loginUrl: string | null;
  username: string | null;
  password: string | null;
}

export interface UpsertCarrierCredentialInput {
  carrierId: string;
  username: string;
  password?: string;
}

function getFunctionUrl(name: string): string {
  const { url } = getSupabaseConfig();
  return `${url.replace(/\/$/, "")}/functions/v1/${name}`;
}

export async function fetchPortalCarrierCredentials(
  accessToken: string,
): Promise<CarrierCredentialItem[]> {
  if (!isSupabaseAuthConfigured()) {
    return [];
  }

  const { anonKey } = getSupabaseConfig();
  const response = await fetch(getFunctionUrl("list-portal-carrier-credentials"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load carrier credentials");
  }

  return (data.credentials ?? []) as CarrierCredentialItem[];
}

export async function upsertPortalCarrierCredential(
  accessToken: string,
  input: UpsertCarrierCredentialInput,
): Promise<void> {
  const { anonKey } = getSupabaseConfig();
  const response = await fetch(getFunctionUrl("upsert-portal-carrier-credential"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to save carrier credentials");
  }
}

export async function copyCredentialValue(value: string, label: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function hasCarrierCredentials(item: CarrierCredentialItem): boolean {
  return Boolean(item.username && item.password);
}
