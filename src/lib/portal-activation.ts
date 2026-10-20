import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig } from "@/lib/supabase";

export class PortalActivationSignInError extends Error {
  constructor() {
    super("Your sign-in session ended. Sign in with your @thepncl.com Google account again to finish activation.");
    this.name = "PortalActivationSignInError";
  }
}

function requireMatchingSession(session: Session | null, userId: string): Session {
  if (!session?.access_token || session.user.id !== userId) {
    throw new PortalActivationSignInError();
  }
  return session;
}

function throwSessionError(error: Error & { status?: number }): never {
  if (error.status === 400 || error.status === 401 || error.status === 403) {
    throw new PortalActivationSignInError();
  }
  throw error;
}

export async function activatePortalEnrollment(userId: string): Promise<void> {
  const { auth } = getSupabaseClient();
  const { url, anonKey } = getSupabaseConfig();
  // Read from the auth client just before the request. React's session snapshot
  // can lag behind a refresh or a sign-out broadcast from another tab.
  const { data, error } = await auth.getSession();
  if (error) throwSessionError(error);
  let session = requireMatchingSession(data.session, userId);

  const refresh = async () => {
    const { data: refreshed, error: refreshError } = await auth.refreshSession();
    if (refreshError) throwSessionError(refreshError);
    return requireMatchingSession(refreshed.session, userId);
  };
  const request = (accessToken: string) => fetch(`${url.replace(/\/$/, "")}/functions/v1/activate-onboarding-google-signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, apikey: anonKey },
  });

  let response = await request(session.access_token);
  if (response.status === 401) {
    session = await refresh();
    response = await request(session.access_token);
  }
  if (response.status === 401) throw new PortalActivationSignInError();
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? "Google sign-in is not complete yet.");

  session = await refresh();
  if (session.user.app_metadata?.enrollment_ready !== true) {
    throw new Error("Unable to confirm portal activation. Please try again.");
  }
}
