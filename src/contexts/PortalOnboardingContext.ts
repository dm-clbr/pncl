import { createContext, useContext } from "react";
import type { usePortalOnboardingState } from "@/hooks/usePortalOnboardingState";

export const PortalOnboardingContext = createContext<ReturnType<typeof usePortalOnboardingState> | null>(null);
export const usePortalOnboarding = () => useContext(PortalOnboardingContext);

export function useRequiredPortalOnboarding() {
  const value = usePortalOnboarding();
  if (!value) throw new Error("This portal tab requires PortalOnboardingProvider");
  return value;
}
