/**
 * Small pieces the bento dashboard's reveals share with the local harness.
 */
import { useEffect, useState } from "react";

/** Offsite when the href is absolute http(s) on another origin. Routes and
 *  same-origin absolute links are not. */
export function isOutbound(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** Menus and dialogs portal here rather than to body so the page's scoped
 *  styles (`.home2-page ...`) still reach them; body when there is no wrapper. */
export function portalRoot(): Element {
  return document.querySelector(".home2-page") ?? document.body;
}

const SLOW_AFTER_MS = 10_000;

/** UI only: true once `loading` has held for 10 s, so a reveal can say so
 *  instead of showing "Loading" forever. Resets as soon as loading ends. */
export function useSlowLoading(loading: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return slow;
}
