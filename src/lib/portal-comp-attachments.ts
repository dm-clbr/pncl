import { getSupabaseConfig, isSupabaseAuthConfigured } from "@/lib/supabase";

export type CompAttachmentStatus = "pending" | "signed";

export interface PortalCompAttachment {
  id: string;
  userId: string;
  title: string;
  status: CompAttachmentStatus;
  assignedAt: string;
  signatureName: string | null;
  signedAt: string | null;
  documentUrl: string | null;
}

function getFunctionUrl(path: string): string {
  const { url } = getSupabaseConfig();
  return `${url.replace(/\/$/, "")}/functions/v1/${path}`;
}

function getHeaders(accessToken: string): HeadersInit {
  const { anonKey } = getSupabaseConfig();
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
    "Content-Type": "application/json",
  };
}

export async function fetchPortalCompAttachments(
  accessToken: string,
): Promise<PortalCompAttachment[]> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const response = await fetch(getFunctionUrl("list-portal-comp-attachments"), {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to load comp attachments");
  }

  return data.attachments as PortalCompAttachment[];
}

export async function signPortalCompAttachment(
  accessToken: string,
  input: { attachmentId: string; signatureName: string; agreementAccepted: boolean },
): Promise<{ attachment: PortalCompAttachment; message: string }> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Portal authentication is not configured.");
  }

  const response = await fetch(getFunctionUrl("sign-portal-comp-attachment"), {
    method: "POST",
    headers: getHeaders(accessToken),
    body: JSON.stringify(input),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message ?? "Unable to sign comp attachment");
  }

  return {
    attachment: data.attachment as PortalCompAttachment,
    message: data.message as string,
  };
}
