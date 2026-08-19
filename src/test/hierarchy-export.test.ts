import { describe, expect, it } from "vitest";
import {
  buildHierarchyExportCsv,
  HIERARCHY_EXPORT_UPLINE_LEVELS,
  resolveUplineLevels,
  type HierarchyExportAgent,
} from "../../supabase/functions/_shared/hierarchyExport";

function agent(index: number): HierarchyExportAgent {
  return {
    id: `agent-${index}`,
    name: `Agent ${index}`,
    email: `agent${index}@thepncl.com`,
    agentNumber: index,
    npn: `NPN-${index}`,
    compLevel: 70 + index * 5,
    compLevelEffectiveAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    phase: "sales_ready",
    referrerId: index > 0 ? `agent-${index - 1}` : null,
    referrerName: index > 0 ? `Agent ${index - 1}` : null,
    uplineNetwork: index > 0 ? `Agent ${index - 1}` : null,
    flags: { leadAssist: false, companyFunded: false, jeremyFunded: false },
    emailConfirmed: true,
    createdAt: "2026-08-06T12:00:00.000Z",
  };
}

describe("hierarchy CSV export", () => {
  it("exports the nearest ten uplines with identity and compensation data", () => {
    const allAgents = Array.from({ length: 12 }, (_, index) => agent(index));
    const csv = buildHierarchyExportCsv({
      allAgents,
      exportedAgents: [allAgents[11]],
    });
    const [headerLine, rowLine] = csv.split("\r\n");
    const headers = headerLine.split(",");
    const row = rowLine.split(",");
    const value = (header: string) => row[headers.indexOf(header)];

    expect(HIERARCHY_EXPORT_UPLINE_LEVELS).toBe(10);
    expect(value("Upline 1 Name")).toBe("Agent 10");
    expect(value("Upline 1 NPN")).toBe("NPN-10");
    expect(value("Upline 1 Compensation Tier")).toBe("120");
    expect(value("Upline 1 Compensation Tier Effective Date")).toBe("2026-07-11");
    expect(value("Upline 10 Name")).toBe("Agent 1");
    expect(value("Upline 10 Agent #")).toBe("PNCL-00001");
    expect(value("Upline 10 Compensation Tier")).toBe("75");
    expect(value("Upline 10 Compensation Tier Effective Date")).toBe("2026-07-02");
    expect(headers).not.toContain("Upline 11 Name");
    expect(headers).not.toContain("Upline 11 Compensation Tier");
  });

  it("exports each agent's compensation tier and latest tier-effective date", () => {
    const csv = buildHierarchyExportCsv({ allAgents: [agent(0)] });
    const [headerLine, rowLine] = csv.split("\r\n");
    const headers = headerLine.split(",");
    const row = rowLine.split(",");
    const value = (header: string) => row[headers.indexOf(header)];

    expect(value("Compensation tier")).toBe("70");
    expect(value("Compensation tier effective date")).toBe("2026-07-01");
  });

  it("leaves compensation fields blank when no tier is assigned", () => {
    const noTier = agent(0);
    noTier.compLevel = null;
    noTier.compLevelEffectiveAt = null;
    const csv = buildHierarchyExportCsv({ allAgents: [noTier] });
    const [headerLine, rowLine] = csv.split("\r\n");
    const headers = headerLine.split(",");
    const row = rowLine.split(",");

    expect(row[headers.indexOf("Compensation tier")]).toBe("");
    expect(row[headers.indexOf("Compensation tier effective date")]).toBe("");
  });

  it("stops safely when malformed hierarchy links contain a cycle", () => {
    const first = agent(1);
    const second = agent(2);
    first.referrerId = second.id;
    second.referrerId = first.id;
    const byId = new Map([[first.id, first], [second.id, second]]);

    expect(resolveUplineLevels(first, byId).map((entry) => entry.name)).toEqual(["Agent 2"]);
  });
});
