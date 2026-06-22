export interface PortalCarrierRecord {
  id: string;
  carrier: string;
  company_number: string;
  e_app_label: string;
  e_app_url: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertCarrierPayload {
  id?: string;
  carrier: string;
  companyNumber: string;
  eAppLabel: string;
  eAppUrl: string | null;
  published?: boolean;
  sortOrder?: number;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateUpsertCarrierPayload(body: unknown): UpsertCarrierPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const carrier = optionalText(data.carrier);
  const companyNumber = optionalText(data.companyNumber);
  const eAppLabel = optionalText(data.eAppLabel);
  const eAppUrl = optionalUrl(data.eAppUrl);

  if (!carrier && !eAppLabel) {
    throw new Error("Carrier name or e-app label is required");
  }

  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
  const published = typeof data.published === "boolean" ? data.published : true;
  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.max(0, Math.floor(data.sortOrder))
    : undefined;

  return {
    id,
    carrier,
    companyNumber,
    eAppLabel,
    eAppUrl,
    published,
    sortOrder,
  };
}

export function mapCarrierRecord(row: PortalCarrierRecord) {
  return {
    id: row.id,
    carrier: row.carrier,
    companyNumber: row.company_number,
    eAppLabel: row.e_app_label,
    eAppUrl: row.e_app_url,
    sortOrder: row.sort_order,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
