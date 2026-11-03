export const SIGNING_STEP_KINDS = {
  ica_setup: "ica",
  w9_setup: "w9",
  direct_deposit_setup: "direct_deposit",
  comp_agreement: "comp_agreement",
} as const;
export type SigningDocumentKind = typeof SIGNING_STEP_KINDS[keyof typeof SIGNING_STEP_KINDS] | "signing_document";
export type SigningMode = "ica_fields" | "w9_fields" | "signature_record";
export function isSigningDocumentKind(value: string): value is SigningDocumentKind {
  return value === "signing_document" || Object.values(SIGNING_STEP_KINDS).some(kind => kind === value);
}
export function requireSigningAsset<T extends { id: string }>(asset: T | null | undefined, label = "signing document"): T {
  if (!asset) throw new Error(`The ${label} has not been configured for your onboarding flow. Please contact PNCL support.`);
  return asset;
}
export function assertSigningAsset(expectedId: unknown, actualId: string): void {
  if (expectedId !== actualId) throw new Error("This document has changed. Reload and review the current document before signing.");
}
