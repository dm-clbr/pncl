import type { User } from "@supabase/supabase-js";

export type PortalRole = "admin" | "genesis_admin" | "admin_assist" | "agent";

export function getUserRole(user: User | null): PortalRole {
  if (!user) return "agent";

  const role = user.app_metadata?.role;
  if (role === "admin") return "admin";
  if (role === "genesis_admin") return "genesis_admin";
  if (role === "admin_assist") return "admin_assist";
  return "agent";
}

export function isAdmin(user: User | null): boolean {
  return getUserRole(user) === "admin";
}

export function isGenesisAdmin(user: User | null): boolean {
  return getUserRole(user) === "genesis_admin";
}

export function isAdminAssist(user: User | null): boolean {
  return getUserRole(user) === "admin_assist";
}

export function hasAdminConsoleAccess(user: User | null): boolean {
  const role = getUserRole(user);
  return role === "admin" || role === "genesis_admin" || role === "admin_assist";
}

export function formatRoleLabel(role: PortalRole): string {
  if (role === "genesis_admin") return "genesis admin";
  if (role === "admin_assist") return "admin assist";
  return role;
}
