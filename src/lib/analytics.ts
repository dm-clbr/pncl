export function trackPageView(pageName: string) {
  console.log('[Analytics] Page view:', pageName);
}

export function trackFormSubmission(source: string, data: Record<string, string>) {
  console.log('[Analytics] Form submission:', source, data);
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  console.log('[Analytics] Event:', eventName, properties);
}
