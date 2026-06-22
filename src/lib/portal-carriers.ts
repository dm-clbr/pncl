import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export interface PortalCarrier {
  id: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string | null;
}

export async function fetchPortalCarriers(accessToken: string): Promise<PortalCarrier[]> {
  if (!isSupabaseAuthConfigured()) {
    return [];
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/list-portal-carriers`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load carriers");
  }

  return (data.carriers ?? []) as PortalCarrier[];
}
