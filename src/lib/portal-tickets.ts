import { getSupabaseConfig } from "@/lib/supabase";

export type PortalTicketType = "hierarchy_change" | "pay_tier" | "commission_dispute" | "other";
export type PortalTicketStatus = "open" | "in_progress" | "resolved";

export const TICKET_TYPE_OPTIONS: { value: PortalTicketType; label: string }[] = [
  { value: "hierarchy_change", label: "Hierarchy change request" },
  { value: "pay_tier", label: "Pay tier question" },
  { value: "commission_dispute", label: "Commission dispute" },
  { value: "other", label: "Something else" },
];

export const TICKET_TYPE_LABELS: Record<PortalTicketType, string> = {
  hierarchy_change: "Hierarchy change",
  pay_tier: "Pay tier",
  commission_dispute: "Commission dispute",
  other: "Other",
};

export const TICKET_STATUS_LABELS: Record<PortalTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export interface PortalTicket {
  id: string;
  userId: string;
  type: PortalTicketType;
  subject: string;
  description: string;
  status: PortalTicketStatus;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

async function ticketFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
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

export async function fetchPortalTickets(accessToken: string): Promise<PortalTicket[]> {
  const data = await ticketFetch<{ tickets: PortalTicket[] }>("list-portal-tickets", accessToken, {
    method: "GET",
  });
  return data.tickets;
}

export async function submitPortalTicket(
  accessToken: string,
  input: { type: PortalTicketType; subject: string; description: string },
): Promise<{ message: string; ticket: PortalTicket }> {
  return ticketFetch("submit-portal-ticket", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
