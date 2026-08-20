export const STATE_AVAILABILITY_STATUSES = ["Active", "Pending", "Inactive"] as const;

export type StateAvailabilityStatus = (typeof STATE_AVAILABILITY_STATUSES)[number];

export const US_STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
} as const;

export type UsStateCode = keyof typeof US_STATE_NAMES;

export function isStateAvailabilityStatus(value: unknown): value is StateAvailabilityStatus {
  return typeof value === "string"
    && (STATE_AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

export function isUsStateCode(value: string): value is UsStateCode {
  return value in US_STATE_NAMES;
}

export interface StateAvailabilityUpdate {
  stateCode: UsStateCode;
  status: StateAvailabilityStatus;
}

export function parseStateAvailabilityUpdates(value: unknown): StateAvailabilityUpdate[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error("updates must contain between 1 and 50 state updates");
  }

  const updates: StateAvailabilityUpdate[] = [];
  const seen = new Set<UsStateCode>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new Error("Each state update must be an object");
    }
    const input = item as Record<string, unknown>;
    const stateCode = typeof input.stateCode === "string"
      ? input.stateCode.trim().toUpperCase()
      : "";
    if (!isUsStateCode(stateCode)) {
      throw new Error(`Invalid U.S. state code: ${stateCode || "missing"}`);
    }
    if (!isStateAvailabilityStatus(input.status)) {
      throw new Error(`Invalid availability status for ${stateCode}`);
    }
    if (seen.has(stateCode)) {
      throw new Error(`Duplicate state update: ${stateCode}`);
    }
    seen.add(stateCode);
    updates.push({ stateCode, status: input.status });
  }

  return updates;
}
