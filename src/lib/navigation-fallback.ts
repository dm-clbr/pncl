/**
 * Network-owned paths that must never be converted into the SPA shell by the
 * service worker. In particular, PDF links opened as top-level navigations
 * need to reach Vercel's static-file handler so the browser receives a PDF,
 * not index.html.
 */
export const NAVIGATION_FALLBACK_DENYLIST = [
  /^\/api\//,
  /^\/documents\//,
] as const;
