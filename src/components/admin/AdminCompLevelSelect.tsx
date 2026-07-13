import { useMemo } from "react";
import type { AgentSummary } from "@/lib/admin-api";
import {
  adminCompLevelUnavailableReason,
  formatCompLevel,
  getAdminCompOptionsForAgent,
} from "@/lib/comp-level";

interface AdminCompLevelSelectProps {
  agent: AgentSummary;
  agentsById: Map<string, AgentSummary>;
  disabled?: boolean;
  saving?: boolean;
  draftValue?: number | null;
  onChange: (compLevel: number | null) => void;
  className?: string;
  showUnavailableHint?: boolean;
}

export function AdminCompLevelSelect({
  agent,
  agentsById,
  disabled = false,
  saving = false,
  draftValue,
  onChange,
  className = "admin-role-select",
  showUnavailableHint = false,
}: AdminCompLevelSelectProps) {
  const referrer = agent.referrerId ? agentsById.get(agent.referrerId) : null;
  const hasOnboardingRecord = agent.hasOnboardingRecord ?? Boolean(agent.onboarding);
  const allowedOptions = useMemo(
    () => getAdminCompOptionsForAgent(
      agent.referrerId,
      referrer?.compLevel,
      hasOnboardingRecord,
    ),
    [agent.referrerId, hasOnboardingRecord, referrer?.compLevel],
  );

  const selectOptions = useMemo(() => {
    const options = new Set(allowedOptions);
    if (agent.compLevel != null) {
      options.add(agent.compLevel);
    }
    return [...options].sort((a, b) => a - b);
  }, [allowedOptions, agent.compLevel]);

  const unavailableReason = adminCompLevelUnavailableReason(
    agent.referrerId,
    referrer?.compLevel,
    hasOnboardingRecord,
  );
  const canAssign = selectOptions.length > 0 || agent.compLevel != null;
  const currentValue = draftValue !== undefined ? draftValue : agent.compLevel;

  if (!canAssign) {
    return (
      <span className="admin-comp-level-unavailable" title={unavailableReason ?? undefined}>
        {formatCompLevel(agent.compLevel)}
        {showUnavailableHint && unavailableReason ? (
          <span className="admin-comp-level-hint">{unavailableReason}</span>
        ) : null}
      </span>
    );
  }

  return (
    <select
      className={className}
      value={currentValue ?? ""}
      disabled={disabled || saving || (selectOptions.length === 0 && currentValue == null)}
      aria-label={`Update comp level for ${agent.name}`}
      onChange={(event) => {
        const { value } = event.target;
        onChange(value ? Number.parseInt(value, 10) : null);
      }}
    >
      <option value="">
        {saving ? "Saving…" : formatCompLevel(currentValue)}
      </option>
      {selectOptions.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}
