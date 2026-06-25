export const PORTAL_HOME_PATH = "/portal";
export const PORTAL_LOGIN_PATH = "/portal/login";
export const PORTAL_OAUTH_RETURN_KEY = "pncl_portal_oauth_return";

export function storePortalOAuthReturn(path: string): void {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  sessionStorage.setItem(PORTAL_OAUTH_RETURN_KEY, normalized);
}

export function readPortalOAuthReturn(): string | null {
  const path = sessionStorage.getItem(PORTAL_OAUTH_RETURN_KEY);
  return path?.startsWith("/") ? path : null;
}

export function consumePortalOAuthReturn(): string | null {
  const path = readPortalOAuthReturn();
  sessionStorage.removeItem(PORTAL_OAUTH_RETURN_KEY);
  return path;
}

export function shouldCompletePortalOAuthRedirect(pathname: string): boolean {
  return Boolean(readPortalOAuthReturn())
    || pathname === "/"
    || pathname === "";
}

export function completePortalOAuthRedirect(defaultPath = PORTAL_HOME_PATH): void {
  const target = consumePortalOAuthReturn() ?? defaultPath;
  if (window.location.pathname !== target) {
    window.location.replace(target);
  }
}
