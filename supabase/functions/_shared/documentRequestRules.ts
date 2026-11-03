export type DocumentDelivery = "email" | "portal" | "both";
export type DocumentRolloutOrder = "together" | "current_first" | "onboarding_first";
export function documentDelivery(value: unknown): DocumentDelivery {
  if (value !== "email" && value !== "portal" && value !== "both") throw new Error("Choose email, next-login notification, or both.");
  return value;
}
export function documentRolloutOrder(value: unknown): DocumentRolloutOrder {
  if (value !== "together" && value !== "current_first" && value !== "onboarding_first") throw new Error("Choose a rollout order.");
  return value;
}
export type DocumentAudience = "all" | "loa" | "ibo";
export interface DocumentFilters {
  designation: DocumentAudience;
  search: string;
  state: string;
  ica: "all" | "signed" | "unsigned";
  joinedBefore: string;
  joinedAfter: string;
}
export const EMPTY_DOCUMENT_FILTERS: DocumentFilters = {
  designation: "all", search: "", state: "", ica: "all", joinedBefore: "", joinedAfter: "",
};
export const DOCUMENT_CONSENT = "I have reviewed this document and agree to its terms. Typing my full legal first and last name constitutes my electronic signature.";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export function documentAudience(value: unknown): DocumentAudience {
  if (value !== "all" && value !== "loa" && value !== "ibo") throw new Error("Choose all agents, LOA, or IBO.");
  return value;
}
export function documentId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid document or agent ID.");
  return value.toLowerCase();
}
export function documentFilters(value: unknown): DocumentFilters {
  if (!value || typeof value !== "object") throw new Error("Choose a recipient audience.");
  const row = value as Record<string, unknown>;
  const result = { ...EMPTY_DOCUMENT_FILTERS, designation: documentAudience(row.designation) };
  for (const key of ["search", "state", "joinedBefore", "joinedAfter"] as const) {
    if (typeof row[key] !== "string") throw new Error("Invalid recipient filters.");
    result[key] = (row[key] as string).trim();
  }
  if (result.search.length > 100 || (result.state && !/^[A-Z]{2}$/.test(result.state))) throw new Error("Invalid search or state filter.");
  if (!["all", "signed", "unsigned"].includes(String(row.ica))) throw new Error("Choose an ICA status.");
  result.ica = row.ica as DocumentFilters["ica"];
  for (const date of [result.joinedBefore, result.joinedAfter]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Choose a valid date.");
  }
  if (result.joinedBefore && result.joinedAfter && result.joinedBefore < result.joinedAfter) throw new Error("The end date must be on or after the start date.");
  return result;
}
export function validateDocumentSignature(value: unknown, accepted: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const parts = name.split(" ");
  if (name.length > 120 || !/^\p{L}[\p{L}\p{M}'’.-]*\s+(?:[\p{L}\p{M}'’.-]+\s+)*\p{L}[\p{L}\p{M}'’.-]*$/u.test(name)
    || [parts[0], parts[parts.length - 1]].some(part => part.replace(/[^\p{L}]/gu, "").length < 2)) {
    throw new Error("Enter your full legal first and last name, not initials or a placeholder.");
  }
  if (accepted !== true) throw new Error("Review the document and accept the electronic signature agreement.");
  return name;
}
