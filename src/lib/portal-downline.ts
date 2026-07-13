import { getSupabaseConfig } from "@/lib/supabase";
import {
  AGENT_PHASE_LABELS,
  type AgentPhase,
} from "@/lib/admin-api";

export interface DownlineTodoPhaseProgress {
  id: string;
  label: string;
  completedCount: number;
  totalCount: number;
}

export interface DownlineTodoProgress {
  completedCount: number;
  totalCount: number;
  phases: DownlineTodoPhaseProgress[];
}

export interface DownlineMember {
  onboardingId: string;
  userId: string | null;
  name: string;
  inviteLabel: string | null;
  invitedCompLevel: number | null;
  onboardingStatus: string;
  portalPhase: AgentPhase | null;
  hasPortalAccount: boolean;
  onboardingCompletedAt: string | null;
  joinedAt: string;
  todoProgress: DownlineTodoProgress | null;
}

export interface DownlineListResponse {
  members: DownlineMember[];
}

async function portalFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      ...init?.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data as T;
}

export async function listPortalDownline(accessToken: string): Promise<DownlineListResponse> {
  return portalFetch("list-portal-downline", accessToken, { method: "GET" });
}

const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  pending: "Application submitted",
  creating_email: "Setting up workspace email",
  email_created: "Email created",
  ready: "Awaiting portal activation",
  credentials_viewed: "Activating portal account",
  expired: "Expired",
};

const PRE_PORTAL_STATUS_ORDER = [
  "pending",
  "creating_email",
  "email_created",
  "ready",
  "credentials_viewed",
] as const;

const PORTAL_JOURNEY_PHASES = [
  { id: "on_board", label: "On-Board" },
  { id: "pre_license", label: "Pre-License" },
  { id: "licensing", label: "Licensing" },
  { id: "sales_ready", label: "Sales Ready" },
] as const;

export function formatDownlineOnboardingStatus(status: string): string {
  return ONBOARDING_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function getDownlineDisplayLabel(member: DownlineMember): string {
  return member.inviteLabel?.trim() || member.name;
}

export type DownlineProgressStepState = "done" | "current" | "upcoming";

export interface DownlineProgressSegment {
  id: string;
  label: string;
  state: DownlineProgressStepState;
  fillPercent: number;
  detail: string | null;
}

export interface DownlineProgress {
  currentLabel: string;
  percent: number;
  completedCount: number | null;
  totalCount: number | null;
  segments: DownlineProgressSegment[];
}

function getPrePortalFillPercent(status: string): number {
  const index = PRE_PORTAL_STATUS_ORDER.indexOf(status as typeof PRE_PORTAL_STATUS_ORDER[number]);
  const currentIndex = index >= 0 ? index : 0;
  return Math.round(((currentIndex + 1) / PRE_PORTAL_STATUS_ORDER.length) * 100);
}

function resolvePortalPhaseProgress(
  member: DownlineMember,
): DownlineTodoPhaseProgress[] {
  const byId = new Map(
    (member.todoProgress?.phases ?? []).map((phase) => [phase.id, phase]),
  );

  return PORTAL_JOURNEY_PHASES.map((phase) => {
    const existing = byId.get(phase.id);
    return existing ?? {
      id: phase.id,
      label: phase.label,
      completedCount: 0,
      totalCount: 0,
    };
  });
}

function buildExpiredProgress(): DownlineProgress {
  const segments: DownlineProgressSegment[] = [
    {
      id: "activation",
      label: "Portal activation",
      state: "upcoming",
      fillPercent: 0,
      detail: null,
    },
    ...PORTAL_JOURNEY_PHASES.map((phase) => ({
      id: phase.id,
      label: phase.label,
      state: "upcoming" as const,
      fillPercent: 0,
      detail: null,
    })),
  ];

  return {
    currentLabel: "Expired",
    percent: 0,
    completedCount: null,
    totalCount: null,
    segments,
  };
}

export function getDownlineProgress(member: DownlineMember): DownlineProgress {
  if (member.onboardingStatus === "expired") {
    return buildExpiredProgress();
  }

  const portalReady = member.hasPortalAccount || Boolean(member.todoProgress?.totalCount);
  const portalPhase: AgentPhase = member.portalPhase ?? "on_board";
  const portalPhases = resolvePortalPhaseProgress(member);
  const portalPhaseIndex = portalPhase === "complete"
    ? PORTAL_JOURNEY_PHASES.length
    : Math.max(
      PORTAL_JOURNEY_PHASES.findIndex((phase) => phase.id === portalPhase),
      0,
    );

  const segments: DownlineProgressSegment[] = [];

  if (!portalReady) {
    segments.push({
      id: "activation",
      label: "Portal activation",
      state: "current",
      fillPercent: getPrePortalFillPercent(member.onboardingStatus),
      detail: formatDownlineOnboardingStatus(member.onboardingStatus),
    });
  } else {
    segments.push({
      id: "activation",
      label: "Portal activation",
      state: "done",
      fillPercent: 100,
      detail: "Portal account ready",
    });
  }

  for (const [index, phaseDef] of PORTAL_JOURNEY_PHASES.entries()) {
    const phaseProgress = portalPhases[index];
    const phaseComplete = portalPhase === "complete"
      || (phaseProgress.totalCount > 0 && phaseProgress.completedCount >= phaseProgress.totalCount)
      || index < portalPhaseIndex;

    let state: DownlineProgressStepState;
    let fillPercent = 0;
    let detail: string | null = null;

    if (!portalReady) {
      state = "upcoming";
    } else if (portalPhase === "complete" || phaseComplete) {
      state = "done";
      fillPercent = 100;
      detail = phaseProgress.totalCount > 0
        ? `${phaseProgress.totalCount}/${phaseProgress.totalCount}`
        : null;
    } else if (index === portalPhaseIndex) {
      state = "current";
      fillPercent = phaseProgress.totalCount > 0
        ? Math.round((phaseProgress.completedCount / phaseProgress.totalCount) * 100)
        : 0;
      detail = phaseProgress.totalCount > 0
        ? `${phaseProgress.completedCount}/${phaseProgress.totalCount} steps`
        : "No steps yet";
    } else if (index < portalPhaseIndex) {
      state = "done";
      fillPercent = 100;
      detail = phaseProgress.totalCount > 0
        ? `${phaseProgress.totalCount}/${phaseProgress.totalCount}`
        : null;
    } else {
      state = "upcoming";
    }

    segments.push({
      id: phaseDef.id,
      label: phaseDef.label,
      state,
      fillPercent,
      detail,
    });
  }

  const overallPercent = Math.round(
    segments.reduce((sum, segment) => sum + segment.fillPercent, 0) / segments.length,
  );

  const todoCompleted = member.todoProgress?.completedCount ?? 0;
  const todoTotal = member.todoProgress?.totalCount ?? 0;

  let currentLabel: string;
  const currentSegment = segments.find((segment) => segment.state === "current");

  if (currentSegment) {
    currentLabel = currentSegment.id === "activation"
      ? formatDownlineOnboardingStatus(member.onboardingStatus)
      : AGENT_PHASE_LABELS[currentSegment.id as AgentPhase] ?? currentSegment.label;
  } else if (portalPhase === "complete") {
    currentLabel = AGENT_PHASE_LABELS.complete;
  } else {
    currentLabel = formatDownlineOnboardingStatus(member.onboardingStatus);
  }

  return {
    currentLabel,
    percent: overallPercent,
    completedCount: portalReady ? todoCompleted : null,
    totalCount: portalReady ? todoTotal : PRE_PORTAL_STATUS_ORDER.length,
    segments,
  };
}
