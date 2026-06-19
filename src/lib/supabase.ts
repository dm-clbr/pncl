import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

export function getSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseConfig();
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
