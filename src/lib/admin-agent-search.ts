export interface AdminAgentSearchRecord {
  name: string;
  email: string;
  npn: string | null;
  referrerName: string | null;
  uplineNetwork: string | null;
  carrierWritingNumbers?: Array<{ writingNumber: string }>;
}

/** Matches the full-admin user search without searching credential usernames or passwords. */
export function matchesAdminAgentSearch(agent: AdminAgentSearchRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return agent.name.toLowerCase().includes(normalized)
    || agent.email.toLowerCase().includes(normalized)
    || (agent.npn?.toLowerCase().includes(normalized) ?? false)
    || (agent.referrerName?.toLowerCase().includes(normalized) ?? false)
    || (agent.uplineNetwork?.toLowerCase().includes(normalized) ?? false)
    || (agent.carrierWritingNumbers?.some(
      (entry) => entry.writingNumber.toLowerCase().includes(normalized),
    ) ?? false);
}
