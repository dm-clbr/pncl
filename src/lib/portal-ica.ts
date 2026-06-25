import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";
import type { DebitCheckInitials } from "@/lib/onboarding-contract";

export const ICA_TODO_SLUG = "ica_setup";

export interface PortalIcaSummary {
  userId: string;
  legalName: string;
  personalEmail: string;
  signatureName: string;
  icaVersion: string;
  signedAt: string;
  pdfPath: string;
}

export type IcaSignatureSource = "portal" | "onboarding";

export interface PortalIcaStatus {
  signed: boolean;
  source: IcaSignatureSource | null;
  ica: PortalIcaSummary | null;
}

export interface SubmitPortalIcaInput {
  legalName: string;
  personalEmail: string;
  signatureName: string;
  signatureImageBase64: string;
  debitCheckInitials: DebitCheckInitials;
  agreementAccepted: boolean;
  counselAcknowledged: boolean;
}

interface PortalIcaRow {
  user_id: string;
  legal_name: string;
  personal_email: string;
  signature_name: string;
  ica_version: string;
  signed_at: string;
  pdf_path: string;
}

function mapPortalIcaSummary(row: PortalIcaRow): PortalIcaSummary {
  return {
    userId: row.user_id,
    legalName: row.legal_name,
    personalEmail: row.personal_email,
    signatureName: row.signature_name,
    icaVersion: row.ica_version,
    signedAt: row.signed_at,
    pdfPath: row.pdf_path,
  };
}

export async function fetchPortalIcaStatus(accessToken: string): Promise<PortalIcaStatus> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/get-portal-ica-status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load agreement status");
  }

  return data as PortalIcaStatus;
}

export async function fetchPortalIca(userId: string): Promise<PortalIcaSummary | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("portal_ica_signatures")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPortalIcaSummary(data as PortalIcaRow) : null;
}

export async function submitPortalIca(
  accessToken: string,
  input: SubmitPortalIcaInput,
): Promise<PortalIcaSummary> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/submit-portal-ica`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to sign agreement");
  }

  return data.ica as PortalIcaSummary;
}

export async function getPortalIcaPdfUrl(pdfPath: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from("portal-profile-documents")
    .createSignedUrl(pdfPath, 3600);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function fetchPortalIcaDocument(
  accessToken: string,
): Promise<{ ica: PortalIcaSummary; downloadUrl: string }> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/get-portal-ica-document`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load agreement document");
  }

  return {
    ica: data.ica as PortalIcaSummary,
    downloadUrl: data.downloadUrl as string,
  };
}

export function isIcaTodoComplete(user: User | null, icaSigned: boolean): boolean {
  if (icaSigned) return true;
  const completed = user?.user_metadata?.completed_portal_todos;
  if (!completed || typeof completed !== "object" || Array.isArray(completed)) {
    return false;
  }
  return (completed as Record<string, boolean>)[ICA_TODO_SLUG] === true;
}

export function getDefaultIcaPrefill(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null,
  profile?: { firstName: string; lastName: string } | null,
): { legalName: string; email: string } {
  const meta = user?.user_metadata;
  const profileName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : "";
  const metaName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  const legalName = profileName || metaName;

  return {
    legalName,
    email: user?.email?.trim() ?? "",
  };
}
