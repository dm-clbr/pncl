export type PortalRole = "admin" | "genesis_admin" | "admin_assist" | "agent";

export function canAccessAdminConsole(role: PortalRole): boolean {
  return role === "admin" || role === "genesis_admin" || role === "admin_assist";
}

export function canAccessHierarchy(role: PortalRole): boolean {
  return role === "admin" || role === "admin_assist";
}

export function canUseGenesisAdminEndpoint(role: PortalRole): boolean {
  return role === "admin" || role === "genesis_admin";
}

export function isFullAdminRole(role: PortalRole): boolean {
  return role === "admin";
}

export function canExportHierarchy(role: PortalRole): boolean {
  return isFullAdminRole(role);
}

export function shouldReturnAdminAssistHierarchy(
  role: PortalRole,
  requestedView: string | null,
): boolean {
  return role === "admin_assist" || (role === "admin" && requestedView === "admin_assist");
}
