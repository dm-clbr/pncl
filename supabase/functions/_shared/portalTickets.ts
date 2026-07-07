export const PORTAL_TICKET_TYPES = [
  "hierarchy_change",
  "pay_tier",
  "commission_dispute",
  "other",
] as const;
export type PortalTicketType = (typeof PORTAL_TICKET_TYPES)[number];

export const PORTAL_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type PortalTicketStatus = (typeof PORTAL_TICKET_STATUSES)[number];

export const PORTAL_TICKET_TYPE_LABELS: Record<PortalTicketType, string> = {
  hierarchy_change: "Hierarchy change",
  pay_tier: "Pay tier",
  commission_dispute: "Commission dispute",
  other: "Other",
};

export interface PortalTicketRecord {
  id: string;
  user_id: string;
  type: PortalTicketType;
  subject: string;
  description: string;
  status: PortalTicketStatus;
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export function validateSubmitTicketPayload(body: unknown): {
  type: PortalTicketType;
  subject: string;
  description: string;
} {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const data = body as Record<string, unknown>;

  const type = typeof data.type === "string" ? data.type.trim() : "";
  if (!(PORTAL_TICKET_TYPES as readonly string[]).includes(type)) {
    throw new Error("Invalid ticket type");
  }

  const subject = typeof data.subject === "string" ? data.subject.trim() : "";
  if (!subject || subject.length > 200) {
    throw new Error("Subject is required (max 200 characters)");
  }

  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!description || description.length > 5000) {
    throw new Error("Description is required (max 5000 characters)");
  }

  return { type: type as PortalTicketType, subject, description };
}

export function mapTicketRecord(row: PortalTicketRecord) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    subject: row.subject,
    description: row.description,
    status: row.status,
    assignedTo: row.assigned_to,
    resolution: row.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
