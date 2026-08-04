export const PORTAL_HOME_PATH = "/portal";
export const PORTAL_LOGIN_PATH = "/portal/login";
export const PORTAL_ACTIVATE_PATH = "/onboarding/activate";
export const PORTAL_OAUTH_RETURN_KEY = "pncl_portal_oauth_return";

export function isPendingPortalEnrollment(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const enrollment = metadata as Record<string, unknown>;
  return enrollment.enrollment_version === 3 && enrollment.enrollment_ready !== true;
}

export function canPendingPortalEnrollmentUsePath(pathname: string): boolean {
  return pathname === PORTAL_LOGIN_PATH
    || pathname === PORTAL_ACTIVATE_PATH
    || pathname === "/"
    || pathname === "";
}

export function storePortalOAuthReturn(path: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  localStorage.setItem(PORTAL_OAUTH_RETURN_KEY, normalized);
  sessionStorage.setItem(PORTAL_OAUTH_RETURN_KEY, normalized);
}

export function readPortalOAuthReturn(): string | null {
  const path = localStorage.getItem(PORTAL_OAUTH_RETURN_KEY)
    ?? sessionStorage.getItem(PORTAL_OAUTH_RETURN_KEY);
  return path?.startsWith("/") ? path : null;
}

export function consumePortalOAuthReturn(): string | null {
  const path = readPortalOAuthReturn();
  localStorage.removeItem(PORTAL_OAUTH_RETURN_KEY);
  sessionStorage.removeItem(PORTAL_OAUTH_RETURN_KEY);
  return path;
}

export function shouldCompletePortalOAuthRedirect(pathname: string): boolean {
  return Boolean(readPortalOAuthReturn())
    || pathname === "/"
    || pathname === "";
}

export function resolvePortalOAuthCompletionPath(
  pathname: string,
  returnPath: string | null,
  pendingEnrollment: boolean,
  defaultPath = PORTAL_HOME_PATH,
): string | null {
  if (!returnPath && pathname !== "/" && pathname !== "") return null;
  return pendingEnrollment ? PORTAL_ACTIVATE_PATH : returnPath ?? defaultPath;
}

export function completePortalOAuthRedirect(options: {
  pendingEnrollment?: boolean;
  defaultPath?: string;
} = {}): void {
  const returnPath = readPortalOAuthReturn();
  const target = resolvePortalOAuthCompletionPath(
    window.location.pathname,
    returnPath,
    options.pendingEnrollment === true,
    options.defaultPath,
  );
  if (!target) return;
  consumePortalOAuthReturn();
  if (window.location.pathname !== target) {
    window.location.replace(target);
  }
}
