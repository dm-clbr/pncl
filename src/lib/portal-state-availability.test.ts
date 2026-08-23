import { describe, expect, it } from "vitest";
import {
  STATE_AVAILABILITY_STATUSES,
  licensedStateCodes,
  normalizeStateAvailabilityRows,
} from "@/lib/portal-state-availability";
import { US_STATES, US_STATE_BY_FIPS } from "@/lib/us-states";

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

  it("accepts one valid row for every supported jurisdiction, including D.C.", () => {
    const states = normalizeStateAvailabilityRows(completeRows().reverse());

    expect(states).toHaveLength(51);
    expect(new Set(states.map((state) => state.stateCode))).toHaveLength(51);
    expect(states[0]).toMatchObject({ stateCode: "AL", stateName: "Alabama", status: "Active" });
    expect(states).toContainEqual(expect.objectContaining({
      stateCode: "DC",
      stateName: "District of Columbia",
    }));
    expect(US_STATE_BY_FIPS.get("11")).toMatchObject({
      code: "DC",
      name: "District of Columbia",
    });
  });

  it("rejects incomplete availability instead of inventing a status", () => {
    expect(() => normalizeStateAvailabilityRows(completeRows().filter((row) => row.state_code !== "DC")))
      .toThrow("State availability is incomplete (50 of 51 jurisdictions).");
  });

  it("derives the licensed overlay only from number-bearing profile entries", () => {
    expect([...licensedStateCodes({ DC: "LIC-DC", UT: "LIC-123", ca: " 88 ", TX: "", ZZ: "nope" })].sort())
      .toEqual(["CA", "DC", "UT"]);
  });
});
