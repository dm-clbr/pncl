import type { ReactNode } from "react";
import PortalDocumentLoginNotice from "@/components/portal/PortalDocumentLoginNotice";
import { Outlet } from "react-router-dom";
import { PortalOnboardingContext } from "@/contexts/PortalOnboardingContext";
import { usePortalOnboardingState } from "@/hooks/usePortalOnboardingState";

/** The protected tab routes share one onboarding lifetime. */
export default function PortalOnboardingProvider({ children }: { children?: ReactNode }) {
  const value = usePortalOnboardingState();
  return <PortalOnboardingContext.Provider value={value}>{children ?? <Outlet />}<PortalDocumentLoginNotice user={value.user} todos={value.todos} loading={value.loading} /></PortalOnboardingContext.Provider>;
}
