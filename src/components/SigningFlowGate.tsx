import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingContent } from "@/hooks/useOnboardingContent";

/** Resolve the same server-controlled mode used by the signing endpoints. */
export default function SigningFlowGate({ children, legacy }: { children: ReactNode; legacy: ReactNode }) {
  const { session } = useAuth();
  const { content, error, retry } = useOnboardingContent({ accessToken: session?.access_token, portal: true });
  if (error) return <div role="alert">Unable to load signing settings. <button onClick={retry}>Retry</button></div>;
  if (!content) return <p role="status">Loading document…</p>;
  return content.signingEnabled === false ? legacy : children;
}
