import { getSupabaseClient } from "@/lib/supabase";
import { normalizeStateLicenseNumbers } from "@/lib/portal-profile";
import {
  US_STATES,
  US_JURISDICTION_COUNT,
  isUsStateCode,
  type UsStateCode,
} from "@/lib/us-states";

export const STATE_AVAILABILITY_STATUSES = ["Active", "Pending", "Inactive"] as const;

export type StateAvailabilityStatus = (typeof STATE_AVAILABILITY_STATUSES)[number];

export interface StateAvailability {
  stateCode: UsStateCode;
  stateName: string;
  status: StateAvailabilityStatus;
  createdAt: string;
  updatedAt: string;
}

interface StateAvailabilityRecord {
  state_code: string;
  state_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const STATE_AVAILABILITY_META: Record<
  StateAvailabilityStatus,
  { color: string; description: string }
> = {
  Active: {
    color: "#36b37e",
    description: "PNCL is currently operating in this state.",
  },
  Pending: {
    color: "#f2b84b",
    description: "PNCL availability in this state is in progress.",
  },
  Inactive: {
    color: "#596273",
    description: "PNCL is not currently operating in this state.",
  },
};

export function isStateAvailabilityStatus(value: unknown): value is StateAvailabilityStatus {
  return typeof value === "string"
    && (STATE_AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

export function normalizeStateAvailabilityRows(value: unknown): StateAvailability[] {
  if (!Array.isArray(value)) {
    throw new Error("State availability data is unavailable.");
  }

  const byCode = new Map<UsStateCode, StateAvailability>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<StateAvailabilityRecord>;
    const code = typeof row.state_code === "string" ? row.state_code.trim().toUpperCase() : "";
    if (!isUsStateCode(code) || !isStateAvailabilityStatus(row.status)) continue;

    const expected = US_STATES.find((state) => state.code === code);
    if (!expected || row.state_name !== expected.name) continue;

    byCode.set(code, {
      stateCode: code,
      stateName: expected.name,
      status: row.status,
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    });
  }

  if (byCode.size !== US_JURISDICTION_COUNT) {
    throw new Error(
      `State availability is incomplete (${byCode.size} of ${US_JURISDICTION_COUNT} jurisdictions).`,
    );
  }

  return US_STATES.map((state) => byCode.get(state.code) as StateAvailability);
}

export async function fetchStateAvailability(): Promise<StateAvailability[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_state_availability")
    .select("state_code, state_name, status, created_at, updated_at")
    .order("state_name", { ascending: true });

  if (error) throw error;
  return normalizeStateAvailabilityRows(data);
}

export function licensedStateCodes(value: unknown): Set<UsStateCode> {
  return new Set(
    Object.keys(normalizeStateLicenseNumbers(value)).filter(isUsStateCode),
  );
}

export function countStateAvailability(
  states: StateAvailability[],
): Record<StateAvailabilityStatus, number> {
  const counts: Record<StateAvailabilityStatus, number> = {
    Active: 0,
    Pending: 0,
    Inactive: 0,
  };
  for (const state of states) counts[state.status] += 1;
  return counts;
}
