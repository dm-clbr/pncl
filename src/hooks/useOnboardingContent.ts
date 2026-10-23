import { useCallback, useEffect, useState } from "react";
import { fetchOnboardingContent, type OnboardingContentContext, type OnboardingFlowContent } from "@/lib/onboarding-content";

export function useOnboardingContent({ accessToken, referralInviteId, portal, previewDesignation }: OnboardingContentContext) {
  const [result, setResult] = useState<{ key: string; content: OnboardingFlowContent | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = JSON.stringify([accessToken, referralInviteId, portal, previewDesignation, attempt]);
  useEffect(() => {
    let cancelled = false;
    if ((portal || previewDesignation) && !accessToken) return;
    fetchOnboardingContent({ accessToken, referralInviteId, portal, previewDesignation }).then((data) => {
      if (!cancelled) setResult({ key, content: data, error: null });
    }).catch((err) => {
      if (!cancelled) setResult({ key, content: null, error: err instanceof Error ? err.message : "Unable to load onboarding content." });
    });
    return () => { cancelled = true; };
  }, [accessToken, referralInviteId, portal, previewDesignation, key]);
  const content = result?.key === key ? result.content : null;
  const error = result?.key === key ? result.error : null;
  return { content, error, loading: !content && !error, retry };
}
