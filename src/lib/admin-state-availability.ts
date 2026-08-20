import { getSupabaseConfig } from "@/lib/supabase";
import type {
  StateAvailability,
  StateAvailabilityStatus,
} from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";

export interface StateAvailabilityUpdate {
  stateCode: UsStateCode;
  status: StateAvailabilityStatus;
}

export async function updateStateAvailability(
  accessToken: string,
  updates: StateAvailabilityUpdate[],
): Promise<{ states: StateAvailability[]; message: string }> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(
    `${url.replace(/\/$/, "")}/functions/v1/admin-update-state-availability`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updates }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to update state availability.");
  }
  return data as { states: StateAvailability[]; message: string };
}
