import type { User } from "@supabase/supabase-js";

export type PortalRole = "admin" | "agent";

export function getUserRole(user: User | null): PortalRole {
  if (!user) return "agent";
  return user.app_metadata?.role === "admin" ? "admin" : "agent";
}

export function isAdmin(user: User | null): boolean {
  return getUserRole(user) === "admin";
}
