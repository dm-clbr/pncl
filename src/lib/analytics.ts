// Meta Pixel is initialized in index.html (fbq('init', ...)).
// These helpers forward events to the pixel when it's available.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Portal/admin pages are internal — don't report them to the ad pixel. */
function isInternalPath(pathname: string = window.location.pathname) {
  return pathname.startsWith("/portal");
}

function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

export function trackPageView(pageName: string) {
  console.log("[Analytics] Page view:", pageName);
}

/** Fired on every route change (see PixelRouteTracker in App.tsx). */
export function trackPixelPageView(pathname: string) {
  if (isInternalPath(pathname)) return;
  fbq("track", "PageView");
}

/**
 * Maps form sources to Meta Pixel standard events.
 * See https://www.facebook.com/business/help/402791146561655
 * Sources not listed here default to the "Lead" standard event.
 */
const STANDARD_EVENT_BY_SOURCE: Record<string, string> = {
  "contact-page": "Contact", // person initiates contact with the business
};

export function trackFormSubmission(source: string, data: Record<string, string>) {
  console.log("[Analytics] Form submission:", source, data);
  // Report to Meta as a standard event (no PII sent, just the form name).
  if (!isInternalPath()) {
    const standardEvent = STANDARD_EVENT_BY_SOURCE[source] ?? "Lead";
    fbq("track", standardEvent, { content_name: source });
  }
}

/** Fired when an agent onboarding application is successfully submitted. */
export function trackApplicationSubmitted(source: string) {
  console.log("[Analytics] Application submitted:", source);
  fbq("track", "SubmitApplication", { content_name: source });
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  console.log("[Analytics] Event:", eventName, properties);
  if (!isInternalPath()) {
    fbq("trackCustom", eventName, properties);
  }
}
