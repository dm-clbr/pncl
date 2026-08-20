import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { updateStateAvailability } from "@/lib/admin-state-availability";
import { useStateAvailability } from "@/hooks/useStateAvailability";
import type { StateAvailabilityStatus } from "@/lib/portal-state-availability";
import type { UsStateCode } from "@/lib/us-states";

export function useAdminStateAvailability() {
  const { session } = useAuth();
  const availability = useStateAvailability();
  const { reload } = availability;

  const save = useCallback(async (
    updates: Array<{ stateCode: UsStateCode; status: StateAvailabilityStatus }>,
  ) => {
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Not authenticated");
    const result = await updateStateAvailability(accessToken, updates);
    await reload();
    return result;
  }, [reload, session?.access_token]);

  return { ...availability, save };
}
