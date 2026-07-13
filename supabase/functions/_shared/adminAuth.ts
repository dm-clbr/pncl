import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getEmailDomain } from "./onboarding.ts";

export type PortalRole = "admin" | "genesis_admin" | "admin_assist" | "agent";

const ALLOWED_EMAIL_DOMAIN = getEmailDomain();

export function getUserRole(user: User): PortalRole {
  const role = user.app_metadata?.role;
  if (role === "admin") return "admin";
  if (role === "genesis_admin") return "genesis_admin";
  if (role === "admin_assist") return "admin_assist";
  return "agent";
}

export function isAdminUser(user: User): boolean {
  return getUserRole(user) === "admin";
}

export function isGenesisAdminUser(user: User): boolean {
  return getUserRole(user) === "genesis_admin";
}

export function isAdminAssistUser(user: User): boolean {
  return getUserRole(user) === "admin_assist";
}

export function hasAdminConsoleAccess(user: User): boolean {
  const role = getUserRole(user);
  return role === "admin" || role === "genesis_admin" || role === "admin_assist";
}

export async function requirePortalUser(
  req: Request,
): Promise<{ user: User; adminClient: SupabaseClient }> {
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { user, adminClient };
}

export async function requireAdmin(req: Request): Promise<{ user: User; adminClient: SupabaseClient }> {
  const { user, adminClient } = await requirePortalUser(req);

  if (!isAdminUser(user)) {
    throw new AdminAuthError("Admin access required", 403, "forbidden");
  }

  return { user, adminClient };
}

export async function requireGenesisAdminOrAdmin(
  req: Request,
): Promise<{ user: User; adminClient: SupabaseClient }> {
  const { user, adminClient } = await requirePortalUser(req);

  if (!hasAdminConsoleAccess(user)) {
    throw new AdminAuthError("Admin access required", 403, "forbidden");
  }

  return { user, adminClient };
}

export async function requireAdminOrAdminAssist(
  req: Request,
): Promise<{ user: User; adminClient: SupabaseClient }> {
  const { user, adminClient } = await requirePortalUser(req);

  if (!isAdminUser(user) && !isAdminAssistUser(user)) {
    throw new AdminAuthError("Admin access required", 403, "forbidden");
  }

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
