import { describe, expect, it } from "vitest";
import {
  STATE_AVAILABILITY_STATUSES,
  licensedStateCodes,
  normalizeStateAvailabilityRows,
} from "@/lib/portal-state-availability";
import { US_STATES } from "@/lib/us-states";

function completeRows() {
  return US_STATES.map((state, index) => ({
    state_code: state.code,
    state_name: state.name,
    status: index === 0 ? "Active" : index === 1 ? "Pending" : "Inactive",
    created_at: "2026-08-19T00:00:00.000Z",
    updated_at: "2026-08-19T00:00:00.000Z",
  }));
}

describe("state availability model", () => {
  it("defines exactly the three product statuses", () => {
    expect(STATE_AVAILABILITY_STATUSES).toEqual(["Active", "Pending", "Inactive"]);
  });

  it("accepts one valid row for each of the 50 states", () => {
    const states = normalizeStateAvailabilityRows(completeRows().reverse());

    expect(states).toHaveLength(50);
    expect(new Set(states.map((state) => state.stateCode))).toHaveLength(50);
    expect(states[0]).toMatchObject({ stateCode: "AL", stateName: "Alabama", status: "Active" });
  });

  it("rejects incomplete availability instead of inventing a status", () => {
    expect(() => normalizeStateAvailabilityRows(completeRows().slice(0, 49)))
      .toThrow("State availability is incomplete (49 of 50 states).");
  });

  it("derives the licensed overlay only from number-bearing profile entries", () => {
    expect([...licensedStateCodes({ UT: "LIC-123", ca: " 88 ", TX: "", ZZ: "nope" })].sort())
      .toEqual(["CA", "UT"]);
  });
});
