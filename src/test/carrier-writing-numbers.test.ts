import { describe, expect, it } from "vitest";
import {
  buildCarrierWritingNumbersByUserId,
  formatCarrierWritingNumbers,
} from "../../supabase/functions/_shared/carrierWritingNumbers";

describe("carrier writing-number representation", () => {
  it("orders multiple values by carrier display order and omits empty numbers", () => {
    const values = buildCarrierWritingNumbersByUserId(
      [
        { id: "ethos", carrier: "Ethos" },
        { id: "moo", carrier: "Mutual of Omaha" },
      ],
      [
        { user_id: "agent", carrier_id: "moo", writing_number: " MOO-200 " },
        { user_id: "agent", carrier_id: "ethos", writing_number: "ETH-100" },
        { user_id: "other", carrier_id: "ethos", writing_number: "  " },
      ],
    );

    expect(values.get("agent")).toEqual([
      { carrier: "Ethos", writingNumber: "ETH-100" },
      { carrier: "Mutual of Omaha", writingNumber: "MOO-200" },
    ]);
    expect(values.has("other")).toBe(false);
  });

  it("formats multiple values without unrelated credential details", () => {
    expect(formatCarrierWritingNumbers([
      { carrier: "Ethos", writingNumber: "ETH-100" },
      { carrier: "Mutual of Omaha", writingNumber: "MOO-200" },
    ])).toBe("Ethos: ETH-100; Mutual of Omaha: MOO-200");
    expect(formatCarrierWritingNumbers(undefined)).toBe("");
  });
});
