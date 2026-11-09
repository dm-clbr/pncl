import { getSupabaseClient } from "@/lib/supabase";

export const SUMMIT_ASK_URL = "https://thepncl.com/summit/ask";
export const SUMMIT_REFRESH_MS = 3000;
export type SummitSubmission = { id: string; question: string; created_at: string; cursor_at?:string };
export type SummitGroup = { id: string; representative: string; count: number; created_at: string };
export type SummitSnapshot = {
  revision: string;
  groups: SummitGroup[];
  pending_count: number;
  oldest_pending_at: string | null;
  total: number;
  last_error: string | null;
  last_success_at: string | null;
  ai_configured: boolean;
};

export function validateSummitQuestion(question: string): string | null {
  if (question.trim().length < 5) return "Please enter a question with at least 5 characters.";
  if (question.length > 1000) return "Please keep your question to 1,000 characters or fewer.";
  return null;
}

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke(name, { body });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      if (payload?.message) throw new Error(payload.message);
    }
    throw new Error("We couldn’t connect. Check your connection and try again.");
  }
  return data as T;
}

export function submitSummitQuestion(body: { id: string; client_id: string; question: string }) {
  return invoke<{ id: string }>("summit-submit", body);
}

export async function getSummitSnapshot(previous?: SummitSnapshot): Promise<SummitSnapshot> {
  const result = await invoke<SummitSnapshot | {unchanged: true; revision: string; ai_configured: boolean}>("summit-presenter", {revision:previous?.revision});
  if ("unchanged" in result && previous) return {...previous,ai_configured:result.ai_configured};
  return result as SummitSnapshot;
}

export function getSummitOriginals(groupId: string | null, cursor?: {id: string; time: string}) {
  return invoke<{submissions: SummitSubmission[]; has_more: boolean}>("summit-presenter",{action:"originals",group_id:groupId,cursor});
}

// This random browser identifier is used only for request throttling. No name,
// email, portal identity, or device fingerprint is attached to a submission.
export function getSummitClientId(): string {
  try {
    const existing = localStorage.getItem("pncl-summit-client");
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem("pncl-summit-client", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
