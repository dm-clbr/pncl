import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getEmailDomain } from "./onboarding.ts";

export type PortalRole = "admin" | "agent";

const ALLOWED_EMAIL_DOMAIN = getEmailDomain();

export function getUserRole(user: User): PortalRole {
  const role = user.app_metadata?.role;
  return role === "admin" ? "admin" : "agent";
}

export function isAdminUser(user: User): boolean {
  return getUserRole(user) === "admin";
}

export async function requireAdmin(req: Request): Promise<{ user: User; adminClient: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new AdminAuthError("Missing authorization", 401, "unauthorized");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new AdminAuthError("Server configuration error", 500, "config_error");
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user?.email) {
    throw new AdminAuthError("Unauthorized", 401, "unauthorized");
  }

  const email = user.email.toLowerCase();
  if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    throw new AdminAuthError(
      `Only @${ALLOWED_EMAIL_DOMAIN} accounts can access the employee portal.`,
      403,
      "forbidden_domain",
    );
  }

  if (!user.email_confirmed_at) {
    throw new AdminAuthError("Email must be confirmed", 403, "email_unconfirmed");
  }

  if (!isAdminUser(user)) {
    throw new AdminAuthError("Admin access required", 403, "forbidden");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { user, adminClient };
}

export class AdminAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
    this.code = code;
  }
}
