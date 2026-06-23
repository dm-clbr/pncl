export interface PortalCarrierCredentialRecord {
  id: string;
  user_id: string;
  carrier_id: string;
  username: string;
  password_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertCarrierCredentialPayload {
  carrierId: string;
  username: string;
  password?: string;
}

export interface CarrierCredentialItem {
  carrierId: string;
  carrier: string;
  loginUrl: string | null;
  username: string | null;
  password: string | null;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateUpsertCarrierCredentialPayload(body: unknown): UpsertCarrierCredentialPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const data = body as Record<string, unknown>;
  const carrierId = optionalText(data.carrierId);
  const username = optionalText(data.username);
  const password = typeof data.password === "string" ? data.password : undefined;

  if (!carrierId) {
    throw new Error("Carrier is required");
  }

  if (!username) {
    throw new Error("Username is required");
  }

  return { carrierId, username, password };
}

export function mapCredentialRecord(row: PortalCarrierCredentialRecord) {
  return {
    id: row.id,
    userId: row.user_id,
    carrierId: row.carrier_id,
    username: row.username,
    hasPassword: Boolean(row.password_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
