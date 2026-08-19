import { describe, expect, it } from "vitest";
import { matchesAdminAgentSearch, type AdminAgentSearchRecord } from "./admin-agent-search";

const agent: AdminAgentSearchRecord = {
  name: "Avery Agent",
  email: "avery@thepncl.com",
  npn: "998877",
  referrerName: "Uma Upline",
  uplineNetwork: null,
  carrierWritingNumbers: [
    { writingNumber: "ETH-12345" },
    { writingNumber: "MOO-9000" },
  ],
};

describe("admin agent search", () => {
  it("matches partial carrier writing numbers case-insensitively", () => {
    expect(matchesAdminAgentSearch(agent, "eth-123")).toBe(true);
    expect(matchesAdminAgentSearch(agent, "moo-9000")).toBe(true);
  });

  it("preserves existing name, email, NPN, and upline matching", () => {
    expect(matchesAdminAgentSearch(agent, "avery agent")).toBe(true);
    expect(matchesAdminAgentSearch(agent, "@thepncl.com")).toBe(true);
    expect(matchesAdminAgentSearch(agent, "9988")).toBe(true);
    expect(matchesAdminAgentSearch(agent, "uma upline")).toBe(true);
  });

  it("does not match absent or unrelated writing numbers", () => {
    expect(matchesAdminAgentSearch({ ...agent, carrierWritingNumbers: undefined }, "eth-123")).toBe(false);
    expect(matchesAdminAgentSearch(agent, "WRONG-100")).toBe(false);
  });
});
