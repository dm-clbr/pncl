export const HIERARCHY_EXPORT_UPLINE_LEVELS = 10;

const PHASE_LABELS: Record<string, string> = {
  on_board: "On-Board",
  pre_license: "Pre-License",
  licensing: "Licensing",
  new_producer: "New Producer",
  sales_ready: "Sales Ready",
  complete: "Complete",
};

export interface HierarchyExportAgent {
  id: string;
  name: string;
  email: string;
  agentNumber: number | null;
  npn: string | null;
  compLevel: number | null;
  compLevelEffectiveAt: string | null;
  phase: string | null;
  referrerId: string | null;
  referrerName: string | null;
  uplineNetwork: string | null;
  flags?: {
    leadAssist: boolean;
    companyFunded: boolean;
    jeremyFunded: boolean;
  };
  emailConfirmed: boolean;
  createdAt: string;
}

export interface BuildHierarchyExportInput {
  allAgents: HierarchyExportAgent[];
  exportedAgents?: HierarchyExportAgent[];
  stateLicensesByUserId?: Map<string, string[]>;
}

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatAgentNumber(agentNumber: number | null): string {
  if (agentNumber === null) return "";
  return `PNCL-${String(agentNumber).padStart(5, "0")}`;
}

/** Total downline size (all descendants) per user, from referrer links. */
export function computeDownlineCounts(agents: HierarchyExportAgent[]): Map<string, number> {
  const childrenByReferrer = new Map<string, string[]>();
  for (const agent of agents) {
    if (!agent.referrerId) continue;
    const children = childrenByReferrer.get(agent.referrerId) ?? [];
    children.push(agent.id);
    childrenByReferrer.set(agent.referrerId, children);
  }

  const counts = new Map<string, number>();
  const countDescendants = (id: string, path: Set<string>): number => {
    if (counts.has(id)) return counts.get(id)!;
    if (path.has(id)) return 0;

    const nextPath = new Set(path);
    nextPath.add(id);
    let total = 0;
    for (const childId of childrenByReferrer.get(id) ?? []) {
      if (nextPath.has(childId)) continue;
      total += 1 + countDescendants(childId, nextPath);
    }
    counts.set(id, total);
    return total;
  };

  for (const agent of agents) {
    countDescendants(agent.id, new Set());
  }
  return counts;
}

export function resolveUplineLevels(
  agent: HierarchyExportAgent,
  agentsById: Map<string, HierarchyExportAgent>,
): Array<
  Pick<
    HierarchyExportAgent,
    "name" | "email" | "agentNumber" | "npn" | "compLevel" | "compLevelEffectiveAt"
  >
> {
  const levels: Array<
    Pick<
      HierarchyExportAgent,
      "name" | "email" | "agentNumber" | "npn" | "compLevel" | "compLevelEffectiveAt"
    >
  > = [];
  const visited = new Set<string>([agent.id]);
  let current = agent;

  while (levels.length < HIERARCHY_EXPORT_UPLINE_LEVELS && current.referrerId) {
    if (visited.has(current.referrerId)) break;
    visited.add(current.referrerId);

    const referrer = agentsById.get(current.referrerId);
    if (!referrer) {
      if (levels.length === 0) {
        levels.push({
          name: current.referrerName ?? current.uplineNetwork ?? "",
          email: "",
          agentNumber: null,
          npn: null,
          compLevel: null,
          compLevelEffectiveAt: null,
        });
      }
      break;
    }

    levels.push(referrer);
    current = referrer;
  }

  if (levels.length === 0 && (agent.referrerName || agent.uplineNetwork)) {
    levels.push({
      name: agent.referrerName ?? agent.uplineNetwork ?? "",
      email: "",
      agentNumber: null,
      npn: null,
      compLevel: null,
      compLevelEffectiveAt: null,
    });
  }

  return levels;
}

export function buildHierarchyExportCsv({
  allAgents,
  exportedAgents = allAgents,
  stateLicensesByUserId = new Map(),
}: BuildHierarchyExportInput): string {
  const agentsById = new Map(allAgents.map((agent) => [agent.id, agent]));
  const downlineCounts = computeDownlineCounts(allAgents);
  const uplineHeaders = Array.from(
    { length: HIERARCHY_EXPORT_UPLINE_LEVELS },
    (_, index) => {
      const level = index + 1;
      return [
        `Upline ${level} Name`,
        `Upline ${level} Email`,
        `Upline ${level} Agent #`,
        `Upline ${level} NPN`,
        `Upline ${level} Compensation Tier`,
        `Upline ${level} Compensation Tier Effective Date`,
      ];
    },
  ).flat();

  const header = [
    "Name",
    "Email",
    "Agent #",
    "NPN",
    "Compensation tier",
    "Compensation tier effective date",
    "Stage",
    "Downline count",
    "State licenses",
    "Lead Assist",
    "Company Funded",
    "Jeremy Funded",
    "Status",
    "Joined",
    ...uplineHeaders,
  ];

  const rows = exportedAgents.map((agent) => {
    const uplineLevels = resolveUplineLevels(agent, agentsById);
    const uplineCells = Array.from(
      { length: HIERARCHY_EXPORT_UPLINE_LEVELS },
      (_, index) => {
        const upline = uplineLevels[index];
        return [
          upline?.name ?? "",
          upline?.email ?? "",
          formatAgentNumber(upline?.agentNumber ?? null),
          upline?.npn ?? "",
          upline?.compLevel ?? "",
          upline?.compLevelEffectiveAt?.slice(0, 10) ?? "",
        ];
      },
    ).flat();

    return [
      agent.name,
      agent.email,
      formatAgentNumber(agent.agentNumber),
      agent.npn,
      agent.compLevel,
      agent.compLevelEffectiveAt?.slice(0, 10) ?? "",
      agent.phase ? PHASE_LABELS[agent.phase] ?? agent.phase : "",
      downlineCounts.get(agent.id) ?? 0,
      (stateLicensesByUserId.get(agent.id) ?? []).join(" "),
      agent.flags?.leadAssist ? "Yes" : "No",
      agent.flags?.companyFunded ? "Yes" : "No",
      agent.flags?.jeremyFunded ? "Yes" : "No",
      agent.emailConfirmed ? "Active" : "Pending activation",
      agent.createdAt.slice(0, 10),
      ...uplineCells,
    ].map(csvEscape).join(",");
  });

  return [header.map(csvEscape).join(","), ...rows].join("\r\n");
}
